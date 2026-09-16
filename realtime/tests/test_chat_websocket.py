import asyncio
import json
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import httpx
from fastapi import WebSocketDisconnect

from app import main


class FakeWebSocket:
    def __init__(self, *, token="token", origin="http://localhost:3000", incoming=None):
        self.query_params = {"token": token} if token is not None else {}
        self.headers = {"origin": origin} if origin is not None else {}
        self.incoming = list(incoming or [])
        self.accepted = False
        self.close_code = None
        self.sent_json = []
        self.sent_text = []

    async def accept(self):
        self.accepted = True

    async def close(self, code):
        self.close_code = code

    async def receive_text(self):
        if not self.incoming:
            raise WebSocketDisconnect()
        return self.incoming.pop(0)

    async def send_json(self, payload):
        self.sent_json.append(payload)

    async def send_text(self, payload):
        self.sent_text.append(payload)


class FakeRedis:
    def __init__(self):
        self.publish = AsyncMock(return_value=1)


def test_missing_token_closes_with_4401():
    websocket = FakeWebSocket(token=None)

    asyncio.run(main.chat_endpoint(websocket, str(uuid4())))

    assert websocket.accepted is True
    assert websocket.close_code == 4401


def test_disallowed_origin_closes_with_4403():
    websocket = FakeWebSocket(origin="https://attacker.example")

    with patch.object(main, "ALLOWED_ORIGINS", {"http://localhost:3000"}):
        asyncio.run(main.chat_endpoint(websocket, str(uuid4())))

    assert websocket.accepted is True
    assert websocket.close_code == 4403


def test_django_access_rejection_preserves_websocket_close_code():
    for expected_code in (4401, 4403):
        websocket = FakeWebSocket()
        with (
            patch.object(main, "ALLOWED_ORIGINS", {"http://localhost:3000"}),
            patch.object(main, "_authorize_case", AsyncMock(return_value=expected_code)),
        ):
            asyncio.run(main.chat_endpoint(websocket, str(uuid4())))
        assert websocket.accepted is True
        assert websocket.close_code == expected_code


def test_new_message_is_stored_then_published():
    case_id = str(uuid4())
    client_message_id = str(uuid4())
    websocket = FakeWebSocket(
        incoming=[
            json.dumps(
                {
                    "type": "chat.message.create",
                    "client_message_id": client_message_id,
                    "body": "검사 영상을 확인했습니다.",
                }
            )
        ]
    )
    stored_message = {
        "id": str(uuid4()),
        "case_id": case_id,
        "sender": {
            "id": str(uuid4()),
            "name": "방사선사",
            "department": "RADIOLOGY",
            "role": "TECHNOLOGIST",
        },
        "body": "검사 영상을 확인했습니다.",
        "created_at": "2026-09-16T11:20:00+09:00",
    }
    response = httpx.Response(201, json={"message": stored_message, "created": True})
    fake_redis = FakeRedis()

    with (
        patch.object(main, "ALLOWED_ORIGINS", {"http://localhost:3000"}),
        patch.object(main, "_authorize_case", AsyncMock(return_value=0)),
        patch.object(main, "_store_message", AsyncMock(return_value=response)) as store,
        patch.object(main, "redis_client", fake_redis),
        patch.object(main.manager, "connect", AsyncMock()),
        patch.object(main.manager, "disconnect", Mock()),
    ):
        asyncio.run(main.chat_endpoint(websocket, case_id))

    store.assert_awaited_once()
    fake_redis.publish.assert_awaited_once()
    channel, encoded = fake_redis.publish.await_args.args
    assert channel == f"chat:{case_id}"
    assert json.loads(encoded) == {"type": "chat.message.created", "message": stored_message}
    assert websocket.sent_text == []


def test_replayed_message_is_acknowledged_without_rebroadcast():
    case_id = str(uuid4())
    websocket = FakeWebSocket(
        incoming=[
            json.dumps(
                {
                    "type": "chat.message.create",
                    "client_message_id": str(uuid4()),
                    "body": "중복 메시지",
                }
            )
        ]
    )
    stored_message = {
        "id": str(uuid4()),
        "case_id": case_id,
        "sender": {
            "id": str(uuid4()),
            "name": "담당 의사",
            "department": "PULMONOLOGY",
            "role": "DOCTOR",
        },
        "body": "중복 메시지",
        "created_at": "2026-09-16T11:20:00+09:00",
    }
    response = httpx.Response(200, json={"message": stored_message, "created": False})
    fake_redis = FakeRedis()

    with (
        patch.object(main, "ALLOWED_ORIGINS", {"http://localhost:3000"}),
        patch.object(main, "_authorize_case", AsyncMock(return_value=0)),
        patch.object(main, "_store_message", AsyncMock(return_value=response)),
        patch.object(main, "redis_client", fake_redis),
        patch.object(main.manager, "connect", AsyncMock()),
        patch.object(main.manager, "disconnect", Mock()),
    ):
        asyncio.run(main.chat_endpoint(websocket, case_id))

    fake_redis.publish.assert_not_awaited()
    assert len(websocket.sent_text) == 1
    assert json.loads(websocket.sent_text[0]) == {
        "type": "chat.message.created",
        "message": stored_message,
    }
