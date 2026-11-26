import { classifyUrl, type Category } from "./score.ts";
import PHONE_APPS from "../phone-apps.json" with { type: "json" };

/**
 * What the person is doing in the active tab, worked out on this laptop from the address, the tab title
 * and, on YouTube, the video's own category. Nothing here is stored: only `kind` and `label` leave this function,
 * and the label names a kind of activity, never a page or video title.
 */
export interface Activity { category: Category; kind: "study" | "waste" | "news" | "other"; label: string }

// YouTube's categories. Learning ones are not doom-scrolling, however late.
const LEARN = new Set(["Education", "Science & Technology", "Howto & Style", "Nonprofits & Activism"]);
// Shared with the phone, so a lecture is a lecture on both devices.
export const STUDY_WORDS = new RegExp(PHONE_APPS.studyWords, "i");

const STUDY_SITES: [string, string][] = [
  ["docs.google.com", "Google Docs"], ["drive.google.com", "Google Drive"], ["classroom.google.com", "Google Classroom"], ["scholar.google.com", "Google Scholar"],
  ["notion.so", "Notion"], ["overleaf.com", "Overleaf"], ["coursera.org", "Coursera"], ["edx.org", "edX"], ["khanacademy.org", "Khan Academy"],
  ["udemy.com", "Udemy"], ["nptel.ac.in", "NPTEL"], ["swayam.gov.in", "SWAYAM"], ["leetcode.com", "LeetCode"], ["geeksforgeeks.org", "GeeksforGeeks"],
  ["github.com", "GitHub"], ["stackoverflow.com", "Stack Overflow"], ["wikipedia.org", "Wikipedia"], ["arxiv.org", "arXiv"], ["w3schools.com", "W3Schools"],
  ["developer.mozilla.org", "MDN"], ["canva.com", "Canva"], ["office.com", "Office"], ["sharepoint.com", "Office"], ["onedrive.live.com", "OneDrive"],
];
const NAMES: [string, string][] = [
  ["instagram.com", "Instagram"], ["tiktok.com", "TikTok"], ["x.com", "X"], ["twitter.com", "X"], ["reddit.com", "Reddit"], ["facebook.com", "Facebook"],
  ["threads.net", "Threads"], ["threads.com", "Threads"], ["bsky.app", "Bluesky"], ["pinterest.com", "Pinterest"], ["tumblr.com", "Tumblr"], ["9gag.com", "9GAG"],
  ["netflix.com", "Netflix"], ["primevideo.com", "Prime Video"], ["hotstar.com", "Hotstar"], ["twitch.tv", "Twitch"],
];
const STREAMING = new Set(["Netflix", "Prime Video", "Hotstar", "Twitch"]);

function host(raw: string | undefined): URL | null {
  try { const u = new URL(raw ?? ""); return u; } catch { return null; }
}
const on = (u: URL, d: string) => u.hostname === d || u.hostname.endsWith("." + d);
const kindOf = (c: Category): Activity["kind"] => (c === "news" ? "news" : c === "neutral" ? "other" : "waste");

/** `videoCategory` is YouTube's own category for the open video, when it could be read. */
export function activity(url: string | undefined, title = "", videoCategory: string | null = null): Activity {
  const u = host(url);
  if (!u) return { category: "neutral", kind: "other", label: "" };
  const path = u.pathname.toLowerCase();
  // Chrome's PDF viewer keeps the file's address; local files count too.
  if (path.endsWith(".pdf") || /\.pdf\b/i.test(title)) return { category: "neutral", kind: "study", label: "Reading a PDF" };
  if (on(u, "youtube.com") || on(u, "youtu.be")) {
    if (/^\/shorts(\/|$)/.test(u.pathname)) return { category: "shortVideo", kind: "waste", label: "YouTube Shorts" };
    if (u.pathname === "/watch" || on(u, "youtu.be")) {
      if (videoCategory && LEARN.has(videoCategory)) return { category: "neutral", kind: "study", label: `Learning on YouTube (${videoCategory})` };
      // Music is usually listened to while doing something else, so it is not time-wasting.
      if (videoCategory === "Music") return { category: "neutral", kind: "other", label: "Music on YouTube" };
      if (videoCategory === "News & Politics") return { category: "news", kind: "news", label: "News on YouTube" };
      if (!videoCategory && STUDY_WORDS.test(title)) return { category: "neutral", kind: "study", label: "Learning on YouTube" };
      return { category: "video", kind: "waste", label: videoCategory ? `YouTube: ${videoCategory}` : "Watching YouTube" };
    }
    if (u.pathname.startsWith("/results")) return { category: "neutral", kind: "other", label: "Searching YouTube" };
    return { category: "video", kind: "waste", label: "Browsing YouTube" };
  }
  for (const [d, name] of STUDY_SITES) if (on(u, d)) return { category: "neutral", kind: "study", label: `Studying: ${name}` };
  const category = classifyUrl(url), name = NAMES.find(([d]) => on(u, d))?.[1];
  if (name && STREAMING.has(name)) return { category: "video", kind: "waste", label: name };
  if (category === "neutral") return { category, kind: "other", label: "" };
  return { category, kind: kindOf(category), label: name ?? (category === "news" ? "News" : "A feed") };
}

/**
 * True when it is worth a quick word: arriving at a time-waster from something else. Moving between
 * time-wasters (the next video, the next post) is staying, not arriving.
 */
export const wasteSwitch = (from: Activity | null, to: Activity): boolean => to.kind === "waste" && from?.kind !== "waste";
