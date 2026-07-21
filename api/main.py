from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import graffiti, images, users, map, auth, uploads, moderation, contact

app = FastAPI(
    title="GraffitiAtlas API",
    description="Backend API for GraffitiAtlas.io",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://graffiti-atlas.vercel.app",
        "https://graffitiatlas.io",
        "https://www.graffitiatlas.io"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(graffiti.router, prefix="/graffiti", tags=["graffiti"])
app.include_router(images.router, prefix="/images", tags=["images"])
app.include_router(map.router, prefix="/map", tags=["map"])
app.include_router(uploads.router, prefix="/uploads", tags=["uploads"])
app.include_router(moderation.router, prefix="/moderation", tags=["moderation"])
app.include_router(contact.router, prefix="/contact", tags=["contact"])

@app.get("/healthz")
def health_check():
    return {"status": "ok", "project": "GraffitiAtlas"}
