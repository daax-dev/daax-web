/**
 * Boot-time check of DAAX_EXTRA_ALLOWED_ORIGINS for both planes.
 *
 * Kept out of `origin-allowlist.ts` so that module stays dependency-free for
 * the middleware bundle. Called by `instrumentation.ts` (Next) and
 * `server/terminal-server.ts`. It exits rather than throws: the terminal server
 * registers an uncaughtException handler before this runs, and a throw there
 * was logged and the process exited 0.
 */
import { extraAllowedOrigins } from "./origin-allowlist";

export function assertExtraOriginsAtBoot(
  plane: string,
  exit: (code: number) => never = (code) => process.exit(code),
): ReadonlySet<string> {
  let origins: ReadonlySet<string>;
  try {
    origins = extraAllowedOrigins();
  } catch (error) {
    console.error(
      `[${plane}] ${error instanceof Error ? error.message : String(error)} — refusing to start`,
    );
    return exit(1);
  }
  if (origins.size > 0) {
    console.log(`[${plane}] Extra allowed origins: ${[...origins].join(", ")}`);
  }
  return origins;
}
