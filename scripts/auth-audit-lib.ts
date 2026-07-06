/**
 * Pure auth-audit logic (F4, #96), separated from the Bun CLI
 * (audit-auth-routes.ts) so it can be unit-tested under Vitest without the
 * shebang / `bun` glob import.
 */

export const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * A real auth-guard CALL site. Recognises an AWAITED invocation of
 * `requireAuth(`, `requireAuthOrThrow(`, `requireRole(`, or `requireSuperAdmin(`
 * (F5, #101). `requireRole`/`requireSuperAdmin` are STRONGER than `requireAuth` —
 * they require authentication AND a role — so a route guarded by one is guarded.
 *
 * SECURITY (defense in depth): the `\bawait\s+` prefix is load-bearing. Every
 * real guard in this codebase is invoked as `await requireAuth(...)` /
 * `await requireRole(...)` / `await requireSuperAdmin(...)`, so requiring the
 * `await` prefix excludes bare-token false positives (e.g. a `requireRole(`
 * mention) without losing any genuine call site. It is NOT sufficient on its
 * own: a regex literal whose source text contains `await requireRole(` with an
 * unescaped paren (e.g. `/await requireRole(x)/`) would still match, so
 * `stripCommentsAndStrings()` ALSO neutralizes regex-literal content — the two
 * defenses together close the bypass. No `g` flag, so `.test()` is stateless and
 * safe to reuse.
 */
export const AUTH_GUARD_CALL_RE =
  /\bawait\s+(?:requireAuth(?:OrThrow)?|requireRole|requireSuperAdmin)\s*\(/;

/**
 * An import statement that brings in an auth guard (`requireAuth*`,
 * `requireRole`, or `requireSuperAdmin`). Uses `[^;]*?` (not `.`) between
 * `import` and `from` so it
 * spans NEWLINES — a multiline `import {\n  requireAuth,\n} from "..."` block is
 * matched — while the negated `;` keeps it bounded to a single import statement,
 * so it cannot greedily swallow across an intervening statement terminator.
 */
export const AUTH_GUARD_IMPORT_RE =
  /import\s+[^;]*?require(?:Auth|Role|SuperAdmin)[^;]*?from/;

/**
 * Single-char tokens that, when they are the immediately-preceding SIGNIFICANT
 * character, put the parser in expression position — so a following `/` begins a
 * REGEX LITERAL, not a division operator. `""` models start-of-input. This is
 * the conservative set from the audit hardening (`(` `,` `=` `!` `:` `[` `;`
 * `{` `?` and the trailing char of `&&`/`||`); `return` is handled separately as
 * a keyword. `{` (a block/object body opener) and `?` (ternary condition
 * separator, nullish `??`) both put the parser in expression position, so a `/`
 * after either begins a regex — omitting them left an audit BYPASS
 * (`if (x) { /await requireRole(y)/.test(s) }` was not neutralized). Kept
 * deliberately minimal so a real division (whose left operand ends in an
 * identifier, `)`, `]`, or a digit) is never mis-scanned as a regex — none of
 * these tokens can be the tail of a division's left operand.
 */
const REGEX_PRECEDERS = new Set([
  "",
  "(",
  ",",
  "=",
  "!",
  ":",
  "[",
  ";",
  "&",
  "|",
  "{",
  "?",
]);

/**
 * Strip line comments, block comments, string/template literal CONTENT, AND
 * regex-literal content from a source string, replacing each stripped span with
 * a single space so token boundaries (and line count, roughly) are preserved.
 *
 * SECURITY: without this, a guard mentioned only in a comment or a string
 * literal (e.g. `// TODO: requireRole()` or `"call requireRole() here"`) would
 * satisfy `AUTH_GUARD_CALL_RE` and let an unprotected write route slip past the
 * audit gate misclassified as guarded. A real guard is always live code, never
 * a comment/string, so stripping these can only make detection STRICTER — it
 * never hides a genuine `requireRole(`/`requireAuth(` call site. The walker is
 * string-aware so a `//` or guard mention inside a real string does not, in
 * turn, swallow subsequent live code.
 *
 * SECURITY (regex literals): the `\bawait\s+` prefix in `AUTH_GUARD_CALL_RE`
 * defeats most bare-token false positives, but a regex literal whose SOURCE text
 * literally contains `await requireRole(` (unescaped paren — e.g.
 * `const re = /await requireRole(x)/`) would still match and misclassify an
 * unguarded write route as guarded. Regex-literal source is data, never an
 * invoked guard, so neutralizing it can only make detection STRICTER. Regex
 * start is detected conservatively (after {@link REGEX_PRECEDERS}, `return`, or a
 * `)`/`]` closer whose run {@link looksLikeRegexAfterCloser}); if no closing `/`
 * is found before end-of-line the `/` is treated as division instead (regex
 * literals never span newlines), so a mis-detected division can never swallow a
 * subsequent live guard call.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  const n = src.length;
  let i = 0;
  // Last SIGNIFICANT (non-whitespace) code character emitted. Comments do not
  // update it (a `/**/` between an `=` and a `/re/` must not hide the regex).
  let prevSig = "";
  const updatePrev = (ch: string) => {
    if (ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r") prevSig = ch;
  };
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    // Line comment: skip to end of line. (Does not update prevSig.)
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
      out += " ";
      continue;
    }
    // Block comment: skip to closing */. (Does not update prevSig.)
    if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    // String / template literal: skip content, honoring backslash escapes.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      out += " ";
      // After a string literal a following `/` is division, not a regex.
      prevSig = quote;
      continue;
    }
    // Regex literal: only when a `/` appears in expression position (start of a
    // regex, not division). Conservative preceder check + newline-abort so a
    // real division never swallows live code.
    if (c === "/" && isRegexStart(prevSig, out, src, i)) {
      const end = scanRegexLiteral(src, i);
      if (end > i) {
        i = end;
        out += " ";
        // After a regex literal a following `/` is division, not a regex.
        prevSig = "/";
        continue;
      }
      // No terminator on this line → treat `/` as an ordinary division char.
    }
    out += c;
    updatePrev(c);
    i++;
  }
  return out;
}

/**
 * Is a `/` at expression position (regex-literal start) given the preceding
 * significant char and the code emitted so far? True after a `REGEX_PRECEDERS`
 * char, at start-of-input, or after the `return` keyword.
 *
 * AMBIGUOUS CLOSERS (`)` and `]`): a `/` here is USUALLY division
 * (`(a + b) / c`, `arr[i] / n`), but a regex literal can legally start in
 * statement/expression position after a closer — e.g. `if (x) /re/.test(s)`.
 * Missing that case leaves an audit BYPASS: a regex whose source contains
 * `await requireRole(` (e.g. `if (x) /await requireRole(y)/.test(s)`) is not
 * neutralized, so `AUTH_GUARD_CALL_RE` matches inside the regex source and an
 * unguarded write route is misclassified as guarded. We therefore treat a `/`
 * after `)`/`]` as a regex when the run "looks like" a regex literal (see
 * {@link looksLikeRegexAfterCloser}). Over-stripping a rare division can only
 * make the gate STRICTER (it never hides a live guard call), so the heuristic is
 * intentionally biased toward treating the ambiguous case as a regex.
 */
function isRegexStart(
  prevSig: string,
  out: string,
  src: string,
  slashIdx: number,
): boolean {
  if (REGEX_PRECEDERS.has(prevSig)) return true;
  // `return /re/` — keyword preceder. prevSig is a letter here, so only pay for
  // the trailing-word extraction in that case.
  if (/[A-Za-z]/.test(prevSig)) {
    const m = out.match(/(^|[^A-Za-z0-9_$])(return)\s*$/);
    if (m) return true;
  }
  if (prevSig === ")" || prevSig === "]") {
    return looksLikeRegexAfterCloser(src, slashIdx);
  }
  return false;
}

/**
 * Heuristic for the ambiguous `/` after a `)`/`]`: does the run starting at
 * `src[slashIdx] === "/"` look like a regex LITERAL rather than a division?
 *
 * Conservative, biased toward "regex" (over-stripping only tightens the audit
 * gate). A regex is recognised when ALL hold:
 *   1. the char immediately after the opening `/` is NOT whitespace — excludes
 *      the common division form `(a + b) / c`;
 *   2. a closing `/` exists on the SAME line (regex literals never span lines),
 *      found via the shared {@link scanRegexLiteral} scanner; and
 *   3. what follows the closing `/` (after optional flags) is a regex-consuming
 *      method call (`.test(` / `.exec(` / `.match(`) or a statement/expression
 *      boundary (`)`, `;`, `,`, `]`, whitespace, or end-of-input) — never an
 *      operand that would make it a division chain.
 */
function looksLikeRegexAfterCloser(src: string, slashIdx: number): boolean {
  const after = src[slashIdx + 1];
  if (
    after === undefined ||
    after === " " ||
    after === "\t" ||
    after === "\n" ||
    after === "\r"
  ) {
    return false;
  }
  const end = scanRegexLiteral(src, slashIdx);
  if (end <= slashIdx) return false; // no same-line terminator → division
  // Skip regex flags (e.g. the `i` in `/re/i`) before inspecting the tail.
  let j = end;
  while (j < src.length && /[a-z]/i.test(src[j])) j++;
  const rest = src.slice(j);
  return /^\s*(?:\.(?:test|exec|match)\s*\(|[);,\]]|$)/.test(rest);
}

/**
 * Scan a regex literal starting at `src[start] === "/"`. Honors backslash
 * escapes and character classes (`[...]`, inside which `/` is not a terminator).
 * Returns the index just past the closing `/` (before flags), or `start` if no
 * closing `/` is found before a newline / end-of-input (i.e. NOT a regex — the
 * `/` is a division operator). Regex literals cannot span newlines.
 */
function scanRegexLiteral(src: string, start: number): number {
  const n = src.length;
  let i = start + 1;
  let inClass = false;
  while (i < n) {
    const ch = src[i];
    if (ch === "\n") return start; // regex cannot span a newline → not a regex
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) return i + 1; // past the closing slash
    i++;
  }
  return start; // unterminated → not a regex
}

export interface RouteInfo {
  path: string;
  methods: string[];
  /** True when the file wires an auth guard (requireAuth/OrThrow, requireRole, or requireSuperAdmin). */
  hasAuthGuard: boolean;
  protectedMethods: string[];
}

export interface RouteAuth {
  hasAuthGuard: boolean;
  protectedMethods: string[];
}

/**
 * Detect, from a route file's source, whether it wires an auth guard and which
 * exported HTTP methods are individually guarded.
 *
 * Mirrors the auditor's exact call-pattern: an auth guard counts only when it is
 * both IMPORTED and CALLED (`guard(`) inside the method body — a mere mention in
 * a comment/string does not count, so a doc-comment reference is still flagged.
 * `requireRole` is treated as equivalent to (stronger than) `requireAuth`, so
 * RBAC-gated routes are not falsely reported as unprotected.
 */
export function detectRouteAuth(content: string, methods: string[]): RouteAuth {
  // Match against code only: a guard mentioned in a comment or string literal
  // must NOT count as an invoked guard (else an unprotected write route could
  // be misclassified as guarded and slip past the gate).
  const code = stripCommentsAndStrings(content);

  const hasAuthGuard =
    AUTH_GUARD_IMPORT_RE.test(code) && AUTH_GUARD_CALL_RE.test(code);

  const protectedMethods: string[] = [];
  if (hasAuthGuard) {
    for (const method of methods) {
      const funcPattern = new RegExp(
        `export\\s+(?:async\\s+)?function\\s+${method}\\b[\\s\\S]*?(?=export\\s+(?:async\\s+)?function|$)`,
      );
      const funcMatch = code.match(funcPattern);
      if (funcMatch && AUTH_GUARD_CALL_RE.test(funcMatch[0])) {
        protectedMethods.push(method);
      }
    }
  }
  return { hasAuthGuard, protectedMethods };
}

/**
 * A route is an "unprotected write" if it exposes a write method that is NOT
 * covered by an auth guard (requireAuth/requireRole/requireSuperAdmin). This is
 * checked per-method (via protectedMethods), so a route that guards GET but
 * leaves POST open is still flagged — a file-level "has any auth guard" check
 * would miss that partial-guard case.
 */
export function isUnprotectedWriteRoute(route: RouteInfo): boolean {
  return route.methods.some(
    (m) => WRITE_METHODS.includes(m) && !route.protectedMethods.includes(m),
  );
}

/**
 * Compute the auth-drift result against the accepted baseline:
 *  - offenders: unprotected-write routes NOT in the allowlist → fail CI.
 *  - stale: allowlist entries that are no longer unprotected writes (fixed or
 *    removed) → warn only, so legit cleanup never breaks CI.
 */
export function computeAuthDrift(
  routes: RouteInfo[],
  allowlist: string[],
): { unprotectedWrites: string[]; offenders: string[]; stale: string[] } {
  const allow = new Set(allowlist);
  const unprotectedWrites = routes
    .filter(isUnprotectedWriteRoute)
    .map((r) => r.path);
  const current = new Set(unprotectedWrites);
  const offenders = unprotectedWrites.filter((p) => !allow.has(p));
  const stale = allowlist.filter((p) => !current.has(p));
  return { unprotectedWrites, offenders, stale };
}
