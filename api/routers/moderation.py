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
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client

from routers.auth_dependency import require_admin

router = APIRouter()

CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"


def _service():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


@router.get("/pending")
def list_pending(user: dict = Depends(require_admin)):
    """Graffiti submissions awaiting review, newest first."""
    service = _service()
    rows = service.rpc("get_pending_graffiti", {}).execute()
    return {"pending": rows.data or []}


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
def approve_graffiti(graffiti_id: str, user: dict = Depends(require_admin)):
    service = _service()
    res = service.table("graffiti").update({
        "status": "approved",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")
    return {"status": "approved", "id": graffiti_id}


@router.post("/graffiti/{graffiti_id}/reject")
def reject_graffiti(graffiti_id: str, user: dict = Depends(require_admin)):
    service = _service()
    res = service.table("graffiti").update({
        "status": "rejected",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", graffiti_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")
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
