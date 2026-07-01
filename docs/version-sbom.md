# Version, Build & SBOM (Settings → Build)

The **Settings → Build** panel shows the exact version of the running daax-web
app, where it is deployed, and its software bill of materials (SBOM). It is the
daax analogue of the reference platform's admin "Build" tab, adapted from a
Go/Azure stack to daax's Next.js/Node + GHCR/Docker/Tailscale reality.

Route: `/settings/build` · API: `GET /api/build`, `GET /api/build/sbom`.

---

## Part 1 — How it works

### At a glance

```
 ┌── build time ──────────────┐        ┌── request time ────────────────────┐
 │ next.config.ts runs git,   │        │ Browser → /settings/build           │
 │ injects NEXT_PUBLIC_BUILD_* │        │   BuildPanel (client) fetches:      │
 │ into the bundle             │        │     GET /api/build      → BuildInfo  │
 │                            │        │     GET /api/build/sbom → SBOM JSON  │
 │ scripts/generate-sbom.sh    │        │                                     │
 │ (syft) → sbom/*.json        │──────► │ Routes read env + package.json +    │
 └────────────────────────────┘        │ the whitelisted sbom/ files         │
                                        └─────────────────────────────────────┘
```

Two moments matter:

1. **Build time.** `next.config.ts` shells out to git once (branch, commit,
   host, timestamp) and injects the values as `NEXT_PUBLIC_BUILD_*` env vars, so
   they are frozen into the deployed bundle. Separately, `scripts/generate-sbom.sh`
   runs [syft](https://github.com/anchore/syft) to produce the SBOM files under
   `sbom/`.
2. **Request time.** The Build panel is a client component. It fetches
   `/api/build` for the version/deployment payload and (on demand, when you click
   **View SBOM**) `/api/build/sbom` for the component list. The API routes read
   the injected env vars, `package.json`, and the `sbom/` files — nothing is
   hardcoded.

### The version/build fields

| Field        | Source                                                    |
| ------------ | --------------------------------------------------------- |
| Version      | `package.json` `version`, suffixed with the short git SHA |
| Git SHA      | `NEXT_PUBLIC_BUILD_COMMIT` (full commit)                  |
| Build time   | `NEXT_PUBLIC_BUILD_TIMESTAMP`                             |
| Node runtime | `process.version` at request time                         |
| Next.js      | `package.json` `dependencies.next`                        |
| Branch       | `NEXT_PUBLIC_BUILD_BRANCH`                                |

The reference platform's "Go runtime" row becomes **Node runtime + Next.js**,
because daax is a Node/Next app, not Go.

### The deployment section

The reference shows Azure Container Apps assets (subscription, resource group,
region, image). daax does not run on Azure, so faking those would be dishonest.
Instead the panel shows daax's real deployment surface:

- **Always populated (knowable locally):** mode (`host` vs `container`, inferred
  from `HOST_WORKSPACE_PATH`), deployed-via, deployed-by (`$USER`), host.
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

### Base & dependency images

Below the app panel, a **Base & dependency images** section lists the container
images daax is built on and uses, in three groups:

- **App runtime base** — the image the daax container is built `FROM`
  (`node:22-bookworm-slim`).
- **Platform & tooling** — images daax runs (code-server, the syft scanner).
- **Devcontainer base catalog** — the base images users pick when spawning
  devcontainers.

Each row shows the exact reference and its **sha256 digest**, resolved live from
the local Docker daemon (`docker inspect` → `RepoDigests`). Images not present
locally show "not pulled". Each present image has a **View** action that
generates its SBOM on demand with syft (`GET /api/build/images/sbom?ref=…`,
whitelisted to the known set) and renders the same component table.

### Generating the SBOM

```bash
bun run sbom:generate        # writes sbom/daax.cyclonedx.json + daax.spdx.json
```

syft's directory scanner skips `node_modules` by default (and its lock cataloger
reads nested lockfiles that carry no license data), so the script scans
`node_modules` with the **package cataloger**, which reads each installed
`package.json` — yielding real versions _and_ licenses. The `sbom/` directory is
git-ignored (generated).

**Container mode.** The Dockerfile installs syft (pinned) in the builder stage
and runs `bun run sbom:generate` after the app build, then copies `sbom/` into
the runtime image — so container deployments ship the same dependency SBOM, not
just local dev. This step is **required**: a syft install/scan failure fails the
image build so a release can't silently ship without an SBOM. Set
`DAAX_SKIP_SBOM=1` to opt out (e.g. an air-gapped build) and accept the panel's
graceful empty state.

---

## Part 2 — Details

### Files

