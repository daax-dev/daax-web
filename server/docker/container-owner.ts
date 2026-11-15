/**
 * Container owner lookup for the terminal server (dx#119).
 *
 * Reads the `daax.owner` label of a named container so `docker exec` into it
 * can be refused for anyone but its owner (or an admin). No Next imports: the
 * terminal server runs outside Next.
 */
import { execFile } from "node:child_process";

import { ownerFromLabels } from "../../lib/tenancy/ownership";

export type InspectLabels = (
  name: string,
) => Promise<Record<string, string> | null>;

/** `docker inspect` the container's labels; null when it does not exist. */
export const dockerInspectLabels: InspectLabels = (name) =>
  new Promise((resolve) => {
    execFile(
      "docker",
      [
        "inspect",
        "--type",
        "container",
        "--format",
        "{{json .Config.Labels}}",
        name,
      ],
      { timeout: 10_000, maxBuffer: 256 * 1024 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const parsed = JSON.parse(String(stdout).trim() || "null");
          resolve(parsed && typeof parsed === "object" ? parsed : {});
        } catch {
          resolve({});
        }
      },
    );
  });

/**
 * The container as an owned resource: `null` when it does not exist, else
 * `{ owner }` (owner null for a container daax did not label — admins only).
 */
export async function lookupContainerOwner(
  name: string,
  inspect: InspectLabels = dockerInspectLabels,
): Promise<{ owner: string | null } | null> {
  const labels = await inspect(name);
  if (labels === null) return null;
  return { owner: ownerFromLabels(labels) };
}
