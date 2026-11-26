package app.mirror.nativemod

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** The phone's watcher must sort apps exactly like shared/src/phone.ts does. */
class AppsTest {
  private fun shared(name: String): String {
    var d: File? = File("").absoluteFile
    while (d != null && !File(d, "shared/$name").exists()) d = d.parentFile
    return File(d, "shared/$name").readText()
  }
  private val a = Apps(JSONObject(shared("phone-apps.json")), JSONObject("""{"com.instagram.android":"social","com.netflix.mediaclient":"video","com.ndtv.india":"news"}"""))

  @Test fun sorts() {
    assertEquals(Act("study", "Studying: Google Drive"), a.kind("com.google.android.apps.docs", null))
    assertEquals(Act("waste", "Instagram"), a.kind("com.instagram.android", null))
    assertEquals(Act("waste", "Netflix"), a.kind("com.netflix.mediaclient", null))
    assertEquals(Act("news", "A feed"), a.kind("com.ndtv.india", null))
    assertEquals(Act("other", "YouTube"), a.kind("com.google.android.youtube", null))
    assertEquals(Act("study", "Learning on YouTube"), a.kind("com.google.android.youtube", "Thermodynamics Lecture 3 | JEE"))
    assertEquals(Act("waste", "Watching YouTube"), a.kind("com.google.android.youtube", "Best fails 2026"))
    assertEquals(Act("other", ""), a.kind("com.android.chrome", null))
  }
}
