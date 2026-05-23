# One-Daemon Consolidation Plan

**Goal:** Exactly one docker daemon on `galway` (the native `docker-ce` daemon at `/run/docker.sock`). Snap docker removed. All services healthy on native.

**Status:** DRAFT — awaiting user approval and one more data pull before any action.

---

## Current state (observed 2026-04-24)

### Daemons
| Daemon  | Service                        | Status | Socket                         |
|---------|--------------------------------|--------|--------------------------------|
| native  | `docker.service`               | active | `/run/docker.sock`             |
| snap    | `snap.docker.dockerd.service`  | active | inside its mount namespace     |

Both services are `enabled` (start at boot). The default `docker` CLI on your `$PATH` is `/usr/bin/docker` → native. `/snap/bin/docker` is also present but only used if called by full path. `DOCKER_HOST` is unset in your shell.

### Native daemon (19 containers, 6 running)
Running and load-bearing:
- `buildx_buildkit_daax-multiplatform0` — buildx driver for daax image
- `ironclaw-pg` → **127.0.0.1:5433** → pg
- `learn-gateway-landing-1` → **127.0.0.1:5560**
- `learn-gateway-systems-designer-1`
- `learn-gateway-code-reviewer-1`
- `code-reviewer-web-1`

Dead / cruft (candidate for removal):
- `daax` (Created, never started, id `68192dfa3e17`) — leftover from the blocked deploy
- `vibrant_buck` (Created)
- `daax-code-server` (Exited 2mo ago)
- `falcondev` (Exited 3mo ago)
- `agent-updates-test` (Exited 4mo ago)
- `act-CI-lint-*` (Exited 4mo ago)
- `backstack-demo-control-plane` (Exited 2mo ago)
- `learn-gateway-runner-typescript-1` / `-go-1` / `-python-1` (Exited 137, 2mo)
- `code-reviewer-runner-typescript-1` / `-go-1` / `-python-1` (Exited 137, 2mo)

### Snap daemon (6 running containers — ALL duplicates of native by name)
- `buildx_buildkit_daax-multiplatform0`
- `ironclaw-pg` — thinks it owns 5433 but lost to native; its proxy ended up on 5434
- `learn-gateway-landing-1` — lost 5560 to native (no snap proxy for 5560)
- `learn-gateway-systems-designer-1`
- `learn-gateway-code-reviewer-1`
- `code-reviewer-web-1`

