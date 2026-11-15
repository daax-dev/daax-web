"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Container,
  GitBranch,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { AGENT_ACCENTS, AGENT_ICONS } from "@/components/icons/AgentIcons";
import type { AIToolId } from "@/components/terminal/TerminalManager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { getSettings, sortByAgentOrder } from "@/lib/settings";
import {
  substrateApi,
  type CreateSessionRequest,
  type SessionView,
} from "@/lib/substrate/client";
import { cn } from "@/lib/utils";
import {
  EgressFields,
  type EgressValidity,
  type EgressValue,
} from "./EgressFields";
import {
  addOpenTab,
  branchError,
  readOpenTabs,
  repoError,
  writeOpenTabs,
} from "./open-tabs";
import { AGENT_LABELS, SANDBOX_LABELS } from "./state";
import { useSubstrateConfig } from "./use-substrate-config";

export type Backend = "container" | "substrate";

const CONTAINER_AGENTS: { id: AIToolId; label: string }[] = [
  { id: "claude", label: "Claude Code" },
  { id: "herdr-claude", label: "Herdr + Claude" },
  { id: "opencode", label: "OpenCode" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "gemini", label: "Gemini CLI" },
  { id: "codex", label: "Codex CLI" },
];

type SubstrateAgent = CreateSessionRequest["agent"];
type SandboxClass = NonNullable<CreateSessionRequest["sandboxClass"]>;

function AgentOption({
  id,
  label,
  value,
  disabled,
  note,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  note?: string;
}) {
  const Icon = AGENT_ICONS[id as keyof typeof AGENT_ICONS];
  const accent = AGENT_ACCENTS[id as keyof typeof AGENT_ACCENTS];
  return (
    <label
      htmlFor={`launch-agent-${value}`}
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <RadioGroupItem
        id={`launch-agent-${value}`}
        value={value}
        disabled={disabled}
      />
      {Icon && <Icon className={cn("h-4 w-4", accent)} />}
      <span className="flex-1">{label}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </label>
  );
}

/**
 * The AI Coding launcher (dx#123): backend (container | substrate), agent,
 * template, sandbox class, provisional repo/branch, and the egress allowlist.
 * The substrate option appears only when `/api/substrate/config` says the
 * backend is enabled. The container path is the layout's existing launch.
 */
