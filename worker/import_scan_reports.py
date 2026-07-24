"""
import_scan_reports.py
-----------------------
Imports Lyon and Grenoble graffiti detections from scan_report.json
into Supabase (graffiti, classifications, images tables).

Skips duplicate findings. Safe to re-run — checks for existing records
before inserting to avoid duplicates.

USAGE:
    cd ~/Desktop/graffiti-atlas
    doppler run -- python worker/import_scan_reports.py

REQUIREMENTS:
    pip install supabase boto3 python-dotenv
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path
from supabase import create_client, Client

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------

CLOUDFRONT_URL = "https://d36hw3x1088tvv.cloudfront.net"

# Federated Panoramax API — resolves sequences across instances.
PANORAMAX_API = "https://api.panoramax.xyz"

# Map raw Panoramax license codes to a human-readable label.
LICENSE_LABELS = {
    "etalab-2.0": "Licence Ouverte / Etalab 2.0",
    "CC-BY-SA 4.0": "CC-BY-SA 4.0",
    "CC-BY-SA-4.0": "CC-BY-SA 4.0",
    "CC-BY-4.0": "CC-BY 4.0",
    "proprietary": "Propriétaire",
}

# Cache of sequence_id -> {"author": str, "license": str} so we hit the
# Panoramax API only once per sequence during an import run.
_ATTRIBUTION_CACHE = {}


def fetch_panoramax_attribution(sequence_id: str) -> dict:
    """
    Look up a Panoramax sequence's author and license via the STAC API.

    Returns {"author": str|None, "license": str|None, "license_label": str|None}.
    Fails soft: on any network/parse error, returns Nones so the import
    still proceeds (attribution can be backfilled later).
    """
    if not sequence_id:
        return {"author": None, "license": None, "license_label": None}
    if sequence_id in _ATTRIBUTION_CACHE:
        return _ATTRIBUTION_CACHE[sequence_id]

    url = f"{PANORAMAX_API}/api/collections/{sequence_id}"
    result = {"author": None, "license": None, "license_label": None}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "GraffitiAtlas-import"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        lic = data.get("license")
        # Author: prefer a provider with role "producer", else "licensor", else first.
        providers = data.get("providers", []) or []
        author = None
        for role in ("producer", "licensor"):
            for p in providers:
                if role in (p.get("roles") or []):
                    author = p.get("name")
                    break
            if author:
                break
        if not author and providers:
            author = providers[0].get("name")
        result = {
            "author": author,
            "license": lic,
            "license_label": LICENSE_LABELS.get(lic, lic),
        }
    except (urllib.error.URLError, ValueError, KeyError, TimeoutError) as e:
        print(f"  ! attribution lookup failed for {sequence_id}: {e}")

    _ATTRIBUTION_CACHE[sequence_id] = result
    return result

# Scan reports to import — add more cities here as you grow
CITIES = [
    {
        "city": "lyon",
        "report_path": "worker/data/lyon_scan_report.json",
        "source": "panoramax",
        "track_to_sequence": {
            "Part1": "cd07c728-9476-45ed-b4a8-e4dab284fde1",
            "Part2": "8fe41df6-d56b-42ea-a755-45d45681f069",
        },
        # S3 media path template for cube faces
        # {sequence} and {filename} will be replaced
        "media_path": "lyon/cubefaces/panoramax/{sequence}/{filename}",
    },
    {
        "city": "grenoble",
        "report_path": "worker/data/grenoble_scan_report.json",
        "source": "rando360_capture",
        "track_to_sequence": {
            "Video1": None,  # no sequence UUID for own capture
            "Video2": None,
        },
        # For Grenoble, track maps to subfolder name
        "media_path": "grenoble/cubefaces/rando360_capture/{track}/{filename}",
    },
]

# ----------------------------------------------------------------------
# HELPERS
# ----------------------------------------------------------------------

def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set.")
        print("Run with: doppler run -- python worker/import_scan_reports.py")
        sys.exit(1)
    return create_client(url, key)


def extract_filename(face_path: str) -> str:
    """Extract just the filename from a Windows or Unix path."""
    return Path(face_path.replace("\\", "/")).name


def build_image_url(city_config: dict, track: str, filename: str) -> str:
    """Build the CloudFront URL for a cube face image."""
    sequence = city_config["track_to_sequence"].get(track)
    path = city_config["media_path"].format(
        sequence=sequence or "",
        track=track.lower(),
        filename=filename,
    )
    # Clean up any double slashes
    path = path.replace("//", "/")
    return f"{CLOUDFRONT_URL}/{path}"


def already_imported(supabase: Client, city: str, base_name: str) -> bool:
    """Check if this position was already imported (by checking graffiti table)."""
    result = supabase.table("graffiti") \
        .select("id") \
        .eq("city", city) \
        .eq("address", base_name) \
        .limit(1) \
        .execute()
    return len(result.data) > 0


# ----------------------------------------------------------------------
# IMPORT
# ----------------------------------------------------------------------

def import_city(supabase: Client, config: dict):
    city = config["city"]
    report_path = config["report_path"]

    print(f"\n{'='*60}")
    print(f"Importing {city.upper()}")
    print(f"{'='*60}")

    if not Path(report_path).exists():
        print(f"ERROR: Report not found at {report_path}")
        print(f"Place the {city} scan_report.json at that path and retry.")
        return

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    points = data.get("points", [])
    with_findings = [p for p in points if p.get("findings")]

    print(f"Total positions:        {len(points)}")
    print(f"Positions with graffiti:{len(with_findings)}")

    inserted_graffiti = 0
    inserted_images = 0
    inserted_classifications = 0
    skipped_duplicates = 0
    skipped_existing = 0
    errors = []

    for point in with_findings:
        base_name = point["base_name"]
        track = point.get("track", "")
        lat = point["lat"]
        lng = point["lng"]

        # Filter to non-duplicate findings only
        real_findings = [f for f in point["findings"] if not f.get("is_duplicate")]
        if not real_findings:
            skipped_duplicates += len(point["findings"])
            continue

        # Skip if already imported
        if already_imported(supabase, city, base_name):
            skipped_existing += 1
            continue

        try:
            # ── INSERT GRAFFITI RECORD ──────────────────────────────
            graffiti_row = {
                "city": city,
                "address": base_name,           # using base_name as address reference
                "location": f"POINT({lng} {lat})",
                "date_observed": None,           # not in report — can backfill later
                "source": "rando360",
                "status": "approved",            # Rando360 data is pre-approved
            }

            graffiti_result = supabase.table("graffiti") \
                .insert(graffiti_row) \
                .execute()

            graffiti_id = graffiti_result.data[0]["id"]
            inserted_graffiti += 1

            # ── INSERT FINDINGS (images + classifications) ──────────
            for finding in real_findings:
                face_path = finding.get("face_path", "")
                filename = extract_filename(face_path)
                image_url = build_image_url(config, track, filename)

                sequence_id = config["track_to_sequence"].get(track)

                # Attribution: for Panoramax sources, look up the sequence's
                # author + license so we can credit them per image.
                attribution = {"author": None, "license": None, "license_label": None}
                if config["source"] == "panoramax" and sequence_id:
                    attribution = fetch_panoramax_attribution(sequence_id)

                # Image record
                image_row = {
                    "graffiti_id": graffiti_id,
                    "s3_key_full": f"{city}/cubefaces/{config['source']}/{track.lower()}/{filename}",
                    "source": config["source"],
                    "source_photo_id": base_name,
                    "source_sequence_id": sequence_id,
                    "author": attribution["author"],
                    "license": attribution["license"],
                    "license_label": attribution["license_label"],
                    "is_360": False,
                    "mime_type": "image/jpeg",
                }

                image_result = supabase.table("images") \
                    .insert(image_row) \
                    .execute()

                inserted_images += 1

                # Classification record
                classification_row = {
                    "graffiti_id": graffiti_id,
                    "style": finding.get("graffiti_type"),
                    "size_m2": finding.get("size_m2"),
                    "surface_type": finding.get("surface_type"),
                    "description_fr": finding.get("description"),
                    "description_en": None,        # backfill later
                    "model_version": "claude-sonnet-4-6",
                    "confidence": None,
                }

                supabase.table("classifications") \
                    .insert(classification_row) \
                    .execute()

                inserted_classifications += 1

        except Exception as e:
            errors.append(f"{base_name}: {str(e)}")
            continue

    # ── SUMMARY ────────────────────────────────────────────────────────
    print(f"\nRESULTS for {city.upper()}:")
    print(f"  Graffiti records inserted:      {inserted_graffiti}")
    print(f"  Image records inserted:         {inserted_images}")
    print(f"  Classification records inserted:{inserted_classifications}")
    print(f"  Skipped (duplicates):           {skipped_duplicates}")
    print(f"  Skipped (already in DB):        {skipped_existing}")
    print(f"  Errors:                         {len(errors)}")

    if errors:
        print(f"\nFirst 10 errors:")
        for e in errors[:10]:
            print(f"  {e}")


def main():
    supabase = get_supabase()
    print("Connected to Supabase.")

    for city_config in CITIES:
        import_city(supabase, city_config)

    print(f"\n{'='*60}")
    print("IMPORT COMPLETE")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
