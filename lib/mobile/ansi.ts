/**
 * Minimal ANSI/terminal-control stripping for the mobile unblock view (#156).
 *
 * The mobile view shows a plain-text tail of the pty output so a developer can
 * read the pending prompt without loading the full xterm renderer on a phone.
 * This is display-only sanitization — it never touches what is sent back to the
 * pty. Pure and unit-tested.
 */

/* eslint-disable no-control-regex */

// CSI sequences: ESC [ ... final-byte  (colors, cursor moves, etc.).
const CSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
// OSC sequences: ESC ] ... (BEL | ESC \)  (window titles, hyperlinks).
const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
// Other two-byte ESC sequences (charset selection, keypad mode, etc.).
const ESC2 = /\x1b[@-Z\\-_ -/]/g;
// Remaining C0 control chars except TAB (\x09) and LF (\x0a).
const CTRL = /[\x00-\x08\x0b-\x1f\x7f]/g;

/** Remove ANSI escape sequences and most non-printable control chars. */
export function stripAnsi(input: string): string {
  return (input ?? "")
    .replace(OSC, "")
    .replace(CSI, "")
    .replace(ESC2, "")
    .replace(/\r/g, "")
    .replace(CTRL, "");
}

/* eslint-enable no-control-regex */

/**
 * Keep only the last `maxLines` non-blank-trailing lines of accumulated output,
 * after stripping ANSI. Used to surface the "pending prompt" tail compactly.
 */
export function tailLines(input: string, maxLines: number): string {
  const cleaned = stripAnsi(input);
  const lines = cleaned.split("\n");
  // Trim a run of trailing blank lines so the prompt sits at the bottom.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}
