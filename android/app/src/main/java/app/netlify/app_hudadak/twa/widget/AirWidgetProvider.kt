package app.netlify.app_hudadak.twa.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import app.netlify.app_hudadak.twa.MainActivity
import app.netlify.app_hudadak.twa.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AirWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
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

        /**
         * API name 필드에서 동까지 제거한 지역명 반환.
         * "WAQI 인천" → "인천"
         * "인천시 연수구 송도동" → "인천시 연수구"
         */
        private fun parseRegion(raw: String): String {
            val cleaned = raw.replace(Regex("^WAQI\\s+", RegexOption.IGNORE_CASE), "").trim()
            val tokens = cleaned.split(" ")
            val dongIdx = tokens.indexOfFirst { it.endsWith("동") || it.endsWith("읍") || it.endsWith("면") }
            return if (dongIdx > 0) tokens.subList(0, dongIdx).joinToString(" ")
            else if (tokens.size > 2) tokens.subList(0, tokens.size - 1).joinToString(" ")
            else cleaned
        }

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
            val updatedAt = prefs.getLong(WidgetDataStore.KEY_UPDATED_AT, 0L)
            val source    = prefs.getString("source", "db") ?: "db"

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

            // 현재시간
            val timeStr = if (updatedAt > 0L)
                "현재시간: " + SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(updatedAt))
            else "현재시간: --:--"
            views.setTextViewText(R.id.widget_updated_at, timeStr)

            // 소스 라벨
            views.setTextViewText(
                R.id.widget_source_label,
                if (source == "db") "실측(WAQI)" else "예상(Open-Meteo)"
            )

            // 터치 → 앱 실행
            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
