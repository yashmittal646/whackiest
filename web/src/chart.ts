const NS = "http://www.w3.org/2000/svg";
function svg(tag: string, attrs: Record<string, string | number>, text?: string): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}
/** Waking day first, so the night reads left to right across midnight. */
export const HOURS = Array.from({ length: 24 }, (_, i) => (i + 4) % 24);
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
export const minutes = (v: number | null) => (v === null ? "no record" : `${Math.round(v)} min`);

/** Bar with a rounded top, square at the base. */
function bar(x: number, y: number, w: number, h: number, round: boolean): string {
  const r = round ? Math.min(4, h, w / 2) : 0;
  return `M${x} ${y + h}V${y + r}q0 ${-r} ${r} ${-r}H${x + w - r}q${r} 0 ${r} ${r}V${y + h}Z`;
}

export function drawHandoff(box: HTMLElement, tip: HTMLElement, laptop: number[] | null, phone: number[] | null): void {
  const W = 900, H = 290, L = 46, B = 34, T = 24, slot = (W - L - 8) / 24, w = 22, plot = H - B - T;
  const top = Math.max(10, ...HOURS.map((h) => (laptop?.[h] ?? 0) + (phone?.[h] ?? 0)));
  const step = [5, 10, 15, 20, 30, 60].find((s) => top / s <= 4) ?? 60;
  const max = Math.ceil(top / step) * step, y = (v: number) => T + plot - (v / max) * plot;
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "group", "aria-label": "Doom-scrolling minutes per hour, laptop and phone stacked" });
  for (let v = 0; v <= max; v += step) {
    root.append(svg("line", { class: "grid", x1: L, x2: W - 8, y1: y(v), y2: y(v) }), svg("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end" }, String(v)));
  }
  root.append(svg("text", { x: 0, y: 12 }, "minutes"));
  // Midnight divider between 23:00 and 00:00.
  const mid = L + HOURS.indexOf(0) * slot;
  root.append(svg("line", { class: "grid", x1: mid, x2: mid, y1: T - 8, y2: T + plot }), svg("text", { x: mid - 6, y: 14, "text-anchor": "end" }, "midnight"));
  HOURS.forEach((h, i) => {
    const a = laptop?.[h] ?? 0, b = phone?.[h] ?? 0, x = L + i * slot + (slot - w) / 2;
    const g = svg("g", { class: "col", tabindex: 0, role: "img", "aria-label": `${hourLabel(h)}: laptop ${minutes(laptop ? a : null)}, phone ${minutes(phone ? b : null)}` });
    g.style.setProperty("--i", String(i));
    g.style.setProperty("--base", `${T + plot}px`);
    g.append(svg("rect", { class: "hit", x: L + i * slot, y: T, width: slot, height: plot }));
    const ha = (a / max) * plot, hb = (b / max) * plot;
    if (ha > 0.5) g.append(svg("path", { class: "laptop", d: bar(x, y(a), w, ha, hb <= 2.5) }));
    if (hb > 0.5) { const gap = ha > 0.5 ? 2 : 0; if (hb > gap) g.append(svg("path", { class: "phone", d: bar(x, y(a + b), w, hb - gap, true) })); }
    if (i % 2 === 0) g.append(svg("text", { x: x + w / 2, y: H - 12, "text-anchor": "middle" }, hourLabel(h)));
    const show = () => {
      const line = (cls: string, name: string, v: number | null) => {
        const p = document.createElement("p"), k = document.createElement("i"), s = document.createElement("b");
        k.className = cls; s.textContent = minutes(v);
        p.append(k, s, ` ${name}`);
        return p;
      };
      const title = document.createElement("p");
      title.textContent = hourLabel(h);
      tip.replaceChildren(title, line("laptop", "laptop", laptop ? a : null), line("phone", "phone", phone ? b : null));
      tip.hidden = false;
      const r = g.getBoundingClientRect(), host = tip.parentElement!.getBoundingClientRect();
      tip.style.left = `${Math.max(4, Math.min(r.left - host.left + r.width / 2 - tip.offsetWidth / 2, host.width - tip.offsetWidth - 4))}px`;
      tip.style.top = `${r.top - host.top}px`;
    };
    const hide = () => { tip.hidden = true; };
    g.addEventListener("pointerenter", show);
    g.addEventListener("focus", show);
    g.addEventListener("pointerleave", hide);
    g.addEventListener("blur", hide);
    root.append(g);
  });
  tip.hidden = true;
  box.replaceChildren(root);
}
