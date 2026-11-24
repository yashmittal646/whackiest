export interface DevicePacket {
  v: 1;
  device: "laptop" | "phone";
  /** Day starting at 04:00 local. */
  date: string;
  generatedAt: number;
  /** True when made on the accelerated demo clock. Must be labelled wherever it is shown. */
  demo: boolean;
  screenMin: number;
  doomMin: number;
  lateNightMin: number;
  lateDoomMin: number;
  /** Indexed by clock hour 0-23. */
  hourlyDoom: number[];
  switches: number;
  /** null = not measured (which is different from zero). */
  slouchMin: number | null;
  presenceMin: number | null;
  breaks: number | null;
  blinkPerMin: number | null;
  /** Phone only: sleep in the night that followed this day. */
  sleepMin: number | null;
}

const PREFIX = "MIRROR1:";
const KEYS = ["v", "device", "date", "generatedAt", "demo", "screenMin", "doomMin", "lateNightMin", "lateDoomMin", "hourlyDoom", "switches", "slouchMin", "presenceMin", "breaks", "blinkPerMin", "sleepMin"] as const;

export type ParseResult = { ok: true; packet: DevicePacket } | { ok: false; error: string };

const int = (x: unknown, max: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max;

/** Anything scanned or opened is untrusted: check every field and reject unknown ones. */
export function validatePacket(x: unknown): ParseResult {
  const bad = (error: string): ParseResult => ({ ok: false, error });
  if (typeof x !== "object" || x === null || Array.isArray(x)) return bad("Not a Mirror packet");
  const p = x as Record<string, unknown>;
  if (p.v !== 1 || (p.device !== "laptop" && p.device !== "phone")) return bad("Unsupported packet version or device");
  const keys = Object.keys(p);
  if (keys.length !== KEYS.length || !KEYS.every((k) => Object.hasOwn(p, k))) return bad("Unexpected or missing fields");
  if (typeof p.date !== "string" || !/^20\d\d-\d\d-\d\d$/.test(p.date)) return bad("Bad date");
  const d = new Date(p.date + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.date) return bad("Bad date");
  if (!int(p.generatedAt, 4102444800000)) return bad("Bad timestamp");
  if (typeof p.demo !== "boolean") return bad("Bad demo flag");
  for (const k of ["screenMin", "doomMin", "lateNightMin", "lateDoomMin"]) if (!int(p[k], 1500)) return bad(`Bad ${k}`);
  if (!int(p.switches, 100000)) return bad("Bad switches");
  for (const [k, max] of [["slouchMin", 1500], ["presenceMin", 1500], ["breaks", 300]] as const)
    if (p[k] !== null && !int(p[k], max)) return bad(`Bad ${k}`);
  if (p.blinkPerMin !== null && !(typeof p.blinkPerMin === "number" && p.blinkPerMin >= 0 && p.blinkPerMin <= 120)) return bad("Bad blinkPerMin");
  if (p.sleepMin !== null && (p.device !== "phone" || !int(p.sleepMin, 1440))) return bad("Bad sleepMin");
  // 120 allows the repeated hour when clocks go back.
  if (!Array.isArray(p.hourlyDoom) || p.hourlyDoom.length !== 24 || !p.hourlyDoom.every((m) => int(m, 120))) return bad("Bad hourlyDoom");
  const q = x as DevicePacket;
  if (q.hourlyDoom.reduce((a, b) => a + b, 0) !== q.doomMin) return bad("Hourly totals do not add up");
  if (q.doomMin > q.screenMin || q.lateNightMin > q.screenMin || q.lateDoomMin > q.doomMin || q.lateDoomMin > q.lateNightMin) return bad("Totals are inconsistent");
  return { ok: true, packet: q };
}

export const encodePacket = (p: DevicePacket): string => PREFIX + JSON.stringify(p);

/** Accepts QR text or the contents of an exported file. */
export function parsePacket(text: string): ParseResult {
  if (text.length > 4096) return { ok: false, error: "Too large" };
  const body = text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
  try { return validatePacket(JSON.parse(body)); } catch { return { ok: false, error: "Not a Mirror packet" }; }
}
