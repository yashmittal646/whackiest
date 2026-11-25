// The only file that may open the camera. Frames go straight to the model and are never kept.
import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { inView, pose, type Pose } from "@mirror/shared";

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

export async function burst(video: HTMLVideoElement): Promise<Look[]> {
  const at = (p: string) => chrome.runtime.getURL(p);
  const model = await PoseLandmarker.createFromOptions(
    { wasmLoaderPath: at("vision/vision_wasm_internal.js"), wasmBinaryPath: at("vision/vision_wasm_internal.wasm") },
    { baseOptions: { modelAssetPath: at("vision/pose_landmarker_lite.task"), delegate: "CPU" }, runningMode: "IMAGE", numPoses: 2 });
  try {
    const looks: Look[] = [];
    for (let i = 0; i < LOOKS; i++) {
      await new Promise((r) => setTimeout(r, EVERY_MS));
      const all = model.detect(video).landmarks, lm = all[0];
      // With someone else in view, do not judge anyone.
      if (all.length > 1) { looks.push({ seen: true, pose: null }); continue; }
      looks.push({ seen: !!lm && inView(lm), pose: lm ? pose(lm, video.videoWidth / video.videoHeight) : null });
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
