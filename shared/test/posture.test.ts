import test from "node:test";
import assert from "node:assert/strict";
import { addReading, judge, newTrack, pose, reasons, toPacket, usable, validatePacket, type Point } from "@mirror/shared";

/** A seated person seen by a laptop camera. `down` sinks everything, `near` scales about the centre. */
const body = (o: { down?: number; near?: number; hunch?: number; tilt?: number; shoulders?: boolean } = {}): Point[] => {
  const lm: Point[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 })), k = o.near ?? 1, d = o.down ?? 0;
  const put = (i: number, x: number, y: number) => { lm[i] = { x: 0.5 + (x - 0.5) * k, y: 0.5 + (y - 0.5) * k + d, visibility: 1 }; };
  put(0, 0.5, 0.38); put(7, 0.56, 0.4); put(8, 0.44, 0.4);
  if (o.shoulders !== false) { put(11, 0.65, 0.7 + (o.tilt ?? 0) - (o.hunch ?? 0)); put(12, 0.35, 0.7 - (o.tilt ?? 0) - (o.hunch ?? 0)); }
  return lm;
};
const A = 4 / 3, base = pose(body(), A)!, at = (o: Parameters<typeof body>[0]) => pose(body(o), A)!;
const looks = (lm: Point[], n = 12) => Array.from({ length: n }, () => ({ seen: true, pose: pose(lm, A) }));
const now = new Date(2026, 10, 24, 12).getTime();

test("sitting as you set it is fine; small shifts are fine", () => {
  assert.equal(judge(looks(body()), base).slouching, false);
  assert.deepEqual(reasons(at({ down: 0.03, near: 1.05 }), base), []);
});
test("sinking, leaning in, hunching and tilting each count", () => {
  assert.deepEqual(reasons(at({ down: 0.1 }), base), ["head lower"]);
  assert.deepEqual(reasons(at({ near: 1.25 }), base), ["leaning in"]);
  assert.deepEqual(reasons(at({ hunch: 0.06 }), base), ["shoulders hunched"]);
  assert.deepEqual(reasons(at({ tilt: 0.05 }), base), ["tilted"]);
});
test("strictness moves the line", () => {
  const p = at({ down: 0.045 });
  assert.deepEqual([reasons(p, base, "gentle").length, reasons(p, base, "normal").length, reasons(p, base, "strict").length], [0, 0, 1]);
});
test("shoulders out of view still judge the head", () => {
  assert.equal(judge(looks(body({ shoulders: false, down: 0.1 })), base).slouching, true);
  assert.equal(judge(looks(body({ shoulders: false })), base).slouching, false);
});
test("one glance down does not decide a burst", () => {
  const mixed = [...looks(body(), 9), ...looks(body({ down: 0.1 }), 3)];
  assert.equal(judge(mixed, base).slouching, false);
});
test("no face is unknown, not upright; old baselines are refused", () => {
  assert.deepEqual(judge(Array.from({ length: 12 }, () => ({ seen: true, pose: null })), base), { present: true, slouching: null });
  assert.equal(usable({ rise: 0.6, width: 0.3, tilt: 0 }), false);
  assert.equal(usable(base), true);
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
test("bending the head down counts; a steady, level baseline is required", async () => {
  const { unsteady } = await import("@mirror/shared");
  const bent = body(); bent[0] = { x: 0.5, y: 0.5, visibility: 1 };
  assert.deepEqual(reasons(pose(bent, A)!, base), ["head bent down"]);
  const still = Array.from({ length: 12 }, () => base);
  assert.equal(unsteady(still), null);
  assert.match(unsteady([...still.slice(0, 6), ...Array.from({ length: 6 }, () => at({ down: 0.1 }))]) ?? "", /moved/);
  assert.match(unsteady(Array.from({ length: 12 }, () => at({ tilt: 0.05 }))) ?? "", /tilted/);
});
