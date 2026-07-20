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

        // 등급 색상 (앱과 동일한 팔레트)
        private val GRADE_COLORS = mapOf(
            "좋음"    to "#FF1E88E5",
            "보통"    to "#FF43A047",
            "나쁨"    to "#FFF57C00",
            "매우나쁨" to "#FFD32F2F"
        )

        fun pm10Grade(v: Double?): String = when {
            v == null   -> "--"
            v <= 30.0   -> "좋음"
            v <= 80.0   -> "보통"
            v <= 150.0  -> "나쁨"
            else        -> "매우나쁨"
        }

        fun pm25Grade(v: Double?): String = when {
            v == null  -> "--"
            v <= 15.0  -> "좋음"
            v <= 35.0  -> "보통"
            v <= 75.0  -> "나쁨"
            else       -> "매우나쁨"
        }

        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val prefs = context.getSharedPreferences(WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE)
            val region  = prefs.getString(WidgetDataStore.KEY_REGION, "위치 확인 중...") ?: "위치 확인 중..."
            val pm10    = prefs.getFloat(WidgetDataStore.KEY_PM10, Float.NaN).let { if (it.isNaN()) null else it.toDouble() }
            val pm25    = prefs.getFloat(WidgetDataStore.KEY_PM25, Float.NaN).let { if (it.isNaN()) null else it.toDouble() }
            val updatedAt = prefs.getLong(WidgetDataStore.KEY_UPDATED_AT, 0L)

            val pm10GradeStr = pm10Grade(pm10)
            val pm25GradeStr = pm25Grade(pm25)

            // 배경색: PM10 등급 기준
            val bgColor = GRADE_COLORS[pm10GradeStr] ?: "#FF1E88E5"

            val views = RemoteViews(context.packageName, R.layout.widget_air)

            // 배경색 동적 변경
            views.setInt(R.id.widget_root, "setBackgroundColor", Color.parseColor(bgColor))

            // 텍스트 세팅
            views.setTextViewText(R.id.widget_region, region)
            views.setTextViewText(R.id.widget_pm10_grade, pm10GradeStr)
            views.setTextViewText(R.id.widget_pm10_value, if (pm10 != null) "${pm10.toInt()} µg/m³" else "-")
            views.setTextViewText(R.id.widget_pm25_grade, pm25GradeStr)
            views.setTextViewText(R.id.widget_pm25_value, if (pm25 != null) "${pm25.toInt()} µg/m³" else "-")

            val timeStr = if (updatedAt > 0L) {
                SimpleDateFormat("HH:mm 기준", Locale.KOREA).format(Date(updatedAt))
            } else "업데이트 대기 중"
            views.setTextViewText(R.id.widget_updated_at, timeStr)

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
