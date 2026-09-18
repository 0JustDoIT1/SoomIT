"""Read-only aggregate data for the hospital-admin "병원 운영 모니터링" dashboard.

Every number here is computed from tables that already exist (AiAnalysis,
ExaminationOrder, AuditLog, NotificationLog, User) - no new tables, and
nothing is fabricated. Where no real signal exists (e.g. Orthanc/Realtime
health), that is reported explicitly rather than guessed at.

Query shape is deliberately aggregate-first (values().annotate(), Count with
filter=) rather than one .count()/query per status or per section, so this
stays O(1) queries per section regardless of how much history a hospital has
accumulated.
"""

from django.db.models import Count, Q
from django.utils import timezone

from apps.ai_results.models import AiAnalysis, AnalysisType
from apps.audit.models import AuditLog
from apps.cases.models import ExaminationOrder
from apps.notifications.models import NotificationLog

from ..models import User

NO_SIGNAL = "연결 필요"

RECENT_REQUEST_LIMIT = 20
FAILED_REQUEST_LIMIT = 10
ACTIVITY_LOG_LIMIT = 15
RECENT_EVENTS_LIMIT = 10
PERFORMANCE_SAMPLE_LIMIT = 50


def _today_start():
    now = timezone.now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _elapsed_seconds(start, end):
    if not start or not end:
        return None
    return max((end - start).total_seconds(), 0)


def _analysis_scope(hospital_id):
    return AiAnalysis.objects.filter(case__patient__hospital_id=hospital_id)


def _today_status_counts(hospital_id, today_start):
    """One aggregate query covering both the KPI cards and the AI Queue
    section - both only ever need "how many of each status were created
    today", so there is no reason to ask the DB twice."""
    rows = (
        _analysis_scope(hospital_id)
        .filter(created_at__gte=today_start)
        .values("status")
        .annotate(count=Count("id"))
    )
    counts = {row["status"]: row["count"] for row in rows}
    return {status_value: counts.get(status_value, 0) for status_value, _ in AiAnalysis.Status.choices}


def _build_kpi(hospital_id, today_start, today_status_counts):
    backlog = _analysis_scope(hospital_id).aggregate(
        queued=Count("id", filter=Q(status=AiAnalysis.Status.PENDING)),
        running=Count("id", filter=Q(status=AiAnalysis.Status.RUNNING)),
    )
    return {
        "ai_queued": backlog["queued"],
        "ai_running": backlog["running"],
        "ai_succeeded_today": today_status_counts[AiAnalysis.Status.SUCCEEDED],
        "ai_failed_today": today_status_counts[AiAnalysis.Status.FAILED],
        "exams_today": ExaminationOrder.objects.filter(
            case__patient__hospital_id=hospital_id, created_at__gte=today_start,
        ).count(),
        "active_staff": User.objects.filter(
            department_role__department__hospital_id=hospital_id,
            account_status=User.AccountStatus.ACTIVE,
        ).count(),
    }


def _build_recent_ai_requests(hospital_id):
    rows = (
        _analysis_scope(hospital_id)
        .select_related("case", "case__patient")
        .order_by("-created_at")[:RECENT_REQUEST_LIMIT]
    )
    requests = []
    for row in rows:
        requests.append({
            "id": str(row.id),
            "case_code": row.case.case_code,
            "patient_name": row.case.patient.name,
            "analysis_type": row.analysis_type,
            "analysis_type_display": row.get_analysis_type_display(),
            "requested_at": row.created_at,
            "status": row.status,
            "wait_seconds": _elapsed_seconds(row.created_at, row.started_at),
            "duration_seconds": _elapsed_seconds(row.started_at, row.completed_at),
        })
    return requests


def _build_exam_summary(hospital_id, today_start):
    rows = (
        ExaminationOrder.objects.filter(case__patient__hospital_id=hospital_id, created_at__gte=today_start)
        .values("order_type", "status")
        .annotate(count=Count("id"))
    )
    summary = {}
    for order_type, _ in ExaminationOrder.OrderType.choices:
        summary[order_type] = {status_value: 0 for status_value, _ in ExaminationOrder.Status.choices}
    for row in rows:
        summary[row["order_type"]][row["status"]] = row["count"]
    return [
        {
            "order_type": order_type,
            "order_type_display": dict(ExaminationOrder.OrderType.choices)[order_type],
            **{status_value.lower(): summary[order_type][status_value] for status_value, _ in ExaminationOrder.Status.choices},
        }
        for order_type, _ in ExaminationOrder.OrderType.choices
    ]


