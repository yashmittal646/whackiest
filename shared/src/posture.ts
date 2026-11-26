import { newDay, type Track } from "./tracker.ts";
import { dayKey } from "./time.ts";

export interface Point { x: number; y: number; visibility?: number }
/**
 * Proportions from one look. Nothing here can rebuild a picture.
 * gap: ear to ear, as a share of frame width (bigger = closer to the screen). earY: ear height in the frame.
 * bend: how far the nose sits below the ears, in ear-gaps (bigger = head bent down). Missing in older baselines.
 * rise, width, tilt: from the shoulders, null when they are out of view.
 */
export interface Pose { gap: number; earY: number; bend?: number | null; rise: number | null; width: number | null; tilt: number | null }
export interface Reading { present: boolean; slouching: boolean | null }
export type Strictness = "gentle" | "normal" | "strict";
/** How far each measure has moved from your good posture. 0 = the same. */
export interface Shift { lower: number; closer: number; bend: number | null; hunch: number | null; tilt: number | null }

export const BURST_MIN = 5, BREAK_SAMPLES = 5;
// Starting points, not medical limits. Each is compared with your own good posture.
// lower and bend: in ear-gaps; closer and hunch: fractions; tilt: degrees.
const LIMIT = { lower: 0.35, closer: 0.15, bend: 0.4, hunch: 0.15, tilt: 12 };
const SCALE: Record<Strictness, number> = { gentle: 1.5, normal: 1, strict: 0.65 };

const seen = (p: Point | undefined, min = 0.5): p is Point => !!p && (p.visibility ?? 0) > min;

