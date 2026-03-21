"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, X, AlertCircle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { McpServerConfig } from "@/hooks/use-mcp-gateway";

interface McpFormData {
  id: string;
  type: "stdio" | "http";
  command: string;
  args: string[];
  env: Record<string, string>;
  url: string;
  scope: "global" | "project";
}

interface McpEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  initialData?: {
    id: string;
    config?: McpServerConfig;
    sourcePath?: string;
  };
  onSave: (
    id: string,
    config: McpServerConfig,
    scope: "global" | "project",
    sourcePath?: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_FORM_DATA: McpFormData = {
  id: "",
  type: "stdio",
  command: "",
  args: [],
  env: {},
  url: "",
  scope: "global",
};

export function McpEditor({
  open,
  onOpenChange,
  mode,
  initialData,
  onSave,
}: McpEditorProps) {
  const [formData, setFormData] = useState<McpFormData>(DEFAULT_FORM_DATA);
  const [argsInput, setArgsInput] = useState("");
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === "edit" && initialData) {
        const config = initialData.config || {};
        setFormData({
          id: initialData.id,
          type: config.type || "stdio",
          command: config.command || "",
          args: config.args || [],
          env: config.env || {},
          url: config.url || "",
          scope: "global", // Edit uses sourcePath instead
        });
        setArgsInput((config.args || []).join(" "));
      } else {
        setFormData(DEFAULT_FORM_DATA);
        setArgsInput("");
      }
      setEnvKey("");
      setEnvValue("");
      // Clear any previous error when dialog opens
      setError(null);
    } else {
      // Clear error when dialog closes so it doesn't persist on next open
      setError(null);
    }
  }, [open, mode, initialData]);

  const handleArgsChange = (value: string) => {
    setArgsInput(value);
    // Split by whitespace, but preserve quoted strings
    const args = value.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    setFormData((prev) => ({
      ...prev,
      args: args.map((arg) => arg.replace(/^"|"$/g, "")),
    }));
  };

  const addEnvVar = () => {
    if (envKey && envValue) {
      setFormData((prev) => ({
        ...prev,
        env: { ...prev.env, [envKey]: envValue },
      }));
      setEnvKey("");
      setEnvValue("");
    }
  };

  const removeEnvVar = (key: string) => {
    setFormData((prev) => {
      const newEnv = { ...prev.env };
      delete newEnv[key];
      return { ...prev, env: newEnv };
    });
  };

  const validate = (): string | null => {
    if (!formData.id.trim()) {
      return "MCP ID is required";
    }
    if (!/^[a-z0-9-_]+$/.test(formData.id)) {
      return "MCP ID must contain only lowercase letters, numbers, hyphens, and underscores";
    }
    if (formData.type === "stdio" && !formData.command.trim()) {
      return "Command is required for stdio type";
    }
    if (formData.type === "http" && !formData.url.trim()) {
      return "URL is required for http type";
    }
    if (formData.type === "http") {
      try {
        const parsedUrl = new URL(formData.url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          return "URL must use http or https protocol";
        }
      } catch (error) {
        // Don't log the URL value to avoid leaking secrets in query params
        console.error(
          "Error parsing MCP HTTP URL in McpEditor.validate:",
          error instanceof Error ? error.message : "URL parsing failed",
        );
        return "Invalid URL format";
      }
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const config: McpServerConfig = {
        type: formData.type,
      };

      if (formData.type === "stdio") {
        config.command = formData.command;
        if (formData.args.length > 0) {
          config.args = formData.args;
        }
      } else {
        config.url = formData.url;
      }

      if (Object.keys(formData.env).length > 0) {
        config.env = formData.env;
      }

      const result = await onSave(
        formData.id,
        config,
        formData.scope,
        mode === "edit" ? initialData?.sourcePath : undefined,
      );

      if (result.success) {
        onOpenChange(false);
      } else {
        setError(result.error || "Failed to save MCP");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save MCP");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "add" ? "Add MCP Server" : `Edit MCP: ${initialData?.id}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Add a new MCP server to your configuration."
              : "Update the MCP server configuration."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* MCP ID */}
          <div className="space-y-2">
            <Label htmlFor="mcp-id">MCP ID</Label>
            <Input
              id="mcp-id"
              placeholder="my-mcp-server"
              value={formData.id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, id: e.target.value }))
              }
              disabled={mode === "edit"}
              className={mode === "edit" ? "opacity-60" : ""}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this MCP server
            </p>
          </div>

          {/* Type Selection */}
          <Tabs
            value={formData.type}
            onValueChange={(v) =>
              setFormData((prev) => ({ ...prev, type: v as "stdio" | "http" }))
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="stdio">Stdio (Command)</TabsTrigger>
              <TabsTrigger value="http">HTTP (URL)</TabsTrigger>
            </TabsList>

            <TabsContent value="stdio" className="space-y-4 mt-4">
              {/* Command */}
              <div className="space-y-2">
                <Label htmlFor="command">Command</Label>
                <Input
                  id="command"
                  placeholder="npx @modelcontextprotocol/server-xxx"
                  value={formData.command}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      command: e.target.value,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The command to run the MCP server
                </p>
              </div>

              {/* Args */}
              <div className="space-y-2">
                <Label htmlFor="args">Arguments</Label>
                <Input
                  id="args"
                  placeholder='--port 3000 --config "path/to/config.json"'
                  value={argsInput}
                  onChange={(e) => handleArgsChange(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Command line arguments (space-separated, use quotes for values
                  with spaces)
                </p>
                {formData.args.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.args.map((arg, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs bg-muted rounded"
                      >
                        {arg}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="http" className="space-y-4 mt-4">
              {/* URL */}
              <div className="space-y-2">
                <Label htmlFor="url">Server URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="http://localhost:3100/mcp"
                  value={formData.url}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, url: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The HTTP endpoint for the MCP server
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Environment Variables */}
          <div className="space-y-2">
            <Label>Environment Variables</Label>
            <div className="flex gap-2">
              <Input
                placeholder="KEY"
                value={envKey}
                onChange={(e) => setEnvKey(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="value"
                value={envValue}
                onChange={(e) => setEnvValue(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={addEnvVar}
                disabled={!envKey || !envValue}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {Object.entries(formData.env).length > 0 && (
              <div className="space-y-1 mt-2">
                {Object.entries(formData.env).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between px-2 py-1 text-xs bg-muted rounded"
                  >
                    <span>
                      <code className="text-primary">{key}</code>=
                      <span className="text-muted-foreground">{value}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => removeEnvVar(key)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scope (only for add mode) */}
          {mode === "add" && (
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select
                value={formData.scope}
                onValueChange={(v) =>
                  setFormData((prev) => ({
                    ...prev,
                    scope: v as "global" | "project",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">
                    Global (~/.claude.json)
                  </SelectItem>
                  <SelectItem value="project">Project-specific</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Global MCPs are available in all projects
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "add" ? "Add MCP" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
