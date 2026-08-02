"""
reports.py — Admin data reports for a map area.

Given a bounding box (the admin's current map view), returns a report on the
graffiti inside it: summary statistics (counts, total m², breakdown by type and
surface, active vs cleaned) plus a detailed list. Admin/moderator only.

Powered by the get_report_data() Postgres RPC (see the SQL in the project docs).
"""

import os
from collections import Counter

from fastapi import APIRouter, Depends, Query
from supabase import create_client

from routers.auth_dependency import require_admin

router = APIRouter()


def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


@router.get("/area")
def report_area(
    north: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    west: float = Query(...),
    user: dict = Depends(require_admin),
):
    """Report on all approved graffiti within the given bounding box."""
    supabase = get_supabase()
    rows = supabase.rpc("get_report_data", {
        "min_lat": south, "min_lng": west,
        "max_lat": north, "max_lng": east,
    }).execute()

    data = rows.data or []

    # ── Summary statistics ──────────────────────────────────────────────────
    total = len(data)
    total_m2 = 0.0
    by_style = Counter()
    by_surface = Counter()
    by_city = Counter()
    active = 0
    cleaned = 0

    for r in data:
        size = r.get("size_m2")
        if size:
            try:
                total_m2 += float(size)
            except (TypeError, ValueError):
                pass
        by_style[r.get("style") or "unknown"] += 1
        by_surface[r.get("surface_type") or "unknown"] += 1
        by_city[r.get("city") or "unknown"] += 1
        if r.get("removed_at"):
            cleaned += 1
        else:
            active += 1

    summary = {
        "total": total,
        "total_m2": round(total_m2, 1),
        "active": active,
        "cleaned": cleaned,
        "by_style": dict(by_style.most_common()),
        "by_surface": dict(by_surface.most_common()),
        "by_city": dict(by_city.most_common()),
        "bounds": {"north": north, "south": south, "east": east, "west": west},
    }

    # ── Detailed list (lightweight) ─────────────────────────────────────────
    items = [{
        "id": r.get("id"),
        "lat": r.get("lat"),
        "lng": r.get("lng"),
        "city": r.get("city"),
        "address": r.get("address"),
        "style": r.get("style"),
        "size_m2": r.get("size_m2"),
        "surface_type": r.get("surface_type"),
        "description_fr": r.get("description_fr"),
        "date_observed": r.get("date_observed"),
        "removed_at": r.get("removed_at"),
        "source": r.get("source"),
    } for r in data]

    return {"summary": summary, "items": items}
