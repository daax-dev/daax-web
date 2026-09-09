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

| Key                                    | Meaning                                                                                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DAAX_HOSTNAME`                        | short hostname; drives default Traefik route + container `HOSTNAME`                                                                                                  |
| `DAAX_WORKSPACE`                       | absolute host path mounted at `/workspace` (Compose does not expand `~`)                                                                                             |
| `CLAUDE_CONFIG_PATH`                   | absolute path to `.claude.json`                                                                                                                                      |
| `DAAX_NETWORK`                         | external Docker bridge network name (default `daax-net`)                                                                                                             |
| `TERMINAL_WS_URL` / `CODE_SERVER_URL`  | public URLs surfaced to the browser                                                                                                                                  |
| `DAAX_PG_MANAGED`                      | `0` = Postgres runs as a Compose container (default); `1` = external/managed Postgres via `DATABASE_URL` — **not yet supported** (preflight fails closed; see below) |
| `DAAX_DEPLOY_PULL`                     | `0` = build images from local source; `1` = pull published GHCR images                                                                                               |
| `DAAX_DEPLOY_VIA` / `DAAX_DEPLOY_HOST` | provenance stamped onto the F8 Build page                                                                                                                            |
| `DAAX_REQUIRE_AUTH`                    | `1` enforces Pocket ID forward-auth (Traefik)                                                                                                                        |
| `DAAX_REQUIRED_SECRETS`                | space-separated NAMES of env vars that must be present (fail-closed)                                                                                                 |
| `AGENTVIEW_DAEMON_URL`                 | optional; where the Agent View proxy reaches the dist-agent daemon (default `http://host.docker.internal:7717` in containers, `http://127.0.0.1:7717` on a host)     |

## Postgres: local (default) vs managed

- **Compose-local (default, zero lock-in):** `DAAX_PG_MANAGED=0`. Postgres runs as
  a container with a persistent named volume. The required secret is
  `DAAX_PG_PASSWORD`; Compose derives `DATABASE_URL`.
- **Managed (RDS / Cloud SQL / Neon / Azure):** **NOT YET SUPPORTED.**
  `deploy.sh` fails closed in preflight when `DAAX_PG_MANAGED=1`:
  `deploy/docker-compose.yml` hardcodes `DATABASE_URL` to the compose-local
  `postgres` for both the `migrate` and `daax` services, so an
  operator-exported managed `DATABASE_URL` never reaches a container — the app
  would silently use compose-local Postgres. Wiring the connection-string swap
  through compose (and dropping the local `postgres` coupling) is a documented
  follow-up (see `deploy/iac/cloud/README.md`).

## Network exposure (Tailscale ACL + optional Traefik IP allow-list)

Ingress is controlled at the network layer, not by these files:

- **Tailscale ACLs** gate who can reach the tailnet host/ports at all. Restrict
  `daax`'s ports to trusted tags/users in your tailnet policy.
- **Traefik IP allow-list (optional):** add an `ipAllowList` middleware to the
  router chain in `deploy/traefik-daax.yml.tpl` to further restrict source IPs on
  top of Pocket ID forward-auth. See the daax deployment section of `CLAUDE.md`.

## Agent View break-in (ADR 0026)

The server reads these at request time (no `NEXT_PUBLIC_` equivalents):

| Variable                              | Value                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTVIEW_DAEMON_PROXY_SECRET_FILE`  | Path to the daemon proxy proof secret, a readable regular file with no group/other permissions (`0600` or `0400`). Read anew for each signal, so replacement rotates without restart. Never put the secret value in an environment variable. |
| `AGENTVIEW_DAEMON_PROXY_PROOF_HEADER` | Proof header name; default `X-Dist-Agent-Proxy`. Match the daemon's `--trusted-proxy-proof-header`.                                                                                                                                          |
| `AGENTVIEW_DAEMON_IDENTITY_HEADER`    | Subject header name; default `X-Auth-Request-User`. Match the daemon's `--trusted-identity-header`.                                                                                                                                          |

A signal requires a verified Pocket ID subject through daax's existing forward-auth
configuration. The local-operator bypass has no subject and receives 403. Only the
signal POST asserts identity; all GETs remain Accept-only and raw payloads remain
excluded. The daemon must admit that subject and the proof secret. The incoming
forwarded subject must carry a matching `X-Daax-Proxy-Secret` proof against
`DAAX_PROXY_SECRET` (or its configured rotation value); legacy host-dev identity
admission alone is insufficient for daax to vouch for a name. The signal handler
requires JSON and rejects cross-site fetch metadata even when `DAAX_API_GUARD`
is disabled.

In host mode set the file path in the app's environment. In Docker, mount the file
read-only into the **web** service and set the path there; its owner/permissions
must allow the image's `node` user to read it. Do not COPY the secret into the image.
Header names and file paths are runtime settings, so no Dockerfile ARG is needed.
Resume is unavailable whenever `HOST_WORKSPACE_PATH` is set; a container shell
cannot resume an observed host session at its host cwd. Host resume uses the existing
terminal's workspace confinement and shows any policy refusal from that server.
