#!/usr/bin/env bash
# scripts/release.sh — cut a daax-web release tag, in two PR-friendly phases.
#
#   scripts/release.sh --prepare v1.2.3            # on a feature branch
#   scripts/release.sh --prepare --bump patch|minor|major
#   scripts/release.sh v1.2.3 [--push]              # on main, after the PR merged
#   scripts/release.sh --bump patch|minor|major [--push]
#   scripts/release.sh --self-test
#
# Phase 1 — --prepare (NOT on main; .claude/sourcecontrol.md: all work lands
#   via PR, no direct commits to main): computes the version, sets package.json
#   "version" to X.Y.Z and commits it ("release: vX.Y.Z"). Open a PR for it.
#
# Phase 2 — tag (on main, clean tree, package.json already at X.Y.Z, i.e. the
#   reviewed release commit is what HEAD is): creates the ANNOTATED tag
#   vX.Y.Z. With --push, main must equal origin/main (nothing local and
#   unreviewed gets tagged) and the tag is pushed, which fires
#   .github/workflows/publish-images.yml (`v*` trigger): multi-arch images
#   stamped VERSION=vX.Y.Z, scanned, signed and attested.
#
# The version: an explicit vX.Y.Z, or --bump from the latest vX.Y.Z tag
# (seeding v0.1.0 when no tag exists). Refuses to clobber an existing tag
# (locally, and on origin with --push). --allow-dirty skips only the general
# clean-tree check; --prepare still refuses a modified package.json so unrelated
# package edits cannot be swept into the release commit.
#
# Strict semver: v(0|[1-9][0-9]*).(0|[1-9][0-9]*).(0|[1-9][0-9]*) — no leading
# zeros, no pre-release/build suffix (those are `git describe` territory).
# macOS bash 3.2 compatible: no associative arrays, no ${var,,}, no mapfile.
set -eu

SEMVER_RE='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'
SEED_VERSION="v0.1.0"

usage() {
  sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  printf 'release: %s\n' "$*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Pure version computation (covered by --self-test; no git, no filesystem).
# ---------------------------------------------------------------------------

is_semver() {
  printf '%s' "$1" | grep -Eq "$SEMVER_RE"
}

# Print the highest valid vX.Y.Z from stdin (one tag per line), or nothing.
latest_semver() {
  grep -E "$SEMVER_RE" | sed 's/^v//' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1 | sed 's/^/v/'
}

# bump_version <vX.Y.Z|""> <patch|minor|major> → next version.
# An empty current version seeds SEED_VERSION regardless of the part.
bump_version() {
  local current="$1" part="$2" major minor patch
  if [ -z "$current" ]; then
    printf '%s\n' "$SEED_VERSION"
    return 0
  fi
  is_semver "$current" || return 1
  major="${current#v}"; major="${major%%.*}"
  minor="${current#v*.}"; minor="${minor%%.*}"
  patch="${current##*.}"
  case "$part" in
    major) major=$((major + 1)); minor=0; patch=0 ;;
    minor) minor=$((minor + 1)); patch=0 ;;
    patch) patch=$((patch + 1)) ;;
    *) return 1 ;;
  esac
  printf 'v%s.%s.%s\n' "$major" "$minor" "$patch"
}

# resolve_version <explicit|""> <bump|""> <tag-list> → the version to cut.
resolve_version() {
  local explicit="$1" bump="$2" tags="$3" latest
  if [ -n "$explicit" ]; then
    is_semver "$explicit" || return 1
    printf '%s\n' "$explicit"
    return 0
  fi
  [ -n "$bump" ] || return 1
  latest="$(printf '%s\n' "$tags" | latest_semver)"
  bump_version "$latest" "$bump"
}

