package app.netlify.app_hudadak.twa.widget

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.Configuration
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.testing.SynchronousExecutor
import androidx.work.testing.WorkManagerTestInitHelper
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WidgetWorkSchedulerTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val config = Configuration.Builder()
            .setMinimumLoggingLevel(android.util.Log.DEBUG)
            .setExecutor(SynchronousExecutor())
            .build()
        WorkManagerTestInitHelper.initializeTestWorkManager(context, config)
        WorkManager.getInstance(context).cancelAllWork().result.get()
        WorkManager.getInstance(context).pruneWork().result.get()
    }

    @Test
    fun repeatedSelfHealingKeepsOnePeriodicSpecification() {
        repeat(10) {
            WidgetWorkScheduler.ensurePeriodic(context, widgetsInstalled = true)
        }

        val work = WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(WidgetWorkScheduler.PERIODIC_WORK_NAME)
            .get()
            .filter { it.state != WorkInfo.State.CANCELLED }

        assertEquals(1, work.size)
        assertEquals(WorkInfo.State.ENQUEUED, work.single().state)
        assertEquals(1L, WidgetWorkScheduler.PERIODIC_INTERVAL_HOURS)
        assertEquals(15L, WidgetWorkScheduler.PERIODIC_FLEX_MINUTES)
    }

    @Test
    fun missingPeriodicWorkIsCreated() {
        assertTrue(activePeriodicWork().isEmpty())

        WidgetWorkScheduler.ensurePeriodic(context, widgetsInstalled = true)

        assertEquals(1, activePeriodicWork().size)
    }

    @Test
    fun cancelledPeriodicWorkIsRecovered() {
        WidgetWorkScheduler.ensurePeriodic(context, widgetsInstalled = true)
        WorkManager.getInstance(context)
            .cancelUniqueWork(WidgetWorkScheduler.PERIODIC_WORK_NAME)
            .result
            .get()

        WidgetWorkScheduler.ensurePeriodic(context, widgetsInstalled = true)

        assertEquals(1, activePeriodicWork().size)
        assertEquals(WorkInfo.State.ENQUEUED, activePeriodicWork().single().state)
    }

    private fun activePeriodicWork(): List<WorkInfo> =
        WorkManager.getInstance(context)
            .getWorkInfosForUniqueWork(WidgetWorkScheduler.PERIODIC_WORK_NAME)
            .get()
            .filter { it.state != WorkInfo.State.CANCELLED }
}
