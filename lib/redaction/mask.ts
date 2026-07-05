/**
 * Secret redaction engine (presentation / mask mode — issue #155).
 *
 * PURE, ANSI-aware, chunk-boundary-safe masking of secrets in terminal output.
 *
 * Design notes
 * ------------
 * - A secret's VISIBLE characters can be interleaved with ANSI escape sequences
 *   (e.g. `grep --color`/`ls --color` wrap a match in SGR + `\x1b[K`, so an AWS
 *   key arrives as `\x1b[01;31m\x1b[KAKIA\x1b[m\x1b[KIOSFODNN7EXAMPLE`). Masking
 *   each printable run independently would miss the secret. Instead, for each
 *   LOGICAL LINE (segments between C0 control boundaries) we build an
 *   ANSI-STRIPPED PROJECTION of the visible text, run the patterns on that, then
 *   map each matched visible span back onto the interleaved segments — masking
 *   the visible characters while RE-EMITTING the interior escape sequences
 *   untouched. Colors/cursor moves are preserved; only visible secret chars
 *   become the redaction label.
 * - `createStreamMasker()` handles the LIVE stream where output arrives in
 *   arbitrary chunks. A secret (and its interleaved escapes) can be split across
 *   WebSocket messages, and an ANSI escape can be split mid-sequence. The masker
 *   carries only the unsafe trailing bytes of each chunk — a trailing suffix
 *   that could be the split START of a secret (a partial introducer prefix or a
 *   bounded hex run, see `PARTIAL_SECRET_TAIL`) or an incomplete escape sequence
 *   — into the next chunk. Ordinary trailing words with no possible-introducer
 *   suffix flush immediately (no "stuck output"). Carried escape bytes are never
 *   re-masked, so a split OSC-52/DCS payload is not corrupted.
 *
 * SECURITY: This is BEST-EFFORT masking for screen-sharing, NOT a security
 * guarantee. It is visual-only and applied at the render/write boundary; the
 * underlying recording data is never modified. Novel secret shapes may slip
 * through. A future redact-at-capture mode (server-side, in
 * `server/recording/recorder.ts`) would be required to strip secrets from stored
 * recordings themselves.
 */

export const DEFAULT_REDACTION_LABEL = "[redacted]";

/** Characters that can appear inside the supported secret shapes. Used to
 *  identify a trailing partial token that may continue in the next chunk. */
const TOKEN_CHAR = /[A-Za-z0-9._+/=~-]/;

/**
 * Build a regex source matching any non-empty PREFIX of `literal`, and — once
 * the full literal has been consumed — any run of `body` chars continuing it.
 * E.g. ("AKIA", "[0-9A-Z]") → `A(?:K(?:I(?:A[0-9A-Z]*)?)?)?`, which matches the
 * split-in-progress states "A", "AK", "AKI", "AKIA", "AKIA1F2G…". Used to carry
 * only a trailing partial that could plausibly become a supported secret.
 */
function partialIntroducerSource(literal: string, body: string): string {
  let src = body + "*";
  for (let i = literal.length - 1; i >= 0; i--) {
    const ch = escapeRegExp(literal[i]);
    src = i === literal.length - 1 ? ch + src : `${ch}(?:${src})?`;
  }
  return src;
}

/**
 * Trailing VISIBLE region of a logical line that could be the split START of a
 * supported secret and must therefore be carried into the next chunk. It is the
 * shortest-necessary suffix that is a partial match of a secret INTRODUCER — a
 * prefix of `sk-`/`AKIA`/`ASIA`/`gh?_`/`github_pat_`/`xox?-`/`eyJ`/`Bearer `
 * (with any body chars already accumulated), or a bounded trailing hex run — so
 * a secret split across a chunk boundary keeps growing and is still masked.
 *
 * The leading `(?<![A-Za-z0-9])` pins each alternative to a token boundary,
 * matching the introducers' own `\b`/lookbehind anchors, so a hex-ish or
 * introducer-ish suffix that is merely the tail of an ordinary word (e.g. the
 * `d` in `world`, the `g` in `log`) is NOT carried. Anchored at `$` with a
 * non-global `exec`, the leftmost match is the longest boundary-aligned suffix.
 * Ordinary words (no possible-introducer suffix) yield no match and flush
 * immediately, preserving live interactivity.
 */
