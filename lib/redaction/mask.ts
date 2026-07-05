/**
 * Secret redaction engine (presentation / mask mode — issue #155).
 *
 * PURE, ANSI-aware, chunk-boundary-safe masking of secrets in terminal output.
 *
 * Design notes
 * ------------
 * - `maskSecrets(text)` is a pure function over a COMPLETE string. It tokenizes
 *   the input into ANSI/control sequences (passed through untouched) and
 *   printable text runs (scanned for secrets). Escape sequences are never
 *   scanned, so color codes, cursor moves, OSC hyperlinks/clipboard payloads,
 *   etc. are preserved byte-for-byte and never mangled.
 * - `createStreamMasker()` wraps the pure function for the LIVE terminal, where
 *   output arrives in arbitrary chunks. A secret token can be split across two
 *   WebSocket messages, and an ANSI escape can be split mid-sequence. The stream
 *   masker carries the unsafe trailing bytes (a partial token or an incomplete
 *   escape) into the next chunk so cross-boundary secrets are still caught and
 *   split escapes are reassembled.
 *
 * SECURITY: This is BEST-EFFORT masking for screen-sharing, NOT a security
 * guarantee. It is visual-only and applied at the render/write boundary; the
 * underlying recording data is never modified. Novel secret shapes or secrets
 * embedded inside escape-sequence payloads may slip through. A future
 * redact-at-capture mode (server-side, in `server/recording/recorder.ts`) would
 * be required to strip secrets from stored recordings themselves.
 */

export const DEFAULT_REDACTION_LABEL = "[redacted]";

/** Characters that can appear inside the supported secret shapes. Used to
 *  identify a trailing partial token that may continue in the next chunk. */
const TOKEN_CHAR = /[A-Za-z0-9._+/=~-]/;

/**
 * Trailing region of a chunk that may still grow into a secret in the next
 * chunk, and must therefore be carried over. This is the trailing run of token
 * characters, OPTIONALLY prefixed by a `Bearer ` introducer — the only
 * multi-word shape — so a Bearer token split across a chunk boundary keeps its
 * label context and is still masked. A shell prompt (ends in a space/symbol)
 * yields an empty trailing run and is emitted immediately, preserving live
 * interactivity.
 */
const CARRY_TAIL = /(?:\bBearer\s+)?[A-Za-z0-9._+/=~-]*$/;

/** Upper bound on bytes carried across a chunk boundary. Far larger than any
 *  realistic secret, so a token is never split by the cap in practice; bounds
 *  memory/latency on pathological single-line high-throughput output. */
const MAX_CARRY = 4096;

export interface MaskOptions {
  /** Replacement string for a matched secret. Defaults to `[redacted]`. */
  label?: string;
  /** Exact literal values to mask wherever they appear (e.g. values the app
   *  already knows client-side). Values shorter than 4 chars are ignored to
   *  avoid masking common substrings. */
  knownValues?: string[];
}

interface SecretPattern {
  name: string;
  re: RegExp;
  /** When set, the matching prefix is preserved and only the remainder is
   *  masked (e.g. keep `Bearer ` visible, redact the token). */
  keepPrefix?: RegExp;
}

/**
 * Known token/key shapes (issue #155 AC2). Each `re` MUST be global (`g`).
 * Ordering is not significant — matches from all patterns are collected over the
 * original text and de-overlapped (longest-wins) before replacement.
 */
