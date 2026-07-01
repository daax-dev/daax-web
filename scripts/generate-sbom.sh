#!/usr/bin/env bash
#
# Generate a real CycloneDX + SPDX SBOM of the daax-web source tree using syft.
#
# Runs `syft dir:.` against the repository (no Docker image required), producing
# the files the settings > Build panel serves from a whitelisted directory:
#
#   sbom/daax.cyclonedx.json
#   sbom/daax.spdx.json
#
# The sbom/ directory is git-ignored (generated, local-only). The Build panel
# and /api/build/sbom degrade gracefully to "no SBOM in this build" when the
# files are absent, so this step is optional for a bare `bun dev`.
#
# Usage: bun run sbom:generate   (or ./scripts/generate-sbom.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/sbom"

if ! command -v syft >/dev/null 2>&1; then
  echo "error: syft is not installed. Install it (e.g. 'brew install syft' or" >&2
  echo "       https://github.com/anchore/syft) and re-run." >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

# syft's directory cataloger skips node_modules by default (and its lock
# cataloger reads nested lockfiles that carry no license data). Scan node_modules
# with the package cataloger, which reads each installed package.json — yielding
# real versions AND licenses (the installed dependency bill of materials). Fall
# back to a plain repo-root scan when node_modules is absent so the command still
# produces a valid SBOM.
if [ -d "${ROOT}/node_modules" ]; then
  SCAN_TARGET="dir:${ROOT}/node_modules"
  CATALOGER_ARGS=(--override-default-catalogers "javascript-package-cataloger")
else
  echo "note: node_modules not found; scanning repo root (run 'bun install' for the dependency BoM)" >&2
  SCAN_TARGET="dir:${ROOT}"
  CATALOGER_ARGS=()
fi

echo "Generating CycloneDX SBOM -> sbom/daax.cyclonedx.json"
syft "${SCAN_TARGET}" ${CATALOGER_ARGS[@]+"${CATALOGER_ARGS[@]}"} -o cyclonedx-json="${OUT_DIR}/daax.cyclonedx.json"

echo "Generating SPDX SBOM      -> sbom/daax.spdx.json"
syft "${SCAN_TARGET}" ${CATALOGER_ARGS[@]+"${CATALOGER_ARGS[@]}"} -o spdx-json="${OUT_DIR}/daax.spdx.json"

echo "Done. SBOM files written to ${OUT_DIR}"