def _build_failed_requests(hospital_id):
    """Includes every real AiAnalysis field the failure-detail drawer can show
    - nothing here is invented; retry_count/service are explicitly flagged as
    NO_SIGNAL because no such tracking exists in the schema."""
    rows = (
        _analysis_scope(hospital_id)
        .filter(status=AiAnalysis.Status.FAILED)
        .select_related("case")
        .order_by("-created_at")[:FAILED_REQUEST_LIMIT]
    )
    results = []
    for row in rows:
        failed_at = row.completed_at or row.created_at
        results.append({
            "id": str(row.id),
            "case_id": str(row.case_id),
            "case_code": row.case.case_code,
            "analysis_type": row.analysis_type,
            "analysis_type_display": row.get_analysis_type_display(),
            "queued_at": row.created_at,
            "started_at": row.started_at,
            "failed_at": failed_at,
            "elapsed_seconds": _elapsed_seconds(row.created_at, failed_at),
            "error_summary": (row.error_message or "")[:200] or "오류 메시지가 기록되지 않았습니다.",
            "error_message": row.error_message,
            "retry_count": NO_SIGNAL,
            "cloud_run_service": NO_SIGNAL,
            "retry_available": False,
        })
    return results


def _build_activity_log(hospital_id):
    rows = (
        AuditLog.objects.filter(
            Q(user__department_role__department__hospital_id=hospital_id)
            | Q(case__patient__hospital_id=hospital_id),
        )
        .select_related("user")
        .order_by("-created_at")[:ACTIVITY_LOG_LIMIT]
    )
    return [
        {
            "id": str(row.id),
            "actor_name": row.user.name if row.user else "시스템",
            "action_type": row.action_type,
            "action_type_display": row.get_action_type_display(),
            "target_table": row.target_table,
            "created_at": row.created_at,
        }
        for row in rows
    ]


def _build_staff_overview_and_list(hospital_id):
    """One query drives both the compact "병원 사용자 현황" summary numbers
    and the sample list, instead of separate count() calls per number."""
    active_users = User.objects.filter(
        department_role__department__hospital_id=hospital_id,
    ).select_related("department_role__department").order_by("name", "login_id")

    total = 0
    active = 0
    department_ids = set()
    # User.last_login (from AbstractBaseUser) is never written anywhere in
    # this codebase - staff login goes through a custom JWT view that never
    # calls update_last_login - so this is genuinely NO_SIGNAL, not a
    # shortcut. Left as None (rather than NO_SIGNAL string) since the
    # frontend already renders null timestamps as "없음".
    last_login_at = None
    staff_rows = []
    for row in active_users:
        total += 1
        if row.account_status == User.AccountStatus.ACTIVE:
            active += 1
        if row.department_role:
            department_ids.add(row.department_role.department_id)
        staff_rows.append({
            "id": str(row.id),
            "name": row.name,
            "department_name": row.department_role.department.name if row.department_role else "-",
            "role_display_name": row.department_role.display_name if row.department_role else "-",
            "account_status": row.account_status,
        })

    return (
        {
            "total_staff": total,
            "active_staff": active,
            "department_count": len(department_ids),
            "last_login_at": last_login_at,
        },
        staff_rows,
    )


