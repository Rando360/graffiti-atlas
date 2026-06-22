from fastapi import APIRouter

router = APIRouter()

@router.get("/")
def auth_root():
    return {"message": "Auth router live"}