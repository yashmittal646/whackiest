import type { Session } from "@mirror/shared";
import { newTrack, type Track } from "./tracker.ts";

/** Demo data lives in its own track, so it can never mix with real data. */
export interface State { real: Track; demo: Track | null; demoNow: number; pendingSwitches: number }
export const newState = (): State => ({ real: newTrack(), demo: null, demoNow: 0, pendingSwitches: 0 });

export async function load(): Promise<State> {
  const { state } = await chrome.storage.local.get("state");
  return (state as State | undefined) ?? newState();
}
export const current = (s: State): Track => s.demo ?? s.real;
export const clock = (s: State): number => (s.demo ? s.demoNow : Date.now());

export type Command = "intent" | "demo-on" | "demo-off" | "wipe" | "sync" | "unlink";
export type Message = { cmd: Command } | { cmd: "link"; session: Session; key: string };
/** Only the background writes state; pages send it commands. */
export const send = (m: Message): Promise<unknown> => chrome.runtime.sendMessage(m);
