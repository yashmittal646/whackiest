// The ONLY file in Mirror allowed to use the network. The build fails on any other.
import { validatePacket, type DevicePacket } from "./packet.ts";
import { createVault, newPhrase, openRecord, openVault, recordId, sealRecord, type Vault } from "./vault.ts";

export interface CloudConfig { url: string; key: string }
export interface Session { access: string; refresh: string; expiresAt: number; userId: string; email: string }
export interface Unlocked { session: Session; key: string }

export class CloudError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

async function call(c: CloudConfig, path: string, o: { method?: string; token?: string; body?: unknown; prefer?: string } = {}): Promise<unknown> {
  let r: Response;
  try {
    r = await fetch(c.url + path, {
      method: o.method ?? "GET", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(20_000),
      headers: { apikey: c.key, ...(o.token ? { authorization: `Bearer ${o.token}` } : {}), "content-type": "application/json", ...(o.prefer ? { prefer: o.prefer } : {}) },
      ...(o.body === undefined ? {} : { body: JSON.stringify(o.body) }),
    });
  } catch { throw new CloudError("Could not reach the sync server.", 0); }
  const text = await r.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!r.ok) {
    const e = (data ?? {}) as Record<string, unknown>;
    throw new CloudError(String(e.msg ?? e.error_description ?? e.message ?? `Server error ${r.status}`), r.status);
  }
  return data;
}

function toSession(x: unknown): Session {
  const a = x as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string; email?: string } } | null;
  if (!a?.access_token || !a.refresh_token || !a.user) throw new CloudError("Check your email to confirm the account, then sign in.", 0);
  return { access: a.access_token, refresh: a.refresh_token, expiresAt: Date.now() + (a.expires_in ?? 3600) * 1000, userId: a.user.id, email: a.user.email ?? "" };
}

export const signUp = async (c: CloudConfig, email: string, password: string) => toSession(await call(c, "/auth/v1/signup", { method: "POST", body: { email, password } }));
export const signIn = async (c: CloudConfig, email: string, password: string) => toSession(await call(c, "/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }));
export const signOut = (c: CloudConfig, s: Session) => call(c, "/auth/v1/logout?scope=local", { method: "POST", token: s.access });
/** Refresh tokens are single-use: store the result before doing anything else. */
export async function fresh(c: CloudConfig, s: Session): Promise<Session> {
  if (s.expiresAt - Date.now() > 60_000) return s;
  return toSession(await call(c, "/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: s.refresh } }));
}
export const deleteAccount = (c: CloudConfig, s: Session) => call(c, "/rest/v1/rpc/delete_me", { method: "POST", token: s.access, body: {} });

export async function getVault(c: CloudConfig, s: Session): Promise<Vault | null> {
  const rows = (await call(c, "/rest/v1/vaults?select=salt,iterations,wrapped", { token: s.access })) as Vault[];
  return rows[0] ?? null;
}
/** First device only. A second device racing this gets a conflict instead of overwriting the key. */
export async function setUpVault(c: CloudConfig, s: Session): Promise<{ phrase: string; key: string }> {
  const phrase = newPhrase();
  const { vault, key } = await createVault(s.userId, phrase);
  await call(c, "/rest/v1/vaults", { method: "POST", token: s.access, body: { user_id: s.userId, ...vault } });
  return { phrase, key };
}
export const unlock = (s: Session, v: Vault, phrase: string) => openVault(s.userId, v, phrase);

export async function upload(c: CloudConfig, u: Unlocked, deviceId: string, packets: DevicePacket[]): Promise<void> {
  if (!packets.length) return;
  const body = await Promise.all(packets.map(async (p) => {
    const id = await recordId(u.key, `${deviceId}:${p.demo ? "demo" : "real"}:${p.date}`);
    return { user_id: u.session.userId, id, data: await sealRecord(u.key, u.session.userId, id, p) };
  }));
  await call(c, "/rest/v1/records?on_conflict=user_id,id", { method: "POST", token: u.session.access, body, prefer: "resolution=merge-duplicates,return=minimal" });
}

const PAGE = 500;
export interface Download { packets: DevicePacket[]; unreadable: number; sample: string | null }
export async function download(c: CloudConfig, u: Unlocked): Promise<Download> {
  const out: Download = { packets: [], unreadable: 0, sample: null };
  for (let offset = 0; ; offset += PAGE) {
    const rows = (await call(c, `/rest/v1/records?select=id,data&order=id&limit=${PAGE}&offset=${offset}`, { token: u.session.access })) as { id: string; data: string }[];
    for (const r of rows) {
      out.sample ??= r.data;
      try {
        const v = validatePacket(await openRecord(u.key, u.session.userId, r.id, r.data));
        if (v.ok) out.packets.push(v.packet); else out.unreadable++;
      } catch { out.unreadable++; }
    }
    if (rows.length < PAGE) return out;
  }
}
