import test from "node:test";
import assert from "node:assert/strict";
import vectors from "../test-vectors.json" with { type: "json" };
import { adjust, classifyUrl, dayKey, doomScore, encodePacket, findInsights, fit, parsePacket, type DevicePacket, type NightRow, type ScoreInput } from "../src/index.ts";

for (const v of vectors) test(`score: ${v.name}`, () => {
  const s = doomScore(v.input as ScoreInput);
  assert.ok(s >= v.min && s <= v.max, `got ${s}, want ${v.min}-${v.max}`);
});

test("url classification", () => {
  const c = classifyUrl;
  assert.equal(c("https://www.youtube.com/shorts/abc"), "shortVideo");
  assert.equal(c("https://www.youtube.com/watch?v=1"), "neutral");
  assert.equal(c("https://old.reddit.com/r/x"), "social");
  assert.equal(c("https://netflix.com/"), "neutral", "must not match x.com");
  assert.equal(c("https://x.com.evil.example/"), "neutral");
  assert.equal(c("chrome://newtab"), "neutral");
  assert.equal(c(undefined), "neutral");
});

test("day starts at 04:00", () => {
  assert.equal(dayKey(new Date(2026, 11, 1, 3, 59).getTime()), "2026-11-30");
  assert.equal(dayKey(new Date(2026, 11, 1, 4, 0).getTime()), "2026-12-01");
});

const hourly = new Array<number>(24).fill(0);
hourly[23] = 20;
const good: DevicePacket = { v: 1, device: "laptop", date: "2026-11-24", generatedAt: 1, demo: false, screenMin: 60, doomMin: 20, lateNightMin: 30, lateDoomMin: 20, hourlyDoom: hourly, switches: 9, slouchMin: null, presenceMin: null, breaks: null, blinkPerMin: null, sleepMin: null };

test("packet round trip via QR text and file", () => {
  for (const s of [encodePacket(good), JSON.stringify(good, null, 2)]) assert.deepEqual(parsePacket(s), { ok: true, packet: good });
});

test("hostile packets rejected", () => {
  const bad: object[] = [{ ...good, extra: 1 }, { ...good, v: 2 }, { ...good, sleepMin: 400 }, { ...good, device: "phone", sleepMin: 9999 }, { ...good, screenMin: -1 }, { ...good, screenMin: 1e9 }, { ...good, doomMin: 5 }, { ...good, date: "2026-02-30" }, { ...good, hourlyDoom: [1] }, { ...good, demo: "no" }, { ...good, lateDoomMin: 50 }, { ...good, blinkPerMin: "<b>" }];
  for (const b of bad) assert.equal(parsePacket(JSON.stringify(b)).ok, false, JSON.stringify(b));
  for (const s of ["", "null", "[]", "https://evil.example", "x".repeat(9999)]) assert.equal(parsePacket(s).ok, false);
});

test("regression matches a reference value", () => {
  const f = fit([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])!;
  assert.ok(Math.abs(f.r - 0.774597) < 1e-5);
  assert.ok(Math.abs(f.slope - 0.6) < 1e-9);
  assert.ok(Math.abs(f.p - 0.124027) < 1e-4, String(f.p));
  assert.equal(fit([1, 1, 1], [1, 2, 3]), null);
});

test("Benjamini-Hochberg", () => {
  adjust([0.01, 0.04, 0.03]).forEach((v, i) => assert.ok(Math.abs(v - [0.03, 0.04, 0.04][i]!) < 1e-9));
});

test("insights need enough nights and never claim cause", () => {
  const rows: NightRow[] = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, laptopLateMin: i * 5, phoneLateMin: (i * 7) % 30, doomMin: null, sleepMin: 450 - i * 4 + (i % 3) * 5 }));
  assert.deepEqual(findInsights(rows.slice(0, 5), true), []);
  const found = findInsights(rows, true);
  assert.ok(found.length > 0);
  for (const i of found) { assert.match(i.text, /associated with.*14 nights/); assert.equal(i.demo, true); }
});
