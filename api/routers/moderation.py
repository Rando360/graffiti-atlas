"""
Moderation endpoints for GraffitiAtlas (Phase 4).

All routes require an admin/moderator (enforced by require_admin).

- GET  /moderation/pending          → list graffiti awaiting review
- GET  /moderation/removals         → list removal reports awaiting review
- POST /moderation/graffiti/{id}/approve
- POST /moderation/graffiti/{id}/reject
- POST /moderation/removal/{report_id}/approve   (marks the graffiti as removed)
- POST /moderation/removal/{report_id}/reject
"""

import os
import io
from datetime import datetime, date

import boto3
from PIL import Image, ImageFilter
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client

from routers.auth_dependency import require_admin

MEDIA_BUCKET = "graffitiatlas-media"
SIZES = {"thumb": 400, "medium": 1200, "full": 2400}


def _s3():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("AWS_REGION", "eu-west-3"),
    )


class ApproveBody(BaseModel):
    style: str | None = None


class BlurRect(BaseModel):
    x: float   # all normalised 0..1 relative to image size
    y: float
    w: float
    h: float


class BlurBody(BaseModel):
    rects: list[BlurRect]

router = APIRouter()

CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"


def _service():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _delete_image_files(service, graffiti_id: str):
    """Best-effort delete of a graffiti's S3 image files (used on reject)."""
    imgs = service.table("images").select(
        "s3_key_thumb, s3_key_medium, s3_key_full, s3_key_raw"
    ).eq("graffiti_id", graffiti_id).execute()
    keys = []
    for img in imgs.data or []:
        for k in ("s3_key_thumb", "s3_key_medium", "s3_key_full", "s3_key_raw"):
            if img.get(k):
                keys.append(img[k])
    if not keys:
        return
    try:
        _s3().delete_objects(
            Bucket=MEDIA_BUCKET,
            Delete={"Objects": [{"Key": k} for k in keys]},
        )
    except Exception:
        pass


@router.get("/pending")
def list_pending(user: dict = Depends(require_admin)):
    """Graffiti submissions awaiting review, newest first."""
    service = _service()
    rows = service.rpc("get_pending_graffiti", {}).execute()
    pending = rows.data or []
    # Comparison data: approved graffiti within 10 m of each pending upload.
    for p in pending:
        lat, lng = p.get("lat"), p.get("lng")
        if lat is None or lng is None:
            p["nearby"] = []
            continue
        try:
            nb = service.rpc("get_nearby_graffiti",
                             {"p_lat": lat, "p_lng": lng, "p_radius_m": 10}).execute()
            p["nearby"] = nb.data or []
        except Exception:
            p["nearby"] = []
    return {"pending": pending}


@router.get("/removals")
def list_removals(user: dict = Depends(require_admin)):
    """Removal reports awaiting review."""
    service = _service()
    reports = service.table("reports") \
        .select("id, graffiti_id, reporter_id, note, s3_key_photo, created_at") \
        .eq("report_type", "removal") \
        .eq("status", "pending") \
        .order("created_at", desc=True) \
        .execute()

    out = []
    for r in reports.data or []:
        out.append({
            **r,
            "photo_url": f"{CLOUDFRONT}/{r['s3_key_photo']}" if r.get("s3_key_photo") else None,
        })
    return {"removals": out}


