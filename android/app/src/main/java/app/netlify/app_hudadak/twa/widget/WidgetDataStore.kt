package app.netlify.app_hudadak.twa.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Log

object WidgetDataStore {
    const val PREFS_NAME = "hudadak_widget_prefs"
    const val KEY_REGION = "region"
    const val KEY_STATION = "station"
    const val KEY_PM10 = "pm10"
    const val KEY_PM25 = "pm25"
    const val KEY_LAT = "lat"
    const val KEY_LON = "lon"
    const val KEY_PROVIDER = "provider"
    const val KEY_SOURCE = "source"
    const val KEY_DISPLAY_TS = "display_ts"
    const val KEY_UPDATED_AT = "updated_at"

    const val KEY_LAST_WORKER_STARTED_AT = "last_worker_started_at"
    const val KEY_LAST_API_REQUESTED_AT = "last_api_requested_at"
    const val KEY_LAST_API_RESPONSE_AT = "last_api_response_at"
    const val KEY_LAST_HTTP_STATUS = "last_http_status"
    const val KEY_LAST_SUCCESSFUL_CHECK_AT = "last_successful_check_at"
    const val KEY_LAST_SAVED_DISPLAY_TS = "last_saved_display_ts"
    const val KEY_LAST_UPDATE_ORIGIN = "last_update_origin"
    const val KEY_LAST_RESULT = "last_result"
    const val KEY_LAST_FAILURE_REASON = "last_failure_reason"
    const val KEY_CONSECUTIVE_FAILURE_COUNT = "consecutive_failure_count"
    const val KEY_LAST_RUN_ATTEMPT_COUNT = "last_run_attempt_count"
    private const val KEY_LAST_MANUAL_REFRESH_AT = "last_manual_refresh_at"
    private const val KEY_AUTOMATIC_LEASE_OWNER = "automatic_lease_owner"
    private const val KEY_AUTOMATIC_LEASE_STARTED_AT = "automatic_lease_started_at"

    const val AUTOMATIC_FRESHNESS_MILLIS = 45 * 60 * 1000L
    internal const val AUTOMATIC_LEASE_MILLIS = 2 * 60 * 1000L

    data class Coordinates(val lat: Double, val lon: Double)

    data class Observation(
        val lat: Double,
        val lon: Double,
        val region: String,
        val station: String?,
        val pm10: Double?,
        val pm25: Double?,
        val provider: String?,
        val source: String?,
        val displayTs: String?
    )

    enum class SaveResult {
        UPDATED,
        UNCHANGED
    }

    private fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getCoordinates(context: Context): Coordinates? {
        val values = prefs(context)
        if (!values.contains(KEY_LAT) || !values.contains(KEY_LON)) return null
        return Coordinates(
            Double.fromBits(values.getLong(KEY_LAT, 0L)),
            Double.fromBits(values.getLong(KEY_LON, 0L))
        )
    }

    fun getRegion(context: Context): String? =
        prefs(context).getString(KEY_REGION, null)

    @Synchronized
    fun saveObservation(
        context: Context,
        observation: Observation,
        origin: String
    ): SaveResult {
        val values = prefs(context)
        if (isSameObservation(values, observation)) {
            recordSuccessfulCheck(context, origin, observation.displayTs)
            return SaveResult.UNCHANGED
        }

        val savedAt = System.currentTimeMillis()
        values.edit().apply {
            putLong(KEY_LAT, observation.lat.toBits())
            putLong(KEY_LON, observation.lon.toBits())
            putString(KEY_REGION, observation.region)
            putNullableString(KEY_STATION, observation.station)
            putNullableFloat(KEY_PM10, observation.pm10)
            putNullableFloat(KEY_PM25, observation.pm25)
            putNullableString(KEY_PROVIDER, observation.provider)
            putNullableString(KEY_SOURCE, observation.source)
            putNullableString(KEY_DISPLAY_TS, observation.displayTs)
            putLong(KEY_UPDATED_AT, savedAt)
            putLong(KEY_LAST_SUCCESSFUL_CHECK_AT, savedAt)
            putNullableString(KEY_LAST_SAVED_DISPLAY_TS, observation.displayTs)
            putString(KEY_LAST_UPDATE_ORIGIN, origin)
            putString(KEY_LAST_RESULT, SaveResult.UPDATED.name)
            remove(KEY_LAST_FAILURE_REASON)
            putInt(KEY_CONSECUTIVE_FAILURE_COUNT, 0)
            apply()
        }
        Log.i(
            TAG,
            "AUDIT preferences_applied_at_ms=$savedAt " +
                "origin=$origin display_ts=${observation.displayTs ?: "null"}"
        )
        refreshAllWidgets(context)
        return SaveResult.UPDATED
    }

    fun installedWidgetIds(context: Context): IntArray =
        AppWidgetManager.getInstance(context).getAppWidgetIds(
            ComponentName(context, AirWidgetProvider::class.java)
        )

    fun isRecentSuccessfulCheck(context: Context, nowMillis: Long): Boolean {
        val last = prefs(context).getLong(KEY_LAST_SUCCESSFUL_CHECK_AT, 0L)
        return last > 0L && nowMillis >= last &&
            nowMillis - last < AUTOMATIC_FRESHNESS_MILLIS
    }

