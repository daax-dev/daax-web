/**
 * Pure PTY-input mapping for the mobile unblock view (issue #156).
 *
 * Decoupled from React and the WebSocket so the exact bytes sent to the pty are
 * unit-testable in isolation. Everything here returns the raw string that the
 * client writes as `{ type: "input", data }` — the identical message shape the
 * desktop terminal uses (server/handlers/message-handler.ts: the "input" case
 * does `ptyProcess.write(msg.data)`), so nothing new is trusted on the server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * APPROVE / DENY → CLAUDE CODE PERMISSION PROMPT MAPPING
 * ─────────────────────────────────────────────────────────────────────────────
 * Claude Code renders permission prompts as an Ink select list, e.g.:
 *
 *     Do you want to make this edit to foo.ts?
 *   ❯ 1. Yes
 *     2. Yes, and don't ask again this session
 *     3. No, and tell Claude what to do differently (esc)
 *
 * The list is driven by arrow keys + Enter, the first option ("Yes") is
 * highlighted by default, and Esc cancels (equivalent to the "No" option).
 *
 * The mapping below is deliberately built from arrow/Enter/Esc rather than digit
 * keys, so it does not depend on whether a given Claude Code version treats a
 * digit as "move selection" vs "select-and-submit":
 *
 *   approve          → "\r"        confirm the default-highlighted "Yes"
 *   approve_always   → "\x1b[B\r"  arrow-Down to option 2, then confirm
 *   deny             → "\x1b"      Esc cancels the permission (→ "No")
 *
 * HONESTY NOTE: this targets Claude Code's interactive select prompt. The exact
 * keystroke contract is not published API and can drift between versions; it was
 * NOT validated against a live agent in this change (no interactive agent was
 * reachable from the build environment). Treat this table as the single place to
 * correct if a live session shows different behavior. For a plain y/n CLI prompt
 * (not Claude's menu), use {@link YES_NO} instead.
 */

/** Named control keys → the byte sequence a pty expects (xterm/VT100). */
export const CONTROL_KEYS = {
  enter: "\r",
  escape: "\x1b",
  tab: "\t",
  backspace: "\x7f",
  ctrlC: "\x03",
  ctrlD: "\x04",
  ctrlL: "\x0c",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
} as const;

export type ControlKey = keyof typeof CONTROL_KEYS;

/** Permission actions the mobile buttons expose. */
export type PermissionAction = "approve" | "approve_always" | "deny";

/** Bytes for each permission action against a Claude Code select prompt. */
export const PERMISSION_SEQUENCES: Record<PermissionAction, string> = {
  approve: CONTROL_KEYS.enter,
  approve_always: CONTROL_KEYS.down + CONTROL_KEYS.enter,
  deny: CONTROL_KEYS.escape,
};

/** Plain y/n prompt fallback (not Claude's menu). */
export const YES_NO = {
  yes: "y" + CONTROL_KEYS.enter,
  no: "n" + CONTROL_KEYS.enter,
} as const;

/** The byte sequence for a named control key. */
export function controlSequence(key: ControlKey): string {
  return CONTROL_KEYS[key];
}

/** The byte sequence for a permission action. */
export function permissionSequence(action: PermissionAction): string {
  return PERMISSION_SEQUENCES[action];
}

/**
 * Prepare a free-text follow-up for submission to the pty.
 *
 * Removes control characters so a pasted/typed sequence can't smuggle a
 * different action into the pty, then appends a single Enter to submit. What is
 * stripped:
 *   - C0 controls + DEL: U+0000–U+001F, U+007F (incl. ESC, CR, LF, TAB)
 *   - C1 controls: U+0080–U+009F (esp. U+009B 8-bit CSI, U+0085 NEL) — a
 *     terminal in 8-bit mode could otherwise treat these as control introducers
 *   - Unicode line/paragraph separators: U+2028, U+2029
 * Removing the introducer byte neutralises the sequence (any residual "[B"-type
 * text becomes inert literal characters). Returns an empty string for blank
 * input so the caller can no-op instead of sending a bare newline. `submit`
 * (default true) appends Enter; pass false to type without submitting.
 */
export function followUpInput(text: string, submit = true): string {
  const cleaned = (text ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, "");
  if (cleaned.length === 0) return "";
  return submit ? cleaned + CONTROL_KEYS.enter : cleaned;
}
