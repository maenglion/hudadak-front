package app.netlify.app_hudadak.twa.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

/**
 * 앱 ↔ 위젯 간 데이터 공유용 SharedPreferences 헬퍼.
 *
 * 앱이 미세먼지 데이터를 받으면 여기에 저장하고,
 * 위젯은 이 값을 읽어서 표시한다.
 */
object WidgetDataStore {

    const val PREFS_NAME   = "hudadak_widget_prefs"
    const val KEY_REGION   = "region"
    const val KEY_PM10     = "pm10"
    const val KEY_PM25     = "pm25"
    const val KEY_UPDATED_AT = "updated_at"

    /**
     * 미세먼지 데이터를 저장하고 모든 위젯을 즉시 갱신한다.
     * MainActivity(또는 Capacitor 플러그인)에서 호출한다.
     */
    fun save(context: Context, region: String, pm10: Double?, pm25: Double?) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putString(KEY_REGION, region)
            if (pm10 != null) putFloat(KEY_PM10, pm10.toFloat()) else remove(KEY_PM10)
            if (pm25 != null) putFloat(KEY_PM25, pm25.toFloat()) else remove(KEY_PM25)
            putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            apply()
        }
        refreshAllWidgets(context)
    }

    /** 설치된 모든 위젯에 갱신 브로드캐스트를 보낸다. */
    private fun refreshAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(
            ComponentName(context, AirWidgetProvider::class.java)
        )
        if (ids.isEmpty()) return
        for (id in ids) {
            AirWidgetProvider.updateWidget(context, manager, id)
        }
    }
}
