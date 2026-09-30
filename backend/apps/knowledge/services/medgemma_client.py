import json
import hashlib
import threading
import base64
import time
from concurrent.futures import Future
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

MODEL = "google/medgemma-4b-it"
_inflight = {}
_inflight_lock = threading.Lock()
_id_tokens = {}
_id_token_lock = threading.Lock()


class MedgemmaServiceError(RuntimeError):
    pass


def _fetch_id_token():
    # Cloud Run은 IAM으로 보호되므로, 서비스 URL을 audience로 하는 구글 ID 토큰이 필요하다.
    # 로컬 uvicorn처럼 인증이 없는 환경에서는 MEDGEMMA_SERVICE_USE_ID_TOKEN=0으로 끈다.
    import google.auth.exceptions
    import google.auth.transport.requests
    import google.oauth2.id_token

    audience = settings.MEDGEMMA_SERVICE_URL
    with _id_token_lock:
        cached = _id_tokens.get(audience)
        if cached and cached[1] > time.time() + 60:
            return cached[0]
        request = google.auth.transport.requests.Request()
        try:
            token = google.oauth2.id_token.fetch_id_token(request, audience)
        except google.auth.exceptions.GoogleAuthError as exc:
            raise MedgemmaServiceError("medgemma 서비스 인증을 사용할 수 없습니다.") from exc
        # Only inspect expiry on a token just minted by Google's auth library.
        # This is not a substitute for token verification on the receiving service.
        try:
            encoded = token.split(".")[1]
            expiry = float(json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)))["exp"])
            if expiry > time.time() + 60:
                if len(_id_tokens) >= 8:
                    _id_tokens.clear()
                _id_tokens[audience] = (token, expiry)
        except (ValueError, TypeError, KeyError, IndexError):
            pass
        return token


def request_chat_completion(messages, max_tokens=300, temperature=0):
    """Share identical deterministic requests while inference is in flight.

    No completed response is retained: a later explicit regeneration still
    reaches the model. The key includes the complete input and destination.
    """
    if temperature != 0:
        return _request_chat_completion(messages, max_tokens, temperature)
    identity = json.dumps({
        "messages": messages, "max_tokens": max_tokens, "temperature": temperature,
        "model": MODEL, "endpoint": settings.MEDGEMMA_SERVICE_URL,
        "auth": settings.MEDGEMMA_SERVICE_USE_ID_TOKEN,
    }, sort_keys=True, ensure_ascii=False)
    key = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    with _inflight_lock:
        pending = _inflight.get(key)
        owner = pending is None
        if owner:
            pending = Future()
            _inflight[key] = pending
    if not owner:
        try:
            return pending.result(timeout=settings.MEDGEMMA_SERVICE_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            raise MedgemmaServiceError("medgemma 응답 대기 시간이 초과되었습니다.") from exc
    try:
        result = _request_chat_completion(messages, max_tokens, temperature)
        pending.set_result(result)
        return result
    except BaseException as exc:
        pending.set_exception(exc)
        raise
    finally:
        with _inflight_lock:
            _inflight.pop(key, None)


def _request_chat_completion(messages, max_tokens=300, temperature=0):
    """medgemma 서비스의 POST /v1/chat/completions 를 호출한다."""
    body = json.dumps({
        "model": MODEL, "messages": messages, "max_tokens": max_tokens,
        "temperature": temperature, "stream": False,
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if settings.MEDGEMMA_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"

    request = Request(
        f"{settings.MEDGEMMA_SERVICE_URL}/v1/chat/completions", data=body, headers=headers, method="POST",
    )
    try:
        with urlopen(request, timeout=settings.MEDGEMMA_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise MedgemmaServiceError(f"medgemma 서비스가 요청을 거부했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise MedgemmaServiceError("medgemma 서비스에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MedgemmaServiceError("medgemma 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise MedgemmaServiceError("medgemma 서비스 응답 형식이 예상과 다릅니다.") from exc
    if not isinstance(content, str) or not content.strip():
        raise MedgemmaServiceError("medgemma 서비스가 유효한 답변을 반환하지 않았습니다.")
    return content
