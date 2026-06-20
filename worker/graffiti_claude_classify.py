#!/usr/bin/env python3
"""
graffiti_claude_classify.py — Step 2: Claude classifies YOLO detections

Reads yolo_detections.json, sends detected cube face images to Claude,
deduplicates findings, adds clean locations, calculates stats.

Usage:
    python graffiti_claude_classify.py ^
        --json    CityName\Output\yolo_detections.json ^
        --pano    CityName\Part1\360Photos CityName\Part2\360Photos ^
        --output  CityName\Output ^
        --city    "CityName"

    # Resume if interrupted:
    python graffiti_claude_classify.py ... --resume

Changes vs original:
    - FACE_MAX_WIDTH increased from 300 to 600px (small tags now visible)
    - System prompt replaced with proven prompt from graffiti_scan.py
    - Face-weighted deduplication (right/left trusted more than front/back)
    - Dedup fingerprint built from existing fields (no graffiti_id required)
    - Confidence filter removed (old prompt does not return confidence)
    - Model updated to claude-sonnet-4-6
    - GPS distance calculation fixed (uses actual track names from data)
    - Bilingual output: each finding gets description_fr + description_en
      (single call, no extra cost) so the viewer can toggle FR/EN instantly

Requirements:
    pip install anthropic Pillow tqdm
"""

import os, re, sys, json, base64, argparse, math, io, time, threading
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

# ─── CONFIG ──────────────────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL      = "claude-sonnet-4-6"
FACE_LABELS       = ["front", "right", "back", "left"]  # skip up/down
FACE_MAX_WIDTH    = 600   # increased from 300 — small tags now visible
PANO_MAX_WIDTH    = 1600
THUMB_MAX_WIDTH   = 640
MAX_RETRIES       = 4
RETRY_DELAY       = 10
DEDUP_RADIUS_M    = 10.0
DEDUP_SIM         = 0.90       # default similarity threshold
DEDUP_SIM_SIDE    = 0.85       # right/left faces — trusted more, lower bar to merge
DEDUP_SIM_FRONT   = 0.95       # front/back faces — less trusted, higher bar to merge
SIDE_FACES        = {"right", "left"}
FRONT_FACES       = {"front", "back"}

# ─── IMPORTS ─────────────────────────────────────────────────────────────────

try:
    import anthropic
except ImportError:
    sys.exit("Missing: pip install anthropic")

try:
    from PIL import Image
    from PIL.ExifTags import TAGS, GPSTAGS
except ImportError:
    sys.exit("Missing: pip install Pillow")

try:
    from tqdm import tqdm
    HAS_TQDM = True
except ImportError:
    HAS_TQDM = False

# ─── GPS ─────────────────────────────────────────────────────────────────────

def get_exif_data(image_path):
    try:
        img  = Image.open(image_path)
        exif = img._getexif()
        return {TAGS.get(k, k): v for k, v in exif.items()} if exif else {}
    except Exception:
        return {}

def dms_to_decimal(dms, ref):
    try:
        d, m, s = dms
        val = float(d) + float(m)/60 + float(s)/3600
        return -val if ref in ('S', 'W') else val
    except Exception:
        return None

def extract_gps(image_path):
    exif = get_exif_data(image_path)
    gps  = exif.get("GPSInfo", {})
    if not gps:
        return None
    g   = {GPSTAGS.get(k, k): v for k, v in gps.items()}
    lat = dms_to_decimal(g.get("GPSLatitude", []), g.get("GPSLatitudeRef", ""))
    lng = dms_to_decimal(g.get("GPSLongitude", []), g.get("GPSLongitudeRef", ""))
    return (lat, lng) if lat and lng else None

def find_pano(base_name, pano_dirs):
    for pano_dir in pano_dirs:
        for ext in [".jpg", ".jpeg", ".JPG", ".JPEG"]:
            p = Path(pano_dir) / f"{base_name}{ext}"
            if p.exists():
                return str(p)
    return None

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    p = math.pi / 180
    a = math.sin((lat2-lat1)*p/2)**2 + math.cos(lat1*p)*math.cos(lat2*p)*math.sin((lon2-lon1)*p/2)**2
    return 2 * R * math.asin(math.sqrt(max(0, a)))

# ─── IMAGE ───────────────────────────────────────────────────────────────────

