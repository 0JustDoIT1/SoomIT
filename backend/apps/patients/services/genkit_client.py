import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings


class GenkitServiceError(RuntimeError):
    pass


class GenkitServiceNotConfigured(GenkitServiceError):
    pass


def _fetch_id_token():
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, settings.GENKIT_SERVICE_URL)


def request_patient_chat(message, history):
    if not settings.GENKIT_SERVICE_URL:
        raise GenkitServiceNotConfigured("Genkit 서비스가 아직 설정되지 않았습니다.")

    body = json.dumps(
        {"message": message, "history": history},
        ensure_ascii=False,
    ).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if settings.GENKIT_SERVICE_USE_ID_TOKEN:
        headers["Authorization"] = f"Bearer {_fetch_id_token()}"

    request = Request(
        f"{settings.GENKIT_SERVICE_URL}/chat",
        data=body,
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=settings.GENKIT_SERVICE_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise GenkitServiceError(
            f"Genkit 서비스가 요청을 처리하지 못했습니다. (HTTP {exc.code})"
        ) from exc
    except (URLError, TimeoutError) as exc:
        raise GenkitServiceError("Genkit 서비스에 연결할 수 없습니다.") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GenkitServiceError("Genkit 서비스 응답이 올바른 JSON이 아닙니다.") from exc

    answer = payload.get("answer") if isinstance(payload, dict) else None
    if not isinstance(answer, str) or not answer.strip():
        raise GenkitServiceError("Genkit 서비스 응답 형식이 올바르지 않습니다.")

    return {"answer": answer}
