/**
 * Backend registry (dx#113). `container` is always available and is the
 * default; `substrate` exists only when DAAX_SUBSTRATE_ENABLED=1 and its
 * configuration is valid.
 */
import { containerBackend } from "./container";
import type { SubstrateBackend } from "./substrate";
import { getSubstrateRuntime } from "./substrate-runtime";

export { containerBackend } from "./container";
export {
  getSubstrateRuntime,
  closeSubstrateTransports,
  type SubstrateRuntime,
} from "./substrate-runtime";
export type { ExecutionBackend, BackendKind } from "./types";

export function backendFor(kind: "container"): typeof containerBackend;
export function backendFor(kind: "substrate"): SubstrateBackend | null;
export function backendFor(
  kind: "container" | "substrate",
): typeof containerBackend | SubstrateBackend | null {
  if (kind === "container") return containerBackend;
  const rt = getSubstrateRuntime();
  return rt.ok ? rt.backend : null;
}
