package app.netlify.app_hudadak.twa.widget

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object WidgetRules {
    private val seoulTimeZone: TimeZone = TimeZone.getTimeZone("Asia/Seoul")

    fun providerLabel(provider: String?, source: String?): String {
        return when {
            provider.equals("WAQI", ignoreCase = true) -> "실측(WAQI)"
            provider.equals("AIRKOREA", ignoreCase = true) -> "실측(AirKorea)"
            provider.equals("OPENMETEO", ignoreCase = true) ||
                provider.equals("OPEN-METEO", ignoreCase = true) ||
                source.equals("model", ignoreCase = true) -> "예측(Open-Meteo)"
            !provider.isNullOrBlank() -> provider
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
