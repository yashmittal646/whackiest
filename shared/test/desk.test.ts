import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, samplePackets, validatePacket } from "@mirror/shared";

test("sample desk data is valid and shows the slouch insight", () => {
  const ps = samplePackets(new Date(2026, 10, 24, 12).getTime());
  for (const p of ps) assert.equal(validatePacket(p).ok, true);
  const r = buildReport(ps, true), n = r.nights.at(-1)!;
  assert.ok(n.slouchPct! > 0 && n.deskMin! > 0 && n.blinkPerMin! > 0);
  assert.match(r.insights.find((i) => i.id === "slouch-doom")?.text ?? "", /slouched about \d+% more of your desk time \(21 days\)/);
});
test("no camera checks means unknown desk data", () => {
  const ps = samplePackets(new Date(2026, 10, 24, 12).getTime()).map((p) => ({ ...p, slouchMin: null, presenceMin: null, breaks: null, blinkPerMin: null }));
  const n = buildReport(ps, true).nights[0]!;
  assert.deepEqual([n.slouchPct, n.deskMin, n.breaks, n.blinkPerMin], [null, null, null, null]);
});
