import { activity, addBlinks, describe, isLateNight, addReading, BLINK_EVERY_MIN, BURST_MIN, blinkTrend, remember, SEAT_MIN, spec, wasteSwitch, type Activity, type Pose } from "@mirror/shared";
import { clock, current, load, loadPosture, newState, type Command, type Message, type Posture, type State } from "./store.ts";
import { link, loadAccount, sync, unlink } from "./sync.ts";
import { showCard } from "./overlay.ts";
import { newTrack, step } from "./tracker.ts";
import { addFace } from "@mirror/shared";

const DEMO_MS = 2000; // one demo minute
const IDLE_SEC = 120;
const CHECK_MS = { real: BURST_MIN * 60000, demo: 12000 };
const BLINK_MS = BLINK_EVERY_MIN * 60000;
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

/**
 * YouTube's own category for the open video ("Education", "Gaming", ...), read from the player on the page.
 * Used once to sort the video, then dropped. Needs the YouTube host permission and nothing else.
 */
async function videoCategory(tab: chrome.tabs.Tab | undefined): Promise<string | null> {
  if (!tab?.id || !/^https:\/\/(www|m)\.youtube\.com\/watch/.test(tab.url ?? "")) return null;
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: "MAIN",
      func: () => {
        type Player = { getPlayerResponse?: () => { microformat?: { playerMicroformatRenderer?: { category?: string } } } };
        return (document.getElementById("movie_player") as unknown as Player | null)?.getPlayerResponse?.()?.microformat?.playerMicroformatRenderer?.category ?? null;
      },
    });
    return typeof r?.result === "string" ? r.result.slice(0, 40) : null;
  } catch { return null; }
}

/** The active tab, sorted into a kind of activity. The address and title are used here and dropped. */
async function currentTab(): Promise<{ tab: chrome.tabs.Tab | undefined; act: Activity }> {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  const [tab] = win ? await chrome.tabs.query({ active: true, windowId: win.id }) : [];
  return { tab, act: activity(tab?.url, tab?.title ?? "", await videoCategory(tab)) };
}

async function look(demo: boolean): Promise<{ active: boolean; category: Activity["category"]; act: Activity | null }> {
  const win = await chrome.windows.getLastFocused().catch(() => null);
  const idle = await chrome.idle.queryState(IDLE_SEC);
  // Opening Mirror's own popup must not count as leaving Chrome.
  const popup = (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.POPUP] })).length > 0;
  // A presenter may talk for minutes without touching the laptop, so the demo ignores idle.
  const away = idle === "idle" && !demo;
  if (!win || !(win.focused || popup) || idle === "locked") return { active: false, category: "neutral", act: null };
  const { tab, act } = await currentTab();
  // Watching a video means not touching the keyboard, so a tab playing sound counts as present.
  if (away && !tab?.audible) return { active: false, category: "neutral", act: null };
  return { active: true, category: act.category, act };
}

const setPosture = (p: Posture) => chrome.storage.local.set({ posture: p });
const closeCamera = () => chrome.offscreen.closeDocument().catch(() => {});
let checking = false, blinkWanted = false;

