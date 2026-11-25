import test from "node:test";
import assert from "node:assert/strict";
import { addReading, judge, newTrack, pose, toPacket, validatePacket, type Point } from "@mirror/shared";

const body = (o: { head?: number; w?: number; tilt?: number } = {}): Point[] => {
  const lm: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })), w = o.w ?? 0.3, t = o.tilt ?? 0;
  const put = (i: number, x: number, y: number) => { lm[i] = { x, y, visibility: 1 }; };
  put(11, 0.5 + w / 2, 0.7 + t); put(12, 0.5 - w / 2, 0.7 - t);
  put(7, 0.55, o.head ?? 0.4); put(8, 0.45, o.head ?? 0.4);
  return lm;
};
const base = pose(body(), 4 / 3)!;
const looks = (lm: Point[], n = 12) => Array.from({ length: n }, () => ({ seen: true, pose: pose(lm, 4 / 3) }));
const now = new Date(2026, 10, 24, 12).getTime();

test("head drop, lean and tilt are slouching; the baseline is not", () => {
  assert.equal(judge(looks(body()), base).slouching, false);
  for (const o of [{ head: 0.52 }, { w: 0.4, head: 0.3 }, { tilt: 0.05 }]) assert.equal(judge(looks(body(o)), base).slouching, true);
});
test("hidden shoulders are unknown, not upright", () => {
  assert.deepEqual(judge(Array.from({ length: 12 }, () => ({ seen: true, pose: null })), base), { present: true, slouching: null });
});
test("posture totals: null until measured, breaks need five empty checks after presence", () => {
  const day = (t = newTrack()) => toPacket("2026-11-24", t.days["2026-11-24"]!, false, now);
  let t = addReading(newTrack(), now, { present: false, slouching: null });
  assert.equal(day(t).slouchMin, null);
  for (let i = 0; i < 9; i++) t = addReading(t, now, { present: false, slouching: null });
  assert.equal(day(t).breaks, 0);
  t = addReading(t, now, { present: true, slouching: true });
  for (let i = 0; i < 9; i++) t = addReading(t, now, { present: false, slouching: null });
  const p = day(t);
  assert.deepEqual([p.slouchMin, p.presenceMin, p.breaks], [5, 5, 1]);
  assert.equal(validatePacket(p).ok, true);
});
