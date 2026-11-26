# Mirror: project context

Privacy-first cross-device attention tracker: Chrome MV3 extension (sensor) + Android app (brain).
Data syncs through an optional account (decided 2026-11-24, replacing "no cloud, no account"). The full original spec is `README.md`
(the user adds it). Where they conflict, the corrections below are the assistant's proposals;
the user was fine with them in general ("otherwise fine"), so flag any that visibly change the pitch.

## Dates and team
- 2026-11-24: planning. Folder was empty, no code written.
- About 2026-11-26: mini selection round; needs something presentable.
- About 2026-12-01: hackathon. Coding beforehand is allowed.
- 4 members, ~95% of work done on this laptop. Little React Native/Kotlin experience.
- Test phones: Galaxy A56 plus other Androids.
- Theme, judging criteria and demo length: not yet known.

## Scope
User wants to try to implement EVERYTHING in the spec, not cut features.
Build order is therefore priority order:
1. Shared scoring + tests, extension score/nudge, QR export, phone scan, insight card,
   hand-off chart, privacy/export/wipe screen, labelled seeded data
2. Live phone usage tracking, laptop posture, combined nudge
3. Blink rate, phone posture session, Health Connect sleep

Selection round target (proposed): the extension live score, nudge and QR, plus an app or
phone-viewable demo that scans it and shows the insight card and hand-off chart.

## Proposed corrections to the spec
- Combined and eye-break nudges are laptop-only (phone camera is session-only).
- Accumulate daily QR imports; one day's packet cannot produce a correlation.
- Insights say "associated with", show number of nights, correct for multiple tests.
- The Android app now needs INTERNET for sync; allow only the sync server.
- Extension: no content script; `tabs` permission + strict CSP (+ 'wasm-unsafe-eval' for MediaPipe).
- 2026-11-26, user's request: the extension may read YouTube's video category from the page
  (host permission for youtube.com only, chrome.scripting) and tab titles, to tell study from waste.
  Classified in memory, never stored. No frame analysis of videos.
- 2026-11-26, user's request: nudges show as a card drawn over the page (chrome.scripting) on a fixed
  list of time-waste sites (host permissions for those only); notification elsewhere. Card reads nothing.
- 2026-11-26, user chose "states + expressions": face check reports drowsiness, focus, restlessness,
  closeness; expression (smiling/frowning/neutral) only with a separate opt-in, labelled as an
  expression, never as a mood. Face results stay on the laptop (not in packets).
- Phone usage: UsageStats + foreground service instead of AccessibilityService.
- Package names cannot identify YouTube Shorts; do not claim it.
- Blink bursts at ~30 fps, not 12. Use expo-camera, not expo-barcode-scanner.

## Sync decisions (2026-11-24)
- Supabase + a report website (`web/`). Records are end-to-end encrypted in `shared/src/vault.ts`.
- Network code only in `shared/src/cloud.ts`; `dev/config.mjs` fails the build otherwise.
- Recovery phrase is 2 words at the user's request "as of now". Too weak for real users: raise
  `PHRASE_WORDS` to 6 first, and do not claim "even we can't read it" until then.
- Phone joins by QR pairing from the laptop (key transfer), words as recovery. Not built yet.
- QR/file packet transfer stays as a hidden backup. Android app is to be started now.
- Laptop stores daily totals only; sites are never stored. Days run 04:00 to 04:00.
- Commands: `npm run check`; `npm run dev -w web`. npm workspaces, not pnpm.

## Environment (checked 2026-11-24)
- Windows 11, Node 24.11.1, git, Python 3.13, Chrome. Missing: pnpm, Java, Android SDK.
- C: had 10 GB free, D: 232 GB (2026-11-24). Put Android SDK and Gradle caches on D:.
- Keep the project outside OneDrive, on a path without spaces (Android native builds).
