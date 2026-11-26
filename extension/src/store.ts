import { usable, type FaceState, type Pose, type Reading, type Session, type Strictness } from "@mirror/shared";
import { newTrack, type Track } from "./tracker.ts";

/** Demo data lives in its own track, so it can never mix with real data. */
/** `doing` is a kind of activity ("Reading a PDF", "YouTube: Gaming"), never a page or title. */
export interface State { real: Track; demo: Track | null; demoNow: number; pendingSwitches: number; doing?: { label: string; kind: string } | null }
export const newState = (): State => ({ real: newTrack(), demo: null, demoNow: 0, pendingSwitches: 0 });

export async function load(): Promise<State> {
  const { state } = await chrome.storage.local.get("state");
  return (state as State | undefined) ?? newState();
}
export const current = (s: State): Track => s.demo ?? s.real;
export const clock = (s: State): number => (s.demo ? s.demoNow : Date.now());

/** Null base = camera off. Only proportions and the last verdict are kept. */
export interface Posture { base: Pose | null; last: (Reading & { at: number }) | null; tried: number; error: string; strict?: Strictness; old?: boolean; slouchRun?: number; expressions?: boolean; face?: FaceState & { at: number }; blink?: boolean; blinkTried?: number; blinks?: number[]; blinkNow?: string }
export async function loadPosture(): Promise<Posture> {
  const p = ((await chrome.storage.local.get("posture")).posture as Posture | undefined) ?? { base: null, last: null, tried: 0, error: "" };
  // Baselines from before the head measures cannot be compared, so they are set again.
  return p.base && !usable(p.base) ? { ...p, base: null, last: null, old: true } : p;
}

export type Command = "intent" | "demo-on" | "demo-off" | "wipe" | "sync" | "unlink" | "posture-off" | "blink-on" | "blink-off" | "blink-now" | "gentle" | "normal" | "strict" | "alerts-on" | "alerts-off" | "expr-on" | "expr-off";
export type Message = { cmd: Command } | { cmd: "link"; session: Session; key: string } | { cmd: "posture-on"; base: Pose } | { cmd: "card"; action: string } | { cmd: "reading"; reading: Reading | null; blink: number | null; face: FaceState | null; blinked: boolean; error: string };
/** Only the background writes state; pages send it commands. */
export const send = (m: Message): Promise<unknown> => chrome.runtime.sendMessage(m);
