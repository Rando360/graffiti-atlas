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
    city: str = Query(None),
    style: str = Query(None),
):
    supabase = get_supabase()
    result = supabase.rpc("get_graffiti_in_bbox", {
        "min_lat": south, "min_lng": west,
        "max_lat": north, "max_lng": east,
    }).execute()

    features = []
    for r in result.data:
        s3_key = r.get("s3_key_full", "")
        image_url = f"{CLOUDFRONT}/{s3_key}" if s3_key else None
        display_source = "GraffitiAtlas" if r.get("source") == "rando360" else "Community"
        date = r.get("date_observed")
        year = str(date)[:4] if date else None

        features.append({
            "id": r["id"],
            "lat": r["lat"],
            "lng": r["lng"],
            "city": r["city"],
            "style": r.get("style"),
            "size_m2": r.get("size_m2"),
            "surface_type": r.get("surface_type"),
            "description_fr": r.get("description_fr"),
            "image_url": image_url,
            "source": display_source,
            "date_observed": str(date) if date else None,
            "year": year,
        })

    if city:
        features = [f for f in features if f["city"] == city]
    if style:
        features = [f for f in features if f["style"] == style]

    return {"count": len(features), "features": features}


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