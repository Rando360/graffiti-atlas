from fastapi import APIRouter
from supabase import create_client
import os

router = APIRouter()

CLOUDFRONT = "https://d36hw3x1088tvv.cloudfront.net"

def get_supabase():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"]
    )

@router.get("/{graffiti_id}/images")
def get_graffiti_images(graffiti_id: str):
    """Returns all images and classifications for a single graffiti location."""
    supabase = get_supabase()

    images = supabase.table("images") \
        .select("id, s3_key_full, source, source_sequence_id") \
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
        })

    return {"graffiti_id": graffiti_id, "images": result}