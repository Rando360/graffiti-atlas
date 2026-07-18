"""
Community upload endpoints for GraffitiAtlas (Phase 4 + auto-moderation).

- POST /uploads/graffiti  → submit a new graffiti (photo + location)
- POST /uploads/removal   → report an existing graffiti as removed

Community photos are automatically screened with AWS Rekognition:
  1. Explicit content (nudity / violence / gore) → auto-rejected at high confidence.
  2. Faces → blurred in memory BEFORE any version is stored (Option 1: the
     unblurred original is never written to disk).
Licence plates are handled by the manual blur tool during moderation, because
generic text detection would also blur the graffiti lettering itself.

Rekognition runs in eu-west-1 (Ireland) since it isn't offered in eu-west-3
(Paris); images are analysed transiently and not retained. S3 storage stays
in Paris. Both regions are in the EU.
"""

import os
import io
import uuid
from datetime import date

import boto3
from PIL import Image, ImageFilter
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from supabase import create_client

from routers.auth_dependency import get_current_user

router = APIRouter()

# ── Config ──
MEDIA_BUCKET = "graffitiatlas-media"
CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"

SIZES = {"thumb": 400, "medium": 1200, "full": 2400}
MAX_UPLOAD_MB = 15
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic"}

# Rekognition
REK_REGION = os.environ.get("AWS_REKOGNITION_REGION", "eu-west-1")
REK_DETECT_MAX_EDGE = 1500          # downscale sent to Rekognition (stays < 5 MB limit)
REJECT_MIN_CONFIDENCE = 90.0        # only auto-reject when very sure
REJECT_CATEGORIES = ("explicit", "violence", "visually disturbing", "gore")
FACE_PAD = 0.25                     # expand face boxes so the whole head is covered


def _s3():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("AWS_REGION", "eu-west-3"),
    )


def _rekognition():
    return boto3.client(
        "rekognition",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=REK_REGION,
    )


def _service():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _open_strip_exif(raw_bytes: bytes) -> Image.Image:
    """Open image, convert to RGB (drops alpha + all EXIF metadata)."""
    try:
        return Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier image invalide")


