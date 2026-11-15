/**
 * What a user may see about a substrate failure (both planes). Raw
 * kubectl-ate stderr (endpoints, paths, identities) goes to the server log
 * only. No `server-only` import: the terminal server uses it too.
 */
export function publicReason(err: unknown): string {
  const s = String((err as Error)?.message ?? err).toLowerCase();
  if (s.includes("tunnel exited") || s.includes("closed before open"))
    return "could not reach the session (is it running?)";
  if (s.includes("healthz"))
    return "the session's terminal did not become ready";
  if (s.includes("timed out")) return "the substrate API timed out";
  if (s.includes("not found")) return "the actor no longer exists";
  if (s.includes("quota") || s.includes("resourceexhausted"))
    return "the cluster has no capacity for this session";
  if (s.includes("unavailable") || s.includes("connection refused"))
    return "the substrate API is unavailable";
  if (s.includes("permission") || s.includes("unauthenticated"))
    return "daax is not authorized for this substrate operation";
  return "the substrate operation failed (see server logs)";
}
