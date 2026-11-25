import { typical } from "@mirror/shared";
import { burst, explain, openCamera } from "./camera.ts";
import { $, onState } from "./dom.ts";
import { loadPosture, send } from "./store.ts";

const video = $<HTMLVideoElement>("v"), start = $<HTMLButtonElement>("start"), save = $<HTMLButtonElement>("save");
let close: (() => void) | null = null;
const stop = () => { close?.(); close = null; video.hidden = true; save.hidden = true; start.hidden = false; };

start.onclick = async () => {
  $("error").textContent = "";
  start.disabled = true;
  try {
    close = await openCamera(video);
    video.hidden = false; save.hidden = false; start.hidden = true;
  } catch (e) { $("error").textContent = explain(e); }
  start.disabled = false;
};
save.onclick = async () => {
  $("error").textContent = "";
  save.disabled = true;
  save.textContent = "Hold still";
  try {
    const poses = (await burst(video)).flatMap((l) => (l.pose ? [l.pose] : [])), base = poses.length >= 8 ? typical(poses) : null;
    if (!base) $("error").textContent = "Mirror couldn't see your ears and both shoulders. Move back a little and add light.";
    else { stop(); await send({ cmd: "posture-on", base }); }
  } catch (e) { $("error").textContent = explain(e); }
  save.disabled = false;
  save.textContent = "This is my good posture";
};
$("stop").onclick = () => void send({ cmd: "posture-off" });
addEventListener("pagehide", stop);

onState(async () => {
  const p = await loadPosture();
  $("stop").hidden = !p.base;
  start.textContent = p.base ? "Set my posture again" : "Turn on the camera";
  const r = p.last;
  $("state").textContent = !p.base ? "Posture is off." : p.error ? p.error : !r ? "Posture is on. The first check happens within a minute."
    : `Last check ${new Date(r.at).toLocaleTimeString()}: ${!r.present ? "nobody at the desk" : r.slouching === null ? "couldn't see your shoulders" : r.slouching ? "slouching" : "sitting well"}.`;
});
