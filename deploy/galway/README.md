# galway deployment (single-container topology)

Version-controlled mirror of the daax deployment running on the **galway** host.
These are the files that live OUTSIDE this repo on the host; this folder is the
source of truth so the host copies can no longer drift silently behind main
(drift caused the 2026-07-06 terminal outage — every AI coding window failed WS
auth because the host compose predated the F1b #95 secret requirement; full
narrative in `.logs/decisions/deploy-ws-ticket-secret.jsonl`).

| File in this folder  | Lives on galway at              | Notes                                                                                    |
| -------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `docker-compose.yml` | `/opt/daax/docker-compose.yml`  | Committed verbatim (secrets are `${VAR}` references, no values).                         |
| `traefik-daax.yml`   | `/etc/traefik/dynamic/daax.yml` | Committed with `DAAX_PROXY_SECRET_PLACEHOLDER`; substitute the live value when applying. |
| `.env.example`       | `/opt/daax/.env`                | Placeholders only. Live values come from `~/.secrets` on the host.                       |

## Topology

Unlike the split production topology (`deploy/docker-compose.yml`:
`daax` + `daax-terminal` services), galway runs the image's default
single-container mode (web + terminal server in one `daax` container) plus:

- `postgres` — digest-pinned `postgres:18-alpine`, persistent `daax-pg-data`
  volume, `pg_isready` healthcheck (single data engine, #92/#93).
- `migrate` — one-shot `node-pg-migrate` runner; `daax` starts only on
  `service_completed_successfully` (a failed migration blocks the rollout).
- `code-server` — VS Code in browser on 18080.
- Traefik (host systemd service) fronts everything with Pocket ID forward-auth
  and injects `X-Daax-Proxy-Secret` on the main router (F1a #94); the WS route
  authenticates via the single-use bearer ticket instead (F1b #95).

All app ports bind to 127.0.0.1; Traefik is the only ingress.

## Applying changes

1. Edit the file HERE first, PR it to main, then copy to the host location.
2. `/etc/traefik/dynamic/daax.yml`: substitute `DAAX_PROXY_SECRET_PLACEHOLDER`
   with the value of `DAAX_PROXY_SECRET` from `~/.secrets`. Traefik hot-reloads
   the dynamic dir; a malformed file takes down ALL galway sites on the next
   cold start, so validate YAML before copying and check
   `https://traefik.galway.poley.dev/api/http/routers/daax@file` after.
3. Compose changes: `cd /opt/daax && docker compose config --quiet` to
   validate, then `docker compose up -d --no-build postgres migrate daax`.

## Verification (after any change)

```bash
# ticket mint through the proxy-secret path (expect 200)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4200/api/terminal/ticket \
  -H "X-Forwarded-User: test" -H "X-Daax-Proxy-Secret: $DAAX_PROXY_SECRET"
# spoof without the secret (expect 401)
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:4200/api/terminal/ticket \
  -H "X-Forwarded-User: attacker"
# Postgres round-trip
docker exec daax-postgres psql -U daax -d daax -tc 'select count(*) from pgmigrations'
```

## Landmines (all hit on 2026-07-06)

- **Compose env precedence:** process env beats `/opt/daax/.env`. Never export
  the secret variables from shell profiles; `~/.secrets` is the only secret
  store and is sourced explicitly when deploying.
- **`POSTGRES_PASSWORD` is first-init-only:** on an existing `daax-pg-data`
  volume a password change requires
  `docker exec daax-postgres psql -U daax -d daax -c "ALTER USER daax PASSWORD '...'"`.
- **Quoted `.env` values:** compose strips surrounding quotes; keep values
  unquoted so raw-line consumers agree with compose.
- **`~` in compose volume paths does not expand** — always absolute paths
  (`DAAX_WORKSPACE=/home/jpoley/jarvis/`).

## Rollback

Timestamped backups are kept next to each live file
(`/opt/daax/*.bak.YYYYMMDD`, `/etc/traefik/dynamic/daax.yml.bak.YYYYMMDD`);
restore the backup and re-run the apply steps above.
