import { newDay, type Track } from "./tracker.ts";
import { dayKey } from "./time.ts";

export interface Point { x: number; y: number; visibility?: number }
/** Three proportions from one look. Nothing here can rebuild a picture. */
export interface Pose { rise: number; width: number; tilt: number }
export interface Reading { present: boolean; slouching: boolean | null }

export const BURST_MIN = 5, BREAK_SAMPLES = 5;
// Starting points, not medical limits: how far from your own good posture counts as slouching.
const DROP = 0.82, LEAN = 1.2, TILT = 10;

const seen = (p: Point | undefined): p is Point => !!p && (p.visibility ?? 0) > 0.5;

/** MediaPipe landmarks: 7/8 ears, 11/12 shoulders. Null when they are not clearly in view. */
export function pose(lm: Point[], aspect: number): Pose | null {
  const l = lm[11], r = lm[12], a = lm[7], b = lm[8];
  if (!seen(l) || !seen(r) || !seen(a) || !seen(b)) return null;
  const dx = (l.x - r.x) * aspect, dy = l.y - r.y, width = Math.hypot(dx, dy);
  if (width < 0.05) return null;
  return { rise: ((l.y + r.y) / 2 - (a.y + b.y) / 2) / width, width, tilt: (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI };
}
export const inView = (lm: Point[]): boolean => seen(lm[0]);

const mid = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
export function typical(poses: Pose[]): Pose | null {
  if (!poses.length) return null;
  return { rise: mid(poses.map((p) => p.rise)), width: mid(poses.map((p) => p.width)), tilt: mid(poses.map((p) => p.tilt)) };
}
export const slouched = (p: Pose, base: Pose): boolean => p.rise < base.rise * DROP || p.width > base.width * LEAN || Math.abs(p.tilt - base.tilt) > TILT;

/** One burst: null entries are looks in which nobody was found. */
export function judge(looks: { seen: boolean; pose: Pose | null }[], base: Pose): Reading {
  const poses = looks.flatMap((l) => (l.pose ? [l.pose] : []));
  const enough = poses.length * 2 >= looks.length, p = enough ? typical(poses) : null;
  return { present: looks.length > 0 && looks.filter((l) => l.seen).length * 2 >= looks.length, slouching: p ? slouched(p, base) : null };
}

/** Adds one burst to the day. Each stands for the five minutes around it, so totals are estimates. */
export function addReading(prev: Track, now: number, r: Reading): Track {
  const s = JSON.parse(JSON.stringify(prev)) as Track, d = (s.days[dayKey(now)] ??= newDay());
  d.presenceMin ??= 0;
  d.breaks ??= 0;
  if (r.slouching !== null) d.slouchMin = (d.slouchMin ?? 0) + (r.slouching ? BURST_MIN : 0);
  if (r.present) { d.presenceMin += BURST_MIN; s.absent = 0; return s; }
  // Only absence after being here is a break.
  if (s.absent === undefined) return s;
  s.absent++;
  if (s.absent === BREAK_SAMPLES) d.breaks++;
  return s;
}
