package app.netlify.app_hudadak.twa.widget

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object WidgetRules {
    private val seoulTimeZone: TimeZone = TimeZone.getTimeZone("Asia/Seoul")

    private fun providerDisplayName(provider: String?): String? {
        val value = provider?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        return when {
            value.equals("AIRKOREA", ignoreCase = true) -> "AirKorea"
            value.equals("WAQI", ignoreCase = true) -> "WAQI"
            value.equals("OPENMETEO", ignoreCase = true) ||
                value.equals("OPEN-METEO", ignoreCase = true) -> "Open-Meteo"
            else -> value
        }
    }

    fun stationLabel(
        station: String?,
        provider: String?,
        source: String?
    ): String {
        val displayProvider = providerDisplayName(provider)
        if (
            source.equals("model", ignoreCase = true) ||
            provider.equals("OPENMETEO", ignoreCase = true) ||
            provider.equals("OPEN-METEO", ignoreCase = true)
        ) {
            return displayProvider?.let { "예측($it)" } ?: "예측"
        }
        val stationName = station?.trim()?.takeIf { it.isNotEmpty() }
            ?: return ""
        return displayProvider?.let { "$stationName ($it)" } ?: stationName
    }

    fun providerLabel(provider: String?, source: String?): String {
        val displayProvider = providerDisplayName(provider)
        return when {
            source.equals("model", ignoreCase = true) ->
                "예측(${displayProvider ?: "Open-Meteo"})"
            provider.equals("WAQI", ignoreCase = true) -> "실측(WAQI)"
            provider.equals("AIRKOREA", ignoreCase = true) -> "실측(AirKorea)"
            !displayProvider.isNullOrBlank() -> displayProvider
            !source.isNullOrBlank() -> source
            else -> "출처 미상"
        }
    }

    fun shouldRun(hourInSeoul: Int, widgetCount: Int): Boolean =
        widgetCount > 0 && hourInSeoul in 6..23

    fun parseDisplayTimestamp(value: String?): Long? {
        if (value.isNullOrBlank()) return null
        val normalized = value
            .replace(Regex("Z$"), "+0000")
            .replace(Regex("([+-]\\d{2}):(\\d{2})$"), "$1$2")
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
            "yyyy-MM-dd'T'HH:mm:ssZ",
            "yyyy-MM-dd HH:mm:ss"
        )
        for (pattern in patterns) {
            try {
                return SimpleDateFormat(pattern, Locale.US).apply {
                    isLenient = false
                    timeZone = seoulTimeZone
                }.parse(normalized)?.time
            } catch (_: Exception) {
                // Try the next server timestamp shape.
            }
        }
        return null
    }

    fun isFutureDisplayTs(value: String?, nowMillis: Long): Boolean =
        parseDisplayTimestamp(value)?.let { it > nowMillis } ?: false
}
