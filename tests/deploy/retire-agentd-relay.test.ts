/**
 * deploy/host/retire-agentd-relay.sh with stub docker / systemctl / ss.
 *
 * The relay must survive every case where the tailnet path is not proven, and
 * the script must never report success while anything but agentd listens.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Every case spawns the real script through stubbed tools; under a full-suite
// run the default 5s budget is exceeded (review r7), so give the file 30s.
vi.setConfig({ testTimeout: 30_000 });

const SCRIPT = resolve(__dirname, "../../deploy/host/retire-agentd-relay.sh");

let home: string;
let bin: string;
let log: string;

function stub(name: string, body: string) {
  const p = join(bin, name);
  writeFileSync(p, `#!/bin/bash\n${body}\n`);
  chmodSync(p, 0o755);
}

const GOOD_ENV =
  "AGENTVIEW_DAEMON_URL=https://agents.galway.poley.dev\\nAGENTVIEW_DAEMON_TOKEN_FILE=/run/agentview/token";
const AGENTD_ONLY =
  'LISTEN 0 32768 127.0.0.1:7717 0.0.0.0:* users:(("agentd",pid=4242,fd=3))';

beforeEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = mkdtempSync(join(tmpdir(), "daax-retire-relay-"));
  bin = join(home, "bin");
  log = join(home, "calls.log");
  mkdirSync(bin);
  mkdirSync(join(home, ".config/systemd/user"), { recursive: true });
  mkdirSync(join(home, ".local/bin"), { recursive: true });
  writeFileSync(
    join(home, ".config/systemd/user/agentd-docker-relay.service"),
    "",
  );
  writeFileSync(join(home, ".local/bin/agentd-docker-relay"), "");
});

function setup({
  env = GOOD_ENV,
  probe = "200",
  relayState = "inactive",
  listeners = AGENTD_ONLY,
  ssExit = 0,
  withSs = true,
  mainPid = "4242",
  stopExit = 0,
}: {
  env?: string;
  probe?: string;
  relayState?: string;
  listeners?: string;
  ssExit?: number;
  withSs?: boolean;
  mainPid?: string;
  stopExit?: number;
} = {}) {
  stub(
    "docker",
    `echo "docker $*" >> "${log}"
case "$1" in
  inspect) printf '${env}\\n' ;;
  exec) echo ${probe} ;;
esac`,
  );
  stub(
    "systemctl",
    `echo "systemctl $*" >> "${log}"
case "$*" in
  *is-active*) echo "${relayState}" ;;
  *"stop agentd-docker-relay"*) exit ${stopExit} ;;
  *"show -p MainPID"*) echo ${mainPid} ;;
  *) exit 0 ;;
esac`,
  );
  if (withSs) stub("ss", `printf '%s\\n' '${listeners}'; exit ${ssExit}`);
  // The real system tools the script needs besides the stubs.
  for (const tool of ["sed", "awk", "grep", "tail", "rm", "id", "printf"]) {
    const found = spawnSync("bash", ["-c", `command -v ${tool}`], {
      encoding: "utf8",
    }).stdout.trim();
    if (found && !existsSync(join(bin, tool))) {
      spawnSync("ln", ["-s", found, join(bin, tool)]);
    }
  }
}

function run() {
  return spawnSync("/bin/bash", [SCRIPT], {
    env: { PATH: bin, HOME: home } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

const relayFiles = () =>
  existsSync(join(home, ".config/systemd/user/agentd-docker-relay.service")) ||
  existsSync(join(home, ".local/bin/agentd-docker-relay"));
const stopped = () =>
  existsSync(log) && /stop agentd-docker-relay/.test(readFileSync(log, "utf8"));

describe("retire-agentd-relay.sh", () => {
  it("retires the relay once daax reads agentd over the tailnet and only agentd listens", () => {
    setup();
    const r = run();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(relayFiles()).toBe(false);
    expect(r.stdout).toMatch(/relay retired/);
    // The verdict must come from daax's own authenticated Agent View route,
    // not from whatever `docker exec` happens to print.
    const calls = readFileSync(log, "utf8");
    expect(calls).toMatch(/docker exec daax node -e .*\/api\/agentview\/node/);
    expect(calls).toMatch(/DAAX_PROXY_SECRET/);
  });

  it("accepts a daemon URL with one trailing slash, as deploy.sh and the runtime do", () => {
    setup({
      env: "AGENTVIEW_DAEMON_URL=https://agents.galway.poley.dev/\\nAGENTVIEW_DAEMON_TOKEN_FILE=/run/agentview/token",
    });
    const r = run();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(relayFiles()).toBe(false);
  });

  it("refuses, changing nothing, when daax is not on the tailnet path yet", () => {
    setup({ env: "AGENTVIEW_DAEMON_URL=" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(false);
    expect(relayFiles()).toBe(true);
  });

  it("refuses when agentd does not accept daax's session", () => {
    setup({ probe: "401" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/answered 401/);
    expect(stopped()).toBe(false);
    expect(relayFiles()).toBe(true);
  });

  it("keeps the unit and binary when the relay is still active after stop", () => {
    setup({ relayState: "active" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/is .active. after stop/);
    expect(relayFiles()).toBe(true);
  });

  it("refuses when daax has no admin subject to verify Agent View with", () => {
    setup({ probe: "noauth" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/DAAX_ADMIN_USERS/);
    expect(stopped()).toBe(false);
  });

  it("removes nothing when the stop itself fails", () => {
    setup({ stopExit: 1 });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(relayFiles()).toBe(true);
  });

  it("removes nothing when the relay's state is unknown after stop", () => {
    setup({ relayState: "" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/not inactive/);
    expect(relayFiles()).toBe(true);
  });

  it("removes nothing when the listener check fails after the stop", () => {
    setup({
      listeners: `${AGENTD_ONLY}\nLISTEN 0 5 172.22.0.1:7717 0.0.0.0:* users:(("socat",pid=99,fd=5))`,
    });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(relayFiles()).toBe(true);
  });

  it("fails when ss is missing", () => {
    setup({ withSs: false });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(stopped()).toBe(false);
  });

  it("fails when ss fails", () => {
    setup({ ssExit: 1 });
    expect(run().status).not.toBe(0);
  });

  it("fails when nothing listens on 7717", () => {
    setup({ listeners: "" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/nothing listens/);
  });

  it("fails when a non-loopback listener remains", () => {
    setup({
      listeners: `${AGENTD_ONLY}\nLISTEN 0 5 172.22.0.1:7717 0.0.0.0:* users:(("socat",pid=99,fd=5))`,
    });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/172\.22\.0\.1:7717/);
  });

  it("fails when agentd itself listens beyond loopback", () => {
    setup({
      listeners:
        'LISTEN 0 32768 0.0.0.0:7717 0.0.0.0:* users:(("agentd",pid=4242,fd=3))',
    });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/0\.0\.0\.0:7717/);
  });

  it("fails when the loopback listener is not agentd.service", () => {
    setup({ mainPid: "777" });
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/is not agentd\.service/);
  });
});
