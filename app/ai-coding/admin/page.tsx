"use client";

/**
 * AI Coding > Admin (dx#123)
 *
 * Provider keys for the substrate LLM gateway (written to its Secret, never
 * echoed: each provider shows only a set/unset chip) and the audit log of
 * substrate actions. Admins only: the API answers 404 to everyone else.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw, ScrollText, Shield } from "lucide-react";
import { toast } from "sonner";

import { useSubstrateConfig } from "@/components/ai-coding/substrate/use-substrate-config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAccess } from "@/hooks/use-admin-access";
import {
  substrateApi,
  type ProviderId,
  type ProviderStatus,
  type SubstrateAuditRow,
} from "@/lib/substrate/client";
import { cn } from "@/lib/utils";

function SetChip({ set }: { set: boolean }) {
  return (
    <span
      data-testid="provider-key-chip"
      data-set={set ? "true" : "false"}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        set
          ? "border-success/40 bg-success/10 text-success"
          : "border-muted-foreground/30 bg-muted text-muted-foreground",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {set ? "set" : "unset"}
    </span>
  );
}

function ProviderRow({
  p,
  onChanged,
}: {
  p: ProviderStatus;
  onChanged: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.success(done);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      // Never keep a key in component state longer than the request.
      setValue("");
      setBusy(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center"
      data-testid={`provider-${p.id}`}
    >
      <div className="flex items-center gap-2 sm:w-48">
        <span className="text-sm font-medium">{p.label}</span>
        <SetChip set={p.set} />
      </div>
      <form
        className="flex flex-1 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          void run(
            () => substrateApi.setProviderKey(p.id as ProviderId, value),
            `${p.label} key saved. The gateway is restarting.`,
          );
        }}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          aria-label={`${p.label} API key`}
          placeholder={p.set ? "Replace key" : "Paste key"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="h-8"
        />
        <Button type="submit" size="sm" disabled={busy || !value.trim()}>
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !p.set}
          onClick={() =>
            void run(
              () => substrateApi.unsetProviderKey(p.id as ProviderId),
              `${p.label} key cleared. The gateway is restarting.`,
            )
          }
        >
          Unset
        </Button>
      </form>
      {error && (
        <p className="text-xs text-destructive sm:basis-full" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function detailText(d: SubstrateAuditRow["detail"]): string {
  if (!d) return "";
  const { session: _s, status: _st, ...rest } = d;
  return Object.entries(rest)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(
      ([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") || "[]" : String(v)}`,
    )
    .join(" ");
}

export default function AiCodingAdminPage() {
  const { isAdmin, loading } = useAdminAccess();
  const cfg = useSubstrateConfig();
  const [keys, setKeys] = useState<{
    namespace: string;
    secret: string;
    providers: ProviderStatus[];
  } | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [audit, setAudit] = useState<SubstrateAuditRow[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const enabled = cfg.status === "enabled";
  const keysConfigured = enabled && cfg.config.providerKeys;

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await substrateApi.providerKeys());
      setKeysError(null);
    } catch (err) {
      setKeysError((err as Error).message);
    }
  }, []);
  const loadAudit = useCallback(async () => {
    try {
      setAudit((await substrateApi.audit(200)).entries);
      setAuditError(null);
    } catch (err) {
      setAuditError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || !enabled) return;
    if (keysConfigured) void loadKeys();
    void loadAudit();
  }, [isAdmin, enabled, keysConfigured, loadKeys, loadAudit]);

  if (loading || cfg.status === "loading") {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="container max-w-screen-2xl mx-auto p-6">
        <Card className="p-6" data-testid="admin-only">
          <p className="text-sm text-muted-foreground">
            AI Coding administration is available to admins only.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-screen-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">AI Coding Admin</h1>
          <p className="text-sm text-muted-foreground">
            Substrate LLM gateway keys and the audit log of substrate actions.
          </p>
        </div>
      </div>

      {!enabled ? (
        <Card className="p-6" data-testid="substrate-disabled">
          <p className="text-sm text-muted-foreground">
            {cfg.status === "disabled"
              ? "The substrate backend is not enabled on this daax (DAAX_SUBSTRATE_ENABLED)."
              : `The substrate backend is unavailable: ${cfg.status === "error" ? cfg.message : ""}`}
          </p>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <h2 className="font-semibold">Provider keys</h2>
              {keys && (
                <span className="text-xs text-muted-foreground font-mono">
                  {keys.namespace}/{keys.secret}
                </span>
              )}
              {keysConfigured && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void loadKeys()}
                  aria-label="Refresh keys"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Keys go to the gateway Secret, one server-side-apply field manager
              per provider. They are never shown again; only set or unset is
              reported. Saving restarts the gateway, so running agents may see a
              brief error.
            </p>
            {!keysConfigured ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="keys-unconfigured"
              >
                Not configured: set DAAX_SUBSTRATE_GATEWAY_NAMESPACE (see
                deploy/env/README.md for the access the web plane needs).
              </p>
            ) : keysError ? (
              <p className="text-sm text-destructive" role="alert">
                {keysError}
              </p>
            ) : !keys ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="divide-y">
                {keys.providers.map((p) => (
                  <ProviderRow key={p.id} p={p} onChanged={loadKeys} />
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              <h2 className="font-semibold">Audit</h2>
              <span className="text-xs text-muted-foreground">
                substrate.* events, newest first
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => void loadAudit()}
                aria-label="Refresh audit"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            {auditError ? (
              <p className="text-sm text-destructive" role="alert">
                {auditError}
              </p>
            ) : !audit ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : audit.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No substrate actions yet.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Session</TableHead>
                      <TableHead>Detail</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.map((r) => (
                      <TableRow key={r.id} data-testid="audit-row">
                        <TableCell
                          className="text-xs whitespace-nowrap"
                          title={r.ts}
                        >
                          {new Date(r.ts).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.event.replace(/^substrate\./, "")}
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs max-w-[16ch] truncate"
                          title={r.subject ?? ""}
                        >
                          {r.subject ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "text-xs font-medium",
                              r.outcome === "ok"
                                ? "text-success"
                                : "text-destructive",
                            )}
                          >
                            {r.outcome}
                            {typeof r.detail?.status === "number"
                              ? ` (${r.detail.status})`
                              : ""}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {typeof r.detail?.session === "string"
                            ? r.detail.session.slice(0, 8)
                            : "—"}
                        </TableCell>
                        <TableCell
                          className="font-mono text-xs max-w-[40ch] truncate"
                          title={detailText(r.detail)}
                        >
                          {detailText(r.detail)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
