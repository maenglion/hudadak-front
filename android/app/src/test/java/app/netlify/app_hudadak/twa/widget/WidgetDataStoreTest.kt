package app.netlify.app_hudadak.twa.widget

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class WidgetDataStoreTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences(WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun identicalPayloadIsUnchangedButStillMarksSuccessfulCheck() {
        val observation = observation(displayTs = "2026-07-25T09:00:00+09:00")

        assertEquals(
            WidgetDataStore.SaveResult.UPDATED,
            WidgetDataStore.saveObservation(context, observation, "native_sync")
        )
        assertEquals(
            WidgetDataStore.SaveResult.UNCHANGED,
            WidgetDataStore.saveObservation(context, observation, "periodic")
        )

        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        assertEquals("periodic", prefs.getString(WidgetDataStore.KEY_LAST_UPDATE_ORIGIN, null))
        assertEquals(
            WidgetDataStore.SaveResult.UNCHANGED.name,
            prefs.getString(WidgetDataStore.KEY_LAST_RESULT, null)
        )
        assertTrue(prefs.getLong(WidgetDataStore.KEY_LAST_SUCCESSFUL_CHECK_AT, 0L) > 0L)
    }

    @Test
    fun nullFieldsRemoveStaleValuesWithoutRemovingCoordinatesOrRegion() {
        WidgetDataStore.saveObservation(
            context,
            observation(displayTs = "2026-07-25T09:00:00+09:00"),
            "native_sync"
        )
        val emptyPm = observation(
            station = null,
            pm10 = null,
            pm25 = null,
            provider = null,
            source = null,
            displayTs = null
        )

        assertEquals(
            WidgetDataStore.SaveResult.UPDATED,
            WidgetDataStore.saveObservation(context, emptyPm, "worker")
        )

        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        assertNull(prefs.getString(WidgetDataStore.KEY_STATION, null))
        assertFalse(prefs.contains(WidgetDataStore.KEY_PM10))
        assertFalse(prefs.contains(WidgetDataStore.KEY_PM25))
        assertNull(prefs.getString(WidgetDataStore.KEY_PROVIDER, null))
        assertNull(prefs.getString(WidgetDataStore.KEY_SOURCE, null))
        assertNull(prefs.getString(WidgetDataStore.KEY_DISPLAY_TS, null))
        assertEquals("인천광역시 연수구", prefs.getString(WidgetDataStore.KEY_REGION, null))
        assertEquals(37.3925, WidgetDataStore.getCoordinates(context)!!.lat, 0.0)
    }

    @Test
    fun displayTimestampChangeIsAnUpdateEvenWhenPmIsIdentical() {
        WidgetDataStore.saveObservation(
            context,
            observation(displayTs = "2026-07-25T09:00:00+09:00"),
            "native_sync"
        )

        assertEquals(
            WidgetDataStore.SaveResult.UPDATED,
            WidgetDataStore.saveObservation(
                context,
                observation(displayTs = "2026-07-25T10:00:00+09:00"),
                "periodic"
            )
        )
    }

    @Test
    fun freshnessAndManualDebounceUseSeparateWindows() {
        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME,
            Context.MODE_PRIVATE
        )
        val now = 10_000_000L
        prefs.edit()
            .putLong(
                WidgetDataStore.KEY_LAST_SUCCESSFUL_CHECK_AT,
                now - WidgetDataStore.AUTOMATIC_FRESHNESS_MILLIS + 1
            )
            .commit()

        assertTrue(WidgetDataStore.isRecentSuccessfulCheck(context, now))
        assertFalse(
            WidgetDataStore.isRecentSuccessfulCheck(
                context,
                now + WidgetDataStore.AUTOMATIC_FRESHNESS_MILLIS
            )
        )
        assertTrue(WidgetDataStore.tryAcquireManualRefresh(context, now, 10_000L))
        assertFalse(WidgetDataStore.tryAcquireManualRefresh(context, now + 9_999L, 10_000L))
        assertTrue(WidgetDataStore.tryAcquireManualRefresh(context, now + 10_000L, 10_000L))
    }

    @Test
    fun automaticLeaseCoalescesConcurrentWorkersAndExpiresSafely() {
        val now = 20_000_000L

        assertTrue(WidgetDataStore.tryAcquireAutomaticLease(context, "worker-a", now))
        assertFalse(
            WidgetDataStore.tryAcquireAutomaticLease(
                context,
                "worker-b",
                now + WidgetDataStore.AUTOMATIC_LEASE_MILLIS - 1
            )
        )
        assertTrue(
            WidgetDataStore.tryAcquireAutomaticLease(
                context,
                "worker-b",
                now + WidgetDataStore.AUTOMATIC_LEASE_MILLIS
            )
        )
        WidgetDataStore.releaseAutomaticLease(context, "worker-a")
        assertFalse(
            WidgetDataStore.tryAcquireAutomaticLease(
                context,
                "worker-c",
                now + WidgetDataStore.AUTOMATIC_LEASE_MILLIS + 1
            )
        )
        WidgetDataStore.releaseAutomaticLease(context, "worker-b")
        assertTrue(
            WidgetDataStore.tryAcquireAutomaticLease(
                context,
                "worker-c",
                now + WidgetDataStore.AUTOMATIC_LEASE_MILLIS + 1
            )
        )
    }

    private fun observation(
        station: String? = "아암",
        pm10: Double? = 31.0,
        pm25: Double? = 14.0,
        provider: String? = "AIRKOREA",
        source: String? = "observed",
        displayTs: String?
    ) = WidgetDataStore.Observation(
        lat = 37.3925,
        lon = 126.6399,
        region = "인천광역시 연수구",
        station = station,
        pm10 = pm10,
        pm25 = pm25,
        provider = provider,
        source = source,
        displayTs = displayTs
    )
}
