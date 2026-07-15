"""
Auth dependency for GraffitiAtlas.

Verifies the Supabase access token sent by the frontend and returns the
authenticated user. Uses Supabase's own /auth/v1/user endpoint to validate
the token, so no JWT secret needs to be stored.

Usage in a route:

    from routers.auth_dependency import get_current_user, require_admin

    @router.post("/upload")
    def upload(user = Depends(get_current_user)):
        user_id = user["id"]
        ...
"""

import os
from fastapi import Depends, HTTPException, Header
from supabase import create_client


def _anon_client():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_ANON_KEY"],
    )


def get_current_user(authorization: str = Header(None)):
    """
    Reads the 'Authorization: Bearer <token>' header, asks Supabase to
    validate it, and returns the user as a dict. Raises 401 if missing/invalid.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Authentification requise")

    token = authorization.split(" ", 1)[1].strip()

    try:
        supabase = _anon_client()
        resp = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée")

    user = getattr(resp, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée")

    return {
        "id": user.id,
        "email": user.email,
        "metadata": user.user_metadata or {},
    }


def require_admin(user: dict = Depends(get_current_user)):
    """
    Only allows users whose profile.role is 'admin' or 'moderator'.
    Used to protect the moderation endpoints.
    """
    from supabase import create_client
    service = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )
    result = service.table("profiles").select("role").eq("id", user["id"]).execute()
    role = result.data[0]["role"] if result.data else None

    if role not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Accès réservé aux modérateurs")

    return user