    @Synchronized
    fun tryAcquireManualRefresh(
        context: Context,
        nowMillis: Long,
        debounceMillis: Long
    ): Boolean {
        val values = prefs(context)
        val previous = values.getLong(KEY_LAST_MANUAL_REFRESH_AT, 0L)
        if (previous > 0L && nowMillis >= previous && nowMillis - previous < debounceMillis) {
            return false
        }
        return values.edit().putLong(KEY_LAST_MANUAL_REFRESH_AT, nowMillis).commit()
    }

    @Synchronized
    fun tryAcquireAutomaticLease(
        context: Context,
        owner: String,
        nowMillis: Long
    ): Boolean {
        val values = prefs(context)
        val currentOwner = values.getString(KEY_AUTOMATIC_LEASE_OWNER, null)
        val startedAt = values.getLong(KEY_AUTOMATIC_LEASE_STARTED_AT, 0L)
        val leaseActive = !currentOwner.isNullOrBlank() &&
            nowMillis >= startedAt &&
            nowMillis - startedAt < AUTOMATIC_LEASE_MILLIS
        if (leaseActive && currentOwner != owner) return false
        return values.edit()
            .putString(KEY_AUTOMATIC_LEASE_OWNER, owner)
            .putLong(KEY_AUTOMATIC_LEASE_STARTED_AT, nowMillis)
            .commit()
    }

    @Synchronized
    fun releaseAutomaticLease(context: Context, owner: String) {
        val values = prefs(context)
        if (values.getString(KEY_AUTOMATIC_LEASE_OWNER, null) != owner) return
        values.edit()
            .remove(KEY_AUTOMATIC_LEASE_OWNER)
            .remove(KEY_AUTOMATIC_LEASE_STARTED_AT)
            .apply()
    }

    fun recordWorkerStarted(context: Context, trigger: String, attempt: Int) {
        prefs(context).edit()
            .putLong(KEY_LAST_WORKER_STARTED_AT, System.currentTimeMillis())
            .putString(KEY_LAST_UPDATE_ORIGIN, trigger)
            .putInt(KEY_LAST_RUN_ATTEMPT_COUNT, attempt)
            .apply()
    }

    fun recordApiRequested(context: Context) {
        prefs(context).edit()
            .putLong(KEY_LAST_API_REQUESTED_AT, System.currentTimeMillis())
            .apply()
    }

    fun recordApiResponse(context: Context, status: Int) {
        prefs(context).edit()
            .putLong(KEY_LAST_API_RESPONSE_AT, System.currentTimeMillis())
            .putInt(KEY_LAST_HTTP_STATUS, status)
            .apply()
    }

    fun recordSuccessfulCheck(
        context: Context,
        origin: String,
        displayTs: String? = null,
        result: String = SaveResult.UNCHANGED.name
    ) {
        prefs(context).edit().apply {
            putLong(KEY_LAST_SUCCESSFUL_CHECK_AT, System.currentTimeMillis())
            putString(KEY_LAST_UPDATE_ORIGIN, origin)
            putString(KEY_LAST_RESULT, result)
            if (!displayTs.isNullOrBlank()) {
                putString(KEY_LAST_SAVED_DISPLAY_TS, displayTs)
            }
            remove(KEY_LAST_FAILURE_REASON)
            putInt(KEY_CONSECUTIVE_FAILURE_COUNT, 0)
            apply()
        }
    }

    fun recordResult(
        context: Context,
        result: String,
        failureReason: String? = null,
        failed: Boolean = false
    ) {
        val values = prefs(context)
        values.edit().apply {
            putString(KEY_LAST_RESULT, result)
            putNullableString(KEY_LAST_FAILURE_REASON, failureReason)
            if (failed) {
                putInt(
                    KEY_CONSECUTIVE_FAILURE_COUNT,
                    values.getInt(KEY_CONSECUTIVE_FAILURE_COUNT, 0) + 1
                )
            }
            apply()
        }
    }

    private fun isSameObservation(
        values: SharedPreferences,
        observation: Observation
    ): Boolean =
        values.contains(KEY_LAT) &&
            values.contains(KEY_LON) &&
            Double.fromBits(values.getLong(KEY_LAT, 0L)) == observation.lat &&
            Double.fromBits(values.getLong(KEY_LON, 0L)) == observation.lon &&
            values.getString(KEY_REGION, null) == observation.region &&
            values.getString(KEY_STATION, null) == observation.station?.takeIf { it.isNotBlank() } &&
            nullableFloat(values, KEY_PM10) == observation.pm10?.toFloat() &&
            nullableFloat(values, KEY_PM25) == observation.pm25?.toFloat() &&
            values.getString(KEY_PROVIDER, null) == observation.provider?.takeIf { it.isNotBlank() } &&
            values.getString(KEY_SOURCE, null) == observation.source?.takeIf { it.isNotBlank() } &&
            values.getString(KEY_DISPLAY_TS, null) == observation.displayTs?.takeIf { it.isNotBlank() }

    private fun nullableFloat(values: SharedPreferences, key: String): Float? =
        if (values.contains(key)) values.getFloat(key, Float.NaN).takeUnless { it.isNaN() }
        else null

    private fun SharedPreferences.Editor.putNullableString(
        key: String,
        value: String?
    ) {
        if (value.isNullOrBlank()) remove(key) else putString(key, value)
    }

    private fun SharedPreferences.Editor.putNullableFloat(
        key: String,
        value: Double?
    ) {
        if (value == null) remove(key) else putFloat(key, value.toFloat())
    }

    private fun refreshAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        for (id in installedWidgetIds(context)) {
            AirWidgetProvider.updateWidget(context, manager, id)
        }
    }

    private const val TAG = "WidgetDataStore"
}
