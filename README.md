<div align="center">

# 🪞 Mirror

### *Your attention doesn't stop at one screen. Neither does Mirror.*

**A privacy-first, cross-device attention and habit intelligence system.**
Android app + Chrome extension + report website · Encrypted on your devices before it syncs.

---

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#)
[![Platform: Android](https://img.shields.io/badge/Platform-Android-green.svg)](#)
[![Extension: Chrome MV3](https://img.shields.io/badge/Extension-Chrome%20MV3-yellow.svg)](#)
[![Privacy: Encrypted sync](https://img.shields.io/badge/Privacy-Encrypted%20sync-red.svg)](#)

</div>

---

## What is Mirror?

Most screen-time tools look at one device and show you a number. Mirror looks at **all your screens together** — your phone, your laptop — and connects the habit to the night you lose.

It watches how you scroll, how you sit, how often you blink, and when your attention shifts from your laptop to your phone after midnight. Then it tells you what it found in plain language: *"On nights you use both devices after 11 PM, you sleep about 18 minutes less."*

Scoring and nudges work without an account. If you sign in, daily totals are **encrypted on your device**, synced, and joined into one report. QR and file transfer remain as a backup. You can export or delete everything.

> **Prototype note:** recovery phrases are two words for now. That is too short to resist someone guessing offline with a copy of the database, so do not claim "even we can't read it" until it is lengthened.

---

## Features

### 📱 Android App — the Brain

#### Doom-Scroll Detection
- Monitors foreground app usage via Android AccessibilityService
- Computes a **live doom-scroll score (0–100)** every minute using:
  - Tab / app switch rate (rapid hopping = higher score)
  - Time of day (late-night amplifies score)
  - Content type (social feeds, short-video apps flagged)
  - Posture signal (slouching while scrolling = combined trigger)
- Configurable watched-app list (Twitter/X, Instagram, YouTube Shorts, Reddit, TikTok, etc.)

#### Smart Nudges
- **Doom nudge**: fires when score ≥ 60 for 15+ consecutive minutes
- **Combined trigger**: doom score ≥ 60 *and* slouching → "You've been hunched and scrolling. Quick reset?" (much stronger signal than either alone)
- **Wind-down nudge**: personalized time computed from your own sleep correlation — not a generic 10 PM reminder
- **Eye break nudge**: fires when blink rate drops or face gets closer to screen
- **Stand-up nudge**: fires after 90+ minutes of detected desk presence with no break
- All nudges have a 15-minute cooldown — no notification spam
- One-tap "I'm here on purpose" intent mode that pauses nudges for 20 minutes

#### Sleep Correlation Engine
- Reads nightly sleep data from **Health Connect** (falls back to screen-off intervals)
- Correlates doom-scroll minutes, late-night usage, and cross-device patterns with actual sleep
- Runs **on-device linear regression** nightly — no ML cloud API
- Surfaces insights only when statistically meaningful (p < 0.1, |r| > 0.3)

#### Cross-Device Insights
- After importing a desktop packet, the nightly engine runs combined hypotheses:
  - *Does total late-night screen time (phone + laptop) affect sleep?*
  - *Is laptop-heavy late-night use worse than phone-only?*
  - *Do doom minutes correlate with next-day energy?*
  - *Do you slouch more when you're doom-scrolling?*
  - *Does long sitting correlate with fewer steps?*
- Results shown as plain-language insight cards with effect sizes

#### Hand-off Chart
- Stacked hourly bar chart showing **laptop doom minutes (blue) + phone doom minutes (orange)** side by side for every hour of the day
- Visualises the moment your attention "hands off" from screen to screen around midnight
- This is the story of Mirror in one image

#### Posture Check (Session Mode)
- User-initiated 10-second camera session using CameraX + MediaPipe Pose
- Detects: head pitch (text-neck), face distance from screen, shoulder tilt
- Calibrated to **your own good posture** — not generic angles
- Results: slouch%, lean-in%, average head pitch
- History chart of posture scores over the week
- **Zero frames stored** — raw pixels exist only in memory, discarded frame-by-frame

#### Privacy Screen
- Full audit log of every data point collected
- **Camera transparency log**: timestamp · session duration · frames analyzed · frames stored (always 0)
- Proof: one of your own records shown as the server sees it, encrypted
- **Export**: generate a local JSON archive of all your data
- **Wipe**: single tap deletes every row from every table, clears all preferences

#### QR Packet Import (from Desktop)
- Scan the QR code shown by the Chrome extension
- Imports today's desktop session data (doom minutes, posture, presence, blink rate, hourly breakdown)
- Validates schema and bounds before storing — treats scanned data as untrusted input
- File import fallback: accepts `.json` shared via Nearby Share, AirDrop, or Bluetooth

---

### 🖥️ Chrome Extension — the Thin Desktop Sensor

> The extension has **no full dashboard**. It is a sensor. The brain is the phone.

#### Live Doom Score
- Content script tracks active tab, URL, and tab-switch frequency every minute
- Background service worker computes doom score using the same algorithm as the app (shared TypeScript package)
- Score updates in the extension popup in real time

#### Posture Monitoring (Laptop Camera)
- Runs in an **offscreen document** (required for `getUserMedia` in MV3)
- **6-second bursts at 2 fps every 5 minutes** using MediaPipe Pose Landmarker Lite
- Detects: shoulder tilt, head drop, forward lean
- Calibrated to your own baseline on first setup
- Presence detection: "someone at the desk" vs empty seat
- Break detection: 5+ consecutive absence samples = break counted
- All models bundled inside the extension — nothing loaded from a CDN

#### Blink Rate Monitoring
- Separate **20-second bursts at 12 fps every 20 minutes** using MediaPipe Face Landmarker
- Reads `eyeBlinkLeft` / `eyeBlinkRight` blendshape scores
- Average blink rate added to the daily packet
- Low blink rate → 20-20-20 eye break reminder

#### Smart Nudges (Desktop)
- Notification-based nudge when doom score ≥ 60
- Combined nudge when doom ≥ 60 *and* slouching detected
- Intent mode: "I'm here on purpose" button on the notification
- 15-minute cooldown between nudges

#### QR Packet Export
- Builds a `DevicePacket` summary of the day: doom minutes, late-night minutes, hourly breakdown, posture, presence, breaks, blink rate
- Renders it as a **QR code** the phone can scan (no network involved — data crosses by camera)
- File export fallback: downloads `mirror-YYYY-MM-DD.json` for manual transfer

#### Privacy Guarantees (Extension)
- `host_permissions: []` and a `connect-src` CSP that allows only the sync server
- Network code is allowed in one shared file (`cloud.ts`); the build fails if it appears elsewhere
- **CI grep** fails the build if `MediaRecorder`, `toDataURL`, `toBlob`, `captureStream`, or `Bitmap.compress` appear in camera module files
- Bystander discard: frames with more than one person detected are skipped
- Camera indicator (browser LED) shows the camera is on during bursts

---

### 🔗 Cross-Device Architecture

#### One Brain, Two Sensors
```
┌─────────────────────────────┐     QR code / file     ┌──────────────────────────────┐
│   Chrome Extension          │  ──────────────────▶   │   Android App (the brain)    │
│   (desktop sensor)          │                         │                              │
│                             │                         │  Room/SQLite database        │
│  • Live doom score          │   DevicePacket          │  Insight engine              │
│  • Posture bursts           │  ┌──────────────┐       │  Sleep correlation           │
│  • Blink rate               │  │ screenMin    │       │  Cross-device insights       │
│  • Presence & breaks        │  │ doomMin      │       │  Nudges & wind-down          │
│  • QR export                │  │ lateNightMin │       │  Privacy screen & wipe       │
│                             │  │ hourlyDoom[] │       │                              │
└─────────────────────────────┘  │ slouchMin    │       └──────────────────────────────┘
                                 │ blinkPerMin  │
                                 └──────────────┘
```

#### Optional Encrypted Sync
| What you might expect | What Mirror does instead |
|-----------------------|--------------------------|
| Readable data in the cloud | Records encrypted on the device before upload |
| Server-side analytics | Report computed in your browser or phone |
| CDN-hosted ML models | Models bundled inside the extension & app |
| Account required | Account only needed for sync |

The server still sees your email, IP address, sync times and number of records.

---

## Privacy Design

> **"Never stored" beats "deleted after analysis."**

| Sensor | What is collected | What is stored | What is never stored |
|--------|-------------------|----------------|---------------------|
| Accessibility (phone) | Foreground app package name | Per-minute rows with doom score | App content, text, keystrokes |
| Camera (laptop) | 6s video bursts | 3 derived numbers per burst (tilt, drop, lean) | Frames, landmarks, face embeddings |
| Camera (phone) | 10s user-initiated session | Slouch%, lean%, head pitch (session avg) | Frames, landmarks |
| Face (blink rate) | 20s video burst | 1 number (blink/min) | Frames, identity, emotions |
| Browser tabs (extension) | Category, switch count | Daily totals | Sites, URLs, page content |
| Health Connect | Sleep session durations | Daily sleep minutes | Heart rate, location, other health data |

**What Mirror explicitly refuses to do:**
- Emotion, mood, or affect inference from faces
- Age or demographic estimation
- Face recognition or identity matching
- Any network request except to the sync server
- Background camera use on Android (blocked by OS; Mirror uses session mode)

---

## Tech Stack

### Android App
| Layer | Technology |
|-------|-----------|
| Framework | React Native (Expo) |
| Native modules | Kotlin (AccessibilityService, CameraX, Health Connect) |
| Database | Expo SQLite (Room-compatible schema) |
| Camera ML | MediaPipe Tasks Vision (PoseLandmarker, bundled) |
| Charts | Victory Native / React Native Gifted Charts |
| QR Scanner | Expo Barcode Scanner (Google ML Kit, no camera permission needed for scanning) |

### Chrome Extension
| Layer | Technology |
|-------|-----------|
| Manifest | MV3 |
| Build | esbuild |
| Language | TypeScript |
| Camera ML | MediaPipe Tasks Vision WASM (bundled, no CDN) |
| QR Generation | `qrcode` npm package (bundled) |
| Storage | Chrome Storage API (IndexedDB via idb) |

### Shared (`shared/` workspace package)
| Module | Purpose |
|--------|---------|
| `score.ts` | `doomScore()` — identical algorithm in app and extension |
| `insights.ts` | Hypothesis engine, Pearson correlation, effect formatting |
| `packet.ts` | `DevicePacket` type, validation helpers |
| `scoring-spec.json` | Weights, thresholds, windows (single source of truth) |
| `test-vectors.json` | Sample inputs + expected score ranges, run as CI unit tests in both codebases |

---

## Monorepo Structure

```
mirror/
├── shared/                     # Pure TypeScript — imported by both app + extension
│   ├── score.ts
│   ├── insights.ts
│   ├── packet.ts
│   ├── schema.ts
│   ├── scoring-spec.json
│   └── test-vectors.json
│
├── app/                        # React Native (Expo) Android app
│   ├── android/app/src/main/
│   │   └── java/.../
│   │       ├── AccessibilityModule.kt
│   │       ├── PostureModule.kt
│   │       └── HealthConnectModule.kt
│   └── src/
│       ├── db/                 # SQLite schema + DAOs
│       ├── services/           # nightly job, nudge scheduler
│       ├── screens/            # all RN screens
│       └── components/         # charts, overlays, QR scanner
│
└── extension/                  # Chrome MV3 extension
    ├── src/
    │   ├── content.ts
    │   ├── background.ts
    │   ├── camera.ts           # offscreen document
    │   ├── packet.ts
    │   └── popup/
    └── mediapipe/              # bundled WASM + .task model files
```

---

## Build & Run

### Prerequisites
- Node 22.18+ and npm
- Chrome 120+ (for MV3 offscreen document support)
- For the Android app: Java 17 and the Android SDK

### Setup
```bash
git clone https://github.com/yashmittal646/whackiest.git
cd whackiest
npm install
npm run check               # types, tests and builds
```

### Chrome Extension
`npm run build`, then in Chrome: chrome://extensions → Developer mode → Load unpacked → select `extension/dist`.

### Report Website
```bash
npm run dev -w web          # http://127.0.0.1:5180
```

### Android App
```bash
cd app
npm run prepare_android     # generates the android/ folder
cd android
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
adb install -r app/build/outputs/apk/release/app-release.apk
```

---

## Demo Flow

1. **Extension popup** — browse Twitter. Watch the live doom score climb.
2. **Nudge fires** — *"You've been hunched and scrolling. Quick reset?"* — dismiss with "I'm here on purpose."
3. **Extension account page** — click "Sync now".
4. **Report website** — press Refresh. The day joins the labelled sample nights, and the insight card shows an association with the number of nights.
5. **Hand-off chart** — laptop bars taper off at 23:40 as phone bars pick up. The story, in one image.
6. **Privacy screen** — camera log shows "0 frames stored". A record is shown as the server sees it, encrypted.
7. **Export → Wipe** — one tap. Everything gone.

**Fallback if sync fails:** import the `.json` file on the website. Practice this too.

---

## Insight Examples

> All insights are computed on-device from your own data. Seeded demo data is clearly labelled.

- *"On nights you scroll for 2+ hours, you fall asleep about 23 minutes later."*
- *"Your late-night laptop use predicts worse sleep more strongly than your phone use."*
- *"On days you doom-scroll more, you slouch about 2× as long."*
- *"You take 800 fewer steps on days you sit at your desk for 3+ hours."*
- *"Your blink rate drops 40% in the last hour before you close the laptop."*

---

## What Mirror Does Not Do

- ❌ Read app content, notifications, or keystrokes
- ❌ Access location, contacts, or microphone
- ❌ Store any camera frame, landmark, or face embedding
- ❌ Infer emotions, mood, age, or identity
- ❌ Make network requests to anything but the sync server
- ❌ Require an account (only sync needs one)
- ❌ Upload sites, app names, camera frames or any unencrypted record

---

## Hackathon Build Order (Atomic Sequence)

| # | Task | Who |
|---|------|-----|
| 1 | Monorepo + shared schema + test vectors | All |
| 2 | `doomScore()` + unit tests (CI green) | B |
| 3 | AccessibilityService → JS events | A |
| 4 | Minute log DB + aggregation | B |
| 5 | Extension: content script → doom score | C |
| 6 | App: home screen with live doom score | D |
| 7 | Extension: nudge notification | C |
| 8 | App: doom-scroll nudge overlay | B/D |
| 9 | Extension: MediaPipe posture bursts | C |
| 10 | App: nightly job → insight engine | B |
| 11 | App: insight cards screen | D |
| 12 | Extension: QR packet builder | C |
| 13 | App: QR scanner + cross-device join | A/D |
| 14 | App: hand-off chart | D |
| 15 | App + Extension: Privacy screen + camera log | D/C |
| 16 | Demo data seeder (21 days) | D |
| 17 | Health Connect sleep bridge | A |
| 18 | App: posture check session (phone camera) | A |
| 19 | Extension: blink rate bursts | C |
| 20 | Polish, bug bash, demo rehearsal | All |

> **Steps 1–13 are your demo.** Everything else is gravy.

---

## Team

Built at [Hackathon Name] by [Your Team Name].

---

<div align="center">

*"Wearables give you numbers. Mirror connects the habit across all your screens to the night you lose, encrypted before it leaves your devices."*

</div>
