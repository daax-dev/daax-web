# Operational resilience — backup, restore, and secret rotation

Runbook for daax-web's stateful data (Postgres) and shared secrets. Covers the
operational-resilience gates in [`brain2daax.md` §4](./brain2daax.md): scheduled
backup, a documented restore + restore drill, zero-outage secret rotation, and
the migration-rollback / pre-deploy snapshot policy.

Postgres is daax-web's single data engine. The RBAC/identity/audit tables
(Phase 3) are the only stateful, hard-to-recreate data — losing them loses every
grant and the audit trail — so backups are load-bearing, not optional.

---

## 1. Data persistence (verify)

The Postgres data volume is a **persistent named volume in both deploy modes**:

| File | Service | Volume mount | Named volume |
| --- | --- | --- | --- |
| `docker-compose.yml` (local) | `postgres` | `daax-pg-data:/var/lib/postgresql` | `daax-pg-data` (`driver: local`) |
| `deploy/docker-compose.yml` (prod) | `postgres` | `daax-pg-data:/var/lib/postgresql` | `daax-pg-data` (`driver: local`) |

The data survives `docker compose restart` / `down`. An **ephemeral** DB
container (no named volume) would lose all RBAC state on restart — that is the
failure this guards against. Backups additionally protect against volume loss,
corruption, and operator error (a `down -v` wipes the named volume too).

Backup dumps live in a second persistent volume, `daax-pg-backups`, present in
both compose files.

---

## 2. Connection configuration

Both scripts and the compose backup service resolve their connection exactly
like the app (`lib/db/config.ts`), so there is one connection contract:

1. `DATABASE_URL` (libpq URI, preferred) — e.g. `postgres://daax:pw@127.0.0.1:5432/daax?sslmode=require`
2. discrete libpq vars: `PGHOST`, `PGDATABASE`, `PGUSER` (+ optional `PGPORT`, `PGPASSWORD`)

Fail-closed: with neither present the scripts exit non-zero rather than dumping a
default/localhost DB. Never commit a connection string with a live password.

**Client version:** `pg_dump`/`pg_restore` must be **>= the server major
version** — `pg_dump` refuses a newer server (e.g. a v16 client against the v18
server fails: `server version 18.x; pg_dump version 16.x`). The compose
`pg-backup` service avoids this by running the **same pinned `postgres:18-alpine`
image** as the server. For host cron, install postgresql client tools matching
the server major (currently 18).

---

## 3. Backup

### Host / cron (`scripts/pg-backup.sh`)

```bash
export DATABASE_URL="postgres://daax:pw@127.0.0.1:5432/daax"
DAAX_BACKUP_DIR=/var/backups/daax scripts/pg-backup.sh
```

Produces `daax-<UTC-timestamp>.dump` (pg_dump custom format, `-Fc`). Writes to a
`.partial` file and atomically renames on success, so a crash or full disk never
leaves a truncated file that looks like a good backup. Prunes dumps older than
`DAAX_BACKUP_RETENTION_DAYS` (default 14; `0` disables pruning). Prints the dump
path on stdout.

Example cron (daily 03:00):

```cron
0 3 * * * DATABASE_URL='postgres://daax:pw@127.0.0.1:5432/daax' DAAX_BACKUP_DIR=/var/backups/daax /path/to/daax-web/scripts/pg-backup.sh >> /var/log/daax-pg-backup.log 2>&1
```

### Compose (`pg-backup` service)

A `pg-backup` service (profile `backup`, so a plain `docker compose up` is
unaffected) runs `pg_dump` once into the `daax-pg-backups` volume using the same
pinned Postgres image as the server:

```bash
docker compose --profile backup run --rm pg-backup
```

Drive it from host cron (per environment) for a schedule. `DAAX_PG_PASSWORD`
must be set (same value the `postgres` service uses).

---

## 4. Restore (`scripts/pg-restore.sh`)

**Destructive** to the target database — it drops and recreates the objects in
the dump (`pg_restore --clean --if-exists`). It refuses to run without an
explicit confirmation (type `restore`, or set `DAAX_RESTORE_YES=1` / `--force`).

```bash
export DATABASE_URL="postgres://daax:pw@127.0.0.1:5432/daax"

# Restore a specific dump (interactive confirm):
scripts/pg-restore.sh /var/backups/daax/daax-20260705T030000Z.dump

# Restore the newest dump in DAAX_BACKUP_DIR, non-interactive:
DAAX_BACKUP_DIR=/var/backups/daax DAAX_RESTORE_YES=1 scripts/pg-restore.sh --latest
```

Restore into a **fresh/idle** database with the app stopped (`docker compose stop
daax` or scale to 0) so no writer races the restore. `pg_restore` runs with
`--exit-on-error`; a non-zero exit means a partial restore — investigate before
serving traffic.