def image_to_base64(path, max_width=THUMB_MAX_WIDTH, quality=80):
    try:
        img = Image.open(path).convert("RGB")
        if img.width > max_width:
            ratio = max_width / img.width
            img   = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None

# ─── CLAUDE PROMPT ───────────────────────────────────────────────────────────
# Proven prompt from graffiti_scan.py (Grenoble production)

CLASSIFY_SYSTEM = """Tu es un expert en détection de graffitis et de tags pour des missions d'inspection municipale.
On te soumet jusqu'à 6 images représentant les faces d'un panorama à 360° (avant, droite, arrière, gauche, dessus, dessous).
Tu dois identifier et décrire tous les graffitis, tags et dégradations visibles sur les murs, sols, et surfaces urbaines.

Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises Markdown.
Format attendu :
{
  "findings": [
    {
      "face": "right",
      "description": "description courte en français du graffiti",
      "description_en": "short English description of the graffiti",
      "graffiti_type": "tag",
      "colour_count": 1,
      "surface_type": "painted_wall",
      "is_offensive": false,
      "size_m2": 0.5
    }
  ]
}

Règles :
- "description": description courte en français
- "description_en": la même description en anglais. Conserve à l'identique tout texte/tag cité (ex. 'NEMAR' reste 'NEMAR')
- "graffiti_type": "tag" (signature simple), "throwup" (lettres en bulles, 2 couleurs), "piece" (art élaboré, 3+ couleurs)
- "colour_count": nombre de couleurs utilisées (entier)
- "surface_type": painted_wall, bare_wall, door, shutter, metal, glass, ground, concrete, wood, vehicle, other
- "size_m2": estimation de la surface couverte en m² (portes ≈ 2m², fenêtres ≈ 1.5m², trottoir ≈ 1.5m de large)
- "is_offensive": true si contenu haineux, sexuel explicite ou politique extrême
- Si aucun graffiti visible sur toutes les images : {"findings": []}
- Ne pas signaler les enseignes commerciales, signalétiques officielles, marquages routiers ou usure naturelle"""

# ─── CLASSIFY LOCATION ───────────────────────────────────────────────────────

def classify_location(faces, client):
    """Send all detected face images for one location in a single Claude call."""
    content = []

    for face_label in FACE_LABELS:
        yolo_boxes = faces.get(face_label, [])
        if not yolo_boxes:
            continue
        face_path = yolo_boxes[0].get("path") if yolo_boxes else None
        if not face_path or not Path(face_path).exists():
            continue

        img_b64 = image_to_base64(face_path, max_width=FACE_MAX_WIDTH, quality=82)
        if not img_b64:
            continue

        content.append({"type": "text", "text": f"Face: {face_label.upper()}"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}})

    if not content:
        return []

    content.append({
        "type": "text",
        "text": "Identifie et classifie tous les graffitis visibles sur ces images."
    })

    for attempt in range(MAX_RETRIES):
        try:
            response = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=2048,
                system=CLASSIFY_SYSTEM,
                messages=[{"role": "user", "content": content}]
            )
            raw = response.content[0].text.strip()
            if not raw:
                time.sleep(2)
                continue
            raw = re.sub(r'^```(?:json)?\s*', '', raw)
            raw = re.sub(r'\s*```$', '', raw)
            m   = re.search(r'\{.*\}', raw, re.DOTALL)
            if m:
                raw = m.group(0)
            findings = json.loads(raw).get("findings", [])
            for f in findings:
                if f.get("face"):
                    f["face"] = f["face"].lower()
                # normalize bilingual description fields
                fr = f.get("description", "")
                f["description_fr"] = fr
                if not f.get("description_en"):
                    f["description_en"] = fr  # fallback if model omitted EN
            return findings
        except json.JSONDecodeError:
            time.sleep(2)
        except Exception as e:
            err = str(e)
            if "rate_limit" in err.lower() or "529" in err or "overloaded" in err.lower():
                wait = RETRY_DELAY * (attempt + 1)
                print(f"  Rate limit — waiting {wait}s...")
                time.sleep(wait)
            else:
                if attempt >= MAX_RETRIES - 1:
                    return []
                time.sleep(RETRY_DELAY)
    return []

# ─── PROCESS LOCATION ────────────────────────────────────────────────────────

