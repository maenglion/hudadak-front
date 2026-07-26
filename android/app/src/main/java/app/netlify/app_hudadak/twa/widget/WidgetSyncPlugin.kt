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

        val displayTs = call.getString("display_ts")
        if (WidgetRules.isFutureDisplayTs(displayTs, System.currentTimeMillis())) {
            Log.w(TAG, "Rejected future widget display_ts: $displayTs")
            call.resolve(
                JSObject()
                    .put("saved", false)
                    .put("reason", "FUTURE_TIMESTAMP")
            )
            return
        }

        val pm10 = call.getDouble("pm10")
        val pm25 = call.getDouble("pm25")
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
                    ?: call.getString("station")
                    ?: "위치 확인 필요",
                station = call.getString("station"),
                pm10 = pm10,
                pm25 = pm25,
                provider = call.getString("provider"),
                source = call.getString("source"),
                displayTs = displayTs
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
