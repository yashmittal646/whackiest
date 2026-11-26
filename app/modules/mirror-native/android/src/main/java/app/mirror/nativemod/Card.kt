package app.mirror.nativemod

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The nudge you cannot miss: a card drawn over whatever app is open, the phone version of the laptop card.
 * Needs "Display over other apps". It reads nothing from the app underneath.
 */
object Card {
  private var shown: View? = null
  private val main = Handler(Looper.getMainLooper())

  fun allowed(c: Context) = Settings.canDrawOverlays(c)

  private fun media(c: Context, code: Int) {
    val audio = c.getSystemService(AudioManager::class.java)
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
    audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
  }

  /** `back` is the study app to return to, if there was one. `onPurpose` pauses nudges. Returns false if not allowed. */
  fun show(c: Context, title: String, text: String, back: String?, backName: String?, test: Boolean, onPurpose: () -> Unit): Boolean {
    if (!allowed(c)) return false
    main.post {
      hide(c)
      val dp = { v: Int -> TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), c.resources.displayMetrics).toInt() }
      val ink = Color.parseColor("#17101F")
      val playing = c.getSystemService(AudioManager::class.java).isMusicActive
      if (playing) media(c, KeyEvent.KEYCODE_MEDIA_PAUSE)
      val wm = c.getSystemService(WindowManager::class.java)
      val dim = FrameLayout(c).apply { setBackgroundColor(Color.parseColor("#C717101F")) }
      val card = LinearLayout(c).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(24), dp(24), dp(24), dp(22))
        background = GradientDrawable().apply { setColor(Color.parseColor("#FFD447")); setStroke(dp(4), Color.parseColor("#FF4A26")) }
        elevation = dp(12).toFloat()
      }
      fun text(s: String, size: Float, bold: Boolean, bottom: Int) = TextView(c).apply {
        this.text = s; setTextColor(ink); setTextSize(TypedValue.COMPLEX_UNIT_SP, size)
        typeface = if (bold) Typeface.create("sans-serif-black", Typeface.BOLD) else Typeface.DEFAULT
        setPadding(0, 0, 0, dp(bottom))
      }
      card.addView(text(if (test) "MIRROR (TEST)" else "MIRROR", 12f, true, 10).apply { letterSpacing = 0.15f })
      card.addView(text(title.uppercase(), 34f, true, 10).apply { setLineSpacing(0f, 0.9f) })
      card.addView(text(text, 17f, false, 20))
      fun button(label: String, filled: Boolean, act: () -> Unit) = Button(c).apply {
        this.text = label; isAllCaps = false; setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f); typeface = Typeface.DEFAULT_BOLD
        setTextColor(if (filled) Color.WHITE else ink)
        background = GradientDrawable().apply { setColor(if (filled) ink else Color.TRANSPARENT); setStroke(dp(3), ink) }
        setOnClickListener { hide(c); act() }
        card.addView(this, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54)).apply { topMargin = dp(10) })
      }
      val home = { c.startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      val open = back?.let { c.packageManager.getLaunchIntentForPackage(it) }
      if (open != null) button("Back to ${backName ?: "studying"}", true) { c.startActivity(open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      button("Close this app", open == null) { home() }
      button("I'm here on purpose", false) { onPurpose(); if (playing) media(c, KeyEvent.KEYCODE_MEDIA_PLAY) }
      dim.addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply { setMargins(dp(20), 0, dp(20), 0) })
      card.scaleX = 0.7f; card.scaleY = 0.7f; card.alpha = 0f
      card.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(320).start()
      val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT)
      wm.addView(dim, params)
      shown = dim
    }
    return true
  }

  fun hide(c: Context) {
    shown?.let { v -> try { c.getSystemService(WindowManager::class.java).removeView(v) } catch (_: Exception) {} }
    shown = null
  }
}
