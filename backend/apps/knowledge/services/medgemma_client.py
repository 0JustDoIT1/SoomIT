import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

MODEL = "google/medgemma-4b-it"


class MedgemmaServiceError(RuntimeError):
    pass


def _fetch_id_token():
    # Cloud Run은 IAM으로 보호되므로, 서비스 URL을 audience로 하는 구글 ID 토큰이 필요하다.
    # 로컬 uvicorn처럼 인증이 없는 환경에서는 MEDGEMMA_SERVICE_USE_ID_TOKEN=0으로 끈다.
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, settings.MEDGEMMA_SERVICE_URL)


def request_chat_completion(messages, max_tokens=300, temperature=0):
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
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise MedgemmaServiceError("medgemma 서비스 응답 형식이 예상과 다릅니다.") from exc
