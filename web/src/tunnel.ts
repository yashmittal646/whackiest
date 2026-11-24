// A laptop showing a phone showing a laptop: two mirrors facing each other, zoomed by scrolling.
const LEVELS: { time: string; text: string; bg: string; ink: string; phone: boolean }[] = [
  { time: "22:10", text: "One quick look.", bg: "#ffb0d0", ink: "#17101f", phone: false },
  { time: "22:48", text: "Just this thread.", bg: "#2536e8", ink: "#ffffff", phone: true },
  { time: "23:31", text: "Laptop shut. Phone out.", bg: "#ff4a26", ink: "#17101f", phone: false },
  { time: "00:17", text: "One more. Then sleep.", bg: "#ffd447", ink: "#17101f", phone: true },
  { time: "01:26", text: "Which screen was it?", bg: "#17101f", ink: "#ffb0d0", phone: false },
  { time: "02:04", text: "All of them.", bg: "#ffe1ec", ink: "#17101f", phone: true },
];
const STEP = 0.26;

export function startTunnel(still: boolean): void {
  const box = document.getElementById("tunnel")!, canvas = document.getElementById("tunnel-c") as HTMLCanvasElement, ctx = canvas.getContext("2d")!;
  let shown = 0, raf = 0;
  const draw = () => {
    raf = 0;
    const b = box.getBoundingClientRect(), goal = still ? 0 : Math.min(1, Math.max(0, -b.top / Math.max(1, b.height - innerHeight))) * (LEVELS.length - 1);
    shown += (goal - shown) * (still ? 1 : 0.14);
    const W = canvas.clientWidth, H = canvas.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const unit = Math.min(W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const first = Math.max(0, Math.floor(shown) - 1);
    ctx.fillStyle = LEVELS[first]!.bg;
    ctx.fillRect(0, 0, W, H);
    for (let i = first; i < LEVELS.length; i++) {
      const l = LEVELS[i]!, depth = i - shown, k = STEP ** depth;
      if (k < 0.004) break;
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(depth * 0.19);
      ctx.scale(k * unit, k * unit);
      // The screen. The level we stand in spills past the edges of the window.
      const w = l.phone ? 1.5 : 2.4, h = l.phone ? 2.4 : 1.6, r = 0.14;
      if (depth > -0.02) {
        ctx.fillStyle = i % 2 ? "#17101f" : "#ffffff";
        if (l.bg === "#17101f") ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.roundRect(-w / 2 - 0.09, -h / 2 - 0.09, w + 0.18, h + 0.18, r + 0.08); ctx.fill();
        if (!l.phone) { ctx.beginPath(); ctx.roundRect(-w / 2 - 0.34, h / 2 + 0.14, w + 0.68, 0.13, 0.06); ctx.fill(); }
      }
      ctx.fillStyle = l.bg;
      ctx.beginPath();
      if (i === 0) ctx.rect(-60, -60, 120, 120); else ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.fill();
      const near = Math.max(0, 1 - Math.abs(depth) * 1.5);
      ctx.globalAlpha = Math.max(0, Math.min(1, 1.6 - Math.abs(depth) * 1.6));
      ctx.fillStyle = l.ink; ctx.textAlign = "center";
      ctx.font = `900 0.25px Anybody`;
      ctx.save(); ctx.translate(0, -0.26); ctx.scale(0.55 + near * 0.75, 1); ctx.fillText(l.time, 0, 0); ctx.restore();
      ctx.font = `600 0.066px Schibsted`;
      ctx.fillText(l.text, 0, 0.4);
      ctx.restore();
    }
    if (Math.abs(goal - shown) > 0.0008) queue();
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(draw); };
  addEventListener("scroll", queue, { passive: true });
  new ResizeObserver(queue).observe(canvas);
  void document.fonts.load("900 20px Anybody").then(queue);
  void document.fonts.load("600 20px Schibsted").then(queue);
  queue();
}
