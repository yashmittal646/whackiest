// Shared build steps: checked config, and the privacy gate.
import { cp, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL("../" + p, import.meta.url));

export async function config() {
  const file = JSON.parse(await readFile(root("mirror.config.json"), "utf8"));
  const url = (process.env.MIRROR_URL ?? file.supabaseUrl).replace(/\/+$/, "");
  const key = process.env.MIRROR_KEY ?? file.supabaseKey;
  const reportUrl = process.env.MIRROR_REPORT ?? file.reportUrl;
  if (url && !/^(https:\/\/[a-z0-9]+\.supabase\.co|http:\/\/127\.0\.0\.1:\d+)$/.test(url)) throw new Error("supabaseUrl should look like https://abc123.supabase.co");
  if (key.startsWith("sb_secret_")) throw new Error("That is a SECRET key. Use the publishable key, and rotate the secret one.");
  if (key.split(".").length === 3) {
    const { role } = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    if (role !== "anon") throw new Error(`That key has the role "${role}". Use the anon or publishable key, and rotate this one.`);
  }
  if (reportUrl && !/^(https:\/\/|http:\/\/127\.0\.0\.1:)/.test(reportUrl)) throw new Error("reportUrl must start with https://");
  return { url, key, define: { __CONFIG__: JSON.stringify({ url, key }), __REPORT_URL__: JSON.stringify(reportUrl) } };
}

/** Network code may exist only in shared/src/cloud.ts. Image and video capture may not exist at all. */
export async function privacyGate() {
  const network = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|WebTransport|RTCPeerConnection)/;
  const capture = /\b(MediaRecorder|toDataURL|toBlob|captureStream)\b/;
  for (const dir of ["shared/src", "extension/src", "web/src", "app/src", "ui"]) for (const f of await readdir(root(dir))) {
    const text = await readFile(root(`${dir}/${f}`), "utf8");
    const bad = capture.exec(text) ?? (`${dir}/${f}` === "shared/src/cloud.ts" ? null : network.exec(text));
    if (/getUserMedia/.test(text) && `${dir}/${f}` !== "extension/src/camera.ts") throw new Error(`Privacy check failed: camera use in ${dir}/${f}`);
    if (bad) throw new Error(`Privacy check failed: ${bad[0]} in ${dir}/${f}`);
  }
}

/** The eye styles and fonts shared by the website and extension. */
export async function addUi(dist) {
  await cp(root("ui/eye.css"), `${dist}/eye.css`);
  const font = (pkg, file, to) => cp(root(`node_modules/@fontsource-variable/${pkg}/files/${file}`), `${dist}/fonts/${to}.woff2`);
  await font("anybody", "anybody-latin-standard-normal.woff2", "anybody");
  await font("schibsted-grotesk", "schibsted-grotesk-latin-wght-normal.woff2", "schibsted");
}
