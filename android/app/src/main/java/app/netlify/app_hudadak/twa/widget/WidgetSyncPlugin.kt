package app.netlify.app_hudadak.twa.widget

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetSync")
class WidgetSyncPlugin : Plugin() {

    @PluginMethod
    fun update(call: PluginCall) {
        Log.i(TAG, "AUDIT widget_sync_received_at_ms=${System.currentTimeMillis()}")
        val mode = call.getString("mode")
        if (!WidgetRules.isCurrentSyncMode(mode)) {
            Log.w(TAG, "Rejected widget sync because mode is not current")
            call.resolve(
                JSObject()
                    .put("saved", false)
                    .put("reason", "MODE_NOT_CURRENT")
            )
            return
        }

        val lat = call.getDouble("lat")
        val lon = call.getDouble("lon")
        if (lat == null || lon == null) {
            call.reject("lat and lon are required")
            return
        }

        val now = System.currentTimeMillis()
        val pm10DisplayTs = call.getString("pm10_display_ts")
        val pm25DisplayTs = call.getString("pm25_display_ts")
        val pm10Future = WidgetRules.isFutureDisplayTs(pm10DisplayTs, now)
        val pm25Future = WidgetRules.isFutureDisplayTs(pm25DisplayTs, now)
        val pm10 = call.getDouble("pm10").takeUnless { pm10Future }
        val pm25 = call.getDouble("pm25").takeUnless { pm25Future }
        if (pm10 == null && pm25 == null) {
            Log.w(TAG, "Rejected widget sync without PM values; keeping cache")
            call.resolve(
                JSObject()
                    .put("saved", false)
                    .put("reason", "EMPTY_PM")
            )
            return
        }

        val saveResult = WidgetDataStore.saveObservation(
            context,
            WidgetDataStore.Observation(
                lat = lat,
                lon = lon,
                region = call.getString("region")
                    ?: "위치 확인 필요",
                station = null,
                pm10 = pm10,
                pm25 = pm25,
                provider = null,
                source = null,
                displayTs = null,
                pm10Provider = call.getString("pm10_provider").takeUnless { pm10Future },
                pm10Station = call.getString("pm10_station").takeUnless { pm10Future },
                pm10StationId = call.getLong("pm10_station_id").takeUnless { pm10Future },
                pm10SourceKind = call.getString("pm10_source_kind").takeUnless { pm10Future },
                pm10DisplayTs = pm10DisplayTs.takeUnless { pm10Future },
                pm25Provider = call.getString("pm25_provider").takeUnless { pm25Future },
                pm25Station = call.getString("pm25_station").takeUnless { pm25Future },
                pm25StationId = call.getLong("pm25_station_id").takeUnless { pm25Future },
                pm25SourceKind = call.getString("pm25_source_kind").takeUnless { pm25Future },
                pm25DisplayTs = pm25DisplayTs.takeUnless { pm25Future },
                preservePm10 = pm10Future,
                preservePm25 = pm25Future
            ),
            origin = WidgetWorkScheduler.TRIGGER_WIDGET_SYNC
        )
        WidgetWorkScheduler.ensurePeriodic(context)
        call.resolve(
            JSObject()
                .put("saved", true)
                .put("changed", saveResult == WidgetDataStore.SaveResult.UPDATED)
        )
    }

    companion object {
        private const val TAG = "WidgetSync"
    }
}
