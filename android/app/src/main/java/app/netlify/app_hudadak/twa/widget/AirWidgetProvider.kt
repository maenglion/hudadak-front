package app.netlify.app_hudadak.twa.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.Color
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

        // CSS 색상과 동일: good=#1E88E5, normal=#43A047, bad=#F57C00, very-bad=#D32F2F
        private fun gradeColor(grade: String): Int = when (grade) {
            "좋음"    -> Color.parseColor("#FF1E88E5")
            "보통"    -> Color.parseColor("#FF43A047")
            "나쁨"    -> Color.parseColor("#FFF57C00")
            "매우나쁨" -> Color.parseColor("#FFD32F2F")
            else      -> Color.parseColor("#FF555559")
        }

        /**
         * API name 필드에서 동까지 제거한 지역명 반환.
         * "WAQI 인천" → "인천"
         * "인천시 연수구 송도동" → "인천시 연수구"
         * "인천시 연수구" → "인천시 연수구" (그대로)
         */
        private fun parseRegion(raw: String): String {
            // WAQI 접두사 제거
            val cleaned = raw.replace(Regex("^WAQI\\s+", RegexOption.IGNORE_CASE), "").trim()
            // 동/읍/면으로 끝나는 토큰 직전까지만
            val tokens = cleaned.split(" ")
            val dongIdx = tokens.indexOfFirst { it.endsWith("동") || it.endsWith("읍") || it.endsWith("면") }
            return if (dongIdx > 0) tokens.subList(0, dongIdx).joinToString(" ")
            else if (tokens.size > 2) tokens.subList(0, tokens.size - 1).joinToString(" ")
            else cleaned
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

            // 지역명 (동 제거, WAQI 접두사 제거)
            views.setTextViewText(R.id.widget_region, parseRegion(region))

            // PM10 - 등급 배경색 + 흰 텍스트
            views.setTextViewText(R.id.widget_pm10_grade, pm10GradeStr)
            views.setInt(R.id.widget_pm10_grade, "setBackgroundColor", gradeColor(pm10GradeStr))
            views.setInt(R.id.widget_pm10_grade, "setTextColor", Color.WHITE)
            views.setTextViewText(R.id.widget_pm10_value, if (pm10 != null) "${pm10.toInt()} µg/m³" else "--")
            views.setProgressBar(R.id.widget_pm10_bar, 200, pm10?.toInt()?.coerceIn(0, 200) ?: 0, false)

            // PM2.5 - 등급 배경색 + 흰 텍스트
            views.setTextViewText(R.id.widget_pm25_grade, pm25GradeStr)
            views.setInt(R.id.widget_pm25_grade, "setBackgroundColor", gradeColor(pm25GradeStr))
            views.setInt(R.id.widget_pm25_grade, "setTextColor", Color.WHITE)
            views.setTextViewText(R.id.widget_pm25_value, if (pm25 != null) "${pm25.toInt()} µg/m³" else "--")
            views.setProgressBar(R.id.widget_pm25_bar, 150, pm25?.toInt()?.coerceIn(0, 150) ?: 0, false)

            // 현재시간
            val timeStr = if (updatedAt > 0L)
                "현재시간: " + SimpleDateFormat("HH:mm", Locale.KOREA).format(Date(updatedAt))
            else "현재시간: --:--"
            views.setTextViewText(R.id.widget_updated_at, timeStr)

            // 소스 라벨: db → 실측(WAQI), 그 외 → 예상(Open-Meteo)
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