export function AgentLaunchDialog({
  open,
  onOpenChange,
  onLaunchContainer,
  onLaunchedSubstrate,
  defaultBackend = "container",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Container launch; absent = the container option is not offered. */
  onLaunchContainer?: (tool: AIToolId) => void;
  /** After a substrate session is created; default opens it on the Substrate page. */
  onLaunchedSubstrate?: (session: SessionView) => void;
  defaultBackend?: Backend;
}) {
  const router = useRouter();
  const cfg = useSubstrateConfig();
  const substrateOn = cfg.status === "enabled";
  const config = cfg.status === "enabled" ? cfg.config : null;

  const [backend, setBackend] = useState<Backend>(defaultBackend);
  const [containerTool, setContainerTool] = useState<AIToolId>("claude");
  const [agent, setAgent] = useState<SubstrateAgent>("claude");
  const [cls, setCls] = useState<SandboxClass>("gvisor");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [egress, setEgress] = useState<EgressValue>({ presets: [], hosts: [] });
  const [validity, setValidity] = useState<EgressValidity>({
    checking: false,
    valid: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Effective backend: substrate only when enabled, container only when offered.
  const effective: Backend =
    backend === "substrate" && substrateOn
      ? "substrate"
      : onLaunchContainer
        ? "container"
        : "substrate";

  useEffect(() => {
    if (config) setCls(config.defaultClass as SandboxClass);
  }, [config]);

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      setBackend(defaultBackend);
    }
  }, [open, defaultBackend]);

  const containerAgents = useMemo(
    () =>
      sortByAgentOrder(
        CONTAINER_AGENTS,
        (t) => t.id,
        typeof window === "undefined" ? undefined : getSettings().aiAgentOrder,
      ),
    [],
  );

  const template = config?.templates?.[agent]?.[cls] ?? null;
  const repoErr = repoError(repo);
  const branchErr = branchError(branch);
  const substrateReady =
    effective === "substrate" &&
    !!config &&
    !!template &&
    !repoErr &&
    !branchErr &&
    validity.valid &&
    !validity.checking;

  const launch = async () => {
    if (effective === "container") {
      onLaunchContainer?.(containerTool);
      onOpenChange(false);
      return;
    }
    if (!substrateReady) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const session = await substrateApi.create({
        agent,
        sandboxClass: cls,
        egressPresets: egress.presets,
        egressHosts: egress.hosts,
      });
      writeOpenTabs(
        addOpenTab(readOpenTabs(), {
          id: session.id,
          ...(repo.trim() ? { repo: repo.trim() } : {}),
          ...(branch.trim() ? { branch: branch.trim() } : {}),
        }),
      );
      onOpenChange(false);
      if (onLaunchedSubstrate) onLaunchedSubstrate(session);
      else
        router.push(
          `/ai-coding/substrate?open=${encodeURIComponent(session.id)}`,
        );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Launch New Agent</DialogTitle>
          <DialogDescription>
            {effective === "substrate"
              ? "A persistent substrate session: it keeps running when the tab closes, until you End it."
              : "A container session on this host."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {(substrateOn || !onLaunchContainer) && (
            <section className="space-y-2">
              <Label className="text-sm font-medium">Backend</Label>
              <RadioGroup
                value={effective}
                onValueChange={(v) => setBackend(v as Backend)}
                className="grid grid-cols-2 gap-2"
                aria-label="Backend"
              >
                {onLaunchContainer && (
                  <label
                    htmlFor="launch-backend-container"
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem
                      id="launch-backend-container"
                      value="container"
                    />
                    <Container className="h-4 w-4" />
                    Container
                  </label>
                )}
                {substrateOn && (
                  <label
                    htmlFor="launch-backend-substrate"
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem
                      id="launch-backend-substrate"
                      value="substrate"
                    />
                    <Boxes className="h-4 w-4" />
                    Substrate
                  </label>
                )}
              </RadioGroup>
              {cfg.status === "loading" && (
                <p className="text-xs text-muted-foreground">
                  Checking the substrate backend…
                </p>
              )}
              {cfg.status === "error" && (
                <p className="text-xs text-destructive" role="alert">
                  Substrate backend unavailable: {cfg.message}
                </p>
              )}
            </section>
          )}

          {effective === "container" ? (
            <section className="space-y-2">
              <Label className="text-sm font-medium">Agent</Label>
              <RadioGroup
                value={containerTool}
                onValueChange={(v) => setContainerTool(v as AIToolId)}
                className="grid gap-2 sm:grid-cols-2"
                aria-label="Agent"
              >
                {containerAgents.map((a) => (
                  <AgentOption
                    key={a.id}
                    id={a.id}
                    value={a.id}
                    label={a.label}
                  />
                ))}
              </RadioGroup>
            </section>
          ) : config ? (
            <>
              <section className="space-y-2">
                <Label className="text-sm font-medium">Agent</Label>
                <RadioGroup
                  value={agent}
                  onValueChange={(v) => setAgent(v as SubstrateAgent)}
                  className="grid gap-2 sm:grid-cols-2"
                  aria-label="Agent"
                >
                  {config.agents.map((a) => (
                    <AgentOption
                      key={a}
                      id={a}
                      value={a}
                      label={AGENT_LABELS[a] ?? a}
                      note={
                        config.templates?.[a]?.[cls]
                          ? undefined
                          : "not deployed"
                      }
                    />
                  ))}
                </RadioGroup>
              </section>

              <section className="space-y-2">
                <Label className="text-sm font-medium">Sandbox class</Label>
                <RadioGroup
                  value={cls}
                  onValueChange={(v) => setCls(v as SandboxClass)}
                  className="grid grid-cols-2 gap-2"
                  aria-label="Sandbox class"
                >
                  {config.sandboxClasses.map((c) => (
                    <label
                      key={c}
                      htmlFor={`launch-class-${c}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`launch-class-${c}`} value={c} />
                      {SANDBOX_LABELS[c] ?? c}
                      {c === "microvm" && (
                        <Badge variant="outline" className="ml-auto gap-1">
                          <ShieldCheck className="h-3 w-3" />
                          nono
                        </Badge>
                      )}
                    </label>
                  ))}
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  The nono in-sandbox policy is active only on microVM. gVisor
                  sessions run without it.
                </p>
              </section>

              <section className="space-y-1">
                <Label className="text-sm font-medium">Template</Label>
                {template ? (
                  <p
                    className="font-mono text-xs"
                    data-testid="launch-template"
                  >
                    {template}
                  </p>
                ) : (
                  <p
                    className="text-xs text-destructive"
                    role="alert"
                    data-testid="launch-template"
                  >
                    No ActorTemplate is deployed for{" "}
                    {AGENT_LABELS[agent] ?? agent} on{" "}
                    {SANDBOX_LABELS[cls] ?? cls}.
                  </p>
                )}
              </section>

              <Separator />

              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  <Label className="text-sm font-medium">
                    Repository and branch
                  </Label>
                  <Badge variant="outline">optional</Badge>
                  <Badge variant="secondary">provisional</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Not applied yet. How an agent gets code is still open in
                  dx#117; the leading option is one git branch per agent (
                  <code className="font-mono">agent/&lt;name&gt;</code>). This
                  value is kept with the tab in this browser only and is not
                  sent to the session.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Input
                      aria-label="Repository"
                      placeholder="owner/repo"
                      value={repo}
                      onChange={(e) => setRepo(e.target.value)}
                      aria-invalid={!!repoErr}
                      className="h-8"
                    />
                    {repoErr && (
                      <p className="text-xs text-destructive" role="alert">
                        {repoErr}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Input
                      aria-label="Branch"
                      placeholder={`agent/${agent}`}
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      aria-invalid={!!branchErr}
                      className="h-8"
                    />
                    {branchErr && (
                      <p className="text-xs text-destructive" role="alert">
                        {branchErr}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <Separator />

              <section className="space-y-2">
                <Label className="text-sm font-medium">Egress allowlist</Label>
                <EgressFields
                  idPrefix="launch-egress"
                  value={egress}
                  onChange={setEgress}
                  presets={
                    config.egressPresets as Record<string, readonly string[]>
                  }
                  onValidity={setValidity}
                />
              </section>
            </>
          ) : null}

          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void launch()}
            disabled={
              submitting || (effective === "substrate" && !substrateReady)
            }
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Launch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