def process_location(loc_id, detection, pano_dirs, client, checkpoint_path, completed, lock):
    base_name = detection["base_name"]
    track     = detection.get("track", "")
    faces     = detection.get("faces", {})

    lat, lng  = 0.0, 0.0
    pano_path = find_pano(base_name, pano_dirs)
    if pano_path:
        try:
            lat, lng = extract_gps(pano_path) or (0.0, 0.0)
        except Exception:
            pass

    findings = classify_location(faces, client)

    for f in findings:
        face_label = f.get("face", "front")
        yolo_boxes = faces.get(face_label, [])
        face_path  = yolo_boxes[0].get("path") if yolo_boxes else None
        if face_path and Path(face_path).exists():
            f["face_path"] = face_path

    TYPE_W = {"tag": 1, "throwup": 2, "piece": 3}
    COL_M  = {1: 1.0, 2: 1.2, 3: 1.5}
    score  = sum(
        f.get("size_m2", 0) * TYPE_W.get(f.get("graffiti_type", "tag"), 1)
        * COL_M.get(min(f.get("colour_count", 1), 3), 1.0)
        for f in findings
    )
    is_off   = any(f.get("is_offensive", False) for f in findings)
    severity = "heavy" if (is_off or score >= 3) else ("minor" if score > 0 else "none")

    result = {
        "id":        loc_id,
        "base_name": base_name,
        "track":     track,
        "lat":       lat,
        "lng":       lng,
        "severity":  severity,
        "findings":  findings,
        "pano_path": pano_path,
    }

    with lock:
        completed[base_name] = result
        with open(checkpoint_path, "w", encoding="utf-8") as cf:
            json.dump(dict(completed), cf, ensure_ascii=False, default=str)

    print(f"  [{loc_id}] {base_name} — {len(findings)} graffiti(s) → {severity}")
    return result

# ─── DEDUPLICATION ───────────────────────────────────────────────────────────

def fingerprint_similarity(id1, id2):
    if not id1 or not id2:
        return 0.0
    if id1 == id2:
        return 1.0
    return SequenceMatcher(None, id1.lower(), id2.lower()).ratio()

def get_dedup_threshold(face1, face2):
    """Face-weighted similarity threshold.
    Side faces (right/left) are trusted more — lower threshold to merge.
    Front/back faces are less reliable — higher threshold required.
    """
    f1_side = face1 in SIDE_FACES
    f2_side = face2 in SIDE_FACES
    if f1_side and f2_side:
        return DEDUP_SIM_SIDE
    if not f1_side and not f2_side:
        return DEDUP_SIM_FRONT
    return DEDUP_SIM

def make_fingerprint(f):
    """Build dedup fingerprint from finding fields.
    Uses graffiti_id if present, otherwise builds from type+surface+colour+size.
    """
    gid = f.get("graffiti_id", "")
    if gid:
        return gid
    parts = [
        f.get("graffiti_type", ""),
        f.get("surface_type", ""),
        str(f.get("colour_count", "")),
        f.get("size_category", "")
    ]
    return "-".join(p for p in parts if p)

def findings_match(f1, f2):
    if f1.get("graffiti_type") != f2.get("graffiti_type"):
        return False
    cm1 = f1.get("colour_main", "")
    cm2 = f2.get("colour_main", "")
    if cm1 and cm2 and cm1 != cm2:
        if "multicolore" not in cm1 and "multicolore" not in cm2:
            return False
    if f1.get("surface_type") and f2.get("surface_type"):
        if f1["surface_type"] != f2["surface_type"]:
            return False
    if f1.get("size_category") and f2.get("size_category"):
        if f1["size_category"] != f2["size_category"]:
            return False
    threshold = get_dedup_threshold(f1.get("face", ""), f2.get("face", ""))
    return fingerprint_similarity(make_fingerprint(f1), make_fingerprint(f2)) >= threshold

def deduplicate(points):
    print(f"\n  Deduplicating findings (face-weighted)...")
    print(f"  Thresholds — side: {DEDUP_SIM_SIDE} | front/back: {DEDUP_SIM_FRONT} | mixed: {DEDUP_SIM}")
    all_findings = []
    for p in points:
        lat = p.get("lat", 0)
        lng = p.get("lng", 0)
        for f in p.get("findings", []):
            f["is_duplicate"] = False
            all_findings.append({"finding": f, "lat": lat, "lng": lng})

    before_total  = len(all_findings)
    duplicate_ids = set()
    dup_count     = 0

    for i, item in enumerate(all_findings):
        f   = item["finding"]
        fid = id(f)
        if fid in duplicate_ids:
            continue
        if f.get("graffiti_type") == "tag":
            continue  # tags too generic to dedup reliably
        for j, other in enumerate(all_findings):
            if j <= i:
                continue
            other_f  = other["finding"]
            other_id = id(other_f)
            if other_id in duplicate_ids:
                continue
            dist = haversine(item["lat"], item["lng"], other["lat"], other["lng"])
            if dist > DEDUP_RADIUS_M:
                continue
            if findings_match(f, other_f):
                other_f["is_duplicate"] = True
                duplicate_ids.add(other_id)
                dup_count += 1

    after_total = before_total - dup_count
    print(f"  Before: {before_total} | Duplicates removed: {dup_count} | After: {after_total}")
    return points

