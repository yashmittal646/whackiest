import type { DevicePacket } from "./packet.ts";
import { doomScore, isLateNight, scoreParts, spec, type Category, type ScoreInput, type ScoreParts } from "./score.ts";
import { dayKey } from "./time.ts";

export interface Day { screenMin: number; doomMin: number; lateNightMin: number; lateDoomMin: number; hourlyDoom: number[]; switches: number; nudges: number; slouchMin?: number; presenceMin?: number; breaks?: number }
export interface Track {
  days: Record<string, Day>;
  /** Switch counts for the last few minutes. No sites are kept. */
  recentSwitches: number[];
  feedMin: number;
  aboveMin: number;
  lastNudge: number;
  intentUntil: number;
  score: number;
  parts: ScoreParts | null;
  /** Camera checks in a row with nobody there. Unset until someone has been seen. */
  absent?: number;
}
export interface Tick { now: number; active: boolean; category: Category; switches: number; slouching: boolean | null }

const KEEP_DAYS = 60;
export const newDay = (): Day => ({ screenMin: 0, doomMin: 0, lateNightMin: 0, lateDoomMin: 0, hourlyDoom: new Array<number>(24).fill(0), switches: 0, nudges: 0 });
export const newTrack = (): Track => ({ days: {}, recentSwitches: [], feedMin: 0, aboveMin: 0, lastNudge: 0, intentUntil: 0, score: 0, parts: null });

/** Advance one minute. Pure, so the same code runs on the real and demo clocks. */
export function step(prev: Track, t: Tick): { track: Track; nudge: "doom" | "combined" | null } {
  const s = JSON.parse(JSON.stringify(prev)) as Track;
  s.recentSwitches = [...s.recentSwitches, t.active ? t.switches : 0].slice(-spec.windowMin);
  const onFeed = t.active && t.category !== "neutral";
  // Decay rather than reset, so one glance at a document does not erase an hour of scrolling.
  s.feedMin = onFeed ? Math.min(s.feedMin + 1, spec.duration.fullAtMin) : Math.max(0, s.feedMin - 3);
  if (!t.active) { s.score = 0; s.parts = null; s.aboveMin = 0; return { track: s, nudge: null }; }

  const hour = new Date(t.now).getHours();
  const input: ScoreInput = { category: t.category, hour, feedMin: s.feedMin, slouching: t.slouching, switchesPerMin: s.recentSwitches.reduce((a, b) => a + b, 0) / spec.windowMin };
  s.score = doomScore(input);
  s.parts = scoreParts(input);

  const doom = s.score >= spec.nudge.threshold;
  const late = isLateNight(hour);
  const key = dayKey(t.now);
  const d = (s.days[key] ??= newDay());
  d.screenMin++;
  d.switches += t.switches;
  if (late) d.lateNightMin++;
  if (doom) { d.doomMin++; d.hourlyDoom[hour]!++; if (late) d.lateDoomMin++; }
  for (const old of Object.keys(s.days).sort().slice(0, -KEEP_DAYS)) delete s.days[old];

  s.aboveMin = doom ? s.aboveMin + 1 : 0;
  const ready = s.aboveMin >= spec.nudge.sustainMin.laptop && t.now >= s.intentUntil && t.now - s.lastNudge >= spec.nudge.cooldownMin * 60000;
  if (!ready) return { track: s, nudge: null };
  s.lastNudge = t.now;
  d.nudges++;
  return { track: s, nudge: t.slouching === true ? "combined" : "doom" };
}

export function toPacket(date: string, d: Day, demo: boolean, generatedAt: number, device: DevicePacket["device"] = "laptop"): DevicePacket {
  const { nudges: _, ...rest } = d;
  return { v: 1, device, date, generatedAt, demo, ...rest, slouchMin: d.slouchMin ?? null, presenceMin: d.presenceMin ?? null, breaks: d.breaks ?? null, blinkPerMin: null, sleepMin: null };
}
