/**
 * Project signals: git and GitHub state collected by daax itself with fixed,
 * read-only commands (no shell, argument arrays only), then handed to the
 * agent in its prompt. The agent gets no shell, so it cannot turn a "read"
 * command into a write (see plan.ts READ_BUILTINS).
 */

import { execFile } from "node:child_process";

const SIGNAL_TIMEOUT_MS = 20_000;
const MAX_SIGNAL_CHARS = 6_000;

interface SignalCommand {
  label: string;
  command: string;
  args: string[];
}

export const SIGNAL_COMMANDS: readonly SignalCommand[] = [
  {
    label: "git status",
    command: "git",
    args: ["status", "--short", "--branch"],
  },
  {
    label: "recent commits",
    command: "git",
    args: ["log", "-15", "--date=short", "--format=%h %ad %an %s"],
  },
  {
    label: "open pull requests",
    command: "gh",
    args: [
      "pr",
      "list",
      "--state",
      "open",
      "--limit",
      "20",
      "--json",
      "number,title,headRefName,isDraft,reviewDecision,updatedAt",
    ],
  },
  {
    label: "recent CI runs",
    command: "gh",
    args: [
      "run",
      "list",
      "--limit",
      "10",
      "--json",
      "databaseId,workflowName,status,conclusion,headBranch,createdAt",
    ],
  },
];

function runOne(
  cmd: SignalCommand,
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      cmd.command,
      cmd.args,
      {
        cwd,
        env: env as NodeJS.ProcessEnv,
        timeout: SIGNAL_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        signal,
      },
      (err, stdout, stderr) => {
        if (err) {
          const why = (stderr || err.message).trim().split("\n")[0];
          resolve(`(unavailable: ${why.slice(0, 200)})`);
          return;
        }
        const out = stdout.trim() || "(none)";
        resolve(
          out.length > MAX_SIGNAL_CHARS
            ? `${out.slice(0, MAX_SIGNAL_CHARS)}… [truncated]`
            : out,
        );
      },
    );
  });
}

/** Collect every signal; failures are reported inline, never thrown. */
export async function collectSignals(
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  const outputs = await Promise.all(
    SIGNAL_COMMANDS.map((c) => runOne(c, cwd, env, signal)),
  );
  return SIGNAL_COMMANDS.map(
    (c, i) =>
      `### ${c.label} (\`${c.command} ${c.args.join(" ")}\`)\n${outputs[i]}`,
  ).join("\n\n");
}
