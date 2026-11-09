# Real data register

Checked in this environment on 9 November 2026 (Sydney time). Provider URLs are named sources, not evidence that access or redistribution rights are provisioned. See LIVE_SOURCE_CHECK.json for machine-readable outcomes. No private CorsaView API, scraped user accounts, invented prices, sightings or seeded community records are used.

| Surface | Real source | Current evidence / remaining dependency |
|---|---|---|
| Accounts, garage, posts, events, convoy messages | Watchout SQLite records created by authenticated users | API and independent browser-client tests pass. No prefilled social activity. |
| Private drive summary | consenting Android GPS samples, server `haversine-v1` calculation | Gap/deduplication/ownership tests pass with labelled synthetic test traces. Native service compiled; real Android background behaviour still needs a device. |
| Basemap | `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, © OpenStreetMap contributors | Real tile requests attempted in Chromium; blocked by cloud policy. Public OSM tile policy applies; no prefetch/offline bulk downloads. Production capacity must be arranged. |
| Address search | `https://nominatim.openstreetmap.org/search` | Sydney Opera House live request attempted; policy denied. Explicit submit only, app-level throttle, attribution; use your own/licensed geocoder for public launch. No autocomplete scraping. |
| Road route and manoeuvres | `https://router.project-osrm.org/route/v1/driving` | Real Sydney points submitted; policy denied. Demo routing has no availability SLA or traffic. Self-host OSRM with authorised OSM extracts or contract a routing provider for launch. |
| NSW fixed/red-light-speed camera assets | `https://portal.data.nsw.gov.au/arcgis/rest/services/Hosted/TFNSW_Speed_Cameras_public/FeatureServer`, layers 0 and 2 from the supplied agency reference | Fetch attempted; policy denied. Adapter validates metadata, OID, pagination, WGS84 output, unique IDs and bounds; retains prior snapshot on failure/unexpected empty export. Must inspect live schema/licence/update metadata before enabling. Fixed assets are not live mobile enforcement. |
| Official road incidents | `https://api.transport.nsw.gov.au/v1/live/hazards/incident/open` from TfNSW Open Data | Actual `TFNSW_API_KEY` binding absent. Adapter exists; upstream schema must be verified against the account's live payload before release. No inference of police involvement. |
| Aircraft overhead | Evaluate Flightradar24 production API with a customer-facing civil-only licence | No key or licence configured; no live adapter implemented. `/v1/airspace/nearby` honestly returns unavailable. Static sandbox data cannot qualify. |
| Official police notices | Current, explicit agency notice with issuer, area, effective period and review | Editor/ingestion workflow deferred. Endpoint returns unsupported. No patrol/officer/aircraft tracking. |
| Crash / obstruction reports | User observation with authenticated author, time and automatic expiry | Stored in own DB; marked unverified. Never an emergency dispatch. |
| Prices / subscriptions / XP / rewards | Google Play catalogue and server-verified transactions / approved ledger rules | Not enabled. No invented entitlement, XP balance, prize stock or price is displayed. |

## Enable provider checks

The configured cloud custom allowlist is empty (package-manager presets only). Probes to the sources above returned proxy tunnel `403 Forbidden`. Draft read/save also returned `INVALID_ARGUMENT`; a requested network update could not be confirmed. Add required hosts in environment settings; do not remove existing allowed destinations:

- `portal.data.nsw.gov.au`
- `opendata.transport.nsw.gov.au`
- `api.transport.nsw.gov.au`
- `nominatim.openstreetmap.org`
- `router.project-osrm.org`
- `tile.openstreetmap.org`

The earlier public Live Traffic web JSON candidate `www.livetraffic.com` was probed and denied. The implementation uses the documented keyed TfNSW API rather than depending on that web endpoint. Agency links to `www.livetraffic.com` open in the user's browser.

After access is applied, run `npm run check:live`. It uses a fresh in-memory DB and exits nonzero unless each source returns a valid live result. This is deliberately separate from fixture tests. Supply your own TfNSW key securely on the backend server for traffic. The app and Git repository must never contain it.

Before publishing the fixed-camera layer inspect `?f=pjson` service/layer metadata, agency dataset licence and dates. Record the actual permitted redistribution attribution, not an assumed licence. The current metadata adapter's unknown update time is null, never replaced by fetch time. Production requires `NSW_CAMERA_RIGHTS_CONFIRMED=true` and `SYNC_SOURCES=true`; these are operator assertions, not automatic legal verification.

## Freshness semantics

- Fixed register refresh: at most daily after success. An import failure leaves the previous snapshot and marks it stale. No successful snapshot means unavailable. Unexpected empty export does not wipe a populated register.
- Traffic: intended 120-second refresh. A stale/failed traffic snapshot is not returned as current. Items expire on the backend and client even if the next request fails. Resolved notices are omitted.
- Community reports: observation within 15 minutes; public for 60 minutes from the observation, marked unverified.
- No provider response is converted into fake aircraft, moving camera markers, live drivers or police locations.

## Cost worksheet boundary

No paid provider plan was provisioned and current contract prices were not accessible, so there are no invented unit prices. Estimate usage before selecting a plan: monthly map sessions × tile loads; explicit searches × query price; route calculations × route price; storage GB and egress GB; API/chat polling volume. At 1,000 simultaneous moving drivers and one sample every five seconds, live ingestion would be about 200 updates/s before fanout. This first implementation queues samples locally and uploads on finish; it is not a tested 10,000-user realtime service. Hosting costs and provider quotations must be filled by the operator with actual plan/date information.