def _downscaled_jpeg(img: Image.Image, max_edge: int) -> bytes:
    small = img.copy()
    small.thumbnail((max_edge, max_edge), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _screen_with_rekognition(img: Image.Image) -> dict:
    """
    Returns {'explicit': bool, 'faces': [normalised boxes], 'available': bool}.
    Faces are only used when available; if Rekognition can't be reached the
    upload still proceeds (manual moderation + manual blur are the backup).
    """
    out = {"explicit": False, "faces": [], "available": True}
    try:
        rek = _rekognition()
        detect_bytes = _downscaled_jpeg(img, REK_DETECT_MAX_EDGE)

        # 1. Content moderation
        mod = rek.detect_moderation_labels(Image={"Bytes": detect_bytes}, MinConfidence=80)
        for label in mod.get("ModerationLabels", []):
            category = (label.get("ParentName") or label.get("Name") or "").lower()
            conf = label.get("Confidence", 0)
            if conf >= REJECT_MIN_CONFIDENCE and any(k in category for k in REJECT_CATEGORIES):
                out["explicit"] = True
                break

        # 2. Faces (skip if we're going to reject anyway)
        if not out["explicit"]:
            faces = rek.detect_faces(Image={"Bytes": detect_bytes}, Attributes=["DEFAULT"])
            out["faces"] = [f["BoundingBox"] for f in faces.get("FaceDetails", [])]
    except Exception:
        out["available"] = False
    return out


def _blur_faces(img: Image.Image, boxes: list) -> Image.Image:
    """Blur each normalised face box (with padding) on the full-size image."""
    if not boxes:
        return img
    W, H = img.size
    for b in boxes:
        left = int((b["Left"] - b["Width"] * FACE_PAD) * W)
        top = int((b["Top"] - b["Height"] * FACE_PAD) * H)
        right = int((b["Left"] + b["Width"] * (1 + FACE_PAD)) * W)
        bottom = int((b["Top"] + b["Height"] * (1 + FACE_PAD)) * H)
        left, top = max(0, left), max(0, top)
        right, bottom = min(W, right), min(H, bottom)
        if right <= left or bottom <= top:
            continue
        region = img.crop((left, top, right, bottom))
        radius = max(15, (right - left) // 5)
        region = region.filter(ImageFilter.GaussianBlur(radius=radius))
        img.paste(region, (left, top))
    return img


def _upload_sizes(img: Image.Image, key_prefix: str) -> dict:
    """Generate thumb/medium/full JPEGs from an (already blurred) image and upload."""
    s3 = _s3()
    keys = {}
    orig_w, orig_h = img.size
    for name, max_edge in SIZES.items():
        resized = img.copy()
        resized.thumbnail((max_edge, max_edge), Image.LANCZOS)
        buf = io.BytesIO()
        resized.save(buf, format="JPEG", quality=85, optimize=True)
        buf.seek(0)
        key = f"{key_prefix}/{name}.jpg"
        s3.upload_fileobj(
            buf, MEDIA_BUCKET, key,
            ExtraArgs={"ContentType": "image/jpeg", "CacheControl": "public, max-age=31536000"},
        )
        keys[name] = key
    return {"keys": keys, "width": orig_w, "height": orig_h}


def _reverse_geocode_city(lat: float, lng: float):
    import urllib.request, json
    try:
        url = (f"https://nominatim.openstreetmap.org/reverse?"
               f"lat={lat}&lon={lng}&format=json&accept-language=fr&zoom=10")
        req = urllib.request.Request(url, headers={"User-Agent": "GraffitiAtlas/1.0"})
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read())
        a = data.get("address", {})
        return a.get("city") or a.get("town") or a.get("village") or a.get("municipality")
    except Exception:
        return None


@router.post("/graffiti")
async def upload_graffiti(
    photo: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    style: str = Form(None),
    note: str = Form(None),
    user: dict = Depends(get_current_user),
):
    """A logged-in user submits a new graffiti sighting (community source)."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordonnées invalides")
    if photo.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Format non supporté (JPEG, PNG ou WebP)")

    raw = await photo.read()
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image trop lourde (max {MAX_UPLOAD_MB} Mo)")

    # Open + strip EXIF, then auto-screen (community uploads only — this endpoint)
    img = _open_strip_exif(raw)
    screen = _screen_with_rekognition(img)

    # Auto-reject explicit content at high confidence — nothing is stored.
    if screen["explicit"]:
        raise HTTPException(status_code=422, detail="content_rejected")

    # Blur faces in memory BEFORE generating any size (original never stored).
    img = _blur_faces(img, screen["faces"])

    graffiti_id = str(uuid.uuid4())
    key_prefix = f"community/{graffiti_id}"
    result = _upload_sizes(img, key_prefix)

    city = _reverse_geocode_city(lat, lng)
    service = _service()

    service.table("graffiti").insert({
        "id": graffiti_id,
        "user_id": user["id"],
        "location": f"POINT({lng} {lat})",
        "city": city,
        "date_observed": date.today().isoformat(),
        "source": "community",
        "status": "pending_review",
    }).execute()

    service.table("images").insert({
        "graffiti_id": graffiti_id,
        "s3_key_thumb": result["keys"]["thumb"],
        "s3_key_medium": result["keys"]["medium"],
        "s3_key_full": result["keys"]["full"],
        "width": result["width"],
        "height": result["height"],
        "mime_type": "image/jpeg",
        "source": "community",
        "is_360": False,
    }).execute()

    if style or note:
        service.table("classifications").insert({
            "graffiti_id": graffiti_id,
            "style": style,
            "description_fr": note,
            "model_version": "user_submission",
        }).execute()

    return {
        "id": graffiti_id,
        "status": "pending_review",
        "auto_blur": screen["available"],
        "faces_blurred": len(screen["faces"]),
        "message": "Merci ! Votre contribution sera vérifiée avant publication.",
        "thumb_url": f"{CLOUDFRONT}/{result['keys']['thumb']}",
    }


@router.post("/removal")
async def report_removal(
    graffiti_id: str = Form(...),
    photo: UploadFile = File(None),
    note: str = Form(None),
    user: dict = Depends(get_current_user),
):
    """Report that an existing graffiti has been removed/erased. Photo optional."""
    service = _service()

    exists = service.table("graffiti").select("id").eq("id", graffiti_id).execute()
    if not exists.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    s3_key_photo = None
    if photo is not None:
        if photo.content_type not in ALLOWED_MIME:
            raise HTTPException(status_code=400, detail="Format non supporté")
        raw = await photo.read()
        if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"Image trop lourde (max {MAX_UPLOAD_MB} Mo)")
        img = _open_strip_exif(raw)
        # Screen removal photos too: reject explicit, blur faces.
        screen = _screen_with_rekognition(img)
        if screen["explicit"]:
            raise HTTPException(status_code=422, detail="content_rejected")
        img = _blur_faces(img, screen["faces"])
        report_id = str(uuid.uuid4())
        result = _upload_sizes(img, f"removals/{report_id}")
        s3_key_photo = result["keys"]["medium"]

    service.table("reports").insert({
        "graffiti_id": graffiti_id,
        "reporter_id": user["id"],
        "report_type": "removal",
        "reason": "removed",
        "note": note,
        "s3_key_photo": s3_key_photo,
        "status": "pending",
    }).execute()

    return {"status": "pending", "message": "Merci ! Votre signalement sera vérifié."}