Restoring a dump from the compose `daax-pg-backups` volume: copy it out first
(`docker run --rm -v daax-pg-backups:/b -v "$PWD":/out alpine cp /b/<file> /out/`)
or run the script from inside a container attached to `daax-net` with the volume
mounted.

---

## 5. Restore drill (do this on a schedule)

Prove backups are restorable — an unverified backup is not a backup. Run against
a **throwaway** Postgres, never production:

```bash
# 1. Take a fresh backup of the source DB.
export DATABASE_URL="postgres://daax:pw@127.0.0.1:5432/daax"
DUMP=$(DAAX_BACKUP_DIR=/tmp/drill scripts/pg-backup.sh)

# 2. Spin a throwaway target and restore into it.
docker run -d --name daax-drill -e POSTGRES_USER=daax -e POSTGRES_PASSWORD=pw \
  -e POSTGRES_DB=daax -p 127.0.0.1:55432:5432 postgres:18-alpine
sleep 5
DATABASE_URL="postgres://daax:pw@127.0.0.1:55432/daax" DAAX_RESTORE_YES=1 \
  scripts/pg-restore.sh "$DUMP"

# 3. Verify: row counts / spot-checks match the source, then tear down.
docker exec daax-drill psql -U daax -d daax -c "\dt"
docker rm -f daax-drill
```

Record the drill date and outcome in `.logs/decisions/`. Cadence: at least
quarterly, and after any schema-changing release.

---

## 6. Pre-deploy snapshot + migration rollback

Every migration in `migrations/` ships a tested `down` (reversible up/down;
verified by the up→down→up round-trip in `tests/integration/pg-migrate.test.ts`,
run via `bun run test:integration`). The compose `migrate` service gates the
app rollout on migrations succeeding (fail-closed).

Take a `pg_dump` snapshot **before** applying pending migrations so a bad
migration restores cleanly even if its `down` cannot fully recover data:

```bash
scripts/pg-backup.sh                # snapshot first
bun run db:migrate                  # then apply (or `docker compose up migrate`)
# on a bad migration:
bun run db:migrate:down             # reversible step, or
scripts/pg-restore.sh --latest      # restore the pre-deploy snapshot
```

---

## 7. Secret rotation with no outage

The app accepts **two** values for each shared secret during rollout — a match
against either passes (constant-time compare), so the secret rotates without an
auth/terminal outage. When `*_PREVIOUS` is unset, verification is current-only
(no weakening).

### `DAAX_PROXY_SECRET` (HTTP forward-auth trust boundary — `lib/auth-trust.ts`)

1. Set `DAAX_PROXY_SECRET` = new value, `DAAX_PROXY_SECRET_PREVIOUS` = old value.
2. Deploy the app (both are now accepted).
3. Update the Traefik `inject-proxy-secret` middleware to inject the **new** value.
4. Once Traefik injects the new value everywhere, drop `DAAX_PROXY_SECRET_PREVIOUS` and redeploy.

### `DAAX_WS_TOKEN_SECRET` (terminal WS bearer ticket — `lib/ws-ticket.ts`)

1. Set `DAAX_WS_TOKEN_SECRET` = new value, `DAAX_WS_TOKEN_SECRET_PREVIOUS` = old value.
2. Deploy. Minting always uses the **new** secret; tickets already minted under
   the old one still verify while `_PREVIOUS` is set.
3. Tickets are short-TTL (`WS_TICKET_TTL_MS`); after that window all in-flight
   old-secret tickets have expired.
4. Drop `DAAX_WS_TOKEN_SECRET_PREVIOUS` and redeploy.

The rotation window for the WS secret only needs to exceed the ticket TTL. The
proxy-secret window must span the app deploy + Traefik template update.

### Postgres credentials

Rotate via the standard role-password change + connection-string secret update:
`ALTER ROLE daax WITH PASSWORD '<new>';` then update `DAAX_PG_PASSWORD` /
`DATABASE_URL` and redeploy. Pooled connections re-established after the redeploy
use the new password.

---

## 8. Deferred — `reconcileRoles --dry-run` (#101)

The reconcile dry-run report mode (`brain2daax.md` §4, "Reconcile dry-run")
depends on the RBAC reconcile machinery introduced with **#101** (users/roles +
`reconcileRoles`), which is not yet merged. It is intentionally **not**
implemented here to avoid colliding with that branch; it lands with #101. When
added, it emits the diff it *would* apply (grants to add, `reconcile`-grants to
prune, unmatched allow-list entries) as structured JSON to stdout/`.logs`
without writing, and never prunes UI grants (`granted_by != 'reconcile'`).
