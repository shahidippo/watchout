# Watchout for Android

A real, early Android application with a persistent self-hosted backend. Original Watchout branding, five phone tabs, no seeded community activity. Built with React + Capacitor, native Java location recording and Android Keystore session encryption; Fastify + SQLite on Node 24.

**This is a working first release of selected vertical slices, not full completion of the master brief.** Source integrations are implemented but live validation was blocked by the cloud network policy. There is no hosted public backend yet. Advanced navigation, public driver sharing, aircraft, purchases and rewards are not enabled. Read [feature evidence](docs/EVIDENCE.md) and the [scope matrix](docs/FEATURE_MATRIX.md).

## Start the backend and web client

Prerequisites: Node 24.10+ and npm. From this checkout:

```sh
npm ci
cp .env.example .env
npm run build
npm run dev
```

This creates `data/watchout.sqlite` with versioned schema and **no demo data**. The API and bundled web app run on port 3000. Confirm `GET /v1/health` returns `ok:true`. Create your own account in the app. The account system uses usernames and passwords; there is no email verification or recovery in this build.

For UI development, keep the backend running and run `npx vite` in a second terminal. Vite proxies `/v1` to port 3000. Do not expose Vite publicly.

## Install on Android

[Download the Android APK from GitHub](downloads/Watchout-0.1.0-debug.apk?raw=true) · [Checksum](downloads/SHA256SUMS.txt)

The downloadable debug APK is `downloads/Watchout-0.1.0-debug.apk` (also generated locally under `artifacts/`). Android 8.0+ (API 26), target API 35. It is a test-signed development APK, not a Play Store release.

1. Start the backend on your computer/server using the commands above.
2. Copy the APK to your phone and allow installation from that file source. Or use `adb install -r downloads/Watchout-0.1.0-debug.apk`.
3. Open Watchout → gear icon → **Backend address**.
4. On Android Emulator use `http://10.0.2.2:3000`. On a real phone on the same Wi-Fi, enter `http://YOUR_COMPUTER_LAN_IP:3000`. Only the debug build permits HTTP for local development. Allow inbound TCP 3000 on your computer's firewall for this local test.
5. Tap **Save & test connection**, then create an account. A local address works only while your phone can reach that computer. For use away from Wi-Fi, [deploy a public HTTPS backend](docs/SELF_HOST.md).

The APK bundles its UI. It still needs the backend for accounts, content and drive sync, and provider connectivity for maps/search/routing. It never connects to CorsaView's private backend or invents activity.

## What works

- Register/login/logout, canonical usernames, expiring server sessions, account deletion with password confirmation. Android sessions encrypted with Android Keystore; backup disabled.
- Private/public garages, active vehicle selection, persisted build notes. Visibility checked on the server.
- Public text posts with author deletion and account blocking.
- Public meets with venue, coordinates, times/timezone, RSVP deduplication and organiser-only ending.
- Invite-only convoy chat with membership checks, durable ordering, deduplicated writes, polling and immediate terminal state when closed. The host ends and deletes messages. No shared live location.
- Private drives with native Android location foreground service, persistent local sample queue, retry-safe server upload and server-calculated distance. Gaps over 30 seconds, weak accuracy and impossible jumps are excluded. Reopen the app to sync and finish. No distance-based reward or speed leaderboard.
- Map layers with explicit provenance, timestamps, unavailable/stale states; expiring unverified crash/obstruction reports. Manual coordinate routing, saved private road routes and provider manoeuvre list when OSRM is available.
- No fake aircraft, users, XP, prices or giveaways.

## Validate

```sh
npm test                 # API, privacy, persistence, importer and telemetry regression tests
npm run test:ui          # two independent mobile browser clients; requires Chromium
npm run check:live       # real Sydney source probes; exits nonzero for missing access/key
npm audit
```

For browser tests install Chromium at `/usr/bin/chromium`, set `CHROMIUM_PATH`, or use the Playwright browser in CI. Tests use isolated in-memory/temporary databases. They do not populate the development or production DB.

## Build the APK yourself

Install JDK **21 with javac**, Android SDK platform 35 and build-tools 35.0.0; accept the official SDK licences. Set `JAVA_HOME` and `ANDROID_HOME` to their actual locations. The wrapper downloads Gradle 8.11.1.

```sh
npm ci
npm run android:sync
cd android
./gradlew --no-daemon --max-workers=2 assembleDebug lintDebug
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Native source is under `android/app/src/main/java/app/watchout/android`. Release builds reject cleartext connections; configure an HTTPS backend. Release signing requires your own private keystore, kept outside Git. Do not distribute the debug signing key as a production identity. Review current Play target-SDK and location policy requirements before submission; API 35 is not a claim of store eligibility in November 2026.

## More

- [Self-hosting, HTTPS, backups and rollback](docs/SELF_HOST.md)
- [Data providers, rights, credentials and blocked checks](docs/PROVIDERS.md)
- [API contracts](docs/API.md)
- [Feature-to-screen-to-service-to-test matrix](docs/FEATURE_MATRIX.md)
- [Validation evidence and remaining scope](docs/EVIDENCE.md)
