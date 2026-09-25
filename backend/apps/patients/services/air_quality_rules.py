GRADE_GOOD = "GOOD"
GRADE_NORMAL = "NORMAL"
GRADE_BAD = "BAD"
GRADE_VERY_BAD = "VERY_BAD"

ALERT_ADVISORY = "ADVISORY"
ALERT_WARNING = "WARNING"

GRADE_RISK = {
    GRADE_GOOD: 0,
    GRADE_NORMAL: 1,
    GRADE_BAD: 2,
    GRADE_VERY_BAD: 3,
}

GUIDANCE = {
    GRADE_GOOD: {
        "title": "대기질 좋음",
        "message": "현재 대기질이 좋습니다. 평소와 같이 활동하셔도 됩니다.",
    },
    GRADE_NORMAL: {
        "title": "대기질 보통",
        "message": (
            "현재 대기질은 보통 수준입니다. 호흡기 질환자는 장시간 "
            "야외활동 시 몸 상태를 확인해주세요."
        ),
    },
    GRADE_BAD: {
        "title": "호흡기 건강 주의",
        "message": (
            "현재 미세먼지 또는 초미세먼지가 나쁨 수준입니다. 호흡기 "
            "질환자는 장시간 또는 무리한 실외활동을 줄이고, 외출 시 "
            "대기질 상태를 확인해주세요."
        ),
    },
    GRADE_VERY_BAD: {
        "title": "호흡기 건강 경고",
        "message": (
            "현재 미세먼지 또는 초미세먼지가 매우 나쁨 수준입니다. "
            "호흡기 질환자는 가급적 실내에서 활동하고, 불필요한 외출과 "
            "장시간 실외활동을 피해주세요."
        ),
    },
}

ALERT_GUIDANCE = {
    ALERT_ADVISORY: {
        "title": "미세먼지 주의보",
        "message": (
            "현재 지역에 미세먼지 주의보가 발령되었습니다. 호흡기 질환자는 "
            "장시간 야외활동과 불필요한 외출을 줄여주세요."
        ),
    },
    ALERT_WARNING: {
        "title": "미세먼지 경보",
        "message": (
            "현재 지역에 미세먼지 경보가 발령되었습니다. 호흡기 질환자는 "
            "가급적 실내에서 활동하고 외출을 최소화해주세요."
        ),
    },
}


def grade_pm10(value):
    return _grade(value, good_max=30, normal_max=80, bad_max=150)


def grade_pm25(value):
    return _grade(value, good_max=15, normal_max=35, bad_max=75)


def build_air_quality_guidance(*, pm10, pm25, alert_type=None):
    pm10_grade = grade_pm10(pm10)
    pm25_grade = grade_pm25(pm25)
    measured_grades = [grade for grade in (pm10_grade, pm25_grade) if grade]
    if not measured_grades:
        raise ValueError("PM10 또는 PM2.5 측정값이 필요합니다.")

    final_grade = max(measured_grades, key=GRADE_RISK.get)
    normalized_alert = _normalize_alert_type(alert_type)

    if normalized_alert == ALERT_WARNING:
        final_grade = GRADE_VERY_BAD
    elif normalized_alert == ALERT_ADVISORY:
        final_grade = max(
            (final_grade, GRADE_BAD),
            key=GRADE_RISK.get,
        )

    guidance = (
        ALERT_GUIDANCE[normalized_alert]
        if normalized_alert
        else GUIDANCE[final_grade]
    )
    return {
        "pm10": pm10,
        "pm25": pm25,
        "pm10_grade": pm10_grade,
        "pm25_grade": pm25_grade,
        "final_grade": final_grade,
        "alert_type": normalized_alert,
        "title": guidance["title"],
        "message": guidance["message"],
    }


def _grade(value, *, good_max, normal_max, bad_max):
    if value is None:
        return None
    if value < 0:
        raise ValueError("미세먼지 측정값은 0 이상이어야 합니다.")
    if value <= good_max:
        return GRADE_GOOD
    if value <= normal_max:
        return GRADE_NORMAL
    if value <= bad_max:
        return GRADE_BAD
    return GRADE_VERY_BAD


def _normalize_alert_type(alert_type):
    if not alert_type:
        return None
    normalized = str(alert_type).strip().upper()
    if normalized in {ALERT_WARNING, "경보"}:
        return ALERT_WARNING
    if normalized in {ALERT_ADVISORY, "주의보"}:
        return ALERT_ADVISORY
    return None
