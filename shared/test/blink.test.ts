import test from "node:test";
import assert from "node:assert/strict";
import { addBlinks, addReading, blinkRate, blinkTrend, eyesTired, newTrack, toPacket, validatePacket, type EyeFrame } from "@mirror/shared";

/** 20 s at `fps`, shut for `ms` at each time given. */
const film = (fps: number, at: number[], ms = 150): EyeFrame[] => Array.from({ length: 20 * fps + 1 }, (_, i) => {
  const t = (i * 1000) / fps;
  return { t, shut: at.some((a) => t >= a && t < a + ms) ? 0.8 : 0.1 };
});
const now = new Date(2026, 10, 24, 12).getTime();

test("counts blinks and ignores long closures", () => {
  assert.equal(blinkRate(film(30, [1000, 5000, 9000, 14000])), 12);
  assert.equal(blinkRate(film(30, [1000], 2000)), 0);
});
test("too few frames or no face is unknown, not zero", () => {
  assert.equal(blinkRate(film(10, [1000])), null);
  assert.equal(blinkRate(film(30, []).map((f, i) => (i % 2 ? f : { ...f, shut: null }))), null);
});
test("tired needs a known usual rate and two low checks", () => {
  assert.equal(eyesTired([5, 5]), false);
  assert.equal(eyesTired([15, 14, 16, 15, 15, 5]), false);
  assert.equal(eyesTired([15, 14, 16, 15, 15, 5, 6]), true);
});
test("daily average is a valid packet", () => {
  const p = toPacket("2026-11-24", addBlinks(addBlinks(newTrack(), now, 12), now, 15.3).days["2026-11-24"]!, false, now);
  assert.equal(p.blinkPerMin, 13.7);
  assert.equal(validatePacket(p).ok, true);
});
test("sitting time builds up, and a break or a gap clears it", () => {
  let t = newTrack(), n = now;
  const go = (present: boolean, mins = 5) => { n += mins * 60000; t = addReading(t, n, { present, slouching: null }); };
  for (let i = 0; i < 18; i++) go(true);
  assert.equal(t.seat, 90);
  go(false); assert.equal(t.seat, 90);
  go(false); assert.equal(t.seat, 0);
  go(true); go(true, 40); assert.equal(t.seat, 5);
});

test("blinking much more than usual is noticed, and only when it lasts", () => {
  assert.equal(blinkTrend([15, 14, 16, 15, 15, 32, 30]), "high");
  assert.equal(blinkTrend([15, 14, 16, 15, 15, 32, 16]), null);
  assert.equal(blinkTrend([15, 14, 16, 15, 15, 5, 6]), "low");
  // Someone who always blinks a lot is not flagged against a general rule.
  assert.equal(blinkTrend([30, 31, 29, 30, 32, 34, 33]), null);
  // Before a usual rate is known, only very high rates count.
  assert.deepEqual([blinkTrend([20, 30]), blinkTrend([40, 42])], [null, "high"]);
});
