import asyncio
import json
import logging
import os
from typing import Dict, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import redis.asyncio as aioredis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("realtime-chat")

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/2")

app = FastAPI(title="SoomIT Realtime Chat")

redis_client: aioredis.Redis | None = None


class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}
        self.listeners: Dict[str, asyncio.Task] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(room_id, set()).add(websocket)
        if room_id not in self.listeners:
            self.listeners[room_id] = asyncio.create_task(self._subscribe(room_id))

    def disconnect(self, room_id: str, websocket: WebSocket):
        conns = self.rooms.get(room_id)
        if conns and websocket in conns:
            conns.remove(websocket)
        if conns is not None and not conns:
            del self.rooms[room_id]
            task = self.listeners.pop(room_id, None)
            if task:
                task.cancel()

    async def _subscribe(self, room_id: str):
        pubsub = redis_client.pubsub()
        channel = f"chat:{room_id}"
        await pubsub.subscribe(channel)
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                await self._broadcast(room_id, message["data"])
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    async def _broadcast(self, room_id: str, data: str):
        conns = list(self.rooms.get(room_id, ()))
        dead = []
        for ws in conns:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)


manager = ConnectionManager()


@app.on_event("startup")
async def startup():
    global redis_client
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    logger.info("Redis 연결 성공: %s", REDIS_URL)


@app.on_event("shutdown")
async def shutdown():
    if redis_client:
        await redis_client.close()


@app.get("/health")
async def health():
    try:
        await redis_client.ping()
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.websocket("/ws/chat/{room_id}")
async def chat_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                payload = {"message": raw}

            payload.setdefault("room_id", room_id)
            await redis_client.publish(f"chat:{room_id}", json.dumps(payload, ensure_ascii=False))
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)