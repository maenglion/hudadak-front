package app.netlify.app_hudadak.twa.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class WidgetPackageReplacedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        if (!WidgetWorkScheduler.hasInstalledWidgets(context)) return

        Log.i(TAG, "AUDIT package_replaced_widget_schedule_recovery=true")
        WidgetWorkScheduler.ensurePeriodic(context)
        WidgetWorkScheduler.enqueueAutomatic(
            context,
            WidgetWorkScheduler.TRIGGER_PACKAGE_REPLACED
        )
    }

    companion object {
        private const val TAG = "WidgetPackageReceiver"
    }
}
