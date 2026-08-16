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


class PhotoClass(BaseModel):
    image_id: str
    style: str | None = None            # kept for back-compat; ignored if `styles` given
    styles: list[str] | None = None     # all types present in the photo
    density: str | None = None          # 'light' | 'medium' | 'heavy'
    surface_type: str | None = None     # back-compat; ignored if `surfaces` given
    surfaces: list[str] | None = None   # all surfaces present in the photo
    size_m2: float | None = None


class ApproveBody(BaseModel):
    style: str | None = None
    styles: list[str] | None = None
    density: str | None = None
    surface_type: str | None = None
    surfaces: list[str] | None = None
    size_m2: float | None = None  # moderator's surface estimate in m²
    photos: list[PhotoClass] | None = None  # per-photo type/surface/size (multi-photo markers)


# Rank for deriving the primary/most-significant type (drives map pin colour).
_STYLE_RANK = {"piece": 5, "mural": 4, "throwup": 3, "tag": 2, "sticker": 1, "other": 0}
_DENSITY_OK = {"light", "medium", "heavy"}


def _primary_style(styles, fallback=None):
    """Most significant type in a list, for the single `style` column / pin colour."""
    vals = [s for s in (styles or []) if s]
    if not vals:
        return fallback
    return max(vals, key=lambda s: _STYLE_RANK.get(s, -1))


def _class_fields(styles, style, density, surface_type, size_m2, surfaces=None):
    """Build the classification column dict from multi-type / multi-surface + density."""
    fields = {}
    sl = [s for s in (styles or []) if s]
    if sl:
        fields["styles"] = sl
        fields["style"] = _primary_style(sl)
    elif style:
        fields["styles"] = [style]
        fields["style"] = style
    if density in _DENSITY_OK:
        fields["density"] = density
    su = [s for s in (surfaces or []) if s]
    if su:
        fields["surfaces"] = su
        fields["surface_type"] = su[0]     # primary surface (first)
    elif surface_type:
        fields["surfaces"] = [surface_type]
        fields["surface_type"] = surface_type
    if size_m2 is not None and 0 < size_m2 <= 10000:
        fields["size_m2"] = size_m2
    return fields


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
    """
    Community uploads awaiting review, newest first.

    get_pending_graffiti() is filtered to source 'community' in SQL, so the
    per-item nearby-duplicate lookup below never runs across the thousands of
    bulk-imported scans. Bulk YOLO scans go through /pending-fast instead.
    """
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


@router.get("/pending-fast")
def list_pending_fast(
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(require_admin),
):
    """
    Lightweight, paginated pending list for bulk moderation (the table view).

    Filtering + LIMIT/OFFSET happen inside get_pending_graffiti_bulk() in SQL,
    so this never hits PostgREST's 1000-row cap regardless of how big the pending
    pool is. Bulk scans are pre-de-duped by the pipeline, so no nearby-duplicate
    lookup is done here. Pagination is offset-based; approving/rejecting removes
    items from the pool, so re-fetching offset 0 yields the next un-moderated batch.
    """
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    service = _service()
    page = service.rpc("get_pending_graffiti_bulk",
                       {"p_limit": limit, "p_offset": offset}).execute().data or []
    for p in page:
        p["nearby"] = []   # never computed here — bulk scans are pre-de-duped

    # Total pending bulk count (exact, via header — no row transfer).
    cnt = (service.table("graffiti")
           .select("id", count="exact")
           .eq("status", "pending_review")
           .neq("source", "community")
           .limit(1)
           .execute())
    total = cnt.count or 0

    return {
        "pending": page,
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(page) < total,
    }


@router.get("/approved-fast")
def list_approved_fast(
    limit: int = 100,
    offset: int = 0,
    user: dict = Depends(require_admin),
):
    """Paginated APPROVED list for re-classifying older photos (add types +
    density). Ordered by city. Read-only apart from the reclassify endpoint."""
    limit = max(1, min(limit, 500))
    offset = max(0, offset)

    service = _service()
    page = service.rpc("get_approved_graffiti_bulk",
                       {"p_limit": limit, "p_offset": offset}).execute().data or []
    for p in page:
        p["nearby"] = []

    cnt = (service.table("graffiti")
           .select("id", count="exact")
           .eq("status", "approved")
           .eq("reclassified", False)
           .limit(1)
           .execute())
    total = cnt.count or 0

    return {
        "pending": page,     # same shape as pending-fast so the table can reuse it
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": offset + len(page) < total,
    }


