# Delivery evidence — Watchout Android 0.1.0

Validated 9 November 2026, Sydney local date. This is the first working Android/backend implementation, not completion of every feature in the supplied master specification. No physical Android phone, public hosting account, production data contract or store account was supplied.

## Artifacts

- `artifacts/Watchout-0.1.0-debug.apk`: installable debug APK, `app.watchout.android`, version 0.1.0 (1), minimum API 26 / Android 8.0, target and compile API 35. Bundled UI; configurable backend origin. Not a signed-for-store production release.
- `artifacts/SHA256SUMS.txt`: actual APK checksum.
- `artifacts/apk-verification.txt`: `apksigner verify --verbose` result. APK signature scheme v2 verified, one test signer.
- Full source in this checkout; lockfile, Gradle wrapper, Android sources, schema version 1, API contracts, Docker and Compose configuration, provider setup and restore instructions.

## Executed checks

| Check | Result and scope |
|---|---|
| `npm run build` | Passed: strict TypeScript validation and production Vite bundle. |
| `npm test` | 9 tests passed, 0 failed/skipped: empty DB, canonical identity, garage privacy/ownership, persistence across restart, blocking, RSVP lifecycle, room membership/deduplication/closure, private drive batches/summary/gaps, importer schema/CRS/stale retention, account deletion. Tests use separate DBs/synthetic identities. |
| `npx playwright test` | One multi-step two-client mobile-browser scenario: two independent accounts, private garage persisted after relaunch and hidden from other client, public post read by second client, published meet/RSVP, convoy invitation/chat/end, five mobile tabs and no horizontal overflow/runtime exceptions. Browser test, **not** an Android emulator/device claim. |
| `npm audit` | 0 known vulnerabilities reported after updating pinned dependencies. Audit is a bounded tool observation, not a security certification. |
| Android `assembleDebug lintDebug` | Passed with JDK 21, Gradle 8.11.1, Android platform 35. Lint: 0 errors, 24 warnings. Warnings include synchronous durable preference commits, debug-only HTTP networking, template unused/obsolete/icon resources; no warnings were suppressed to manufacture a pass. |
| `apksigner verify` / `aapt dump badging` | APK verifies; manifest/package/minimum/target SDK inspected. |
| Docker image build | Passed using verified TLS and an optional BuildKit CA secret; session CA not copied into image. Runtime executes as nonroot node user. |
| Docker application smoke | Container started; actual health request passed. A labelled synthetic account and private vehicle were created by API, then container restarted; same session and vehicle remained valid in its persistent DB. This used an isolated validation container, not the app's development DB. |
| Backup and restore | SQLite `VACUUM INTO` backup passed integrity_check; reopening backup through the application verified health and the expected test vehicle. No encrypted offsite backup service was provisioned. |
| Map UI requests | Real OSM tile requests attempted; provider host denied by cloud policy. Honest basemap-unavailable banner shown. No replacement street imagery or invented map markers. |
| `npm run check:live` | **Blocked**, nonzero status. Real Sydney address, route and NSW camera service attempts did not pass. TfNSW traffic key missing. Details in `LIVE_SOURCE_CHECK.json` and `PROVIDERS.md`. Fixture adapter tests are not live-source verification. |
| Public deployment / Caddy ACME | Not run: no user hosting account/domain. Complete self-host instructions provided; no public backend URL claimed. |
| Physical Android / emulator install | Not run. No emulator/KVM or physical device attached. Compilation does not verify screen-off GPS, notification permission behaviour, OS process death, precise permission, battery usage, map rendering on Android WebView, device export downloads or phone networking. |

No custom-domain or credential requirements were successfully saved through cloud onboarding: draft reads/writes returned `INVALID_ARGUMENT`, persistence unconfirmed. Current custom network allowlist was empty with package-manager presets. Application source/dependencies are present in this workspace; future environment publication is not claimed.

## Feature status matrix

| Feature | Status | Remaining concrete action |
|---|---|---|
| Username/password accounts and server session revocation | Implemented and verified in API/browser tests | Add managed identity or mail verification/recovery/MFA for public launch. |
| Android encrypted session storage | Implemented and awaiting named dependency | Run on physical Android device and verify Keystore lifecycle/reinstallation/backup exclusion. |
| Garage privacy, active vehicle, text build notes | Implemented and verified | Add photos, typed modifications, motorcycles field and structured build history. |
| Public text feed and blocking | Implemented and verified | Media processing, comments, reports, moderation, complete pagination. |
| Public meets and RSVP/ending | Implemented and verified | Device checks, private scopes, delegated admins, check-in, clubs/businesses. |
| Private convoy chat and closure | Implemented and verified in API and independent browser clients | Device reconnection tests; robust queued sends, expiry/revocable invites, complete message-history UI; WebSockets replace polling if needed. |
| Road route geometry save | Implemented and awaiting named dependency | Unblock/contract routing and geocoding provider; verify real Sydney geometry/manoeuvres; full active voice navigation/revisions/GPX remain planned. |
| NSW fixed camera importer | Implemented and awaiting named dependency | Unblock actual agency endpoint, inspect current live schema/licence/update time, confirm rights and live comparison before redistribution. |
| TfNSW hazards importer | Implemented and awaiting named dependency | Obtain TfNSW Open Data API key/rights, permit endpoint, verify actual schema, expiry and live incident agreement. |
| Civil aircraft | Planned extension / explicitly unavailable | Production civil-eligibility licence, adapter, credentials and current observation proof. No static sandbox substitute. |
| Official police notices | Planned extension / explicitly unsupported | Audited editor/agency notice workflow with effective area/expiry and source review. No individual tracking. |
| Crash/obstruction reports | Implemented; API/manual flow, not full moderation acceptance | Real user/device check, corrections/abuse review and operational moderation before launch. |
| Private foreground-service GPS and durable queue | Implemented and awaiting named dependency | Physical Android tests for screen off, offline finish/restart, denial, battery saver and interruption. Server synthetic GPS regression tests pass. |
| Ghost privacy | Explicit difference from reference | This build never publishes driver positions. Friends/Public/Home Zone policy and three-viewer tests are planned; no hidden default sharing. |
| XP, achievements, campaigns, closed-course timing | Planned extension | Build versioned server ledger, proof rules, venue validation and acceptance suite; no fabricated rewards. |
| Google Play products and entitlements | Planned extension / unprovisioned | Product IDs, real catalogue prices, billing adapter, server verification and sandbox/device tests. |
| Push notifications, media, clubs, business, QR/deep links, operator moderation | Planned extension | Provider accounts and full implementations/tests. None are represented as completed placeholder actions. |
| Native Apple features | Explicit platform difference | User requested Android APK. No iOS/iPad, Live Activities, CarPlay or StoreKit implementation claimed. Android Auto is also not enabled. |
| Scale and production operations | Explicit difference from proposed architecture | SQLite single-instance backend and polling; PostGIS/Redis/S3/worker/outbox/high-volume partitioning require a later scale implementation. No 1k/10k-user load claim. |

The original brief's physical-device, three-viewer privacy, 60 achievements, live aircraft, store purchase, media erasure and full acceptance matrix has **not** passed. Empty community records are intentional until real users author them.
