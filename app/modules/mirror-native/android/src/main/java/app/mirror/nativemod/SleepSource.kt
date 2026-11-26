package app.mirror.nativemod

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.health.connect.HealthConnectException
import android.health.connect.HealthConnectManager
import android.health.connect.ReadRecordsRequestUsingFilters
import android.health.connect.ReadRecordsResponse
import android.health.connect.TimeInstantRangeFilter
import android.health.connect.datatypes.SleepSessionRecord
import android.health.connect.datatypes.SleepSessionRecord.StageType
import android.os.Build
import android.os.Bundle
import android.os.OutcomeReceiver
import android.widget.TextView
import androidx.annotation.RequiresApi
import java.time.Instant

object SleepSource {
  const val PERMISSION = "android.permission.health.READ_SLEEP"
  val supported get() = Build.VERSION.SDK_INT >= 34
  fun allowed(c: Context) = supported && c.checkSelfPermission(PERMISSION) == PackageManager.PERMISSION_GRANTED

  /** Times asleep only. Sleep stages are used to leave out time awake, then dropped. */
  @RequiresApi(34)
  fun read(c: Context, from: Long, to: Long, done: (List<Map<String, Double>>) -> Unit, fail: (String) -> Unit) {
    val asleep = setOf(StageType.STAGE_TYPE_SLEEPING, StageType.STAGE_TYPE_SLEEPING_LIGHT, StageType.STAGE_TYPE_SLEEPING_DEEP, StageType.STAGE_TYPE_SLEEPING_REM)
    val range = TimeInstantRangeFilter.Builder().setStartTime(Instant.ofEpochMilli(from)).setEndTime(Instant.ofEpochMilli(to)).build()
    val request = ReadRecordsRequestUsingFilters.Builder(SleepSessionRecord::class.java).setTimeRangeFilter(range).setPageSize(1000).build()
    fun span(s: SleepSessionRecord, a: Instant, b: Instant) = mapOf("session" to s.startTime.toEpochMilli().toDouble(), "start" to a.toEpochMilli().toDouble(), "end" to b.toEpochMilli().toDouble())
    c.getSystemService(HealthConnectManager::class.java).readRecords(request, c.mainExecutor, object : OutcomeReceiver<ReadRecordsResponse<SleepSessionRecord>, HealthConnectException> {
      override fun onResult(r: ReadRecordsResponse<SleepSessionRecord>) = done(r.records.flatMap { s ->
        val staged = s.stages.filter { it.type in asleep }
        if (staged.isEmpty()) listOf(span(s, s.startTime, s.endTime)) else staged.map { span(s, it.startTime, it.endTime) }
      })
      override fun onError(e: HealthConnectException) = fail(e.message ?: "Health Connect could not be read.")
    })
  }
}

/** Android shows this when someone asks why Mirror reads sleep. */
class SleepInfoActivity : Activity() {
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    setContentView(TextView(this).apply {
      setPadding(64, 160, 64, 64)
      textSize = 18f
      text = "Mirror reads when you were asleep so it can show how late scrolling lines up with sleep. It keeps minutes asleep per night. Health Connect data is never changed. If you connect an account, the nightly total is encrypted on this phone before upload."
    })
  }
}
