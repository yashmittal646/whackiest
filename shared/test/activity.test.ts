import test from "node:test";
import assert from "node:assert/strict";
import { activity, wasteSwitch } from "@mirror/shared";

const k = (url: string, title = "", cat: string | null = null) => { const a = activity(url, title, cat); return `${a.kind}/${a.category}/${a.label}`; };

test("YouTube is judged by the video's own category, then its title", () => {
  assert.equal(k("https://www.youtube.com/watch?v=1", "x", "Education"), "study/neutral/Learning on YouTube (Education)");
  assert.equal(k("https://www.youtube.com/watch?v=1", "x", "Gaming"), "waste/video/YouTube: Gaming");
  assert.equal(k("https://www.youtube.com/watch?v=1", "x", "Music"), "other/neutral/Music on YouTube");
  assert.equal(k("https://www.youtube.com/watch?v=1", "x", "News & Politics"), "news/news/News on YouTube");
  assert.equal(k("https://www.youtube.com/watch?v=1", "Rotational Motion | Lecture 4 | JEE Physics"), "study/neutral/Learning on YouTube");
  assert.equal(k("https://www.youtube.com/watch?v=1", "Funniest fails of the week"), "waste/video/Watching YouTube");
  assert.equal(k("https://www.youtube.com/shorts/abc"), "waste/shortVideo/YouTube Shorts");
  assert.equal(k("https://www.youtube.com/"), "waste/video/Browsing YouTube");
  assert.equal(k("https://www.youtube.com/results?search_query=calculus"), "other/neutral/Searching YouTube");
});
test("PDFs, Drive and course sites are study", () => {
  assert.equal(k("file:///C:/notes/ch3.pdf"), "study/neutral/Reading a PDF");
  assert.equal(k("https://example.edu/files/syllabus.PDF"), "study/neutral/Reading a PDF");
  assert.equal(k("https://drive.google.com/file/d/1/view", "Notes.pdf - Google Drive"), "study/neutral/Reading a PDF");
  assert.equal(k("https://docs.google.com/document/d/1"), "study/neutral/Studying: Google Docs");
  assert.equal(k("https://www.coursera.org/learn/ml"), "study/neutral/Studying: Coursera");
});
test("feeds and streaming are time-wasters; ordinary sites are not", () => {
  assert.equal(k("https://www.instagram.com/"), "waste/social/Instagram");
  assert.equal(k("https://www.netflix.com/browse"), "waste/video/Netflix");
  assert.equal(k("https://example.com/"), "other/neutral/");
  assert.equal(k("chrome://newtab/"), "other/neutral/");
});
test("alerts fire on arriving at a time-waster, not while staying", () => {
  const study = activity("https://docs.google.com/document/d/1"), insta = activity("https://www.instagram.com/");
  assert.equal(wasteSwitch(study, insta), true);
  assert.equal(wasteSwitch(insta, activity("https://www.instagram.com/p/2")), false);
  // The next video loading: the label changes once YouTube's category arrives, but you never left.
  assert.equal(wasteSwitch(activity("https://www.youtube.com/watch?v=1", "x"), activity("https://www.youtube.com/watch?v=2", "x", "Gaming")), false);
  assert.equal(wasteSwitch(activity("https://www.youtube.com/watch?v=1", "x", "Music"), activity("https://www.youtube.com/watch?v=2", "x", "Gaming")), true);
  assert.equal(wasteSwitch(insta, study), false);
});
