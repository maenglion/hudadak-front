package app.netlify.app_hudadak.twa.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import app.netlify.app_hudadak.twa.MainActivity
import app.netlify.app_hudadak.twa.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AirWidgetProvider : AppWidgetProvider() {

    override fun onEnabled(context: Context) {
        WidgetWorkScheduler.ensurePeriodic(context)
        WidgetWorkScheduler.enqueueAutomatic(
            context,
            WidgetWorkScheduler.TRIGGER_WIDGET_ENABLED
        )
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
        WidgetWorkScheduler.ensurePeriodic(context)
        WidgetWorkScheduler.enqueueAutomatic(
            context,
            WidgetWorkScheduler.TRIGGER_WIDGET_UPDATE
        )
    }

    override fun onDisabled(context: Context) {
        if (!WidgetWorkScheduler.hasInstalledWidgets(context)) {
            WidgetWorkScheduler.cancelAll(context)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == ACTION_MANUAL_REFRESH) {
            val enqueued = WidgetWorkScheduler.enqueueManual(context)
            Log.i(TAG, "AUDIT manual_widget_refresh_enqueued=$enqueued")
        }
    }

    companion object {

        fun pm10Grade(v: Double?): String = when {
            v == null  -> "--"
            v <= 30.0  -> "좋음"
            v <= 80.0  -> "보통"
            v <= 150.0 -> "나쁨"
            else       -> "매우나쁨"
        }

        fun pm25Grade(v: Double?): String = when {
            v == null -> "--"
            v <= 15.0 -> "좋음"
            v <= 35.0 -> "보통"
            v <= 75.0 -> "나쁨"
            else      -> "매우나쁨"
        }

        // 다크모드 CSS SCALE dark 첫번째 색상
        private fun gradeTextColor(grade: String): Int = when (grade) {
            "좋음"    -> Color.parseColor("#FF367BB8")
            "보통"    -> Color.parseColor("#FF629473")
            "나쁨"    -> Color.parseColor("#FFF6AA5C")
            "매우나쁨" -> Color.parseColor("#FFC75959")
            else      -> Color.parseColor("#FF888888")
        }

        private fun parseRegion(raw: String): String =
            raw.replace(
                Regex("^WAQI\\s+", RegexOption.IGNORE_CASE),
                ""
            ).trim()

        /** 등급에 맞는 바 ID만 VISIBLE, 나머지 GONE */
        private fun setBarVisibility(
            views: RemoteViews,
            grade: String,
            goodId: Int, normalId: Int, badId: Int, verybadId: Int,
            progress: Int, max: Int
        ) {
            val allIds = listOf(goodId, normalId, badId, verybadId)
            val activeId = when (grade) {
                "좋음"    -> goodId
                "보통"    -> normalId
                "나쁨"    -> badId
                "매우나쁨" -> verybadId
                else      -> normalId
            }
            for (id in allIds) {
                views.setViewVisibility(id, if (id == activeId) View.VISIBLE else View.GONE)
                if (id == activeId) {
                    views.setProgressBar(id, max, progress.coerceIn(0, max), false)
                }
            }
        }

        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs     = context.getSharedPreferences(WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE)
            val region    = prefs.getString(WidgetDataStore.KEY_REGION, "위치 확인 중...") ?: "위치 확인 중..."
            val pm10      = prefs.getFloat(WidgetDataStore.KEY_PM10, Float.NaN).let { if (it.isNaN()) null else it.toDouble() }
            val pm25      = prefs.getFloat(WidgetDataStore.KEY_PM25, Float.NaN).let { if (it.isNaN()) null else it.toDouble() }
            val pm10Provider = WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM10_PROVIDER, WidgetDataStore.KEY_PROVIDER
            )
            val pm10DisplayTs = WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM10_DISPLAY_TS, WidgetDataStore.KEY_DISPLAY_TS
            )
            val pm25Provider = WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM25_PROVIDER, WidgetDataStore.KEY_PROVIDER
            )
            val pm25DisplayTs = WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM25_DISPLAY_TS, WidgetDataStore.KEY_DISPLAY_TS
            )

            val pm10GradeStr = pm10Grade(pm10)
            val pm25GradeStr = pm25Grade(pm25)

            val views = RemoteViews(context.packageName, R.layout.widget_air)

            // 지역명
            views.setTextViewText(R.id.widget_region, parseRegion(region))

            // PM10 등급 텍스트 (등급 색상, 박스 없음)
            views.setTextViewText(R.id.widget_pm10_grade, pm10GradeStr)
            views.setInt(R.id.widget_pm10_grade, "setTextColor", gradeTextColor(pm10GradeStr))
            views.setTextViewText(R.id.widget_pm10_value, if (pm10 != null) "${pm10.toInt()} µg/m³" else "--")

            // PM10 바 (등급에 따라 하나만 VISIBLE)
            setBarVisibility(
                views, pm10GradeStr,
                R.id.widget_pm10_bar_good, R.id.widget_pm10_bar_normal,
                R.id.widget_pm10_bar_bad, R.id.widget_pm10_bar_verybad,
                pm10?.toInt() ?: 0, 200
            )

            // PM2.5 등급 텍스트
            views.setTextViewText(R.id.widget_pm25_grade, pm25GradeStr)
            views.setInt(R.id.widget_pm25_grade, "setTextColor", gradeTextColor(pm25GradeStr))
            views.setTextViewText(R.id.widget_pm25_value, if (pm25 != null) "${pm25.toInt()} µg/m³" else "--")

            // PM2.5 바
            setBarVisibility(
                views, pm25GradeStr,
                R.id.widget_pm25_bar_good, R.id.widget_pm25_bar_normal,
                R.id.widget_pm25_bar_bad, R.id.widget_pm25_bar_verybad,
                pm25?.toInt() ?: 0, 150
            )

            val timeFormat = SimpleDateFormat("HH:mm", Locale.KOREA).apply {
                timeZone = java.util.TimeZone.getTimeZone("Asia/Seoul")
            }
            fun metadataText(displayTs: String?, provider: String?): String {
                val millis = WidgetRules.parseDisplayTimestamp(displayTs)
                val time = millis?.let { timeFormat.format(Date(it)) } ?: "--:--"
                return "$time · ${WidgetRules.providerDisplayName(provider) ?: "출처 미상"}"
            }
            val pm10Metadata = metadataText(pm10DisplayTs, pm10Provider)
            val pm25Metadata = metadataText(pm25DisplayTs, pm25Provider)
            views.setTextViewText(R.id.widget_updated_at, "항목별 최신 실측값")
            views.setTextViewText(R.id.widget_pm10_meta, pm10Metadata)
            views.setTextViewText(R.id.widget_pm25_meta, pm25Metadata)
            views.setContentDescription(
                R.id.widget_pm10_section,
                "미세먼지 ${pm10?.toInt() ?: "--"} 마이크로그램, " +
                    "$pm10GradeStr, ${WidgetRules.providerDisplayName(pm10Provider) ?: "출처 미상"}, " +
                    "${pm10Metadata.substringBefore(" · ")} 측정"
            )
            views.setContentDescription(
                R.id.widget_pm25_section,
                "초미세먼지 ${pm25?.toInt() ?: "--"} 마이크로그램, " +
                    "$pm25GradeStr, ${WidgetRules.providerDisplayName(pm25Provider) ?: "출처 미상"}, " +
                    "${pm25Metadata.substringBefore(" · ")} 측정"
            )

            // 터치 → 앱 실행
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_header, pendingIntent)

            val refreshIntent = Intent(context, AirWidgetProvider::class.java).apply {
                action = ACTION_MANUAL_REFRESH
            }
            val refreshPendingIntent = PendingIntent.getBroadcast(
                context,
                appWidgetId,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent)
            views.setContentDescription(
                R.id.widget_refresh,
                context.getString(R.string.widget_refresh_description)
            )

            appWidgetManager.updateAppWidget(appWidgetId, views)
            Log.i(
                TAG,
                "AUDIT remote_views_applied_at_ms=${System.currentTimeMillis()} " +
                    "widget_id=$appWidgetId pm10_ts=${pm10DisplayTs ?: "null"} " +
                    "pm25_ts=${pm25DisplayTs ?: "null"}"
            )
        }

        private const val TAG = "AirWidgetProvider"
        const val ACTION_MANUAL_REFRESH =
            "app.netlify.app_hudadak.twa.action.MANUAL_WIDGET_REFRESH"
    }
}
