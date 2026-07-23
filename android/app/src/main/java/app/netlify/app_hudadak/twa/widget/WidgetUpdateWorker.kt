package app.netlify.app_hudadak.twa.widget

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.util.Calendar
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

class WidgetUpdateWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val PERIODIC_WORK_NAME = "hudadak_widget_update"
        private const val IMMEDIATE_WORK_NAME = "hudadak_widget_update_immediate"
        private const val API_BASE = "https://air-api-350359872967.asia-northeast3.run.app"
        private const val TAG = "WidgetUpdateWorker"
        private val networkConstraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(30, TimeUnit.MINUTES)
                .setConstraints(networkConstraints)
                .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        }

        fun enqueueImmediate(context: Context) {
            val request = OneTimeWorkRequestBuilder<WidgetUpdateWorker>()
                .setConstraints(networkConstraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                request
            )
        }

        fun cancelPeriodic(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val widgetCount = WidgetDataStore.installedWidgetIds(context).size
        val hour = Calendar.getInstance(TimeZone.getTimeZone("Asia/Seoul"))
            .get(Calendar.HOUR_OF_DAY)
        if (!WidgetRules.shouldRun(hour, widgetCount)) return@withContext Result.success()

        val coordinates = WidgetDataStore.getCoordinates(context) ?: getLastKnownLocation()?.also {
            WidgetDataStore.saveCoordinates(context, it.lat, it.lon)
        } ?: return@withContext Result.success()

        fetchAndSave(coordinates)
        Result.success()
    }

    private fun fetchAndSave(coordinates: WidgetDataStore.Coordinates) {
        var connection: HttpsURLConnection? = null
        try {
            val url = "$API_BASE/nearest?lat=${coordinates.lat}&lon=${coordinates.lon}&source=db"
            connection = URL(url).openConnection() as HttpsURLConnection
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.requestMethod = "GET"

            when (connection.responseCode) {
                HttpsURLConnection.HTTP_NO_CONTENT -> return
                HttpsURLConnection.HTTP_OK -> Unit
                else -> {
                    Log.w(TAG, "Widget API returned HTTP ${connection.responseCode}; keeping cache")
                    return
                }
            }

            val json = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
            val displayTs = json.optString("display_ts").takeIf { it.isNotBlank() }
            if (WidgetRules.isFutureDisplayTs(displayTs, System.currentTimeMillis())) {
                Log.w(TAG, "Rejected future widget display_ts: $displayTs")
                return
            }
            val pm10 = json.optDouble("pm10").let { if (it.isNaN()) null else it }
            val pm25 = json.optDouble("pm25").let { if (it.isNaN()) null else it }
            if (pm10 == null && pm25 == null) return

            WidgetDataStore.save(
                context,
                coordinates.lat,
                coordinates.lon,
                json.optString("name", json.optString("station", "알 수 없는 위치")),
                pm10,
                pm25,
                json.optString("provider").takeIf { it.isNotBlank() },
                json.optString("source").takeIf { it.isNotBlank() },
                displayTs
            )
        } catch (e: Exception) {
            Log.w(TAG, "Widget refresh failed; keeping cache", e)
        } finally {
            connection?.disconnect()
        }
    }

    private fun getLastKnownLocation(): WidgetDataStore.Coordinates? {
        return try {
            val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            )
            var best: Location? = null
            for (provider in providers) {
                @Suppress("MissingPermission")
                val location = manager.getLastKnownLocation(provider) ?: continue
                if (best == null || location.accuracy < best.accuracy) best = location
            }
            best?.let { WidgetDataStore.Coordinates(it.latitude, it.longitude) }
        } catch (e: Exception) {
            Log.w(TAG, "No last known location available", e)
            null
        }
    }
}
