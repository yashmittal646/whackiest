package app.mirror.nativemod

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

class MirrorNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun b64(b: ByteArray): String = Base64.encodeToString(b, Base64.NO_WRAP)
  private fun raw(s: String): ByteArray = Base64.decode(s, Base64.NO_WRAP)

  override fun definition() = ModuleDefinition {
    Name("MirrorNative")

    // Crypto primitives come from Android itself. Bytes cross as base64.
    Function("random") { n: Int -> b64(ByteArray(n).also { SecureRandom().nextBytes(it) }) }

    AsyncFunction("pbkdf2") { password: String, salt: String, iterations: Int ->
      val chars = String(raw(password), Charsets.UTF_8).toCharArray()
      val spec = PBEKeySpec(chars, raw(salt), iterations, 256)
      b64(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded)
    }

    AsyncFunction("gcm") { encrypt: Boolean, key: String, iv: String, aad: String, data: String ->
      val c = Cipher.getInstance("AES/GCM/NoPadding")
      c.init(if (encrypt) Cipher.ENCRYPT_MODE else Cipher.DECRYPT_MODE, SecretKeySpec(raw(key), "AES"), GCMParameterSpec(128, raw(iv)))
      c.updateAAD(raw(aad))
      b64(c.doFinal(raw(data)))
    }

    AsyncFunction("hmac") { key: String, data: String ->
      val m = Mac.getInstance("HmacSHA256")
      m.init(SecretKeySpec(raw(key), "HmacSHA256"))
      b64(m.doFinal(raw(data)))
    }

    Function("hasUsageAccess") {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
    }

    Function("openUsageSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Foreground spans between two times. Returned to JS, used in memory, never stored. */
    AsyncFunction("usage") { from: Double, to: Double ->
      val start = from.toLong()
      val end = to.toLong()
      val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
      // Look back two hours so an app already open at the start is seen.
      val events = manager.queryEvents(start - 2 * 3600_000L, end)
      val out = mutableListOf<Map<String, Any>>()
      var pkg: String? = null
      var since = 0L
      fun close(at: Long) {
        val p = pkg
        if (p != null && at > start && at > since) out.add(mapOf("pkg" to p, "start" to maxOf(since, start).toDouble(), "end" to at.toDouble()))
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
      out
    }
  }
}
