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
    fun pollutantMetadataIsStoredIndependently() {
        val value = observation(displayTs = null).copy(
            pm10Provider = "AIRKOREA",
            pm10Station = "인천 신흥",
            pm10StationId = 10,
            pm10SourceKind = "airkorea_station",
            pm10DisplayTs = "2026-07-28T14:00:00+09:00",
            pm25Provider = "WAQI",
            pm25Station = "Aam",
            pm25StationId = 20,
            pm25SourceKind = "waqi_station",
            pm25DisplayTs = "2026-07-28T13:00:00+09:00"
        )
        WidgetDataStore.saveObservation(context, value, "worker")
        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE
        )
        assertEquals("AIRKOREA", prefs.getString(WidgetDataStore.KEY_PM10_PROVIDER, null))
        assertEquals("WAQI", prefs.getString(WidgetDataStore.KEY_PM25_PROVIDER, null))
        assertEquals(
            "2026-07-28T14:00:00+09:00",
            prefs.getString(WidgetDataStore.KEY_PM10_DISPLAY_TS, null)
        )
        assertEquals(
            "2026-07-28T13:00:00+09:00",
            prefs.getString(WidgetDataStore.KEY_PM25_DISPLAY_TS, null)
        )
    }

    @Test
    fun legacyCommonMetadataIsUsedUntilNewKeysAreWritten() {
        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE
        )
        prefs.edit()
            .putString(WidgetDataStore.KEY_PROVIDER, "AIRKOREA")
            .putString(WidgetDataStore.KEY_STATION, "아암")
            .putString(WidgetDataStore.KEY_DISPLAY_TS, "2026-07-28T12:00:00+09:00")
            .commit()
        assertEquals(
            "AIRKOREA",
            WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM10_PROVIDER, WidgetDataStore.KEY_PROVIDER
            )
        )
        assertEquals(
            "AIRKOREA",
            WidgetDataStore.pollutantString(
                prefs, WidgetDataStore.KEY_PM25_PROVIDER, WidgetDataStore.KEY_PROVIDER
            )
        )
    }

    @Test
    fun rejectedFuturePm10PreservesPm10WhilePm25Updates() {
        val initial = observation(displayTs = null).copy(
            pm10Provider = "AIRKOREA",
            pm10DisplayTs = "2026-07-28T12:00:00+09:00",
            pm25Provider = "WAQI",
            pm25DisplayTs = "2026-07-28T12:00:00+09:00"
        )
        WidgetDataStore.saveObservation(context, initial, "worker")
        val update = initial.copy(
            pm10 = null,
            pm25 = 18.0,
            pm25DisplayTs = "2026-07-28T13:00:00+09:00",
            preservePm10 = true
        )
        WidgetDataStore.saveObservation(context, update, "worker")
        val prefs = context.getSharedPreferences(
            WidgetDataStore.PREFS_NAME, Context.MODE_PRIVATE
        )
        assertEquals(31.0f, prefs.getFloat(WidgetDataStore.KEY_PM10, Float.NaN))
        assertEquals(18.0f, prefs.getFloat(WidgetDataStore.KEY_PM25, Float.NaN))
        assertEquals(
            "2026-07-28T12:00:00+09:00",
            prefs.getString(WidgetDataStore.KEY_PM10_DISPLAY_TS, null)
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
