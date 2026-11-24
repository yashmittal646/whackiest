import { dayKey, spec, type ScoreParts } from "@mirror/shared";
import { eye, setEye, watch } from "../../ui/eye.ts";
import { $, el, onState } from "./dom.ts";
import { clock, current, load, send } from "./store.ts";
import { newDay } from "./tracker.ts";

const LABELS: Record<keyof ScoreParts, string> = { content: "Feed content", switching: "Tab hopping", duration: "Time on feeds", lateNight: "Late night", slouch: "Posture" };

const face = eye({ lid: "#bfeccb", label: "Mirror is watching the scroll" });
$("eye").append(face);
watch([face]);
let shown = 0, goal = 0, raf = 0;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
function tick(): void {
  shown += (goal - shown) * (still ? 1 : 0.16);
  if (Math.abs(goal - shown) < 0.4) shown = goal;
  $("score").textContent = String(Math.round(shown));
  $("score").style.fontStretch = `${50 + shown * 0.5}%`;
  raf = shown === goal ? 0 : requestAnimationFrame(tick);
}

onState(async () => {
  const s = await load(), t = current(s), now = clock(s);
  const d = t.days[dayKey(now)] ?? newDay();
  const high = t.score >= spec.nudge.threshold;
  goal = t.score;
  if (!raf) raf = requestAnimationFrame(tick);
  const asleep = t.parts === null || t.intentUntil > now;
  setEye(face, asleep ? 1 : Math.max(0, 0.34 * (1 - t.score / 40)), Math.min(1, Math.max(0, (t.score - 35) / 45)));
  document.body.classList.toggle("warm", t.score >= 35 && !high);
  document.body.classList.toggle("high", high);
  $("status").textContent = t.parts === null ? "Waiting for activity in Chrome" : high ? "Doom-scrolling" : t.parts.content ? "On a feed" : "Looking fine";
  const parts = Object.entries(t.parts ?? {}).filter(([, v]) => Math.round(v) > 0) as [keyof ScoreParts, number][];
  $("why").replaceChildren(...parts.map(([k, v]) => { const li = el("li", LABELS[k]); li.append(el("b", `+${Math.round(v)}`)); return li; }));
  $("screen").textContent = String(d.screenMin);
  $("doom").textContent = String(d.doomMin);
  $("late").textContent = String(d.lateNightMin);
  const left = Math.ceil((t.intentUntil - now) / 60000);
  const intent = $<HTMLButtonElement>("intent");
  intent.disabled = left > 0;
  intent.textContent = left > 0 ? `Nudges paused, ${left} min left` : "I'm here on purpose";
  $("demo").textContent = s.demo ? "Stop demo" : "Start demo";
  $("banner").hidden = !s.demo;
  $("time").textContent = new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
});

$("intent").onclick = () => void send({ cmd: "intent" });
$("demo").onclick = async () => { await send({ cmd: (await load()).demo ? "demo-off" : "demo-on" }); };
$("share").onclick = () => void chrome.tabs.create({ url: "account.html" });
$("privacy").onclick = () => void chrome.tabs.create({ url: "privacy.html" });
