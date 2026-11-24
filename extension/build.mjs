import { build } from "esbuild";
import { cp, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { addUi, config, privacyGate } from "../dev/config.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
await privacyGate();
const c = await config();
await rm(here("dist"), { recursive: true, force: true });
await build({
  entryPoints: ["background", "popup", "share", "privacy", "account"].map((n) => here(`src/${n}.ts`)),
  outdir: here("dist"), bundle: true, format: "esm", target: "chrome120", legalComments: "none", define: c.define,
});
await cp(here("static"), here("dist"), { recursive: true });
await addUi(here("dist"));
// The only address the extension may contact is our own sync server.
const m = JSON.parse(await readFile(here("static/manifest.json"), "utf8"));
const csp = m.content_security_policy;
csp.extension_pages = csp.extension_pages.replace("connect-src 'self'", `connect-src ${c.url || "'none'"}`);
await writeFile(here("dist/manifest.json"), JSON.stringify(m, null, 2));
console.log(`Built extension/dist (privacy check passed, sync ${c.url ? "on" : "off"})`);
