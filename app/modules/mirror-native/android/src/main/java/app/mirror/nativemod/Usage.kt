package app.mirror.nativemod

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process

object Usage {
  fun allowed(context: Context): Boolean {
    val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    @Suppress("DEPRECATION")
    return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
  }

  /** Foreground spans between two times, in memory only. */
  fun spans(context: Context, start: Long, end: Long): List<Span> {
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    // Look back two hours so an app already open at the start is seen.
    val events = manager.queryEvents(start - 2 * 3600_000L, end)
    val out = mutableListOf<Span>()
    var pkg: String? = null
    var since = 0L
    fun close(at: Long) {
      val p = pkg
      if (p != null && at > start && at > since) out.add(Span(p, maxOf(since, start), at))
      pkg = null
    }
    val e = UsageEvents.Event()
    while (events != null && events.hasNextEvent()) {
      events.getNextEvent(e)
      when (e.eventType) {
        UsageEvents.Event.ACTIVITY_RESUMED -> if (e.packageName != pkg) {
          close(e.timeStamp)
          pkg = e.packageName
          since = e.timeStamp
        }
        UsageEvents.Event.ACTIVITY_PAUSED -> if (e.packageName == pkg) close(e.timeStamp)
        UsageEvents.Event.SCREEN_NON_INTERACTIVE, UsageEvents.Event.KEYGUARD_SHOWN, UsageEvents.Event.DEVICE_SHUTDOWN -> close(e.timeStamp)
      }
    }
    close(end)
    return out
  }
}
