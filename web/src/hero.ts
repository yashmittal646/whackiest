import { eye, watch } from "../../ui/eye.ts";

/** Each line fills the width. The line nearest the pointer swells, like a bend in a funhouse mirror. */
export function startHero(still: boolean): void {
  const box = document.getElementById("bend")!, rows = [...box.querySelectorAll<HTMLElement>(".bend-row")];
  const eyes = [...box.querySelectorAll<HTMLElement>(".o")].map((slot) => { const e = eye({ lid: "#ff4a26", iris: "#2536e8" }); slot.append(e); return e; });
  watch(eyes);
  const inner = rows.map((r) => r.firstElementChild as HTMLElement);
  let sizes: { w: number; h: number }[] = [], at = 0.5, goal = 0.36, side = 0, sideGoal = 0, raf = 0, entered = still ? 1 : 0, idle = true;
  const measure = () => { sizes = inner.map((e) => ({ w: e.offsetWidth, h: e.offsetHeight })); queue(); };
  const draw = (ms: number) => {
    raf = 0;
    const moving = !still && box.getBoundingClientRect().bottom > 0;
    if (idle && moving) goal = 0.5 + Math.sin(ms / 1500) * 0.42;
    at += (goal - at) * 0.09;
    side += (sideGoal - side) * 0.09;
    entered += (1 - entered) * 0.06;
    const W = box.clientWidth, H = box.clientHeight, n = rows.length;
    const weight = rows.map((_, i) => 0.5 + 1.5 * Math.exp(-(((i + 0.5) / n - at) ** 2) * 11) * entered);
    const total = weight.reduce((a, b) => a + b, 0);
    let y = 0;
    rows.forEach((r, i) => {
      const h = (weight[i]! / total) * H, s = sizes[i]!;
      r.style.transform = `translate(0px, ${y + (1 - entered) * H * 0.3 * (i + 1)}px)`;
      r.style.height = `${h}px`;
      // Capital letters fill about 70% of the line box.
      inner[i]!.style.transform = `scale(${W / s.w}, ${(h * 0.93) / (s.h * 0.72)}) skewX(${side * -5 * (i % 2 ? -1 : 1)}deg)`;
      inner[i]!.style.top = `${h * 0.035 - s.h * 0.14 * ((h * 0.93) / (s.h * 0.72))}px`;
      y += h;
    });
    if (moving && (idle || Math.abs(goal - at) > 0.001 || Math.abs(sideGoal - side) > 0.001 || entered < 0.999)) queue();
  };
  const queue = () => { if (!raf && sizes.length) raf = requestAnimationFrame(draw); };
  box.addEventListener("pointermove", (e) => {
    const b = box.getBoundingClientRect();
    idle = false;
    goal = (e.clientY - b.top) / b.height;
    sideGoal = still ? 0 : ((e.clientX - b.left) / b.width - 0.5) * 2;
    if (!still) queue();
  }, { passive: true });
  box.addEventListener("pointerleave", () => { idle = true; sideGoal = 0; queue(); });
  new IntersectionObserver(queue).observe(box);
  addEventListener("scroll", queue, { passive: true });
  new ResizeObserver(measure).observe(box);
  void document.fonts.load("900 100px Anybody").then(measure);
  measure();
}
