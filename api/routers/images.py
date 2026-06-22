from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def get_images():
    return {"message": "Images router live"}