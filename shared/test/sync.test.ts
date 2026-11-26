import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error plain JS helper
import { startMock } from "../../dev/mock-supabase.mjs";
import { buildReport, download, getVault, hourly, newPhrase, openRecord, recordId, samplePackets, sealRecord, setUpVault, signIn, signUp, unlock, upload, validatePacket, deleteAccount } from "../src/index.ts";

const now = new Date(2026, 10, 24, 12).getTime();
const sample = samplePackets(now);

test("sample packets are valid, labelled and repeatable", () => {
  for (const p of sample) { const v = validatePacket(p); assert.ok(v.ok, JSON.stringify(v)); assert.equal(p.demo, true); }
  assert.deepEqual(samplePackets(now), sample);
});
test("report joins both devices", () => {
  const r = buildReport(sample, true);
  assert.equal(r.nights.length, 21);
  assert.ok(r.insights.some((i) => i.id === "late-total"), JSON.stringify(r.insights));
  assert.ok(hourly(sample, "phone", null)![0]! > hourly(sample, "laptop", null)![0]!);
});
test("a missing device is unknown, not zero", () => {
  const r = buildReport(sample.filter((p) => p.device === "laptop"), true);
  assert.equal(r.nights[0]!.phoneLateMin, null);
  assert.equal(r.nights[0]!.doomMin, null);
  assert.equal(hourly([], "phone", null), null);
  // Sleep insights need the phone; the laptop-only slouch insight may remain.
  assert.deepEqual(r.insights.map((i) => i.id).filter((id) => id !== "slouch-doom"), []);
});
test("phrase shape", () => assert.match(newPhrase(), /^[a-z]+-[a-z]+$/));

test("records are bound to user and id", async () => {
  const key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const id = await recordId(key, "a");
  const s = await sealRecord(key, "u1", id, { x: 1 });
  assert.deepEqual(await openRecord(key, "u1", id, s), { x: 1 });
  await assert.rejects(openRecord(key, "u2", id, s));
  await assert.rejects(openRecord(key, "u1", await recordId(key, "b"), s));
});

test("two devices, one account, server sees no plaintext", async () => {
  const m = await startMock();
  try {
    const c = { url: m.url as string, key: "k" };
    const laptop = await signUp(c, "a@example.com", "password1");
    assert.equal(await getVault(c, laptop), null);
    const { phrase, key } = await setUpVault(c, laptop);
    await upload(c, { session: laptop, key }, "dev-l", sample.filter((p) => p.device === "laptop"));
    const phone = await signIn(c, "a@example.com", "password1");
    const v = (await getVault(c, phone))!;
    await assert.rejects(unlock(phone, v, "wrong-words"), /not right/);
    const key2 = await unlock(phone, v, ` ${phrase.replace("-", " ").toUpperCase()} `);
    assert.equal(key2, key);
    await upload(c, { session: phone, key: key2 }, "dev-p", sample.filter((p) => p.device === "phone"));
    await upload(c, { session: phone, key: key2 }, "dev-p", sample.filter((p) => p.device === "phone"));
    const d = await download(c, { session: laptop, key });
    assert.equal(d.packets.length, 42, "re-upload replaces");
    assert.equal(d.unreadable, 0);
    const stored = JSON.stringify([...m.records.values()].map((r: Map<string, unknown>) => [...r.values()])) + JSON.stringify([...m.vaults.values()]);
    for (const leak of ["doom", "laptop", "phone", "2026-11", phrase, key]) assert.ok(!stored.includes(leak), leak);
    await assert.rejects(setUpVault(c, phone), /duplicate/);
    const other = await signUp(c, "b@example.com", "password2");
    assert.equal((await download(c, { session: other, key })).packets.length, 0);
    await deleteAccount(c, laptop);
    await assert.rejects(download(c, { session: phone, key }));
  } finally { m.close(); }
});
