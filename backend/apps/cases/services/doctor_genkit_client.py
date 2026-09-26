import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from django.conf import settings

class DoctorGenkitError(RuntimeError): pass
class DoctorGenkitNotConfigured(DoctorGenkitError): pass


def _fetch_id_token():
    import google.auth.transport.requests

    request = google.auth.transport.requests.Request()
    if settings.GENKIT_SERVICE_ACCOUNT_FILE:
        from google.oauth2 import service_account

        credentials = service_account.IDTokenCredentials.from_service_account_file(
            settings.GENKIT_SERVICE_ACCOUNT_FILE,
            target_audience=settings.GENKIT_SERVICE_URL,
        )
        credentials.refresh(request)
        return credentials.token

    import google.oauth2.id_token

    return google.oauth2.id_token.fetch_id_token(request, settings.GENKIT_SERVICE_URL)

def request_doctor_case_chat(*, message, history, case_context, assistant_scope="case"):
    if not settings.GENKIT_SERVICE_URL: raise DoctorGenkitNotConfigured('의료진 AI Assistant Genkit 서비스가 아직 설정되지 않았습니다.')
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Django-Service-Token': settings.AI_SERVICE_TOKEN,
    }
    if settings.GENKIT_SERVICE_USE_ID_TOKEN:
        headers['Authorization'] = f'Bearer {_fetch_id_token()}'
    request = Request(f'{settings.GENKIT_SERVICE_URL}/doctor-case-chat', data=json.dumps({'message': message, 'history': history, 'case_context': case_context, 'assistant_scope': assistant_scope}, ensure_ascii=False, default=str).encode('utf-8'), headers=headers, method='POST')
    try:
        with urlopen(request, timeout=settings.GENKIT_SERVICE_TIMEOUT_SECONDS) as response: payload=json.loads(response.read().decode())
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError) as exc: raise DoctorGenkitError('의료진 AI Assistant 서비스에 연결할 수 없습니다.') from exc
    if not isinstance(payload, dict) or not isinstance(payload.get('answer'), str): raise DoctorGenkitError('의료진 AI Assistant 응답 형식이 올바르지 않습니다.')
    return {'answer': payload['answer'], 'context_used': payload.get('context_used', []) if isinstance(payload.get('context_used', []), list) else []}
