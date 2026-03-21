"use client";

import { useState, useEffect, useCallback } from "react";
import { Code2, Send, Save, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isSubFeatureVisible } from "@/lib/settings";

interface GraphQLTemplate {
  name: string;
  endpoint: string;
  query: string;
  variables: string;
}

/**
 * Basic GraphQL query syntax validation
 * Checks for common syntax issues before sending
 *
 * NOTE: This is a basic heuristic validation that only checks:
 * - Operation keywords (query, mutation, subscription, fragment, or shorthand {)
 * - Balanced braces
 *
 * It does NOT validate:
 * - Field names, arguments, or variable references
 * - Schema compliance or type correctness
 * - Complete GraphQL grammar (would require graphql-js parser)
 */
function validateGraphQLQuery(query: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = query.trim();
  if (!trimmed) {
    return { valid: false, error: "Query cannot be empty" };
  }

  // Remove GraphQL-style line comments before validation
  const withoutLineComments = trimmed.replace(/#.*$/gm, "");
  const normalized = withoutLineComments.trimStart();

  // Check for basic structure (must start with query, mutation, subscription, or fragment, or be shorthand)
  const operationPattern = /^(query|mutation|subscription|fragment|\{)/i;
  if (!operationPattern.test(normalized)) {
    return {
      valid: false,
      error:
        "Query must start with 'query', 'mutation', 'subscription', 'fragment', or '{'",
    };
  }

  // Check for balanced braces
  let braceCount = 0;
  for (const char of normalized) {
    if (char === "{") braceCount++;
    if (char === "}") braceCount--;
    if (braceCount < 0) {
      return { valid: false, error: "Unbalanced braces: extra closing brace" };
    }
  }
  if (braceCount !== 0) {
    return { valid: false, error: "Unbalanced braces: missing closing brace" };
  }

  return { valid: true };
}

export default function GraphQLApiToolPage() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [endpoint, setEndpoint] = useState("/api/api-tools/tests/graphql");
  const [query, setQuery] = useState(`query {
  hello(name: "World")
}`);
  const [variables, setVariables] = useState("{}");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/api-tools/templates?type=graphql");
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || []);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Check visibility on mount to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    setVisible(isSubFeatureVisible("ai-coding", "api-tools"));
  }, []);

  // Validate query on change
  useEffect(() => {
    const validation = validateGraphQLQuery(query);
    setQueryError(validation.valid ? null : validation.error || null);
  }, [query]);

  if (!mounted) return null;
  if (!visible) return null;

  const handleSend = async () => {
    if (!endpoint || !query) return;

    // Validate query before sending
    const validation = validateGraphQLQuery(query);
    if (!validation.valid) {
      setResponse(`Query Validation Error: ${validation.error}`);
      return;
    }

    setLoading(true);
    setResponse(null);
    try {
      let parsedVariables = {};
      try {
        parsedVariables = JSON.parse(variables || "{}");
      } catch {
        setResponse("Error: Invalid JSON in variables field");
        setLoading(false);
        return;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: parsedVariables }),
      });
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setResponse(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const template: GraphQLTemplate = {
        name: templateName.trim(),
        endpoint,
        query,
        variables,
      };
      const res = await fetch("/api/api-tools/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "graphql",
          name: templateName.trim(),
          data: template,
        }),
      });
      if (res.ok) {
        setSaveDialogOpen(false);
        setTemplateName("");
        loadTemplates();
      }
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const handleLoadTemplate = async (name: string) => {
    try {
      const res = await fetch(
        `/api/api-tools/templates/graphql/${encodeURIComponent(name)}`,
      );
      const data = await res.json();
      if (data.success && data.data) {
        const template = data.data as GraphQLTemplate;
        setEndpoint(template.endpoint);
        setQuery(template.query);
        setVariables(template.variables || "{}");
      }
    } catch (error) {
      console.error("Error loading template:", error);
    }
  };

  const confirmDeleteTemplate = (name: string) => {
    setTemplateToDelete(name);
    setDeleteDialogOpen(true);
  };

  const handleDeleteTemplate = async () => {
    if (!templateToDelete) return;
    try {
      const res = await fetch(
        `/api/api-tools/templates?type=graphql&name=${encodeURIComponent(templateToDelete)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        loadTemplates();
      }
    } catch (error) {
      console.error("Error deleting template:", error);
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Code2 className="h-8 w-8" />
          GraphQL API Tool
        </h1>
        <p className="text-muted-foreground">
          Query and mutate GraphQL APIs with schema introspection and
          auto-completion.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Query</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Endpoint</label>
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="/api/api-tools/tests/graphql"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Query</label>
              <Textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="query { ... }"
                className="font-mono text-sm"
                rows={8}
              />
              {queryError && (
                <p className="text-sm text-destructive mt-1">{queryError}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Variables (JSON)
              </label>
              <Textarea
                value={variables}
                onChange={(e) => setVariables(e.target.value)}
                placeholder='{"name": "World"}'
                className="font-mono text-sm"
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSend}
                disabled={loading || !endpoint || !query}
              >
                <Send className="h-4 w-4 mr-2" />
                {loading ? "Sending..." : "Send Query"}
              </Button>
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Template</DialogTitle>
                    <DialogDescription>
                      Save this GraphQL query for later use.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Template Name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveTemplate();
                        }
                      }}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSaveDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSaveTemplate}
                        disabled={!templateName.trim()}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            {response ? (
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96 font-mono">
                {response}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">
                Send a query to see the response here
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Saved Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved templates.</p>
          ) : (
            <div className="space-y-2">
              {templates.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50"
                >
                  <span className="text-sm font-medium">{name}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadTemplate(name)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmDeleteTemplate(name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the template &ldquo;
              {templateToDelete}&rdquo;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTemplate}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
