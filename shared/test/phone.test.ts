import test from "node:test";
import assert from "node:assert/strict";
import { keepFuller, phonePackets, phoneWindow, trackPhone, validatePacket, dayStart, dayKey } from "../src/index.ts";

const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m).getTime();
test("late Instagram counts as doom; YouTube does not", () => {
  const spans = [{ pkg: "com.instagram.android", start: at(23), end: at(23, 40) }, { pkg: "com.google.android.youtube", start: at(23, 40), end: at(23, 59) }];
  const [p] = phonePackets(trackPhone(spans, at(20), at(24)), at(24));
  assert.ok(validatePacket(p).ok);
  assert.equal(p!.device, "phone");
  assert.equal(p!.screenMin, 59);
  assert.ok(p!.hourlyDoom[23]! > 20 && p!.hourlyDoom[23]! <= 40);
});
test("overlapping and sub-minute spans never exceed real time", () => {
  const spans = Array.from({ length: 60 }, (_, i) => ({ pkg: i % 2 ? "a" : "com.reddit.frontpage", start: at(10) + i * 10000, end: at(10) + i * 10000 + 10000 }));
  const [p] = phonePackets(trackPhone(spans, at(9), at(12)), at(12));
  assert.equal(p!.screenMin, 10);
  assert.equal(p!.switches, 60);
});
test("window starts at 04:00 and old days never shrink", () => {
  assert.equal(new Date(phoneWindow(at(2), 3)).getHours(), 4);
  assert.equal(dayKey(dayStart(at(2))), dayKey(at(2)));
  const [full] = phonePackets(trackPhone([{ pkg: "a", start: at(10), end: at(12) }], at(9), at(13)), at(13));
  const thin = { ...full!, screenMin: 5 };
  assert.equal(keepFuller([full!], [thin], at(34))[0]!.screenMin, full!.screenMin);
});
