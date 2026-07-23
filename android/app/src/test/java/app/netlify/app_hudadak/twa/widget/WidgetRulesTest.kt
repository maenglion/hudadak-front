package app.netlify.app_hudadak.twa.widget

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WidgetRulesTest {
    @Test
    fun providerLabelsUseActualProvider() {
        assertEquals("실측(WAQI)", WidgetRules.providerLabel("WAQI", "db"))
        assertEquals("실측(AirKorea)", WidgetRules.providerLabel("AIRKOREA", "db"))
        assertEquals("예측(Open-Meteo)", WidgetRules.providerLabel("OPENMETEO", "model"))
        assertEquals("예측(Open-Meteo)", WidgetRules.providerLabel(null, "model"))
        assertEquals("CUSTOM", WidgetRules.providerLabel("CUSTOM", "db"))
    }

    @Test
    fun futureDisplayTimestampIsRejected() {
        val now = WidgetRules.parseDisplayTimestamp("2026-07-23T12:00:00+09:00")!!
        assertTrue(WidgetRules.isFutureDisplayTs("2026-07-23T12:00:01+09:00", now))
    }

    @Test
    fun currentAndPastDisplayTimestampsAreAllowed() {
        val now = WidgetRules.parseDisplayTimestamp("2026-07-23T12:00:00+09:00")!!
        assertFalse(WidgetRules.isFutureDisplayTs("2026-07-23T12:00:00+09:00", now))
        assertFalse(WidgetRules.isFutureDisplayTs("2026-07-23T11:59:59+09:00", now))
    }

    @Test
    fun nighttimeSkipsNetworkWork() {
        assertFalse(WidgetRules.shouldRun(0, 1))
        assertFalse(WidgetRules.shouldRun(5, 1))
        assertTrue(WidgetRules.shouldRun(6, 1))
        assertTrue(WidgetRules.shouldRun(23, 1))
    }

    @Test
    fun noInstalledWidgetSkipsNetworkWork() {
        assertFalse(WidgetRules.shouldRun(12, 0))
    }
}
