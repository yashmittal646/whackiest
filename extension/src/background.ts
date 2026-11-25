import { addReading, BURST_MIN, classifyUrl, spec, type Category, type Pose, type Reading } from "@mirror/shared";
import { clock, current, load, loadPosture, newState, type Command, type Message, type Posture, type State } from "./store.ts";
import { link, loadAccount, sync, unlink } from "./sync.ts";
import { newTrack, step } from "./tracker.ts";

const DEMO_MS = 2000; // one demo minute
const IDLE_SEC = 120;
const CHECK_MS = { real: BURST_MIN * 60000, demo: 12000 };
const SYNC_MS = 10 * 60000;

// All writes run one after another so events cannot overwrite each other.
let queue: Promise<unknown> = Promise.resolve();
function update(fn: (s: State) => Promise<State | void> | State | void): Promise<void> {
  const run = queue.then(async () => {
    const s = await load();
    const next = (await fn(s)) ?? s;
    await chrome.storage.local.set({ state: next });
  });
  queue = run.catch((e) => console.error(e));
  return run;
}

async function look(demo: boolean): Promise<{ active: boolean; category: Category }> {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  const idle = await chrome.idle.queryState(IDLE_SEC);
  // Opening Mirror's own popup must not count as leaving Chrome.
  const popup = (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.POPUP] })).length > 0;
  // A presenter may talk for minutes without touching the laptop, so the demo ignores idle.
  const away = idle === "locked" || (idle === "idle" && !demo);
  if (!win || !(win.focused || popup) || away) return { active: false, category: "neutral" };
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  // The URL is classified in memory and dropped.
  return { active: true, category: classifyUrl(tab?.url) };
}

const setPosture = (p: Posture) => chrome.storage.local.set({ posture: p });
const closeCamera = () => chrome.offscreen.closeDocument().catch(() => {});
let checking = false;

/** Opens a hidden page for one six-second camera burst when one is due. */
async function checkPosture(demo: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const p = await loadPosture(), now = Date.now();
    if (!p.base || now - p.tried < (demo ? CHECK_MS.demo : CHECK_MS.real - 5000)) return;
    if ((await chrome.idle.queryState(IDLE_SEC)) === "locked") return;
    await setPosture({ ...p, tried: now });
    await closeCamera();
    await chrome.offscreen.createDocument({ url: `offscreen.html#${encodeURIComponent(JSON.stringify(p.base))}`, reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "A six-second posture check. No frames are stored." });
  } catch (e) { console.error(e); } finally { checking = false; }
}
const keepReading = (reading: Reading | null, error: string) => update(async (s) => {
  await closeCamera();
  const p = await loadPosture();
  if (!p.base) return;
  await setPosture({ ...p, error, last: reading ? { ...reading, at: Date.now() } : p.last });
  if (!reading) return;
  if (s.demo) s.demo = addReading(s.demo, s.demoNow, reading); else s.real = addReading(s.real, Date.now(), reading);
});
async function slouching(demo: boolean): Promise<boolean | null> {
  const { base, last } = await loadPosture();
  return base && last && Date.now() - last.at < (demo ? 40000 : CHECK_MS.real + 120000) ? last.slouching : null;
}

async function tick(s: State): Promise<void> {
  const seen = await look(!!s.demo);
  if (s.demo) s.demoNow += 60000;
  const { track, nudge } = step(current(s), { now: clock(s), ...seen, switches: s.pendingSwitches, slouching: await slouching(!!s.demo) });
  s.pendingSwitches = 0;
  if (s.demo) s.demo = track; else s.real = track;
  await badge(track.score);
  if (nudge) await notify(nudge, !!s.demo).catch((e) => console.error(e));
}

async function badge(score: number): Promise<void> {
  await chrome.action.setBadgeText({ text: score ? String(score) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: score >= spec.nudge.threshold ? "#b4442f" : "#2f6f73" });
}

async function notify(kind: "doom" | "combined", demo: boolean): Promise<void> {
  await chrome.notifications.clear("mirror-nudge");
  await chrome.notifications.create("mirror-nudge", {
    type: "basic", iconUrl: "icon128.png", priority: 2,
    title: demo ? "Mirror (demo)" : "Mirror",
    message: kind === "combined" ? "You've been hunched and scrolling. Quick reset?" : "You've been scrolling for a while. Still what you came for?",
    buttons: [{ title: "I'm here on purpose" }],
  });
}

const intent = () => update((s) => { current(s).intentUntil = clock(s) + spec.nudge.intentMin * 60000; });

let timer: ReturnType<typeof setInterval> | undefined;
async function syncTimer(): Promise<void> {
  const on = !!(await load()).demo;
  if (on && timer === undefined) timer = setInterval(() => { void update((s) => (s.demo ? tick(s) : undefined)); void checkPosture(true); }, DEMO_MS);
  if (!on && timer !== undefined) { clearInterval(timer); timer = undefined; }
}

const postureOff = () => update(async () => { await closeCamera(); await chrome.storage.local.remove("posture"); });
const postureOn = async (base: Pose) => { await update(() => setPosture({ base, last: null, tried: 0, error: "" })); await checkPosture(!!(await load()).demo); };

async function command(cmd: Command): Promise<void> {
  if (cmd === "intent") return intent();
  if (cmd === "sync") return sync();
  if (cmd === "unlink") return unlink();
  if (cmd === "posture-off") return postureOff();
  if (cmd === "wipe") await postureOff();
  await update((s) => {
    if (cmd === "wipe") return newState();
    s.pendingSwitches = 0;
    if (cmd === "demo-on") {
      const d = new Date();
      d.setHours(23, 0, 0, 0);
      s.demo = newTrack();
      s.demoNow = d.getTime();
    } else s.demo = null;
  });
  if (cmd === "wipe") { await unlink(); await chrome.notifications.clear("mirror-nudge"); }
  await badge(0);
  await syncTimer();
}

const switched = () => void update((s) => { s.pendingSwitches++; });
chrome.tabs.onActivated.addListener(switched);
chrome.tabs.onUpdated.addListener((_id, change, tab) => { if (change.url && tab.active) switched(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== "minute") return;
  // In demo mode the fast timer drives time; this only revives it after a worker restart.
  void update((s) => (s.demo ? undefined : tick(s)));
  void syncTimer();
  void load().then((s) => { if (!s.demo) return checkPosture(false); });
  void loadAccount().then((a) => { if (a && Date.now() - a.lastSync > SYNC_MS) return sync(); });
});
chrome.notifications.onButtonClicked.addListener((id) => {
  if (id === "mirror-nudge") { void intent(); void chrome.notifications.clear(id); }
});
chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  const work = msg.cmd === "link" ? link(msg.session, msg.key).then(sync) : msg.cmd === "posture-on" ? postureOn(msg.base) : msg.cmd === "reading" ? keepReading(msg.reading, msg.error) : command(msg.cmd);
  work.then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});

async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get("minute"))) await chrome.alarms.create("minute", { periodInMinutes: 1 });
}
void ensureAlarm();
void syncTimer();
