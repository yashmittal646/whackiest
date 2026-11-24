import { hourly, newPhrase, recordId, samplePackets, scoreParts, sealRecord, spec, toB64, type Category } from "@mirror/shared";
import { eye, setEye, watch } from "../../ui/eye.ts";
import { startHero } from "./hero.ts";
import { startTunnel } from "./tunnel.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
function bounce(x: number): number {
  if (x < 0.62) return (x / 0.62) ** 2;
  if (x < 0.86) return 1 - 0.1 * (1 - ((x - 0.74) / 0.12) ** 2);
  return 1 - 0.025 * (1 - ((x - 0.93) / 0.07) ** 2);
}

/** Minutes fall and pile up by the hour: squares from the laptop, circles from the phone. */
function story(): void {
  const box = $("story"), canvas = $<HTMLCanvasElement>("dots"), ctx = canvas.getContext("2d")!;
  const HOURS = [20, 21, 22, 23, 0, 1], sample = samplePackets(Date.now());
  const l = hourly(sample, "laptop", null)!, p = hourly(sample, "phone", null)!;
  const bits = HOURS.flatMap((h, col) => {
    const a = Math.round(l[h]!), all = a + Math.round(p[h]!);
    return Array.from({ length: all }, (_, n) => ({ col, n, phone: n >= a, at: col + (n + 0.5) / all, spin: Math.sin(n * 12.9 + col * 78.2) }));
  });
  let now = still ? 6 : 0, raf = 0;
  const draw = () => {
    raf = 0;
    const b = box.getBoundingClientRect(), goal = still ? 6.6 : clamp(-b.top / Math.max(1, b.height - innerHeight)) * 6.7;
    now += (goal - now) * (still ? 1 : 0.16);
    const W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const slot = W / HOURS.length, per = 4, gap = Math.min((slot * 0.9) / per, (H * 0.8) / 8.4), size = gap * 0.86, floor = H - 40;
    for (const d of bits) {
      const q = clamp((now - d.at) / 0.6);
      if (q <= 0) continue;
      const x = slot * (d.col + 0.5) + ((d.n % per) - (per - 1) / 2) * gap, end = floor - (Math.floor(d.n / per) + 0.5) * gap, y = -size + (end + size) * bounce(q);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.phone ? 0 : d.spin * 3 * (1 - q) ** 2);
      ctx.fillStyle = d.phone ? "#e8391a" : "#2536e8";
      ctx.beginPath();
      if (d.phone) ctx.arc(0, 0, size / 2, 0, 7); else ctx.rect(-size / 2, -size / 2, size, size);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#17101f";
    ctx.fillRect(0, floor, W, 3);
    ctx.font = `700 ${W < 520 ? 13 : 17}px Schibsted`; ctx.textAlign = "center";
    HOURS.forEach((h, i) => ctx.fillText(`${String(h).padStart(2, "0")}:00`, slot * (i + 0.5), H - 12));
    const mins = Math.round(clamp(now / 6) * 359);
    $("clock").textContent = `${String((20 + Math.floor(mins / 60)) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    $("clock").style.fontStretch = `${50 + clamp(now / 6) * 100}%`;
    $("count").textContent = String(bits.filter((d) => now > d.at).length);
    if (Math.abs(goal - now) > 0.002) queue();
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(draw); };
  addEventListener("scroll", queue, { passive: true });
  new ResizeObserver(queue).observe(canvas);
  queue();
}

/** The real formula, wired to the eye. */
function tryScore(): void {
  let category: Category = "neutral", shown = 0, goal = 0, raf = 0, quiet = false;
  const big = eye({ lid: "#ffd447", label: "An eye that gets more hypnotised as the score rises" }), nudge = $("nudge"), box = $("score");
  $("big-eye").append(big);
  watch([big]);
  const names = { content: "feed", switching: "tab hopping", duration: "time", lateNight: "late night", slouch: "slouching" } as const;
  const tick = () => {
    shown += (goal - shown) * (still ? 1 : 0.16);
    if (Math.abs(goal - shown) < 0.3) shown = goal;
    const n = $("try-score");
    n.textContent = String(Math.round(shown));
    n.style.fontStretch = `${50 + shown}%`;
    setEye(big, 0.34 * (1 - clamp(shown / 40)), clamp((shown - 35) / 45));
    raf = shown === goal ? 0 : requestAnimationFrame(tick);
  };
  const update = () => {
    const feedMin = +$<HTMLInputElement>("try-time").value, hops = +$<HTMLInputElement>("try-hops").value;
    const parts = scoreParts({ category, feedMin, switchesPerMin: hops, hour: $<HTMLInputElement>("try-late").checked ? 23 : 15, slouching: $<HTMLInputElement>("try-slouch").checked });
    goal = Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0)));
    $("try-time-v").textContent = `${feedMin} min`;
    $("try-hops-v").textContent = `${hops} a minute`;
    const on = (Object.keys(names) as (keyof typeof names)[]).filter((k) => Math.round(parts[k]) > 0);
    $("try-why").textContent = on.length ? on.map((k) => `${Math.round(parts[k])} ${names[k]}`).join(" + ") : "Nothing to see here.";
    const hot = goal >= spec.nudge.threshold;
    box.classList.toggle("warm", goal >= 35 && !hot);
    box.classList.toggle("hot", hot);
    if (!hot) quiet = false;
    nudge.classList.toggle("on", hot && !quiet);
    nudge.inert = !hot || quiet;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  for (const b of document.querySelectorAll<HTMLButtonElement>("#try-kind button")) b.onclick = () => {
    category = b.value as Category;
    for (const x of document.querySelectorAll("#try-kind button")) x.setAttribute("aria-pressed", String(x === b));
    update();
  };
  for (const id of ["try-time", "try-hops", "try-late", "try-slouch"]) $(id).oninput = update;
  $("nudge-ok").onclick = () => { quiet = true; update(); };
  update();
}

/** Encrypts a sample record with the app's own code. The eyes shut because they can't read it. */
function tryEncrypt(): void {
  const out = $("cipher"), p = samplePackets(Date.now())[1]!;
  const plain = [`${p.device}, ${p.date}`, `${p.doomMin} minutes doom-scrolling`, `${p.lateNightMin} minutes after 23:00`, `${Math.floor(p.sleepMin! / 60)} h ${p.sleepMin! % 60} min asleep`].join("\n").padEnd(260);
  const CH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const eyes = [eye({ lid: "#8f9aff", iris: "#e8391a" }), eye({ lid: "#8f9aff", iris: "#e8391a" })];
  $("peek").append(...eyes);
  watch(eyes);
  out.textContent = plain;
  let raf = 0, sealed = false;
  const run = async () => {
    cancelAnimationFrame(raf);
    const key = toB64(crypto.getRandomValues(new Uint8Array(32))), id = await recordId(key, newPhrase());
    const end = sealed ? plain : (await sealRecord(key, "sample", id, p)).slice(0, plain.length), from = out.textContent!;
    sealed = !sealed;
    $("seal").textContent = sealed ? "Show it again" : "Hide it from the server";
    $("seal-note").textContent = sealed ? "Encrypted just now in this tab, with a throwaway key." : "A sample record, readable.";
    for (const e of eyes) setEye(e, sealed ? 1 : 0);
    if (still) { out.textContent = end; return; }
    const t0 = performance.now();
    const frame = (t: number) => {
      const q = (t - t0) / 900;
      let s = "";
      for (let i = 0; i < end.length; i++) {
        const local = q * 1.6 - (i / end.length) * 0.9 - ((i * 37) % 11) / 60;
        s += local >= 0.6 ? end[i] : local <= 0 || from[i] === "\n" ? (from[i] ?? " ") : CH[(i * 7 + Math.floor(t / 40)) % 64];
      }
      out.textContent = s;
      if (q < 1.3) raf = requestAnimationFrame(frame); else out.textContent = end;
    };
    raf = requestAnimationFrame(frame);
  };
  $("seal").onclick = () => void run();
  new IntersectionObserver((es, o) => { if (es[0]?.isIntersecting) { o.disconnect(); setTimeout(() => { if (!sealed) void run(); }, 1200); } }, { threshold: 0.7 }).observe(out);
}

/** Fall asleep as the page ends, wake when the button is near. */
function goodnight(): void {
  const eyes = [eye({ lid: "#ffb0d0" }), eye({ lid: "#ffb0d0" })], box = $("night"), button = $("join2");
  $("sleepers").append(...eyes);
  watch(eyes);
  let awake = false;
  const set = () => { const b = box.getBoundingClientRect(); for (const e of eyes) setEye(e, awake ? 0 : clamp((innerHeight - b.top) / Math.max(1, Math.min(b.height, innerHeight)) * 1.15 - 0.1)); };
  for (const [on, off] of [["pointerenter", "pointerleave"], ["focus", "blur"]] as const) { button.addEventListener(on, () => { awake = true; set(); }); button.addEventListener(off, () => { awake = false; set(); }); }
  addEventListener("scroll", set, { passive: true });
  set();
}

/** Headings stretch from tall to wide as they cross the window. */
function stretch(): void {
  const all = [...document.querySelectorAll<HTMLElement>(".stretch")];
  if (still) return;
  const set = () => { for (const e of all) { const b = e.getBoundingClientRect(); if (b.bottom > -50 && b.top < innerHeight + 50) e.style.fontStretch = `${50 + clamp(1.15 - b.top / innerHeight) * 75}%`; } };
  addEventListener("scroll", set, { passive: true });
  set();
}

export function startLanding(): void {
  startHero(still);
  startTunnel(still);
  if (still) document.body.classList.add("still");
  story();
  tryScore();
  tryEncrypt();
  goodnight();
  stretch();
}
