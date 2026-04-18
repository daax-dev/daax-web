#!/usr/bin/env node
// Read results/vitest-report.json + modules.json, write RESULTS.md.
// Runs on the host (no deps) — Node >= 18.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const suiteRoot = join(here, "..");

const matrix = JSON.parse(readFileSync(join(suiteRoot, "modules.json"), "utf8"));
const reportPath = join(suiteRoot, "results", "vitest-report.json");
if (!existsSync(reportPath)) {
  console.error(`No vitest report at ${reportPath} — run scripts/run.sh first.`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));

const byModule = new Map();
for (const tr of report.testResults ?? []) {
  const file = tr.name || tr.testFilePath || "";
  const id = file.split("/").pop().replace(/\.test\.ts$/, "");
  const test = (tr.assertionResults || [])[0];
  byModule.set(id, {
    status: tr.status,
    durationMs: (tr.endTime || 0) - (tr.startTime || 0),
    failure: test?.failureMessages?.[0]?.split("\n")[0] ?? null,
  });
}

const imageOverrides = {
  eventstoredb: "eventstore/eventstore (module default)",
  gcloud: "gcr.io/google.com/cloudsdktool/google-cloud-cli:563.0.0-emulators (PubSub)",
  selenium: "seleniarm/standalone-chromium:124.0 (arm64) / selenium/standalone-chrome:145.0 (amd64)",
};

const defaultImages = Object.fromEntries(
  (matrix.modules ?? []).map((m) => [m.id, imageOverrides[m.id] ?? m.image]),
);
const notes = {
  "azure-cosmosdb-emulator": "large image; slow first pull",
  "azureservicebus": "emulator wires sibling mssql container internally",
  "eventstoredb": "⚠ **deprecated** — superseded by `kurrentdb`; pinned to core `10.28.0` (two majors behind current 11.14.0)",
  "gcloud": "exercises `PubSubEmulatorContainer` only; also exports BigQuery, CloudStorage, Datastore, Firestore, Spanner",
  "k3s": "needs privileged docker; works on Docker Desktop",
  "mssqlserver": "`.acceptLicense()` required",
  "ollama": "server-only — no model pulled",
  "oraclefree": "multi-GB first pull",
  "selenium": "⚠ `selenium/standalone-chrome` is amd64-only; `seleniarm` arm64 fallback lags upstream",
};

function statusIcon(mod) {
  const r = byModule.get(mod.id);
  if (!r) return "⏳ not run";
  if (r.status === "passed") return `✅ pass (${(r.durationMs / 1000).toFixed(1)}s)`;
  if (r.status === "failed") return `❌ fail — ${r.failure ?? "see run.log"}`;
  return r.status;
}

const total = matrix.modules.length;
const ran = [...byModule.values()].length;
const passed = [...byModule.values()].filter((r) => r.status === "passed").length;
const failed = [...byModule.values()].filter((r) => r.status === "failed").length;

const lines = [];
lines.push(`# Test matrix — last run: ${new Date().toISOString()}`);
lines.push("");
lines.push(`**${passed}/${ran} modules pass** (${failed} fail, ${total - ran} not run). Core pinned at \`testcontainers@${matrix.coreLatest}\`.`);
lines.push("");
lines.push("| Module | Package | Image | Core | Status | Notes |");
lines.push("|---|---|---|---|---|---|");
for (const m of matrix.modules) {
  const coreCell = m.version === matrix.coreLatest ? matrix.coreLatest : `**${m.version}** ⚠`;
  const noteCell = notes[m.id] ?? "";
  lines.push(
    `| ${m.id} | \`${m.pkg}@${m.version}\` | \`${defaultImages[m.id] ?? "(upstream default)"}\` | ${coreCell} | ${statusIcon(m)} | ${noteCell} |`,
  );
}
lines.push("");
lines.push("## Flags");
lines.push("");
for (const m of matrix.modules) {
  if (m.deprecated) lines.push(`* \`${m.id}\` — **deprecated**, superseded by \`${m.supersededBy}\`. Install succeeds but core version is stale.`);
}
for (const [id, r] of byModule.entries()) {
  if (r.status === "failed") lines.push(`* \`${id}\` — **failed**: ${r.failure ?? "see run.log"}`);
}
lines.push("");
lines.push("Regenerate this file with `node scripts/generate-results.mjs` after a full run.");

writeFileSync(join(suiteRoot, "RESULTS.md"), lines.join("\n"));
console.log(`Wrote RESULTS.md — ${passed}/${ran} pass`);
