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
    const val KEY_PM10_PROVIDER = "pm10_provider"
    const val KEY_PM10_STATION = "pm10_station"
    const val KEY_PM10_STATION_ID = "pm10_station_id"
    const val KEY_PM10_SOURCE_KIND = "pm10_source_kind"
    const val KEY_PM10_DISPLAY_TS = "pm10_display_ts"
    const val KEY_PM25_PROVIDER = "pm25_provider"
    const val KEY_PM25_STATION = "pm25_station"
    const val KEY_PM25_STATION_ID = "pm25_station_id"
    const val KEY_PM25_SOURCE_KIND = "pm25_source_kind"
    const val KEY_PM25_DISPLAY_TS = "pm25_display_ts"
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
        val displayTs: String?,
        val pm10Provider: String? = null,
        val pm10Station: String? = null,
        val pm10StationId: Long? = null,
        val pm10SourceKind: String? = null,
        val pm10DisplayTs: String? = null,
        val pm25Provider: String? = null,
        val pm25Station: String? = null,
        val pm25StationId: Long? = null,
        val pm25SourceKind: String? = null,
        val pm25DisplayTs: String? = null,
        val preservePm10: Boolean = false,
        val preservePm25: Boolean = false
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
        val effective = resolvePreserved(values, observation)
        if (isSameObservation(values, effective)) {
            recordSuccessfulCheck(context, origin, effective.displayTs)
            return SaveResult.UNCHANGED
        }

        val savedAt = System.currentTimeMillis()
        val pm10DisplayTs = effective.pm10DisplayTs ?: effective.displayTs
        val pm25DisplayTs = effective.pm25DisplayTs ?: effective.displayTs
        values.edit().apply {
            putLong(KEY_LAT, effective.lat.toBits())
            putLong(KEY_LON, effective.lon.toBits())
            putString(KEY_REGION, effective.region)
            putNullableFloat(KEY_PM10, effective.pm10)
            putNullableFloat(KEY_PM25, effective.pm25)
            putNullableString(KEY_PM10_PROVIDER, effective.pm10Provider ?: effective.provider)
            putNullableString(KEY_PM10_STATION, effective.pm10Station ?: effective.station)
            putNullableLong(KEY_PM10_STATION_ID, effective.pm10StationId)
            putNullableString(KEY_PM10_SOURCE_KIND, effective.pm10SourceKind ?: effective.source)
            putNullableString(KEY_PM10_DISPLAY_TS, pm10DisplayTs)
            putNullableString(KEY_PM25_PROVIDER, effective.pm25Provider ?: effective.provider)
            putNullableString(KEY_PM25_STATION, effective.pm25Station ?: effective.station)
            putNullableLong(KEY_PM25_STATION_ID, effective.pm25StationId)
            putNullableString(KEY_PM25_SOURCE_KIND, effective.pm25SourceKind ?: effective.source)
            putNullableString(KEY_PM25_DISPLAY_TS, pm25DisplayTs)
            putLong(KEY_UPDATED_AT, savedAt)
            putLong(KEY_LAST_SUCCESSFUL_CHECK_AT, savedAt)
            putNullableString(
                KEY_LAST_SAVED_DISPLAY_TS,
                listOfNotNull(pm10DisplayTs, pm25DisplayTs).maxOrNull()
            )
            putString(KEY_LAST_UPDATE_ORIGIN, origin)
            putString(KEY_LAST_RESULT, SaveResult.UPDATED.name)
            remove(KEY_LAST_FAILURE_REASON)
            putInt(KEY_CONSECUTIVE_FAILURE_COUNT, 0)
            apply()
        }
        Log.i(
            TAG,
            "AUDIT preferences_applied_at_ms=$savedAt " +
                "origin=$origin pm10_ts=${pm10DisplayTs ?: "null"} " +
                "pm25_ts=${pm25DisplayTs ?: "null"}"
        )
        refreshAllWidgets(context)
        return SaveResult.UPDATED
    }

    private fun resolvePreserved(
        values: SharedPreferences,
        observation: Observation
    ): Observation = observation.copy(
        pm10 = if (observation.preservePm10) {
            nullableFloat(values, KEY_PM10)?.toDouble()
        } else observation.pm10,
        pm10Provider = if (observation.preservePm10) {
            pollutantString(values, KEY_PM10_PROVIDER, KEY_PROVIDER)
        } else observation.pm10Provider,
        pm10Station = if (observation.preservePm10) {
            pollutantString(values, KEY_PM10_STATION, KEY_STATION)
        } else observation.pm10Station,
        pm10StationId = if (observation.preservePm10) {
            pollutantLong(values, KEY_PM10_STATION_ID)
        } else observation.pm10StationId,
        pm10SourceKind = if (observation.preservePm10) {
            pollutantString(values, KEY_PM10_SOURCE_KIND, KEY_SOURCE)
        } else observation.pm10SourceKind,
        pm10DisplayTs = if (observation.preservePm10) {
            pollutantString(values, KEY_PM10_DISPLAY_TS, KEY_DISPLAY_TS)
        } else observation.pm10DisplayTs,
        pm25 = if (observation.preservePm25) {
            nullableFloat(values, KEY_PM25)?.toDouble()
        } else observation.pm25,
        pm25Provider = if (observation.preservePm25) {
            pollutantString(values, KEY_PM25_PROVIDER, KEY_PROVIDER)
        } else observation.pm25Provider,
        pm25Station = if (observation.preservePm25) {
            pollutantString(values, KEY_PM25_STATION, KEY_STATION)
        } else observation.pm25Station,
        pm25StationId = if (observation.preservePm25) {
            pollutantLong(values, KEY_PM25_STATION_ID)
        } else observation.pm25StationId,
        pm25SourceKind = if (observation.preservePm25) {
            pollutantString(values, KEY_PM25_SOURCE_KIND, KEY_SOURCE)
        } else observation.pm25SourceKind,
        pm25DisplayTs = if (observation.preservePm25) {
            pollutantString(values, KEY_PM25_DISPLAY_TS, KEY_DISPLAY_TS)
        } else observation.pm25DisplayTs
    )

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
            nullableFloat(values, KEY_PM10) == observation.pm10?.toFloat() &&
            nullableFloat(values, KEY_PM25) == observation.pm25?.toFloat() &&
            pollutantString(values, KEY_PM10_PROVIDER, KEY_PROVIDER) ==
                (observation.pm10Provider ?: observation.provider)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM10_STATION, KEY_STATION) ==
                (observation.pm10Station ?: observation.station)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM10_SOURCE_KIND, KEY_SOURCE) ==
                (observation.pm10SourceKind ?: observation.source)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM10_DISPLAY_TS, KEY_DISPLAY_TS) ==
                (observation.pm10DisplayTs ?: observation.displayTs)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM25_PROVIDER, KEY_PROVIDER) ==
                (observation.pm25Provider ?: observation.provider)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM25_STATION, KEY_STATION) ==
                (observation.pm25Station ?: observation.station)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM25_SOURCE_KIND, KEY_SOURCE) ==
                (observation.pm25SourceKind ?: observation.source)?.takeIf { it.isNotBlank() } &&
            pollutantString(values, KEY_PM25_DISPLAY_TS, KEY_DISPLAY_TS) ==
                (observation.pm25DisplayTs ?: observation.displayTs)?.takeIf { it.isNotBlank() }

    fun pollutantString(
        values: SharedPreferences,
        pollutantKey: String,
        legacyKey: String
    ): String? = values.getString(pollutantKey, null)
        ?: values.getString(legacyKey, null)

    private fun pollutantLong(values: SharedPreferences, key: String): Long? =
        if (values.contains(key)) values.getLong(key, 0L) else null

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

    private fun SharedPreferences.Editor.putNullableLong(
        key: String,
        value: Long?
    ) {
        if (value == null) remove(key) else putLong(key, value)
    }

    private fun refreshAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        for (id in installedWidgetIds(context)) {
            AirWidgetProvider.updateWidget(context, manager, id)
        }
    }

    private const val TAG = "WidgetDataStore"
}
