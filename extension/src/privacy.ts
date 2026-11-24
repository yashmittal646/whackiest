import { $, onState } from "./dom.ts";
import { load, send } from "./store.ts";
import { loadAccount, type Account } from "./sync.ts";

const redact = (a: Account | null) => a && { ...a, key: "(hidden)", session: { ...a.session, access: "(hidden)", refresh: "(hidden)" } };
onState(async () => { $("data").textContent = JSON.stringify({ state: await load(), account: redact(await loadAccount()) }, null, 2); });
const m = chrome.runtime.getManifest();
$("manifest").textContent = JSON.stringify({ permissions: m.permissions, host_permissions: m.host_permissions, content_security_policy: m.content_security_policy }, null, 2);
$("wipe").onclick = async () => {
  if (!confirm("Delete everything Mirror has stored in this browser?")) return;
  await send({ cmd: "wipe" });
  $("done").textContent = "Everything on this laptop has been deleted. Cloud data is deleted from the report website.";
};