/** MediaPipe landmarks: 0 nose, 7/8 ears, 11/12 shoulders. Null when the ears are not clearly in view. */
export function pose(lm: Point[], aspect: number): Pose | null {
  const a = lm[7], b = lm[8], l = lm[11], r = lm[12], n = lm[0];
  if (!seen(a) || !seen(b)) return null;
  const gap = Math.hypot((a.x - b.x) * aspect, a.y - b.y), earY = (a.y + b.y) / 2;
  if (gap < 0.02) return null;
  const bend = seen(n) ? (n.y - earY) / gap : null, none = { gap, earY, bend, rise: null, width: null, tilt: null };
  // Shoulders at the edge of a laptop camera are often guessed, so only clear ones count.
  if (!seen(l, 0.75) || !seen(r, 0.75)) return none;
  const dx = (l.x - r.x) * aspect, dy = l.y - r.y, width = Math.hypot(dx, dy);
  if (width < 0.05) return none;
  return { gap, earY, bend, rise: ((l.y + r.y) / 2 - earY) / width, width, tilt: (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI };
}
export const inView = (lm: Point[]): boolean => seen(lm[0]);

const mid = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const midOrNull = (xs: (number | null)[]): number | null => { const v = xs.filter((x): x is number => x !== null); return v.length * 2 >= xs.length ? mid(v) : null; };
export function typical(poses: Pose[]): Pose | null {
  if (!poses.length) return null;
  return { gap: mid(poses.map((p) => p.gap)), earY: mid(poses.map((p) => p.earY)), bend: midOrNull(poses.map((p) => p.bend ?? null)), rise: midOrNull(poses.map((p) => p.rise)), width: midOrNull(poses.map((p) => p.width)), tilt: midOrNull(poses.map((p) => p.tilt)) };
}
/** Why a set of looks is no good as a baseline, or null if it is. */
export function unsteady(poses: Pose[]): string | null {
  if (poses.length < 8) return "Mirror couldn't see both ears clearly. Face the screen, with more light.";
  const base = typical(poses)!, moved = poses.filter((p) => Math.abs(p.earY - base.earY) / base.gap > 0.25 || Math.abs(p.gap / base.gap - 1) > 0.1).length;
  if (moved * 3 > poses.length) return "You moved while it was looking. Hold still for the six seconds and try again.";
  if (base.tilt !== null && Math.abs(base.tilt) > 8) return "Your shoulders look tilted. Sit square to the screen, shoulders level, and try again.";
  return null;
}
/** The middle of the last few looks, so one odd frame does not flip the verdict. */
export const smooth = (recent: Pose[]): Pose | null => typical(recent);

/** A baseline saved by an older version lacks the head measures and must be set again. */
export const usable = (base: unknown): base is Pose => typeof base === "object" && base !== null && typeof (base as Pose).gap === "number";

export function shift(p: Pose, base: Pose): Shift {
  return {
    lower: (p.earY - base.earY) / base.gap,
    closer: p.gap / base.gap - 1,
    bend: p.bend != null && base.bend != null ? p.bend - base.bend : null,
    hunch: p.rise !== null && base.rise !== null ? 1 - p.rise / base.rise : null,
    tilt: p.tilt !== null && base.tilt !== null ? Math.abs(p.tilt - base.tilt) : null,
  };
}
/** Why this look counts as slouching, in words. Empty = sitting well. */
export function reasons(p: Pose, base: Pose, strict: Strictness = "normal"): string[] {
  const s = shift(p, base), k = SCALE[strict], out: string[] = [];
  if (s.lower > LIMIT.lower * k) out.push("head lower");
  if (s.closer > LIMIT.closer * k) out.push("leaning in");
  if (s.bend !== null && s.bend > LIMIT.bend * k) out.push("head bent down");
  if (s.hunch !== null && s.hunch > LIMIT.hunch * k) out.push("shoulders hunched");
  if (s.tilt !== null && s.tilt > LIMIT.tilt * k) out.push("tilted");
  return out;
}
export const slouched = (p: Pose, base: Pose, strict: Strictness = "normal"): boolean => reasons(p, base, strict).length > 0;

/** One burst: null entries are looks in which nobody was found. */
export function judge(looks: { seen: boolean; pose: Pose | null }[], base: Pose, strict: Strictness = "normal"): Reading {
  const poses = looks.flatMap((l) => (l.pose ? [l.pose] : []));
  // Most looks decide, so one glance down at the keyboard does not.
  const bad = poses.filter((p) => slouched(p, base, strict)).length;
  return { present: looks.length > 0 && looks.filter((l) => l.seen).length * 2 >= looks.length, slouching: poses.length * 2 >= looks.length ? bad * 2 > poses.length : null };
}

/** Shares of a longer session spent slouching or leaning in. Null without enough clear looks. */
export function session(poses: (Pose | null)[], base: Pose, strict: Strictness = "normal"): { slouch: number; lean: number } | null {
  const ok = poses.flatMap((p) => (p ? [p] : []));
  if (ok.length < 8) return null;
  const pct = (f: (p: Pose) => boolean) => Math.round((100 * ok.filter(f).length) / ok.length);
  return { slouch: pct((p) => slouched(p, base, strict)), lean: pct((p) => reasons(p, base, strict).includes("leaning in")) };
}

/** Adds one burst to the day. Each stands for the five minutes around it, so totals are estimates. */
export function addReading(prev: Track, now: number, r: Reading): Track {
  const s = JSON.parse(JSON.stringify(prev)) as Track, d = (s.days[dayKey(now)] ??= newDay());
  // After a gap, such as a closed lid, nobody knows whether you stayed sitting.
  if (s.seen === undefined || now - s.seen > 3 * BURST_MIN * 60000) s.seat = 0;
  s.seen = now;
  d.presenceMin ??= 0;
  d.breaks ??= 0;
  if (r.slouching !== null) d.slouchMin = (d.slouchMin ?? 0) + (r.slouching ? BURST_MIN : 0);
  if (r.present) { d.presenceMin += BURST_MIN; s.absent = 0; s.seat = (s.seat ?? 0) + BURST_MIN; return s; }
  // Only absence after being here is a break.
  if (s.absent === undefined) return s;
  s.absent++;
  if (s.absent >= 2) s.seat = 0;
  if (s.absent === BREAK_SAMPLES) d.breaks++;
  return s;
}
