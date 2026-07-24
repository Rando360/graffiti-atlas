from fastapi import APIRouter, HTTPException
from supabase import create_client
import os

router = APIRouter()

CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"

def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"]
    )

@router.get("/{graffiti_id}")
def get_graffiti(graffiti_id: str):
    """Returns a single graffiti point — used for shareable deep links (?g=<id>)."""
    supabase = get_supabase()
    try:
        result = supabase.rpc("get_graffiti_by_id", {"gid": graffiti_id}).execute()
    except Exception:
        raise HTTPException(status_code=400, detail="Identifiant invalide")

    if not result.data:
        raise HTTPException(status_code=404, detail="Graffiti introuvable")

    r = result.data[0]
    s3_key = r.get("s3_key_full", "")
    date = r.get("date_observed")

    return {
        "id": r["id"],
        "lat": r["lat"],
        "lng": r["lng"],
        "city": r["city"],
        "style": r.get("style"),
        "size_m2": r.get("size_m2"),
        "surface_type": r.get("surface_type"),
        "description_fr": r.get("description_fr"),
        "image_url": f"{CLOUDFRONT}/{s3_key}" if s3_key else None,
        "source": "GraffitiAtlas" if r.get("source") == "rando360" else "Community",
        "date_observed": str(date) if date else None,
        "year": str(date)[:4] if date else None,
    }


@router.get("/{graffiti_id}/images")
def get_graffiti_images(graffiti_id: str):
    """Returns all images and classifications for a single graffiti location."""
    supabase = get_supabase()

    images = supabase.table("images") \
        .select("id, s3_key_full, source, source_sequence_id, author, license, license_label") \
        .eq("graffiti_id", graffiti_id) \
        .execute()

    classifications = supabase.table("classifications") \
        .select("id, style, size_m2, surface_type, description_fr") \
        .eq("graffiti_id", graffiti_id) \
        .execute()

    result = []
    for i, img in enumerate(images.data):
        s3_key = img.get("s3_key_full", "")
        image_url = f"{CLOUDFRONT}/{s3_key}" if s3_key else None
        classification = classifications.data[i] if i < len(classifications.data) else {}

        result.append({
            "image_url": image_url,
            "style": classification.get("style"),
            "size_m2": classification.get("size_m2"),
            "surface_type": classification.get("surface_type"),
            "description_fr": classification.get("description_fr"),
            "source": img.get("source"),
            "author": img.get("author"),
            "license": img.get("license"),
            "license_label": img.get("license_label"),
            "source_sequence_id": img.get("source_sequence_id"),
        })

    return {"graffiti_id": graffiti_id, "images": result}