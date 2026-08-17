/**
 * Regression tests for the terminal-server "Path not allowed" outage.
 *
 * Symptom (deployed site, /ai-coding, every AI tool, no project selected):
 *
 *     Connection refused (Path not allowed). Authentication/authorization
 *     failed — not retrying.
 *
 * Terminal-server log:
 *
 *     Rejected mount outside base path: /home/node/jarvis (base: /workspace)
 *
 * Chain: the WS client only serialized `basePath` when a project was selected
 * (components/terminal/TerminalManager.tsx), so a no-project session sent
 * `mount=~/jarvis` with no `basePath`. The server fell back to its hardcoded
 * "~/prj" default, took the tilde branch of resolveMountPaths(), and expanded
 * "~" with expandPath() — which inside the container resolves to the CONTAINER's
 * home, "/home/node". The resulting "/home/node/jarvis" is a container path used
 * as a HOST bind-mount source; it does not start with HOST_WORKSPACE_PATH, so
 * translatePath() cannot map it into /workspace and the #186 confinement check
 * rejected it with close code 1008.
 *
 * tildeToHostWorkspace() closes that hole: when the tilde segment names the
 * directory bind-mounted at /workspace, the path maps onto the host root
 * regardless of what the client sent as `basePath`.
 *
 * IMPORTANT (prior incident): tests for this bug must keep the host and
 * container home namespaces DISTINCT. Mocking homedir()/expandPath() so both
 * collapse to one value makes the broken code pass. tildeToHostWorkspace() takes
 * the workspace root as an explicit parameter and never reads homedir(), so
 * there is nothing to mock here — the two namespaces cannot merge.
 */
import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { tildeToHostWorkspace, expandPath } from "@/lib/path-utils";

// Models the outage deployment (HOST_WORKSPACE_PATH=/home/jpoley/jarvis bind-
// mounted at /workspace, container home /home/node), but rooted OUTSIDE any
// home directory on purpose: if the workspace root lived under the test
// runner's own home, expandPath("~/jarvis") and the host path would collapse to
// the same string on that machine and the namespace assertions below would
// prove nothing. Only the workspace BASENAME ("jarvis") matters to the mapping.
const HOST_WORKSPACE = "/srv/daax-host/jarvis";

describe("tildeToHostWorkspace", () => {
  it("maps the workspace root itself onto the host path (the outage case)", () => {
    expect(tildeToHostWorkspace("~/jarvis", HOST_WORKSPACE)).toBe(
      "/srv/daax-host/jarvis",
    );
  });

  it("maps a path under the workspace onto the host path", () => {
    expect(tildeToHostWorkspace("~/jarvis/jp/flowspec", HOST_WORKSPACE)).toBe(
      "/srv/daax-host/jarvis/jp/flowspec",
    );
  });

  it("maps a worktree path under the workspace", () => {
    expect(
      tildeToHostWorkspace(
        "~/jarvis/jp/flowspec/.worktrees/agile-lagoon-90bf",
        HOST_WORKSPACE,
      ),
    ).toBe("/srv/daax-host/jarvis/jp/flowspec/.worktrees/agile-lagoon-90bf");
  });

  it("does NOT return the home-relative path that the old code produced", () => {
    const mapped = tildeToHostWorkspace("~/jarvis", HOST_WORKSPACE);
    // expandPath() is what the old branch called; in the container it resolved
    // "~" to /home/node and produced the rejected "/home/node/jarvis". The
    // mapped result must be the HOST workspace, never a homedir()-derived path.
    expect(mapped).not.toBe(expandPath("~/jarvis"));
    expect(mapped).not.toContain(homedir());
    expect(mapped).toBe(HOST_WORKSPACE);
  });

  it("tolerates a trailing slash on the workspace root", () => {
    expect(tildeToHostWorkspace("~/jarvis/sub", "/srv/daax-host/jarvis/")).toBe(
      "/srv/daax-host/jarvis/sub",
    );
  });

  it("requires a full path-segment match (sibling-prefix is not the workspace)", () => {
    // "~/jarvis2" must NOT be treated as the "jarvis" workspace.
    expect(tildeToHostWorkspace("~/jarvis2", HOST_WORKSPACE)).toBeNull();
    expect(tildeToHostWorkspace("~/jarvis2/sub", HOST_WORKSPACE)).toBeNull();
  });

  it("does not claim tilde paths outside the workspace", () => {
    expect(tildeToHostWorkspace("~/.ssh", HOST_WORKSPACE)).toBeNull();
    expect(tildeToHostWorkspace("~/other/project", HOST_WORKSPACE)).toBeNull();
  });

  it("does not apply in host mode (no workspace root configured)", () => {
    expect(tildeToHostWorkspace("~/jarvis", "")).toBeNull();
  });

  it("ignores non-tilde paths", () => {
    expect(tildeToHostWorkspace("/workspace/foo", HOST_WORKSPACE)).toBeNull();
    expect(tildeToHostWorkspace("/app", HOST_WORKSPACE)).toBeNull();
    expect(tildeToHostWorkspace("~", HOST_WORKSPACE)).toBeNull();
  });

  it("rescues the project/worktree branch when the client sends a stale basePath", () => {
    // resolveMountPaths()'s projectName branch replaces a `basePathParam`
    // prefix with the host root. When the client sends a basePath that does not
    // prefix the mount (a stale tab, or the "~/prj" default against a "jarvis"
    // workspace), that branch fell through to "use as-is" and handed Docker a
    // literal "~/..." bind source. The same mapping now catches it.
    expect(
      tildeToHostWorkspace(
        "~/jarvis/jp/flowspec/.worktrees/serene-harbor-ykx0",
        HOST_WORKSPACE,
      ),
    ).toBe("/srv/daax-host/jarvis/jp/flowspec/.worktrees/serene-harbor-ykx0");
    // And a genuinely foreign absolute path is still left alone (null), so the
    // branch keeps its "use as-is" fallback and confinement decides.
    expect(tildeToHostWorkspace("/var/lib/secrets", HOST_WORKSPACE)).toBeNull();
  });

  it("does not widen confinement: the mapped path stays under the host root", () => {
    // The mapping only ever appends the remainder after the workspace segment,
    // so it cannot produce a path outside HOST_WORKSPACE_PATH. Traversal input
    // is still caught upstream (handleConnection rejects ".." before this runs)
    // and by isValidPath()'s canonicalized confinement check.
    for (const input of ["~/jarvis", "~/jarvis/a/b", "~/jarvis/a"]) {
      const mapped = tildeToHostWorkspace(input, HOST_WORKSPACE);
      expect(mapped).not.toBeNull();
      expect(
        mapped === HOST_WORKSPACE || mapped!.startsWith(HOST_WORKSPACE + "/"),
      ).toBe(true);
    }
  });
});
