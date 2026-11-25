import type { DevicePacket } from "./packet.ts";
import type { Category } from "./score.ts";
import { dayKey, dayStart } from "./time.ts";
import { newTrack, step, toPacket, type Track } from "./tracker.ts";

export interface Span { pkg: string; start: number; end: number }

// YouTube is left out on purpose: a package name cannot tell Shorts from other videos.
export const APPS: Record<string, Category> = {
  "com.zhiliaoapp.musically": "shortVideo", "com.ss.android.ugc.trill": "shortVideo",
  "com.instagram.android": "social", "com.instagram.lite": "social", "com.twitter.android": "social", "com.reddit.frontpage": "social",
  "com.facebook.katana": "social", "com.facebook.lite": "social", "com.instagram.barcelona": "social", "com.snapchat.android": "social",
  "com.pinterest": "social", "com.tumblr": "social", "xyz.blueskyweb.app": "social",
  "com.google.android.apps.magazines": "news", "com.cnn.mobile.android.phone": "news", "com.ndtv.india": "news", "com.toi.reader.activities": "news",
};
export const classifyApp = (pkg: string): Category => APPS[pkg] ?? "neutral";

/** Runs the same scoring as the laptop, minute by minute, over recorded foreground spans. */
export function trackPhone(spans: Span[], from: number, to: number): Track {
  let track = newTrack(), last = "", i = 0;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  for (let t = from; t + 60000 <= to; t += 60000) {
    while (i < sorted.length && sorted[i]!.end <= t) i++;
    const time = new Map<string, number>();
    let switches = 0;
    for (let j = i; j < sorted.length && sorted[j]!.start < t + 60000; j++) {
      const s = sorted[j]!;
      time.set(s.pkg, (time.get(s.pkg) ?? 0) + Math.min(s.end, t + 60000) - Math.max(s.start, t));
      if (s.start >= t && s.pkg !== last) switches++;
      last = s.pkg;
    }
    const total = [...time.values()].reduce((a, b) => a + b, 0);
    const main = [...time].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    track = step(track, { now: t, active: total >= 30000, category: classifyApp(main), switches, slouching: null }).track;
  }
  return track;
}

/** The last `days` days including today, as packets. Days with no use are left out. */
export function phoneWindow(now: number, days: number): number {
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() - (days - 1));
  return d.getTime();
}
export function phonePackets(track: Track, now: number): DevicePacket[] {
  return Object.entries(track.days).map(([date, day]) => toPacket(date, day, false, now, "phone"));
}

/** Android forgets old events, so a recount must never shrink a finished day. */
export function keepFuller(stored: DevicePacket[], recount: DevicePacket[], now: number): DevicePacket[] {
  const by = new Map(stored.map((p) => [p.date, p]));
  for (const p of recount) { const old = by.get(p.date); if (!old || p.date === dayKey(now) || p.screenMin >= old.screenMin) by.set(p.date, p); }
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-60);
}
