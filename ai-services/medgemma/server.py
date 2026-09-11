"""Owned HTTP API; vLLM runs only on the container's loopback interface."""
import asyncio
import os
import sys
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

MODEL = "google/medgemma-4b-it"
ENGINE_URL = "http://127.0.0.1:8001"


class Message(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=32000)


class ChatRequest(BaseModel):
    model: Literal["google/medgemma-4b-it"] = MODEL
    messages: list[Message] = Field(min_length=1, max_length=32)
    max_tokens: int = Field(default=300, ge=1, le=2048)
    temperature: float = Field(default=0, ge=0, le=2)
    stream: Literal[False] = False

    @model_validator(mode="after")
    def bounded_request(self):
        if sum(len(message.content) for message in self.messages) > 32000:
            raise ValueError("Combined messages must not exceed 32000 characters")
        return self


async def start_engine():
    env = dict(os.environ, VLLM_USE_V1="0")
    return await asyncio.create_subprocess_exec(
        sys.executable, "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL, "--host", "127.0.0.1", "--port", "8001",
        "--max-model-len", "4096", "--gpu-memory-utilization", "0.7",
        "--enforce-eager", "--disable-log-stats", "--disable-log-requests",
        env=env,
    )


async def stop_engine(process):
    if process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=8)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()


def create_app(engine_factory=start_engine, client_factory=None):
    @asynccontextmanager
    async def lifespan(app):
        process = await engine_factory()
        try:
            async with (client_factory() if client_factory else httpx.AsyncClient(
                base_url=ENGINE_URL, timeout=httpx.Timeout(280, connect=5),
                trust_env=False,
            )) as client:
                deadline = asyncio.get_running_loop().time() + 210
                while True:
                    if process.returncode is not None:
                        raise RuntimeError("vLLM exited before becoming ready")
                    try:
                        response = await client.get("/health", timeout=2)
                        if response.status_code == 200:
                            break
                    except httpx.RequestError:
                        pass
                    if asyncio.get_running_loop().time() >= deadline:
                        raise RuntimeError("vLLM startup timed out")
                    await asyncio.sleep(1)
                app.state.client = client
                app.state.process = process
                yield
        finally:
            await stop_engine(process)

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)

    @app.get("/health")
    async def health():
        try:
            result = await app.state.client.get("/health", timeout=2)
            if app.state.process.returncode is None and result.status_code == 200:
                return {"status": "ok", "model": MODEL, "engine": "vllm-0.9.1-v0"}
        except httpx.RequestError:
            pass
        raise HTTPException(503, "Model engine unavailable")

    @app.post("/v1/chat/completions")
    async def chat(body: ChatRequest):
        try:
            response = await app.state.client.post(
                "/v1/chat/completions", json=body.model_dump()
            )
        except httpx.TimeoutException as exc:
            raise HTTPException(504, "Model inference timed out") from exc
        except httpx.RequestError as exc:
            raise HTTPException(503, "Model engine unavailable") from exc
        if response.status_code >= 500:
            raise HTTPException(502, "Model engine failed")
        return JSONResponse(response.json(), status_code=response.status_code)

    return app


app = create_app()