const PARTIAL_SECRET_TAIL = new RegExp(
  "(?<![A-Za-z0-9])(?:" +
    [
      partialIntroducerSource("sk-", "[A-Za-z0-9_-]"),
      partialIntroducerSource("AKIA", "[0-9A-Z]"),
      partialIntroducerSource("ASIA", "[0-9A-Z]"),
      partialIntroducerSource("ghp_", "[A-Za-z0-9]"),
      partialIntroducerSource("gho_", "[A-Za-z0-9]"),
      partialIntroducerSource("ghs_", "[A-Za-z0-9]"),
      partialIntroducerSource("ghr_", "[A-Za-z0-9]"),
      partialIntroducerSource("ghu_", "[A-Za-z0-9]"),
      partialIntroducerSource("github_pat_", "[A-Za-z0-9_]"),
      partialIntroducerSource("xoxb-", "[A-Za-z0-9-]"),
      partialIntroducerSource("xoxp-", "[A-Za-z0-9-]"),
      partialIntroducerSource("xoxa-", "[A-Za-z0-9-]"),
      partialIntroducerSource("xoxr-", "[A-Za-z0-9-]"),
      partialIntroducerSource("xoxs-", "[A-Za-z0-9-]"),
      partialIntroducerSource("eyJ", "[A-Za-z0-9._-]"),
      // Bearer <token>: \s+ separator, not a literal char, so hand-written.
      "B(?:e(?:a(?:r(?:e(?:r(?:\\s+[A-Za-z0-9._~+/=-]*)?)?)?)?)?)?",
      // Bare long-hex run — the introducer is the boundary itself.
      "[0-9a-fA-F]+",
    ].join("|") +
    ")$",
);

/**
 * Longest suffix of `projection` that is a prefix of any known credential value
 * (values shorter than 4 chars are ignored, matching {@link collectMatches}).
 * Carries a known value split across a chunk boundary so it is still masked.
 */
function knownValueTailLen(projection: string, knownValues?: string[]): number {
  if (!knownValues || knownValues.length === 0) return 0;
  let best = 0;
  for (const value of knownValues) {
    if (!value || value.length < 4) continue;
    const max = Math.min(value.length, projection.length);
    for (let k = max; k > best; k--) {
      if (projection.endsWith(value.slice(0, k))) {
        best = k;
        break;
      }
    }
  }
  return best;
}

/** Upper bound (visible chars) carried across a chunk boundary for a partial
 *  token. Far larger than any realistic secret, so a token is never split by the
 *  cap in practice; bounds memory/latency on pathological long single lines. */
const MAX_CARRY = 4096;

/** Upper bound (bytes) for buffering an incomplete escape sequence across a
 *  chunk boundary. Beyond this the (likely malformed) sequence is emitted raw so
 *  memory stays bounded. Large enough for realistic OSC-52 clipboard payloads. */
const MAX_ESC_CARRY = 262144;

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
 * projection and de-overlapped (longest-wins) before replacement.
 *
 * NOTE (deliberate over-masking): the `hex` rule masks any run of >=32 hex
 * chars. In presentation mode this intentionally also redacts MD5/SHA-256
 * checksums and `sha256:` digests — safe-direction for a screen-share (better to
 * hide a checksum than leak a secret). UUIDs and short/git-short hashes contain
 * separators or are below the threshold and are NOT masked (pinned by tests).
 *
 * Regex reentrancy: these are module-level globals; `lastIndex` is reset before
 * every use and JS is single-threaded, so sequential calls are safe. Do not use
 * these objects concurrently.
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
  // Long hex secrets (>=32 hex chars) — see deliberate over-masking note above.
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
 * Collect secret matches over a (already ANSI-stripped) projection string.
 * Returns spans sorted by start with overlaps removed (earliest start wins;
 * longest wins on ties). Spans index into the projection, not the raw input.
 */
