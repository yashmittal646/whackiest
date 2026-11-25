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

    fun nudge(c: Context, test: Boolean) {
      val b = Notification.Builder(c, "nudge").setSmallIcon(R.drawable.mirror_eye)
        .setContentTitle(if (test) "Mirror (test)" else "Mirror")
        .setContentText("You've been scrolling for a while. Still what you came for?")
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
      engine()?.let { prefs(this).edit().putLong("intentUntil", System.currentTimeMillis() + it.intentMs).apply() }
      getSystemService(NotificationManager::class.java).cancel(NUDGE)
    }
    handler.removeCallbacks(tick)
    handler.post(tick)
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
}
