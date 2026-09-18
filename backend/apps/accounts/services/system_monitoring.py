"""Read-only aggregate data for the system-admin "전체 플랫폼 관제" dashboard.

Same rule as hospital_monitoring.py: only ever reports numbers derived from
real rows (AiAnalysis, AuditLog, ModelVersion, User, Hospital). Anything with
no backing data source (Cloud Run revisions, Celery/Redis/Orthanc/Realtime
health, deployment versions) is reported as "연결 필요" rather than guessed.

Query shape: today's AiAnalysis rows are fetched ONCE as plain values() and
reused in-memory for both the per-analysis-type queue breakdown and the
named AI-service status list, instead of looping per hospital/per service
and re-querying the DB each time.
"""

import json
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from apps.ai_results.models import AiAnalysis, AnalysisType, ModelVersion
from apps.audit.models import AuditLog

from ..models import Hospital, User

VERSION_PROBE_TIMEOUT_SECONDS = 2

NO_SIGNAL = "연결 필요"

AUDIT_LOG_LIMIT = 15
RECENT_ERROR_LIMIT = 15

# Named AI services the platform actually operates. Only the ones with a
# matching AnalysisType get a computed status from real AiAnalysis rows -
# the rest have no persisted execution/status log anywhere in the system
# (they're synchronous external API clients with no DB-backed run history),
# so they're reported as needing a monitoring connection rather than faked.
AI_SERVICE_REGISTRY = [
    ("CT 분석", AnalysisType.CT_ANALYSIS),
    ("X-ray 분석", AnalysisType.XRAY_ANALYSIS),
    ("병리 조직·유전자 분석", AnalysisType.PATHOLOGY_GENE_ANALYSIS),
    ("PD-L1 분석", AnalysisType.PDL1_ANALYSIS),
    ("PET-CT/TNM 분석", AnalysisType.PET_CT_TNM_ANALYSIS),
    ("치료 추천", AnalysisType.TREATMENT_RECOMMENDATION),
    ("Embedding", None),
    ("MedGemma", None),
    ("Genkit", None),
]


def _today_start():
    return timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)


def _elapsed_seconds(start, end):
    if not start or not end:
        return None
    return max((end - start).total_seconds(), 0)


def _build_kpi(today_start, today_totals):
    return {
        "total_hospitals": Hospital.objects.count(),
        "active_users_total": User.objects.filter(account_status=User.AccountStatus.ACTIVE).count(),
        "ai_requests_today": today_totals["total"],
        "ai_running_now": AiAnalysis.objects.filter(status=AiAnalysis.Status.RUNNING).count(),
        "ai_failed_today": today_totals["failed"],
    }


def _build_hospitals_overview(today_start):
    """Three flat queries total, regardless of how many hospitals exist -
    no per-hospital query loop."""
    active_users_by_hospital = dict(
        User.objects.filter(account_status=User.AccountStatus.ACTIVE, department_role__department__hospital_id__isnull=False)
        .values("department_role__department__hospital_id")
        .annotate(count=Count("id"))
        .values_list("department_role__department__hospital_id", "count")
    )
    ai_by_hospital = {
        row["case__patient__hospital_id"]: row
        for row in (
            AiAnalysis.objects.filter(created_at__gte=today_start)
            .values("case__patient__hospital_id")
            .annotate(total=Count("id"), failed=Count("id", filter=Q(status=AiAnalysis.Status.FAILED)))
        )
    }

    rows = []
    for hospital in Hospital.objects.order_by("code"):
        ai_stats = ai_by_hospital.get(hospital.id, {"total": 0, "failed": 0})
        recent_requests, failed = ai_stats["total"], ai_stats["failed"]
        if recent_requests == 0:
            hospital_status = "UNKNOWN"
        elif failed == 0:
            hospital_status = "HEALTHY"
        else:
            hospital_status = "WARNING"
        rows.append({
            "id": str(hospital.id),
            "name": hospital.name,
            "code": hospital.code,
            "active_users": active_users_by_hospital.get(hospital.id, 0),
            "recent_requests": recent_requests,
            "failed_count": failed,
            "status": hospital_status,
        })
    return rows


