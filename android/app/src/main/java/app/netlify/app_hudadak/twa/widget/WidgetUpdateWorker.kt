package app.netlify.app_hudadak.twa.widget

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.URL
import java.util.Calendar
import java.util.TimeZone
import javax.net.ssl.HttpsURLConnection

enum class WidgetFetchResult {
    UPDATED,
    UNCHANGED,
    NO_CONTENT,
    NO_COORDINATES,
    NO_WIDGETS,
    SKIPPED_RECENT,
    SKIPPED_IN_FLIGHT,
    SKIPPED_NIGHT,
    RETRYABLE_ERROR,
    NON_RETRYABLE_ERROR
}

data class WidgetFetchOutcome(
    val result: WidgetFetchResult,
    val failureReason: String? = null,
    val displayTs: String? = null,
    val remoteViewsApplied: Boolean = false
)

class WidgetUpdateWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val trigger = inputData.getString(WidgetWorkScheduler.INPUT_TRIGGER)
            ?: WidgetWorkScheduler.TRIGGER_PERIODIC
        val manual = trigger == WidgetWorkScheduler.TRIGGER_MANUAL
        val widgetCount = WidgetDataStore.installedWidgetIds(context).size
        val hasCoordinates = WidgetDataStore.getCoordinates(context) != null
        val hour = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"))
            .get(Calendar.HOUR_OF_DAY)

        WidgetDataStore.recordWorkerStarted(context, trigger, runAttemptCount)
        Log.i(
            TAG,
            "AUDIT worker_started_at_ms=${System.currentTimeMillis()} " +
                "trigger=$trigger work_id=$id " +
                "attempt=$runAttemptCount widget_count=$widgetCount " +
                "has_current_coordinates=$hasCoordinates"
        )

        val outcome = when {
            widgetCount == 0 -> WidgetFetchOutcome(WidgetFetchResult.NO_WIDGETS)
            !manual && !WidgetRules.shouldRun(hour, widgetCount) ->
                WidgetFetchOutcome(WidgetFetchResult.SKIPPED_NIGHT)
            !manual && WidgetDataStore.isRecentSuccessfulCheck(
                context,
                System.currentTimeMillis()
            ) -> WidgetFetchOutcome(WidgetFetchResult.SKIPPED_RECENT)
            else -> {
                val coordinates = WidgetDataStore.getCoordinates(context)
                if (coordinates == null) {
                    WidgetFetchOutcome(
                        WidgetFetchResult.NO_COORDINATES,
                        failureReason = "NO_CURRENT_COORDS"
                    )
                } else if (
                    !manual && !WidgetDataStore.tryAcquireAutomaticLease(
                        context,
                        id.toString(),
                        System.currentTimeMillis()
                    )
                ) {
                    WidgetFetchOutcome(WidgetFetchResult.SKIPPED_IN_FLIGHT)
                } else {
                    try {
                        fetchAndSave(coordinates, trigger)
                    } finally {
                        if (!manual) {
                            WidgetDataStore.releaseAutomaticLease(context, id.toString())
                        }
                    }
                }
            }
        }

        finishWork(trigger, outcome)
    }

    private fun finishWork(trigger: String, outcome: WidgetFetchOutcome): Result {
        val failed = outcome.result == WidgetFetchResult.RETRYABLE_ERROR ||
            outcome.result == WidgetFetchResult.NON_RETRYABLE_ERROR

        when (outcome.result) {
            WidgetFetchResult.UPDATED,
            WidgetFetchResult.UNCHANGED -> Unit
            WidgetFetchResult.NO_CONTENT -> WidgetDataStore.recordSuccessfulCheck(
                context,
                trigger,
                result = WidgetFetchResult.NO_CONTENT.name
            )
            else -> WidgetDataStore.recordResult(
                context,
                outcome.result.name,
                outcome.failureReason,
                failed
            )
        }

        val shouldRetry = outcome.result == WidgetFetchResult.RETRYABLE_ERROR &&
            WidgetRules.shouldRetry(runAttemptCount)
        val workResult = if (shouldRetry) Result.retry() else Result.success()
        Log.i(
            TAG,
            "AUDIT worker_finished_at_ms=${System.currentTimeMillis()} " +
                "trigger=$trigger work_id=$id " +
                "attempt=$runAttemptCount result=${outcome.result} " +
                "display_ts=${outcome.displayTs ?: "null"} " +
                "remote_views_applied=${outcome.remoteViewsApplied} " +
                "work_result=${if (shouldRetry) "RETRY" else "SUCCESS"}"
        )
        return workResult
    }

    private fun fetchAndSave(
        coordinates: WidgetDataStore.Coordinates,
        trigger: String
    ): WidgetFetchOutcome {
        var connection: HttpsURLConnection? = null
        return try {
            val url = "$API_BASE/nearest?lat=${coordinates.lat}&lon=${coordinates.lon}" +
                "&source=db&lookup_mode=current"
            connection = URL(url).openConnection() as HttpsURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.requestMethod = "GET"
            connection.useCaches = false
            connection.setRequestProperty("Cache-Control", "no-cache")

            WidgetDataStore.recordApiRequested(context)
            Log.i(
                TAG,
                "AUDIT api_request_at_ms=${System.currentTimeMillis()} " +
                    "trigger=$trigger source=db"
            )

            val responseCode = connection.responseCode
            WidgetDataStore.recordApiResponse(context, responseCode)
            Log.i(
                TAG,
                "AUDIT api_response_at_ms=${System.currentTimeMillis()} " +
                    "trigger=$trigger status=$responseCode"
            )

            when {
                responseCode == HttpsURLConnection.HTTP_NO_CONTENT ->
                    WidgetFetchOutcome(WidgetFetchResult.NO_CONTENT)
                responseCode == HttpsURLConnection.HTTP_OK ->
                    parseAndSave(connection, coordinates, trigger)
                WidgetRules.isRetryableHttp(responseCode) ->
                    WidgetFetchOutcome(
                        WidgetFetchResult.RETRYABLE_ERROR,
                        failureReason = "HTTP_$responseCode"
                    )
                else -> WidgetFetchOutcome(
                    WidgetFetchResult.NON_RETRYABLE_ERROR,
                    failureReason = "NON_RETRYABLE_HTTP_$responseCode"
                )
            }
        } catch (e: SocketTimeoutException) {
            Log.w(TAG, "Widget refresh timed out; keeping cache")
            WidgetFetchOutcome(
                WidgetFetchResult.RETRYABLE_ERROR,
                failureReason = "TIMEOUT"
            )
        } catch (e: IOException) {
            Log.w(TAG, "Widget refresh IO failure; keeping cache", e)
            WidgetFetchOutcome(
                WidgetFetchResult.RETRYABLE_ERROR,
                failureReason = "IO_ERROR"
            )
        } catch (e: Exception) {
            Log.w(TAG, "Widget refresh failed; keeping cache", e)
            WidgetFetchOutcome(
                WidgetFetchResult.NON_RETRYABLE_ERROR,
                failureReason = "INVALID_RESPONSE"
            )
        } finally {
            connection?.disconnect()
        }
    }

    private fun parseAndSave(
        connection: HttpsURLConnection,
        coordinates: WidgetDataStore.Coordinates,
        trigger: String
    ): WidgetFetchOutcome {
        val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        val legacyDisplayTs = json.optString("display_ts").takeIf { it.isNotBlank() }
        val pm10Meta = json.optJSONObject("pm10_meta")
        val pm25Meta = json.optJSONObject("pm25_meta")
        val pm10DisplayTs = pm10Meta?.optString("display_ts")
            ?.takeIf { it.isNotBlank() } ?: legacyDisplayTs
        val pm25DisplayTs = pm25Meta?.optString("display_ts")
            ?.takeIf { it.isNotBlank() } ?: legacyDisplayTs
        Log.i(
            TAG,
            "AUDIT api_payload_at_ms=${System.currentTimeMillis()} " +
                "pm10_ts=${pm10DisplayTs ?: "null"} " +
                "pm25_ts=${pm25DisplayTs ?: "null"}"
        )

        val now = System.currentTimeMillis()
        val pm10Future = WidgetRules.isFutureDisplayTs(pm10DisplayTs, now)
        val pm25Future = WidgetRules.isFutureDisplayTs(pm25DisplayTs, now)
        val pm10 = json.optDouble("pm10")
            .let { if (it.isNaN() || pm10Future) null else it }
        val pm25 = json.optDouble("pm25")
            .let { if (it.isNaN() || pm25Future) null else it }
        if (pm10 == null && pm25 == null) {
            return WidgetFetchOutcome(
                WidgetFetchResult.NON_RETRYABLE_ERROR,
                failureReason = if (pm10Future || pm25Future) {
                    "FUTURE_TIMESTAMPS"
                } else {
                    "EMPTY_PM"
                },
                displayTs = listOfNotNull(pm10DisplayTs, pm25DisplayTs).maxOrNull()
            )
        }

        val region = WidgetDataStore.getRegion(context)
            ?: json.optString("region").takeIf { it.isNotBlank() }
            ?: json.optString("name").takeIf { it.isNotBlank() }
            ?: "위치 확인 필요"
        val legacyStation = json.optString("name").takeIf { it.isNotBlank() }
        val legacyProvider = json.optString("provider").takeIf { it.isNotBlank() }
        val legacySource = WidgetRules.resolveSourceKind(
            json.optString("source_kind").takeIf { it.isNotBlank() },
            json.optString("source").takeIf { it.isNotBlank() }
        )
        fun JSONObject?.text(key: String): String? =
            this?.optString(key)?.takeIf { it.isNotBlank() }
        fun JSONObject?.stationId(): Long? =
            this?.takeIf { it.has("station_id") && !it.isNull("station_id") }
                ?.optLong("station_id")

        val saveResult = WidgetDataStore.saveObservation(
            context,
            WidgetDataStore.Observation(
                lat = coordinates.lat,
                lon = coordinates.lon,
                region = region,
                station = legacyStation,
                pm10 = pm10,
                pm25 = pm25,
                provider = legacyProvider,
                source = legacySource,
                displayTs = legacyDisplayTs,
                pm10Provider = pm10Meta.text("provider").takeUnless { pm10Future },
                pm10Station = pm10Meta.text("station").takeUnless { pm10Future },
                pm10StationId = pm10Meta.stationId().takeUnless { pm10Future },
                pm10SourceKind = pm10Meta.text("source_kind").takeUnless { pm10Future },
                pm10DisplayTs = pm10DisplayTs.takeUnless { pm10Future },
                pm25Provider = pm25Meta.text("provider").takeUnless { pm25Future },
                pm25Station = pm25Meta.text("station").takeUnless { pm25Future },
                pm25StationId = pm25Meta.stationId().takeUnless { pm25Future },
                pm25SourceKind = pm25Meta.text("source_kind").takeUnless { pm25Future },
                pm25DisplayTs = pm25DisplayTs.takeUnless { pm25Future },
                preservePm10 = pm10Future,
                preservePm25 = pm25Future
            ),
            origin = trigger
        )
        val latestDisplayTs = listOfNotNull(
            pm10DisplayTs.takeUnless { pm10Future },
            pm25DisplayTs.takeUnless { pm25Future }
        ).maxOrNull()
        return when (saveResult) {
            WidgetDataStore.SaveResult.UPDATED -> WidgetFetchOutcome(
                WidgetFetchResult.UPDATED,
                displayTs = latestDisplayTs,
                remoteViewsApplied = true
            )
            WidgetDataStore.SaveResult.UNCHANGED -> WidgetFetchOutcome(
                WidgetFetchResult.UNCHANGED,
                displayTs = latestDisplayTs,
                remoteViewsApplied = false
            )
        }
    }

    companion object {
        private const val API_BASE =
            "https://air-api-350359872967.asia-northeast3.run.app"
        private const val TAG = "WidgetUpdateWorker"
    }
}