self_test() {
  local fails=0
  check() { # check <description> <expected> <actual>
    if [ "$2" = "$3" ]; then
      printf 'ok   %s\n' "$1"
    else
      printf 'FAIL %s: expected [%s] got [%s]\n' "$1" "$2" "$3"
      fails=$((fails + 1))
    fi
  }
  check "explicit version" "v1.2.3" "$(resolve_version v1.2.3 "" "" || echo err)"
  check "explicit rejects leading zero" "err" "$(resolve_version v1.02.3 "" "" || echo err)"
  check "explicit rejects missing v" "err" "$(resolve_version 1.2.3 "" "" || echo err)"
  check "explicit rejects suffix" "err" "$(resolve_version v1.2.3-rc1 "" "" || echo err)"
  check "seed when no tags (patch)" "v0.1.0" "$(resolve_version "" patch "" || echo err)"
  check "seed when no tags (major)" "v0.1.0" "$(resolve_version "" major "" || echo err)"
  check "seed ignores non-semver tags" "v0.1.0" "$(resolve_version "" patch "$(printf 'foo\nv1.2\nv01.2.3\nv1.2.3-rc1')" || echo err)"
  check "bump patch" "v1.2.4" "$(resolve_version "" patch "$(printf 'v1.2.3\nv1.2.2')" || echo err)"
  check "bump minor resets patch" "v1.3.0" "$(resolve_version "" minor "v1.2.3" || echo err)"
  check "bump major resets minor+patch" "v2.0.0" "$(resolve_version "" major "v1.2.3" || echo err)"
  check "numeric (not lexical) ordering" "v1.10.1" "$(resolve_version "" patch "$(printf 'v1.9.0\nv1.10.0\nv1.2.0')" || echo err)"
  check "unknown bump part" "err" "$(resolve_version "" hotfix "v1.2.3" || echo err)"
  check "neither explicit nor bump" "err" "$(resolve_version "" "" "v1.2.3" || echo err)"
  check "latest_semver picks highest" "v3.0.0" "$(printf 'v3.0.0\nv2.9.9\nv10.0' | latest_semver)"
  if [ "$fails" -ne 0 ]; then
    printf '%s self-test case(s) failed\n' "$fails" >&2
    return 1
  fi
  printf 'all self-test cases passed\n'
}

# ---------------------------------------------------------------------------
# Git-touching part.
# ---------------------------------------------------------------------------

# package_version <working-tree|HEAD>: the top-level "version" in package.json.
# The tag phase reads the COMMITTED file (HEAD:package.json), so an uncommitted
# bump under --allow-dirty can never satisfy the "version already landed via
# PR" check; --prepare edits and commits the working-tree file.
package_version() {
  case "$1" in
    HEAD) git show HEAD:package.json 2>/dev/null ;;
    *) [ -f package.json ] || die "package.json not found in $(pwd)"; cat package.json ;;
  esac | sed -n 's/^  "version": "\([^"]*\)",$/\1/p' | head -n 1
}

