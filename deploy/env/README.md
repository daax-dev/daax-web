# deploy/env — per-target deploy configuration (brain2daax F9, #104)

`scripts/deploy.sh <target>` selects a target purely by **config**: it sources
`deploy/env/<target>.env`. Adding a new target is adding a file here — the
deploy script never changes.

## The one rule: secrets are NEVER stored in these files

Env files hold **non-secret configuration only** (hostname, workspace path,
URLs, network name, Postgres topology). Where a secret is required, the env file
lists its **variable NAME** in `DAAX_REQUIRED_SECRETS` — never its value.

Secret **values** come from the process environment at deploy time — a secret
store, `source ~/.secrets`, CI secret injection, etc. `deploy.sh` fails closed in
the preflight phase if any name in `DAAX_REQUIRED_SECRETS` is unset or empty.

```bash
# on the target VM:
source ~/.secrets          # exports DAAX_WS_TOKEN_SECRET, DAAX_PROXY_SECRET, …
scripts/deploy.sh kinsale
```

Because env files carry no secrets, they are safe to commit.

## Keys

| Key | Meaning |
|-----|---------|
| `DAAX_HOSTNAME` | short hostname; drives default Traefik route + container `HOSTNAME` |
| `DAAX_WORKSPACE` | absolute host path mounted at `/workspace` (Compose does not expand `~`) |
| `CLAUDE_CONFIG_PATH` | absolute path to `.claude.json` |
| `DAAX_NETWORK` | external Docker bridge network name (default `daax-net`) |
| `TERMINAL_WS_URL` / `CODE_SERVER_URL` | public URLs surfaced to the browser |
| `DAAX_PG_MANAGED` | `0` = Postgres runs as a Compose container (default); `1` = external/managed Postgres via `DATABASE_URL` |
| `DAAX_DEPLOY_PULL` | `0` = build images from local source; `1` = pull published GHCR images |
| `DAAX_DEPLOY_VIA` / `DAAX_DEPLOY_HOST` | provenance stamped onto the F8 Build page |
| `DAAX_REQUIRE_AUTH` | `1` enforces Pocket ID forward-auth (Traefik) |
| `DAAX_REQUIRED_SECRETS` | space-separated NAMES of env vars that must be present (fail-closed) |

## Postgres: local (default) vs managed

- **Compose-local (default, zero lock-in):** `DAAX_PG_MANAGED=0`. Postgres runs as
  a container with a persistent named volume. The required secret is
  `DAAX_PG_PASSWORD`; Compose derives `DATABASE_URL`.
- **Managed (RDS / Cloud SQL / Neon / Azure):** `DAAX_PG_MANAGED=1` and export
  `DATABASE_URL` (a secret — it embeds the password) instead of `DAAX_PG_PASSWORD`.
  Preflight TCP-checks the managed host and fails closed if unreachable. Removing
  the local Postgres container from the Compose stack for a fully-managed cloud
  deploy is a documented follow-up (see `deploy/iac/cloud/README.md`); the
  connection-string swap itself is supported today.

## Network exposure (Tailscale ACL + optional Traefik IP allow-list)

Ingress is controlled at the network layer, not by these files:

- **Tailscale ACLs** gate who can reach the tailnet host/ports at all. Restrict
  `daax`'s ports to trusted tags/users in your tailnet policy.
- **Traefik IP allow-list (optional):** add an `ipAllowList` middleware to the
  router chain in `deploy/traefik-daax.yml.tpl` to further restrict source IPs on
  top of Pocket ID forward-auth. See the daax deployment section of `CLAUDE.md`.
