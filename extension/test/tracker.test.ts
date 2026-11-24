import test from "node:test";
import assert from "node:assert/strict";
import { parsePacket, encodePacket } from "@mirror/shared";
import { newTrack, step, toPacket, type Tick, type Track } from "../src/tracker.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).getTime();
function run(t: Track, start: number, mins: number, o: Partial<Tick> = {}) {
  const nudges: number[] = [];
  for (let i = 0; i < mins; i++) {
    const r = step(t, { now: start + i * 60000, active: true, category: "social", switches: 1, slouching: null, ...o });
    t = r.track;
    if (r.nudge) nudges.push(i);
  }
  return { t, nudges };
}

test("late feed nudges, then respects the 15 min cooldown", () => {
  const { nudges } = run(newTrack(), at(23), 40);
  assert.ok(nudges.length >= 2 && nudges[0]! < 10);
  for (let i = 1; i < nudges.length; i++) assert.equal(nudges[i]! - nudges[i - 1]!, 15);
});
test("intent mode blocks nudges", () => {
  assert.deepEqual(run({ ...newTrack(), intentUntil: at(23, 20) }, at(23), 20).nudges, []);
});
test("work never nudges; idle time is not screen time", () => {
  assert.deepEqual(run(newTrack(), at(23), 60, { category: "neutral", switches: 20 }).nudges, []);
  assert.deepEqual(run(newTrack(), at(23), 30, { active: false }).t.days, {});
});
test("slouching gives the combined nudge", () => {
  assert.equal(step(newTrack(), { now: at(23), active: true, category: "shortVideo", switches: 1, slouching: true }).nudge, "combined");
});
test("a night across midnight is one day and a valid packet", () => {
  const { t } = run(newTrack(), at(23), 120);
  assert.deepEqual(Object.keys(t.days), ["2026-11-24"]);
  const p = toPacket("2026-11-24", t.days["2026-11-24"]!, false, at(23));
  assert.equal(p.lateNightMin, 120);
  assert.ok(p.hourlyDoom[0]! > 0);
  assert.equal(parsePacket(encodePacket(p)).ok, true);
});
