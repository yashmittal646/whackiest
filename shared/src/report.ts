import { findInsights, type Insight, type NightRow } from "./insights.ts";
import type { DevicePacket } from "./packet.ts";
import { isLateNight } from "./score.ts";
import { dayKey } from "./time.ts";

export interface Report { dates: string[]; nights: NightRow[]; insights: Insight[] }

const of = (ps: DevicePacket[], device: DevicePacket["device"]) => ps.filter((p) => p.device === device);
const sum = (ps: DevicePacket[], f: (p: DevicePacket) => number) => (ps.length ? ps.reduce((a, p) => a + f(p), 0) : null);

const known = (ps: DevicePacket[], f: (p: DevicePacket) => number | null) => { const v = ps.map(f).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
/** Camera totals from the laptop. Several laptops add up; blink rates average. */
function desk(laptop: DevicePacket[]) {
  const deskMin = known(laptop, (p) => p.presenceMin), slouch = known(laptop, (p) => p.slouchMin), rated = laptop.filter((p) => p.blinkPerMin !== null);
  return {
    laptopDoomMin: sum(laptop, (p) => p.doomMin), deskMin, breaks: known(laptop, (p) => p.breaks),
    slouchPct: deskMin !== null && slouch !== null && deskMin >= 30 ? Math.round((100 * slouch) / deskMin) : null,
    blinkPerMin: rated.length ? Math.round((rated.reduce((a, p) => a + p.blinkPerMin!, 0) / rated.length) * 10) / 10 : null,
  };
}

/** Joins every device by date. A device with no record that day is "not measured", never zero. */
export function buildReport(packets: DevicePacket[], demo: boolean): Report {
  const dates = [...new Set(packets.map((p) => p.date))].sort();
  const nights = dates.map((date): NightRow => {
    const day = packets.filter((p) => p.date === date), laptop = of(day, "laptop"), phone = of(day, "phone");
    return {
      date,
      sleepMin: phone.find((p) => p.sleepMin !== null)?.sleepMin ?? null,
      laptopLateMin: sum(laptop, (p) => p.lateNightMin),
      phoneLateMin: sum(phone, (p) => p.lateNightMin),
      // Comparable only on days when both devices reported.
      doomMin: laptop.length && phone.length ? sum(day, (p) => p.doomMin) : null,
      ...desk(laptop),
    };
  });
  return { dates, nights, insights: findInsights(nights, demo) };
}

/** Average doom minutes per clock hour, over days that device reported. null = no records. */
export function hourly(packets: DevicePacket[], device: DevicePacket["device"], date: string | null): number[] | null {
  const ps = of(packets, device).filter((p) => date === null || p.date === date);
  const days = new Set(ps.map((p) => p.date)).size;
  return days ? Array.from({ length: 24 }, (_, h) => ps.reduce((a, p) => a + p.hourlyDoom[h]!, 0) / days) : null;
}

/** Invented records for demos, always flagged demo: true. Same numbers every run. */
export function samplePackets(now: number, count = 21): DevicePacket[] {
  let seed = 20261201;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - (count - i));
    const date = dayKey(d.getTime()), heavy = rnd();
    const make = (device: "laptop" | "phone", shape: Record<number, number>, sleepMin: number | null): DevicePacket => {
      const hourlyDoom = new Array<number>(24).fill(0);
      for (const [h, top] of Object.entries(shape)) hourlyDoom[+h] = Math.min(55, pick(top * 0.4, top * 0.9 + top * 0.4 * heavy));
      const doomMin = hourlyDoom.reduce((a, b) => a + b, 0);
      const lateDoomMin = hourlyDoom.reduce((a, b, h) => a + (isLateNight(h) ? b : 0), 0);
      const lateNightMin = lateDoomMin + pick(2, 10);
      return { v: 1, device, date, generatedAt: now, demo: true, screenMin: doomMin + lateNightMin + pick(120, 200), doomMin, lateNightMin, lateDoomMin, hourlyDoom, switches: pick(60, 220), slouchMin: null, presenceMin: null, breaks: null, blinkPerMin: null, sleepMin };
    };
    const laptop = make("laptop", { 13: 4, 17: 6, 20: 10, 21: 16, 22: 26, 23: 22, 0: 3 }, null);
    laptop.presenceMin = 5 * pick(48, 84);
    laptop.slouchMin = 5 * Math.round(Math.min(1, 0.12 + laptop.doomMin / 500 + rnd() * 0.08) * laptop.presenceMin / 5);
    laptop.breaks = pick(1, 5);
    laptop.blinkPerMin = Math.round((17 - laptop.doomMin / 25 + rnd() * 3) * 10) / 10;
    const phone = make("phone", { 8: 6, 13: 8, 18: 8, 21: 4, 22: 6, 23: 12 + 8 * heavy, 0: 14 + 34 * heavy, 1: 4 + 26 * heavy }, null);
    phone.sleepMin = 480 - Math.round(0.5 * (laptop.lateNightMin + phone.lateNightMin)) + pick(-22, 22);
    return [laptop, phone];
  }).flat();
}
