/**
 * Worker templates. The Technical Project Manager is the first role
 * (docs/plans/digital-workers.md §6). Templates are created disabled with
 * `propose` autonomy; the operator enables them.
 */

import type { WorkerInput } from "./store";

export const TPM_INSTRUCTIONS = `Role: Technical Project Manager.

Mission: keep the operator's projects moving and visible. Know the state of every active goal, surface risks and blockers early, and propose the next concrete step.

How to work:
- Start from the active goals. For each goal, read its linked Backlog.md project: tasks by status, milestones, recent decisions.
- Check delivery signals with read-only commands: open and recently merged PRs (\`gh pr list\`, \`gh pr view\`, \`gh pr checks\`), failing CI runs (\`gh run list\`), and recent commits (\`git log\`).
- Classify each goal: on-track, at-risk, blocked, or done — and cite the evidence (task ids, PR numbers, run ids).
- A goal is at-risk when work in progress has not moved in several days, CI is failing on its PRs, or tasks are blocked on a decision.
- Name who or what unblocks each blocker. Separate decisions only the operator can make.
- Keep it short. The operator reads this between other work.

When asked a question (ad hoc or by voice), answer it directly first, in plain sentences, then include the report sections only if they add something.`;

export const TPM_TEMPLATE: WorkerInput = {
  slug: "tpm",
  name: "Technical Project Manager",
  role: "tpm",
  description:
    "Tracks goals across Backlog.md projects and GitHub, reports status, risks and blockers, and proposes next actions.",
  instructions: TPM_INSTRUCTIONS,
  engine: "claude-cli",
  model: null,
  runMode: "schedule",
  // Weekdays 08:00 and 16:00 UTC.
  cron: "0 8,16 * * 1-5",
  cooldownSeconds: 1800,
  maxRunsPerDay: 6,
  timeoutSeconds: 900,
  autonomy: "propose",
  executor: "auto",
  workingDir: null,
  mcpServers: [
    {
      kind: "inline",
      id: "backlog",
      type: "stdio",
      command: "backlog",
      args: ["mcp", "start"],
    },
  ],
  enabled: false,
};

export const WORKER_TEMPLATES: Record<string, WorkerInput> = {
  tpm: TPM_TEMPLATE,
};
