import { newDay, type Track } from "./tracker.ts";
import { dayKey } from "./time.ts";
import type { Point } from "./posture.ts";

/**
 * One frame of the face check, reduced to numbers on the spot. Nothing here can rebuild a face.
 * shut: eyes closed 0-1. jaw: mouth open 0-1. smile/frown: 0-1. turn: where the nose sits between the cheeks
 * (0.5 = facing the screen). tip: where the nose sits between eyes and chin. x, y: nose in the frame. size: face width.
 */
export interface FaceFrame { t: number; shut: number; jaw: number; smile: number; frown: number; turn: number; tip: number; x: number; y: number; size: number }
export type Expression = "smiling" | "frowning" | "neutral";
export interface FaceState {
  /** Share of the check with eyes mostly closed. Over 15% is a common sign of drowsiness. */
  closed: number; drowsy: boolean; yawns: number;
  /** Share of the check facing the screen. */
  focus: number; restless: boolean; tooClose: boolean;
  /** Only when expressions are switched on. What the face showed, not how the person feels. */
  expression: Expression | null;
}

const SHUT = 0.6, YAWN = 0.55, YAWN_MS = 1500, DROWSY = 0.15, CLOSE = 0.42, RESTLESS = 0.12;

/** Reads the frame's blendshapes and a few landmarks: 1 nose tip, 33/263 eyes, 152 chin, 234/454 cheeks. */
export function faceFrame(t: number, shapes: Record<string, number>, lm: Point[], aspect: number): FaceFrame | null {
  const nose = lm[1], l = lm[234], r = lm[454], eyeL = lm[33], eyeR = lm[263], chin = lm[152];
  if (!nose || !l || !r || !eyeL || !eyeR || !chin) return null;
  const s = (k: string) => shapes[k] ?? 0, eyes = (eyeL.y + eyeR.y) / 2, span = r.x - l.x;
  if (Math.abs(span) < 0.01 || chin.y - eyes < 0.01) return null;
  return {
    t, shut: (s("eyeBlinkLeft") + s("eyeBlinkRight")) / 2, jaw: s("jawOpen"),
    smile: (s("mouthSmileLeft") + s("mouthSmileRight")) / 2, frown: Math.max((s("browDownLeft") + s("browDownRight")) / 2, (s("mouthFrownLeft") + s("mouthFrownRight")) / 2),
    turn: (nose.x - l.x) / span, tip: (nose.y - eyes) / (chin.y - eyes), x: nose.x, y: nose.y, size: Math.abs(span) * aspect,
  };
}

const sd = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };

/** Null when the face was in view for too little of the check. */
export function faceState(frames: (FaceFrame | null)[], expressions: boolean): FaceState | null {
  const f = frames.filter((x): x is FaceFrame => x !== null);
  if (f.length < 20 || f.length < frames.length * 0.6) return null;
  const share = (fn: (x: FaceFrame) => boolean) => f.filter(fn).length / f.length;
  let yawns = 0, since: number | null = null;
  for (const x of f) {
    if (x.jaw >= YAWN) { since ??= x.t; continue; }
    if (since !== null && x.t - since >= YAWN_MS) yawns++;
    since = null;
  }
  if (since !== null && f.at(-1)!.t - since >= YAWN_MS) yawns++;
  const closed = share((x) => x.shut >= SHUT), size = f.map((x) => x.size).sort((a, b) => a - b)[Math.floor(f.length / 2)]!;
  // Movement of the nose, measured in face widths, so sitting further away does not hide it.
  const moved = Math.hypot(sd(f.map((x) => x.x)), sd(f.map((x) => x.y))) / Math.max(size, 0.01);
  const smile = share((x) => x.smile > 0.5), frown = share((x) => x.frown > 0.45);
  return {
    closed: Math.round(closed * 100) / 100, drowsy: closed > DROWSY || yawns >= 2, yawns,
    focus: Math.round(share((x) => x.turn > 0.3 && x.turn < 0.7 && x.tip > 0.2 && x.tip < 0.75) * 100) / 100,
    restless: moved > RESTLESS, tooClose: size > CLOSE,
    expression: !expressions ? null : smile >= 0.4 ? "smiling" : frown >= 0.4 ? "frowning" : "neutral",
  };
}

/** Plain words for the popup and the posture page. */
export function describe(s: FaceState): string {
  const parts = [s.drowsy ? "looking drowsy" : "alert", `${Math.round(s.focus * 100)}% facing the screen`];
  if (s.yawns) parts.push(`${s.yawns} yawn${s.yawns > 1 ? "s" : ""}`);
  if (s.restless) parts.push("restless");
  if (s.tooClose) parts.push("very close to the screen");
  if (s.expression) parts.push(`expression: ${s.expression}`);
  return parts.join(" · ");
}

/** Daily totals of face checks, kept on this laptop only. */
export function addFace(prev: Track, now: number, f: FaceState): Track {
  const s = JSON.parse(JSON.stringify(prev)) as Track, d = (s.days[dayKey(now)] ??= newDay());
  d.faceChecks = (d.faceChecks ?? 0) + 1;
  d.focusSum = (d.focusSum ?? 0) + f.focus;
  d.drowsyChecks = (d.drowsyChecks ?? 0) + (f.drowsy ? 1 : 0);
  return s;
}
