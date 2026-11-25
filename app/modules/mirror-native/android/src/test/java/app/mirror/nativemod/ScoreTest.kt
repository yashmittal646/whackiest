package app.mirror.nativemod

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ScoreTest {
  private fun shared(name: String): String {
    var d: File? = File("").absoluteFile
    while (d != null && !File(d, "shared/$name").exists()) d = d.parentFile
    return File(d, "shared/$name").readText()
  }
  private val s = Score(JSONObject(shared("scoring-spec.json")), JSONObject("""{"feed":"social"}"""))
  private val m = 60_000L

  @Test fun sharedVectors() {
    val all = JSONArray(shared("test-vectors.json"))
    assertTrue(all.length() > 0)
    for (n in 0 until all.length()) {
      val v = all.getJSONObject(n)
      val i = v.getJSONObject("input")
      val got = s.score(i.getString("category"), i.getDouble("switchesPerMin"), i.getDouble("feedMin"), i.getInt("hour"), i.optBoolean("slouching", false))
      assertTrue("${v.getString("name")}: $got", got >= v.getInt("min") && got <= v.getInt("max"))
    }
  }

  @Test fun lateScrollingCounts() = assertEquals(29, s.doomMinutes(listOf(Span("feed", 0, 33 * m)), 0, 33 * m) { 23 })
  @Test fun workNeverCounts() = assertEquals(0, s.doomMinutes(listOf(Span("docs", 0, 80 * m)), 0, 80 * m) { 23 })
  @Test fun aPauseResets() = assertEquals(0, s.doomMinutes(listOf(Span("feed", 0, 40 * m)), 0, 45 * m) { 23 })
}