/** Opens a hidden page for one short camera check when one is due. */
async function checkCamera(demo: boolean, blinkNow = false): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const p = await loadPosture(), now = Date.now();
    // A check already open gets time to finish.
    const open = (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })).length > 0;
    if (!p.base) return;
    if (open && now - Math.max(p.tried, p.blinkTried ?? 0) < 60000) {
      // Busy with another check: run the eye check as soon as it ends.
      if (blinkNow) { blinkWanted = true; await setPosture({ ...p, blinkNow: "Waiting for the posture check to finish…" }); }
      return;
    }
    const posture = !blinkNow && now - p.tried >= (demo ? CHECK_MS.demo : CHECK_MS.real - 5000);
    const blink = blinkNow || (!!p.blink && !demo && now - (p.blinkTried ?? 0) >= BLINK_MS - 5000);
    if (!posture && !blink) return;
    if ((await chrome.idle.queryState(IDLE_SEC)) === "locked") return;
    await setPosture({ ...p, tried: posture ? now : p.tried, ...(blink ? { blinkTried: now, blinkNow: "Watching your eyes for 20 seconds." } : {}) });
    await closeCamera();
    const job = encodeURIComponent(JSON.stringify({ base: p.base, strict: p.strict ?? "normal", posture, blink, expressions: !!p.expressions }));
    await chrome.offscreen.createDocument({ url: `offscreen.html#${job}`, reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: "A short posture or blink check. No frames are stored." });
  } catch (e) { console.error(e); } finally { checking = false; }
}
const keepReading = (m: Extract<Message, { cmd: "reading" }>) => update(async (s) => {
  await closeCamera();
  const p = await loadPosture();
  if (!p.base) return;
  p.error = m.error;
  if (m.reading) p.last = { ...m.reading, at: Date.now() };
  let t = current(s), kind: Nudge | null = null;
  const now = clock(s);
  if (m.blinked) {
    p.blinkNow = m.blink === null ? "Couldn't read your eyes. Face the camera, with more light." : `${m.blink} blinks a minute${m.face ? ` · ${describe(m.face)}` : ""}.`;
    if (m.face) {
      p.face = { ...m.face, at: Date.now() };
      t = addFace(t, now, m.face);
      if (m.face.drowsy) kind = "drowsy";
    }
    if (m.blink !== null) {
      t = addBlinks(t, now, m.blink);
      p.blinks = remember(p.blinks ?? [], m.blink);
      const trend = blinkTrend(p.blinks);
      if (trend === "low") kind = "eyes";
      if (trend === "high") kind = "blinky";
    }
  }
  if (m.reading) {
    t = addReading(t, now, m.reading);
    // Two slouching checks in a row, about ten minutes, earn a word. One could be reaching for a cup.
    p.slouchRun = m.reading.slouching ? (p.slouchRun ?? 0) + 1 : m.reading.slouching === false ? 0 : p.slouchRun ?? 0;
    if (p.slouchRun >= 2 && !kind) { kind = "posture"; p.slouchRun = 0; }
    if ((t.seat ?? 0) >= SEAT_MIN) kind = "stand";
  }
  if (kind && now >= t.intentUntil && now - t.lastNudge >= spec.nudge.cooldownMin * 60000) {
    t.lastNudge = now;
    if (kind === "stand") t.seat = 0;
    const late = kind === "drowsy" && isLateNight(new Date(now).getHours());
    await notify(kind, !!s.demo, late ? "Your eyes keep closing and it's late. Time to sleep?" : SAY[kind]).catch((e) => console.error(e));
  }
  await setPosture(p);
  if (s.demo) s.demo = t; else s.real = t;
  if (blinkWanted) { blinkWanted = false; setTimeout(() => void checkCamera(!!s.demo, true), 500); }
});
const setBlink = (blink: boolean) => update(async () => setPosture({ ...(await loadPosture()), blink, blinkNow: "" }));
async function slouching(demo: boolean): Promise<boolean | null> {
  const { base, last } = await loadPosture();
  return base && last && Date.now() - last.at < (demo ? 40000 : CHECK_MS.real + 120000) ? last.slouching : null;
}

async function tick(s: State): Promise<void> {
  const { act, ...seen } = await look(!!s.demo);
  s.doing = act && act.label ? { label: act.label, kind: act.kind } : null;
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

type Nudge = "doom" | "combined" | "eyes" | "stand" | "switch" | "drowsy" | "posture" | "blinky";
const SAY: Record<Nudge, string> = {
  doom: "You've been scrolling for a while. Still what you came for?",
  combined: "You've been hunched and scrolling. Quick reset?",
  eyes: "You're blinking less than usual. Look at something far away for 20 seconds.",
  stand: "You've been at the desk for 90 minutes. Stand up for a bit?",
  switch: "",
  posture: "You've been slouching for the last few checks. Sit back, shoulders down, head over your shoulders.",
  blinky: "You're blinking much more than usual: often a sign of tired or irritated eyes. Rest them for a few minutes and look far away. If they are also red, sore or sticky, or this keeps happening, see a doctor.",
  drowsy: "Your eyes keep closing. A short break, some water or fresh air might help.",
};
const TITLE: Record<Nudge, string> = { posture: "Sit up", blinky: "Tired eyes?", drowsy: "You look drowsy", doom: "Doom-scrolling?", combined: "Hunched and scrolling", eyes: "Rest your eyes", stand: "Time to stand up", switch: "Still what you came for?" };

/**
 * A nudge you cannot miss: a card over the page itself, on the time-wasting sites Mirror may draw on.
 * Anywhere else, or if the page refuses, it falls back to a system notification.
 */
async function notify(kind: Nudge, demo: boolean, say = SAY[kind]): Promise<void> {
  const { tab } = await currentTab(), study = (await chrome.storage.session.get("studyTab")).studyTab as number | undefined;
  // After "I'm here on purpose" on a site, its scrolling nudges stay quiet until Chrome closes.
  if (["doom", "combined", "switch"].includes(kind) && (await okayed(tab?.url))) return;
  const back = study !== undefined && !!(await chrome.tabs.get(study).catch(() => null));
  if (tab?.id) try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: showCard, args: [{ title: TITLE[kind], text: say, back, demo }] });
    await chrome.notifications.clear("mirror-nudge");
    return;
  } catch { /* not a site Mirror may draw on */ }
  await chrome.notifications.clear("mirror-nudge");
  await chrome.notifications.create("mirror-nudge", {
    type: "basic", iconUrl: "icon128.png", priority: 2,
    title: demo ? "Mirror (demo)" : "Mirror",
    message: say,
    buttons: [{ title: "I'm here on purpose" }],
  });
}

