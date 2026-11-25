package app.mirror.nativemod

import org.json.JSONObject
import java.util.Calendar
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class Span(val pkg: String, val start: Long, val end: Long)

/** The same scoring as shared/src/score.ts. All numbers come from scoring-spec.json. */
class Score(private val spec: JSONObject, private val apps: JSONObject) {
  private fun part(name: String) = spec.getJSONObject(name)
  private fun ramp(x: Double, full: Double) = min(1.0, max(0.0, x / full))

  fun score(category: String, switchesPerMin: Double, feedMin: Double, hour: Int, slouching: Boolean): Int {
    var s = part("content").getDouble(category)
    s += part("switching").let { it.getDouble("max") * ramp(switchesPerMin, it.getDouble("fullAtPerMin")) }
    if (category != "neutral") {
      s += part("duration").let { it.getDouble("max") * ramp(feedMin, it.getDouble("fullAtMin")) }
      s += part("lateNight").let { if (hour >= it.getInt("startHour") || hour < it.getInt("endHour")) it.getDouble("points") else 0.0 }
    }
    if (slouching) s += part("slouch").getDouble("points")
    return min(100, s.roundToInt())
  }

  private val nudge get() = part("nudge")
  val threshold get() = nudge.getInt("threshold")
  val sustain get() = nudge.getJSONObject("sustainMin").getInt("phone")
  val cooldownMs get() = nudge.getLong("cooldownMin") * 60_000
  val intentMs get() = nudge.getLong("intentMin") * 60_000

  /** Consecutive doom minutes up to `to`, replayed from spans, so nothing is stored between checks. */
  fun doomMinutes(spans: List<Span>, from: Long, to: Long, hourOf: (Long) -> Int = ::localHour): Int {
    val window = spec.getInt("windowMin")
    val fullFeed = part("duration").getDouble("fullAtMin")
    val sorted = spans.sortedBy { it.start }
    val recent = ArrayDeque<Int>()
    var feed = 0.0
    var above = 0
    var last = ""
    var t = from
    while (t + 60_000 <= to) {
      val end = t + 60_000
      val time = LinkedHashMap<String, Long>()
      var switches = 0
      for (s in sorted) {
        if (s.start >= end) break
        if (s.end <= t) continue
        time[s.pkg] = (time[s.pkg] ?: 0L) + min(s.end, end) - max(s.start, t)
        if (s.start >= t && s.pkg != last) switches++
        last = s.pkg
      }
      val active = time.values.sum() >= 30_000
      val main = time.entries.maxByOrNull { it.value }?.key ?: ""
      val category = apps.optString(main, "neutral")
      recent.addLast(if (active) switches else 0)
      if (recent.size > window) recent.removeFirst()
      feed = if (active && category != "neutral") min(feed + 1, fullFeed) else max(0.0, feed - 3)
      val doom = active && score(category, recent.sum().toDouble() / window, feed, hourOf(t), false) >= threshold
      above = if (doom) above + 1 else 0
      t = end
    }
    return above
  }
}

fun localHour(t: Long): Int = Calendar.getInstance().apply { timeInMillis = t }.get(Calendar.HOUR_OF_DAY)
