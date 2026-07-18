"""
User account endpoints for GraffitiAtlas.

- GET    /users/me                → current user's profile
- PATCH  /users/me                → update display_name / language
- GET    /users/me/contributions  → the user's own submissions + statuses
- DELETE /users/me                → delete account (anonymises public data)
"""

import os
from datetime import datetime

import boto3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import create_client

from routers.auth_dependency import get_current_user

router = APIRouter()

MEDIA_BUCKET = "graffitiatlas-media"


def _service():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])


def _s3():
    return boto3.client(
        "s3",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        region_name=os.environ.get("AWS_REGION", "eu-west-3"),
    )


def _delete_graffiti_files(image_row: dict):
    """Delete every stored size for one graffiti's image from S3 (best-effort)."""
    keys = [image_row.get(k) for k in ("s3_key_thumb", "s3_key_medium", "s3_key_full", "s3_key_raw")]
    keys = [k for k in keys if k]
    if not keys:
        return
    try:
        _s3().delete_objects(
            Bucket=MEDIA_BUCKET,
            Delete={"Objects": [{"Key": k} for k in keys]},
        )
    except Exception:
        pass  # never block the user-facing deletion on an S3 hiccup


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    language: str | None = None


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    service = _service()
    res = service.table("profiles").select("id, display_name, language, role, avatar_url") \
        .eq("id", user["id"]).execute()
    profile = res.data[0] if res.data else {}
    return {
        "id": user["id"],
        "email": user["email"],
        "display_name": profile.get("display_name") or user["metadata"].get("full_name"),
        "language": profile.get("language") or "fr",
        "role": profile.get("role") or "user",
        "avatar_url": profile.get("avatar_url") or user["metadata"].get("avatar_url"),
    }


@router.patch("/me")
def update_me(body: ProfileUpdate, user: dict = Depends(get_current_user)):
    updates = {}
    if body.display_name is not None:
        name = body.display_name.strip()
        if len(name) < 2 or len(name) > 40:
            raise HTTPException(status_code=400, detail="Le nom doit faire entre 2 et 40 caractères.")
        updates["display_name"] = name
    if body.language is not None:
        if body.language not in ("fr", "en", "es", "de", "it"):
            raise HTTPException(status_code=400, detail="Langue non supportée.")
        updates["language"] = body.language

    if not updates:
        raise HTTPException(status_code=400, detail="Aucune modification.")

    service = _service()
    service.table("profiles").update(updates).eq("id", user["id"]).execute()
    return {"status": "updated", **updates}


@router.get("/me/contributions")
def my_contributions(user: dict = Depends(get_current_user)):
    service = _service()
    rows = service.table("graffiti") \
        .select("id, city, status, created_at") \
        .eq("user_id", user["id"]) \
        .order("created_at", desc=True) \
        .execute()

    data = rows.data or []
    counts = {"approved": 0, "pending_review": 0, "rejected": 0}
    for r in data:
        counts[r.get("status", "pending_review")] = counts.get(r.get("status", "pending_review"), 0) + 1

    return {"total": len(data), "counts": counts, "contributions": data[:50]}


@router.delete("/me")
def delete_me(user: dict = Depends(get_current_user)):
    """
    GDPR account deletion. Approved contributions are anonymised (kept for their
    documentary value, detached from the user); pending/rejected ones are removed.
    """
    service = _service()
    uid = user["id"]

    # Anonymise approved contributions
    service.table("graffiti").update({"user_id": None}) \
        .eq("user_id", uid).eq("status", "approved").execute()

    # Remove not-yet-public contributions (and their children + S3 files)
    pending = service.table("graffiti").select("id") \
        .eq("user_id", uid).neq("status", "approved").execute()
    for row in pending.data or []:
        gid = row["id"]
        imgs = service.table("images").select(
            "s3_key_thumb, s3_key_medium, s3_key_full, s3_key_raw"
        ).eq("graffiti_id", gid).execute()
        for img in imgs.data or []:
            _delete_graffiti_files(img)
        service.table("classifications").delete().eq("graffiti_id", gid).execute()
        service.table("images").delete().eq("graffiti_id", gid).execute()
        service.table("graffiti").delete().eq("id", gid).execute()

    # Delete profile row
    service.table("profiles").delete().eq("id", uid).execute()

    # Delete the auth user
    try:
        service.auth.admin.delete_user(uid)
    except Exception:
        pass  # profile already gone; auth cleanup can be finished admin-side if needed

    return {"status": "deleted"}