package app.mirror.nativemod

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarker
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.nio.ByteBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The front camera, shown live while this view is on screen, with a pose look about every 400 ms.
 * Frames stay in memory and are dropped; only landmark points go to JavaScript, to be turned into proportions.
 */
class PostureView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onLook by EventDispatcher()
  private val onFace by EventDispatcher()
  private val onProblem by EventDispatcher()
  private val preview = PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER }
  private var worker: ExecutorService? = null
  /** "pose" for posture, "face" for the eyes-and-face check. Set before the view is shown. */
  var mode = "pose"
  private var model: PoseLandmarker? = null
  private var faces: FaceLandmarker? = null
  private var camera: ProcessCameraProvider? = null
  private var last = 0L

  init { addView(preview, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)) }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    preview.layout(0, 0, r - l, b - t)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    val w = Executors.newSingleThreadExecutor().also { worker = it }
    w.execute {
      try {
        val bytes = context.assets.open(if (mode == "face") "face_landmarker.task" else "pose_landmarker_full.task").use { it.readBytes() }
        val buffer = ByteBuffer.allocateDirect(bytes.size).apply { put(bytes); rewind() }
        val base = BaseOptions.builder().setModelAssetBuffer(buffer).build()
        if (mode == "face") faces = FaceLandmarker.createFromOptions(context, FaceLandmarker.FaceLandmarkerOptions.builder()
          .setBaseOptions(base).setRunningMode(RunningMode.IMAGE).setNumFaces(2).setOutputFaceBlendshapes(true).build())
        else model = PoseLandmarker.createFromOptions(context, PoseLandmarker.PoseLandmarkerOptions.builder()
          .setBaseOptions(base).setRunningMode(RunningMode.IMAGE).setNumPoses(2).build())
        post { open(w) }
      } catch (e: Throwable) { problem(e.message ?: "The posture model could not start.") }
    }
  }

  private fun open(w: ExecutorService) {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return problem("Open Mirror first.")
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        if (worker !== w) return@addListener
        val p = Preview.Builder().build().also { it.surfaceProvider = preview.surfaceProvider }
        val a = ImageAnalysis.Builder().setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888).setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
        a.setAnalyzer(w) { image -> image.use { look(it) } }
        camera = future.get().also { it.unbindAll(); it.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, p, a) }
      } catch (e: Exception) { problem(e.message ?: "The camera could not open.") }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun upright(image: ImageProxy): Bitmap {
    val raw = image.toBitmap()
    val turn = Matrix().apply { postRotate(image.imageInfo.rotationDegrees.toFloat()) }
    return Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, turn, true).copy(Bitmap.Config.ARGB_8888, false)
  }

  /** About 15 looks a second: blendshape scores and six face points only. */
  private fun lookFace(image: ImageProxy, f: FaceLandmarker) {
    val now = System.currentTimeMillis()
    if (now - last < 60) return
    last = now
    val b = upright(image)
    val r = f.detect(BitmapImageBuilder(b).build())
    val one = r.faceLandmarks().size == 1
    val keep = setOf("eyeBlinkLeft", "eyeBlinkRight", "jawOpen", "mouthSmileLeft", "mouthSmileRight", "browDownLeft", "browDownRight", "mouthFrownLeft", "mouthFrownRight")
    val shapes = if (one) r.faceBlendshapes().orElse(null)?.firstOrNull()?.filter { it.categoryName() in keep }?.associate { it.categoryName() to it.score().toDouble() } ?: emptyMap() else emptyMap()
    val points = if (one) listOf(1, 33, 263, 152, 234, 454).associate { i -> i.toString() to r.faceLandmarks()[0][i].let { mapOf("x" to it.x().toDouble(), "y" to it.y().toDouble()) } } else emptyMap()
    val aspect = b.width.toDouble() / b.height
    post { onFace(mapOf("t" to now.toDouble(), "faces" to r.faceLandmarks().size, "aspect" to aspect, "shapes" to shapes, "points" to points)) }
  }

  private fun look(image: ImageProxy) {
    faces?.let { return lookFace(image, it) }
    val m = model ?: return
    val now = System.currentTimeMillis()
    if (now - last < 400) return
    last = now
    val b = upright(image)
    val people = m.detect(BitmapImageBuilder(b).build()).landmarks()
    // With someone else in view, do not judge anyone.
    val points = if (people.size == 1) people[0].take(13).map { mapOf("x" to it.x().toDouble(), "y" to it.y().toDouble(), "visibility" to it.visibility().orElse(0f).toDouble()) } else emptyList()
    val aspect = b.width.toDouble() / b.height
    post { onLook(mapOf("aspect" to aspect, "people" to people.size, "points" to points)) }
  }

  private fun problem(text: String) { post { onProblem(mapOf("message" to text)) } }

  override fun onDetachedFromWindow() {
    camera?.unbindAll()
    camera = null
    worker?.let { w -> w.execute { model?.close(); model = null; faces?.close(); faces = null }; w.shutdown() }
    worker = null
    super.onDetachedFromWindow()
  }
}
