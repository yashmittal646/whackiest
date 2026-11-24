// In-memory stand-in for the few Supabase calls Mirror makes. Development and tests only.
// It imitates the row rules, but the real ones in supabase/schema.sql still need testing.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export function startMock(port = 0) {
  const users = new Map(), access = new Map(), refresh = new Map(), vaults = new Map(), records = new Map();
  const issue = (u) => {
    const a = randomUUID(), r = randomUUID();
    access.set(a, u); refresh.set(r, u);
    return { access_token: a, refresh_token: r, expires_in: 3600, user: { id: u.id, email: u.email } };
  };
  const server = createServer(async (q, s) => {
    const send = (code, body) => {
      s.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
      s.end(body === undefined ? "" : JSON.stringify(body));
    };
    if (q.method === "OPTIONS") return send(204);
    let text = "";
    for await (const c of q) text += c;
    const body = text ? JSON.parse(text) : null, u = new URL(q.url, "http://x"), p = u.pathname;
    if (p === "/auth/v1/signup") {
      if (users.has(body.email)) return send(422, { msg: "User already registered" });
      const n = { id: randomUUID(), email: body.email, password: body.password };
      users.set(n.email, n);
      return send(200, issue(n));
    }
    if (p === "/auth/v1/token" && u.searchParams.get("grant_type") === "password") {
      const n = users.get(body.email);
      return n?.password === body.password ? send(200, issue(n)) : send(400, { msg: "Invalid login credentials" });
    }
    if (p === "/auth/v1/token") {
      const n = refresh.get(body.refresh_token);
      refresh.delete(body.refresh_token);
      return n ? send(200, issue(n)) : send(400, { msg: "Invalid Refresh Token" });
    }
    const me = access.get((q.headers.authorization ?? "").replace("Bearer ", ""));
    if (!me || users.get(me.email) !== me) return send(401, { message: "JWT invalid" });
    if (p === "/auth/v1/logout") return send(204);
    if (p === "/rest/v1/rpc/delete_me") { users.delete(me.email); vaults.delete(me.id); records.delete(me.id); return send(204); }
    if (p === "/rest/v1/vaults" && q.method === "GET") return send(200, vaults.has(me.id) ? [vaults.get(me.id)] : []);
    if (p === "/rest/v1/vaults") {
      if (body.user_id !== me.id) return send(403, { message: "row-level security" });
      if (vaults.has(me.id)) return send(409, { message: "duplicate key" });
      vaults.set(me.id, body);
      return send(201);
    }
    if (p === "/rest/v1/records") {
      const mine = records.get(me.id) ?? new Map();
      records.set(me.id, mine);
      if (q.method === "GET") {
        const o = +u.searchParams.get("offset"), l = +u.searchParams.get("limit");
        return send(200, [...mine.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).slice(o, o + l));
      }
      if (body.some((r) => r.user_id !== me.id)) return send(403, { message: "row-level security" });
      for (const r of body) mine.set(r.id, { id: r.id, data: r.data });
      return send(201);
    }
    send(404, { message: "not found" });
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok({
    url: `http://127.0.0.1:${server.address().port}`, vaults, records, users, close: () => server.close(),
  })));
}
if (process.argv[2] === "serve") console.log((await startMock(54399)).url);
