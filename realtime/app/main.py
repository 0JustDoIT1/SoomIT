import asyncio
import json
import logging
import os
from typing import Dict
from uuid import UUID

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("realtime-chat")

REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/2")
DJANGO_INTERNAL_BASE_URL = os.environ.get("DJANGO_INTERNAL_BASE_URL", "").rstrip("/")
DJANGO_SERVICE_TOKEN = os.environ.get("DJANGO_SERVICE_TOKEN", "")
ALLOWED_ORIGINS = {
    item.strip()
    for item in os.environ.get("REALTIME_ALLOWED_ORIGINS", "").split(",")
    if item.strip()
}

app = FastAPI(title="SoomIT Realtime Chat")
redis_client: aioredis.Redis | None = None
http_client: httpx.AsyncClient | None = None


class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Dict[WebSocket, str]] = {}
        self.listeners: Dict[str, asyncio.Task] = {}
        self.listener_ready: Dict[str, asyncio.Event] = {}

    async def connect(self, room_id: str, websocket: WebSocket, user_id: str, subprotocol: str | None = None):
        if room_id not in self.listeners:
            ready = asyncio.Event()
            self.listener_ready[room_id] = ready
            self.listeners[room_id] = asyncio.create_task(self._subscribe(room_id, ready))
        await asyncio.wait_for(self.listener_ready[room_id].wait(), timeout=5)
        await websocket.accept(subprotocol=subprotocol)
        self.rooms.setdefault(room_id, {})[websocket] = user_id

    def disconnect(self, room_id: str, websocket: WebSocket):
        connections = self.rooms.get(room_id)
        if connections and websocket in connections:
            del connections[websocket]
        if connections is not None and not connections:
            del self.rooms[room_id]
            task = self.listeners.pop(room_id, None)
            self.listener_ready.pop(room_id, None)
            if task:
                task.cancel()

    async def _subscribe(self, room_id: str, ready: asyncio.Event):
        pubsub = redis_client.pubsub()
        channel = f"chat:{room_id}"
        try:
            await pubsub.subscribe(channel)
            ready.set()
            async for message in pubsub.listen():
                if message["type"] == "message":
                    await self._broadcast(room_id, message["data"])
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()

    async def _broadcast(self, room_id: str, data: str):
        dead = []
        try:
            event = json.loads(data)
            if event.get("type") == "chat.message.read":
                read = event.get("read", {})
                allowed_ids = {str(read.get("sender_id", "")), str(read.get("reader", {}).get("id", ""))}
                is_private = True
            else:
                message = event.get("message", {})
                allowed_ids = {str(message.get("sender", {}).get("id", "")), *map(str, message.get("recipient_ids", []))}
                is_private = bool(message.get("is_private"))
        except (TypeError, ValueError, AttributeError):
            return
        for websocket, user_id in list(self.rooms.get(room_id, {}).items()):
            if is_private and user_id not in allowed_ids:
                continue
            try:
                await websocket.send_text(data)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self.disconnect(room_id, websocket)


manager = ConnectionManager()


