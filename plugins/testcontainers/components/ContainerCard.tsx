/**
 * Container Card Component
 *
 * Displays a single container with status, ports, and quick actions.
 */

"use client";

import { useState, useEffect } from "react";
import {
  Play,
  Square,
  RotateCcw,
  Trash2,
  FileText,
  ChevronDown,
  ChevronUp,
  Copy,
  Clock,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { TestContainer, ContainerAction } from "../types";
import { getConnectionInfo, SECRET_MASK } from "../lib/connection-info";
import { StatusBadge } from "./StatusBadge";

interface ContainerCardProps {
  container: TestContainer;
  onAction: (action: ContainerAction, id: string) => Promise<void>;
  expanded?: boolean;
}

function formatAge(createdAt: string): string {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
  toast.success("Copied to clipboard");
}

export function ContainerCard({
  container,
  onAction,
  expanded: initialExpanded = false,
}: ContainerCardProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [loading, setLoading] = useState<ContainerAction | null>(null);
  // Connection credentials (including secrets) are fetched lazily on expand via
  // the single-container detail endpoint; the bulk list never carries secrets.
  const [detail, setDetail] = useState<TestContainer | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (!expanded || detail) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/testcontainers/${container.id}`);
        if (!response.ok) return;
        const data: TestContainer = await response.json();
        if (!cancelled) setDetail(data);
      } catch {
        // Non-fatal: panel falls back to masked display without secrets.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded, detail, container.id]);

  const handleAction = async (action: ContainerAction) => {
    setLoading(action);
    try {
      await onAction(action, container.id);
    } finally {
      setLoading(null);
    }
  };

  const isRunning = container.status === "running";
  const isStopped =
    container.status === "exited" || container.status === "dead";

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate" title={container.name}>
                {container.name}
              </h3>
              <StatusBadge status={container.status} />
            </div>
            <p
              className="text-sm text-muted-foreground truncate mt-1"
              title={container.image}
            >
              {container.image}
            </p>
          </div>

          <div className="flex items-center gap-1">
            {/* Start/Stop button */}
            {isRunning ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAction("stop")}
                disabled={loading !== null}
                title="Stop container"
              >
                {loading === "stop" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </Button>
            ) : isStopped ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAction("start")}
                disabled={loading !== null}
                title="Start container"
              >
                {loading === "start" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            ) : null}

            {/* Restart button */}
            {isRunning && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleAction("restart")}
                disabled={loading !== null}
                title="Restart container"
              >
                {loading === "restart" ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Logs button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleAction("logs")}
              disabled={loading !== null}
              title="View logs"
            >
              <FileText className="h-4 w-4" />
            </Button>

            {/* Remove button with confirmation */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  disabled={loading !== null}
                  title="Remove container"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Container</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove{" "}
                    <strong>{container.name}</strong>?
                    {isRunning && " The container will be stopped first."}
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleAction("remove")}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {loading === "remove" ? "Removing..." : "Remove"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Expand/collapse button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        {/* Port mappings */}
        {container.ports.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {container.ports.map((port, idx) => (
              <button
                key={idx}
                onClick={() =>
                  copyToClipboard(
                    `localhost:${port.hostPort || port.containerPort}`,
                  )
                }
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs",
                  "bg-muted hover:bg-muted/80 transition-colors cursor-pointer",
                )}
                title="Click to copy"
              >
                <span className="text-muted-foreground">
                  {port.containerPort}
                </span>
                {port.hostPort && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium">{port.hostPort}</span>
                  </>
                )}
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Age */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{formatAge(container.createdAt)}</span>
          {container.project && (
            <>
              <span className="mx-1">•</span>
              <span>{container.project}</span>
            </>
          )}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {/* Connection Info */}
            {(() => {
              const connInfo = getConnectionInfo(detail ?? container);
              if (!connInfo) return null;
              const hasSecrets = connInfo.credentials.some((c) => c.sensitive);
              const reveal = showSecrets && connInfo.secretsAvailable;
              const connectionString = reveal
                ? connInfo.connectionString
                : connInfo.maskedConnectionString;
              const copyConnectionString = connInfo.secretsAvailable
                ? connInfo.connectionString
                : connInfo.maskedConnectionString;
              return (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-primary">
                      {connInfo.type} Connection
                    </p>
                    {hasSecrets && (
                      <button
                        onClick={() => setShowSecrets((v) => !v)}
                        disabled={!connInfo.secretsAvailable}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={
                          !connInfo.secretsAvailable
                            ? "Loading credentials…"
                            : reveal
                              ? "Hide credentials"
                              : "Reveal credentials"
                        }
                      >
                        {reveal ? (
                          <>
                            <EyeOff className="h-3 w-3" /> Hide
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3" /> Reveal
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Connection String */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Connection String
                    </p>
                    <button
                      onClick={() => copyToClipboard(copyConnectionString)}
                      className="w-full text-left text-xs font-mono bg-background px-2 py-1.5 rounded border hover:border-primary/50 transition-colors flex items-center gap-2"
                      title="Click to copy"
                    >
                      <span className="truncate flex-1">
                        {connectionString}
                      </span>
                      <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  </div>

                  {/* Credentials Grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {connInfo.credentials.map((cred, idx) => {
                      const masked = cred.sensitive && !reveal;
                      const display = masked ? SECRET_MASK : cred.value;
                      const copyable =
                        !cred.sensitive || connInfo.secretsAvailable;
                      return (
                        <button
                          key={idx}
                          onClick={() =>
                            copyable
                              ? copyToClipboard(cred.value)
                              : toast.info("Credentials still loading…")
                          }
                          className="text-left text-xs hover:bg-background/50 px-1 py-0.5 rounded transition-colors flex items-center justify-between gap-1"
                          title={copyable ? "Click to copy" : "Loading…"}
                        >
                          <span className="text-muted-foreground">
                            {cred.label}:
                          </span>
                          <span className="font-mono font-medium truncate">
                            {display}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Container ID */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Container ID
              </p>
              <button
                onClick={() => copyToClipboard(container.containerId)}
                className="text-xs font-mono bg-muted px-2 py-1 rounded hover:bg-muted/80 transition-colors"
                title="Click to copy"
              >
                {container.containerId.substring(0, 24)}...
              </button>
            </div>

            {/* Networks */}
            {container.networks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Networks
                </p>
                <div className="flex flex-wrap gap-1">
                  {container.networks.map((net) => (
                    <span
                      key={net}
                      className="text-xs bg-muted px-2 py-0.5 rounded"
                    >
                      {net}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Mounts */}
            {container.mounts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Volumes
                </p>
                <div className="space-y-1">
                  {container.mounts.map((mount, idx) => (
                    <p
                      key={idx}
                      className="text-xs font-mono truncate"
                      title={`${mount.source} → ${mount.target}`}
                    >
                      {mount.target} {mount.readOnly && "(ro)"}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Health */}
            {container.health && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Health
                </p>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                    container.health.status === "healthy" &&
                      "bg-green-500/20 text-green-600",
                    container.health.status === "unhealthy" &&
                      "bg-red-500/20 text-red-600",
                    container.health.status === "starting" &&
                      "bg-yellow-500/20 text-yellow-600",
                    !["healthy", "unhealthy", "starting"].includes(
                      container.health.status,
                    ) && "bg-gray-500/20 text-gray-600",
                  )}
                >
                  {container.health.status}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
