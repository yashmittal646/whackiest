import { buildReport, deleteAccount, download, fresh, getVault, hourly, MIN_NIGHTS, parsePacket, samplePackets, setUpVault, signIn, signOut, signUp, unlock, type CloudConfig, type DevicePacket, type Session, type Unlocked, type Vault } from "@mirror/shared";
import { startLanding } from "./landing.ts";
import { hours, nightEye } from "./moon.ts";
import { drawHandoff, hourLabel, HOURS, minutes } from "./chart.ts";

declare const __CONFIG__: CloudConfig;
const C = __CONFIG__;
function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e as T;
}
const val = (id: string) => $<HTMLInputElement>(id).value;

let session: Session | null = null, vault: Vault | null = null, pendingKey = "";
let me: Unlocked | null = null, cloud: DevicePacket[] = [], imported: DevicePacket[] = [], sampleRow: string | null = null;
const source = $<HTMLSelectElement>("source"), night = $<HTMLSelectElement>("night-pick");

// Kept for this browser tab only, so a reload does not ask again.
const SLOT = "mirror";
function remember(): void { try { if (me) sessionStorage.setItem(SLOT, JSON.stringify(me)); else sessionStorage.removeItem(SLOT); } catch { /* storage blocked */ } }
function recall(): Unlocked | null { try { return JSON.parse(sessionStorage.getItem(SLOT) ?? "null") as Unlocked | null; } catch { return null; } }

let started = false;
type View = "start" | "unlock" | "words" | "report";
function show(v: View): void {
  const report = v === "report", door = $<HTMLDialogElement>("door");
  if ($("report").hidden === report) window.scrollTo({ top: 0, behavior: "instant" });
  $("start").hidden = report;
  $("report").hidden = !report;
  document.body.classList.toggle("in-report", report);
  $("sign").hidden = v === "unlock" || v === "words";
  $("unlock").hidden = v !== "unlock";
  $("words").hidden = v !== "words";
  if (report || v === "start") door.close(); else if (!door.open) door.showModal();
  $("signin").hidden = !!me;
  if (v === "start" && !started) { started = true; startLanding(); }
  $("out").hidden = !session && !me;
  $("who").textContent = (me?.session ?? session)?.email ?? "";
  $("refresh").hidden = $("delete").hidden = !me;
  $("raw-box").hidden = !sampleRow;
  $("raw").textContent = sampleRow ?? "";
}
async function attempt(fn: () => Promise<void>): Promise<void> {
  const buttons = [...document.querySelectorAll("button")];
  $("error").textContent = $("door-error").textContent = "";
  for (const b of buttons) b.disabled = true;
  try { await fn(); } catch (e) { $($<HTMLDialogElement>("door").open ? "door-error" : "error").textContent = e instanceof Error ? e.message : "Something went wrong."; }
  for (const b of buttons) b.disabled = false;
}

async function enter(get: typeof signIn): Promise<void> {
  session = await get(C, val("email").trim(), val("password"));
  $<HTMLInputElement>("password").value = "";
  vault = await getVault(C, session);
  if (vault) return show("unlock");
  const made = await setUpVault(C, session);
  pendingKey = made.key;
  $("phrase").textContent = made.phrase;
  show("words");
}
async function open(key: string): Promise<void> {
  me = { session: session!, key };
  session = null; pendingKey = "";
  $("phrase").textContent = "";
  $<HTMLInputElement>("words-in").value = "";
  await refresh();
  source.value = cloud.some((p) => !p.demo) || !cloud.length ? "real" : "demo";
  render();
}
async function refresh(): Promise<void> {
  me!.session = await fresh(C, me!.session);
  remember();
  const d = await download(C, me!);
  cloud = d.packets;
  sampleRow = d.sample;
  if (d.unreadable) $("error").textContent = `${d.unreadable} record(s) could not be read and were skipped.`;
  render();
}

function packets(): DevicePacket[] {
  const mine = [...cloud, ...imported].filter((p) => p.demo === (source.value === "demo"));
  if (source.value === "real") return mine;
  // Live demo records replace the sample for the same device and day.
  const taken = new Set(mine.map((p) => p.device + p.date));
  return [...samplePackets(Date.now()).filter((p) => !taken.has(p.device + p.date)), ...mine];
}

function table(head: string[], rows: string[][]): HTMLTableElement {
  const t = document.createElement("table");
  const add = (cells: string[], tag: "th" | "td") => {
    const tr = document.createElement("tr");
    for (const c of cells) { const e = document.createElement(tag); e.textContent = c; tr.append(e); }
    t.append(tr);
  };
  add(head, "th");
  for (const r of rows) add(r, "td");
  return t;
}
function card(text: string, note: string): HTMLElement {
  const d = document.createElement("div"), a = document.createElement("p"), b = document.createElement("p");
  d.className = "card"; a.className = "insight"; b.className = "note";
  a.textContent = text.replaceAll("-", "\u2011"); b.textContent = note;
  d.append(a, b);
  return d;
}