const PATTERNS: SecretPattern[] = [
  // OpenAI keys: sk-..., sk-proj-... (dashes allowed in body)
  { name: "openai", re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  // AWS access key IDs (long-term AKIA, temporary ASIA)
  { name: "aws", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  // GitHub tokens: ghp_/gho_/ghs_/ghr_/ghu_ and fine-grained github_pat_
  {
    name: "github",
    re: /\b(?:gh[posru]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  },
  // Slack tokens: xoxb-/xoxp-/xoxa-/xoxr-/xoxs-
  { name: "slack", re: /\bxox[baprs]-[A-Za-z0-9-]{8,}/g },
  // JWTs: three base64url segments; require the standard `eyJ` header so plain
  // dotted identifiers (a.b.c) are not masked.
  {
    name: "jwt",
    re: /(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g,
  },
  // Bearer <token> — keep the "Bearer " label, redact the credential.
  {
    name: "bearer",
    re: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
    keepPrefix: /^Bearer\s+/,
  },
  // Long hex secrets (>=32 hex chars). Note: a 40-char git SHA also matches;
  // over-masking a commit hash on a shared screen is harmless and accepted.
  {
    name: "hex",
    re: /(?<![A-Za-z0-9])[0-9a-fA-F]{32,}(?![0-9a-fA-F])/g,
  },
];

interface Match {
  start: number;
  end: number;
  replacement: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mask secrets inside a single printable text run (no ANSI / control bytes).
 * Collects matches from every pattern + known values, resolves overlaps
 * (earliest start wins; longest wins on ties), then rebuilds the string.
 */
function maskTextRun(text: string, label: string, knownValues: string[]): string {
  const matches: Match[] = [];

  for (const pattern of PATTERNS) {
    pattern.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.re.exec(text)) !== null) {
      const value = m[0];
      const start = m.index;
      const replacement = pattern.keepPrefix
        ? (value.match(pattern.keepPrefix)?.[0] ?? "") + label
        : label;
      matches.push({ start, end: start + value.length, replacement });
      // Guard against zero-length matches causing an infinite loop.
      if (pattern.re.lastIndex === start) pattern.re.lastIndex++;
    }
  }

  for (const raw of knownValues) {
    if (!raw || raw.length < 4) continue;
    const known = new RegExp(escapeRegExp(raw), "g");
    let m: RegExpExecArray | null;
    while ((m = known.exec(text)) !== null) {
      matches.push({
        start: m.index,
        end: m.index + raw.length,
        replacement: label,
      });
      if (known.lastIndex === m.index) known.lastIndex++;
    }
  }

  if (matches.length === 0) return text;

  // Longest-wins de-overlap: sort by start asc, then by end desc.
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue; // overlaps an already-applied match
    result += text.slice(cursor, match.start) + match.replacement;
    cursor = match.end;
  }
  result += text.slice(cursor);
  return result;
}

type SegmentType = "text" | "ctrl" | "esc" | "esc-incomplete";

interface Segment {
  type: SegmentType;
  value: string;
}

/**
 * Match a single escape sequence starting at `input[i]` (which is ESC).
 * Returns the consumed value and whether it is a complete sequence. An
 * incomplete sequence (chunk ended mid-escape) is reported so the stream masker
 * can carry it into the next chunk.
 */
function matchEscape(rest: string): { value: string; complete: boolean } {
  // CSI: ESC [ params intermediates final
  let m = /^\x1b\[[0-9;?:<>=!]*[ -/]*[@-~]/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b\[[0-9;?:<>=!]*[ -/]*$/.test(rest)) return { value: rest, complete: false };

  // OSC: ESC ] ... (BEL | ST)
  m = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b\][^\x07\x1b]*$/.test(rest)) return { value: rest, complete: false };
  if (/^\x1b\][^\x07\x1b]*\x1b$/.test(rest)) return { value: rest, complete: false };

  // DCS / SOS / PM / APC: ESC (P|X|^|_) ... ST
  m = /^\x1b[PX^_][^\x1b]*\x1b\\/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b[PX^_][^\x1b]*\x1b?$/.test(rest)) return { value: rest, complete: false };

  // Lone ESC at end of chunk — could begin any sequence.
  if (rest === "\x1b") return { value: rest, complete: false };

  // Any other two-byte escape (ESC + one byte), e.g. ESC c, ESC ( B.
  return { value: rest.slice(0, 2), complete: true };
}

