from contextlib import asynccontextmanager
import logging
from threading import Lock
import time
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from encoder import DIMENSIONS, MAX_TOKENS, MODEL_ID, Encoder, InputTooLong


logger = logging.getLogger("uvicorn.error")


def log_latency(stage, started):
    logger.info(
        "latency service=embedding stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


class EmbeddingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texts: list[str] = Field(min_length=1, max_length=8)
    input_type: Literal["query", "passage"]

    @field_validator("texts")
    @classmethod
    def validate_texts(cls, texts):
        if any(not text.strip() or len(text) > 12000 for text in texts):
            raise ValueError("Each text must contain 1–12000 characters and cannot be blank")
        return [text.strip() for text in texts]


def create_app(encoder_factory=Encoder):
    @asynccontextmanager
    async def lifespan(app):
        app.state.encoder = encoder_factory()
        app.state.inference_lock = Lock()
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

    @app.get("/health")
    def health():
        return {"status": "ok", "model": MODEL_ID, "revision": app.state.encoder.revision,
                "dimensions": DIMENSIONS, "max_tokens": MAX_TOKENS}

    @app.post("/embed")
    def embed(body: EmbeddingRequest):
        total_started = time.perf_counter()
        # Also bound inference concurrency when running outside Cloud Run.
        wait_started = time.perf_counter()
        with app.state.inference_lock:
            log_latency("inference_lock_wait", wait_started)
            try:
                vectors, counts = app.state.encoder.encode(body.texts, body.input_type)
            except InputTooLong as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        response = {"model": MODEL_ID, "revision": app.state.encoder.revision,
                    "dimensions": DIMENSIONS, "input_type": body.input_type,
                    "embeddings": vectors, "token_counts": counts}
        log_latency("request_total", total_started)
        return response

    return app


app = create_app()
