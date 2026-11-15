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
# The check follows the chain itself, not text that merely appears in the
# file: edge-auth-required must be a chain whose members are defined in this
# file, a headers middleware blanking every identity header daax reads must
# come BEFORE the one ForwardAuth, that ForwardAuth must be traefik-forward-auth
# on loopback 4182 and return X-Forwarded-User, and nothing after it may set an
# identity header. Reads only; prints no secrets (edge.yml carries none).
# Needs python3 with PyYAML (Ubuntu: python3-yaml); without it, it refuses.
set -euo pipefail

f=${1:-}
[[ -n $f ]] || { echo "usage: $0 <edge.yml>" >&2; exit 2; }
[[ -r $f ]] || { echo "edge gate: $f not found or not readable; install this host's identity edge (dx edge/install/identity.sh) first" >&2; exit 1; }
command -v python3 >/dev/null || { echo "edge gate: python3 is required to check $f" >&2; exit 1; }

# -I: isolated mode, so nothing beside the YAML file or in the cwd is imported.
python3 -I - "$f" <<'PY'
import re
import sys

path = sys.argv[1]
try:
    import yaml
except ImportError:
    print(f"edge gate: PyYAML is required to check {path} (apt install python3-yaml)", file=sys.stderr)
    sys.exit(1)

# The identity headers daax and its siblings read; each must be blanked before
# the ForwardAuth runs, because Traefik only REPLACES the headers the auth
# service returns and passes every other client-sent one through.
IDENTITY = [
    "X-Forwarded-User", "X-Forwarded-Email", "X-Forwarded-Username",
    "X-Forwarded-Name", "X-Forwarded-Displayname", "X-Forwarded-Groups",
    "X-Forwarded-Admin",
]
TFA = re.compile(r"^http://127\.0\.0\.1:4182/portals/[A-Za-z0-9_-]+$")

problems = []
raw = open(path, encoding="utf-8").read()
if "/api/forward-auth/verify" in raw:
    problems.append("still uses /api/forward-auth/verify, which upstream Pocket ID does not serve (404)")
try:
    doc = yaml.safe_load(raw) or {}
except yaml.YAMLError as e:
    problems.append(f"is not valid YAML ({e.__class__.__name__})")
    doc = {}

mws = ((doc.get("http") or {}).get("middlewares") or {}) if isinstance(doc, dict) else {}
gate = mws.get("edge-auth-required")
members = []
if not isinstance(gate, dict):
    problems.append("defines no edge-auth-required middleware")
elif set(gate) != {"chain"} or not isinstance((gate["chain"] or {}).get("middlewares"), list):
    problems.append("edge-auth-required is not a chain (identity reset, then forward-auth)")
else:
    members = gate["chain"]["middlewares"]

def lower_keys(d):
    return {str(k).lower(): v for k, v in (d or {}).items()}

fa_index = None
resets_before = set()
for i, ref in enumerate(members):
    name = str(ref)
    if name.endswith("@file"):
        name = name[: -len("@file")]
    if "@" in name or name not in mws or not isinstance(mws[name], dict):
        problems.append(f"chain member {ref!r} is not defined in this file")
        continue
    m = mws[name]
    if "forwardAuth" in m:
        if fa_index is not None:
            problems.append("chain has more than one ForwardAuth")
            continue
        fa = m["forwardAuth"] or {}
        if not TFA.match(str(fa.get("address", ""))):
            problems.append(f"ForwardAuth {name!r} is not traefik-forward-auth on http://127.0.0.1:4182/portals/<portal>")
        if "x-forwarded-user" not in [str(h).lower() for h in fa.get("authResponseHeaders") or []]:
            problems.append(f"ForwardAuth {name!r} does not return X-Forwarded-User")
        fa_index = i
    elif "headers" in m:
        req = lower_keys((m["headers"] or {}).get("customRequestHeaders"))
        touched = [h for h in IDENTITY if h.lower() in req]
        if fa_index is None:
            resets_before |= {h for h in touched if req[h.lower()] == ""}
        elif touched:
            problems.append(f"{name!r} sets identity headers AFTER the ForwardAuth: {', '.join(touched)}")
    else:
        problems.append(f"chain member {name!r} is neither a header reset nor the ForwardAuth")

if members and fa_index is None:
    problems.append("chain has no ForwardAuth")
missing = [h for h in IDENTITY if h not in resets_before]
if members and missing:
    problems.append("identity headers not blanked before the ForwardAuth: " + ", ".join(missing))

if problems:
    print(f"edge gate: {path} is not the host-local forward-auth gate:", file=sys.stderr)
    for p in problems:
        print(f"  - {p}", file=sys.stderr)
    print("  Re-render and install this host's edge bundle (dx edge/install/identity.sh) before installing daax routes.", file=sys.stderr)
    sys.exit(1)
print(f"edge gate: {path} defines edge-auth-required -> identity reset -> traefik-forward-auth (127.0.0.1:4182) -> this host's Pocket ID")
PY
