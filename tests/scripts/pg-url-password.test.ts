/**
 * URL-password decode round-trip for the backup/restore scripts (issue #103).
 *
 * `scripts/pg-backup.sh` and `scripts/pg-restore.sh` lift the `:password` out of
 * a `DATABASE_URL` and hand it to libpq via PGPASSWORD (so it never sits on argv
 * where `ps` can read it). The password is percent-decoded. This test invokes
 * the REAL `url_decode` + `strip_url_password` functions from each script (via a
 * bash subshell that sources just those two function definitions) and asserts
 * the decoded PGPASSWORD is byte-exact.
 *
 * Regression guard for the `printf %b` bug: a password with an encoded backslash
 * immediately followed by an escape char (`%5Cn` -> the two chars `\` and `n`)
 * must NOT be reinterpreted (e.g. `\n` collapsing to a newline).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";

import { describe, it, expect } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Run the script's real `strip_url_password` on a URI and return the exact bytes
 * it exports as PGPASSWORD. Sources only the two helper function definitions
 * from the script (not its executable body), so no pg_dump/pg_restore runs.
 */
function decodePassword(scriptRelPath: string, uri: string): string {
  const scriptPath = path.join(REPO_ROOT, scriptRelPath);
  const program = [
    "set -euo pipefail",
    // Extract just `url_decode` and `strip_url_password` (each from its `name()`
    // line to the next line that starts a top-level `}`) and eval them.
    `source <(sed -n '/^url_decode()/,/^}/p;/^strip_url_password()/,/^}/p' "$1")`,
    'strip_url_password "$2"',
    "printf '%s' \"${PGPASSWORD-}\"",
  ].join("\n");
  const out = execFileSync("bash", ["-c", program, "bash", scriptPath, uri], {
    encoding: "buffer",
  });
  return out.toString("utf8");
}

const scripts = [
  ["pg-backup", "scripts/pg-backup.sh"],
  ["pg-restore", "scripts/pg-restore.sh"],
] as const;

describe.each(scripts)("%s strip_url_password percent-decode", (_name, rel) => {
  it("keeps an encoded backslash+n as two literal chars (no %b reinterpretation)", () => {
    // %5C -> '\', then literal 'n'  =>  the two chars "\n", NOT a newline.
    const pw = decodePassword(rel, "postgres://u:p%5Cnass@h:5432/db");
    expect(pw).toBe("p\\nass");
    expect(pw).not.toContain("\n");
    expect(pw).toHaveLength(6);
  });

  it("decodes %40 %2F %25 and a bare backslash exactly", () => {
    // a@b/c%d\  from  a%40b%2Fc%25d%5C
    const pw = decodePassword(rel, "postgres://u:a%40b%2Fc%25d%5C@h/db");
    expect(pw).toBe("a@b/c%d\\");
  });

  it("passes an unencoded password through unchanged", () => {
    const pw = decodePassword(rel, "postgres://u:plainpw@h/db");
    expect(pw).toBe("plainpw");
  });

  it("leaves an incomplete or non-hex percent sequence literal", () => {
    // trailing '%2' and '%zz' are not valid %XX and stay verbatim.
    const pw = decodePassword(rel, "postgres://u:a%zzb%2@h/db");
    expect(pw).toBe("a%zzb%2");
  });
});
