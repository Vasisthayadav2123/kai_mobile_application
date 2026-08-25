# K.A.I. Mobile — Kinetic AI Interface Client 📱

The React Native / Expo client for K.A.I. A remote control for your desktop: live screen + audio
streaming with full touch-to-mouse mapping, a dynamic command centre, a voice assistant, and a
real-time hardware dashboard.

It talks to the Flask backend in `../KAI/backend`. **The backend must be running first** — this app
is a thin client and does nothing standalone.

---

## Table of Contents

1. [Stack](#stack)
2. [Folder Structure](#folder-structure)
3. [Setup Guide](#setup-guide)
4. [Pointing the App at Your Server](#pointing-the-app-at-your-server)
5. [The Connection Layer (`constants/server.ts`)](#the-connection-layer-constantsserverts)
6. [Startup Handshake Animation](#startup-handshake-animation)
7. [Screens](#screens)
   - [Server Status](#1-server-status-apptabsindextsx)
   - [Commands](#2-commands-apptabscommandstsx)
   - [Assistant](#3-assistant-apptabsassistanttsx)
   - [Livestream](#4-livestream-apptabsscreentsx)
8. [Components](#components)
9. [Permissions & Native Config](#permissions--native-config)
10. [Building for Release](#building-for-release)
11. [Troubleshooting](#troubleshooting)
12. [Known Gaps](#known-gaps)

---

## Stack

| Piece | Version | Notes |
|---|---|---|
| Expo SDK | 54 | New Architecture enabled, React Compiler on |
| React / React Native | 19.1 / 0.81.5 | |
| expo-router | ~6.0 | File-based routing, typed routes enabled |
| react-native-webview | 13.15 | Hosts the WebRTC player — RN has no native WebRTC here |
| expo-av | ^16.0 | Voice recording and reply playback |
| react-native-svg | ^15.15 | Every gauge and chart is hand-drawn SVG — no chart library |
| react-native-reanimated | ~4.1 | |
| TypeScript | ~5.9 | Path alias `@/*` → project root |

No state library, no data-fetching library. Every screen owns its own `useState` + polling
`useEffect`, and all network access funnels through one module.

---

## Folder Structure

```
kai_mobile_application/
├── app/                          # expo-router — file paths are routes
│   ├── _layout.tsx               # root stack + the startup handshake overlay
│   ├── modal.tsx
│   └── (tabs)/
│       ├── _layout.tsx           # 4-tab bar; Livestream hides the bar
│       ├── index.tsx             # Server Status dashboard   (~24 KB)
│       ├── commands.tsx          # Command centre            (~42 KB)
│       ├── assistant.tsx         # Voice assistant           (~23 KB)
│       └── screen.tsx            # WebRTC livestream         (~35 KB)
├── components/
│   ├── connection-animation.tsx  # full-screen handshake visualisation (~19 KB)
│   ├── media-controls.tsx        # reusable transport buttons
│   ├── neonBar.tsx               # animated accent bar
│   ├── haptic-tab.tsx            # tab button with haptic feedback
│   ├── themed-text.tsx / themed-view.tsx
│   └── ui/                       # collapsible, icon-symbol
├── constants/
│   ├── server.ts                 # ★ IP resolution, handshake, fetchWithAuth
│   └── theme.ts                  # colour tokens
├── hooks/                        # use-color-scheme, use-theme-color
├── assets/images/                # icons, splash, adaptive icons
├── android/                      # prebuilt native project (gitignored upstream)
├── app.json                      # Expo config, permissions, plugins
├── eas.json                      # EAS build profiles
└── package.json
```

`constants/server.ts` is the file to read first — every screen depends on it.

---

## Setup Guide

### 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | LTS recommended |
| **The K.A.I. backend running** | See `../KAI/backend/README.md`. Ports 5000 and 8080 must be reachable from the phone. |
| **Expo Go** *(quickest)* or an Android device/emulator | Install Expo Go from the Play Store / App Store |
| **Android Studio** *(only for native builds)* | Needed for `expo run:android`, not for Expo Go |

Phone and PC must be on the **same network**, or both on the same Tailscale / WireGuard tunnel.

### 2. Install dependencies

```bash
cd kai_mobile_application
npm install
```

### 3. Start the dev server

```bash
npx expo start
```

Scan the QR code with Expo Go. The app auto-detects your PC's IP from the Metro bundler host, so
if Metro and the backend run on the same machine, **no configuration is needed** —
see [Pointing the App at Your Server](#pointing-the-app-at-your-server).

### 4. Native builds (optional)

Needed only if you want a standalone APK or are testing native module changes:

```bash
npx expo run:android      # builds and installs a debug APK
npx expo run:ios          # macOS + Xcode only
```

### 5. Useful scripts

| Command | Does |
|---|---|
| `npm start` | Start Metro / Expo dev server |
| `npm run android` | `expo run:android` — native debug build |
| `npm run ios` | `expo run:ios` |
| `npm run web` | `expo start --web` (dashboard works; WebRTC/voice do not) |
| `npm run lint` | `expo lint` |
| `npm run reset-project` | Moves the starter code to `app-example/` and scaffolds a blank `app/`. **Destructive — don't run it on this project.** |

---

## Pointing the App at Your Server

`constants/server.ts` resolves the backend IP in this priority order:

```
EXPO_PUBLIC_KAI_SERVER_IP  →  Metro bundler host IP  →  FALLBACK_IP
```

| # | Method | When to use |
|---|---|---|
| 1 | **Env var** — `EXPO_PUBLIC_KAI_SERVER_IP=192.168.1.42 npx expo start` | Backend runs on a different machine than Metro |
| 2 | **Metro auto-detect** — nothing to do | Backend and Metro on the same PC. Parsed from `Constants.expoConfig.hostUri`; `localhost` and `127.0.0.1` are ignored. |
| 3 | **`FALLBACK_IP`** in `constants/server.ts` (currently `100.95.86.123`, a Tailscale address) | Standalone builds with no Metro attached |
| 4 | **`setServerIp(ip)` at runtime** | Exported for a future settings screen; clears the session token so the next call re-handshakes |

The resolved IP is logged on boot as `[KAI CONFIG] Resolved Server IP: ...` — check that line first
when the app can't connect.

Ports are constants in the same file: `SERVER_PORT = '5000'` (Flask), `WEBRTC_PORT = '8080'`
(stream).

> ⚠️ **Protocol mismatch to be aware of.** `getServerUrl()` and `getWebRtcUrl()` build **`https://`**
> URLs, but the backend serves plain HTTP on both ports. Unless a TLS terminator sits in front,
> these need to be `http://`. `app.json` already sets `usesCleartextTraffic: true` for Android, so
> cleartext is permitted.

### Pairing keys

The app holds a `KAI_KEYS` table that **must match the backend's `KAI_KEYS` exactly** — same numbers,
same secrets. Change one side and every handshake fails with `Invalid key`.

```ts
const KAI_KEYS: Record<string, string> = {
  "1": "kai-sec-alpha-87219",
  // ...
};
```

> ⚠️ These keys are compiled into the app bundle and are readable by anyone who unpacks the APK.
> Treat this as device pairing, not as real authentication.

---

## The Connection Layer (`constants/server.ts`)

Every network call in the app goes through this module. It handles four things:

### 1. IP resolution
Described above; exposes `getServerUrl()`, `getWebRtcUrl()`, `getServerIp()`, `setServerIp()`.
Always call the **getters** — the legacy `SERVER_URL` / `WEBRTC_URL` constants snapshot the IP at
import time and won't reflect a runtime change.

### 2. `performHandshake()`
Runs the challenge-response against the backend:

```
POST /api/handshake/init    → { challenge_id, key_number }
  look up KAI_KEYS[key_number] locally
POST /api/handshake/verify  → { session_token }
```

- **Deduplicated**: a module-level `_handshakePromise` means ten concurrent callers share one
  network round-trip.
- **Retried**: up to 3 attempts with exponential backoff (2 s → 4 s → 8 s), 15 s timeout per call.
- **Instrumented**: emits step events (`locating`, `server_found`, `challenge_received`,
  `key_lookup`, `bullet_fired`, `verifying`, `connected`, `failed`) with deliberate short delays
  between them so the startup animation has something to render.

### 3. `fetchWithAuth(url, options)`
The wrapper every screen uses instead of raw `fetch`:

1. Handshakes first if there's no session token.
2. Attaches `Authorization: Bearer <token>`.
3. On **401**, re-handshakes once and replays the request — which is what makes the backend's 1-hour
   session expiry invisible to the user.
4. Supports a `timeout` option (default 15 s) implemented with `AbortController`.

### 4. Handshake listeners
`addHandshakeListener(fn)` returns an unsubscribe function. Used only by the startup animation, but
available for a status indicator anywhere in the app.

---

## Startup Handshake Animation

`components/connection-animation.tsx` renders as a full-screen overlay from `app/_layout.tsx` and
stays up until the handshake resolves. It subscribes to the handshake step events and animates a
"bullet" travelling between a phone and a server node — the server challenges with a key number, the
phone looks it up, fires the answer back, and the screen bursts into particles on `connected`.

The artificial 600–800 ms delays between steps live in `performHandshake()` specifically so this
sequence is legible rather than instant. On failure it shows the error and offers a retry.

---

## Screens

### 1. Server Status (`app/(tabs)/index.tsx`)

Polls `GET /health` every 3 seconds and renders the result as a hardware dashboard.

- **Every visualisation is hand-built SVG** — no chart library. `CircularGauge` (CPU/RAM/disk rings),
  `SpeedGauge` (semi-circular needle for network throughput), `MiniBarChart`, `ProgressBar`.
- **Polling is lifecycle-aware.** `useIsFocused()` plus an `AppState` listener stop the interval when
  the tab loses focus or the app backgrounds, and restart it on return — this matters, because 3 s
  polling against a sleeping phone burns battery for nothing.
- A live clock ticks once a second, and a pulse animation drives the sync indicator.
- Failures are silent by design: `console.log("Server Unreachable")` and the last-known data stays
  on screen rather than flashing an error.

### 2. Commands (`app/(tabs)/commands.tsx`)

The largest screen, and **almost entirely server-driven**. It fetches
`GET /api/command/categories` and builds its whole UI from the response, so adding a command on the
backend makes it appear here with no client change.

| Panel | Backend calls |
|---|---|
| **Media Controller** | `media.*` via `/api/command/execute` |
| **Applications** | `app.open` with the app id from the manifest |
| **File Browser** | `fs.list` to navigate, `fs.open_file` to launch. Directories first, sizes formatted client-side. Confined to the backend's `safe_roots`. |
| **KAI Assistant** | `kai.text_command` for prompts; polls `/api/ai/status` every 15 s while the panel is open |
| **AI Power** | `/api/ai/warmup` and `/api/ai/unload` — VRAM control, with a 12-attempt status poll after warm-up |
| **Audio Level** | `audio.change_volume` |
| **Display Tools** | `display.screenshot`, rendered inline from the returned base64 JPEG |
| **History** | `GET /api/command/history?limit=10`, refreshed alongside the categories every 8 s |

All of it runs through one `executeCommand(type, payload)` helper with a 40 s timeout, which also
refreshes the history list after each call.

### 3. Assistant (`app/(tabs)/assistant.tsx`)

Push-to-talk voice control.

```
tap → expo-av records (HIGH_QUALITY preset, .m4a)
    → multipart POST /api/command/voice  (field: audio_data, 60 s timeout)
    → { query, reply, mp3 }
    → expo-av plays getServerUrl() + mp3
```

- State machine: `idle → listening → thinking → speaking`, plus `error`. Each state drives its own
  animation set, and the transcript and reply are shown as text alongside the audio.
- Microphone permission is requested on mount, with audio-mode juggling around record vs. playback
  (`allowsRecordingIOS` is toggled off before playing, or iOS routes output to the earpiece).
- Recording is force-stopped when the tab loses focus, so it can't keep the mic open in the
  background.
- Haptic feedback on press via `expo-haptics`.

> The backend also exposes a **streaming** WebSocket pipeline that returns sentence-by-sentence text
> and audio. This screen doesn't use it — there's no `socket.io-client` dependency yet. Switching to
> it would remove most of the perceived latency.

### 4. Livestream (`app/(tabs)/screen.tsx`)

The most intricate screen. React Native has no native WebRTC here, so:

**`getWebRTCHtml(serverUrl, orientation)` generates a complete HTML page as a string** and hands it
to a `WebView` via `source={{ html }}`. Inside that page, ordinary browser WebRTC negotiates
directly with `serverStream.py`.

```
WebView page                                    serverStream.py :8080
  pc.addTransceiver('video', recvonly)
  pc.addTransceiver('audio', recvonly)
  createOffer → setLocalDescription
  wait for ICE gathering to complete ─── POST /offer ──►
                                     ◄── { sdp, type } ─
  setRemoteDescription → ontrack → <video> plays
```

- Waits for `onicecandidate === null` (full ICE gathering) before posting the offer, rather than
  trickling candidates — the backend has no candidate endpoint.
- Reconnects automatically with backoff (`2 s × attempt`, capped at 10 s, max retries), and reports
  every ICE state change up to React Native.

**Orientation toggle.** Portrait letterboxes the desktop. Landscape applies a CSS 90° rotation so
the desktop fills the phone's long axis. Switching remounts the WebView (`key={orientation}`) and
re-negotiates.

**Touch → mouse mapping.** The WebView page converts touch coordinates to normalized `0–1` video
coordinates, accounting for letterbox offsets and — in landscape — inverting the rotation:

```js
// portrait
nx = (clientX - offsetX) / renderW
ny = (clientY - offsetY) / renderH

// landscape (video rotated 90° CW, so un-rotate the touch)
nx = ry / renderH
ny = 1 - (rx / renderW)
```

Values are clamped to `[0,1]`, posted to React Native via `postMessage`, and forwarded to
`POST /api/control/touch` with the session token attached.

| Gesture | Sent as |
|---|---|
| Single tap | `click` |
| Second tap within 300 ms | `double_click` |
| Long press (600 ms, no movement) | `right_click` |
| Drag after 8 px of movement | `move` (cursor follows) |
| Double-tap then drag | `drag` with `drag_state: start / drag / end` |
| Two-finger vertical drag | `scroll` with `dy` (delta / 10, dead zone 0.2) |

A virtual cursor is drawn in the WebView at the touch point and fades after 1.5 s, so you can see
where the remote pointer landed.

**Keyboard.** A hidden `TextInput` seeded with a single space. Typing makes the value longer → send
the new characters as `text`. Deleting empties it → send `key: "backspace"`. The value resets to a
space after each event, which keeps backspace available forever. There's also a Windows-key button
sending `key: "win"`.

**Overlay.** Connection status, mute toggle, orientation toggle, media transport buttons and a
reconnect button, auto-hiding after 4 seconds of inactivity. React Native drives the WebView through
`postMessage` actions (`reconnect`, `toggleMute`, `unmute`).

---

## Components

| Component | Purpose |
|---|---|
| `connection-animation.tsx` | Full-screen handshake visualisation; see [above](#startup-handshake-animation) |
| `media-controls.tsx` | Reusable transport button row, posts to `/control` |
| `neonBar.tsx` | Animated accent bar used in headers |
| `haptic-tab.tsx` | Tab bar button wrapper adding `expo-haptics` feedback |
| `themed-text.tsx` / `themed-view.tsx` | Colour-scheme-aware primitives via `useThemeColor` |
| `ui/icon-symbol.tsx` | Maps SF Symbol names (which the backend's category manifest uses) to Material Icons on Android |
| `ui/collapsible.tsx` | Expand/collapse section |

The palette is a dark navy + coral scheme (`#0f1923` background, `#f0845e` accent), defined per-file
as a `COLORS` object and in `constants/theme.ts`.

---

## Permissions & Native Config

From `app.json`:

| Setting | Value | Why |
|---|---|---|
| `android.permissions` | `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Voice assistant recording |
| `expo-av` plugin | `microphonePermission` message | iOS mic prompt copy |
| `expo-build-properties` | `android.usesCleartextTraffic: true` | Required to reach the HTTP backend on Android 9+ |
| `newArchEnabled` | `true` | React Native New Architecture |
| `experiments.reactCompiler` | `true` | React Compiler |
| `experiments.typedRoutes` | `true` | Typed expo-router routes |
| `orientation` | `portrait` | The livestream's landscape mode is a **CSS rotation inside the WebView**, not a device orientation change — the app itself never rotates |
| `package` | `com.anonymous.kai_mobile_application` | Android application id |
| `scheme` | `kaimobileapplication` | Deep-link scheme |

---

## Building for Release

`eas.json` defines three profiles:

| Profile | Config | Use |
|---|---|---|
| `development` | `developmentClient: true`, internal distribution | Dev client builds |
| `preview` | internal distribution | Shareable test APK |
| `production` | `autoIncrement: true` | Store builds |

```bash
npm install -g eas-cli
eas login
eas build --profile preview --platform android
```

The project is linked to EAS project `cdf2f0a3-71cf-4ade-97de-d52218554656` under owner
`in7urgents-team`.

**Before building a standalone APK**, set `FALLBACK_IP` in `constants/server.ts` to an address the
phone can actually reach — a standalone build has no Metro host to auto-detect from. A Tailscale IP
is the most robust choice, since it works both at home and away.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Stuck on the connection animation | Backend unreachable | Check the `[KAI CONFIG] Resolved Server IP` log line; confirm the backend is running and the firewall allows 5000 |
| `No key found for key number: N` | Key tables diverged | Make `KAI_KEYS` here match the backend's `.env` exactly |
| `Handshake verify failed: Invalid key` | Same as above | Same as above |
| Connects, then everything 401s | Session expired | `fetchWithAuth` should re-handshake automatically; if not, restart the app |
| Dashboard shows stale numbers | Polling paused | Expected when the tab is unfocused or the app is backgrounded — it resumes on return |
| Livestream stuck at "Connecting…" | Port 8080 unreachable, or `serverStream.py` not running | Check the backend's stream server and the firewall rule for 8080 |
| Livestream video but no audio | Stereo Mix disabled on the host, or the WebView is muted | Enable Stereo Mix on the PC; tap the mute toggle in the overlay |
| Touches land in the wrong place | Orientation state mismatch | Toggle orientation to force a WebView remount and re-negotiation |
| Voice recording does nothing | Mic permission denied | Grant it in system settings; the app requests on mount |
| Voice reply never plays | `mp3` path unreachable | The app fetches it from `getServerUrl() + mp3` — confirm `/static/audio/` is served |
| `Network request failed` on every call | `https://` vs `http://` mismatch | See the protocol note in [Pointing the App at Your Server](#pointing-the-app-at-your-server) |
| Metro cache weirdness after config edits | Stale bundle | `npx expo start -c` |

---

## Known Gaps

- **`https://` URLs against an HTTP backend** — see the protocol warning above.
- **The WebSocket streaming API is unused.** No `socket.io-client` dependency; the Assistant tab uses
  the slower request/response endpoint.
- **`KAI_KEYS` is duplicated** between this app and the backend with no shared source of truth, and
  ships readable inside the bundle.
- **No settings screen.** `setServerIp()` exists and works but nothing calls it — changing servers
  means editing `constants/server.ts` and rebuilding.
- **No error boundaries.** A screen-level throw takes down the tab.
- **The session token is in-memory only** — it does not survive an app restart, so every cold start
  re-handshakes. (Harmless, and arguably the safer default.)
- **`android/` is committed** even though `.gitignore` lists `/android` as a generated folder.
- **Web target is partial**: the dashboard renders, but WebRTC streaming and voice recording do not
  work under `expo start --web`.
