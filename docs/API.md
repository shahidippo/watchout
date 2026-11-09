# Watchout API v1

Base: `/v1`. JSON; max request body 256 KiB. See [openapi.json](openapi.json) for the endpoint inventory and common schemas; executable validation is the Zod schema alongside each handler in `server/app.mjs`. Times are ISO-8601 UTC; event timezone is stored separately as an IANA zone. Coordinates are WGS84 decimal degrees, distances metres and speeds metres/second. API actor is always derived from the bearer session, never a submitted owner ID.

Authentication: `Authorization: Bearer <session-token>`. Tokens are random 256-bit opaque values, only SHA-256 hashes are stored, expire after 30 days and revoke on logout/deletion. Passwords are salted scrypt hashes. Self-hosted username/password auth is an explicit difference from the managed email/OIDC system in the master brief. There is no claim of email recovery, MFA or production identity-provider setup.

Errors: `{ "error": "human-readable message", "fields": [{"path":"field", "message":"reason"}] }`. Fields are included for validation errors. 400 invalid input, 401 unauthenticated, 403 denied, 404 missing/not permitted, 409 conflict, 410 ended, 429 rate-limited, 503 upstream unavailable. Upstream response bodies and credentials are not returned. No precise GPS or invite secrets are logged. Behind Caddy, the API does not trust arbitrary forwarding headers; the first version's rate limit is per direct peer and may aggregate users behind the gateway. Configure a known proxy trust boundary and stronger distributed abuse controls before public scale.

## Identity

- `POST /auth/register`: `{username,password}`. Username starts with a letter, 3–24 letters/numbers/underscores, case-insensitive unique. Password 12–128 characters. Returns token, expiry, public account ID and username. Limited to 10/IP/hour.
- `POST /auth/login`: same fields, returns session. Limited to 20/IP/15 minutes.
- `POST /auth/logout`: revoke acting session; requires bearer.
- `GET /me`: current profile and explicit `ghost` visibility.
- `POST /me/deletion`: `{password}`; verifies password, deletes primary DB records by foreign-key cascade, revokes tokens. Does not claim remote backup erasure; policy retention must be operated separately.
- `PUT /me/blocks/{userId}`: block account. Reads filter both directions. No location-sharing channels are enabled.

## Garage and feed

- `GET /vehicles`: owned vehicles, including private ones. `?owner=<uuid>` shows only the target's public vehicles to a signed-in viewer, with block checks.
- `POST /vehicles`: `{make,model,year,nickname?,description?,visibility?}`. Defaults private. Only one active per owner.
- `PUT /vehicles/{id}`: `{visibility?:"private"|"public",active?:boolean}`. Owned only; active switching transactional.
- `DELETE /vehicles/{id}`: owned only; historical drive vehicle reference becomes null.
- `GET /posts?before=<timestamp>`: public posts; optional bearer applies block filtering. Up to 30 items with nextCursor. This first timestamp cursor can omit items sharing the boundary timestamp; replace with an opaque `(timestamp,id)` cursor for high-volume publication before production.
- `POST /posts`: `{body}` (1–2000 characters), authenticated public text post.
- `DELETE /posts/{id}`: author only.

## Events

- `GET /events`: scheduled/live public events, computed RSVP counts and current viewer's `going` flag. Ended/cancelled/time-expired events excluded. Max 100.
- `POST /events`: `{title,kind,description?,latitude,longitude,venue,startsAt,endsAt,timezone?}`. Kind meet/cruise/show/rally; start/end UTC, end later than start and in the future. All events in this build are public.
- `PUT /events/{id}/rsvp`: `{going:boolean}`. Unique user/event constraint makes retries harmless.
- `POST /events/{id}/end`: organiser only. Terminal state removes discovery entry.

## Discovery and road routes

- `GET /search?q=<query>`: real Nominatim search (12/IP/min), up to 5 results labelled OpenStreetMap. No search log storage. External provider failure is 503, not an empty success.
- `POST /routes/preview`: `{points:[{latitude,longitude},...]}` (2–10 points). OSRM road geometry, legs, manoeuvres, distance, duration, provider time and explicit `traffic:not_available`. Failed leg calculation preserves client draft and returns 503.
- `POST /routes`: authenticated `{title,route}` to save a private route. Accepts provider geometry from client as authored content, explicitly **not** reward-verified evidence. Schema validates geometry bounds/size. No route-completion XP can be awarded from this record.
- `GET /routes`: owned private saved routes, max 100.
- `GET /map?latitude=…&longitude=…&radius=…`: capped 500–100000 m radius and 2000 features; fixed-register/incident snapshots plus unexpired reports. No driver location data. Layer coverage health included.
- `GET /coverage`: source status (current/empty/stale/unavailable/unsupported), contact/source times, provenance and counts.
- `GET /airspace/nearby`: authenticated unavailable response; no aircraft key configured or adapter implemented.
- `GET /public-advisories`: unsupported official-police workflow; ordinary incidents remain separately classified.
- `POST /reports`: authenticated `{kind,description?,latitude,longitude,observedAt}`; kind crash/obstruction; timestamp within 15 minutes, expiry 60 minutes. User-generated and unverified.
- `DELETE /reports/{id}`: author withdrawal.

## Private drives

- `POST /drives`: `{vehicleId?:uuid|null}`. Starts owned private drive or recovers existing active one. At most one active drive/account.
- `POST /drives/{id}/batches`: `{samples:[{sequence,observedAt,latitude,longitude,accuracy,speed?}]}`; 1–500 samples/batch. Unique sequence makes identical retries idempotent. Conflicting coordinates/time for an existing sequence return 409. No ingestion after finish. All sequences and observations are validated; future timestamps beyond 60s rejected.
- `POST /drives/{id}/finish`: retry-safe final summary from stored samples. Client must upload and receive acknowledgement for all queued batches **before** finishing. If network fails, native queue is retained. No background server XP award.
- `GET /drives`: own drive summaries, max 100. No public location history.
- `GET /drives/{id}/samples`: owner-only source samples for export/recomputation.

Distance method: consecutive accepted samples only, ≤30s between observations, both accuracies ≤35m, distance/time ≤70m/s; no jump across nonconsecutive sequences. Ignore displacement below max(3m, half smaller accuracy) to reduce drift. Phone GPS is approximate; no unmeasured distance reconstruction. Version string included in summary. This is not road-matched precision odometry.

## Convoy chat

- `GET /rooms`: current active memberships, max unbounded first version; use only small private groups.
- `POST /rooms`: `{name}`. Creates host membership and random 72-bit invitation code.
- `POST /rooms/join`: `{code}`. Repeated join returns same membership. Invalid/closed/blocked host denied.
- `GET /rooms/{id}/messages?after=<integer>`: current members only, ordered by server sequence; up to 100 per page. Client's first implementation shows the first 100; long-history pagination UI remains deferred.
- `POST /rooms/{id}/messages`: `{body,clientMessageId:<uuid>}`. Unique room/author/client ID prevents retry duplicates.
- `POST /rooms/{id}/leave`: member access revoked immediately; host must end instead.
- `POST /rooms/{id}/end`: host only. Closes room and immediately deletes chat. Future reads/sends return 410 even for previous members. Realtime transport is 4-second polling, an explicit difference from WebSockets in the master brief.

There are no client-controlled entitlements, store transaction endpoints, paid-plan prices, synthetic drivers or operator role grants in this build.