/**
 * Split terminal output into ordered segments of ANSI/control sequences and
 * printable text runs. Printable runs keep spaces (so `Bearer <token>` is one
 * run) but exclude ESC and C0 control bytes / DEL.
 */
function tokenize(input: string): Segment[] {
  const segments: Segment[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      segments.push({ type: "text", value: text });
      text = "";
    }
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    const code = input.charCodeAt(i);
    if (ch === "\x1b") {
      flush();
      const esc = matchEscape(input.slice(i));
      segments.push({
        type: esc.complete ? "esc" : "esc-incomplete",
        value: esc.value,
      });
      i += esc.value.length;
    } else if (code < 0x20 || code === 0x7f) {
      flush();
      segments.push({ type: "ctrl", value: ch });
      i += 1;
    } else {
      text += ch;
      i += 1;
    }
  }
  flush();
  return segments;
}

/**
 * Mask all secrets in a complete string. ANSI/control sequences pass through
 * untouched; only printable text runs are scanned. Pure and deterministic.
 */
export function maskSecrets(input: string, options: MaskOptions = {}): string {
  if (!input) return input;
  const label = options.label ?? DEFAULT_REDACTION_LABEL;
  const knownValues = options.knownValues ?? [];

  // Fast path: no ESC/control and nothing that could start a secret shape can
  // still contain secrets, so only skip work when the whole string is trivially
  // safe (short + no token chars). Keep it simple: always tokenize.
  let out = "";
  for (const segment of tokenize(input)) {
    out +=
      segment.type === "text"
        ? maskTextRun(segment.value, label, knownValues)
        : segment.value;
  }
  return out;
}

export interface StreamMasker {
  /** Feed a chunk of terminal output; returns the masked bytes safe to write. */
  push(chunk: string): string;
  /** Emit any carried (masked) bytes; call on stream end / before switching to
   *  a raw write path so no output is lost. */
  flush(): string;
  /** Discard carried state (e.g. before replaying a recording from the start). */
  reset(): void;
}

/**
 * Stateful, ANSI- and chunk-boundary-safe masker for the LIVE terminal stream.
 * Carries the unsafe trailing bytes of each chunk (a partial token or an
 * incomplete escape sequence) into the next chunk.
 */
export function createStreamMasker(options: MaskOptions = {}): StreamMasker {
  let carry = "";

  const push = (chunk: string): string => {
    if (!chunk) return "";
    const data = carry + chunk;
    carry = "";

    const segments = tokenize(data);
    if (segments.length === 0) return "";

    const last = segments[segments.length - 1];
    let hold = "";

    if (last.type === "esc-incomplete") {
      // Carry the whole unterminated escape so it can be reassembled next chunk.
      hold = last.value;
    } else if (last.type === "text") {
      // Carry the trailing partial token (plus a `Bearer ` prefix if present) —
      // a secret that may continue in the next chunk. Text ending in a
      // space/newline (e.g. a shell prompt) has an empty trailing run and is
      // emitted immediately.
      hold = CARRY_TAIL.exec(last.value)?.[0] ?? "";
    }

    // Bound the carry. Overflow at the front cannot be a pending secret prefix
    // (carry >> max secret length), so emit it now.
    let emit = data.slice(0, data.length - hold.length);
    if (hold.length > MAX_CARRY) {
      const keep = hold.length - MAX_CARRY;
      emit += hold.slice(0, keep);
      hold = hold.slice(keep);
    }
    carry = hold;
    return maskSecrets(emit, options);
  };

  const flush = (): string => {
    if (!carry) return "";
    const remaining = carry;
    carry = "";
    return maskSecrets(remaining, options);
  };

  const reset = (): void => {
    carry = "";
  };

  return { push, flush, reset };
}

/** Convenience: true if the char is a secret-token character (exported for
 *  tests / callers that need the same notion of a token boundary). */
export function isTokenChar(ch: string): boolean {
  return TOKEN_CHAR.test(ch);
}
