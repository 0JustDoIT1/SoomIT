from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request

from inference import InvalidImageError, XrayModels


MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(32 * 1024 * 1024)))
models: XrayModels | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global models
    models = XrayModels()
    yield
    models = None


app = FastAPI(title="SoomIT X-ray inference", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    if models is None:
        raise HTTPException(status_code=503, detail="Models are not loaded")
    return {"status": "ok", "device": str(models.device), "model_revision": models.revision}


@app.post("/v1/predict")
async def predict(
    request: Request,
    score_threshold: float = Query(default=0.30, ge=0.0, le=1.0),
):
    if models is None:
        raise HTTPException(status_code=503, detail="Models are not loaded")

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the configured size limit")
    content = await request.body()
    if not content:
        raise HTTPException(status_code=400, detail="Request body is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the configured size limit")

    try:
        image = models.decode_image(content)
    except InvalidImageError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    return models.predict(image, score_threshold)