class ReclassifyBody(BaseModel):
    photos: list[PhotoClass] | None = None   # per-image styles + density + surface
    styles: list[str] | None = None          # marker-level fallback
    density: str | None = None
    surface_type: str | None = None
    surfaces: list[str] | None = None


@router.post("/graffiti/{graffiti_id}/reclassify")
def reclassify_graffiti(graffiti_id: str, body: ReclassifyBody, user: dict = Depends(require_admin)):
    """Update ONLY types + density on an already-approved graffiti. Never touches
    size_m2 (measurement is preserved) or status."""
    service = _service()

    def reclass_fields(styles, style, density, surface, surfaces):
        # types + density + surface(s), but NEVER size_m2 (measurement preserved).
        f = _class_fields(styles, style, density, surface, None, surfaces)
        f.pop("size_m2", None)
        return f

    updated = 0
    if body.photos:
        for ph in body.photos:
            fields = reclass_fields(ph.styles, ph.style, ph.density, ph.surface_type, ph.surfaces)
            if not fields:
                continue
            existing = service.table("classifications").select("id").eq("image_id", ph.image_id).execute()
            if existing.data:
                service.table("classifications").update(fields).eq("image_id", ph.image_id).execute()
            else:
                service.table("classifications").insert({
                    "graffiti_id": graffiti_id, "image_id": ph.image_id,
                    **fields, "model_version": "moderator",
                }).execute()
            updated += 1
    else:
        fields = reclass_fields(body.styles, None, body.density, body.surface_type, body.surfaces)
        if fields:
            existing = service.table("classifications").select("id").eq("graffiti_id", graffiti_id).execute()
            if existing.data:
                service.table("classifications").update(fields).eq("graffiti_id", graffiti_id).execute()
            else:
                service.table("classifications").insert({
                    "graffiti_id": graffiti_id, **fields, "model_version": "moderator",
                }).execute()
            updated = 1

    # Mark done so it drops out of the reclassify backlog and never reappears.
    service.table("graffiti").update({
        "reclassified": True,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()

    return {"status": "reclassified", "id": graffiti_id, "images_updated": updated}


@router.get("/pending-points")
def pending_points(user: dict = Depends(require_admin)):
    """All pending bulk points (id + coords + thumbnail) for the moderation map —
    used to spot near-duplicates and drag them together."""
    service = _service()
    pts, step, off = [], 500, 0
    while True:
        chunk = service.rpc("get_pending_graffiti_bulk",
                            {"p_limit": step, "p_offset": off}).execute().data or []
        pts += chunk
        if len(chunk) < step:
            break
        off += step
    out = [{"id": p["id"], "lat": p["lat"], "lng": p["lng"], "key": p.get("s3_key_thumb")}
           for p in pts if p.get("lat") is not None and p.get("lng") is not None]
    return {"points": out}


@router.get("/all-points")
def all_points(user: dict = Depends(require_admin)):
    """Every point (approved + pending) for the moderation map — the whole dataset
    at once, so overlaps between new and already-published photos are visible."""
    service = _service()
    pts, step, off = [], 1000, 0
    while True:
        chunk = service.rpc("get_all_points",
                            {"p_limit": step, "p_offset": off}).execute().data or []
        pts += chunk
        if len(chunk) < step:
            break
        off += step
    out = [{"id": p["id"], "lat": p["lat"], "lng": p["lng"],
            "key": p.get("s3_key_thumb"), "status": p.get("status")}
           for p in pts if p.get("lat") is not None and p.get("lng") is not None]
    return {"points": out}


class PairBody(BaseModel):
    a: str
    b: str


@router.post("/scan-pairs")
def scan_pairs(user: dict = Depends(require_admin)):
    """Fold newly-added photos into the stored close-pair set. Only measures
    photos not scanned yet, so it's cheap after the first run."""
    service = _service()
    res = service.rpc("scan_dup_pairs", {}).execute()
    return {"open_count": res.data if isinstance(res.data, int) else (res.data or 0)}


@router.get("/dup-pairs")
def dup_pairs(user: dict = Depends(require_admin)):
    """The stored OPEN close pairs (definitive), with both points' coords +
    thumbnails, for the moderation map."""
    service = _service()
    rows = service.rpc("get_open_dup_pairs", {}).execute().data or []
    points, edges = {}, []
    for r in rows:
        a, b = r["a"], r["b"]
        points[a] = {"id": a, "lat": r["a_lat"], "lng": r["a_lng"], "key": r["a_key"], "status": r["a_status"]}
        points[b] = {"id": b, "lat": r["b_lat"], "lng": r["b_lng"], "key": r["b_key"], "status": r["b_status"]}
        edges.append([a, b])
    return {"points": list(points.values()), "edges": edges, "count": len(edges)}


@router.post("/ignore-pair")
def ignore_pair(body: PairBody, user: dict = Depends(require_admin)):
    """Mark these two photos as NOT duplicates of each other (they stop being
    flagged together)."""
    if body.a == body.b:
        raise HTTPException(status_code=400, detail="Même point")
    a, b = sorted([body.a, body.b])   # order-independent key
    service = _service()
    service.table("dup_pairs").upsert({"a": a, "b": b, "status": "ignored"}).execute()
    return {"status": "ignored", "a": a, "b": b}


@router.post("/graffiti/{graffiti_id}/link-to/{target_id}")
def link_to_location(graffiti_id: str, target_id: str, user: dict = Depends(require_admin)):
    """Consolidate two nearby points into one location: give this point the
    target's location_id so they collapse to a single pin with a shared timeline.
    Nothing is deleted — both photos remain, newest shown, older in the history."""
    if graffiti_id == target_id:
        raise HTTPException(status_code=400, detail="Même point")
    service = _service()
    target = service.table("graffiti").select("id, location_id").eq("id", target_id).execute()
    if not target.data:
        raise HTTPException(status_code=404, detail="Cible introuvable")
    loc = target.data[0].get("location_id") or target_id
    src = service.table("graffiti").select("id").eq("id", graffiti_id).execute()
    if not src.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")
    service.table("graffiti").update({
        "location_id": loc,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()
    # Both merged photos are considered handled — resolve every close pair
    # involving either of them so they both leave the review (order-independent).
    service.table("dup_pairs").delete().or_(
        f"a.eq.{graffiti_id},b.eq.{graffiti_id},a.eq.{target_id},b.eq.{target_id}").execute()
    return {"status": "linked", "id": graffiti_id, "target": target_id, "location_id": loc}


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
    update = {
        "status": "approved",
        "reclassified": True,   # classified with the current fields → not in the reclassify backlog
        "updated_at": datetime.utcnow().isoformat(),
    }
    if body and body.size_m2 is not None and 0 < body.size_m2 <= 10000:
        update["size_m2"] = body.size_m2
    res = service.table("graffiti").update(update).eq("id", graffiti_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    if body and body.photos:
        # Per-photo classification: each image on this marker gets its own
        # types / density / surface / size (used when a spot has different
        # graffiti per side).
        for ph in body.photos:
            fields = _class_fields(ph.styles, ph.style, ph.density, ph.surface_type, ph.size_m2, ph.surfaces)
            if not fields:
                continue
            existing = service.table("classifications").select("id") \
                .eq("image_id", ph.image_id).execute()
            if existing.data:
                service.table("classifications").update(fields) \
                    .eq("image_id", ph.image_id).execute()
            else:
                service.table("classifications").insert({
                    "graffiti_id": graffiti_id,
                    "image_id": ph.image_id,
                    **fields,
                    "model_version": "moderator",
                }).execute()
    elif body and (body.style or body.styles or body.surface_type or body.surfaces):
        # Single classification for the whole marker (community uploads etc.).
        fields = _class_fields(body.styles, body.style, body.density, body.surface_type, None, body.surfaces)
        existing = service.table("classifications").select("id") \
            .eq("graffiti_id", graffiti_id).is_("image_id", "null").execute()
        if existing.data:
            service.table("classifications").update(fields) \
                .eq("graffiti_id", graffiti_id).is_("image_id", "null").execute()
        else:
            service.table("classifications").insert({
                "graffiti_id": graffiti_id,
                **fields,
                "model_version": "moderator",
            }).execute()

    return {"status": "approved", "id": graffiti_id}


@router.post("/image/{image_id}/reject")
def reject_image(image_id: str, user: dict = Depends(require_admin)):
    """
    Reject a single photo (e.g. a false positive on one side) while keeping the
    marker and its other photo(s). Deletes the image's S3 files and its row.
    If it was the marker's only photo, the marker is removed too (nothing left
    to show).
    """
    service = _service()
    row = service.table("images").select(
        "graffiti_id, s3_key_thumb, s3_key_medium, s3_key_full, s3_key_raw"
    ).eq("id", image_id).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Image introuvable")
    img = row.data[0]
    graffiti_id = img["graffiti_id"]

    # delete this image's S3 files (best-effort)
    keys = [img[k] for k in ("s3_key_thumb", "s3_key_medium", "s3_key_full", "s3_key_raw") if img.get(k)]
    if keys:
        try:
            _s3().delete_objects(Bucket=MEDIA_BUCKET,
                                 Delete={"Objects": [{"Key": k} for k in set(keys)]})
        except Exception:
            pass

    service.table("images").delete().eq("id", image_id).execute()

    # if that was the last photo, remove the (now photoless) marker
    remaining = service.table("images").select("id", count="exact") \
        .eq("graffiti_id", graffiti_id).limit(1).execute()
    marker_deleted = False
    if (remaining.count or 0) == 0:
        service.table("classifications").delete().eq("graffiti_id", graffiti_id).execute()
        service.table("graffiti").delete().eq("id", graffiti_id).execute()
        marker_deleted = True

    return {"status": "deleted", "image_id": image_id,
            "graffiti_id": graffiti_id, "marker_deleted": marker_deleted}


class TargetBody(BaseModel):
    target_id: str
    style: str | None = None
    styles: list[str] | None = None
    density: str | None = None
    surfaces: list[str] | None = None
    size_m2: float | None = None


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
    update = {
        "location_id": loc,
        "status": "approved",
        "reclassified": True,
        "updated_at": datetime.utcnow().isoformat(),
    }
    if body.size_m2 is not None and 0 < body.size_m2 <= 10000:
        update["size_m2"] = body.size_m2
    service.table("graffiti").update(update).eq("id", graffiti_id).execute()
    cfields = _class_fields(body.styles, body.style, body.density, None, None, body.surfaces)
    if cfields:
        existing = service.table("classifications").select("id").eq("graffiti_id", graffiti_id).execute()
        if existing.data:
            service.table("classifications").update(cfields).eq("graffiti_id", graffiti_id).execute()
        else:
            service.table("classifications").insert({
                "graffiti_id": graffiti_id, **cfields,
                "model_version": "moderator",
            }).execute()
    return {"status": "approved", "location_id": loc}


@router.post("/graffiti/{graffiti_id}/reject")
def reject_graffiti(graffiti_id: str, user: dict = Depends(require_admin)):
    service = _service()

    exists = service.table("graffiti").select("id").eq("id", graffiti_id).execute()
    if not exists.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    # Any close pairs involving this point no longer apply.
    service.table("dup_pairs").delete().or_(f"a.eq.{graffiti_id},b.eq.{graffiti_id}").execute()

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


@router.get("/stats")
def get_stats(user: dict = Depends(require_admin)):
    """Admin dashboard numbers, gathered server-side in one query."""
    service = _service()
    res = service.rpc("get_admin_stats", {}).execute()
    return res.data or {}