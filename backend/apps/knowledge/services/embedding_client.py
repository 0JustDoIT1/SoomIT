import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class EmbeddingServiceError(RuntimeError):
    pass


class InputTooLong(EmbeddingServiceError):
    """텍스트 중 하나가 512토큰(prefix 포함) 한도를 넘어 서비스가 422를 반환한 경우."""


def _fetch_id_token():
    # Cloud Run은 IAM으로 보호되므로, 서비스 URL을 audience로 하는 구글 ID 토큰이 필요하다.
    # 로컬 uvicorn처럼 인증이 없는 환경에서는 EMBEDDING_SERVICE_USE_ID_TOKEN=0으로 끈다.
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, settings.EMBEDDING_SERVICE_URL)


def request_embeddings(texts, input_type):
    """embedding 서비스의 POST /embed 를 호출한다. texts는 최대 EMBEDDING_SERVICE_BATCH_SIZE개."""
    body = json.dumps({"texts": texts, "input_type": input_type}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if settings.EMBEDDING_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"

    request = Request(f"{settings.EMBEDDING_SERVICE_URL}/embed", data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=settings.EMBEDDING_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        if exc.code == 422:
            raise InputTooLong("입력 텍스트가 512토큰 한도를 초과했습니다.") from exc
        raise EmbeddingServiceError(f"임베딩 서비스가 요청을 거부했습니다. (HTTP {exc.code})") from exc
    except (URLError, TimeoutError) as exc:
        raise EmbeddingServiceError("임베딩 서비스에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EmbeddingServiceError("임베딩 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    return payload
