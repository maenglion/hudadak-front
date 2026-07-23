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
        val lat = call.getDouble("lat")
        val lon = call.getDouble("lon")
        if (lat == null || lon == null) {
            call.reject("lat and lon are required")
            return
        }

        val displayTs = call.getString("display_ts")
        if (WidgetRules.isFutureDisplayTs(displayTs, System.currentTimeMillis())) {
            Log.w(TAG, "Rejected future widget display_ts: $displayTs")
            call.resolve(JSObject().put("saved", false))
            return
        }

        WidgetDataStore.save(
            context = context,
            lat = lat,
            lon = lon,
            region = call.getString("region") ?: call.getString("station") ?: "알 수 없는 위치",
            pm10 = call.getDouble("pm10"),
            pm25 = call.getDouble("pm25"),
            provider = call.getString("provider"),
            source = call.getString("source"),
            displayTs = displayTs
        )
        call.resolve(JSObject().put("saved", true))
    }

    companion object {
        private const val TAG = "WidgetSync"
    }
}
