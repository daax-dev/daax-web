FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl docker.io \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /suite

COPY package.json ./
RUN npm install --no-audit --no-fund --loglevel=error

COPY tsconfig.json vitest.config.ts modules.json ./
COPY src ./src

ENV TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal
ENV TESTCONTAINERS_RYUK_DISABLED=true
ENV NODE_OPTIONS=--no-warnings

CMD ["npx", "vitest", "run"]
