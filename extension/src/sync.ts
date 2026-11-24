import { CloudError, fresh, upload, type CloudConfig, type DevicePacket, type Session } from "@mirror/shared";
import { load } from "./store.ts";
import { toPacket } from "./tracker.ts";

declare const __CONFIG__: CloudConfig;
declare const __REPORT_URL__: string;
export const CONFIG = __CONFIG__;
export const REPORT_URL = __REPORT_URL__;

export interface Account { session: Session; key: string; deviceId: string; lastSync: number; error: string; sent: Record<string, string> }

export async function loadAccount(): Promise<Account | null> {
  return ((await chrome.storage.local.get("account")).account as Account | undefined) ?? null;
}
const save = (a: Account) => chrome.storage.local.set({ account: a });

// One at a time: refresh tokens are single-use, and sign-out must not be undone by a sync in flight.
let queue: Promise<unknown> = Promise.resolve();
function exclusive(fn: () => Promise<void>): Promise<void> {
  const run = queue.then(fn);
  queue = run.catch((e) => console.error(e));
  return run;
}

export const link = (session: Session, key: string) => exclusive(() => save({ session, key, deviceId: crypto.randomUUID(), lastSync: 0, error: "", sent: {} }));
export const unlink = () => exclusive(() => chrome.storage.local.remove("account"));

export const sync = () => exclusive(async () => {
  const a = await loadAccount();
  if (!a || !CONFIG.url) return;
  try {
    const s = await fresh(CONFIG, a.session);
    if (s !== a.session) { a.session = s; await save(a); }
    const state = await load(), now = Date.now();
    const all = [[state.real, false], [state.demo, true]] as const;
    const todo: { name: string; print: string; packet: DevicePacket }[] = [];
    for (const [track, demo] of all) for (const [date, day] of Object.entries(track?.days ?? {})) {
      const name = `${demo ? "demo" : "real"}:${date}`, print = JSON.stringify(day);
      if (a.sent[name] !== print) todo.push({ name, print, packet: toPacket(date, day, demo, now) });
    }
    await upload(CONFIG, { session: a.session, key: a.key }, a.deviceId, todo.map((t) => t.packet));
    for (const t of todo) a.sent[t.name] = t.print;
    a.lastSync = now;
    a.error = "";
  } catch (e) {
    const gone = e instanceof CloudError && [400, 401, 403, 409].includes(e.status);
    a.error = gone ? "Sign out and sign in again." : e instanceof Error ? e.message : "Sync failed.";
  }
  await save(a);
});
