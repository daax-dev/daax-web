# deploy/galway — ARCHIVED

**Archived 2026-09-13. Nothing in this directory is applied to galway, and
nothing here should be.**

galway is deployed exactly like every other fleet host:

```bash
set -a; source ~/.secrets; set +a
scripts/deploy.sh galway          # deploy/env/galway.env + deploy/docker-compose.yml
```

and, for the whole fleet at once, from chamonix: dx `scripts/deploy-fleet.sh`.
Rollback is `scripts/deploy.sh`'s own (fail-closed, per phase).

## What this directory is

A record of the single-container topology galway ran before the fleet
converged on the split deploy (`daax` + `daax-terminal`): the host's former
`/opt/daax/docker-compose.yml`, its former `/etc/traefik/dynamic/daax.yml`
(with `DAAX_PROXY_SECRET_PLACEHOLDER`), and an `.env` of placeholders. They are
kept so the history of the 2026-07-06 terminal outage — host compose drifted
behind main and predated the F1b #95 secret requirement — stays readable; full
narrative in `.logs/decisions/deploy-ws-ticket-secret.jsonl`.

Copying these files onto galway would put it back on the topology the fleet
moved off. There is deliberately no apply or rollback procedure here.

## Lessons that still apply to every host

- **Compose env precedence:** process env beats a `.env` file. Never export the
  secret variables from shell profiles; `~/.secrets` is the only secret store
  and is sourced explicitly when deploying.
- **`POSTGRES_PASSWORD` is first-init-only:** on an existing `daax-pg-data`
  volume a password change requires `ALTER USER daax PASSWORD '...'` inside the
  database.
- **`~` in compose volume paths does not expand** — always absolute paths
  (galway's workspace is `/home/jpoley/jarvis`).
