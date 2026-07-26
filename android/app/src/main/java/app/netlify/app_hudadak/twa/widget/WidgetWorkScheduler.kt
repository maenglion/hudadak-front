package app.netlify.app_hudadak.twa.widget

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object WidgetWorkScheduler {
    const val PERIODIC_WORK_NAME = "hudadak_widget_update"
    const val IMMEDIATE_WORK_NAME = "hudadak_widget_update_immediate"
    const val INPUT_TRIGGER = "trigger"

    const val TRIGGER_PERIODIC = "periodic"
    const val TRIGGER_WIDGET_ENABLED = "widget_enabled"
    const val TRIGGER_WIDGET_UPDATE = "widget_update"
    const val TRIGGER_PACKAGE_REPLACED = "package_replaced"
    const val TRIGGER_APP_START = "app_start"
    const val TRIGGER_WIDGET_SYNC = "widget_sync"
    const val TRIGGER_MANUAL = "manual_widget_refresh"

    internal const val PERIODIC_INTERVAL_HOURS = 1L
    internal const val PERIODIC_FLEX_MINUTES = 15L
    internal const val MANUAL_DEBOUNCE_MILLIS = 10_000L

    private val networkConstraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    fun hasInstalledWidgets(context: Context): Boolean =
        WidgetDataStore.installedWidgetIds(context).isNotEmpty()

    fun ensurePeriodic(context: Context) {
        ensurePeriodic(context, hasInstalledWidgets(context))
    }

    internal fun ensurePeriodic(context: Context, widgetsInstalled: Boolean) {
        if (!widgetsInstalled) return
        val request = PeriodicWorkRequestBuilder<WidgetUpdateWorker>(
            PERIODIC_INTERVAL_HOURS,
            TimeUnit.HOURS,
            PERIODIC_FLEX_MINUTES,
            TimeUnit.MINUTES
        )
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .setInputData(triggerData(TRIGGER_PERIODIC))
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            PERIODIC_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }

    fun enqueueAutomatic(context: Context, trigger: String): Boolean {
        if (!hasInstalledWidgets(context)) return false
        if (WidgetDataStore.isRecentSuccessfulCheck(context, System.currentTimeMillis())) {
            return false
        }
        val request = OneTimeWorkRequestBuilder<WidgetUpdateWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .setInputData(triggerData(trigger))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.KEEP,
            request
        )
        return true
    }

    fun enqueueManual(context: Context): Boolean {
        if (!hasInstalledWidgets(context)) return false
        val now = System.currentTimeMillis()
        if (!WidgetDataStore.tryAcquireManualRefresh(context, now, MANUAL_DEBOUNCE_MILLIS)) {
            return false
        }
        val request = OneTimeWorkRequestBuilder<WidgetUpdateWorker>()
            .setConstraints(networkConstraints)
            .setBackoffCriteria(BackoffPolicy.LINEAR, 5, TimeUnit.MINUTES)
            .setInputData(triggerData(TRIGGER_MANUAL))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            IMMEDIATE_WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request
        )
        return true
    }

    fun cancelAll(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC_WORK_NAME)
        WorkManager.getInstance(context).cancelUniqueWork(IMMEDIATE_WORK_NAME)
    }

    private fun triggerData(trigger: String): Data =
        Data.Builder().putString(INPUT_TRIGGER, trigger).build()
}
