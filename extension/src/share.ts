import QRCode from "qrcode";
import { dayKey, encodePacket, type DevicePacket } from "@mirror/shared";
import { $, el } from "./dom.ts";
import { clock, current, load } from "./store.ts";
import { newDay, toPacket } from "./tracker.ts";

const SVG = "http://www.w3.org/2000/svg";
function drawQr(text: string): SVGSVGElement {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size, quiet = 4;
  let path = "";
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (modules.get(y, x)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${n + quiet * 2} ${n + quiet * 2}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "QR code for the Mirror phone app");
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", path);
  svg.append(p);
  return svg;
}

// A snapshot: the code must not change while a phone is reading it.
const s = await load(), t = current(s), today = dayKey(clock(s));
const dates = [...new Set([today, ...Object.keys(t.days).sort().reverse()])].slice(0, 14);
const pick = $<HTMLSelectElement>("date");
for (const d of dates) pick.append(new Option(d === today ? `Today (${d})` : d, d));
let packet: DevicePacket;
function show(): void {
  packet = toPacket(pick.value, t.days[pick.value] ?? newDay(), !!s.demo, Date.now());
  $("qr").replaceChildren(drawQr(encodePacket(packet)));
  $("banner").hidden = !packet.demo;
  const rows: [string, string][] = [["Screen time", `${packet.screenMin} min`], ["Doom-scrolling", `${packet.doomMin} min`], ["Late night", `${packet.lateNightMin} min`], ["Tab switches", String(packet.switches)]];
  $("summary").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", k), el("dd", v)]));
  $("raw").textContent = JSON.stringify(packet, null, 2);
}
pick.onchange = show;
show();
$("file").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(packet, null, 2)], { type: "application/json" }));
  a.download = `mirror-${packet.demo ? "demo-" : ""}${packet.date}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
