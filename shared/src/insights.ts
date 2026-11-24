/** One night: predictors are null when not measured. */
export interface NightRow { date: string; sleepMin: number | null; laptopLateMin: number | null; phoneLateMin: number | null; doomMin: number | null }

export interface Fit { n: number; r: number; slope: number; p: number }
export interface Insight extends Fit { id: string; text: string; pAdjusted: number; demo: boolean }

export const MIN_NIGHTS = 10;
const ALPHA = 0.1, MIN_R = 0.3, STEP_MIN = 30;

function logGamma(z: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  const t = z + 5.5;
  let s = 1.000000000190015;
  c.forEach((v, j) => { s += v / (z + 1 + j); });
  return -(t - (z + 0.5) * Math.log(t)) + Math.log((2.5066282746310005 * s) / z);
}

function betacf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const fix = (v: number) => (Math.abs(v) < tiny ? tiny : v);
  let c = 1, d = 1 / fix(1 - ((a + b) * x) / (a + 1)), h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2));
    d = 1 / fix(1 + aa * d); c = fix(1 + aa / c); h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2));
    d = 1 / fix(1 + aa * d); c = fix(1 + aa / c);
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

function incBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const f = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (f * betacf(a, b, x)) / a : 1 - (f * betacf(b, a, 1 - x)) / b;
}

/** Simple linear regression with a two-sided p-value. null if it cannot be computed. */
export function fit(xs: number[], ys: number[]): Fit | null {
  const n = xs.length;
  if (n !== ys.length || n < 3) return null;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / n;
  const mx = mean(xs), my = mean(ys);
  let sxx = 0, syy = 0, sxy = 0;
  xs.forEach((x, i) => { const dx = x - mx, dy = ys[i]! - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
  if (sxx === 0 || syy === 0) return null;
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  // P(|T| > t) = I_{df/(df+t^2)}(df/2, 1/2), and df/(df+t^2) = 1-r^2.
  return { n, r, slope: sxy / sxx, p: incBeta(df / 2, 0.5, 1 - r * r) };
}

/** Benjamini-Hochberg adjusted p-values. */
export function adjust(ps: number[]): number[] {
  const order = ps.map((_, i) => i).sort((a, b) => ps[b]! - ps[a]!);
  const out: number[] = new Array(ps.length);
  let min = 1;
  order.forEach((i, k) => { min = Math.min(min, (ps[i]! * ps.length) / (ps.length - k)); out[i] = min; });
  return out;
}

const HYPOTHESES: { id: string; label: string; x: (r: NightRow) => number | null }[] = [
  { id: "late-total", label: "late-night use across both devices", x: (r) => (r.laptopLateMin === null || r.phoneLateMin === null ? null : r.laptopLateMin + r.phoneLateMin) },
  { id: "late-laptop", label: "late-night laptop use", x: (r) => r.laptopLateMin },
  { id: "late-phone", label: "late-night phone use", x: (r) => r.phoneLateMin },
  { id: "doom", label: "doom-scrolling", x: (r) => r.doomMin },
];

/** Associations only. Correction counts every hypothesis tested, not just those shown. */
export function findInsights(rows: NightRow[], demo: boolean): Insight[] {
  const tested = HYPOTHESES.flatMap((h) => {
    const xs: number[] = [], ys: number[] = [];
    for (const row of rows) { const x = h.x(row); if (x !== null && row.sleepMin !== null) { xs.push(x); ys.push(row.sleepMin); } }
    const f = xs.length >= MIN_NIGHTS ? fit(xs, ys) : null;
    return f ? [{ h, f }] : [];
  });
  const adj = adjust(tested.map((t) => t.f.p));
  return tested.flatMap(({ h, f }, i): Insight[] => {
    const pAdjusted = adj[i]!;
    const effect = Math.round(Math.abs(f.slope * STEP_MIN));
    if (pAdjusted >= ALPHA || Math.abs(f.r) <= MIN_R || effect < 1) return [];
    const text = `Each extra ${STEP_MIN} min of ${h.label} was associated with about ${effect} min ${f.slope < 0 ? "less" : "more"} sleep (${f.n} nights).`;
    return [{ ...f, id: h.id, text, pAdjusted, demo }];
  }).sort((a, b) => a.pAdjusted - b.pAdjusted);
}
