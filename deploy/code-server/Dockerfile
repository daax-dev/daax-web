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

FROM codercom/code-server:4.108.2

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
ARG GO_VERSION=1.24.1
ARG TARGETARCH
RUN if [ -z "${TARGETARCH}" ]; then echo "ERROR: TARGETARCH is not set. Provide a valid architecture (amd64 or arm64)." >&2; exit 1; fi \
    && GOARCH="${TARGETARCH}" \
    && case "${GOARCH}" in \
        "amd64") GOTAR="go${GO_VERSION}.linux-amd64.tar.gz" ;; \
        "arm64") GOTAR="go${GO_VERSION}.linux-arm64.tar.gz" ;; \
        *)        echo "Unsupported GOARCH '${GOARCH}'. Supported values: amd64, arm64." >&2; exit 1 ;; \
    esac \
    && case "${GO_VERSION}-${GOARCH}" in \
        "1.24.1-amd64") GOSHA="cb2396bae64183cdccf81a9a6df0aea3bce9511fc21469fb89a0c00470088073" ;; \
        "1.24.1-arm64") GOSHA="8df5750ffc0281017fb6070fba450f5d22b600a02081dceef47966ffaf36a3af" ;; \
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
ARG UV_VERSION=0.4.27
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