def _canonical_uuid(value: str) -> str | None:
    try:
        return str(UUID(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _django_headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "X-Service-Token": DJANGO_SERVICE_TOKEN,
        "Content-Type": "application/json",
    }


def _error_detail(response: httpx.Response, fallback: str) -> str:
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        return fallback
    return detail if isinstance(detail, str) and detail else fallback


async def _authorize_case(case_id: str, access_token: str) -> tuple[int, str | None]:
    try:
        response = await http_client.get(
            f"{DJANGO_INTERNAL_BASE_URL}/api/chat/internal/cases/{case_id}/access/",
            headers=_django_headers(access_token),
        )
    except httpx.HTTPError:
        logger.exception("Django chat access check failed")
        return 1011, None
    if response.status_code == 200:
        user_id = response.json().get("user_id")
        return (0, str(user_id)) if user_id else (1011, None)
    if response.status_code == 401:
        return 4401, None
    if response.status_code in (403, 404):
        return 4403, None
    return 1011, None

async def _authorize_global(access_token: str) -> tuple[int, str | None, str | None]:
    try:
        response = await http_client.get(f"{DJANGO_INTERNAL_BASE_URL}/api/chat/internal/global/access/", headers=_django_headers(access_token))
    except httpx.HTTPError:
        return 1011, None, None
    if response.status_code == 200:
        data = response.json()
        return 0, str(data.get("user_id")), str(data.get("hospital_id"))
    return (4401, None, None) if response.status_code == 401 else ((4403, None, None) if response.status_code in (403, 404) else (1011, None, None))


async def _send_error(websocket: WebSocket, code: str, detail: str):
    await websocket.send_json({"type": "chat.error", "code": code, "detail": detail})


async def _reject_websocket(websocket: WebSocket, code: int):
    # ASGI servers turn a pre-accept close into an HTTP 403 response. Accepting
    # first ensures clients receive the specified application close code.
    await websocket.accept()
    await websocket.close(code=code)


async def _store_message(case_id: str, access_token: str, payload: dict) -> httpx.Response:
    return await http_client.post(
        f"{DJANGO_INTERNAL_BASE_URL}/api/chat/internal/cases/{case_id}/messages/",
        headers=_django_headers(access_token),
        json={
            "client_message_id": payload["client_message_id"],
            "body": payload["body"],
            "is_private": bool(payload.get("is_private", False)),
            "recipient_ids": payload.get("recipient_ids", []),
        },
    )


async def _mark_message_read(case_id: str, access_token: str, message_id: str) -> httpx.Response:
    return await http_client.post(
        f"{DJANGO_INTERNAL_BASE_URL}/api/chat/cases/{case_id}/messages/read/",
        headers=_django_headers(access_token),
        json={"message_ids": [message_id]},
    )

async def _store_global_message(access_token: str, payload: dict) -> httpx.Response:
    return await http_client.post(f"{DJANGO_INTERNAL_BASE_URL}/api/chat/internal/global/messages/", headers=_django_headers(access_token), json={"client_message_id": payload["client_message_id"], "body": payload["body"]})

async def _mark_global_message_read(access_token: str, message_id: str) -> httpx.Response:
    return await http_client.post(f"{DJANGO_INTERNAL_BASE_URL}/api/chat/global/messages/read/", headers=_django_headers(access_token), json={"message_ids": [message_id]})


@app.on_event("startup")
async def startup():
    global redis_client, http_client
    if not DJANGO_INTERNAL_BASE_URL or not DJANGO_SERVICE_TOKEN or not ALLOWED_ORIGINS:
        raise RuntimeError("Realtime Django URL, service token, and allowed origins are required")
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    await redis_client.ping()
    http_client = httpx.AsyncClient(timeout=httpx.Timeout(15.0))
    logger.info("Realtime dependencies are ready")


@app.on_event("shutdown")
async def shutdown():
    if http_client:
        await http_client.aclose()
    if redis_client:
        await redis_client.aclose()


@app.get("/health")
async def health():
    # GIT_COMMIT_SHA/DEPLOYED_AT are set by infra/docker-compose.yml at
    # deploy time (same commit SHA already used as the Docker image tag),
    # so the system-admin monitoring dashboard can show this service's
    # currently-running version without a separate version-tracking system.
    version = {
        "commit_sha": os.environ.get("GIT_COMMIT_SHA", "local"),
        "deployed_at": os.environ.get("DEPLOYED_AT"),
    }
    try:
        await redis_client.ping()
        return {"status": "ok", **version}
    except Exception:
        return {"status": "error", **version}


@app.websocket("/ws/chat/global")
async def global_chat_endpoint(websocket: WebSocket):
    protocols = [p.strip() for p in websocket.headers.get("sec-websocket-protocol", "").split(",") if p.strip()]
    selected = "soomit-chat" if "soomit-chat" in protocols else None
    token = next((p for p in protocols if p != "soomit-chat"), "") or websocket.query_params.get("token", "")
    if not token:
        await _reject_websocket(websocket, 4401)
        return
    if websocket.headers.get("origin") not in ALLOWED_ORIGINS:
        await _reject_websocket(websocket, 4403)
        return
    code, user_id, hospital_id = await _authorize_global(token)
    if code:
        await _reject_websocket(websocket, code)
        return
    room = f"global:{hospital_id}"
    try:
        await manager.connect(room, websocket, user_id, selected)
    except Exception:
        await _reject_websocket(websocket, 1011)
        return
    try:
        while True:
            payload = json.loads(await websocket.receive_text())
            if payload.get("type") == "chat.message.read":
                message_id = _canonical_uuid(payload.get("message_id"))
                if message_id:
                    response = await _mark_global_message_read(token, message_id)
                    for read in response.json().get("read_messages", []):
                        await redis_client.publish(f"chat:{room}", json.dumps({"type": "chat.message.read", "read": read}))
                continue
            if payload.get("type") != "chat.message.create" or not _canonical_uuid(payload.get("client_message_id")):
                continue
            body = payload.get("body")
            if not isinstance(body, str) or not body.strip() or len(body.strip()) > 2000:
                continue
            payload["body"] = body.strip()
            response = await _store_global_message(token, payload)
            if response.status_code in (200, 201):
                stored = response.json()
                event = {"type": "chat.message.created", "message": stored["message"]}
                if stored.get("created", response.status_code == 201):
                    await redis_client.publish(f"chat:{room}", json.dumps(event, ensure_ascii=False))
                else:
                    await websocket.send_json(event)
    except (WebSocketDisconnect, json.JSONDecodeError):
        pass
    finally:
        manager.disconnect(room, websocket)


@app.websocket("/ws/chat/{case_id}")
async def chat_endpoint(websocket: WebSocket, case_id: str):
    canonical_case_id = _canonical_uuid(case_id)
    requested_protocols = [
        protocol.strip()
        for protocol in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if protocol.strip()
    ]
    selected_protocol = "soomit-chat" if "soomit-chat" in requested_protocols else None
    protocol_token = (
        next((protocol for protocol in requested_protocols if protocol != "soomit-chat"), "")
        if selected_protocol
        else ""
    )
    # Query-token support is retained for already-deployed older clients only.
    # New clients use Sec-WebSocket-Protocol so credentials are not placed in URLs/access logs.
    access_token = (protocol_token or websocket.query_params.get("token", "")).strip()
    origin = websocket.headers.get("origin")
    if not access_token:
        await _reject_websocket(websocket, 4401)
        return
    if not canonical_case_id or not origin or origin not in ALLOWED_ORIGINS:
        await _reject_websocket(websocket, 4403)
        return

    close_code, user_id = await _authorize_case(canonical_case_id, access_token)
    if close_code:
        await _reject_websocket(websocket, close_code)
        return
    try:
        await manager.connect(canonical_case_id, websocket, user_id, selected_protocol)
    except Exception:
        logger.exception("WebSocket room initialization failed")
        await _reject_websocket(websocket, 1011)
        return

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(websocket, "VALIDATION_ERROR", "올바른 JSON 메시지가 아닙니다.")
                continue
            if not isinstance(payload, dict):
                await _send_error(websocket, "VALIDATION_ERROR", "지원하지 않는 메시지 형식입니다.")
                continue
            if payload.get("type") == "chat.message.read":
                message_id = _canonical_uuid(payload.get("message_id"))
                if not message_id:
                    await _send_error(websocket, "VALIDATION_ERROR", "message_id가 올바르지 않습니다.")
                    continue
                try:
                    response = await _mark_message_read(canonical_case_id, access_token, message_id)
                except httpx.HTTPError:
                    logger.exception("Django chat read-state storage failed")
                    await _send_error(websocket, "SERVICE_UNAVAILABLE", "읽음 상태를 저장할 수 없습니다.")
                    continue
                if response.status_code == 200:
                    for read in response.json().get("read_messages", []):
                        await redis_client.publish(
                            f"chat:{canonical_case_id}",
                            json.dumps({"type": "chat.message.read", "read": read}, ensure_ascii=False),
                        )
                    continue
                if response.status_code == 401:
                    await websocket.close(code=4401)
                    return
                if response.status_code in (403, 404):
                    await websocket.close(code=4403)
                    return
                await _send_error(websocket, "VALIDATION_ERROR", _error_detail(response, "읽음 상태를 처리할 수 없습니다."))
                continue
            if payload.get("type") != "chat.message.create":
                await _send_error(websocket, "VALIDATION_ERROR", "지원하지 않는 메시지 형식입니다.")
                continue
            if not _canonical_uuid(payload.get("client_message_id")):
                await _send_error(websocket, "VALIDATION_ERROR", "client_message_id가 올바르지 않습니다.")
                continue
            body = payload.get("body")
            if not isinstance(body, str) or not body.strip() or len(body.strip()) > 2000:
                await _send_error(websocket, "VALIDATION_ERROR", "메시지는 1자 이상 2,000자 이하여야 합니다.")
                continue
            payload["body"] = body.strip()

            try:
                response = await _store_message(canonical_case_id, access_token, payload)
            except httpx.HTTPError:
                logger.exception("Django chat message storage failed")
                await _send_error(websocket, "SERVICE_UNAVAILABLE", "메시지를 저장할 수 없습니다.")
                continue
            if response.status_code in (200, 201):
                stored = response.json()
                event = {"type": "chat.message.created", "message": stored["message"]}
                encoded = json.dumps(event, ensure_ascii=False)
                if stored.get("created", response.status_code == 201):
                    await redis_client.publish(f"chat:{canonical_case_id}", encoded)
                else:
                    await websocket.send_text(encoded)
                continue
            if response.status_code == 401:
                await websocket.close(code=4401)
                return
            if response.status_code in (403, 404):
                await websocket.close(code=4403)
                return
            if response.status_code == 409:
                await _send_error(
                    websocket,
                    "CLIENT_MESSAGE_ID_CONFLICT",
                    _error_detail(response, "client_message_id가 이미 사용됐습니다."),
                )
                continue
            await _send_error(
                websocket,
                "VALIDATION_ERROR" if response.status_code == 400 else "SERVICE_UNAVAILABLE",
                _error_detail(response, "메시지를 처리할 수 없습니다."),
            )
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(canonical_case_id, websocket)