function collectMatches(
  text: string,
  label: string,
  knownValues: string[],
): Match[] {
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

  if (matches.length === 0) return matches;
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Drop overlaps (keep the earliest/longest already at the front after sort).
  const merged: Match[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    merged.push(match);
    cursor = match.end;
  }
  return merged;
}

type SegmentType = "text" | "ctrl" | "esc" | "esc-incomplete";

interface Segment {
  type: SegmentType;
  value: string;
}

/**
 * Match a single escape sequence starting at the ESC that begins `rest`.
 * Reports whether it is complete; an incomplete sequence (chunk ended mid-escape)
 * consumes to end-of-string and is flagged so the stream masker can carry it.
 */
function matchEscape(rest: string): { value: string; complete: boolean } {
  // CSI: ESC [ params intermediates final
  let m = /^\x1b\[[0-9;?:<>=!]*[ -/]*[@-~]/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b\[[0-9;?:<>=!]*[ -/]*$/.test(rest))
    return { value: rest, complete: false };

  // OSC: ESC ] ... (BEL | ST)
  m = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b\][^\x07\x1b]*$/.test(rest))
    return { value: rest, complete: false };
  if (/^\x1b\][^\x07\x1b]*\x1b$/.test(rest))
    return { value: rest, complete: false };

  // DCS / SOS / PM / APC: ESC (P|X|^|_) ... ST
  m = /^\x1b[PX^_][^\x1b]*\x1b\\/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b[PX^_][^\x1b]*\x1b?$/.test(rest))
    return { value: rest, complete: false };

  // nF sequences: ESC + intermediates (0x20-0x2F) + one final (0x30-0x7E),
  // e.g. charset designation ESC ( B / ESC ) 0 or DEC line-attr ESC # 8 —
  // three or more bytes. Consuming only 2 would leak the final byte as text.
  m = /^\x1b[ -/]+[0-~]/.exec(rest);
  if (m) return { value: m[0], complete: true };
  if (/^\x1b[ -/]+$/.test(rest)) return { value: rest, complete: false };

  // Lone ESC at end of chunk — could begin any sequence.
  if (rest === "\x1b") return { value: rest, complete: false };

  // Any other two-byte escape (ESC + one final byte), e.g. ESC c, ESC 7.
  return { value: rest.slice(0, 2), complete: true };
}

/**
 * Split terminal output into ordered segments: ANSI escape sequences (`esc` /
 * `esc-incomplete`), single C0/DEL control bytes (`ctrl`, treated as logical
 * boundaries), and printable text runs (`text`, spaces kept so `Bearer <token>`
 * stays contiguous).
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
 * Mask one logical line (a run of non-`ctrl` segments). Builds the ANSI-stripped
 * projection, finds secret spans, then re-emits segments in order: escapes pass
 * through untouched (even inside a masked span); visible chars inside a span are
 * dropped except the label emitted once at the span's start.
 */
function maskGroup(
  segments: Segment[],
  label: string,
  knownValues: string[],
): string {
  let projection = "";
  for (const seg of segments) {
    if (seg.type === "text") projection += seg.value;
  }

  const join = () => segments.map((s) => s.value).join("");
  if (!projection) return join();

  const matches = collectMatches(projection, label, knownValues);
  if (matches.length === 0) return join();

  let out = "";
  let p = 0; // projection offset at the start of the current text segment
  let mi = 0; // index into sorted, non-overlapping matches
  for (const seg of segments) {
    if (seg.type !== "text") {
      out += seg.value;
      continue;
    }
    const v = seg.value;
    for (let k = 0; k < v.length; k++) {
      const i = p + k;
      while (mi < matches.length && matches[mi].end <= i) mi++;
      const inMatch = mi < matches.length && matches[mi].start <= i;
      if (inMatch) {
        if (i === matches[mi].start) out += matches[mi].replacement;
        // else: visible char inside a masked span — drop it
      } else {
        out += v[k];
      }
    }
    p += v.length;
  }
  return out;
}

