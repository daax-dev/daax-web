/**
 * Container Card Component
 *
 * Displays a single container with status, ports, and quick actions.
 */

"use client";

import { useState } from "react";
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

interface ConnectionInfo {
  type: string;
  connectionString: string;
  credentials: { label: string; value: string; sensitive?: boolean }[];
}

function getConnectionInfo(container: TestContainer): ConnectionInfo | null {
  const image = container.image.toLowerCase();
  const hostPort = container.ports[0]?.hostPort;

  if (!hostPort) return null;

  // PostgreSQL
  if (image.includes("postgres")) {
    return {
      type: "PostgreSQL",
      connectionString: `postgresql://test:[REDACTED]@localhost:${hostPort}/testdb`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: "testdb" },
        { label: "User", value: "test" },
        { label: "Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // MySQL
  if (image.includes("mysql")) {
    return {
      type: "MySQL",
      connectionString: `mysql://test:[REDACTED]@localhost:${hostPort}/testdb`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: "testdb" },
        { label: "User", value: "test" },
        { label: "Password", value: "[REDACTED]", sensitive: true },
        { label: "Root Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // MariaDB
  if (image.includes("mariadb")) {
    return {
      type: "MariaDB",
      connectionString: `mysql://test:[REDACTED]@localhost:${hostPort}/testdb`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "Database", value: "testdb" },
        { label: "User", value: "test" },
        { label: "Password", value: "[REDACTED]", sensitive: true },
        { label: "Root Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // MongoDB
  if (image.includes("mongo")) {
    return {
      type: "MongoDB",
      connectionString: `mongodb://test:[REDACTED]@localhost:${hostPort}`,
      credentials: [
        { label: "Host", value: `localhost:${hostPort}` },
        { label: "User", value: "test" },
        { label: "Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // Redis
  if (image.includes("redis")) {
    return {
      type: "Redis",
      connectionString: `redis://localhost:${hostPort}`,
      credentials: [{ label: "Host", value: `localhost:${hostPort}` }],
    };
  }

  // RabbitMQ
  if (image.includes("rabbitmq")) {
    const mgmtPort = container.ports.find(
      (p) => p.containerPort === 15672,
    )?.hostPort;
    return {
      type: "RabbitMQ",
      connectionString: `amqp://test:[REDACTED]@localhost:${hostPort}`,
      credentials: [
        { label: "AMQP Host", value: `localhost:${hostPort}` },
        {
          label: "Management UI",
          value: mgmtPort ? `http://localhost:${mgmtPort}` : "N/A",
        },
        { label: "User", value: "test" },
        { label: "Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // Elasticsearch
  if (image.includes("elasticsearch")) {
    return {
      type: "Elasticsearch",
      connectionString: `http://localhost:${hostPort}`,
      credentials: [{ label: "URL", value: `http://localhost:${hostPort}` }],
    };
  }

  // Keycloak
  if (image.includes("keycloak")) {
    return {
      type: "Keycloak",
      connectionString: `http://localhost:${hostPort}`,
      credentials: [
        { label: "URL", value: `http://localhost:${hostPort}` },
        { label: "Admin User", value: "admin" },
        { label: "Admin Password", value: "[REDACTED]", sensitive: true },
      ],
    };
  }

  // LocalStack
  if (image.includes("localstack")) {
    return {
      type: "LocalStack",
      connectionString: `http://localhost:${hostPort}`,
      credentials: [
        { label: "Endpoint", value: `http://localhost:${hostPort}` },
        { label: "AWS_ENDPOINT_URL", value: `http://localhost:${hostPort}` },
      ],
    };
  }

  return null;
}

export function ContainerCard({
  container,
  onAction,
  expanded: initialExpanded = false,
}: ContainerCardProps) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [loading, setLoading] = useState<ContainerAction | null>(null);

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
              const connInfo = getConnectionInfo(container);
              if (!connInfo) return null;
              return (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-primary">
                    {connInfo.type} Connection
                  </p>

                  {/* Connection String */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Connection String
                    </p>
                    <button
                      onClick={() => copyToClipboard(connInfo.connectionString)}
                      className="w-full text-left text-xs font-mono bg-background px-2 py-1.5 rounded border hover:border-primary/50 transition-colors flex items-center gap-2"
                      title="Click to copy"
                    >
                      <span className="truncate flex-1">
                        {connInfo.connectionString}
                      </span>
                      <Copy className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  </div>

                  {/* Credentials Grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {connInfo.credentials.map((cred, idx) => (
                      <button
                        key={idx}
                        onClick={() => copyToClipboard(cred.value)}
                        className="text-left text-xs hover:bg-background/50 px-1 py-0.5 rounded transition-colors flex items-center justify-between gap-1"
                        title="Click to copy"
                      >
                        <span className="text-muted-foreground">
                          {cred.label}:
                        </span>
                        <span className="font-mono font-medium truncate">
                          {cred.value}
                        </span>
                      </button>
                    ))}
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
