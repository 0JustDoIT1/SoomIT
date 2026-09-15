const Duration koreaUtcOffset = Duration(hours: 9);

/// Asia/Seoul은 현재 일광 절약 시간 없이 UTC+9를 사용한다.
DateTime toKoreaTime(DateTime dateTime) {
  return dateTime.toUtc().add(koreaUtcOffset);
}

String koreaDateKey(DateTime dateTime) {
  final koreaTime = toKoreaTime(dateTime);
  final year = koreaTime.year.toString().padLeft(4, '0');
  final month = koreaTime.month.toString().padLeft(2, '0');
  final day = koreaTime.day.toString().padLeft(2, '0');
  return '$year-$month-$day';
}
