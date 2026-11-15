/**
 * Which substrate sessions this browser has open as tabs, plus the
 * provisional repo/branch a user typed at launch (dx#117 is still open, so
 * the backend has no field for it). Per-viewer convenience only: sessions
 * themselves always come from the server. Every storage access is guarded,
 * because storage can be missing or throw (private windows, blocked site data).
 */
export interface OpenTab {
  id: string;
  /** Provisional (dx#117): not sent to the backend, not applied to the actor. */
  repo?: string;
  branch?: string;
}

const KEY = "daax.substrate.openTabs.v1";

export function readOpenTabs(): OpenTab[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is OpenTab =>
          !!t && typeof t === "object" && typeof (t as OpenTab).id === "string",
      )
      .map((t) => ({
        id: t.id,
        ...(typeof t.repo === "string" ? { repo: t.repo } : {}),
        ...(typeof t.branch === "string" ? { branch: t.branch } : {}),
      }));
  } catch {
    return [];
  }
}

export function writeOpenTabs(tabs: OpenTab[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    /* storage unavailable: tabs simply are not remembered */
  }
}

/** Add (or update) a tab; returns the new list. */
export function addOpenTab(tabs: OpenTab[], tab: OpenTab): OpenTab[] {
  const rest = tabs.filter((t) => t.id !== tab.id);
  const prev = tabs.find((t) => t.id === tab.id);
  return [...rest, { ...prev, ...tab }];
}

export function removeOpenTab(tabs: OpenTab[], id: string): OpenTab[] {
  return tabs.filter((t) => t.id !== id);
}

/** Validation for the provisional branch field (git check-ref-format, simplified). */
export function branchError(branch: string): string | null {
  const b = branch.trim();
  if (!b) return null;
  if (
    b.length > 200 ||
    /[\s~^:?*[\\\x00-\x1f\x7f]/.test(b) ||
    b.includes("..") ||
    b.includes("@{") ||
    b.startsWith("/") ||
    b.endsWith("/") ||
    b.endsWith(".") ||
    b.endsWith(".lock") ||
    b.startsWith("-")
  ) {
    return "not a valid git branch name";
  }
  return null;
}

/** Validation for the provisional repo field: owner/name or an https/ssh git URL. */
export function repoError(repo: string): string | null {
  const r = repo.trim();
  if (!r) return null;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r)) return null;
  if (/^https:\/\/[^\s/]+\/[^\s]+$/.test(r)) return null;
  if (/^git@[^\s:]+:[^\s]+$/.test(r)) return null;
  return "use owner/name, an https:// URL or git@host:path";
}
