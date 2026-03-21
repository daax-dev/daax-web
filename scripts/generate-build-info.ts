#!/usr/bin/env bun
// Generate build info at build time
// This creates a static file that won't change at runtime

import { execSync } from "child_process";
import { writeFileSync } from "fs";

const now = new Date();
const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}.${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

let hostname = process.env.BUILD_HOST || "";
if (!hostname) {
  try {
    hostname = execSync("hostname -s", { encoding: "utf-8" }).trim();
  } catch {
    hostname = "unknown";
  }
}

let branch = "unknown";
try {
  branch = execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf-8",
  }).trim();
} catch {
  branch = process.env.BUILD_BRANCH || "unknown";
}

let commit = "000000";
try {
  commit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
} catch {
  commit = process.env.BUILD_COMMIT || "000000";
}

const buildInfo = {
  hostname,
  branch,
  commit,
  timestamp,
};

console.log("Build info:", buildInfo);

const content = `// AUTO-GENERATED - DO NOT EDIT
// Generated at build time by scripts/generate-build-info.ts

export const BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)} as const;
`;

writeFileSync("lib/build-info.generated.ts", content);
console.log("Generated lib/build-info.generated.ts");
