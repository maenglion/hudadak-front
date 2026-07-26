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
            val url = "$API_BASE/nearest?lat=${coordinates.lat}&lon=${coordinates.lon}&source=db"
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
        val displayTs = json.optString("display_ts").takeIf { it.isNotBlank() }
        Log.i(
            TAG,
            "AUDIT api_payload_at_ms=${System.currentTimeMillis()} " +
                "display_ts=${displayTs ?: "null"}"
        )

        if (WidgetRules.isFutureDisplayTs(displayTs, System.currentTimeMillis())) {
            return WidgetFetchOutcome(
                WidgetFetchResult.NON_RETRYABLE_ERROR,
                failureReason = "FUTURE_TIMESTAMP",
                displayTs = displayTs
            )
        }

        val pm10 = json.optDouble("pm10").let { if (it.isNaN()) null else it }
        val pm25 = json.optDouble("pm25").let { if (it.isNaN()) null else it }
        if (pm10 == null && pm25 == null) {
            return WidgetFetchOutcome(
                WidgetFetchResult.NON_RETRYABLE_ERROR,
                failureReason = "EMPTY_PM",
                displayTs = displayTs
            )
        }

        val region = WidgetDataStore.getRegion(context)
            ?: json.optString("region").takeIf { it.isNotBlank() }
            ?: json.optString("name").takeIf { it.isNotBlank() }
            ?: "위치 확인 필요"
        val station = json.optString("name")
            .takeIf { it.isNotBlank() }
            ?: json.optString("station").takeIf { it.isNotBlank() }
        val source = WidgetRules.resolveSourceKind(
            json.optString("source_kind").takeIf { it.isNotBlank() },
            json.optString("source").takeIf { it.isNotBlank() }
        )

        val saveResult = WidgetDataStore.saveObservation(
            context,
            WidgetDataStore.Observation(
                lat = coordinates.lat,
                lon = coordinates.lon,
                region = region,
                station = station,
                pm10 = pm10,
                pm25 = pm25,
                provider = json.optString("provider").takeIf { it.isNotBlank() },
                source = source,
                displayTs = displayTs
            ),
            origin = trigger
        )
        return when (saveResult) {
            WidgetDataStore.SaveResult.UPDATED -> WidgetFetchOutcome(
                WidgetFetchResult.UPDATED,
                displayTs = displayTs,
                remoteViewsApplied = true
            )
            WidgetDataStore.SaveResult.UNCHANGED -> WidgetFetchOutcome(
                WidgetFetchResult.UNCHANGED,
                displayTs = displayTs,
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
