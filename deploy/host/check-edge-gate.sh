#!/usr/bin/env bash
# check-edge-gate.sh <edge.yml> — exit 0 only if the host's identity edge
# defines the gate deploy/traefik-daax.yml.tpl relies on (dx#120).
#
# The daax routes define no ForwardAuth of their own; they name
# `edge-auth-required`, which the dx edge bundle's edge.yml defines as a chain:
# edge-identity-reset, then traefik-forward-auth on 127.0.0.1:4182/portals/…,
# which signs the browser in at this host's own Pocket ID. Older renders of
# edge.yml defined `edge-auth-required` as a ForwardAuth to Pocket ID's
# /api/forward-auth/verify, an endpoint only the retired shared IdP's fork
# has: upstream Pocket ID answers it 404, so every daax request would fail.
#
# A tripwire over the text, not a YAML parser: it refuses the known-bad shape
# and requires the parts of the known-good one. Reads only; prints no secrets
# (edge.yml carries none).
set -euo pipefail

f=${1:-}
[[ -n $f ]] || { echo "usage: $0 <edge.yml>" >&2; exit 2; }
[[ -r $f ]] || { echo "edge gate: $f not found or not readable; install this host's identity edge (dx edge/install/identity.sh) first" >&2; exit 1; }

bad=()
grep -qE '^[[:space:]]+edge-auth-required:[[:space:]]*$' "$f" ||
  bad+=("defines no edge-auth-required middleware")
grep -qE '^[[:space:]]+edge-identity-reset:[[:space:]]*$' "$f" ||
  bad+=("defines no edge-identity-reset (client identity headers would pass through)")
grep -qE 'address:[[:space:]]*"?http://127\.0\.0\.1:4182/portals/' "$f" ||
  bad+=("has no ForwardAuth to traefik-forward-auth on 127.0.0.1:4182/portals/")
if grep -q '/api/forward-auth/verify' "$f"; then
  bad+=("still uses /api/forward-auth/verify, which upstream Pocket ID does not serve (404)")
fi

if ((${#bad[@]})); then
  echo "edge gate: $f is not the host-local forward-auth gate:" >&2
  printf '  - %s\n' "${bad[@]}" >&2
  echo "  Re-render and install this host's edge bundle (dx edge/install/identity.sh) before installing daax routes." >&2
  exit 1
fi
echo "edge gate: $f defines edge-auth-required -> traefik-forward-auth (127.0.0.1:4182) -> this host's Pocket ID"
