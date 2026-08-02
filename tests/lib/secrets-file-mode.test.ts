/**
 * R3: the plaintext secrets file (.secrets.json) must be written owner-only
 * (0600) so a token is never left umask-dependent world/group-readable.
 * Skips on non-POSIX platforms where file mode bits are not meaningful.
 */
import { describe, it, expect, afterEach } from "vitest";
import { statSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const SECRETS_FILE = join(process.cwd(), ".secrets.json");
const isPosix = process.platform !== "win32";
// NEVER clobber a real developer/CI secrets file: if one already exists at load
// time, skip the whole suite rather than overwriting/deleting it.
const preExisting = existsSync(SECRETS_FILE);

async function freshSaveSecrets() {
  // Import lazily so the module picks up cwd at call time.
  const mod = await import("@/lib/secrets");
  return mod.saveSecrets;
}

afterEach(() => {
  if (!preExisting && existsSync(SECRETS_FILE)) rmSync(SECRETS_FILE);
});

describe.skipIf(!isPosix || preExisting)("saveSecrets file mode (R3)", () => {
  it("creates .secrets.json with mode 0600", async () => {
    if (existsSync(SECRETS_FILE)) rmSync(SECRETS_FILE);
    const saveSecrets = await freshSaveSecrets();
    saveSecrets({ githubToken: "t0ken" });
    const mode = statSync(SECRETS_FILE).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("tightens an already-existing world-readable file to 0600", async () => {
    // Simulate a pre-hardening file with loose perms.
    writeFileSync(SECRETS_FILE, "{}", { mode: 0o644 });
    const saveSecrets = await freshSaveSecrets();
    saveSecrets({ githubToken: "t0ken" });
    const mode = statSync(SECRETS_FILE).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
