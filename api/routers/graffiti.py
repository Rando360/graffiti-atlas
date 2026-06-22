from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def get_graffiti():
    return {"message": "Graffiti router live"}