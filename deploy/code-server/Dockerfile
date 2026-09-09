# Daax Code-Server with Language Runtimes
#
# ──────────────────────────────────────────────────────────────────────────────
# VENDORED — self-contained so daax-web builds code-server on any machine
# without the sibling daax-devtools repo. Synced from
# daax-devtools/devcontainer/Dockerfile.code-server; keep the two in sync
# (or pick one canonical home) if you change runtime versions.
# This file has no COPY/ADD, so the build needs no context — only network.
# ──────────────────────────────────────────────────────────────────────────────
#
# Extends codercom/code-server with language toolchains so the integrated
# terminal is actually useful. Languages included:
#   - Go (version-pinned, sha256-verified download for reproducible builds)
#   - Python 3 + uv (via pip — no remote installer scripts)
#   - Rust (via apt — no curl | sh)
#   - Common build tools: gcc, make, git, jq
#
# Note: Node.js is intentionally omitted — codercom/code-server bundles it.

# Digest-pinned base (matches the top-level Dockerfile's policy) so a registry-side
# tag update cannot silently change the base; the digest is the multi-arch index
# digest, valid on amd64 + arm64. Bumped 4.108.2 -> 4.136.2 for CRITICAL CVEs:
# 4.108.2 carried 17 fixable criticals of its own (handlebars in the bundled
# vscode extensions, an old git-lfs, basic-ftp, libgnutls30/libssl3/openssl/
# libssh2-1), and 4.136.2 carries 1 (a go1.24.4 stdlib inside upstream's own
# /usr/bin/git-lfs, which we do not build and cannot patch from here).
# Note: 4.136.2 moved upstream from Debian 12 (bookworm) to Debian 13 (trixie),
# so the apt-installed toolchains move with it — python3 3.11 -> 3.13, rustc
# 1.63 -> 1.85. Verified in the built image (go/python3/uv/rustc/git/jq all
# resolve, code-server reports 4.136.2 with Code 1.136.1).
FROM codercom/code-server:4.136.2@sha256:c5124f5066506cfff7ac2dfa6bab254ea55062dd24aac9a3693bb3d9caa9b90e

USER root

# ── System packages ────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cargo \
    curl \
    git \
    jq \
    make \
    python3 \
    python3-pip \
    python3-venv \
    rustc \
    unzip \
    zip \
    && rm -rf /var/lib/apt/lists/*

# ── Go (sha256-verified) ───────────────────────────────────────────────────────
# The 1.24.1 toolchain we unpack into /usr/local/go was itself the largest single
# source of fixable CRITICAL findings in this image: grype flagged go1.24.1 stdlib
# in /usr/local/go/bin/go and the linux_*/pprof + linux_*/trace tools — 9 of the
# 26 fixable criticals measured on an arm64 build of this file. 1.27.1 is the
# current release, and nothing in this repo builds Go code — the toolchain is
# here so the code-server terminal is useful — so there is no reason to stay on
# an older line. 1.26.8 is kept below as the previous release line for anyone
# who needs to pin back.
ARG GO_VERSION=1.27.1
ARG TARGETARCH
RUN if [ -z "${TARGETARCH}" ]; then echo "ERROR: TARGETARCH is not set. Provide a valid architecture (amd64 or arm64)." >&2; exit 1; fi \
    && GOARCH="${TARGETARCH}" \
    && case "${GOARCH}" in \
        "amd64") GOTAR="go${GO_VERSION}.linux-amd64.tar.gz" ;; \
        "arm64") GOTAR="go${GO_VERSION}.linux-arm64.tar.gz" ;; \
        *)        echo "Unsupported GOARCH '${GOARCH}'. Supported values: amd64, arm64." >&2; exit 1 ;; \
    esac \
    && case "${GO_VERSION}-${GOARCH}" in \
        "1.27.1-amd64") GOSHA="63d339f0da5ab53635a56f2490a7984dfe12dfcff22ad749f63edaf590168445" ;; \
        "1.27.1-arm64") GOSHA="3450b45a3f9ee8568792736a5c5e70a1f2e9b36c35a8f74958c03e51d7d92bec" ;; \
        "1.26.8-amd64") GOSHA="d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b" ;; \
        "1.26.8-arm64") GOSHA="211ffced9dcb9633a55eac6364816ec0ddd951389a740e88fa8b3337971bdda0" ;; \
        *) echo "No pinned SHA for go${GO_VERSION}-${GOARCH}; update Dockerfile.code-server." >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://go.dev/dl/${GOTAR}" -o "/tmp/${GOTAR}" \
    && cd /tmp \
    && echo "${GOSHA}  ${GOTAR}" | sha256sum -c - \
    && tar -C /usr/local -xzf "/tmp/${GOTAR}" \
    && rm "/tmp/${GOTAR}" \
    && /usr/local/go/bin/go version

ENV PATH="/usr/local/go/bin:${PATH}"

# ── uv (Python package manager, installed via pip, version-pinned) ───────────
ARG UV_VERSION=0.12.12
RUN pip3 install --no-cache-dir --break-system-packages "uv==${UV_VERSION}" \
    && uv --version

# ── Per-user environment ───────────────────────────────────────────────────────
RUN mkdir -p /home/coder/go/bin && chown -R coder:coder /home/coder/go

USER coder

RUN printf '\nexport GOPATH="$HOME/go"\nexport GOBIN="$HOME/go/bin"\nexport PATH="/usr/local/go/bin:$GOBIN:$PATH"\n' \
    | tee -a /home/coder/.bashrc >> /home/coder/.zshrc

# ── Verify ─────────────────────────────────────────────────────────────────────
USER root
RUN /usr/local/go/bin/go version \
    && python3 --version \
    && uv --version \
    && rustc --version

USER coder
