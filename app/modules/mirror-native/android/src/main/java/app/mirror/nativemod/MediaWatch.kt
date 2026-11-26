package app.mirror.nativemod

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaSessionManager
import android.provider.Settings
import android.service.notification.NotificationListenerService

/**
 * Android shares what media is playing only with apps that have notification access, so Mirror declares
 * this listener. It ignores every notification; it exists only so the playing video's title can be read.
 */
class MediaWatch : NotificationListenerService() {
  companion object {
    fun allowed(c: Context): Boolean =
      Settings.Secure.getString(c.contentResolver, "enabled_notification_listeners")?.contains(ComponentName(c, MediaWatch::class.java).flattenToString()) == true

    /** The title of what `pkg` is playing right now, used once to sort it and then dropped. */
    fun title(c: Context, pkg: String): String? {
      if (!allowed(c)) return null
      return try {
        c.getSystemService(MediaSessionManager::class.java).getActiveSessions(ComponentName(c, MediaWatch::class.java))
          .firstOrNull { it.packageName == pkg }?.metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)
      } catch (e: SecurityException) { null }
    }
  }
}
