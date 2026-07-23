package app.netlify.app_hudadak.twa.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context

object WidgetDataStore {
    const val PREFS_NAME = "hudadak_widget_prefs"
    const val KEY_REGION = "region"
    const val KEY_PM10 = "pm10"
    const val KEY_PM25 = "pm25"
    const val KEY_LAT = "lat"
    const val KEY_LON = "lon"
    const val KEY_PROVIDER = "provider"
    const val KEY_SOURCE = "source"
    const val KEY_DISPLAY_TS = "display_ts"
    const val KEY_UPDATED_AT = "updated_at"

    data class Coordinates(val lat: Double, val lon: Double)

    fun getCoordinates(context: Context): Coordinates? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (!prefs.contains(KEY_LAT) || !prefs.contains(KEY_LON)) return null
        return Coordinates(
            Double.fromBits(prefs.getLong(KEY_LAT, 0L)),
            Double.fromBits(prefs.getLong(KEY_LON, 0L))
        )
    }

    fun saveCoordinates(context: Context, lat: Double, lon: Double) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putLong(KEY_LAT, lat.toBits())
            .putLong(KEY_LON, lon.toBits())
            .apply()
    }

    fun save(
        context: Context,
        lat: Double,
        lon: Double,
        region: String,
        pm10: Double?,
        pm25: Double?,
        provider: String?,
        source: String?,
        displayTs: String?
    ) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().apply {
            putLong(KEY_LAT, lat.toBits())
            putLong(KEY_LON, lon.toBits())
            putString(KEY_REGION, region)
            if (pm10 != null) putFloat(KEY_PM10, pm10.toFloat())
            if (pm25 != null) putFloat(KEY_PM25, pm25.toFloat())
            if (!provider.isNullOrBlank()) putString(KEY_PROVIDER, provider)
            if (!source.isNullOrBlank()) putString(KEY_SOURCE, source)
            if (!displayTs.isNullOrBlank()) putString(KEY_DISPLAY_TS, displayTs)
            else remove(KEY_DISPLAY_TS)
            putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            apply()
        }
        refreshAllWidgets(context)
    }

    fun installedWidgetIds(context: Context): IntArray =
        AppWidgetManager.getInstance(context).getAppWidgetIds(
            ComponentName(context, AirWidgetProvider::class.java)
        )

    private fun refreshAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        for (id in installedWidgetIds(context)) {
            AirWidgetProvider.updateWidget(context, manager, id)
        }
    }
}
