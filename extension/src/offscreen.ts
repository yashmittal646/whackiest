import { blinkRate, faceState, judge, type FaceState, type Pose, type Reading, type Strictness } from "@mirror/shared";
import { burst, explain, openCamera, watchEyes } from "./camera.ts";
import { $ } from "./dom.ts";
import { send } from "./store.ts";

// This page exists for one check. The background passes the job in the address and closes the page after.
const job = JSON.parse(decodeURIComponent(location.hash.slice(1))) as { base: Pose; strict: Strictness; posture: boolean; blink: boolean; expressions: boolean };
const video = $<HTMLVideoElement>("v");
let reading: Reading | null = null, blink: number | null = null, face: FaceState | null = null, error = "";
try {
  const close = await openCamera(video);
  try {
    if (job.posture) reading = judge(await burst(video), job.base, job.strict);
    if (job.blink) { const got = await watchEyes(video); blink = blinkRate(got.eyes); face = faceState(got.face, job.expressions); }
  } finally { close(); }
} catch (e) { error = explain(e); }
await send({ cmd: "reading", reading, blink, face, blinked: job.blink, error });