# ─── ADD CLEAN LOCATIONS ─────────────────────────────────────────────────────

def add_clean_locations(points, pano_dirs, tracks):
    print(f"\n  Adding clean locations...")
    existing  = {p.get("base_name", "") for p in points}
    max_id    = max((p.get("id", 0) for p in points), default=0)
    added     = 0

    for pi, pano_dir_str in enumerate(pano_dirs):
        pano_dir = Path(pano_dir_str)
        track    = tracks[pi] if tracks and pi < len(tracks) else pano_dir.parent.name
        photos   = sorted([f for f in pano_dir.iterdir() if f.is_file() and f.suffix.lower() in ('.jpg', '.jpeg')])

        for photo in photos:
            base_name = photo.stem
            if base_name in existing:
                continue
            gps = None
            try:
                gps = extract_gps(str(photo))
            except Exception:
                pass
            lat, lng = gps if gps else (0.0, 0.0)
            max_id += 1
            points.append({
                "id":        max_id,
                "base_name": base_name,
                "track":     track,
                "lat":       lat,
                "lng":       lng,
                "severity":  "none",
                "findings":  [],
                "pano_path": str(photo),
            })
            existing.add(base_name)
            added += 1

    print(f"  Added {added} clean locations. Total: {len(points)}")
    return points

# ─── CALCULATE STATS ─────────────────────────────────────────────────────────