const intent = () => update((s) => { current(s).intentUntil = clock(s) + spec.nudge.intentMin * 60000; });

let timer: ReturnType<typeof setInterval> | undefined;
async function syncTimer(): Promise<void> {
  const on = !!(await load()).demo;
  if (on && timer === undefined) timer = setInterval(() => { void update((s) => (s.demo ? tick(s) : undefined)); void checkCamera(true); }, DEMO_MS);
  if (!on && timer !== undefined) { clearInterval(timer); timer = undefined; }
}

const postureOff = () => update(async () => { await closeCamera(); await chrome.storage.local.remove("posture"); });
const postureOn = async (base: Pose) => { await update(async () => setPosture({ ...(await loadPosture()), base, old: false, last: null, tried: 0, error: "" })); await checkCamera(!!(await load()).demo); };

async function command(cmd: Command): Promise<void> {
  if (cmd === "intent") return intent();
  if (cmd === "sync") return sync();
  if (cmd === "unlink") return unlink();
  if (cmd === "posture-off") return postureOff();
  if (cmd === "blink-on" || cmd === "blink-off") return setBlink(cmd === "blink-on");
  if (cmd === "gentle" || cmd === "normal" || cmd === "strict") return update(async () => setPosture({ ...(await loadPosture()), strict: cmd }));
  if (cmd === "expr-on" || cmd === "expr-off") return update(async () => setPosture({ ...(await loadPosture()), expressions: cmd === "expr-on" }));
  if (cmd === "alerts-on" || cmd === "alerts-off") { await chrome.storage.local.set({ alerts: { ...(await loadAlerts()), on: cmd === "alerts-on" } }); return; }
  if (cmd === "blink-now") return checkCamera(!!(await load()).demo, true);
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

// Switch alerts: a word 25 seconds after arriving at a time-waster, if you are still there.
const ALERT_MS = spec.switchAlertSec * 1000, ALERT_GAP_MS = spec.switchAlertGapMin * 60000;
interface Pending { tabId: number; label: string; from: Activity["kind"] | null; at: number }
let before: Activity | null = null;
interface Alerts { on: boolean; last: number }
const loadAlerts = async (): Promise<Alerts> => ((await chrome.storage.local.get("alerts")).alerts as Alerts | undefined) ?? { on: true, last: 0 };

async function noticeSwitch(): Promise<void> {
  const { tab, act } = await currentTab();
  // A new, blank tab is a step on the way somewhere, not a place you were.
  if (!tab?.url || /^(chrome:\/\/newtab|about:blank|chrome:\/\/new-tab-page)/.test(tab.url)) return;
  const from = before;
  before = act;
  // Remembered so a nudge can offer the way back.
  if (tab?.id && act.kind === "study") await chrome.storage.session.set({ studyTab: tab.id });
  if (!tab?.id || !wasteSwitch(from, act) || !(await loadAlerts()).on) return;
  const p: Pending = { tabId: tab.id, label: act.label, from: from?.kind ?? null, at: Date.now() + ALERT_MS };
  await chrome.storage.session.set({ pending: p });
  setTimeout(() => void confirmSwitch(), ALERT_MS + 200);
  // In case the worker sleeps first. Chrome runs alarms no sooner than 30 seconds.
  await chrome.alarms.create("switch", { when: p.at });
}
async function confirmSwitch(): Promise<void> {
  const p = (await chrome.storage.session.get("pending")).pending as Pending | undefined;
  if (!p || Date.now() < p.at) return;
  await chrome.storage.session.remove("pending");
  const { tab, act } = await currentTab(), win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win?.focused || tab?.id !== p.tabId || act.kind !== "waste") return;
  const s = await load(), t = current(s), a = await loadAlerts(), now = Date.now();
  if (await okayed(tab?.url)) return;
  if (clock(s) < t.intentUntil || now - a.last < ALERT_GAP_MS) return;
  await chrome.storage.local.set({ alerts: { ...a, last: now } });
  const was = p.from === "study" ? " You were studying a moment ago." : "";
  await notify("switch", !!s.demo, `${act.label} for ${spec.switchAlertSec} seconds.${was}`);
}

