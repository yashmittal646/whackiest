import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { PermissionsAndroid, Platform } from "react-native";
import { APPS, PHONE, kindMinutes, dayStart, session, typical, unsteady, usable, type Pose, lastNight, sleepByDay, spec, fresh, keepFuller, phonePackets, phoneWindow, trackPhone, upload, type CloudConfig, type DevicePacket, type Sleep, type Unlocked } from "@mirror/shared";
import { Native } from "./native";
import config from "./config.gen.json";

export const CONFIG: CloudConfig = config;
export interface Account extends Unlocked { deviceId: string }

// Login tokens and the data key sit behind the Android Keystore. Daily totals are in SQLite.
export async function loadAccount(): Promise<Account | null> {
  try { return JSON.parse((await SecureStore.getItemAsync("account")) ?? "null") as Account | null; } catch { return null; }
}
export const saveAccount = (a: Account) => SecureStore.setItemAsync("account", JSON.stringify(a));
export const clearAccount = () => SecureStore.deleteItemAsync("account");

async function read<T>(key: string, empty: T): Promise<T> {
  try { return JSON.parse((await Storage.getItemAsync(key)) ?? "") as T; } catch { return empty; }
}
export const loadDays = () => read<DevicePacket[]>("days", []);

export const loadSleep = () => read<Record<string, Sleep>>("sleep", {});
/** Null clears a typed-in night. */
export async function typeSleep(min: number | null): Promise<void> {
  const s = await loadSleep(), key = lastNight(Date.now());
  if (min === null) delete s[key]; else s[key] = { min, from: "you" };
  await Storage.setItemAsync("sleep", JSON.stringify(s));
}
async function readSleep(now: number): Promise<{ sleep: Record<string, Sleep>; problem: string }> {
  const sleep = await loadSleep();
  let problem = "";
  if (Native.sleepAllowed()) try {
    const got = sleepByDay(await Native.sleep(now - 30 * 86400000, now));
    for (const [date, min] of Object.entries(got)) if (sleep[date]?.from !== "you") sleep[date] = { min, from: "health" };
    await Storage.setItemAsync("sleep", JSON.stringify(sleep));
  } catch { problem = "Health Connect couldn't be read just now."; }
  return { sleep, problem };
}
export const askSleep = () => PermissionsAndroid.request("android.permission.health.READ_SLEEP" as Parameters<typeof PermissionsAndroid.request>[0]);

/** Kept on this phone only. */
export interface Sitting { base: Pose | null; log: { at: number; slouch: number; lean: number }[] }
export const loadSitting = () => read<Sitting>("sitting", { base: null, log: [] });
/** Saves a good-posture baseline, or a check against it. */
export async function saveSitting(kind: "base" | "check", poses: (Pose | null)[]): Promise<Sitting> {
  const s = await loadSitting(), ok = poses.flatMap((p) => (p ? [p] : [])), unclear = new Error("Mirror couldn't see both ears clearly. Face the phone, with more light.");
  if (kind === "base") { const problem = unsteady(ok); if (problem) throw new Error(problem.replace("the screen", "the phone")); s.base = typical(ok); }
  else {
    const r = s.base && usable(s.base) ? session(poses, s.base) : null;
    if (!r) throw unclear;
    s.log = [...s.log, { at: Date.now(), ...r }].slice(-30);
  }
  await Storage.setItemAsync("sitting", JSON.stringify(s));
  return s;
}

/** Recounts the last three days from Android's usage log. App names are dropped here. */
export async function measure(): Promise<{ days: DevicePacket[]; sleep: Record<string, Sleep>; problem: string; kinds: { study: number; waste: number } | null }> {
  const stored = await loadDays(), now = Date.now(), { sleep, problem } = await readSleep(now);
  const join = (days: DevicePacket[]) => days.map((d) => ({ ...d, sleepMin: sleep[d.date]?.min ?? null }));
  if (!Native.hasUsageAccess()) return { days: join(stored), sleep, problem, kinds: null };
  const from = phoneWindow(now, 3);
  const spans = await Native.usage(from, now), track = trackPhone(spans, from, now);
  const days = join(keepFuller(stored, phonePackets(track, now), now));
  await Storage.setItemAsync("days", JSON.stringify(days));
  return { days, sleep, problem, kinds: kindMinutes(spans, dayStart(now), now) };
}

/** Uploads changed days and returns the account with its current session. */
export async function sync(account: Account, days: DevicePacket[]): Promise<Account> {
  const session = await fresh(CONFIG, account.session);
  const a = { ...account, session };
  if (session !== account.session) await saveAccount(a);
  const sent = await read<Record<string, string>>("sent", {});
  const print = (p: DevicePacket) => `${a.deviceId}:${JSON.stringify({ ...p, generatedAt: 0 })}`;
  const todo = days.filter((p) => sent[p.date] !== print(p));
  await upload(CONFIG, a, a.deviceId, todo);
  for (const p of todo) sent[p.date] = print(p);
  await Storage.setItemAsync("sent", JSON.stringify(sent));
  return a;
}

/** Starts live nudges, or restarts them with current settings. Returns false if notifications are refused. */
export async function watch(): Promise<boolean> {
  const ok = Number(Platform.Version) < 33 || (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS!)) === "granted";
  if (ok) await Native.startWatch(JSON.stringify({ spec, apps: APPS, phone: PHONE }));
  return ok;
}

export async function wipe(): Promise<void> {
  await Native.stopWatch(true);
  await clearAccount();
  await Storage.clearAsync();
}
