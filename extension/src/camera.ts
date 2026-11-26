// The only file that may open the camera. Frames go straight to the model and are never kept.
import { FaceLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { BLINK_SEC, faceFrame, inView, pose, type EyeFrame, type FaceFrame, type Point, type Pose } from "@mirror/shared";

// MediaPipe prints routine status lines through console.error, which Chrome lists as extension errors.
const NOISE = /^(INFO:|[IWE]\d{4} \d|Graph (successfully|finished))/;
for (const k of ["log", "info", "warn", "error"] as const) {
  const write = console[k].bind(console);
  console[k] = (...a: unknown[]) => { if (typeof a[0] === "string" && NOISE.test(a[0])) return; write(...a); };
}

export interface Look { seen: boolean; pose: Pose | null }
const LOOKS = 12, EVERY_MS = 500; // 6 seconds at 2 fps

export async function openCamera(video: HTMLVideoElement): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  const close = () => { for (const t of stream.getTracks()) t.stop(); video.srcObject = null; };
  try { await video.play(); } catch (e) { close(); throw e; }
  return close;
}

const at = (p: string) => chrome.runtime.getURL(p);
const WASM = () => ({ wasmLoaderPath: at("vision/vision_wasm_internal.js"), wasmBinaryPath: at("vision/vision_wasm_internal.wasm") });

/** Twenty seconds of the face, reduced frame by frame to numbers. Frames and landmarks are not kept. */
export async function watchEyes(video: HTMLVideoElement): Promise<{ eyes: EyeFrame[]; face: (FaceFrame | null)[] }> {
  const model = await FaceLandmarker.createFromOptions(WASM(), { baseOptions: { modelAssetPath: at("vision/face_landmarker.task"), delegate: "CPU" }, runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: true });
  try {
    const frames: EyeFrame[] = [], face: (FaceFrame | null)[] = [], end = performance.now() + BLINK_SEC * 1000;
    for (let shown = -1; performance.now() < end; await new Promise((r) => setTimeout(r, 8))) {
      if (video.currentTime === shown) continue;
      shown = video.currentTime;
      const t = performance.now(), got = model.detectForVideo(video, t), faces = got.faceBlendshapes;
      const score = (name: string) => faces[0]?.categories.find((c) => c.categoryName === name)?.score ?? 0;
      // With someone else in view, do not judge anyone.
      const one = faces.length === 1 && got.faceLandmarks.length === 1;
      frames.push({ t, shut: one ? (score("eyeBlinkLeft") + score("eyeBlinkRight")) / 2 : null });
      face.push(one ? faceFrame(t, Object.fromEntries(faces[0]!.categories.map((c) => [c.categoryName, c.score])), got.faceLandmarks[0]!, video.videoWidth / video.videoHeight) : null);
    }
    return { eyes: frames, face };
  } finally { model.close(); }
}

export const poseModel = () => PoseLandmarker.createFromOptions(WASM(),
  // The full model is slower than lite but far steadier; video mode tracks the person between looks.
  { baseOptions: { modelAssetPath: at("vision/pose_landmarker_full.task"), delegate: "CPU" }, runningMode: "VIDEO", numPoses: 2, minPoseDetectionConfidence: 0.6, minTrackingConfidence: 0.6 });

/** One look. The points are returned only so the posture page can draw them; they are not stored. */
export function look(model: PoseLandmarker, video: HTMLVideoElement): Look & { points: Point[] | null } {
  const all = model.detectForVideo(video, performance.now()).landmarks, lm = all[0] ?? null;
  // With someone else in view, do not judge anyone.
  if (all.length > 1) return { seen: true, pose: null, points: null };
  return { seen: !!lm && inView(lm), pose: lm ? pose(lm, video.videoWidth / video.videoHeight) : null, points: lm };
}

export async function burst(video: HTMLVideoElement): Promise<Look[]> {
  const model = await poseModel();
  try {
    const looks: Look[] = [];
    for (let i = 0; i < LOOKS; i++) {
      await new Promise((r) => setTimeout(r, EVERY_MS));
      const { seen, pose } = look(model, video);
      looks.push({ seen, pose });
    }
    return looks;
  } finally { model.close(); }
}

export function explain(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  if (name === "NotAllowedError") return "Camera access is blocked. Allow it for Mirror in Chrome's site settings.";
  if (name === "NotFoundError") return "No camera was found.";
  if (name === "NotReadableError") return "Another app is using the camera.";
  console.error(e);
  return "The camera check failed.";
}
