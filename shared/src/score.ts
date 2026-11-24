import spec from "../scoring-spec.json" with { type: "json" };
export { spec };

export type Category = "shortVideo" | "social" | "news" | "neutral";

export interface ScoreInput {
  category: Category;
  /** Average tab/app switches per minute over the recent window. */
  switchesPerMin: number;
  /** Recent feed minutes, decaying when the user leaves feeds. */
  feedMin: number;
  /** Local hour, 0-23. */
  hour: number;
  /** null = no posture reading available. */
  slouching: boolean | null;
}

export interface ScoreParts { content: number; switching: number; duration: number; lateNight: number; slouch: number }

const ramp = (x: number, full: number) => Math.min(1, Math.max(0, x / full));

export function isLateNight(hour: number): boolean {
  return hour >= spec.lateNight.startHour || hour < spec.lateNight.endHour;
}

export function scoreParts(i: ScoreInput): ScoreParts {
  const onFeed = i.category !== "neutral";
  return {
    content: spec.content[i.category],
    switching: spec.switching.max * ramp(i.switchesPerMin, spec.switching.fullAtPerMin),
    // Late work or a long document is not doom-scrolling.
    duration: onFeed ? spec.duration.max * ramp(i.feedMin, spec.duration.fullAtMin) : 0,
    lateNight: onFeed && isLateNight(i.hour) ? spec.lateNight.points : 0,
    slouch: i.slouching === true ? spec.slouch.points : 0,
  };
}

export function doomScore(i: ScoreInput): number {
  const p = scoreParts(i);
  return Math.min(100, Math.round(p.content + p.switching + p.duration + p.lateNight + p.slouch));
}

const SITES: Record<Exclude<Category, "neutral">, string[]> = {
  shortVideo: ["tiktok.com"],
  social: ["twitter.com", "x.com", "instagram.com", "facebook.com", "reddit.com", "threads.net", "threads.com", "bsky.app", "tumblr.com", "pinterest.com", "9gag.com"],
  news: ["news.google.com", "cnn.com", "bbc.com", "ndtv.com", "timesofindia.indiatimes.com", "dailymail.co.uk"],
};

/** Laptop only: the path is readable here, so Shorts and Reels can be told apart. */
export function classifyUrl(raw: string | undefined): Category {
  let u: URL;
  try { u = new URL(raw ?? ""); } catch { return "neutral"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "neutral";
  const is = (d: string) => u.hostname === d || u.hostname.endsWith("." + d);
  if (is("youtube.com")) return /^\/shorts(\/|$)/.test(u.pathname) ? "shortVideo" : "neutral";
  if (is("instagram.com") && /^\/reels?(\/|$)/.test(u.pathname)) return "shortVideo";
  for (const c of ["shortVideo", "social", "news"] as const) if (SITES[c].some(is)) return c;
  return "neutral";
}
