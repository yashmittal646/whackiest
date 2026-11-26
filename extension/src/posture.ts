import { reasons, shift, smooth, typical, unsteady, type Point, type Pose, type Strictness } from "@mirror/shared";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { explain, look, openCamera, poseModel } from "./camera.ts";
import { $, onState } from "./dom.ts";
import { loadPosture, send } from "./store.ts";

const video = $<HTMLVideoElement>("v"), canvas = $<HTMLCanvasElement>("dots"), start = $<HTMLButtonElement>("start"), save = $<HTMLButtonElement>("save");
const strict = $<HTMLSelectElement>("strict");
let recent: Pose[] = [], close: (() => void) | null = null, model: PoseLandmarker | null = null, timer = 0, base: Pose | null = null, saving: Pose[] | null = null;

/** Ears, nose and shoulders as dots and lines, so you can see what Mirror sees. */
function draw(points: Point[] | null, bad: boolean): void {
  const c = canvas.getContext("2d")!;
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  c.clearRect(0, 0, canvas.width, canvas.height);
  if (!points) return;
  const at = (i: number) => { const p = points[i]; return p && (p.visibility ?? 0) > 0.5 ? [p.x * canvas.width, p.y * canvas.height] as const : null; };
  c.strokeStyle = c.fillStyle = bad ? "#ff4a26" : "#bfeccb";
  c.lineWidth = 5;
  for (const [a, b] of [[7, 8], [11, 12], [7, 11], [8, 12]] as const) { const p = at(a), q = at(b); if (p && q) { c.beginPath(); c.moveTo(...p); c.lineTo(...q); c.stroke(); } }
  for (const i of [0, 7, 8, 11, 12]) { const p = at(i); if (p) { c.beginPath(); c.arc(p[0], p[1], 9, 0, 7); c.fill(); } }
}

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
function tick(): void {
  if (!model || !close) return;
  const l = look(model, video), live = $("live");
  recent = l.pose ? [...recent, l.pose].slice(-5) : [];
  const now = smooth(recent), why = now && base ? reasons(now, base, strict.value as Strictness) : [];
  draw(l.points, why.length > 0);
  if (saving && l.pose) saving.push(l.pose);
  live.classList.toggle("bad", why.length > 0);
  if (!now) live.textContent = l.seen ? "Can't see both ears. Face the screen." : "Nobody in view.";
  else if (!base) live.textContent = "Ready. Sit well, then set your good posture.";
  else {
    const s = shift(now, base), d = document.createElement("small");
    live.textContent = why.length ? `Slouching: ${why.join(", ")}` : "Sitting well";
    d.textContent = `Head ${s.lower > 0 ? "lower" : "higher"} by ${Math.abs(s.lower).toFixed(2)} ear-widths${s.bend === null ? "" : ` · bent ${s.bend.toFixed(2)}`} · ${pct(s.closer)} closer${s.hunch === null ? " · shoulders out of view" : ` · shoulders ${pct(s.hunch)} hunched`}${s.tilt === null ? "" : ` · ${Math.round(s.tilt)}° tilt`}`;
    live.append(d);
  }
}

function stop(): void {
  recent = [];
  clearInterval(timer); close?.(); close = null; model?.close(); model = null; saving = null;
  $("cam").hidden = $("how").hidden = save.hidden = $("hide").hidden = true;
  start.hidden = false;
}

start.onclick = async () => {
  $("error").textContent = "";
  start.disabled = true;
  try {
    close = await openCamera(video);
    model = await poseModel();
    $("cam").hidden = $("how").hidden = save.hidden = $("hide").hidden = false;
    start.hidden = true;
    timer = setInterval(tick, 400) as unknown as number;
  } catch (e) { $("error").textContent = explain(e); stop(); }
  start.disabled = false;
};
save.onclick = async () => {
  $("error").textContent = "";
  save.disabled = true;
  save.textContent = "Hold still";
  saving = [];
  await new Promise((r) => setTimeout(r, 6000));
  const got = saving ?? [];
  saving = null;
  const problem = unsteady(got), b = problem ? null : typical(got);
  if (!b) $("error").textContent = problem!;
  else { await send({ cmd: "posture-on", base: b }); base = b; }
  save.disabled = false;
  save.textContent = "This is my good posture";
};
$("hide").onclick = stop;
$("stop").onclick = () => void send({ cmd: "posture-off" });
strict.onchange = () => void send({ cmd: strict.value as Strictness });
const blink = $<HTMLInputElement>("blink");
blink.onchange = () => void send({ cmd: blink.checked ? "blink-on" : "blink-off" });
const expr = $<HTMLInputElement>("expr");
expr.onchange = () => void send({ cmd: expr.checked ? "expr-on" : "expr-off" });
$("blink-now").onclick = () => void send({ cmd: "blink-now" });
$("ver").textContent = chrome.runtime.getManifest().version;
addEventListener("pagehide", stop);

onState(async () => {
  const p = await loadPosture();
  base = p.base;
  strict.value = p.strict ?? "normal";
  $("stop").hidden = !p.base;
  start.textContent = p.base ? "Check it live" : "Turn on the camera";
  $("eyes").hidden = !p.base;
  blink.checked = !!p.blink;
  expr.checked = !!p.expressions;
  $("blink-state").textContent = p.blinkNow ?? "";
  const r = p.last;
  $("state").textContent = p.old ? "Mirror now measures posture differently. Please set your good posture again."
    : !p.base ? "Posture is off." : p.error ? p.error : !r ? "Posture is on. The first check happens within a minute."
    : `Last check ${new Date(r.at).toLocaleTimeString()}: ${!r.present ? "nobody at the desk" : r.slouching === null ? "couldn't see your face clearly" : r.slouching ? "slouching" : "sitting well"}.`;
});
