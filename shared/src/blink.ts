import { newDay, type Track } from "./tracker.ts";
import { dayKey } from "./time.ts";

/** One frame: how shut the eyes look, 0 to 1. Null when no single face is in view. */
export interface EyeFrame { t: number; shut: number | null }

export const BLINK_EVERY_MIN = 20, BLINK_SEC = 20, SEAT_MIN = 90;
const MIN_FPS = 15, SHUT = 0.45, OPEN = 0.3, LOW = 0.6, HIGH = 1.6, HIGH_MIN = 25, HIGH_UNKNOWN = 35, HISTORY = 20, KNOWN = 5;

/** Blinks per minute, or null when the frames are too few to trust. */
export function blinkRate(frames: EyeFrame[]): number | null {
  if (frames.length < 2) return null;
  const sec = (frames.at(-1)!.t - frames[0]!.t) / 1000, faces = frames.filter((f) => f.shut !== null).length;
  if (sec < BLINK_SEC * 0.8 || (frames.length - 1) / sec < MIN_FPS || faces < frames.length * 0.8) return null;
  let blinks = 0, since: number | null = null;
  for (const f of frames) {
    if (f.shut === null) since = null;
    else if (since === null) { if (f.shut >= SHUT) since = f.t; }
    // Longer than half a second is resting or looking down.
    else if (f.shut < OPEN) { if (f.t - since <= 500) blinks++; since = null; }
  }
  return Math.round((blinks / sec) * 600) / 10;
}

export function addBlinks(prev: Track, now: number, rate: number): Track {
  const s = JSON.parse(JSON.stringify(prev)) as Track, d = (s.days[dayKey(now)] ??= newDay());
  d.blinkSum = (d.blinkSum ?? 0) + rate;
  d.blinkChecks = (d.blinkChecks ?? 0) + 1;
  return s;
}

/**
 * "low": blinking much less than your usual (staring at a screen dries the eyes).
 * "high": much more than usual, a sign of tired or irritated eyes (strain, dryness, allergy, smoke, tiredness).
 * Two checks in a row must agree: 20 seconds is a small sample. Before your usual rate is known, only a very high rate counts.
 */
export function blinkTrend(history: number[]): "low" | "high" | null {
  if (history.length < 2) return null;
  const before = history.slice(0, -2), last = history.slice(-2);
  if (before.length < KNOWN) return last.every((r) => r > HIGH_UNKNOWN) ? "high" : null;
  const usual = [...before].sort((a, b) => a - b)[Math.floor(before.length / 2)]!;
  if (last.every((r) => r < usual * LOW)) return "low";
  if (last.every((r) => r > Math.max(usual * HIGH, HIGH_MIN))) return "high";
  return null;
}
export const eyesTired = (history: number[]): boolean => blinkTrend(history) === "low";
export const remember = (history: number[], rate: number): number[] => [...history, rate].slice(-HISTORY);
