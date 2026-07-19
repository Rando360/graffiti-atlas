from fastapi import APIRouter, Query
from supabase import create_client
import os

router = APIRouter()

def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"]
    )

CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"


@router.get("/graffiti")
def get_map_graffiti(
    north: float = Query(...),
    south: float = Query(...),
    east: float = Query(...),
    west: float = Query(...),
    zoom: int = Query(12),
    city: str = Query(None),
    style: str = Query(None),
):
    """
    Zoom-aware map data. The database clusters server-side:
      • zoomed out  → returns cluster bubbles (count + centre), few rows
      • zoomed in   → returns individual graffiti with full detail
    This scales to very large datasets because the browser never receives
    more than what's needed for the current view.
    """
    supabase = get_supabase()
    result = supabase.rpc("get_map_clusters", {
        "min_lat": south, "min_lng": west,
        "max_lat": north, "max_lng": east,
        "zoom": zoom,
    }).execute()

    features = []
    for r in result.data:
        if r.get("is_cluster"):
            # A cluster bubble — minimal payload.
            features.append({
                "cluster": True,
                "count": r["cluster_count"],
                "lat": r["lat"],
                "lng": r["lng"],
                "style": r.get("style"),   # dominant style (optional colouring)
            })
        else:
            # An individual marker — full detail.
            s3_key = r.get("s3_key_full", "")
            image_url = f"{CLOUDFRONT}/{s3_key}" if s3_key else None
            display_source = "GraffitiAtlas" if r.get("source") == "rando360" else "Community"
            date = r.get("date_observed")
            year = str(date)[:4] if date else None

            feature = {
                "cluster": False,
                "id": r["id"],
                "location_id": r.get("location_id"),
                "cleaned": bool(r.get("cleaned")),
                "lat": r["lat"],
                "lng": r["lng"],
                "city": r.get("city"),
                "style": r.get("style"),
                "size_m2": r.get("size_m2"),
                "surface_type": r.get("surface_type"),
                "description_fr": r.get("description_fr"),
                "image_url": image_url,
                "source": display_source,
                "date_observed": str(date) if date else None,
                "year": year,
            }
            # Optional client-side filters only apply to individual markers.
            if city and feature["city"] != city:
                continue
            if style and feature["style"] != style:
                continue
            features.append(feature)

    return {"count": len(features), "features": features}


@router.get("/location/{location_id}")
def get_location_timeline(location_id: str):
    """History of graffiti at one location (newest first)."""
    supabase = get_supabase()
    rows = supabase.rpc("get_location_timeline", {"p_location_id": location_id}).execute()
    out = []
    for r in rows.data or []:
        key = r.get("s3_key_medium")
        out.append({
            "id": r["id"],
            "style": r.get("style"),
            "date_observed": str(r["date_observed"]) if r.get("date_observed") else None,
            "removed_at": str(r["removed_at"]) if r.get("removed_at") else None,
            "source": "GraffitiAtlas" if r.get("source") == "rando360" else "Community",
            "image_url": f"{CLOUDFRONT}/{key}" if key else None,
        })
    return {"timeline": out}


@router.get("/cities")
def get_cities():
    supabase = get_supabase()
    result = supabase.table("graffiti") \
        .select("city") \
        .eq("status", "approved") \
        .execute()

    counts = {}
    for r in result.data:
        city = r["city"]
        counts[city] = counts.get(city, 0) + 1

    return {
        "cities": [
            {"name": city, "count": count}
            for city, count in sorted(counts.items())
        ]
    }