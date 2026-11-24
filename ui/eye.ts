// The Mirror eye, shared by the website and the extension.
// --lid 0 open to 1 shut, --wire 0 calm to 1 hypnotised, --px/--py where it looks (-1 to 1).
const NS = "http://www.w3.org/2000/svg";
let count = 0;

export interface EyeOptions { iris?: string; lid?: string; label?: string }

function spiral(): string {
  let d = "";
  for (let i = 0; i <= 150; i++) {
    const a = i * 0.2, r = (i / 150) * 29;
    d += `${i ? "L" : "M"}${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`;
  }
  return d;
}

export function eye(o: EyeOptions = {}): SVGSVGElement {
  const id = `eye${++count}`, root = document.createElementNS(NS, "svg");
  const el = (parent: Element, tag: string, a: Record<string, string>) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, v);
    parent.append(e);
    return e;
  };
  root.setAttribute("viewBox", "0 0 100 100");
  root.setAttribute("class", "eye");
  if (o.label) { root.setAttribute("role", "img"); root.setAttribute("aria-label", o.label); } else root.setAttribute("aria-hidden", "true");
  el(el(root, "clipPath", { id }), "circle", { cx: "50", cy: "50", r: "48" });
  const g = el(root, "g", { "clip-path": `url(#${id})` });
  el(g, "rect", { width: "100", height: "100", fill: "#fff" });
  const veins = el(g, "g", { class: "eye-veins", fill: "none", stroke: "#e8391a", "stroke-width": "1.6", "stroke-linecap": "round" });
  for (const d of ["M2 40q12 2 18 9", "M4 62q10-2 15-7l5 1", "M98 44q-12 0-18 7", "M95 66q-9-3-14-8l-5 2", "M30 4q2 9 8 14", "M68 97q-1-9-6-14"]) el(veins, "path", { d });
  const look = el(g, "g", { class: "eye-look" });
  el(look, "circle", { cx: "50", cy: "50", r: "29", fill: o.iris ?? "#2536e8" });
  const turn = el(el(look, "g", { class: "eye-hyp" }), "g", { class: "eye-turn" });
  el(turn, "circle", { cx: "50", cy: "50", r: "29", fill: "#ffd447" });
  el(turn, "path", { d: spiral(), fill: "none", stroke: "#17101f", "stroke-width": "3.4" });
  el(look, "circle", { class: "eye-pupil", cx: "50", cy: "50", r: "14", fill: "#17101f" });
  el(look, "circle", { class: "eye-shine", cx: "58", cy: "41", r: "5.5", fill: "#fff" });
  const lid = o.lid ?? "#ffb0d0";
  el(g, "rect", { class: "eye-up", x: "-5", y: "-100", width: "110", height: "100", fill: lid });
  el(g, "rect", { class: "eye-down", x: "-5", y: "100", width: "110", height: "100", fill: lid });
  el(g, "path", { class: "eye-lash", d: "M4 62Q50 82 96 62", fill: "none", stroke: "#17101f", "stroke-width": "5", "stroke-linecap": "round" });
  return root;
}

const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Makes eyes follow the pointer and blink now and then. */
export function watch(eyes: SVGSVGElement[]): void {
  const aim = (x: number, y: number) => {
    for (const e of eyes) {
      const b = e.getBoundingClientRect();
      if (b.bottom < -200 || b.top > innerHeight + 200) continue;
      const dx = x - (b.left + b.width / 2), dy = y - (b.top + b.height / 2), far = Math.hypot(dx, dy) || 1, pull = Math.min(1, far / (b.width * 0.9));
      e.style.setProperty("--px", String((dx / far) * pull));
      e.style.setProperty("--py", String((dy / far) * pull));
    }
  };
  addEventListener("pointermove", (e) => aim(e.clientX, e.clientY), { passive: true });
  if (still()) return;
  let touched = 0;
  addEventListener("pointermove", () => { touched = performance.now(); }, { passive: true });
  // With no pointer about, look around.
  setInterval(() => { if (!document.hidden && performance.now() - touched > 2600) aim(Math.random() * innerWidth, Math.random() * innerHeight); }, 1500);
  const blink = () => {
    if (!document.hidden) for (const e of eyes) { e.classList.add("blink"); setTimeout(() => e.classList.remove("blink"), 130); }
    setTimeout(blink, 2200 + Math.random() * 4200);
  };
  setTimeout(blink, 1800);
}
export const setEye = (e: SVGElement, lid: number, wire = 0): void => { e.style.setProperty("--lid", String(lid)); e.style.setProperty("--wire", String(wire)); };
