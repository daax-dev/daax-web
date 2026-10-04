"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  WORKER_AUTONOMY,
  WORKER_ENGINES,
  type WorkerAutonomy,
  type WorkerEngine,
  type WorkerMcpServer,
  type WorkerSummary,
} from "@/types/workers";
import { workersApi, type EngineInfo } from "./api";

const AUTONOMY_HELP: Record<WorkerAutonomy, string> = {
  observe: "Reads and reports. Proposes nothing, changes nothing.",
  propose:
    "Reads everything, changes nothing; recommends next actions for you to approve.",
  act: "May create/edit Backlog.md tasks and comment on GitHub. Never merges, pushes, deploys or deletes.",
};

export function ToolsTab({
  worker,
  engines,
  onSave,
}: {
  worker: WorkerSummary;
  engines: Record<WorkerEngine, EngineInfo> | null;
  onSave: (patch: Partial<WorkerSummary>) => Promise<void>;
}) {
  const [catalog, setCatalog] = useState<
    { id: string; name: string; source: string }[]
  >([]);
  const [pick, setPick] = useState("");
  const [inlineId, setInlineId] = useState("");
  const [inlineCmd, setInlineCmd] = useState("");
  const [inlineEnv, setInlineEnv] = useState("");

  useEffect(() => {
    workersApi
      .mcpCatalog()
      .then((r) => setCatalog(r.state?.mcps ?? []))
      .catch(() => setCatalog([]));
  }, []);

  const servers = worker.mcpServers;
  const save = (next: WorkerMcpServer[]) => onSave({ mcpServers: next });
  const addRef = () => {
    if (!pick || servers.some((s) => s.id === pick)) return;
    void save([...servers, { kind: "ref", id: pick }]);
    setPick("");
  };
  const addInline = () => {
    const [command, ...args] = inlineCmd.trim().split(/\s+/);
    if (!inlineId.trim() || !command) return;
    const envPassthrough = inlineEnv
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    void save([
      ...servers,
      {
        kind: "inline",
        id: inlineId.trim(),
        type: "stdio",
        command,
        args,
        envPassthrough,
      },
    ]);
    setInlineId("");
    setInlineCmd("");
    setInlineEnv("");
  };

  return (
    <div className="space-y-6" data-testid="tools-tab">
      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Engine</p>
          <Select
            value={worker.engine}
            onValueChange={(v) => void onSave({ engine: v as WorkerEngine })}
          >
            <SelectTrigger aria-label="Engine">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKER_ENGINES.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                  {engines && !engines[e].available ? " (unavailable)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {engines && (
            <p className="text-xs text-muted-foreground">
              {engines[worker.engine].note}
            </p>
          )}
          <Input
            defaultValue={worker.model ?? ""}
            placeholder="Model (optional, engine default when empty)"
            aria-label="Model"
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== worker.model) void onSave({ model: v });
            }}
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Autonomy</p>
          <Select
            value={worker.autonomy}
            onValueChange={(v) =>
              void onSave({ autonomy: v as WorkerAutonomy })
            }
          >
            <SelectTrigger aria-label="Autonomy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORKER_AUTONOMY.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {AUTONOMY_HELP[worker.autonomy]}
          </p>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">MCP servers</p>
        <p className="text-xs text-muted-foreground">
          Each run lists every server&apos;s tools and gives the engine only the
          ones this autonomy level allows. Secrets are never stored with the
          worker.
        </p>
        <ul className="space-y-1">
          {servers.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border px-3 py-2 text-sm"
            >
              <span>
                <span className="font-mono">{s.id}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {s.kind === "ref"
                    ? "from MCP configuration"
                    : `${s.command ?? s.url} ${(s.args ?? []).join(" ")}${s.envPassthrough?.length ? ` · env: ${s.envPassthrough.join(", ")}` : ""}`}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${s.id}`}
                onClick={() => void save(servers.filter((x) => x.id !== s.id))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
          {servers.length === 0 && (
            <li className="text-sm text-muted-foreground">No MCP servers.</li>
          )}
        </ul>
        <div className="flex gap-2">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger
              className="w-72"
              aria-label="Add from MCP configuration"
            >
              <SelectValue placeholder="Add from MCP configuration…" />
            </SelectTrigger>
            <SelectContent>
              {catalog
                .filter((c) => !servers.some((s) => s.id === c.id))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.source})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={addRef} disabled={!pick}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="grid gap-2 md:grid-cols-[10rem_1fr_14rem_auto]">
          <Input
            value={inlineId}
            onChange={(e) => setInlineId(e.target.value)}
            placeholder="id"
            aria-label="Server id"
          />
          <Input
            value={inlineCmd}
            onChange={(e) => setInlineCmd(e.target.value)}
            placeholder="command and args — e.g. backlog mcp start"
            aria-label="Server command"
          />
          <Input
            value={inlineEnv}
            onChange={(e) => setInlineEnv(e.target.value)}
            placeholder="env var names to pass (optional)"
            aria-label="Environment variable names"
          />
          <Button
            variant="outline"
            onClick={addInline}
            disabled={!inlineId.trim() || !inlineCmd.trim()}
          >
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>
      </section>
    </div>
  );
}
