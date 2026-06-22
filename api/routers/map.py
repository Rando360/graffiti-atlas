from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def get_map():
    return {"message": "Map router live"}