package com.soomit.patient

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.view.View
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetPlugin
import es.antonborri.home_widget.HomeWidgetProvider
import java.util.Calendar

class MedicationWidgetProvider : HomeWidgetProvider() {

    companion object {
        private const val ACTION_MEDICATION_TIME_REACHED =
            "com.soomit.patient.ACTION_MEDICATION_TIME_REACHED"

        private const val ALARM_REQUEST_CODE = 12001
    }

    // =============================================================
    // 일반 위젯 업데이트
    // =============================================================

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        renderWidgets(
            context = context,
            appWidgetManager = appWidgetManager,
            appWidgetIds = appWidgetIds,
            widgetData = widgetData,
        )

        scheduleMedicationAlarm(
            context = context,
            widgetData = widgetData,
        )
    }

    // =============================================================
    // 복약시간 도달 알람 수신
    // =============================================================

    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        if (
            intent.action ==
            ACTION_MEDICATION_TIME_REACHED
        ) {
            val widgetData =
                HomeWidgetPlugin.getData(
                    context
                )

            val appWidgetManager =
                AppWidgetManager.getInstance(
                    context
                )

            val componentName =
                ComponentName(
                    context,
                    MedicationWidgetProvider::class.java,
                )

            val appWidgetIds =
                appWidgetManager.getAppWidgetIds(
                    componentName
                )

            renderWidgets(
                context = context,
                appWidgetManager = appWidgetManager,
                appWidgetIds = appWidgetIds,
                widgetData = widgetData,
            )

            return
        }

        super.onReceive(
            context,
            intent,
        )
    }

    // =============================================================
    // 실제 UI 렌더링
    // =============================================================

    private fun renderWidgets(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
        widgetData: SharedPreferences,
    ) {
        appWidgetIds.forEach { appWidgetId ->

            val hasSchedule =
                widgetData.getBoolean(
                    "medication_has_schedule",
                    false
                )

            val medicationName =
                widgetData.getString(
                    "medication_name",
                    ""
                ) ?: ""

            val medicationTime =
                widgetData.getString(
                    "medication_time",
                    ""
                ) ?: ""

            val savedStatus =
                widgetData.getString(
                    "medication_status",
                    "empty"
                ) ?: "empty"

            val takenCount =
                widgetData.getInt(
                    "medication_taken_count",
                    0
                )

            val totalCount =
                widgetData.getInt(
                    "medication_total_count",
                    0
                )

            val progressText =
                widgetData.getString(
                    "medication_progress_text",
                    ""
                ) ?: ""

            // -----------------------------------------------------
            // 앱이 닫혀 있어도 현재 시각 기준 상태 재판단
            // -----------------------------------------------------

            val status =
                resolveCurrentStatus(
                    savedStatus = savedStatus,
                    medicationTime = medicationTime,
                )

            val views =
                RemoteViews(
                    context.packageName,
                    R.layout.medication_widget
                )

            // =====================================================
            // PROGRESS
            // =====================================================

            val progressPercent =
                if (totalCount > 0) {
                    (
                        takenCount
                            .toFloat()
                            .div(totalCount)
                            .times(100)
                    )
                        .toInt()
                        .coerceIn(
                            0,
                            100
                        )
                } else {
                    0
                }

            views.setProgressBar(
                R.id.widgetProgressBar,
                100,
                progressPercent,
                false
            )

            views.setTextViewText(
                R.id.widgetProgress,
                progressText
            )

            // =====================================================
            // 초기화
            // =====================================================

            views.setViewVisibility(
                R.id.widgetMedicationTime,
                View.GONE
            )

            views.setViewVisibility(
                R.id.widgetMessage,
                View.GONE
            )

            views.setViewVisibility(
                R.id.widgetProgress,
                View.VISIBLE
            )

            views.setViewVisibility(
                R.id.widgetProgressPercent,
                View.GONE
            )

            views.setViewVisibility(
                R.id.widgetProgressBar,
                View.VISIBLE
            )

            // =====================================================
            // 일정 없음
            // =====================================================

            if (!hasSchedule) {

                views.setTextViewText(
                    R.id.widgetStatus,
                    "오늘 일정 없음"
                )

                views.setTextColor(
                    R.id.widgetStatus,
                    Color.parseColor("#8A96A3")
                )

                views.setTextViewText(
                    R.id.widgetMedicationName,
                    "오늘은 복약 일정이 없어요"
                )

                views.setTextColor(
                    R.id.widgetMedicationName,
                    Color.parseColor("#202A35")
                )

                views.setViewVisibility(
                    R.id.widgetMessage,
                    View.VISIBLE
                )

                views.setTextViewText(
                    R.id.widgetMessage,
                    "편안한 하루 보내세요"
                )

                views.setTextColor(
                    R.id.widgetMessage,
                    Color.parseColor("#8A96A3")
                )

                views.setViewVisibility(
                    R.id.widgetProgress,
                    View.GONE
                )

                views.setViewVisibility(
                    R.id.widgetProgressBar,
                    View.GONE
                )

            } else {

                // =================================================
                // 공통 약 이름
                // =================================================

                views.setTextViewText(
                    R.id.widgetMedicationName,
                    medicationName
                )

                views.setTextColor(
                    R.id.widgetMedicationName,
                    Color.parseColor("#202A35")
                )

                // =================================================
                // 복약 예정
                // =================================================

                if (status == "upcoming") {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "●  복약 예정"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#3478F6")
                    )

                    views.setViewVisibility(
                        R.id.widgetMedicationTime,
                        View.VISIBLE
                    )

                    views.setTextViewText(
                        R.id.widgetMedicationTime,
                        medicationTime
                    )

                    views.setTextColor(
                        R.id.widgetMedicationTime,
                        Color.parseColor("#3478F6")
                    )
                }

                // =================================================
                // 복용 확인 필요
                // =================================================

                else if (
                    status == "missed"
                ) {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "!  복용 확인 필요"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#F05B67")
                    )

                    views.setViewVisibility(
                        R.id.widgetMedicationTime,
                        View.VISIBLE
                    )

                    views.setTextViewText(
                        R.id.widgetMedicationTime,
                        medicationTime
                    )

                    views.setTextColor(
                        R.id.widgetMedicationTime,
                        Color.parseColor("#F05B67")
                    )

                    views.setViewVisibility(
                        R.id.widgetMessage,
                        View.VISIBLE
                    )

                    views.setTextViewText(
                        R.id.widgetMessage,
                        "복용 여부를 확인해 주세요"
                    )

                    views.setTextColor(
                        R.id.widgetMessage,
                        Color.parseColor("#F05B67")
                    )
                }

                // =================================================
                // 일부 복용 완료
                // =================================================

                else if (
                    status == "taken"
                ) {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "✓  복용 완료"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#18A874")
                    )

                    views.setViewVisibility(
                        R.id.widgetMessage,
                        View.VISIBLE
                    )

                    val message =
                        if (
                            medicationTime.isNotBlank()
                        ) {
                            "$medicationTime 일정 복용을 완료했어요"
                        } else {
                            "복용 기록을 완료했어요"
                        }

                    views.setTextViewText(
                        R.id.widgetMessage,
                        message
                    )

                    views.setTextColor(
                        R.id.widgetMessage,
                        Color.parseColor("#5F6C79")
                    )
                }

                // =================================================
                // 전체 복용 완료
                // =================================================

                else if (
                    status == "completed" ||
                    status == "finished"
                ) {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "✓  복용 완료"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#18A874")
                    )

                    views.setViewVisibility(
                        R.id.widgetMessage,
                        View.VISIBLE
                    )

                    val message =
                        if (
                            medicationTime.isNotBlank()
                        ) {
                            "$medicationTime 일정 복용을 완료했어요"
                        } else {
                            "오늘 복약을 모두 완료했어요"
                        }

                    views.setTextViewText(
                        R.id.widgetMessage,
                        message
                    )

                    views.setTextColor(
                        R.id.widgetMessage,
                        Color.parseColor("#5F6C79")
                    )

                    views.setProgressBar(
                        R.id.widgetProgressBar,
                        100,
                        100,
                        false
                    )
                }

                // =================================================
                // 건너뜀
                // =================================================

                else if (
                    status == "skipped"
                ) {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "복용 건너뜀"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#8A96A3")
                    )

                    views.setViewVisibility(
                        R.id.widgetMessage,
                        View.VISIBLE
                    )

                    views.setTextViewText(
                        R.id.widgetMessage,
                        "복용하지 않은 일정이에요"
                    )

                    views.setTextColor(
                        R.id.widgetMessage,
                        Color.parseColor("#8A96A3")
                    )
                }

                // =================================================
                // 기타
                // =================================================

                else {

                    views.setTextViewText(
                        R.id.widgetStatus,
                        "오늘의 복약"
                    )

                    views.setTextColor(
                        R.id.widgetStatus,
                        Color.parseColor("#3478F6")
                    )
                }
            }

            // =====================================================
            // 위젯 클릭 → 복약관리 탭
            // =====================================================

            val pendingIntent =
                HomeWidgetLaunchIntent.getActivity(
                    context,
                    MainActivity::class.java,
                    Uri.parse(
                        "soomit://medication"
                    )
                )

            views.setOnClickPendingIntent(
                R.id.widgetRoot,
                pendingIntent
            )

            appWidgetManager.updateAppWidget(
                appWidgetId,
                views
            )
        }
    }

    // =============================================================
    // 저장된 상태 + 현재 시간으로 실제 표시 상태 결정
    // =============================================================

    private fun resolveCurrentStatus(
        savedStatus: String,
        medicationTime: String,
    ): String {

        // 이미 결과가 확정된 상태는 시간으로 바꾸면 안 됨
        if (
            savedStatus == "taken" ||
            savedStatus == "completed" ||
            savedStatus == "finished" ||
            savedStatus == "skipped"
        ) {
            return savedStatus
        }

        if (
            savedStatus == "missed"
        ) {
            return "missed"
        }

        if (
            medicationTime.isBlank()
        ) {
            return savedStatus
        }

        val parts =
            medicationTime.split(":")

        if (
            parts.size < 2
        ) {
            return savedStatus
        }

        val hour =
            parts[0].toIntOrNull()
                ?: return savedStatus

        val minute =
            parts[1].toIntOrNull()
                ?: return savedStatus

        val now =
            Calendar.getInstance()

        val currentMinutes =
            now.get(
                Calendar.HOUR_OF_DAY
            ) * 60 +
            now.get(
                Calendar.MINUTE
            )

        val scheduledMinutes =
            hour * 60 +
            minute

        return if (
            currentMinutes >=
            scheduledMinutes
        ) {
            "missed"
        } else {
            "upcoming"
        }
    }

    // =============================================================
    // 복약 시간에 위젯 갱신 알람 예약
    // =============================================================

    private fun scheduleMedicationAlarm(
        context: Context,
        widgetData: SharedPreferences,
    ) {

        cancelMedicationAlarm(
            context
        )

        val hasSchedule =
            widgetData.getBoolean(
                "medication_has_schedule",
                false
            )

        if (!hasSchedule) {
            return
        }

        val status =
            widgetData.getString(
                "medication_status",
                ""
            ) ?: ""

        // 이미 끝난 일정이면 예약 불필요
        if (
            status == "taken" ||
            status == "completed" ||
            status == "finished" ||
            status == "skipped" ||
            status == "missed"
        ) {
            return
        }

        val medicationTime =
            widgetData.getString(
                "medication_time",
                ""
            ) ?: ""

        val parts =
            medicationTime.split(":")

        if (
            parts.size < 2
        ) {
            return
        }

        val hour =
            parts[0].toIntOrNull()
                ?: return

        val minute =
            parts[1].toIntOrNull()
                ?: return

        val now =
            Calendar.getInstance()

        val target =
            Calendar.getInstance().apply {
                set(
                    Calendar.HOUR_OF_DAY,
                    hour
                )

                set(
                    Calendar.MINUTE,
                    minute
                )

                set(
                    Calendar.SECOND,
                    1
                )

                set(
                    Calendar.MILLISECOND,
                    0
                )
            }

        // 이미 시간이 지난 경우 즉시 상태 재계산되므로
        // 새 알람을 만들 필요 없음
        if (
            target.timeInMillis <=
            now.timeInMillis
        ) {
            return
        }

        val alarmManager =
            context.getSystemService(
                Context.ALARM_SERVICE
            ) as AlarmManager

        val intent =
            Intent(
                context,
                MedicationWidgetProvider::class.java
            ).apply {
                action =
                    ACTION_MEDICATION_TIME_REACHED
            }

        val pendingIntent =
            PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or
                    PendingIntent.FLAG_IMMUTABLE
            )

        alarmManager.setAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            target.timeInMillis,
            pendingIntent
        )
    }

    // =============================================================
    // 기존 알람 취소
    // =============================================================

    private fun cancelMedicationAlarm(
        context: Context,
    ) {

        val alarmManager =
            context.getSystemService(
                Context.ALARM_SERVICE
            ) as AlarmManager

        val intent =
            Intent(
                context,
                MedicationWidgetProvider::class.java
            ).apply {
                action =
                    ACTION_MEDICATION_TIME_REACHED
            }

        val pendingIntent =
            PendingIntent.getBroadcast(
                context,
                ALARM_REQUEST_CODE,
                intent,
                PendingIntent.FLAG_NO_CREATE or
                    PendingIntent.FLAG_IMMUTABLE
            )

        if (
            pendingIntent != null
        ) {
            alarmManager.cancel(
                pendingIntent
            )

            pendingIntent.cancel()
        }
    }
}git status