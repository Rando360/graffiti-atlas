"""
Community upload endpoints for GraffitiAtlas (Phase 4).

- POST /uploads/graffiti  → submit a new graffiti (photo + location)
- POST /uploads/removal   → report an existing graffiti as removed (photo optional)

Both create records with status 'pending_review' and never appear on the
public map until a moderator approves them.
"""

import os
import io
import uuid
from datetime import date

import boto3
from PIL import Image
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from supabase import create_client

from routers.auth_dependency import get_current_user

router = APIRouter()

# ── Config ──
MEDIA_BUCKET = "graffitiatlas-media"
CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"

# Output sizes (longest edge, px). Full is capped to keep storage sane.
SIZES = {"thumb": 400, "medium": 1200, "full": 2400}
MAX_UPLOAD_MB = 15
ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic"}


def _s3():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("AWS_REGION", "eu-west-3"),
    )


def _service():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _process_and_upload(raw_bytes: bytes, key_prefix: str) -> dict:
    """
    Strips EXIF (privacy), produces thumb/medium/full JPEGs, uploads to S3.
    Returns the S3 keys and the original dimensions.
    """
    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img = img.convert("RGB")  # drops alpha + all EXIF metadata
    except Exception:
        raise HTTPException(status_code=400, detail="Fichier image invalide")

    orig_w, orig_h = img.size
    s3 = _s3()
    keys = {}

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


def _reverse_geocode_city(lat: float, lng: float) -> str | None:
    """Best-effort city name from coordinates (never blocks the upload)."""
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
    """A logged-in user submits a new graffiti sighting."""
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise HTTPException(status_code=400, detail="Coordonnées invalides")

    if photo.content_type not in ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Format non supporté (JPEG, PNG ou WebP)")

    raw = await photo.read()
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Image trop lourde (max {MAX_UPLOAD_MB} Mo)")

    graffiti_id = str(uuid.uuid4())
    key_prefix = f"community/{graffiti_id}"
    result = _process_and_upload(raw, key_prefix)

    city = _reverse_geocode_city(lat, lng)
    service = _service()

    # graffiti row — pending until a moderator approves
    service.table("graffiti").insert({
        "id": graffiti_id,
        "user_id": user["id"],
        "location": f"POINT({lng} {lat})",
        "city": city,
        "date_observed": date.today().isoformat(),
        "source": "community",
        "status": "pending_review",
    }).execute()

    # image row
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

    # optional classification (user's own guess at the style)
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
        report_id = str(uuid.uuid4())
        result = _process_and_upload(raw, f"removals/{report_id}")
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

    return {
        "status": "pending",
        "message": "Merci ! Votre signalement sera vérifié.",
    }
