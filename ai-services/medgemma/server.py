"""Owned HTTP API; vLLM runs only on the container's loopback interface."""
import asyncio
import logging
import os
import re
import sys
import time
from contextlib import asynccontextmanager
from contextlib import suppress
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

MODEL = "google/medgemma-4b-it"
ENGINE_URL = "http://127.0.0.1:8001"
METRICS_INTERVAL_SECONDS = max(10.0, float(os.environ.get("METRICS_INTERVAL_SECONDS", "30")))
logger = logging.getLogger("uvicorn.error")


def log_latency(stage: str, started: float) -> None:
    logger.info(
        "latency service=medgemma stage=%s elapsed_seconds=%.3f",
        stage,
        time.perf_counter() - started,
    )


def prometheus_metric_sum(payload: str, name: str) -> float | None:
    pattern = re.compile(
        rf"^{re.escape(name)}(?:\{{[^}}]*\}})?\s+([-+0-9.eE]+)$",
        re.MULTILINE,
    )
    values = [float(match.group(1)) for match in pattern.finditer(payload)]
    return sum(values) if values else None


async def log_gpu_memory() -> None:
    try:
        process = await asyncio.create_subprocess_exec(
            "nvidia-smi",
            "--query-gpu=memory.used,memory.total",
            "--format=csv,noheader,nounits",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=5)
        if process.returncode != 0:
            return
        first_line = stdout.decode("utf-8").strip().splitlines()[0]
        used_mib, total_mib = (float(value.strip()) for value in first_line.split(",", 1))
        logger.info(
            "metric service=medgemma name=gpu_memory_mib used=%.0f total=%.0f",
            used_mib,
            total_mib,
        )
    except (OSError, IndexError, ValueError, asyncio.TimeoutError):
        logger.debug("medgemma GPU memory metric is unavailable", exc_info=True)


async def log_vllm_metrics(client: httpx.AsyncClient) -> None:
    try:
        response = await client.get("/metrics", timeout=3)
        response.raise_for_status()
        payload = response.text
        ttft_sum = prometheus_metric_sum(payload, "vllm:time_to_first_token_seconds_sum")
        ttft_count = prometheus_metric_sum(payload, "vllm:time_to_first_token_seconds_count")
        if ttft_sum is not None and ttft_count:
            logger.info(
                "metric service=medgemma name=ttft_seconds average=%.6f sample_count=%.0f",
                ttft_sum / ttft_count,
                ttft_count,
            )
        cache_usage = prometheus_metric_sum(payload, "vllm:gpu_cache_usage_perc")
        if cache_usage is not None:
            logger.info(
                "metric service=medgemma name=gpu_cache_usage ratio=%.6f",
                cache_usage,
            )
    except (httpx.HTTPError, AttributeError, ValueError):
        logger.debug("medgemma vLLM metrics are unavailable", exc_info=True)


async def monitor_runtime_metrics(client: httpx.AsyncClient) -> None:
    while True:
        await asyncio.gather(log_vllm_metrics(client), log_gpu_memory())
        await asyncio.sleep(METRICS_INTERVAL_SECONDS)


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
                metrics_task = asyncio.create_task(monitor_runtime_metrics(client))
                try:
                    yield
                finally:
                    metrics_task.cancel()
                    with suppress(asyncio.CancelledError):
                        await metrics_task
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
        total_started = time.perf_counter()
        stage_started = time.perf_counter()
        request_payload = body.model_dump()
        log_latency("request_preparation", stage_started)
        try:
            stage_started = time.perf_counter()
            response = await app.state.client.post(
                "/v1/chat/completions", json=request_payload
            )
            generation_elapsed = time.perf_counter() - stage_started
            logger.info(
                "latency service=medgemma stage=vllm_generation elapsed_seconds=%.3f",
                generation_elapsed,
            )
        except httpx.TimeoutException as exc:
            raise HTTPException(504, "Model inference timed out") from exc
        except httpx.RequestError as exc:
            raise HTTPException(503, "Model engine unavailable") from exc
        if response.status_code >= 500:
            raise HTTPException(502, "Model engine failed")
        stage_started = time.perf_counter()
        response_payload = response.json()
        log_latency("response_parsing", stage_started)
        usage = response_payload.get("usage") if isinstance(response_payload, dict) else None
        if isinstance(usage, dict):
            prompt_tokens = int(usage.get("prompt_tokens") or 0)
            completion_tokens = int(usage.get("completion_tokens") or 0)
            logger.info(
                "throughput service=medgemma prompt_tokens=%d completion_tokens=%d "
                "effective_completion_tokens_per_second=%.3f",
                prompt_tokens,
                completion_tokens,
                completion_tokens / generation_elapsed if generation_elapsed > 0 else 0.0,
            )
        stage_started = time.perf_counter()
        result = JSONResponse(response_payload, status_code=response.status_code)
        log_latency("response_serialization", stage_started)
        log_latency("total", total_started)
        return result

    return app


app = create_app()
