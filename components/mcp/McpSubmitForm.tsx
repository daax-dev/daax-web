"use client";

import { useState } from "react";
import { Plus, Trash2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { submitMcpRequest } from "@/hooks/use-mcp";
import type { McpCategory } from "@/types/mcp";

interface Tool {
  name: string;
  description: string;
}

interface Resource {
  uri: string;
  name: string;
  description: string;
}

interface McpSubmitFormProps {
  onSubmitted?: () => void;
}

export function McpSubmitForm({ onSubmitted }: McpSubmitFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("0.1.0");
  const [category, setCategory] = useState<McpCategory>("tools");
  const [useGateway, setUseGateway] = useState(false);
  const [source, setSource] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setVersion("0.1.0");
    setCategory("tools");
    setUseGateway(false);
    setSource("");
    setSubmittedBy("");
    setTools([]);
    setResources([]);
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await submitMcpRequest({
      name,
      description,
      version,
      category,
      useGateway,
      tools: tools.filter((t) => t.name && t.description),
      resources: resources.filter((r) => r.uri && r.name),
      source: source || undefined,
      submittedBy,
    });

    setLoading(false);

    if (result.success) {
      setSuccess(true);
      onSubmitted?.();
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 2000);
    } else {
      setError(result.error || "Failed to submit");
    }
  };

  const addTool = () => setTools([...tools, { name: "", description: "" }]);
  const removeTool = (index: number) =>
    setTools(tools.filter((_, i) => i !== index));
  const updateTool = (index: number, field: keyof Tool, value: string) => {
    const updated = [...tools];
    updated[index][field] = value;
    setTools(updated);
  };

  const addResource = () =>
    setResources([...resources, { uri: "", name: "", description: "" }]);
  const removeResource = (index: number) =>
    setResources(resources.filter((_, i) => i !== index));
  const updateResource = (
    index: number,
    field: keyof Resource,
    value: string,
  ) => {
    const updated = [...resources];
    updated[index][field] = value;
    setResources(updated);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Submit MCP
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit New MCP</DialogTitle>
          <DialogDescription>
            Submit a new MCP to the catalog for review. Once approved, it will
            be available for installation.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <div className="text-green-500 text-lg font-medium mb-2">
              Submitted Successfully!
            </div>
            <p className="text-muted-foreground">
              Your MCP has been submitted for review.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Basic Info */}
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Awesome MCP"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this MCP do?"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="version">Version *</Label>
                  <Input
                    id="version"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="0.1.0"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as McpCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="coordination">Coordination</SelectItem>
                      <SelectItem value="observability">
                        Observability
                      </SelectItem>
                      <SelectItem value="tools">Tools</SelectItem>
                      <SelectItem value="data">Data</SelectItem>
                      <SelectItem value="gateway">Gateway</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="source">Source Repository</Label>
                <Input
                  id="source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="github.com/username/repo"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Route through Gateway</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable if this MCP should route through the central gateway
                  </p>
                </div>
                <Switch checked={useGateway} onCheckedChange={setUseGateway} />
              </div>
            </div>

            {/* Tools */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Tools</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addTool}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Tool
                </Button>
              </div>
              {tools.map((tool, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="Tool name"
                    value={tool.name}
                    onChange={(e) => updateTool(i, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Description"
                    value={tool.description}
                    onChange={(e) =>
                      updateTool(i, "description", e.target.value)
                    }
                    className="flex-[2]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTool(i)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Resources */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Resources</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addResource}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Resource
                </Button>
              </div>
              {resources.map((resource, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input
                    placeholder="mcp://name/path"
                    value={resource.uri}
                    onChange={(e) => updateResource(i, "uri", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Name"
                    value={resource.name}
                    onChange={(e) => updateResource(i, "name", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Description"
                    value={resource.description}
                    onChange={(e) =>
                      updateResource(i, "description", e.target.value)
                    }
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeResource(i)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Submitter Info */}
            <div className="grid gap-2 pt-4 border-t">
              <Label htmlFor="submittedBy">Your Name/Email *</Label>
              <Input
                id="submittedBy"
                value={submittedBy}
                onChange={(e) => setSubmittedBy(e.target.value)}
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Review
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