@router.post("/graffiti/{graffiti_id}/approve")
def approve_graffiti(graffiti_id: str, body: ApproveBody = None, user: dict = Depends(require_admin)):
    service = _service()
    res = service.table("graffiti").update({
        "status": "approved",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    # Moderator can set/correct the type at approval time.
    if body and body.style:
        existing = service.table("classifications").select("id").eq("graffiti_id", graffiti_id).execute()
        if existing.data:
            service.table("classifications").update({"style": body.style}) \
                .eq("graffiti_id", graffiti_id).execute()
        else:
            service.table("classifications").insert({
                "graffiti_id": graffiti_id,
                "style": body.style,
                "model_version": "moderator",
            }).execute()

    return {"status": "approved", "id": graffiti_id, "style": body.style if body else None}


class TargetBody(BaseModel):
    target_id: str
    style: str | None = None


@router.post("/graffiti/{graffiti_id}/attach-photo")
def attach_photo(graffiti_id: str, body: TargetBody, user: dict = Depends(require_admin)):
    """Same graffiti, another photo: move this upload's image(s) onto the
    existing graffiti, then remove the pending row. Both photos are kept."""
    service = _service()
    target = service.table("graffiti").select("id").eq("id", body.target_id).execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Cible introuvable")
    service.table("images").update({"graffiti_id": body.target_id}) \
        .eq("graffiti_id", graffiti_id).execute()
    service.table("classifications").delete().eq("graffiti_id", graffiti_id).execute()
    service.table("graffiti").delete().eq("id", graffiti_id).execute()
    return {"status": "attached", "target": body.target_id}


@router.post("/graffiti/{graffiti_id}/approve-at-location")
def approve_at_location(graffiti_id: str, body: TargetBody, user: dict = Depends(require_admin)):
    """New graffiti at a known spot: approve it and join the target's location,
    growing that location's timeline. If the previous graffiti there was
    cleaned, the location flips back to active (latest wins)."""
    service = _service()
    target = service.table("graffiti").select("location_id").eq("id", body.target_id).execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Cible introuvable")
    loc = target.data[0]["location_id"] or body.target_id
    service.table("graffiti").update({
        "location_id": loc,
        "status": "approved",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()
    if body.style:
        existing = service.table("classifications").select("id").eq("graffiti_id", graffiti_id).execute()
        if existing.data:
            service.table("classifications").update({"style": body.style}).eq("graffiti_id", graffiti_id).execute()
        else:
            service.table("classifications").insert({
                "graffiti_id": graffiti_id, "style": body.style,
                "model_version": "moderator",
            }).execute()
    return {"status": "approved", "location_id": loc}


@router.post("/graffiti/{graffiti_id}/reject")
def reject_graffiti(graffiti_id: str, user: dict = Depends(require_admin)):
    service = _service()

    exists = service.table("graffiti").select("id").eq("id", graffiti_id).execute()
    if not exists.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    # A rejected community upload is removed entirely, including its S3 files,
    # so nothing unapproved lingers in storage.
    _delete_image_files(service, graffiti_id)
    service.table("classifications").delete().eq("graffiti_id", graffiti_id).execute()
    service.table("images").delete().eq("graffiti_id", graffiti_id).execute()
    service.table("graffiti").delete().eq("id", graffiti_id).execute()

    return {"status": "rejected", "id": graffiti_id}


@router.post("/removal/{report_id}/approve")
def approve_removal(report_id: str, user: dict = Depends(require_admin)):
    """Confirm a removal: mark the graffiti as removed and close the report."""
    service = _service()

    report = service.table("reports").select("graffiti_id").eq("id", report_id).execute()
    if not report.data:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    graffiti_id = report.data[0]["graffiti_id"]

    # Mark the graffiti as removed (record kept — historical value)
    service.table("graffiti").update({
        "removed_at": date.today().isoformat(),
        "removal_verified": True,
        "removal_report_id": report_id,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()

    # Close the report
    service.table("reports").update({
        "status": "approved",
        "reviewed_at": datetime.utcnow().isoformat(),
        "reviewed_by": user["id"],
    }).eq("id", report_id).execute()

    return {"status": "approved", "graffiti_id": graffiti_id}


@router.post("/removal/{report_id}/reject")
def reject_removal(report_id: str, user: dict = Depends(require_admin)):
    service = _service()
    res = service.table("reports").update({
        "status": "rejected",
        "reviewed_at": datetime.utcnow().isoformat(),
        "reviewed_by": user["id"],
    }).eq("id", report_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    return {"status": "rejected", "id": report_id}


@router.post("/graffiti/{graffiti_id}/blur")
def blur_graffiti(graffiti_id: str, body: BlurBody, user: dict = Depends(require_admin)):
    """
    Apply blur rectangles (faces, plates…) to a community photo.
    Downloads the full image, blurs the requested regions, regenerates all
    sizes and re-uploads. Coordinates are normalised (0..1).
    """
    if not body.rects:
        raise HTTPException(status_code=400, detail="Aucune zone à flouter")

    service = _service()
    row = service.table("images").select("s3_key_full").eq("graffiti_id", graffiti_id).execute()
    if not row.data or not row.data[0].get("s3_key_full"):
        raise HTTPException(status_code=404, detail="Image introuvable")

    full_key = row.data[0]["s3_key_full"]
    prefix = full_key.rsplit("/", 1)[0]   # e.g. community/<id>

    s3 = _s3()
    buf = io.BytesIO()
    try:
        s3.download_fileobj(MEDIA_BUCKET, full_key, buf)
    except Exception:
        raise HTTPException(status_code=404, detail="Fichier image introuvable")
    buf.seek(0)

    img = Image.open(buf).convert("RGB")
    W, H = img.size

    for r in body.rects:
        left = max(0, int(r.x * W))
        top = max(0, int(r.y * H))
        right = min(W, int((r.x + r.w) * W))
        bottom = min(H, int((r.y + r.h) * H))
        if right <= left or bottom <= top:
            continue
        region = img.crop((left, top, right, bottom))
        radius = max(12, (right - left) // 6)
        region = region.filter(ImageFilter.GaussianBlur(radius=radius))
        img.paste(region, (left, top))

    # Regenerate every size from the blurred image and overwrite in S3
    for name, edge in SIZES.items():
        resized = img.copy()
        resized.thumbnail((edge, edge), Image.LANCZOS)
        out = io.BytesIO()
        resized.save(out, format="JPEG", quality=85, optimize=True)
        out.seek(0)
        s3.upload_fileobj(
            out, MEDIA_BUCKET, f"{prefix}/{name}.jpg",
            ExtraArgs={"ContentType": "image/jpeg", "CacheControl": "public, max-age=31536000"},
        )

    return {"status": "blurred", "count": len(body.rects)}