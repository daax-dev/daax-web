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

| Key                                    | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DAAX_HOSTNAME`                        | short hostname; drives default Traefik route + container `HOSTNAME`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DAAX_WORKSPACE`                       | absolute host path mounted at `/workspace` (Compose does not expand `~`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `CLAUDE_CONFIG_PATH`                   | absolute path to `.claude.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `DAAX_NETWORK`                         | external Docker bridge network name (default `daax-net`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `TERMINAL_WS_URL` / `CODE_SERVER_URL`  | public URLs surfaced to the browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `DAAX_PG_MANAGED`                      | `0` = Postgres runs as a Compose container (default); `1` = external/managed Postgres via `DATABASE_URL` — **not yet supported** (preflight fails closed; see below)                                                                                                                                                                                                                                                                                                                                                                                  |
| `DAAX_DEPLOY_PULL`                     | `0` = build images from local source; `1` = pull published GHCR images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DAAX_DEPLOY_VIA` / `DAAX_DEPLOY_HOST` | provenance stamped onto the F8 Build page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DAAX_REQUIRE_AUTH`                    | `1` enforces Pocket ID forward-auth (Traefik)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `DAAX_REQUIRED_SECRETS`                | space-separated NAMES of env vars that must be present (fail-closed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `AGENTVIEW_DAEMON_URL`                 | optional; where the Agent View proxy reaches the dist-agent daemon (default `http://host.docker.internal:7717` in containers, `http://127.0.0.1:7717` on a host). Fleet targets: `https://agents.<host>.poley.dev` (agentd on the tailnet)                                                                                                                                                                                                                                                                                                            |
| `AGENTVIEW_DAEMON_TOKEN_FILE`          | optional; the bearer session sent to an **https** daemon on reads, read per request (mode 0600/0400). Fleet: `/run/agentview/token`, a read-only `peer` session minted by `deploy/host/agentview-token-renew.sh`                                                                                                                                                                                                                                                                                                                                      |
| `AGENTVIEW_TOKEN_HOST_DIR`             | optional; host directory bind-mounted read-only at `/run/agentview`. Set together with an https `AGENTVIEW_DAEMON_URL` and `AGENTVIEW_DAEMON_TOKEN_FILE`; preflight refuses a partial set, a missing directory or token, and any owner other than uid 1000 (the image's `node`) or a mode other than 0600/0400. Install with `deploy/host/install-agentview-token.sh`                                                                                                                                                                                 |
| `AGENTD_PROXY_SECRET_HOST_FILE`        | optional; host path of agentd's proxy proof secret (the file agentd reads through `--trusted-proxy-secret-file`, fleet: `/home/jpoley/.dist-agent/proxy.secret`), bind-mounted read-only at `/run/secrets/agentd-proxy`. Set together with `AGENTVIEW_DAEMON_PROXY_SECRET_FILE=/run/secrets/agentd-proxy`; preflight refuses a partial pair, a missing file, a symlink, any owner other than uid 1000 or a mode other than 0600/0400, and a file that is not one non-empty line. Unset, `/dev/null` is mounted and Interrupt answers its existing 503 |
| `DAAX_PG_HOST_PORT`                    | optional; loopback port `daax-postgres` is published on (default `5433`, bound to `127.0.0.1` only) so the host-mode daax (below) can keep its own `daax_host` database in the same server                                                                                                                                                                                                                                                                                                                                                            |

## The boot starter on galway (`/opt/daax`)

galway still has the pre-fleet `/etc/systemd/system/daax.service` (root,
enabled): at boot it runs `docker compose up -d daax --no-build
--remove-orphans` in `/opt/daax` with `EnvironmentFile=/opt/daax/.env`, and
`/opt/daax/docker-compose.yml` is a one-line `include:` of this compose file —
the same compose project, so it recreates the stack from whatever that `.env`
holds. It held a hand-written subset (no `DAAX_IMAGE`, no `AGENTVIEW_*`), so
every reboot put galway on `:latest` with Agent View broken.

After a deploy passes its health check, `scripts/deploy.sh` rewrites
`/opt/daax/.env` with every variable the compose file interpolates, as that
deploy exported it (build-stamp variables excluded), 0600, values single-quoted
so systemd and compose read them identically, and prints only the path and a
count. It is written only when the pointer names **this checkout's**
`deploy/docker-compose.yml`; any other `/opt/daax` is left untouched and said
so, a missing `/opt/daax` is a no-op, an identical file is not rewritten, and a
failed deploy leaves it as it was. The unit itself needs sudo to change and is
not touched. `DAAX_BOOT_STARTER_DIR` overrides the path (tests).

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

## Extra allowed origins (`DAAX_EXTRA_ALLOWED_ORIGINS`)

The CSRF check on mutating `/api` requests and the terminal WebSocket upgrade
both admit only localhost, `*.localhost`, Tailscale IPs and
`https://daax.<host>.poley.dev`, so a daax served under any other name (e.g. a
second, host-mode instance at `https://daax-host.chamonix.poley.dev`) has every
write and terminal refused. `DAAX_EXTRA_ALLOWED_ORIGINS` is a comma-separated
list of **exact** extra origins, read by `server/config/origin-allowlist.ts` —
the one decision point both planes call. Each entry must be a bare `https://`
origin (optional port; no path, trailing slash, query, wildcard or credentials);
the host is lowercased, a default `:443` dropped, and anything else URL parsing
would tidy (a backslash, a tab, empty userinfo, a non-punycode host) is
refused. Matching is exact string equality, so subdomains, suffixes, `http://`
and other ports stay refused. An invalid entry makes the process log the entry
and exit 1 at boot (Next via `instrumentation.ts`, the terminal server via
`server/terminal-server.ts`) rather than producing silent 403s. Unset or empty
keeps the built-in list unchanged. Rewriting `Origin` at the proxy instead would
defeat the check for every caller.

**Both processes need it.** `bun start` is `next start` only; the terminal
server (`start:terminal`, or the second half of `start:prod` / `bun dev`) is a
separate process and, without the variable, refuses every terminal upgrade from
the declared origin (close code 1008). The compose files do not pass it through
yet: set it in the environment of both host-mode processes, or add it to the
`daax` and `terminal` service environments.

## Agent View break-in (ADR 0026)

The server reads these at request time (no `NEXT_PUBLIC_` equivalents):

| Variable                              | Value                                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTVIEW_DAEMON_PROXY_SECRET_FILE`  | Path to the daemon proxy proof secret, a readable regular file with no group/other permissions (`0600` or `0400`). Read anew for each signal, so replacement rotates without restart. Never put the secret value in an environment variable. |
| `AGENTVIEW_DAEMON_PROXY_PROOF_HEADER` | Proof header name; default `X-Dist-Agent-Proxy`. Match the daemon's `--trusted-proxy-proof-header`.                                                                                                                                          |
| `AGENTVIEW_DAEMON_IDENTITY_HEADER`    | Subject header name; default `X-Auth-Request-User`. Match the daemon's `--trusted-identity-header`.                                                                                                                                          |

A signal requires a verified Pocket ID subject through daax's existing forward-auth
configuration. The local-operator bypass has no subject and receives 403. Only the
signal POST asserts identity; GETs forward only `Accept`, plus the configured read-only
peer bearer when the daemon is reached over https, and raw payloads remain
excluded. The daemon must admit that subject and the proof secret. The incoming
forwarded subject must carry a matching `X-Daax-Proxy-Secret` proof against
`DAAX_PROXY_SECRET` (or its configured rotation value); legacy host-dev identity
admission alone is insufficient for daax to vouch for a name. The signal handler
requires JSON and rejects cross-site fetch metadata even when `DAAX_API_GUARD`
is disabled.

In host mode set the file path in the app's environment. In Docker, mount the file
read-only into the **web** service and set the path there; its owner/permissions
must allow the image's `node` user to read it. Do not COPY the secret into the image.
The fleet compose file does this through `AGENTD_PROXY_SECRET_HOST_FILE` (Keys,
above): a single-file bind, so a secret replaced by rename reaches the container at
its next recreate rather than its next signal.
Header names and file paths are runtime settings, so no Dockerfile ARG is needed.
Resume is unavailable whenever `HOST_WORKSPACE_PATH` is set; a container shell
cannot resume an observed host session at its host cwd. Host resume uses the existing
terminal's workspace confinement and shows any policy refusal from that server.

Break-in states are observations. After a signal, the baseline pid disappearing
from the row or a later `PROCESS_EXITED` event for that agent yields
`interrupted (observed)` and names the pid. An exit event supplies the exit's age;
a row without an exit timestamp labels the signal's age separately, without
inventing the time of the process exit.
This applies to Claude, Codex and Gemini. The Claude transcript interrupt marker
is an additional reading for keyboard interrupts. A new live pid for the same
session, started after the action, takes precedence as `resumed here (observed)`.
A still-live Codex or Gemini process retains the vendor's no-interrupt-record
explanation. `sent` remains a separate acknowledgment beside the event id.

## Host-mode daax on a fleet host (Agent View Resume)

Resume is unavailable in the fleet's container daax (above). Each Linux fleet
host can run a second, **host-mode** daax whose terminal is a shell on the host,
as the operator: `deploy/host/daax-host.sh` with the `systemd --user` unit
`deploy/host/daax-host.service`. That is the privilege it grants — a
browser-reachable shell as the operator — and the script's header states it.
It is served only at `https://daax-host.<host>.poley.dev`, through the same
`strip-forwarded-headers` → `pocket-id-auth` (→ `inject-proxy-secret` on HTTP)
chains as `daax.<host>` (`deploy/traefik-daax.yml.tpl`, routers `daax-host` and
`daax-host-ws`), and both of its listeners bind `127.0.0.1`.

| Setting                      | Value                                                                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout                     | `DAAX_HOST_CHECKOUT`, default `~/.daax-build/daax-host`: a detached worktree at `origin/main`, rebuilt from an empty `node_modules` by `build` (node-pty is compiled with `npm rebuild`) |
| Ports                        | `DAAX_HOST_WEB_PORT` / `DAAX_HOST_WS_PORT`, default `4210` / `4211` (4200/4201 are the containers); the Traefik services name these two                                                  |
| Secrets                      | `DAAX_PROXY_SECRET`, `DAAX_WS_TOKEN_SECRET`, `DAAX_PG_PASSWORD`, **parsed** from `~/.secrets` (`DAAX_SECRETS_FILE`) and never sourced; a value that needs a shell to evaluate is refused |
| From `deploy/env/<host>.env` | `DAAX_ADMIN_USERS`, `DAAX_PG_USER`, `DAAX_PG_HOST_PORT`                                                                                                                                  |
| Database                     | its own `daax_host` database in `daax-postgres`, created if missing and migrated on each start, reached on `127.0.0.1:${DAAX_PG_HOST_PORT:-5433}`                                        |
| Agent View                   | `AGENTVIEW_DAEMON_URL=http://127.0.0.1:7717`, `AGENTVIEW_DAEMON_PROXY_SECRET_FILE=~/.dist-agent/proxy.secret`                                                                            |
| Deliberately unset           | `HOST_WORKSPACE_PATH`, `DAAX_TRUST_LOCAL_OPERATOR`, `HOST`, `DAAX_AUTH_*_HEADER` (the fleet's forward-auth sends `X-Forwarded-*`, daax's default)                                        |

The unit's `PATH` starts with `~/.local/bin`, so the native `claude` is the one a
resumed session runs. Install on a host, as the operator (needs `bun`: `curl -fsSL
https://bun.sh/install | bash`; `node` 22, `make`, `g++` and `python3`):

```bash
deploy/host/daax-host.sh build            # worktree + install + build
deploy/host/daax-host.sh install          # ~/.local/bin/daax-host + unit, enable --now
journalctl --user -u daax-host -f
```

`build` stops a running unit, rebuilds and starts it again. The routes arrive
with the next `deploy-local.sh install-traefik-config` render.
