# Mirror

Mirror tracks doom-scrolling across a laptop and a phone, and shows how it lines up with your sleep.

It has three parts:

- a **Chrome extension** that scores what you're doing in the browser, watches your posture and eyes through the webcam if you allow it, and nudges you;
- an **Android app** that does the same for phone apps, reads your sleep from Health Connect, and puts a nudge card over the app you're in;
- a **report website** that combines both devices into one report.

Most of the work happens on your own devices. If you make an account, each day's totals are encrypted on the device before they're synced, so the server only stores data it can't read.

## Why we built it

Screen-time tools count minutes on one device. That misses the pattern we kept seeing in ourselves: studying on the laptop, drifting to YouTube, closing the laptop at midnight and then picking up the phone in bed. Mirror follows that hand-off between screens and puts it next to how long you actually slept.

## What it does

### In the browser

- Gives each minute a **doom score from 0 to 100**, based on what kind of page you're on, how often you switch tabs, how long you've been on feeds, the time of night, and posture.
- Tells **studying** from **time-wasting**. PDFs, Google Docs and Drive, course sites, GitHub, Stack Overflow and Wikipedia count as studying. Feeds, Shorts and streaming count as time-wasting. YouTube is sorted by the video's own category: Education, Science & Technology and How-to count as learning, Music counts as listening, and Gaming or Entertainment count as time-wasting.
- If you switch to a time-wasting site and stay **25 seconds**, it covers the page with a card. The card pauses the video and gives three choices: go back to what you were studying, close the tab, or say you're there on purpose (which quiets it for that site).
- Other nudges: after a long scroll, when you're slouching (two checks in a row), when you blink much less or much more than usual, when you look drowsy, and after 90 minutes at the desk.
- **Posture** (optional): you show it your good posture once, then it checks for 6 seconds every 5 minutes. It notices your head dropping, leaning into the screen, your head bending down, hunched shoulders and tilt. There's a live view so you can see what it tracks, and a strictness setting.
- **Eyes and face** (optional): every 20 minutes, 20 seconds of blink rate, drowsiness (eyes closing, yawning), whether you're facing the screen, and restlessness. Facial expression (smiling, frowning, neutral) is a separate opt-in, and it's reported as an expression, not a feeling.
- A demo mode with a fast clock and separate, clearly labelled data.

### On the phone

- Reads which app is open (through Android's usage access) and turns it into daily totals. App names aren't stored.
- Shows today's doom minutes, screen time, minutes after 23:00, and a bar of time spent studying against time on time-wasters. A Mirror day runs from 04:00 to 04:00, so 1 AM still counts towards the day before.
- Checks every few seconds while the screen is on. If you open Instagram, Reddit, Snapchat or similar and stay 25 seconds, it draws a card over the app with **Back to Google Drive** (or whichever study app you were in), **Close this app** and **I'm here on purpose**.
- YouTube is judged by the title of the video that's playing. This is optional and needs notification access; without it YouTube never triggers a nudge.
- Sleep comes from Health Connect, or you can type it in.
- A 10-second posture check and a 20-second eyes-and-face check, both with a live camera view.

### On the website

- An interactive landing page, including a doom-score demo that uses the real formula and a demo of what the server actually receives when a day is encrypted.
- The report: insight cards, your nights, the **hand-off chart** (laptop and phone doom-scrolling by hour, so you can see the switch around midnight), and desk data (slouching, time at the desk, breaks, blinks).
- Export everything, import a file, or delete your account and all cloud data.

## How the insights work

The report fits a simple linear regression for a handful of questions, such as whether late-night use across both devices goes with less sleep, or whether doom-scrolling goes with slouching. It only shows a result after at least 10 nights with laptop, phone and sleep data, corrects for testing several questions at once (Benjamini–Hochberg), and words it as an association with the number of nights, never as a cause. We checked the numbers against an independent calculation in SciPy and they match.

## Privacy

- **No pictures or video are stored or sent.** Camera frames go straight into the pose or face model in memory, become a few numbers, and are dropped. There's no code that saves images, and the build fails if any appears.
- The extension can only talk to our sync server. All network code lives in one file (`shared/src/cloud.ts`); the build fails if it shows up anywhere else.
- The pose and face models ship inside the extension and the app. Nothing is downloaded at runtime, and we removed MediaPipe's usage logging from the Android build.
- Synced records are encrypted on the device with AES-256-GCM. The key is protected by your recovery words (PBKDF2, 600,000 rounds). Every day is padded to the same size, and record IDs are scrambled, so the server can't see dates, minutes or app names.
- The server does see your email, your IP address, when you sync, and how many records you have.
- In Supabase, row-level security means each account can only touch its own rows. A script in `dev/` tests this against the live project with two throwaway accounts.

**Not ready for real users yet:** recovery phrases are only two words, which is fine for a demo but too easy to guess with a copy of the database. Raise it to six before anyone relies on it.

## Tech

| Part | Built with |
| --- | --- |
| Shared engine | TypeScript: scoring, activity sorting, posture, blinks, face, sleep, insights, encryption |
| Extension | Chrome Manifest V3, service worker, offscreen document for the camera, esbuild |
| Website | Plain TypeScript and hand-written SVG and canvas, esbuild |
| Android app | Expo 58 / React Native, plus a Kotlin module for usage stats, the overlay card, CameraX, Health Connect and media titles |
| Vision | MediaPipe Pose Landmarker and Face Landmarker, run on the device |
| Sync | Supabase (Postgres with row-level security, and Auth) |
| Tests | `node --test`, JUnit, Puppeteer with a fake camera |

## Layout

```
shared/      the engine all three parts use (score, activity, posture, blink, face,
             sleep, insights, vault, cloud), plus the scoring spec and app lists
extension/   Chrome extension
web/         landing page and report website
app/         Android app (Expo) and its Kotlin module in app/modules/mirror-native
ui/          the Mirror eye, shared by the website and extension
models/      bundled MediaPipe models
supabase/    database tables and access rules
dev/         config and privacy checks, a mock server, live database tests
```

## Running it

You need Node 22.18 or newer. For the Android app you also need Java 17 and the Android SDK.

```bash
git clone https://github.com/yashmittal646/whackiest.git
cd whackiest
npm install
npm run check        # typecheck, tests, builds
```

- **Extension:** after `npm run build`, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and select `extension/dist`.
- **Website:** `npm run dev -w web`, then open http://127.0.0.1:5180.
- **Android:**
  ```bash
  cd app
  npm run prepare_android
  cd android
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
  adb install -r app/build/outputs/apk/release/app-release.apk
  ```

Sync needs a Supabase project: run `supabase/schema.sql` in its SQL editor and put the project URL and publishable key in `mirror.config.json`. Everything else works without it.

## What's missing

- The website isn't hosted yet.
- A phone joins by typing the recovery words; QR pairing isn't built.
- No personalised wind-down reminder yet.
- Face and blink results stay on the laptop and aren't in the report.
- Phone camera checks only run when you tap; Android doesn't allow background camera use.
- After the phone restarts, open Mirror once to turn nudges back on.
- The posture, blink and drowsiness limits are sensible starting points, not clinically tuned.
- Android only for now; no iOS app or non-Chrome extension.
