# Version, Build & SBOM (Settings → Build)

The **Settings → Build** panel shows the exact version of the running daax-web
app, where it is deployed, and its software bill of materials (SBOM). It is the
daax analogue of the reference platform's admin "Build" tab, adapted from a
Go/Azure stack to daax's Next.js/Node + GHCR/Docker/Tailscale reality.

Route: `/settings/build` · API: `GET /api/build`, `GET /api/build/sbom`,
`GET /api/build/images`, `GET /api/build/images/sbom`.

The build is stamped from **three explicit inputs** — `VERSION`, `GIT_SHA`,
`BUILD_TIME` — and a release is cut with `scripts/release.sh`, which fires the
publish workflow that scans, signs and attests every image by digest. See
[Build stamp inputs](#build-stamp-inputs) and [Release flow](#release-flow).

---

## Part 1 — How it works

### At a glance

```
 ┌── build time ───────────────────────┐   ┌── request time ────────────────────┐
 │ VERSION / GIT_SHA / BUILD_TIME      │   │ Browser → /settings/build           │
 │  (Dockerfile ARGs, or git fallback) │   │   BuildPanel fetches:               │
 │   → next.config.ts inlines          │   │     GET /api/build        → stamp    │
 │     NEXT_PUBLIC_BUILD_*             │   │     GET /api/build/sbom   → SBOM     │
 │   → runner ENV + OCI labels         │──►│   BuildImages fetches:              │
 │                                     │   │     GET /api/build/images → running │
 │ scripts/generate-sbom.sh            │   │       stack + base images + digests │
 │ (syft) → sbom/*.json                │   │     GET /api/build/images/sbom?ref= │
 └─────────────────────────────────────┘   └─────────────────────────────────────┘
```

Two moments matter:

1. **Build time.** `next.config.ts` resolves the build stamp once — preferring
   the explicit `VERSION` / `GIT_SHA` / `BUILD_TIME` inputs, falling back to git
   for a from-source `bun dev` — and injects it as `NEXT_PUBLIC_BUILD_*`, frozen
   into the bundle. The Dockerfile also writes the same values into the runtime
   `ENV` and into OCI labels. Separately, `scripts/generate-sbom.sh` runs
   [syft](https://github.com/anchore/syft) to produce the SBOM files under
   `sbom/`.
2. **Request time.** The Build panel is a client component. It fetches
   `/api/build` for the stamp/deployment payload, `/api/build/images` for the
   running stack and base images, and (on demand) the SBOM routes. The API
   routes read the injected env vars, `package.json`, the Docker daemon, and the
   `sbom/` files — nothing is hardcoded.

### Build stamp inputs

| Input        | Meaning                                                               | Env / label                                                     |
| ------------ | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `VERSION`    | Release tag `vX.Y.Z`, or `git describe --tags --match 'v*' [--dirty]` | `NEXT_PUBLIC_BUILD_VERSION`, `org.opencontainers.image.version` |
| `GIT_SHA`    | Full commit SHA                                                       | `NEXT_PUBLIC_BUILD_COMMIT`, `org.opencontainers.image.revision` |
| `BUILD_TIME` | UTC RFC3339 (`date -u +%Y-%m-%dT%H:%M:%SZ`)                           | `NEXT_PUBLIC_BUILD_TIME`, `org.opencontainers.image.created`    |

Every producer passes them, so the same stamp shows up everywhere:

- **`publish-images.yml`** — a tag push is the version; a `main` push is
  `git describe` relative to the last `v*` tag (`fetch-depth: 0`), or `dev` when
  no tag exists. No `--dirty` in CI.
- **`bun run docker:build` / `release:build`** — from the local checkout,
  `--dirty` included.
- **`docker compose build`** (root and `deploy/docker-compose.yml`) — the build
  blocks pass `${VERSION:-dev}` etc.; `scripts/deploy.sh` and `deploy-local.sh`
  export them from the checkout before building.
- **`bun dev` / `bun run build`** — git fallback in `next.config.ts`; or set
  `VERSION=… GIT_SHA=… BUILD_TIME=… bun run build`.

Unset inputs stay the honest sentinels (`dev` / `unknown`): the panel then shows
`v<package.json version>+<sha7>` (or plain `v<version>` when the commit is
unknown too) and "unknown" for the time — never a plausible-looking guess. A bare
short SHA is deliberately **not** a version (the commit is stamped on its own),
which is why the fallback uses `--match 'v*'` without `--always`.

The titlebar logo tooltip and the Build page read the same names through
`lib/build/build-env.ts` (`buildStamp()` / `buildSummary()`), so they cannot
disagree. `/api/health` stays public and version-free; `/api/build` (auth) is
where the stamp is exposed.

Cross-check a running image against its labels:

```bash
docker image inspect ghcr.io/daax-dev/daax-web:latest \
  --format '{{index .Config.Labels "org.opencontainers.image.version"}} {{index .Config.Labels "org.opencontainers.image.revision"}} {{index .Config.Labels "org.opencontainers.image.created"}}'
curl -s http://localhost:4200/api/build | jq '{version, gitSha, buildTime}'
```

### The version/build fields

| Field        | Source                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------- |
| Version      | `NEXT_PUBLIC_BUILD_VERSION`; unstamped → `package.json` `version` + `+<sha7>` (hover: package.json) |
| Git SHA      | `NEXT_PUBLIC_BUILD_COMMIT` (full commit, or `unknown`)                                              |
| Build time   | `NEXT_PUBLIC_BUILD_TIME` (UTC RFC3339, or `unknown`)                                                |
| Node runtime | `process.version` at request time                                                                   |
| Next.js      | `package.json` `dependencies.next`                                                                  |
| Branch       | `NEXT_PUBLIC_BUILD_BRANCH` (informational; `BUILD_BRANCH` arg or the checkout's branch)             |

The three stamped inputs are the prominent first row of the panel; the rest is
runtime context. The reference platform's "Go runtime" row becomes **Node
runtime + Next.js**, because daax is a Node/Next app, not Go.

### The deployment section

The reference shows Azure Container Apps assets (subscription, resource group,
region, image). daax does not run on Azure, so faking those would be dishonest.
Instead the panel shows daax's real deployment surface:

- **Always populated (knowable locally):** mode (`host` vs `container`, inferred
  from `HOST_WORKSPACE_PATH`), deployed-via, deployed-by (`$USER`). Host is
  `DAAX_DEPLOY_HOST`, or the build host for a from-source (host-mode) run only —
  a container was built elsewhere, so its build host is not its deploy host.
- **Env-driven, shown only when set:** registry, image, image tag, workspace
  mount — a from-source `bun dev` has no container image, so those rows are
  simply absent rather than invented.

### The SBOM viewer

Click **View SBOM** to expand a table of every dependency with its version,
type, and license. Toggle between **CycloneDX** and **SPDX**, flip to raw JSON,
or **Download** the document. daax is a single deployable app (not a split
backend/frontend), so there is one SBOM component and the component selector is
hidden — the format toggle remains.

If no SBOM has been generated, the panel degrades gracefully to _"No SBOM
bundled in this build"_ with a hint to run `bun run sbom:generate`. It never
shows a placeholder that merely _looks_ like an SBOM (see the guard below).

### Running stack, base & dependency images

Below the app panel, a **Base & dependency images** card lists container images
in four groups:

- **Running stack** — what is running _right now_: every container in the same
  compose project as this one (label `com.docker.compose.project` of the
  daax-web container, identified by its container-ID hostname or
  `DAAX_CONTAINER_ID`), or every running container when not under compose. Each
  row shows the container name(s), the compose service, the image reference and
  the digest of the image the container actually runs (resolved by image ID, so
  a re-pointed tag can't mislead); "this container" marks daax-web itself. Two
  containers on one image (web + migrate) share a row. Bounded by
  `DAAX_BUILD_STACK_MAX` (default 64). Needs the Docker socket: in the split
  fleet/cloud deployment (`deploy/docker-compose.yml`) only `daax-terminal`
  mounts it, so there the web plane answers 503 for this card and the per-image
  SBOM — the section is for the single-container and from-source modes until
  the terminal plane serves it.
- **App runtime base** — the image the daax container is built `FROM`
  (`node:22-bookworm-slim`).
- **Platform & tooling** — images daax runs (code-server, the syft scanner).
- **Devcontainer base catalog** — the base images users pick when spawning
  devcontainers.

Digests come from the local Docker daemon (`docker inspect` → `RepoDigests`).
Images not present locally show "not pulled". Each present image has a **View**
action that generates its SBOM on demand with syft
(`GET /api/build/images/sbom?ref=…`) and renders the same component table.

**The whitelist.** The SBOM route only ever scans a ref that is in the set
computed fresh for that request (running stack + static refs, `isKnownImageRef`),
so a caller cannot name an arbitrary image; scan _results_ are cached per ref,
the set never is. When the daemon is unreachable the stack group is simply
absent and the static set alone is the whitelist — absence, never a pass. In
the F3 split deploy the web plane deliberately has no Docker socket, so there
`/api/build/images` answers 503 and the card reports Docker as unavailable.

### Generating the SBOM

```bash
bun run sbom:generate        # writes sbom/daax.cyclonedx.json + daax.spdx.json
```

syft's directory scanner skips `node_modules` by default (and its lock cataloger
reads nested lockfiles that carry no license data), so the script scans
`node_modules` with the **package cataloger**, which reads each installed
`package.json` — yielding real versions _and_ licenses. The `sbom/` directory is
git-ignored (generated).

**Container mode.** The Dockerfile installs syft in the builder stage from a
pinned release artifact whose sha256 is verified against the published checksums
(no piping a remote script into a shell), runs `bun run sbom:generate` after the
app build, then copies `sbom/` into the runtime image — so container deployments
ship the same dependency SBOM, not just local dev. This step is **required**: a
failed download, checksum mismatch, or scan fails the image build so a release
can't silently ship without an SBOM. Set `DAAX_SKIP_SBOM=1` to opt out (e.g. an
air-gapped build) and accept the panel's graceful empty state.

### Release flow

Two phases, because all work lands via PR (`.claude/sourcecontrol.md`) — the
script never commits to `main`:

```bash
scripts/release.sh --self-test                # version computation, no git
# 1. on a feature branch: bump package.json in a commit, then open a PR
scripts/release.sh --prepare --bump patch     # v0.1.0 → v0.1.1 (seeds v0.1.0 if no tag)
scripts/release.sh --prepare v1.2.0
# 2. after the PR merged, on main at origin/main: tag the reviewed commit
scripts/release.sh v1.2.0 --push
```

`--prepare` refuses to run on `main`; the tag phase requires `main`, a clean
tree (`--allow-dirty` relaxes only that), `package.json` already at `X.Y.Z`,
and — with `--push` — `main` equal to `origin/main`. It refuses to clobber an
existing tag (locally, and on `origin` when pushing) and creates an
**annotated** tag. Strict semver only (`vX.Y.Z`, no leading zeros, no suffix).
Bash 3.2 (macOS) compatible.

`--push` fires `.github/workflows/publish-images.yml` (`v*` trigger), which for
`daax-web` and `daax-terminal` (`code-server` is built multi-arch, signed and
attested in the same run, but is not stamped and not trivy-gated yet):

1. **Stamps** `VERSION=vX.Y.Z GIT_SHA=<sha> BUILD_TIME=<now>` into both arch
   builds (native amd64 + arm64 runners, no QEMU).
2. **Gates** each arch image with trivy (`CRITICAL`, fixable only, exit 1)
   _before_ it is pushed — so an unscanned digest, and therefore an unscanned
   `:latest`, never reaches the registry.
3. **Pushes by digest** with BuildKit `sbom: true` and `provenance: mode=max`
   attestations, then merges the arches into one manifest list carrying the
   `latest` / `X.Y.Z` / `X.Y` / `sha-…` tags.
4. **Signs and attests** with keyless cosign: `cosign sign` on the merged
   index digest _and_ on each platform child digest, then
   `cosign attest --type cyclonedx` with a syft SBOM of each platform child
   (an SBOM is per platform — one taken from the index would only describe the
   runner's own arch), and **verifies** all of it against this repo's workflow
   identity — a failed verify fails the job.

Consumers verify the same way before trusting a digest — the index for the
signature, their own platform's child digest for the SBOM attestation:

```bash
ISSUER=https://token.actions.githubusercontent.com
IDENTITY='^https://github.com/daax-dev/daax-web/\.github/workflows/publish-images\.yml@'
cosign verify --certificate-oidc-issuer "$ISSUER" --certificate-identity-regexp "$IDENTITY" \
  ghcr.io/daax-dev/daax-web@sha256:<index>
# platform child digest for this host:
docker buildx imagetools inspect ghcr.io/daax-dev/daax-web@sha256:<index> --raw \
  | jq -r '.manifests[] | select(.platform.architecture=="arm64") | .digest'
cosign verify-attestation --type cyclonedx --certificate-oidc-issuer "$ISSUER" \
  --certificate-identity-regexp "$IDENTITY" ghcr.io/daax-dev/daax-web@sha256:<child> \
  | jq -r .payload | base64 -d | jq '.predicate.components | length'
```

On PRs, `ci.yml`'s trivy filesystem scan is a gate for fixable `CRITICAL`
findings and report-only for `HIGH`.

---

## Part 2 — Details

### Files

| Path                                   | Role                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `app/settings/layout.tsx`              | 2nd-level settings sub-nav (User · Projects · Admin · Build · Releases · Debug) |
| `app/settings/build/page.tsx`          | Build route; renders `<BuildPanel />`                                           |
| `components/settings/BuildPanel.tsx`   | Client panel: version cards, deployment, SBOM viewer                            |
| `lib/build/build-env.ts`               | The `NEXT_PUBLIC_BUILD_*` reader shared by titlebar + panel (client-safe)       |
| `lib/build/build-info.ts`              | Server-side `BuildInfo` assembly + SBOM whitelist                               |
| `lib/build/sbom-format.ts`             | Pure SBOM/deploy render helpers (client + server + tests)                       |
| `lib/build/images.ts`                  | Base/dependency image enumeration + digest resolution (dockerode)               |
| `components/settings/BuildImages.tsx`  | Client: base/dependency images table + per-image SBOM                           |
| `app/api/build/route.ts`               | `GET /api/build` → `BuildInfo` JSON                                             |
| `app/api/build/sbom/route.ts`          | `GET /api/build/sbom` → whitelisted SBOM file                                   |
| `app/api/build/images/route.ts`        | `GET /api/build/images` → images + sha256 digests                               |
| `app/api/build/images/sbom/route.ts`   | `GET /api/build/images/sbom?ref=` → per-image syft SBOM (whitelisted)           |
| `scripts/generate-sbom.sh`             | syft → `sbom/daax.{cyclonedx,spdx}.json`                                        |
| `scripts/release.sh`                   | Cut an annotated `vX.Y.Z` tag (+ package.json bump); `--push` publishes         |
| `.github/workflows/publish-images.yml` | Multi-arch build, trivy gate, SBOM+provenance, cosign sign/attest/verify        |

### `GET /api/build`

**Requires auth** (`requireAuth`) — the payload includes commit SHA, hostname,
deploying user, and deployment surface, so it is not exposed unauthenticated. In
local/non-strict mode `requireAuth` bypasses to the local operator, so `bun dev`
is unaffected; with `DAAX_REQUIRE_AUTH=1` anonymous callers get `401`. Liveness
probes use the public `/api/health`, not this route. `runtime = "nodejs"`,
`dynamic = "force-dynamic"`, `Cache-Control: no-store`. Returns `BuildInfo`:

```jsonc
{
  "version": "v0.1.0-3-gdf79cec",
  "packageVersion": "0.1.0",
  "gitSha": "df79cec45e282792de262cde7167ab69b4225951",
  "buildTime": "2026-07-01T10:48:00Z",
  "nodeVersion": "v23.9.0",
  "nextVersion": "16.1.6",
  "branch": "sbom",
  "hostname": "chamonix",
  "sbomAvailable": true,
  "sboms": [
    { "component": "app", "format": "cyclonedx" },
    { "component": "app", "format": "spdx" },
  ],
  "deployment": {
    "mode": "host",
    "via": "host",
    "by": "jasonpoley",
    "host": "chamonix",
  },
}
```

`version` is the stamped `VERSION` verbatim; an unstamped build shows
`v<packageVersion>+<sha7>` instead. `gitSha`/`buildTime` are `unknown` when not
stamped. `sboms` lists only documents that pass the real-SBOM guard.
`deployment` always carries mode/deployer; host and image fields appear only
when known.

### `GET /api/build/sbom`

**Requires auth** (same rationale as `/api/build`). Query params: `component`
(default `app`), `format` (`cyclonedx` | `spdx`, default `cyclonedx`), `inline`
(`1|true|yes|on` → `Content-Disposition: inline`, otherwise `attachment`).

| Case                             | Response                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unauthenticated (strict mode)    | `401`                                                                                                                                               |
| Unknown component/format         | `400` `{ error, components, formats }`                                                                                                              |
| Not bundled / placeholder        | `404` `{ available: false, component, format, note }`                                                                                               |
| Read error / oversize / mismatch | `500` `{ error, reason }`                                                                                                                           |
| Success                          | `200` `application/json`, `X-Content-Type-Options: nosniff`, `Content-Disposition: <inline\|attachment>; filename="daax-<component>-<format>.json"` |

**Defensive read (`readSbom`).** Beyond the request-side whitelist:

- **Whitelist → fixed filename.** The (component, format) pair maps through a
  closed table; request input never reaches the file path:
  ```ts
  const SBOM_FILES = {
    "app:cyclonedx": "daax.cyclonedx.json",
    "app:spdx": "daax.spdx.json",
  };
  ```
- **Symlink containment.** The real path (`realpathSync`) must stay inside the
  SBOM dir, so a symlink planted under `sbom/` can't make the route serve files
  elsewhere.
- **Size cap.** Files larger than `DAAX_SBOM_MAX_BYTES` (default 32 MB) are
  rejected before any read/parse, bounding a corrupt/oversized-file DoS.
- **Guard + format match.** Content must pass the placeholder-vs-real guard and
  its detected format must match the requested one (a misconfigured slot → 500,
  not a silently-wrong download).

**Real-vs-placeholder guard.** `readSbom()` runs the shared
`lib/sbom-guard.ts` `checkSbom()` over the file contents: it must parse, be a
non-empty object, clear a 512-byte floor, and carry the correct format marker
plus a non-empty inventory (`bomFormat: "CycloneDX"` + `components[]`, or
`spdxVersion` + `packages[]`). Anything else is reported unavailable.

### SBOM rendering helpers (`lib/build/sbom-format.ts`)

Pure and dependency-free (no Node/Next imports) so they are shared by the client
panel, the server route, and unit tests:

- `rowsFromSbom(doc)` — flattens a document to `{ name, version, type, license }`
  rows; CycloneDX `components[]` win, else SPDX `packages[]`.
- `licenseOf(component)` — CycloneDX license: id → name → expression → `—`.
- `spdxLicenseOf(pkg)` — SPDX license: concluded → declared, treating
  `NOASSERTION`/`NONE` as none.
- `deployViaLabel(via)` — friendly label for the deployment mechanism.

### Configuration (env vars)

| Var                                | Effect                                                          |
| ---------------------------------- | --------------------------------------------------------------- |
| `VERSION`, `GIT_SHA`, `BUILD_TIME` | The explicit build inputs (Dockerfile ARGs / build env)         |
| `NEXT_PUBLIC_BUILD_*`              | `VERSION`/`COMMIT`/`TIME`/`BRANCH`, inlined by `next.config.ts` |
| `DAAX_BUILD_STACK_MAX`             | Max running-stack rows on the Build page (default 64)           |
| `DAAX_CONTAINER_ID`                | This container's ID when the hostname isn't the ID              |
| `DAAX_SBOM_DIR`                    | Override the SBOM directory (default `<cwd>/sbom`)              |
| `DAAX_SBOM_MAX_BYTES`              | Max SBOM file size the route will read (default 32 MB)          |
| `DAAX_IMAGE_SBOM_MAX_BYTES`        | Max per-image SBOM retained in cache (default 64 MB)            |
| `DAAX_IMAGE_SBOM_CACHE_MAX`        | Per-image SBOM cache entries, LRU (default 32)                  |
| `DAAX_IMAGE_SBOM_MAX_CONCURRENCY`  | Max concurrent per-image syft scans (default 2)                 |
| `DAAX_RUNTIME_BASE_IMAGE`          | Override the app runtime base image ref shown                   |
| `DAAX_CODE_SERVER_IMAGE`           | Override the code-server image ref shown                        |
| `DAAX_REQUIRE_AUTH`                | `1` → the build routes (and app) require authentication         |
| `DAAX_DEPLOY_MODE`                 | Force `host` / `container` (else inferred)                      |
| `DAAX_DEPLOY_VIA`                  | e.g. `github-actions`, `github-runner`, `host`                  |
| `DAAX_DEPLOY_BY`                   | Deployer (falls back to `$USER` / `$USERNAME`)                  |
| `DAAX_IMAGE_REGISTRY`              | e.g. `ghcr.io/daax-dev/daax-web`                                |
| `DAAX_IMAGE`, `DAAX_IMAGE_TAG`     | Container image reference / tag                                 |
| `HOST_WORKSPACE_PATH`              | Workspace mount (also implies `container` mode)                 |
| `DAAX_DEPLOY_HOST`                 | Tailnet / deploy host                                           |

### Tests

- `tests/lib/build-sbom-format.test.ts` — the pure render helpers.
- `tests/lib/build-info.test.ts` — assembly, stamp/sentinels, whitelist/traversal, guard, deployment.
- `tests/lib/build-images.test.ts` — running-stack discovery (compose scoping, self, dedup, bound, daemon-down → absence) and the per-request whitelist, with an injected Docker client.
- `bash scripts/release.sh --self-test` — version computation (explicit/bump/seed/ordering) without touching git.
- `tests/api/build-route.test.ts` — `GET /api/build`.
- `tests/api/build-sbom-route.test.ts` — `GET /api/build/sbom` (200/400/404, inline/attachment).

```bash
bun run test -- tests/lib/build-sbom-format.test.ts tests/lib/build-info.test.ts \
  tests/api/build-route.test.ts tests/api/build-sbom-route.test.ts
```
