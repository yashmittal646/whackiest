import test from "node:test";
import assert from "node:assert/strict";
import { lastNight, sleepByDay } from "@mirror/shared";
const t = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

test("sleep belongs to the evening before, even when it starts after 04:00", () => {
  assert.deepEqual(sleepByDay([{ start: t(24, 23), end: t(25, 6) }, { start: t(26, 4, 30), end: t(26, 9) }]), { "2026-11-24": 420, "2026-11-25": 270 });
});
test("overlapping sources count once; naps and bad spans are ignored", () => {
  assert.deepEqual(sleepByDay([{ start: t(24, 23), end: t(25, 3) }, { start: t(25, 1), end: t(25, 5) }, { start: t(25, 14), end: t(25, 15) }, { start: t(25, 2), end: t(25, 1) }]), { "2026-11-24": 360 });
});
test("last night: yesterday's date all morning", () => {
  for (const h of [1, 9, 17]) assert.equal(lastNight(t(25, h)), "2026-11-24");
});
test("a late sleeper keeps the stage after noon", () => {
  assert.deepEqual(sleepByDay([{ start: t(25, 5), end: t(25, 12), session: t(25, 5) }, { start: t(25, 12), end: t(25, 13), session: t(25, 5) }]), { "2026-11-24": 480 });
});