| Path                                  | Role                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------- |
| `app/settings/layout.tsx`             | 2nd-level settings sub-nav (General · Build · Releases · Voice · Debug) |
| `app/settings/build/page.tsx`         | Build route; renders `<BuildPanel />`                                   |
| `components/settings/BuildPanel.tsx`  | Client panel: version cards, deployment, SBOM viewer                    |
| `lib/build/build-info.ts`             | Server-side `BuildInfo` assembly + SBOM whitelist                       |
| `lib/build/sbom-format.ts`            | Pure SBOM/deploy render helpers (client + server + tests)               |
| `lib/build/images.ts`                 | Base/dependency image enumeration + digest resolution (dockerode)       |
| `components/settings/BuildImages.tsx` | Client: base/dependency images table + per-image SBOM                   |
| `app/api/build/route.ts`              | `GET /api/build` → `BuildInfo` JSON                                     |
| `app/api/build/sbom/route.ts`         | `GET /api/build/sbom` → whitelisted SBOM file                           |
| `app/api/build/images/route.ts`       | `GET /api/build/images` → images + sha256 digests                       |
| `app/api/build/images/sbom/route.ts`  | `GET /api/build/images/sbom?ref=` → per-image syft SBOM (whitelisted)   |
| `scripts/generate-sbom.sh`            | syft → `sbom/daax.{cyclonedx,spdx}.json`                                |

### `GET /api/build`

**Requires auth** (`requireAuth`) — the payload includes commit SHA, hostname,
deploying user, and deployment surface, so it is not exposed unauthenticated. In
local/non-strict mode `requireAuth` bypasses to the local operator, so `bun dev`
is unaffected; with `DAAX_REQUIRE_AUTH=1` anonymous callers get `401`. Liveness
probes use the public `/api/health`, not this route. `runtime = "nodejs"`,
`dynamic = "force-dynamic"`, `Cache-Control: no-store`. Returns `BuildInfo`:

```jsonc
{
  "version": "v0.1.0+df79cec",
  "gitSha": "df79cec45e282792de262cde7167ab69b4225951",
  "buildTime": "20260701.1048",
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

`sboms` lists only documents that pass the real-SBOM guard. `deployment` always
carries mode/host/deployer; image fields appear only when their env vars are set.

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

**Real-vs-placeholder guard.** `readRealSbom()` runs the shared
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

| Var                               | Effect                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_BUILD_*`             | Injected by `next.config.ts` (commit/branch/host/timestamp) |
| `DAAX_SBOM_DIR`                   | Override the SBOM directory (default `<cwd>/sbom`)          |
| `DAAX_SBOM_MAX_BYTES`             | Max SBOM file size the route will read (default 32 MB)      |
| `DAAX_IMAGE_SBOM_MAX_BYTES`       | Max per-image SBOM retained in cache (default 64 MB)        |
| `DAAX_IMAGE_SBOM_MAX_CONCURRENCY` | Max concurrent per-image syft scans (default 2)             |
| `DAAX_RUNTIME_BASE_IMAGE`         | Override the app runtime base image ref shown               |
| `DAAX_CODE_SERVER_IMAGE`          | Override the code-server image ref shown                    |
| `DAAX_REQUIRE_AUTH`               | `1` → the build routes (and app) require authentication     |
| `DAAX_DEPLOY_MODE`                | Force `host` / `container` (else inferred)                  |
| `DAAX_DEPLOY_VIA`                 | e.g. `github-actions`, `github-runner`, `host`              |
| `DAAX_DEPLOY_BY`                  | Deployer (falls back to `$USER` / `$USERNAME`)              |
| `DAAX_IMAGE_REGISTRY`             | e.g. `ghcr.io/daax-dev/daax-web`                            |
| `DAAX_IMAGE`, `DAAX_IMAGE_TAG`    | Container image reference / tag                             |
| `HOST_WORKSPACE_PATH`             | Workspace mount (also implies `container` mode)             |
| `DAAX_DEPLOY_HOST`                | Tailnet / deploy host                                       |

### Tests

- `tests/lib/build-sbom-format.test.ts` — the pure render helpers.
- `tests/lib/build-info.test.ts` — assembly, whitelist/traversal, guard, deployment.
- `tests/api/build-route.test.ts` — `GET /api/build`.
- `tests/api/build-sbom-route.test.ts` — `GET /api/build/sbom` (200/400/404, inline/attachment).

```bash
bun run test -- tests/lib/build-sbom-format.test.ts tests/lib/build-info.test.ts \
  tests/api/build-route.test.ts tests/api/build-sbom-route.test.ts
```
