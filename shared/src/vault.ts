import { wordlist } from "@scure/bip39/wordlists/english.js";

/**
 * A random 256-bit data key encrypts every record. The recovery phrase only wraps that key,
 * so the phrase can be changed or lengthened later without re-encrypting records.
 *
 * SECURITY: each word adds 11 bits. 2 words (22 bits) can be guessed offline by whoever holds
 * the database. Use 6 before real users, and do not claim "we can't read it" until then.
 */
export const PHRASE_WORDS = 2;
const ITERATIONS = 600_000;

export interface Vault { salt: string; iterations: number; wrapped: string }

const enc = new TextEncoder(), dec = new TextDecoder();
type Bytes = Uint8Array<ArrayBuffer>;
const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));
export function toB64(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
export const fromB64 = (s: string): Bytes => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function newPhrase(words = PHRASE_WORDS): string {
  // 65536 is a multiple of 2048, so the remainder is unbiased.
  return Array.from(crypto.getRandomValues(new Uint16Array(words)), (n) => wordlist[n % 2048]!).join("-");
}
export const cleanPhrase = (p: string): string => p.trim().toLowerCase().split(/[\s-]+/).filter(Boolean).join("-");

const aes = (raw: Bytes) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function seal(key: CryptoKey, plain: Bytes, aad: string): Promise<string> {
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return toB64(out);
}
async function open(key: CryptoKey, sealed: string, aad: string): Promise<Bytes> {
  const b = fromB64(sealed);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12), additionalData: enc.encode(aad) }, key, b.slice(12)));
}

async function wrapKey(phrase: string, v: { salt: string; iterations: number }): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(cleanPhrase(phrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: fromB64(v.salt), iterations: v.iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function createVault(userId: string, phrase: string): Promise<{ vault: Vault; key: string }> {
  const raw = random(32), params = { salt: toB64(random(16)), iterations: ITERATIONS };
  const wrapped = await seal(await wrapKey(phrase, params), raw, `vault:${userId}`);
  return { vault: { ...params, wrapped }, key: toB64(raw) };
}

/** Throws if the phrase is wrong. */
export async function openVault(userId: string, vault: Vault, phrase: string): Promise<string> {
  if (!Number.isInteger(vault.iterations) || vault.iterations < ITERATIONS || vault.iterations > 5_000_000) throw new Error("Bad vault");
  try { return toB64(await open(await wrapKey(phrase, vault), vault.wrapped, `vault:${userId}`)); } catch { throw new Error("That recovery phrase is not right."); }
}

/** Stable but meaningless to the server, so it cannot see dates or devices. */
export async function recordId(key: string, name: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", fromB64(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`mirror-record:${name}`)));
  return Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Bound to user and record id, so the server cannot swap records around. */
export async function sealRecord(key: string, userId: string, id: string, value: unknown): Promise<string> {
  // Padding keeps the size from revealing how busy a day was.
  return seal(await aes(fromB64(key)), enc.encode(JSON.stringify(value).padEnd(1024)), `${userId}:${id}`);
}
export async function openRecord(key: string, userId: string, id: string, sealed: string): Promise<unknown> {
  return JSON.parse(dec.decode(await open(await aes(fromB64(key)), sealed, `${userId}:${id}`)));
}
