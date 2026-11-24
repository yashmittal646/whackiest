// Tests the real project's rules with two throwaway accounts, then deletes them.
// Run: node dev/check-supabase.mjs
import { randomUUID } from "node:crypto";
import { config } from "./config.mjs";
import { deleteAccount, download, fresh, getVault, recordId, samplePackets, setUpVault, signIn, signUp, unlock, upload } from "../shared/src/index.ts";

const c = await config();
if (!c.url) throw new Error("mirror.config.json is empty");
let failed = 0;
const ok = (name, pass, extra = "") => { if (!pass) failed++; console.log(pass ? "PASS" : "FAIL", name, extra); };
const rest = async (path, token, method = "GET", body, prefer) => {
  const r = await fetch(c.url + path, { method, headers: { apikey: c.key, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", ...(prefer ? { prefer } : {}) }, body: body && JSON.stringify(body) });
  const t = await r.text();
  let data = t;
  try { data = JSON.parse(t); } catch { /* not JSON */ }
  return { status: r.status, data };
};

const settings = await rest("/auth/v1/settings");
console.log("settings", settings.status, "email:", settings.data?.external?.email, "autoconfirm:", settings.data?.mailer_autoconfirm, "signup disabled:", settings.data?.disable_signup);
const anon = await rest("/rest/v1/records?select=id");
console.log("anonymous read of records:", anon.status, JSON.stringify(anon.data).slice(0, 200));
// 404 means the tables do not exist. Stop before creating any account.
if (settings.status !== 200 || !settings.data.mailer_autoconfirm || anon.status === 404) { console.log("STOP: finish the setup first. No accounts were created."); process.exit(2); }
ok("anonymous cannot read records", anon.status >= 400);
ok("anonymous cannot read vaults", (await rest("/rest/v1/vaults?select=user_id")).status >= 400);
ok("anonymous cannot call delete_me", (await rest("/rest/v1/rpc/delete_me", null, "POST", {})).status >= 400);

const email = () => `mirror-check-${randomUUID()}@example.com`, password = randomUUID();
const made = [];
try {
  const emailA = email();
  const a = await signUp(c, emailA, password); made.push(a);
  const b = await signUp(c, email(), password); made.push(b);
  const va = await setUpVault(c, a), vb = await setUpVault(c, b);
  const ps = samplePackets(Date.now(), 3);
  await upload(c, { session: a, key: va.key }, "dev", ps.filter((p) => p.device === "laptop"));
  await upload(c, { session: a, key: va.key }, "dev", ps.filter((p) => p.device === "laptop"));
  const a2 = await signIn(c, emailA, password);
  const key2 = await unlock(a2, await getVault(c, a2), va.phrase);
  await upload(c, { session: a2, key: key2 }, "dev2", ps.filter((p) => p.device === "phone"));
  const d = await download(c, { session: a, key: va.key });
  ok("second device joins; re-upload replaces", d.packets.length === 6 && d.unreadable === 0, String(d.packets.length));
  ok("expired session refreshes", (await fresh(c, { ...a2, expiresAt: 0 })).userId === a.userId);

  const mine = `user_id=eq.${a.userId}`, id = await recordId(va.key, "dev:demo:" + ps[0].date), data = "tampered";
  ok("B cannot read A's records", (await rest(`/rest/v1/records?select=*&${mine}`, b.access)).data.length === 0);
  ok("B cannot read A's vault", (await rest(`/rest/v1/vaults?select=*&${mine}`, b.access)).data.length === 0);
  ok("B cannot insert as A", (await rest("/rest/v1/records", b.access, "POST", { user_id: a.userId, id: "0".repeat(32), data })).status >= 400);
  ok("B cannot upsert over A", (await rest("/rest/v1/records?on_conflict=user_id,id", b.access, "POST", { user_id: a.userId, id, data }, "resolution=merge-duplicates")).status >= 400);
  const upd = await rest(`/rest/v1/records?${mine}`, b.access, "PATCH", { data }, "return=representation");
  ok("B cannot update A's records", upd.status >= 400 || upd.data.length === 0);
  const del = await rest(`/rest/v1/records?${mine}`, b.access, "DELETE", undefined, "return=representation");
  ok("B cannot delete A's records", del.status >= 400 || del.data.length === 0);
  ok("B cannot move own record to A", await (async () => {
    await upload(c, { session: b, key: vb.key }, "dev", [ps[0]]);
    return (await rest(`/rest/v1/records?user_id=eq.${b.userId}`, b.access, "PATCH", { user_id: a.userId })).status >= 400;
  })());
  ok("vault cannot be overwritten", (await rest(`/rest/v1/vaults?${mine}`, a.access, "PATCH", { wrapped: "x" })).status >= 400);
  ok("second vault is refused", await setUpVault(c, a).then(() => false, () => true));
  ok("oversized record is refused", (await rest("/rest/v1/records", a.access, "POST", { user_id: a.userId, id: "1".repeat(32), data: "x".repeat(9000) })).status >= 400);
  const after = await download(c, { session: a, key: va.key });
  ok("A's data intact after all attempts", after.packets.length === 6 && after.unreadable === 0);

  await deleteAccount(c, a);
  ok("deleted account cannot sign in", await signIn(c, emailA, password).then(() => false, () => true));
  ok("deleted account's rows are gone", (await rest("/rest/v1/records?select=id", a.access)).data?.length === 0);
  ok("B survives A's deletion", (await download(c, { session: b, key: vb.key })).packets.length === 1);
  made.shift();
} catch (e) { failed++; console.log("ERROR", e.status ?? "", e.message); }
finally {
  for (const s of made) await deleteAccount(c, s).then(() => console.log("cleaned up an account"), (e) => console.log("CLEANUP FAILED for", s.email, e.message));
}
console.log(failed ? `${failed} problem(s)` : "All checks passed");
process.exitCode = failed ? 1 : 0;
