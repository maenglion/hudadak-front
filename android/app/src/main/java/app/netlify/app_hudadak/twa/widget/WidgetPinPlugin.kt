package app.netlify.app_hudadak.twa.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "WidgetPin")
class WidgetPinPlugin : Plugin() {

    @PluginMethod
    fun requestPin(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val appWidgetManager = AppWidgetManager.getInstance(context)
            if (appWidgetManager.isRequestPinAppWidgetSupported) {
                val provider = ComponentName(context, AirWidgetProvider::class.java)
                appWidgetManager.requestPinAppWidget(provider, null, null)
                call.resolve()
            } else {
                call.reject("requestPinAppWidget not supported on this launcher")
            }
        } else {
            call.reject("requestPinAppWidget requires Android 8.0+")
        }
    }
}
