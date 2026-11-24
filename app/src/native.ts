import { requireNativeModule } from "expo";
import { fromB64, toB64, type Span } from "@mirror/shared";

interface Native {
  random(n: number): string;
  pbkdf2(password: string, salt: string, iterations: number): Promise<string>;
  gcm(encrypt: boolean, key: string, iv: string, aad: string, data: string): Promise<string>;
  hmac(key: string, data: string): Promise<string>;
  hasUsageAccess(): boolean;
  openUsageSettings(): void;
  usage(from: number, to: number): Promise<Span[]>;
}
export const Native = requireNativeModule<Native>("MirrorNative");

// Only the parts of WebCrypto that shared/src/vault.ts uses, backed by Android's own crypto.
type Key = { b64: string };
const out = async (p: Promise<string>) => fromB64(await p).buffer;
const bytes = (d: ArrayBuffer | Uint8Array) => toB64(d instanceof Uint8Array ? d : new Uint8Array(d));
interface Gcm { iv: Uint8Array; additionalData: Uint8Array }

const subtle = {
  importKey: async (_format: string, raw: Uint8Array): Promise<Key> => ({ b64: bytes(raw) }),
  deriveKey: async (a: { salt: Uint8Array; iterations: number }, base: Key): Promise<Key> => ({ b64: await Native.pbkdf2(base.b64, bytes(a.salt), a.iterations) }),
  encrypt: (a: Gcm, k: Key, d: Uint8Array) => out(Native.gcm(true, k.b64, bytes(a.iv), bytes(a.additionalData), bytes(d))),
  decrypt: (a: Gcm, k: Key, d: Uint8Array) => out(Native.gcm(false, k.b64, bytes(a.iv), bytes(a.additionalData), bytes(d))),
  sign: (_a: string, k: Key, d: Uint8Array) => out(Native.hmac(k.b64, bytes(d))),
};
function getRandomValues<T extends ArrayBufferView>(view: T): T {
  new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(fromB64(Native.random(view.byteLength)));
  return view;
}
Object.defineProperty(globalThis, "crypto", { value: { subtle, getRandomValues }, configurable: true });

// Hermes may lack this.
if (typeof AbortSignal.timeout !== "function") {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };
}