def _today_ai_rows(today_start):
    """Single fetch of today's AiAnalysis rows (analysis_type/status/timing
    only) - reused by both the queue-by-type breakdown and the named AI
    service status list below, instead of querying once per type/service."""
    return list(
        AiAnalysis.objects.filter(created_at__gte=today_start)
        .values("analysis_type", "status", "started_at", "completed_at")
    )


def _build_ai_queue_by_type(today_rows):
    by_type = {analysis_type: [] for analysis_type, _ in AnalysisType.choices}
    for row in today_rows:
        by_type[row["analysis_type"]].append(row)

    result = []
    for analysis_type, _ in AnalysisType.choices:
        rows = by_type[analysis_type]
        durations = [
            duration for duration in (
                _elapsed_seconds(row["started_at"], row["completed_at"]) for row in rows
            ) if duration is not None
        ]
        result.append({
            "analysis_type": analysis_type,
            "analysis_type_display": dict(AnalysisType.choices)[analysis_type],
            "queue_depth": sum(1 for row in rows if row["status"] == AiAnalysis.Status.PENDING),
            "running": sum(1 for row in rows if row["status"] == AiAnalysis.Status.RUNNING),
            "failed": sum(1 for row in rows if row["status"] == AiAnalysis.Status.FAILED),
            "avg_duration_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        })
    return result


def _build_ai_service_status(today_rows):
    totals = {analysis_type: {"total": 0, "failed": 0} for analysis_type, _ in AnalysisType.choices}
    for row in today_rows:
        totals[row["analysis_type"]]["total"] += 1
        if row["status"] == AiAnalysis.Status.FAILED:
            totals[row["analysis_type"]]["failed"] += 1

    rows = []
    for label, analysis_type in AI_SERVICE_REGISTRY:
        if analysis_type is None:
            rows.append({"name": label, "status": "UNKNOWN", "detail": NO_SIGNAL})
            continue
        total, failed = totals[analysis_type]["total"], totals[analysis_type]["failed"]
        if total == 0:
            rows.append({"name": label, "status": "UNKNOWN", "detail": "오늘 요청이 없습니다."})
        elif failed == 0:
            rows.append({"name": label, "status": "HEALTHY", "detail": f"오늘 {total}건 처리, 실패 없음"})
        else:
            rows.append({"name": label, "status": "WARNING", "detail": f"오늘 {total}건 중 {failed}건 실패"})
    return rows


def _build_infra_status():
    # Django/PostgreSQL are reported Healthy because this very request only
    # reaches here after both have already served it successfully - a real
    # (if minimal) signal, not a guess. Everything else has no health probe
    # wired up anywhere in the codebase.
    return [
        {"name": "Django", "status": "HEALTHY", "detail": "요청 처리 중"},
        {"name": "PostgreSQL", "status": "HEALTHY", "detail": "쿼리 응답 정상"},
        {"name": "Celery Worker", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "Celery Beat", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "Redis", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "Orthanc", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "Realtime", "status": "UNKNOWN", "detail": NO_SIGNAL},
    ]


def _build_recent_errors():
    """Includes the extra real fields the failure-detail drawer needs
    (case_id, started_at, queued_at, elapsed) - all already on the fetched
    row, no extra queries."""
    rows = (
        AiAnalysis.objects.filter(status=AiAnalysis.Status.FAILED)
        .select_related("case", "case__patient", "case__patient__hospital")
        .order_by("-created_at")[:RECENT_ERROR_LIMIT]
    )
    results = []
    for row in rows:
        failed_at = row.completed_at or row.created_at
        results.append({
            "id": str(row.id),
            "case_id": str(row.case_id),
            "at": failed_at,
            "queued_at": row.created_at,
            "started_at": row.started_at,
            "elapsed_seconds": _elapsed_seconds(row.created_at, failed_at),
            "service": row.get_analysis_type_display(),
            "hospital_name": row.case.patient.hospital.name,
            "message_summary": (row.error_message or "")[:200] or "오류 메시지가 기록되지 않았습니다.",
            "error_message": row.error_message,
            "retry_count": NO_SIGNAL,
            "cloud_run_service": NO_SIGNAL,
        })
    return results


def _short_sha(value):
    return value[:7] if value and value != "local" else value


def _fetch_json(url, path):
    if not url:
        return None
    try:
        with urllib.request.urlopen(f"{url}{path}", timeout=VERSION_PROBE_TIMEOUT_SECONDS) as response:
            return json.loads(response.read())
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        return None


def _build_deploy_versions():
    """Backend reads its own env var directly (no network hop). Frontend and
    Realtime are asked concurrently over the internal docker network, each
    with a short timeout, so a slow/unreachable service can't stall the rest
    of the dashboard load. Nothing here is a new version-tracking system -
    it's the same commit SHA already used as each service's Docker image tag
    (see .github/workflows/deploy-vm.yml), just surfaced over HTTP."""
    with ThreadPoolExecutor(max_workers=2) as executor:
        frontend_future = executor.submit(_fetch_json, settings.FRONTEND_INTERNAL_URL, "/api/version")
        realtime_future = executor.submit(_fetch_json, settings.REALTIME_INTERNAL_URL, "/health")
        frontend_data = frontend_future.result()
        realtime_data = realtime_future.result()

    def _row(name, data, own_sha=None, own_deployed_at=None):
        # own_sha is set only for Backend (read directly, no HTTP call) - for
        # Frontend/Realtime, `data` is None exactly when the probe above
        # failed or timed out, which is the only "unreachable" signal we have.
        reachable = own_sha is not None or data is not None
        sha = own_sha if own_sha is not None else (data or {}).get("commit_sha")
        deployed_at = own_deployed_at if own_deployed_at is not None else (data or {}).get("deployed_at")
        return {
            "name": name,
            "commit_sha": _short_sha(sha) if sha else NO_SIGNAL,
            "full_commit_sha": sha or None,
            "deployed_at": deployed_at,
            "status": "HEALTHY" if reachable else "UNKNOWN",
        }

    return [
        _row("Backend", None, own_sha=settings.GIT_COMMIT_SHA, own_deployed_at=settings.DEPLOYED_AT),
        _row("Frontend", frontend_data),
        _row("Realtime", realtime_data),
    ]


def _build_audit_log():
    rows = AuditLog.objects.select_related("user").order_by("-created_at")[:AUDIT_LOG_LIMIT]
    return [
        {
            "id": str(row.id),
            "actor_name": row.user.name if row.user else "시스템",
            "action_type_display": row.get_action_type_display(),
            "target_table": row.target_table,
            "created_at": row.created_at,
        }
        for row in rows
    ]


def _build_model_versions():
    rows = ModelVersion.objects.order_by("model_name", "-created_at")
    return [
        {
            "id": str(row.id),
            "model_name": row.model_name,
            "version": row.version,
            "analysis_type_display": row.get_analysis_type_display(),
            "applied_scope": "전체 병원 공통",
            "updated_at": row.created_at,
        }
        for row in rows
    ]


def build_system_monitoring_snapshot():
    today_start = _today_start()
    today_rows = _today_ai_rows(today_start)
    today_totals = {
        "total": len(today_rows),
        "failed": sum(1 for row in today_rows if row["status"] == AiAnalysis.Status.FAILED),
    }
    return {
        "kpi": _build_kpi(today_start, today_totals),
        "hospitals_overview": _build_hospitals_overview(today_start),
        "ai_queue_by_type": _build_ai_queue_by_type(today_rows),
        "ai_service_status": _build_ai_service_status(today_rows),
        "infra_status": _build_infra_status(),
        "cloud_run_status": [],
        "cloud_run_note": NO_SIGNAL,
        "recent_errors": _build_recent_errors(),
        "audit_log": _build_audit_log(),
        "deploy_versions": _build_deploy_versions(),
        "model_versions": _build_model_versions(),
    }