### Orphan docker-proxy processes on snap (no matching running container in `ps`)
These are what's blocking the daax deploy today:
- `0.0.0.0:1411`, `0.0.0.0:4181` → `172.26.0.2:1411` (looks like Authelia — port 4181 is Authelia's default)
- `127.0.0.1:4200`, `127.0.0.1:4201` → `172.21.0.2` (old daax)
- `127.0.0.1:5555`, `:5556`, `:5562`, `:5563` → `172.27.0.{2-5}` (MCP servers?)
- `127.0.0.1:8093` → `172.28.0.2:80` (static site?)

**Open question #1 — need `docker ps -a` from snap to confirm whether these are stopped containers or truly leaked proxies.** (Command to run is at the bottom of this doc.)

### Native volumes (selected)
- `daax_daax-data`, `daax_devtools-config`, `daax_devtools-local` — current daax compose
- `deploy-linux_daax-data` — from a *prior* compose project name (likely orphan)
- `daax-code-server-data` — orphan (container is long dead)
- `act-CI-lint-*`, `act-toolcache` — orphans
- Plus three hash-named anon volumes

---

## Hypothesis on how we got here

1. All these projects were originally on snap docker (the default when you installed docker via snap).
2. Some time in the past ~4 days, a session ran `docker compose up` on each of these projects through the native daemon (via `DOCKER_HOST=/run/docker.sock`, or by calling `/usr/bin/docker` directly).
3. Compose created fresh containers + volumes on native. Native won the port races because snap's containers had to be restarted to rebind.
4. The snap versions kept running but couldn't re-bind their ports. They've been dead weight since.
5. Some snap containers died and their `docker-proxy` processes leaked (orphans on 4200/4201/1411/4181/5555/5556/5562/5563/8093).

**This explains the symptom and does not require destructive action to verify — we can just remove snap once we confirm no unique data lives there.**

---

## Critical decision: which data is authoritative?

For each of the 6 duplicated services: the native copy has been live for 4 days and is what users have been hitting. The snap copy has been isolated (no port bindings, no incoming traffic). So **for any service with writable state** (mainly `ironclaw-pg`), we must decide:

- **Native is authoritative** (4 days of real writes) → just nuke snap, don't migrate.
- **Snap is authoritative** (4 days of real writes went... where?) → migrate snap volume to native first.

For `ironclaw-pg` specifically: native bound 5433. Anything connecting to 5433 hit native. Snap's copy is on 5434 — unless something is explicitly pointed at 5434, snap's postgres has been idle. **Most likely: native wins.** Need to confirm nothing is pointed at 5434.

For the `learn-gateway-*` and `code-reviewer-web-1` containers — these look stateless / image-only. No volumes to migrate. Just kill snap copies.

For `buildx_buildkit_*` — cache only. Safe to rebuild.

---

## The plan

### Phase 0 — Finish mapping (read-only, non-destructive)
1. Run the full `docker ps -a` against snap (command below). Goal: account for orphan proxies.
2. Confirm nothing on `galway` connects to postgres on port **5434**. Grep `.env`s, compose files, configs for `5434` and `127.0.0.1:5434`.
3. Confirm nothing is pointed at snap for the Authelia/MCP/8093 services (if they're gone, their clients should already be broken — which means either we don't use them anymore or we need to re-deploy them to native before removing snap).

### Phase 1 — Unblock daax today (reversible)
4. **Kill the orphan proxies on 4200/4201 only** (and /or `systemctl restart snap.docker.dockerd` — safer, which also cleans the other orphans).
5. `sudo -E ./deploy-local.sh deploy` — brings up daax on native, binds 4200/4201.
6. Verify `http://localhost:4200` loads and terminal WS works.

### Phase 2 — Clean native-side cruft (reversible before rm)
7. Remove the dead native containers listed above (`daax`/Created, `vibrant_buck`/Created, all `Exited` ones older than a month).
8. `docker volume rm` the orphan volumes: `daax-code-server-data`, `act-*`, `deploy-linux_daax-data` — only after `docker volume inspect` shows no container using them.
9. `docker network prune` for empty networks (`falcondev-net`, `kind` if kind isn't running).

### Phase 3 — Kill snap duplicates (destructive to snap only)
For each duplicate service on snap, in this order:
10. **Stateless first** (no volumes to worry about): `code-reviewer-web-1`, `learn-gateway-systems-designer-1`, `learn-gateway-code-reviewer-1`, `learn-gateway-landing-1`, `buildx_buildkit_daax-multiplatform0`.
    - `snap_docker rm -f <name>` (via the script's `snap_docker` helper) for each.
11. **Stateful — `ironclaw-pg`** — requires the Phase 0 step 2 confirmation. If snap's pg has been idle, `snap_docker rm -fv ironclaw-pg`. If *any* doubt, snapshot its volume to disk first (`rsync` `/var/snap/docker/common/var-lib-docker/volumes/<vol>/_data` to `~/snap-pg-backup-<date>/`).

### Phase 4 — Re-deploy any services that LIVED ON SNAP (i.e., the orphan proxy sources)
If Authelia, MCP servers, or the 8093 site were meant to be running and are now gone, we need to locate their compose files and re-deploy on native. This is where Phase 0 step 3 matters — if you don't need them, skip.

### Phase 5 — Teardown snap docker
12. `./deploy-local.sh snap-teardown --yes` — stops `snap.docker.dockerd`, disables it, `snap remove docker`.
13. Remove `/snap/bin/docker` symlink leftovers (snap remove should handle).
14. `docker info` — confirm only one daemon.
15. `./deploy-local.sh check` — expect zero "snap" entries anywhere.

### Phase 6 — Hygiene
16. Unify the rest of your compose projects under `deploy-local.sh`-style idempotent deploys so this can't silently drift again. (Separate task, not in scope here.)

---

## Safety rails / irreversible steps

- **Nothing in Phases 0–1 touches volumes.** All reversible.
- **Phase 2** removes dead containers and orphan volumes. I'll dump the volume names to a backup list before any `volume rm`.
- **Phase 3 step 11** (`ironclaw-pg` on snap) is the one irreversible moment. Gated on explicit user confirmation + optional volume backup.
- **Phase 5** removes the snap docker package. Reversible in theory (`snap install docker`) but you'd lose its container/volume graph. By this point that should be empty anyway.

---

## What I need from you

1. **Approval of the plan shape above** (or edits).
2. Output of:
   ```
   PID=$(systemctl show snap.docker.dockerd.service -p MainPID --value) && \
   sudo env -u DOCKER_HOST nsenter -t "$PID" -m -u -- /usr/bin/docker ps -a \
     --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}'
   ```
3. A gut-check on: "is there anything on 127.0.0.1:5434, or authelia/mcp/8093 that I actually still use?"

Once I have those, I'll execute Phase 0–1 in front of you, wait for you to verify daax loads, then we do Phases 2–5 one at a time with your OK between each.