def _build_integrations(hospital_id, today_start):
    ai_today = _analysis_scope(hospital_id).filter(created_at__gte=today_start).aggregate(
        total=Count("id"),
        failed=Count("id", filter=Q(status=AiAnalysis.Status.FAILED)),
    )
    ai_total, ai_failed = ai_today["total"], ai_today["failed"]
    if ai_total == 0:
        ai_status, ai_detail = "UNKNOWN", "오늘 AI 요청이 없습니다."
    elif ai_failed == 0:
        ai_status, ai_detail = "HEALTHY", f"오늘 {ai_total}건 처리, 실패 없음"
    else:
        ai_status, ai_detail = "WARNING", f"오늘 {ai_total}건 중 {ai_failed}건 실패"

    notif_today = NotificationLog.objects.filter(
        recipient_user__department_role__department__hospital_id=hospital_id,
        created_at__gte=today_start,
    ).aggregate(
        total=Count("id"),
        failed=Count("id", filter=Q(delivery_status=NotificationLog.DeliveryStatus.FAILED)),
    )
    notif_total, notif_failed = notif_today["total"], notif_today["failed"]
    if notif_total == 0:
        notif_status, notif_detail = "UNKNOWN", "오늘 발송 이력이 없습니다."
    elif notif_failed == 0:
        notif_status, notif_detail = "HEALTHY", f"오늘 {notif_total}건 발송, 실패 없음"
    else:
        notif_status, notif_detail = "WARNING", f"오늘 {notif_total}건 중 {notif_failed}건 실패"

    return [
        {"name": "Orthanc", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "AI Service", "status": ai_status, "detail": ai_detail},
        {"name": "Realtime", "status": "UNKNOWN", "detail": NO_SIGNAL},
        {"name": "Notification", "status": notif_status, "detail": notif_detail},
    ]


def _build_performance(hospital_id):
    completed = (
        _analysis_scope(hospital_id)
        .filter(status__in=[AiAnalysis.Status.SUCCEEDED, AiAnalysis.Status.FAILED], started_at__isnull=False, completed_at__isnull=False)
        .order_by("-created_at")[:PERFORMANCE_SAMPLE_LIMIT]
    )
    durations = []
    waits = []
    by_type = {}
    for row in completed:
        duration = _elapsed_seconds(row.started_at, row.completed_at)
        wait = _elapsed_seconds(row.created_at, row.started_at)
        if duration is not None:
            durations.append(duration)
            by_type.setdefault(row.analysis_type, []).append(duration)
        if wait is not None:
            waits.append(wait)

    def _avg(values):
        return round(sum(values) / len(values), 1) if values else None

    return {
        "ai_avg_duration_seconds": _avg(durations),
        "ai_avg_wait_seconds": _avg(waits),
        "sample_size": len(durations),
        "by_type": [
            {
                "analysis_type": analysis_type,
                "analysis_type_display": dict(AnalysisType.choices)[analysis_type],
                "avg_duration_seconds": _avg(values),
                "sample_size": len(values),
            }
            for analysis_type, values in by_type.items()
        ],
    }


def _build_recent_events(hospital_id):
    events = []
    for row in _analysis_scope(hospital_id).order_by("-created_at")[:RECENT_EVENTS_LIMIT]:
        if row.status == AiAnalysis.Status.FAILED and row.completed_at:
            events.append(("분석 실패", row.get_analysis_type_display(), row.completed_at))
        elif row.status == AiAnalysis.Status.SUCCEEDED and row.completed_at:
            events.append(("분석 완료", row.get_analysis_type_display(), row.completed_at))
        elif row.started_at:
            events.append(("분석 시작", row.get_analysis_type_display(), row.started_at))
        else:
            events.append(("분석 요청", row.get_analysis_type_display(), row.created_at))

    for row in User.objects.filter(
        department_role__department__hospital_id=hospital_id,
    ).order_by("-created_at")[:5]:
        events.append(("계정 생성", row.name, row.created_at))

    events.sort(key=lambda item: item[2], reverse=True)
    return [
        {"label": label, "detail": detail, "at": at}
        for label, detail, at in events[:RECENT_EVENTS_LIMIT]
    ]


def build_hospital_monitoring_snapshot(hospital):
    today_start = _today_start()
    today_status_counts = _today_status_counts(hospital.id, today_start)
    staff_overview, staff_rows = _build_staff_overview_and_list(hospital.id)
    return {
        "hospital": {"id": str(hospital.id), "name": hospital.name, "code": hospital.code},
        "kpi": _build_kpi(hospital.id, today_start, today_status_counts),
        "ai_queue_summary": today_status_counts,
        "recent_ai_requests": _build_recent_ai_requests(hospital.id),
        "exam_summary": _build_exam_summary(hospital.id, today_start),
        "failed_requests": _build_failed_requests(hospital.id),
        "activity_log": _build_activity_log(hospital.id),
        "staff_overview": staff_overview,
        "staff": staff_rows,
        "integrations": _build_integrations(hospital.id, today_start),
        "performance": _build_performance(hospital.id),
        "recent_events": _build_recent_events(hospital.id),
    }
