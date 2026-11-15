Round-11 P1 is **FIXED**. No new P0–P3 findings.

| Round-11 item | Status | Evidence |
|---|---|---|
| `usage.engineVersion` disclosure | **FIXED** | Entire final usage object passes through recursive redaction at [runner.ts:329](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:329). Regression coverage includes version and usage at [runner-redaction.test.ts:91](/Users/jasonpoley/prj/dx/src/daax-web/tests/lib/workers/runner-redaction.test.ts:91). |
| Nonce disclosure through stored engine output | **FIXED** | Event fields, nested keys/values, summary, error and usage are redacted before persistence at [runner.ts:148](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:148) and [runner.ts:324](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:324). |
| Prompt text mistaken for execution ownership | **FIXED for the reported disclosure route** | The exposed nonce can no longer be copied from these payloads. Matching still accepts markers anywhere in engine command lines and relies on nonce secrecy: [cli-runner.ts:368](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:368). |

Earlier dispositions remain:

| Item | Status | Evidence |
|---|---|---|
| Tool-field masking | **FIXED** | [runner.ts:154](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:154) |
| ANSI/OSC literal bypass | **FIXED** | [runner.ts:119](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:119) |
| Object-key masking | **FIXED** | [runner.ts:137](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/runner.ts:137) |
| Executor reference excluded from API runs | **FIXED** | [store.ts:87](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/store.ts:87) |
| Arbitrary executable wrappers | **FIXED** | [cli-runner.ts:372](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:372) |
| Unresolved `host:pending` | **FIXED** | Ambiguity throws at [cli-runner.ts:452](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:452); exclusion remains at [scheduler.ts:202](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/scheduler.ts:202). |
| SDK lifecycle | **FIXED** | Persistence before spawn, detached execution and verified cleanup remain at [sdk-runner.ts:114](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/sdk-runner.ts:114), lines 182 and 219. |
| Signalling after verified cleanup | **FIXED** | Settlement guard remains at [cli-runner.ts:504](/Users/jasonpoley/prj/dx/src/daax-web/lib/workers/cli-runner.ts:504). |
| MCP trust boundary | **ACCEPTED-RESIDUAL** | Credential boundary remains documented at [digital-workers.md:292](/Users/jasonpoley/prj/dx/src/daax-web/docs/plans/digital-workers.md:292). |

Nine in-memory cases passed across all three engine dispatches, using real mappers/redaction with mocked engines and storage. Event and completion payloads contained no nonce; numeric usage remained intact. Wrapper rejection, pending-reference ambiguity and the settlement guard also passed.

Typecheck and patch-scoped formatting passed. ESLint reported zero errors and one unchanged-line warning. Five targeted Vitest suites executed no tests because the read-only sandbox denied temporary-directory creation. Builds and live recovery remain unvalidated under those constraints. No files were modified.

APPROVE