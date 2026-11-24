import { build, context } from "esbuild";
import { cp, rm, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { addUi, config, privacyGate } from "../dev/config.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
await privacyGate();
const c = await config();
await rm(here("dist"), { recursive: true, force: true });
const options = { entryPoints: [here("src/main.ts")], outfile: here("dist/main.js"), bundle: true, format: "esm", target: "es2022", legalComments: "none", define: c.define };
await build(options);
await cp(here("static"), here("dist"), { recursive: true });
await addUi(here("dist"));
const csp = `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src ${c.url || "'none'"}; base-uri 'none'; form-action 'none'`;
const html = await readFile(here("static/index.html"), "utf8");
await writeFile(here("dist/index.html"), html.replace("%CSP%", csp));
await writeFile(here("dist/_headers"), `/*\n  Content-Security-Policy: ${csp}; frame-ancestors 'none'\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n`);
console.log(`Built web/dist (privacy check passed, sync ${c.url ? "on" : "off"})`);
if (process.argv[2] === "serve") {
  const s = await (await context({})).serve({ servedir: here("dist"), host: "127.0.0.1", port: 5180 });
  console.log(`http://127.0.0.1:${s.port}`);
}
