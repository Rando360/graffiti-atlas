from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import graffiti, images, users, map, auth

app = FastAPI(
    title="GraffitiAtlas API",
    description="Backend API for GraffitiAtlas.io",
    version="0.1.0"
)

# CORS — allows the React frontend to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://graffitiatlas.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(graffiti.router, prefix="/graffiti", tags=["graffiti"])
app.include_router(images.router, prefix="/images", tags=["images"])
app.include_router(map.router, prefix="/map", tags=["map"])

# Health check
@app.get("/healthz")
def health_check():
    return {"status": "ok", "project": "GraffitiAtlas"}