def calculate_stats(points, city):
    points.sort(key=lambda x: (x.get("track", ""), x.get("base_name", "")))

    # Get unique tracks from data (fixes GPS distance = 0 bug)
    tracks = list({p.get("track", "") for p in points if p.get("track", "")})
    tracks.sort()

    dist = 0.0
    for track in tracks:
        pts = [p for p in points if p.get("track", "") == track and p.get("lat", 0) != 0]
        pts.sort(key=lambda x: x.get("base_name", ""))
        for i in range(1, len(pts)):
            d = haversine(pts[i-1]["lat"], pts[i-1]["lng"], pts[i]["lat"], pts[i]["lng"])
            if d < 500:
                dist += d

    seen    = {}
    for p in points:
        for f in p.get("findings", []):
            if f.get("is_duplicate"):
                continue
            key = str(p.get("id", "")) + "_" + (f.get("face") or "front")
            if key not in seen or (f.get("size_m2") or 0) > (seen[key].get("size_m2") or 0):
                seen[key] = f
    deduped = list(seen.values())

    lf = [f for f in deduped if (f.get("size_m2") or 0) > 2]
    mf = [f for f in deduped if 0.5 <= (f.get("size_m2") or 0) <= 2]
    sf = [f for f in deduped if (f.get("size_m2") or 0) < 0.5]

    heavy_locs = sum(1 for p in points if p.get("severity") == "heavy")
    minor_locs = sum(1 for p in points if p.get("severity") == "minor")
    clean_locs = sum(1 for p in points if p.get("severity") == "none")

    return {
        "city":            city,
        "date":            datetime.now().strftime("%B %d, %Y").replace(" 0", " "),
        "total_graffiti":  len(deduped),
        "total_area_m2":   round(sum(f.get("size_m2", 0) for f in deduped), 1),
        "pct_affected":    round((heavy_locs + minor_locs) / max(len(points), 1) * 100),
        "heavy_locations": heavy_locs,
        "minor_locations": minor_locs,
        "clean_locations": clean_locs,
        "heavy_count":     heavy_locs,
        "type_piece":      sum(1 for f in deduped if f.get("graffiti_type") == "piece"),
        "type_throwup":    sum(1 for f in deduped if f.get("graffiti_type") == "throwup"),
        "type_tag":        sum(1 for f in deduped if f.get("graffiti_type") in ("tag", None, "")),
        "size_large":      len(lf),
        "size_medium":     len(mf),
        "size_small":      len(sf),
        "area_large_m2":   round(sum(f.get("size_m2", 0) for f in lf), 1),
        "area_medium_m2":  round(sum(f.get("size_m2", 0) for f in mf), 1),
        "area_small_m2":   round(sum(f.get("size_m2", 0) for f in sf), 1),
        "distance_km":     round(dist / 1000, 1),
        "pipeline":        "yolo_v2",
    }

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Step 2: Claude classifies + dedup + clean + stats")
    parser.add_argument("--json",    required=True,            help="Path to yolo_detections.json")
    parser.add_argument("--pano",    required=True, nargs="+", help="360 photo folder(s)")
    parser.add_argument("--output",  default="./output",       help="Output folder")
    parser.add_argument("--city",    default="Unknown City")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--resume",  action="store_true")
    parser.add_argument("--limit",   type=int, default=None)
    args = parser.parse_args()

    if not ANTHROPIC_API_KEY:
        sys.exit("Error: set ANTHROPIC_API_KEY environment variable")

    json_path       = Path(args.json)
    output_dir      = Path(args.output)
    checkpoint_path = output_dir / "checkpoint_classify.json"
    json_out        = output_dir / "scan_report.json"
    output_dir.mkdir(parents=True, exist_ok=True)

    if not json_path.exists():
        sys.exit(f"Error: not found: {json_path}")

    print(f"\nRando360 — Claude Classifier + Pipeline")
    print(f"{'='*40}")
    print(f"Detections: {json_path}")
    print(f"Pano dirs:  {args.pano}")
    print(f"Output:     {output_dir}")
    print(f"City:       {args.city}")
    print(f"Workers:    {args.workers}")
    print(f"{'='*40}\n")

    client     = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    detections = json.load(open(json_path, encoding="utf-8"))

    completed = {}
    if args.resume and checkpoint_path.exists():
        completed = json.load(open(checkpoint_path, encoding="utf-8"))
        print(f"Resuming: {len(completed)} already done")

    items = [(k, v) for k, v in detections.items() if k not in completed]
    items.sort(key=lambda x: (x[1].get("track", ""), x[0]))

    if args.limit:
        items = items[:args.limit]
        print(f"Test mode: {args.limit} locations\n")

    print(f"Locations to classify: {len(items)}")
    print(f"Estimated cost: ~${len(items) * 0.006:.2f}\n")

    results = list(completed.values())
    lock    = threading.Lock()

    if HAS_TQDM:
        pbar = tqdm(total=len(items), unit="loc", desc="Classifying")

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(
                process_location,
                i+1, detection, args.pano, client, checkpoint_path, completed, lock
            ): base_name
            for i, (base_name, detection) in enumerate(items)
        }
        for fut in as_completed(futures):
            try:
                result = fut.result()
                if result:
                    with lock:
                        results.append(result)
            except Exception as e:
                print(f"  Error: {e}")
            if HAS_TQDM:
                pbar.update(1)

    if HAS_TQDM:
        pbar.close()

    print(f"\nClassification complete: {len(results)} locations")

    results = deduplicate(results)
    results = add_clean_locations(results, args.pano, None)

    print(f"\n  Calculating stats and distance...")
    meta = calculate_stats(results, args.city)

    out = {"meta": meta, "points": results}
    out_clean = json.loads(json.dumps(out, default=str))
    for p in out_clean.get("points", []):
        p.pop("pano_b64", None)
        for f in p.get("findings", []):
            f.pop("face_b64", None)

    with open(json_out, "w", encoding="utf-8") as jf:
        json.dump(out_clean, jf, indent=2, ensure_ascii=False)

    print(f"\n{'='*40}")
    print(f"PIPELINE COMPLETE — {args.city}")
    print(f"{'='*40}")
    print(f"Total locations:  {len(results)}")
    print(f"Graffiti found:   {meta['total_graffiti']}")
    print(f"Total area:       {meta['total_area_m2']}m2")
    print(f"Route affected:   {meta['pct_affected']}%")
    print(f"Distance:         {meta['distance_km']} km")
    print(f"Saved:            {json_out}")
    print(f"\nNext: python graffiti_report.py --json {json_out} --s3-bucket rando360 --s3-prefix {args.city}")
    print(f"{'='*40}\n")


if __name__ == "__main__":
    main()