/**
 * Mask all secrets in a complete string. ANSI/control sequences are preserved;
 * secrets are matched across escape sequences within a logical line. Pure and
 * deterministic.
 */
export function maskSecrets(input: string, options: MaskOptions = {}): string {
  if (!input) return input;
  const label = options.label ?? DEFAULT_REDACTION_LABEL;
  const knownValues = options.knownValues ?? [];

  const segments = tokenize(input);
  let out = "";
  let group: Segment[] = [];
  const flush = () => {
    if (group.length) {
      out += maskGroup(group, label, knownValues);
      group = [];
    }
  };
  for (const seg of segments) {
    if (seg.type === "ctrl") {
      flush();
      out += seg.value;
    } else {
      group.push(seg);
    }
  }
  flush();
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
 * Carries only the unsafe trailing bytes of each chunk (a suffix that could be
 * the split start of a secret — see `PARTIAL_SECRET_TAIL` — or an incomplete
 * escape sequence) into the next chunk; ordinary trailing output is emitted
 * immediately. Carried escape bytes are never passed through `maskSecrets`.
 */
export function createStreamMasker(options: MaskOptions = {}): StreamMasker {
  let carry = "";

  const push = (chunk: string): string => {
    if (!chunk) return "";
    const data = carry + chunk;
    carry = "";
    if (!data) return "";

    const segments = tokenize(data);

    // Absolute byte offset of each segment; and the tail group = segments after
    // the last `ctrl` boundary (a secret never spans a control byte).
    const starts: number[] = [];
    let off = 0;
    let tailStart = 0;
    for (let idx = 0; idx < segments.length; idx++) {
      starts.push(off);
      off += segments[idx].value.length;
      if (segments[idx].type === "ctrl") tailStart = idx + 1;
    }

    // Build the tail group's visible projection with each visible char's
    // absolute byte offset, and note a trailing incomplete escape.
    let projection = "";
    const projOffset: number[] = [];
    let incompleteEscStart = -1;
    for (let idx = tailStart; idx < segments.length; idx++) {
      const seg = segments[idx];
      if (seg.type === "text") {
        for (let k = 0; k < seg.value.length; k++) {
          projOffset.push(starts[idx] + k);
          projection += seg.value[k];
        }
      } else if (seg.type === "esc-incomplete") {
        incompleteEscStart = starts[idx];
      }
    }

    // Where does the carried region begin? Default: nothing held.
    let holdStart = data.length;

    // Trailing region that could be the split START of a secret — a partial
    // introducer prefix / secret-in-progress / bounded hex run, or a prefix of
    // a known credential value — and must grow into the next chunk. Ordinary
    // words with no possible-introducer suffix flush immediately.
    const partial = PARTIAL_SECRET_TAIL.exec(projection);
    let holdProjLen = partial ? partial[0].length : 0;
    const knownLen = knownValueTailLen(projection, options.knownValues);
    if (knownLen > holdProjLen) holdProjLen = knownLen;
    if (holdProjLen > 0) {
      let visIdx = projection.length - holdProjLen;
      if (projection.length - visIdx > MAX_CARRY) {
        visIdx = projection.length - MAX_CARRY; // keep only the last MAX_CARRY
      }
      holdStart = projOffset[visIdx];
    }

    // An incomplete escape must be carried from its start (never split/masked).
    if (incompleteEscStart >= 0) {
      holdStart = Math.min(holdStart, incompleteEscStart);
    }

    const emit = data.slice(0, holdStart);
    carry = data.slice(holdStart);

    // Runaway incomplete escape: emit raw (never masked) and stop buffering.
    if (incompleteEscStart >= 0 && carry.length > MAX_ESC_CARRY) {
      const raw = carry;
      carry = "";
      return maskSecrets(emit, options) + raw;
    }

    return maskSecrets(emit, options);
  };

  const flush = (): string => {
    if (!carry) return "";
    const remaining = carry;
    carry = "";
    // maskSecrets leaves an incomplete-escape carry untouched (escapes are never
    // masked), and masks a completed trailing token.
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
