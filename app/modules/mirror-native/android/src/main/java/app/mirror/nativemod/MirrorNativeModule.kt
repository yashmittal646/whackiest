package app.mirror.nativemod

import android.content.Context
import android.content.Intent
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

    Function("hasUsageAccess") { Usage.allowed(context) }

    Function("openUsageSettings") {
      context.startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Foreground spans between two times. Returned to JS, used in memory, never stored. */
    AsyncFunction("usage") { from: Double, to: Double ->
      Usage.spans(context, from.toLong(), to.toLong()).map { mapOf("pkg" to it.pkg, "start" to it.start.toDouble(), "end" to it.end.toDouble()) }
    }

    /** Live nudges. `config` holds the scoring spec and the app categories. */
    AsyncFunction("startWatch") { config: String ->
      WatchService.prefs(context).edit().putString("config", config).putBoolean("on", true).commit()
      WatchService.start(context)
      Unit
    }
    AsyncFunction("stopWatch") { forget: Boolean ->
      val edit = WatchService.prefs(context).edit()
      (if (forget) edit.clear() else edit.putBoolean("on", false)).commit()
      WatchService.stop(context)
    }
    Function("watchOn") { WatchService.prefs(context).getBoolean("on", false) }
    Function("testNudge") { WatchService.nudge(context, true) }
  }
}
