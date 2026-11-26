import { dayKey } from "./time.ts";

/** `session` is when the whole sleep began, for spans that are one stage of it. */
export interface Asleep { start: number; end: number; session?: number }
/** Typed-in sleep wins over Health Connect for the same night. */
export interface Sleep { min: number; from: "health" | "you" }

const at = (ms: number, days: number, hour: number) => { const d = new Date(ms); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };

/** Minutes asleep per day. A night is sleep starting from 18:00 that day to noon the next, so naps are left out. */
export function sleepByDay(spans: Asleep[]): Record<string, number> {
  const nights = new Map<string, Asleep[]>();
  for (const s of spans) {
    if (!(s.end > s.start)) continue;
    const from = s.session ?? s.start, h = new Date(from).getHours(), noon = at(from, 0, 12);
    if (h >= 12 && h < 18) continue;
    const key = dayKey(h >= 18 ? noon : at(from, -1, 12));
    nights.set(key, [...(nights.get(key) ?? []), s]);
  }
  const out: Record<string, number> = {};
  for (const [key, list] of nights) {
    let ms = 0, until = 0;
    // Two apps may record the same sleep: count overlapping time once.
    for (const s of list.sort((a, b) => a.start - b.start)) { ms += Math.max(0, s.end - Math.max(s.start, until)); until = Math.max(until, s.end); }
    out[key] = Math.min(1440, Math.round(ms / 60000));
  }
  return out;
}
/** The night just gone: yesterday's date until 18:00 and today's after. */
export function lastNight(now: number): string {
  return dayKey(at(now, new Date(now).getHours() >= 18 ? 0 : -1, 12));
}