const switched = () => { void update((s) => { s.pendingSwitches++; }); void noticeSwitch(); };
chrome.tabs.onActivated.addListener(switched);
chrome.tabs.onUpdated.addListener((_id, change, tab) => {
  if (change.url && tab.active) switched();
  // YouTube changes video without loading a page; the title changes when it has.
  else if (change.title && tab.active) void noticeSwitch();
});
chrome.windows.onFocusChanged.addListener((w) => { if (w !== chrome.windows.WINDOW_ID_NONE) void noticeSwitch(); });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "switch") return void confirmSwitch();
  if (a.name !== "minute") return;
  // In demo mode the fast timer drives time; this only revives it after a worker restart.
  void update((s) => (s.demo ? undefined : tick(s)));
  void syncTimer();
  void load().then((s) => { if (!s.demo) return checkCamera(false); });
  void loadAccount().then((a) => { if (a && Date.now() - a.lastSync > SYNC_MS) return sync(); });
});
chrome.notifications.onButtonClicked.addListener((id) => {
  if (id === "mirror-nudge") { void intent(); void chrome.notifications.clear(id); }
});
/** A choice made on the nudge card. The page itself can only ask for these three things. */
/** Sites you said you are on on purpose, this browser session only. Held in memory, never written to disk. */
const site = (url: string | undefined) => { try { return new URL(url ?? "").hostname; } catch { return ""; } };
async function okayed(url: string | undefined): Promise<boolean> {
  return (((await chrome.storage.session.get("okay")).okay as string[] | undefined) ?? []).includes(site(url));
}

async function card(action: string, tab: chrome.tabs.Tab | undefined): Promise<void> {
  if (action === "purpose") {
    const okay = ((await chrome.storage.session.get("okay")).okay as string[] | undefined) ?? [];
    if (site(tab?.url)) await chrome.storage.session.set({ okay: [...new Set([...okay, site(tab?.url)])] });
    return intent();
  }
  if (action === "close" && tab?.id) { await chrome.tabs.remove(tab.id); return; }
  const study = (await chrome.storage.session.get("studyTab")).studyTab as number | undefined;
  const to = study === undefined ? null : await chrome.tabs.get(study).catch(() => null);
  if (action !== "back" || !to?.id) return;
  // Studied in this same tab: step back to it.
  if (to.id === tab?.id) { await chrome.tabs.goBack(to.id).catch(() => {}); return; }
  await chrome.tabs.update(to.id, { active: true });
  await chrome.windows.update(to.windowId, { focused: true });
}

chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  // Messages from web pages (the nudge card) may only report a button press.
  const ours = sender.url?.startsWith(chrome.runtime.getURL("")) ?? false;
  if (!ours) {
    if (msg.cmd === "card" && sender.tab) void card(msg.action, sender.tab);
    return;
  }
  if (msg.cmd === "card") return;
  const work = msg.cmd === "link" ? link(msg.session, msg.key).then(sync) : msg.cmd === "posture-on" ? postureOn(msg.base) : msg.cmd === "reading" ? keepReading(msg) : command(msg.cmd);
  work.then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});

async function ensureAlarm(): Promise<void> {
  if (!(await chrome.alarms.get("minute"))) await chrome.alarms.create("minute", { periodInMinutes: 1 });
}
void ensureAlarm();
void syncTimer();
