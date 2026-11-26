package app.mirror.nativemod

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import org.json.JSONObject

/** Checks once a minute, while the screen is on, whether a nudge is due. Stores no app names. */
class WatchService : Service() {
  companion object {
    private const val WATCH = 1
    private const val NUDGE = 2
    private const val INTENT = "app.mirror.INTENT"
    private const val LOOK_BACK = 90 * 60_000L

    fun prefs(c: Context) = c.getSharedPreferences("watch", MODE_PRIVATE)
    fun start(c: Context) = c.startForegroundService(Intent(c, WatchService::class.java))
    fun stop(c: Context) {
      c.stopService(Intent(c, WatchService::class.java))
      c.getSystemService(NotificationManager::class.java).cancel(NUDGE)
    }

    private fun channels(c: Context) = c.getSystemService(NotificationManager::class.java).apply {
      createNotificationChannel(NotificationChannel("watch", "Watching", NotificationManager.IMPORTANCE_LOW))
      createNotificationChannel(NotificationChannel("nudge", "Nudges", NotificationManager.IMPORTANCE_HIGH))
    }
    private fun open(c: Context): PendingIntent =
      PendingIntent.getActivity(c, 0, c.packageManager.getLaunchIntentForPackage(c.packageName)!!, PendingIntent.FLAG_IMMUTABLE)

    private fun setIntent(c: Context) {
      val ms = prefs(c).getString("config", null)?.let { JSONObject(it).getJSONObject("spec").getJSONObject("nudge").getLong("intentMin") * 60_000 } ?: 1_200_000
      prefs(c).edit().putLong("intentUntil", System.currentTimeMillis() + ms).apply()
    }

    /** The card over the current app when allowed, otherwise a pop-up notification. */
    fun nudge(c: Context, test: Boolean, title: String = "Still what you came for?", text: String = "You've been scrolling for a while.", back: String? = null, backName: String? = null) {
      if (Card.show(c, title, text, back, backName, test) { if (!test) setIntent(c) }) return
      val b = Notification.Builder(c, "nudge").setSmallIcon(R.drawable.mirror_eye)
        .setContentTitle(if (test) "Mirror (test)" else "Mirror")
        .setContentText("$text $title")
        .setContentIntent(open(c)).setAutoCancel(true)
      if (!test) {
        val on = PendingIntent.getService(c, 1, Intent(c, WatchService::class.java).setAction(INTENT), PendingIntent.FLAG_IMMUTABLE)
        b.addAction(Notification.Action.Builder(null, "I'm here on purpose", on).build())
      }
      channels(c).notify(NUDGE, b.build())
    }
  }

  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private val tick = object : Runnable {
    override fun run() {
      try { check() } catch (e: Exception) { Log.e("Mirror", "Check failed", e) }
      handler.postDelayed(this, 60_000)
    }
  }
  private val quick = object : Runnable {
    override fun run() {
      try { switchCheck() } catch (e: Exception) { Log.e("Mirror", "Switch check failed", e) }
      handler.postDelayed(this, 5_000)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("mirror-watch").apply { start() }
    handler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    channels(this)
    val n = Notification.Builder(this, "watch").setSmallIcon(R.drawable.mirror_eye)
      .setContentTitle("Mirror is watching the scroll").setContentText("Nudge checks stay on this phone.")
      .setContentIntent(open(this)).setOngoing(true).build()
    if (Build.VERSION.SDK_INT >= 34) startForeground(WATCH, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE) else startForeground(WATCH, n)
    if (!prefs(this).getBoolean("on", false)) { stopSelf(); return START_NOT_STICKY }
    if (intent?.action == INTENT) {
      setIntent(this)
      getSystemService(NotificationManager::class.java).cancel(NUDGE)
    }
    handler.removeCallbacks(tick)
    handler.removeCallbacks(quick)
    handler.post(tick)
    handler.postDelayed(quick, 5_000)
    return START_STICKY
  }

  override fun onDestroy() {
    thread.quit()
    super.onDestroy()
  }

  private fun engine(): Score? = prefs(this).getString("config", null)?.let { val j = JSONObject(it); Score(j.getJSONObject("spec"), j.getJSONObject("apps")) }

  private fun check() {
    if (!getSystemService(PowerManager::class.java).isInteractive || !Usage.allowed(this)) return
    val p = prefs(this)
    val now = System.currentTimeMillis()
    val s = engine() ?: return
    if (now < p.getLong("intentUntil", 0) || now - p.getLong("lastNudge", 0) < s.cooldownMs) return
    val to = now / 60_000 * 60_000
    if (s.doomMinutes(Usage.spans(this, to - LOOK_BACK, to), to - LOOK_BACK, to) < s.sustain) return
    p.edit().putLong("lastNudge", now).apply()
    nudge(this, false)
  }

  private fun apps(): Apps? = prefs(this).getString("config", null)?.let { val j = JSONObject(it); if (j.has("phone")) Apps(j.getJSONObject("phone"), j.getJSONObject("apps")) else null }

  /**
   * Every 5 seconds: has the person been on a time-waster for 25 seconds since arriving there?
   * Looks at the last 15 minutes of app switches; app names stay in memory.
   */
  private fun switchCheck() {
    val p = prefs(this)
    if (!p.getBoolean("alerts", true) || !getSystemService(PowerManager::class.java).isInteractive || !Usage.allowed(this)) return
    val a = apps() ?: return
    val spec = JSONObject(p.getString("config", "{}")!!).getJSONObject("spec")
    val now = System.currentTimeMillis()
    val spans = Usage.spans(this, now - 15 * 60_000, now)
    val cur = spans.lastOrNull() ?: return
    if (cur.end < now - 2_000 || cur.pkg == packageName) return
    // Arrival: where this app's run began, joining brief interruptions such as the notification shade.
    var since = cur.start
    for (s in spans.dropLast(1).reversed()) { if (s.pkg == cur.pkg && since - s.end < 3_000) since = s.start else break }
    if (now - since < spec.getLong("switchAlertSec") * 1000 || p.getLong("alertedSince", 0) == since) return
    val act = a.kind(cur.pkg, if (cur.pkg == a.videoApp) MediaWatch.title(this, cur.pkg) else null)
    if (act.kind != "waste") return
    if (now < p.getLong("intentUntil", 0) || now - p.getLong("lastAlert", 0) < spec.getLong("switchAlertGapMin") * 60_000) return
    p.edit().putLong("alertedSince", since).putLong("lastAlert", now).apply()
    val study = spans.lastOrNull { it.end <= since + 1_000 && it.end >= since - 2 * 60_000 && a.studyName(it.pkg) != null }
    val was = if (study != null) " You were in ${a.studyName(study.pkg)} a moment ago." else ""
    nudge(this, false, "Still what you came for?", "${act.label} for ${spec.getLong("switchAlertSec")} seconds.$was", study?.pkg, study?.let { a.studyName(it.pkg) })
  }
}
