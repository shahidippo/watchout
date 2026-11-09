# Run Watchout with a real backend

You do not need someone else's private backend. Watchout owns its accounts, garage, posts, events, chats and drive database. These records start empty and become real through authenticated user actions. Government roads and licensed aircraft are separate upstream integrations.

## Fast local phone test

1. Install Node 24.10+ on a computer, then `npm ci`, `npm run build`, `npm run dev` in this repository.
2. Confirm the API's `/v1/health` endpoint locally.
3. Connect the phone and computer to the same Wi-Fi. Discover your computer's LAN IP using its network settings.
4. Install the debug APK. Set its backend address to `http://<computer-LAN-IP>:3000` and tap Save & test connection.
5. Register two separate accounts on separate clients, add a private vehicle, post a story, host a meet, join a convoy by code. Data survives server restarts in `data/watchout.sqlite`.
6. Keep port 3000 restricted to the local network. Do not send credentials over public HTTP.

No port forwarding or paid hosting account was configured during this task. Local cloud services are not a permanent public endpoint for your phone.

## Public HTTPS deployment

Requires your own Linux server with Docker + Compose, a domain pointing at its public address and inbound ports 80/443. A domain/server account is not provisioned by the repository. Start with one API instance and a persistent local SSD volume; SQLite is intentional for this first implementation. Do not run several API replicas against a shared network filesystem.

Copy the source tree to the server. From the repository:

```sh
export WATCHOUT_DOMAIN=your.actual.domain
# Optional: after provider setup and rights review, securely set TFNSW_API_KEY.
docker compose -f deploy/compose.yml up -d --build
```

`WATCHOUT_DOMAIN` must be a real DNS name you control. Caddy obtains and renews its TLS certificate. The API is private to the Compose network, not exposed on port 3000. The Caddy and database volumes persist across container recreation. Confirm `https://<domain>/v1/health` returns `ok:true`, then set that HTTPS origin in the APK's Settings. Browser and Android share the same API. Public deployment must satisfy provider licences, security review and moderation needs before accepting community users.

The Compose stack has not been tested on a public domain or with ACME certificates in this task. The API container was tested separately; see EVIDENCE.md. If building behind an enterprise/cloud TLS inspection proxy, supply its public CA using the Dockerfile's optional `proxy_ca` BuildKit secret; keep TLS verification enabled. Do not bake session credentials into an image.

Runtime variables:

| Variable | Use |
|---|---|
| `PUBLIC_ORIGIN` | Exact HTTPS browser origin, automatically set from domain in Compose. Production refuses to start without HTTPS. |
| `DATABASE_PATH` | Persistent SQLite file; `/data/watchout.sqlite` in container. |
| `SYNC_SOURCES` | Default `false`. Set `true` only after provider configuration and regional rights verification. |
| `NSW_CAMERA_RIGHTS_CONFIRMED` | Set `true` only after actually reviewing the agency licence. Required for production fixed-camera import. Pass via your server environment after review. |
| `TFNSW_API_KEY` | Server-side Transport for NSW Open Data credential, never in the APK. |
| `PROVIDER_USER_AGENT` | Application identification with a real support contact. |
| `GEOCODER_URL`, `ROUTER_URL` | Origins for production capacity you operate or are licensed to use. Public defaults are for limited development, not launch scale. |

Secrets go in the server's protected environment/secrets manager. Do not commit `.env`. The FR24 adapter and Google billing are not shipped; supplying an arbitrary key does not activate those features.

## GPS recording on a real phone

While the app is open, tap Start a private drive. Grant precise location. Android displays the location foreground-service notification when notifications are allowed. No always-on/background-location permission is requested. Recording must start while the activity is visible. The service stores observed time, coordinates, accuracy and speed in the app's private SQLite queue. It does not publish them to other users.

The recording notification can stop GPS. Reopen Watchout and use Sync & finish to upload queued samples and compute the summary. On a failed upload, the native queue remains; do not uninstall or clear app data until sync completes. A service killed by Android does not silently restart; the saved drive can be finished from the app. Distance is not filled across missing fixes. Keep screen-off, location-disabled, force-stop, battery-saver, offline and restart behaviour in the physical-device acceptance checklist; these have not been verified on a phone.

Browser recording is foreground-only and held in memory until finish. Use the APK for durable capture. Full voice navigation and Android Auto are not in this build.

## Backups and restore

Schema migration 1 is in `server/schema.sql` and is applied idempotently at startup. The migrations table records the version. Future schema changes need explicit new migrations, not destructive table resets.

On a noncontainer host:

```sh
node scripts/backup.mjs /secure/existing/directory/watchout-backup.sqlite
```

This uses SQLite `VACUUM INTO` for a consistent backup and checks integrity. The destination must not already exist. The script does not encrypt or upload the file. Store backups encrypted in access-controlled storage, retain at most 30 days according to the initial policy and track deletion obligations. Do not blindly copy a live WAL database file without a proper SQLite backup.

Restore to a **separate temporary directory first**, set `DATABASE_PATH` to the restored file, start on a different port, then verify health and an expected known account/content record. Stop the affected service before replacing its database. Keep the old file as a protected rollback copy; never overwrite the only backup. A backup/restore test was run with a synthetic account in a temporary test DB, not with private customer data.

In Compose, the named `watchout-data` volume contains the DB. The image includes `scripts/backup.mjs`; run it via `docker compose -f deploy/compose.yml exec api node scripts/backup.mjs /data/backup-<unique-date>.sqlite`, then securely copy the backup out of the volume. Automating encrypted offsite backup, retention and restore alerts remains an operator responsibility.

## Rollback and launch boundary

Keep the previous image tag/digest and its matching DB backup. Stop writes before a migration rollback. Restore a matching database into an isolated volume and verify it before swapping services. This build has only schema version 1.

Before inviting the public: provision production tile/search/routing capacity, verify road dataset rights/live observations, implement account recovery/verification and moderation, configure signed release distribution and test the APK on physical Android devices. The complete Apple-focused feature list in the supplied brief is not a launch checklist this first APK has passed.
