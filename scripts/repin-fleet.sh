#!/usr/bin/env bash
# repin-fleet.sh <commit-sha> [note] — repin every fleet target to the images
# CI published for <commit-sha>, the way 84459e6 and the 90c0a01 repin did it.
#
#   scripts/repin-fleet.sh 0123456789abcdef0123456789abcdef01234567 "next 16.4.x, daax-web#NNN"
#
# For daax-web, daax-terminal and code-server it resolves the sha-<short> tag to
# its index digest and refuses unless that digest:
#   - passes cosign verify against publish-images.yml@refs/heads/main, with the
#     certificate's workflow sha equal to <commit-sha>;
#   - has linux/amd64 AND linux/arm64 children;
#   - carries org.opencontainers.image.revision=<commit-sha> on both children.
# Then it rewrites DAAX_IMAGE, DAAX_TERMINAL_IMAGE, CODE_SERVER_IMAGE and
# DAAX_HOST_REF (and, given a note, the "# Now at daax-web" comment) in every
# deploy/env/*.env that pins DAAX_HOST_REF (the fleet files), and checks the
# pins are identical across them. watchtower / hawkeye / provenance are
# published by other repos: it only reports when their :latest moved off the
# pin. Nothing is committed; review the diff, then commit and open the PR.
#
# DOCKER_BIN, COSIGN_BIN and DAAX_ENV_DIR are overridable (tests).
set -euo pipefail

DOCKER_BIN="${DOCKER_BIN:-docker}"
COSIGN_BIN="${COSIGN_BIN:-cosign}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
ENV_DIR="${DAAX_ENV_DIR:-$SCRIPT_DIR/../deploy/env}"
REGISTRY=ghcr.io/daax-dev
ISSUER=https://token.actions.githubusercontent.com
IDENTITY='^https://github\.com/daax-dev/daax-web/\.github/workflows/publish-images\.yml@refs/heads/main$'

die() { printf 'repin-fleet: %s\n' "$*" >&2; exit 1; }

sha="${1:-}"
note="${2:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "usage: $0 <full 40-hex commit sha> [note]"
[[ "$note" != *$'\n'* && "$note" != *'|'* ]] || die "the note must be one line without '|'"
short="${sha:0:7}"
command -v jq >/dev/null || die "jq is required"

# resolve <repo> -> verified index digest on stdout
resolve() {
  local repo="$1" ref raw digest plats p rev
  ref="$REGISTRY/$repo:sha-$short"
  raw="$("$DOCKER_BIN" buildx imagetools inspect "$ref" --raw)" || die "$ref not found (did the publish run on $short succeed?)"
  digest="sha256:$(printf '%s' "$raw" | sha256sum | cut -d' ' -f1)"
  plats="$(printf '%s' "$raw" | jq -r '.manifests[] | select(.platform.os != "unknown") | "\(.platform.os)/\(.platform.architecture)"' | sort -u | paste -sd' ' -)"
  [[ "$plats" == "linux/amd64 linux/arm64" ]] || die "$repo@$digest platforms are '$plats', want linux/amd64 linux/arm64"
  "$COSIGN_BIN" verify --certificate-oidc-issuer "$ISSUER" --certificate-identity-regexp "$IDENTITY" \
    --certificate-github-workflow-sha "$sha" "$REGISTRY/$repo@$digest" >/dev/null 2>&1 \
    || die "$repo@$digest fails cosign verify for publish-images.yml@refs/heads/main at $sha"
  for p in linux/amd64 linux/arm64; do
    rev="$("$DOCKER_BIN" buildx imagetools inspect "$REGISTRY/$repo@$digest" --format "{{json (index .Image \"$p\").Config.Labels}}" | jq -r '."org.opencontainers.image.revision" // empty')"
    [[ "$rev" == "$sha" ]] || die "$repo@$digest $p revision label is '$rev', not $sha"
  done
  printf '%s\n' "$digest"
}

web="$(resolve daax-web)"
term="$(resolve daax-terminal)"
cs="$(resolve code-server)"

shopt -s nullglob
files=()
for f in "$ENV_DIR"/*.env; do grep -q '^DAAX_HOST_REF=' "$f" && files+=("$f"); done
((${#files[@]} > 0)) || die "no fleet env file (with DAAX_HOST_REF) in $ENV_DIR"

for f in "${files[@]}"; do
  sed -i -E \
    -e "s|^DAAX_HOST_REF=.*|DAAX_HOST_REF=$sha|" \
    -e "s|^DAAX_IMAGE=.*|DAAX_IMAGE=$REGISTRY/daax-web@$web|" \
    -e "s|^DAAX_TERMINAL_IMAGE=.*|DAAX_TERMINAL_IMAGE=$REGISTRY/daax-terminal@$term|" \
    -e "s|^CODE_SERVER_IMAGE=.*|CODE_SERVER_IMAGE=$REGISTRY/code-server@$cs|" \
    "$f"
  if [[ -n "$note" ]]; then
    sed -i -E "s|^# Now at daax-web [0-9a-f]+ .*; every digest cosign-verified\.$|# Now at daax-web $short ($note); every digest cosign-verified.|" "$f"
  fi
done

pins() { grep -E '^(DAAX_HOST_REF|DAAX_IMAGE|DAAX_TERMINAL_IMAGE|CODE_SERVER_IMAGE|WATCHTOWER_IMAGE|HAWKEYE_IMAGE|PROVENANCE_IMAGE)=' "$1" | sort; }
first="$(pins "${files[0]}")"
for f in "${files[@]:1}"; do
  [[ "$(pins "$f")" == "$first" ]] || die "pins differ between ${files[0]##*/} and ${f##*/} — fix by hand"
done

for svc in watchtower hawkeye provenance; do
  var="$(printf '%s' "$svc" | tr a-z A-Z)_IMAGE"
  pinned="$(sed -n "s|^$var=.*@||p" "${files[0]}")"
  # Report only: a registry hiccup here must not undo a verified repin.
  if ! raw="$("$DOCKER_BIN" buildx imagetools inspect "$REGISTRY/$svc:latest" --raw 2>/dev/null)"; then
    printf 'repin-fleet: note: could not read %s:latest; its pin was not checked\n' "$svc" >&2
    continue
  fi
  latest="$(printf '%s' "$raw" | sha256sum | cut -d' ' -f1)"
  [[ "sha256:$latest" == "$pinned" ]] || printf 'repin-fleet: note: %s:latest is sha256:%s, the pin is %s (not changed)\n' "$svc" "$latest" "$pinned" >&2
done

printf 'repinned %d fleet files to %s\n' "${#files[@]}" "$short"
printf '  daax-web      %s\n  daax-terminal %s\n  code-server   %s\n' "$web" "$term" "$cs"
