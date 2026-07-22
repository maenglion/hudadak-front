package app.netlify.app_hudadak.twa.widget

import android.content.Context
import android.location.Location
import android.location.LocationManager
import androidx.work.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

/**
 * 30분마다 백그라운드에서 미세먼지 데이터를 가져와 위젯을 갱신한다.
 *
 * WorkManager를 사용하므로 앱이 꺼져 있어도 동작한다.
 * (단, 배터리 절약 모드 등 OS 정책에 따라 지연될 수 있음)
 */
class WidgetUpdateWorker(
    private val context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val WORK_NAME = "hudadak_widget_update"
        private const val API_BASE  = "https://air-api-350359872967.asia-northeast3.run.app"

        /** MainActivity.onCreate() 에서 한 번만 호출하면 된다. */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(
                30, TimeUnit.MINUTES
            )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val (lat, lon) = getLastKnownLocation() ?: return@withContext Result.retry()

            val url = "$API_BASE/nearest?lat=$lat&lon=$lon&source=db"
            val conn = URL(url).openConnection() as HttpsURLConnection
            conn.connectTimeout = 8000
            conn.readTimeout    = 8000

            val body = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            val json   = JSONObject(body)
            val pm10   = json.optDouble("pm10").let { if (it.isNaN()) null else it }
            val pm25   = json.optDouble("pm25").let { if (it.isNaN()) null else it }
            val region = json.optString("name", "알 수 없는 위치")
            val sourceVal = json.optString("source", "db")

            WidgetDataStore.save(context, region, pm10, pm25)
            context.getSharedPreferences(WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString("source", sourceVal).apply()
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    /** GPS 또는 네트워크에서 마지막 위치를 가져온다. */
    private fun getLastKnownLocation(): Pair<Double, Double>? {
        return try {
            val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val providers = listOf(
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            )
            var best: Location? = null
            for (provider in providers) {
                @Suppress("MissingPermission")
                val loc = lm.getLastKnownLocation(provider) ?: continue
                if (best == null || loc.accuracy < best.accuracy) best = loc
            }
            best?.let { Pair(it.latitude, it.longitude) }
        } catch (e: Exception) {
            null
        }
    }
}
