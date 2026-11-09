# Watchout Android delivery matrix

The supplied master brief is a product specification, not evidence of implemented features or upstream access. The user's Android requirement replaces the brief's Apple platform choice. Status is updated after validation in EVIDENCE.md.

| Feature | Android screen | Service / source of truth | Required validation | Scope |
|---|---|---|---|---|
| Accounts and session | You / sign in | scrypt passwords, hashed expiring tokens, SQLite users | independent accounts, logout, invalid auth | implemented slice; email verification/recovery require mail service |
| Garage | You / garage | owner-authored vehicles | private versus public reads; persistence | implemented slice |
| Community feed | Feed | authenticated user posts, block filtering | create, list, delete; fresh empty DB | text posts; media pipeline later |
| Meets | Events | user-authored events and RSVP records | lifecycle, deduped RSVP, organiser-only ending | implemented slice |
| Map / layers | Map | OpenStreetMap tiles, NSW ArcGIS fixed-camera register, TfNSW hazards | real source probe, CRS, expiry, outage | adapters; live verification depends on network access |
| Places/search/routes | Map / Plan route | Nominatim and OSRM public development services | real Sydney search/route and manoeuvres | saved road routes; public servers require production replacement |
| Civil aircraft | Map / coverage | licensed provider contract | current eligible civil observation comparison | unavailable until licensed adapter and credentials implemented |
| Police advisories | Map / coverage | agency-authored current notice | official provenance and expiry | no patrol tracking or invented notices; planned editor workflow |
| Private drives | Map / Record / You | foreground Android GPS service; durable samples and server recomputation | gap handling, duplicate batches/finish, service compile | physical-device behaviour requires testing |
| Community safety reports | Map / Report | dated user observation, 60-minute expiry | auth, coordinates, expiry | crashes and obstructions only |
| Convoy chat | Inbox | authenticated membership + SQLite ordered messages | second account, idempotency, close/leave | private invite code; live polling; no public presence |
| Privacy | You / settings | private recording; no outward location endpoint | no public telemetry or driver list | Ghost only; Friends/Public and Home Zones deferred |
| Operations | backend /v1/coverage | importer health and provenance | failed import retains prior snapshot | coverage dashboard; full moderation console deferred |
| XP, achievements, collectibles | You | none | must not invent rewards | planned extension; no counterfeit totals |
| Billing | You / coverage | Google Play Billing + verified server purchase needed | licensed products, test purchase | unprovisioned; no invented prices or entitlements |
| Advanced reference scope | — | clubs, businesses, route adoption, media, navigation voice, GPX, performance timers | full acceptance suite from brief | planned extensions, not shipped claims |

No demo-seed job. Empty social tables remain empty. Development test identities and GPS exist only in isolated automated test databases. No source credentials belong in an APK.