main() {
  local explicit="" bump="" push=0 allow_dirty=0 prepare=0 version tags branch root current

  while [ $# -gt 0 ]; do
    case "$1" in
      --self-test) self_test; exit $? ;;
      --prepare) prepare=1 ;;
      --bump)
        [ $# -ge 2 ] || die "--bump needs patch|minor|major"
        bump="$2"; shift ;;
      --bump=*) bump="${1#--bump=}" ;;
      --push) push=1 ;;
      --allow-dirty) allow_dirty=1 ;;
      -h|--help) usage; exit 0 ;;
      -*) die "unknown option: $1 (see --help)" ;;
      *)
        [ -z "$explicit" ] || die "only one version may be given"
        explicit="$1" ;;
    esac
    shift
  done

  if [ -n "$explicit" ] && [ -n "$bump" ]; then
    die "give either an explicit version or --bump, not both"
  fi
  if [ -z "$explicit" ] && [ -z "$bump" ]; then
    usage >&2
    exit 1
  fi
  if [ "$prepare" -eq 1 ] && [ "$push" -eq 1 ]; then
    die "--prepare commits for a PR; it does not push (push the branch and open the PR)"
  fi
  case "$bump" in ""|patch|minor|major) ;; *) die "--bump must be patch|minor|major";; esac

  root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "not inside a git repository"
  cd "$root"

  branch="$(git rev-parse --abbrev-ref HEAD)"
  # A bump must be based on the remote tag set, not whatever tags happen to
  # exist in a stale local clone. This applies to --prepare too: otherwise the
  # documented PR phase can prepare an already-used version and only discover
  # the collision after merge. A pushed explicit version also fetches so the
  # main/ref and remote-tag checks below use current state.
  if [ "$push" -eq 1 ]; then
    [ "$branch" = "main" ] || die "must be on main to tag (on '$branch'); use --prepare on a feature branch for the version bump"
    git fetch -q --tags origin main || die "could not fetch origin/main and tags"
  elif [ -n "$bump" ] && git remote get-url origin >/dev/null 2>&1; then
    git fetch -q --tags origin || die "could not fetch origin tags for --bump"
  fi
  tags="$(git tag -l 'v*')"
  version="$(resolve_version "$explicit" "$bump" "$tags")" \
    || die "invalid version '${explicit}' (want vX.Y.Z, no leading zeros, no suffix)"

  if git rev-parse -q --verify "refs/tags/$version" >/dev/null; then
    die "tag $version already exists locally — refusing to clobber"
  fi
  if [ "$allow_dirty" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    die "working tree is not clean (commit or stash, or pass --allow-dirty)"
  fi

  # ---- Phase 1: --prepare — the version bump, as a commit for a PR ----------
  if [ "$prepare" -eq 1 ]; then
    [ "$branch" != "main" ] || die "--prepare must run on a feature branch, not main (all work lands via PR)"
    if ! git diff --quiet -- package.json || ! git diff --cached --quiet -- package.json; then
      die "--prepare refuses a modified package.json; commit or stash those edits first"
    fi
    current="$(package_version working-tree)"
    [ -n "$current" ] || die 'could not read "version" from package.json'
    if [ "$current" = "${version#v}" ]; then
      printf 'release: package.json already at %s — nothing to prepare; open the PR, then tag on main\n' "$current"
      return 0
    fi
    # Rewrite the single top-level "version" line in place (portable: no
    # `sed -i` flag differences between GNU and BSD).
    sed "s/^  \"version\": \"$current\",\$/  \"version\": \"${version#v}\",/" package.json > package.json.release.tmp
    mv package.json.release.tmp package.json
    grep -q "^  \"version\": \"${version#v}\",\$" package.json \
      || die "failed to set package.json version to ${version#v}"
    git add package.json
    git commit -q -m "release: $version" -- package.json
    printf 'release: package.json %s -> %s committed on %s\n' "$current" "${version#v}" "$branch"
    printf 'release: push the branch, open a PR, merge it, then on main:\n  scripts/release.sh %s --push\n' "$version"
    return 0
  fi

  # ---- Phase 2: tag the reviewed release commit on main ---------------------
  [ "$branch" = "main" ] || die "must be on main to tag (on '$branch'); use --prepare on a feature branch for the version bump"
  current="$(package_version HEAD)"
  [ -n "$current" ] || die 'could not read "version" from HEAD:package.json'
  if [ "$current" != "${version#v}" ]; then
    die "committed package.json (HEAD) is at $current, not ${version#v}: land the bump via PR first (scripts/release.sh --prepare $version on a feature branch)"
  fi
  if [ "$push" -eq 1 ]; then
    [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] \
      || die "main is not at origin/main — pull (or push via PR) so the tag lands on the reviewed commit"
    if git ls-remote --exit-code --tags origin "refs/tags/$version" >/dev/null 2>&1; then
      die "tag $version already exists on origin — refusing to clobber"
    fi
  fi

  git tag -a "$version" -m "Release $version"
  printf 'release: tagged %s at %s\n' "$version" "$(git rev-parse --short HEAD)"

  if [ "$push" -eq 1 ]; then
    git push origin "refs/tags/$version"
    printf 'release: pushed %s — publish-images.yml will build, scan, sign and attest it\n' "$version"
  else
    printf 'release: not pushed. To publish:\n  git push origin refs/tags/%s\n' "$version"
  fi
}

main "$@"
