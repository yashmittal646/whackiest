package app.mirror.nativemod

import org.json.JSONObject

data class Act(val kind: String, val label: String)

/** The same sorting as phoneActivity in shared/src/phone.ts, from shared/phone-apps.json. */
class Apps(private val phone: JSONObject, private val categories: JSONObject) {
  private val study = phone.getJSONObject("study")
  private val names = phone.getJSONObject("names")
  private val words = Regex(phone.getString("studyWords"), RegexOption.IGNORE_CASE)
  val videoApp: String = phone.getString("videoApp")

  fun kind(pkg: String, title: String?): Act {
    if (study.has(pkg)) return Act("study", "Studying: ${study.getString(pkg)}")
    if (pkg == videoApp) {
      if (title == null) return Act("other", "YouTube")
      return if (words.containsMatchIn(title)) Act("study", "Learning on YouTube") else Act("waste", "Watching YouTube")
    }
    val category = categories.optString(pkg, "neutral")
    if (category == "neutral") return Act("other", "")
    return Act(if (category == "news") "news" else "waste", names.optString(pkg, "A feed"))
  }

  fun studyName(pkg: String): String? = if (study.has(pkg)) study.getString(pkg) else null
}