function render(): void {
  const ps = packets(), demo = source.value === "demo", r = buildReport(ps, demo), keep = night.value;
  night.replaceChildren(new Option("Average of all nights", ""), ...[...r.dates].reverse().map((d) => new Option(d, d)));
  night.value = r.dates.includes(keep) ? keep : "";
  $("banner").hidden = !demo;

  const ready = r.nights.filter((n) => n.sleepMin !== null && n.laptopLateMin !== null && n.phoneLateMin !== null).length;
  $("cards").replaceChildren(...(r.insights.length
    ? r.insights.slice(0, 3).map((i) => card(i.text, `${i.demo ? "Sample data. " : ""}An association, not proof of cause. r = ${i.r.toFixed(2)}, adjusted p ${i.pAdjusted < 0.001 ? "< 0.001" : "= " + i.pAdjusted.toFixed(3)}.`))
    : [card(ps.length ? "No clear pattern yet." : "Nothing synced yet.", ps.length ? `${ready} of at least ${MIN_NIGHTS} nights have laptop, phone and sleep records.` : "Connect the extension or phone app, then refresh.")]));

  const date = night.value || null, l = hourly(ps, "laptop", date), p = hourly(ps, "phone", date);
  const missing = [l ? "" : "laptop", p ? "" : "phone"].filter(Boolean).join(" or ");
  $("sub").textContent = `Doom-scrolling minutes per hour, ${date ? `day of ${date}, 04:00 to 04:00` : `average of ${r.dates.length} days`}.${missing ? ` No ${missing} records.` : ""}`;
  $("chart").hidden = !l && !p;
  $("chart-empty").hidden = !!(l || p);
  drawHandoff($("chart"), $("tip"), l, p);
  $("table").replaceChildren(table(["Hour", "Laptop", "Phone"], HOURS.map((h) => [hourLabel(h), minutes(l?.[h] ?? null), minutes(p?.[h] ?? null)])));
  $("moons").replaceChildren(...[...r.nights].reverse().map((n, i) => {
    const b = document.createElement("button"), t = document.createElement("b");
    b.style.setProperty("--i", String(i));
    b.setAttribute("aria-pressed", String(n.date === date));
    t.textContent = new Date(n.date + "T12:00").toLocaleDateString([], { day: "numeric", month: "short" });
    b.append(nightEye(n.sleepMin), t, hours(n.sleepMin));
    b.onclick = () => { night.value = n.date === date ? "" : n.date; render(); };
    return b;
  }));
  const m = (v: number | null) => (v === null ? "no record" : String(v));
  $("nights").replaceChildren(table(["Night", "Laptop late min", "Phone late min", "Doom min", "Sleep min"], [...r.nights].reverse().map((n) => [n.date, m(n.laptopLateMin), m(n.phoneLateMin), m(n.doomMin), m(n.sleepMin)])));
  show("report");
}

function reset(): void {
  me = null; session = null; vault = null; pendingKey = ""; cloud = []; imported = []; sampleRow = null;
  remember();
  show("start");
}

$<HTMLFormElement>("login").onsubmit = (e) => {
  e.preventDefault();
  const create = (e.submitter as HTMLButtonElement | null)?.id === "create";
  void attempt(() => enter(create ? signUp : signIn));
};
$<HTMLFormElement>("unlock-form").onsubmit = (e) => {
  e.preventDefault();
  void attempt(async () => open(await unlock(session!, vault!, val("words-in"))));
};
$("saved").onclick = () => void attempt(() => open(pendingKey));
$("sample").onclick = () => {
  source.value = "demo";
  if (document.startViewTransition) document.startViewTransition(render); else render();
};
for (const id of ["signin", "join", "join2"]) $(id).onclick = () => $<HTMLDialogElement>("door").showModal();
$("shut").onclick = () => $<HTMLDialogElement>("door").close();
$<HTMLDialogElement>("door").onclose = () => {
  // Walking away before unlocking forgets the half-finished sign-in.
  if (!me && session) { session = null; vault = null; pendingKey = ""; $("phrase").textContent = ""; show($("report").hidden ? "start" : "report"); }
};
$("refresh").onclick = () => void attempt(refresh);
source.onchange = night.onchange = render;
$("out").onclick = () => void attempt(async () => {
  const s = me?.session ?? session;
  reset();
  if (s) await signOut(C, s).catch(() => {});
});
$("export").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify([...cloud, ...imported], null, 2)], { type: "application/json" }));
  a.download = "mirror-export.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("file").onclick = () => $("file-in").click();
$<HTMLInputElement>("file-in").onchange = (e) => void attempt(async () => {
  const input = e.target as HTMLInputElement, f = input.files?.[0];
  if (!f) return;
  const v = parsePacket(f.size > 8192 ? "" : await f.text());
  input.value = "";
  if (!v.ok) throw new Error(v.error);
  imported = [...imported.filter((p) => p.date !== v.packet.date || p.device !== v.packet.device || p.demo !== v.packet.demo), v.packet];
  source.value = v.packet.demo ? "demo" : "real";
  render();
});
$("delete").onclick = () => {
  if (!confirm("Delete your account and every record on the server? This cannot be undone.")) return;
  void attempt(async () => {
    me!.session = await fresh(C, me!.session);
    await deleteAccount(C, me!.session);
    reset();
    $("error").textContent = "Account and cloud data deleted. Wipe each device to clear its own copy.";
  });
};

$("login").hidden = !C.url;
$("off").hidden = !!C.url;
me = recall();
if (me) void attempt(refresh).then(() => { if ($("report").hidden) reset(); });
else show("start");
