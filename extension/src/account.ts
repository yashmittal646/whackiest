import { getVault, setUpVault, signIn, signOut, signUp, unlock, type Session, type Vault } from "@mirror/shared";
import { eye, setEye, watch } from "../../ui/eye.ts";
import { $, onState } from "./dom.ts";
import { send } from "./store.ts";
import { CONFIG, loadAccount, REPORT_URL } from "./sync.ts";

const eyes = [eye({ lid: "#f0a93c" }), eye({ lid: "#f0a93c" })];
$("pair").append(...eyes);
watch(eyes);

let session: Session | null = null, vault: Vault | null = null, newKey = "";
const views = ["off", "login", "unlock", "words", "linked"] as const;
const show = (v: (typeof views)[number]) => { for (const x of views) $(x).hidden = x !== v; };
const val = (id: string) => $<HTMLInputElement>(id).value;

async function attempt(fn: () => Promise<void>): Promise<void> {
  const buttons = [...document.querySelectorAll("button")];
  $("error").textContent = "";
  for (const b of buttons) b.disabled = true;
  try { await fn(); } catch (e) { $("error").textContent = e instanceof Error ? e.message : "Something went wrong."; }
  for (const b of buttons) b.disabled = false;
}

async function enter(get: typeof signIn): Promise<void> {
  session = await get(CONFIG, val("email").trim(), val("password"));
  $<HTMLInputElement>("password").value = "";
  vault = await getVault(CONFIG, session);
  if (vault) return show("unlock");
  const made = await setUpVault(CONFIG, session);
  newKey = made.key;
  $("phrase").textContent = made.phrase;
  show("words");
}
async function finish(key: string): Promise<void> {
  await send({ cmd: "link", session: session!, key });
  session = null; newKey = "";
  $("phrase").textContent = "";
}

$<HTMLFormElement>("login").onsubmit = (e) => {
  e.preventDefault();
  const create = (e.submitter as HTMLButtonElement | null)?.id === "create";
  void attempt(() => enter(create ? signUp : signIn));
};
$<HTMLFormElement>("unlock").onsubmit = (e) => {
  e.preventDefault();
  void attempt(async () => finish(await unlock(session!, vault!, val("words-in"))));
};
$("saved").onclick = () => void attempt(() => finish(newKey));
$("sync").onclick = () => void attempt(async () => { await send({ cmd: "sync" }); });
$("report").onclick = () => void chrome.tabs.create({ url: REPORT_URL });
$("out").onclick = () => void attempt(async () => {
  const a = await loadAccount();
  await send({ cmd: "unlink" });
  if (a) await signOut(CONFIG, a.session).catch(() => {});
});

onState(async () => {
  const a = await loadAccount();
  eyes.forEach((e, i) => setEye(e, a ? 0 : i ? 0.5 : 1));
  if (!a) { if ($("linked").hidden === false || !views.some((v) => !$(v).hidden)) show(CONFIG.url ? "login" : "off"); return; }
  show("linked");
  $("who").textContent = a.session.email;
  $("when").textContent = a.lastSync ? `Last synced ${new Date(a.lastSync).toLocaleTimeString()}` : "Not synced yet";
  $("problem").textContent = a.error;
  $("report").hidden = !REPORT_URL;
});
