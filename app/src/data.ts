import * as SecureStore from "expo-secure-store";
import Storage from "expo-sqlite/kv-store";
import { PermissionsAndroid, Platform } from "react-native";
import { APPS, spec, fresh, keepFuller, phonePackets, phoneWindow, trackPhone, upload, type CloudConfig, type DevicePacket, type Track, type Unlocked } from "@mirror/shared";
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

/** Recounts the last three days from Android's usage log. App names are dropped here. */
export async function measure(): Promise<{ days: DevicePacket[]; track: Track | null }> {
  const stored = await loadDays();
  if (!Native.hasUsageAccess()) return { days: stored, track: null };
  const now = Date.now(), from = phoneWindow(now, 3);
  const track = trackPhone(await Native.usage(from, now), from, now);
  const days = keepFuller(stored, phonePackets(track, now), now);
  await Storage.setItemAsync("days", JSON.stringify(days));
  return { days, track };
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
  if (ok) await Native.startWatch(JSON.stringify({ spec, apps: APPS }));
  return ok;
}

export async function wipe(): Promise<void> {
  await Native.stopWatch(true);
  await clearAccount();
  await Storage.clearAsync();
}
