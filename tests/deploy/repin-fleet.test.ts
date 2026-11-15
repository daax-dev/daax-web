/**
 * scripts/repin-fleet.sh repins every fleet env file to the images published
 * for one commit, and refuses unless each digest is signed by this repo's main
 * publish workflow at that commit, multi-arch, and labelled with that commit.
 *
 * docker and cosign are shims on DOCKER_BIN / COSIGN_BIN; the registry is a
 * directory of raw index documents and per-platform label sets.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../scripts/repin-fleet.sh");
const SHA = "0123456789abcdef0123456789abcdef01234567";
const OLD = "f".repeat(64);
const REPOS = ["daax-web", "daax-terminal", "code-server"] as const;

let root: string;
let envDir: string;
let reg: string;

function fleetFile(name: string): void {
  writeFileSync(
    join(envDir, `${name}.env`),
    [
      `DAAX_HOSTNAME=${name}`,
      `DAAX_HOST_REF=${"a".repeat(40)}`,
      "# Now at daax-web aaaaaaa (old note); every digest cosign-verified.",
      `DAAX_IMAGE=ghcr.io/daax-dev/daax-web@sha256:${OLD}`,
      `DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@sha256:${OLD}`,
      `CODE_SERVER_IMAGE=ghcr.io/daax-dev/code-server@sha256:${OLD}`,
      `WATCHTOWER_IMAGE=ghcr.io/daax-dev/watchtower@sha256:${OLD}`,
      `HAWKEYE_IMAGE=ghcr.io/daax-dev/hawkeye@sha256:${OLD}`,
      `PROVENANCE_IMAGE=ghcr.io/daax-dev/provenance@sha256:${OLD}`,
      "",
    ].join("\n"),
  );
}

/** Publish <repo>:sha-<short> with the given platforms and revision label. */
function publish(
  repo: string,
  opts: { platforms?: string[]; revision?: string } = {},
): string {
  const platforms = opts.platforms ?? ["linux/amd64", "linux/arm64"];
  const raw = JSON.stringify({
    manifests: [
      ...platforms.map((p) => ({
        platform: { os: p.split("/")[0], architecture: p.split("/")[1] },
      })),
      { platform: { os: "unknown", architecture: "unknown" } },
    ],
  });
  const digest = createHash("sha256").update(raw).digest("hex");
  writeFileSync(join(reg, `${repo}--sha-${SHA.slice(0, 7)}.raw`), raw);
  writeFileSync(join(reg, `${repo}--sha256:${digest}.raw`), raw);
  writeFileSync(
    join(reg, `${repo}--sha256:${digest}.labels`),
    JSON.stringify({
      "org.opencontainers.image.revision": opts.revision ?? SHA,
    }),
  );
  return `sha256:${digest}`;
}

function run(cosignOk = true) {
  const bin = join(root, "bin");
  // docker buildx imagetools inspect <ref> (--raw | --format ...)
  writeFileSync(
    join(bin, "docker"),
    `#!/usr/bin/env bash
ref="$4"; repo="\${ref#ghcr.io/daax-dev/}"; name="\${repo%%[:@]*}"; tag="\${repo#"$name"}"; tag="\${tag#[:@]}"
f="$REG/$name--$tag"
case "$5" in
  --raw) [ -f "$f.raw" ] || exit 1; printf '%s' "$(cat "$f.raw")" ;;
  --format) cat "$f.labels" ;;
esac
`,
  );
  writeFileSync(
    join(bin, "cosign"),
    `#!/usr/bin/env bash\necho "$*" >> "$REG/cosign.log"\nexit ${cosignOk ? 0 : 1}\n`,
  );
  chmodSync(join(bin, "docker"), 0o755);
  chmodSync(join(bin, "cosign"), 0o755);
  return spawnSync("bash", [SCRIPT, SHA, "security repin, daax-web#999"], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      DOCKER_BIN: join(bin, "docker"),
      COSIGN_BIN: join(bin, "cosign"),
      DAAX_ENV_DIR: envDir,
      REG: reg,
    },
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "repin-fleet-"));
  envDir = join(root, "env");
  reg = join(root, "reg");
  for (const d of [envDir, reg, join(root, "bin")]) mkdirSync(d);
  for (const h of ["galway", "kinsale", "muckross"]) fleetFile(h);
  writeFileSync(join(envDir, "cloud.env"), "DAAX_HOSTNAME=cloud\n");
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("repin-fleet.sh", () => {
  it("repins every fleet file identically and leaves the others alone", () => {
    const d = Object.fromEntries(REPOS.map((r) => [r, publish(r)]));
    const r = run();
    expect(r.status, r.stderr).toBe(0);
    for (const h of ["galway", "kinsale", "muckross"]) {
      const t = readFileSync(join(envDir, `${h}.env`), "utf8");
      expect(t).toContain(`DAAX_HOST_REF=${SHA}`);
      expect(t).toContain(
        `DAAX_IMAGE=ghcr.io/daax-dev/daax-web@${d["daax-web"]}`,
      );
      expect(t).toContain(
        `DAAX_TERMINAL_IMAGE=ghcr.io/daax-dev/daax-terminal@${d["daax-terminal"]}`,
      );
      expect(t).toContain(
        `CODE_SERVER_IMAGE=ghcr.io/daax-dev/code-server@${d["code-server"]}`,
      );
      expect(t).toContain(
        `WATCHTOWER_IMAGE=ghcr.io/daax-dev/watchtower@sha256:${OLD}`,
      );
      expect(t).toContain(
        "# Now at daax-web 0123456 (security repin, daax-web#999); every digest cosign-verified.",
      );
    }
    expect(readFileSync(join(envDir, "cloud.env"), "utf8")).toBe(
      "DAAX_HOSTNAME=cloud\n",
    );
    const log = readFileSync(join(reg, "cosign.log"), "utf8");
    expect(log).toContain(`--certificate-github-workflow-sha ${SHA}`);
    expect(log).toContain("publish-images\\.yml@refs/heads/main$");
  });

  it.each([
    ["a single-arch index", { platforms: ["linux/amd64"] }, /platforms/],
    [
      "a revision label from another commit",
      { revision: "b".repeat(40) },
      /revision label/,
    ],
  ])("refuses %s and changes nothing", (_label, opts, msg) => {
    publish("daax-web", opts);
    publish("daax-terminal");
    publish("code-server");
    const before = readFileSync(join(envDir, "kinsale.env"), "utf8");
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(msg);
    expect(readFileSync(join(envDir, "kinsale.env"), "utf8")).toBe(before);
  });

  it("refuses a digest cosign does not verify", () => {
    for (const repo of REPOS) publish(repo);
    const r = run(false);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/cosign verify/);
  });

  it("refuses a commit with no published images", () => {
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not found/);
  });
});
