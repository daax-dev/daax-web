"use client";

import { useState, useEffect, useCallback } from "react";
import { Globe, Send, Save, Trash2, Loader2, Plus, X } from "lucide-react";
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

interface RestTemplate {
  name: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export default function RestApiToolPage() {
  // Use state to avoid hydration mismatch
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<string[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const res = await fetch("/api/api-tools/templates?type=rest");
      const data = await res.json();
      if (data.success) {
        setTemplates(data.data || []);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoadingTemplates(false);
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

  if (!mounted) return null;
  if (!visible) return null;

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const template: RestTemplate = {
        name: templateName.trim(),
        method,
        url,
        headers,
        body,
      };
      const res = await fetch("/api/api-tools/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "rest",
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
        `/api/api-tools/templates/rest/${encodeURIComponent(name)}`,
      );
      const data = await res.json();
      if (data.success && data.data) {
        const template = data.data as RestTemplate;
        setMethod(template.method);
        setUrl(template.url);
        setHeaders(template.headers || {});
        setBody(template.body || "");
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
        `/api/api-tools/templates?type=rest&name=${encodeURIComponent(templateToDelete)}`,
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

  const handleSend = async () => {
    if (!url) return;
    setLoading(true);
    setResponse(null);
    try {
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };
      if (
        body &&
        (method === "POST" || method === "PUT" || method === "PATCH")
      ) {
        options.body = body;
      }

      let res: Response;
      try {
        res = await fetch(url, options);
      } catch (fetchError) {
        // Classify network errors for better user feedback
        let errorMessage: string;
        const isAbortError =
          (typeof DOMException !== "undefined" &&
            fetchError instanceof DOMException &&
            (fetchError as any).name === "AbortError") ||
          (fetchError as any)?.name === "AbortError";
        if (isAbortError) {
          errorMessage = "Request Aborted: The request was cancelled.";
        } else if (fetchError instanceof TypeError) {
          const msg = fetchError.message.toLowerCase();
          if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
            errorMessage = `Network Error: ${fetchError.message}. This may be due to CORS restrictions, network connectivity, or the server being unreachable.`;
          } else if (msg.includes("invalid url")) {
            errorMessage = `Invalid URL: ${fetchError.message}. Please check the URL format.`;
          } else {
            errorMessage = `Request Error: ${fetchError.message}`;
          }
        } else {
          errorMessage = `Error: ${fetchError instanceof Error ? fetchError.message : "Unknown network error"}`;
        }
        setResponse(errorMessage);
        setLoading(false);
        return;
      }

      let text: string;
      try {
        text = await res.text();
      } catch (parseError) {
        setResponse(
          `Status: ${res.status} ${res.statusText}\n\nError reading response body: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
        );
        setLoading(false);
        return;
      }

      let formattedResponse = `Status: ${res.status} ${res.statusText}\n`;
      formattedResponse += `Headers:\n${JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2)}\n\n`;
      formattedResponse += `Body:\n${text}`;
      setResponse(formattedResponse);
    } catch (error) {
      setResponse(
        `Unexpected Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Globe className="h-8 w-8" />
          REST / HTTP API Tool
        </h1>
        <p className="text-muted-foreground">
          Create and test HTTP requests with full control over methods, headers,
          and body.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
              >
                <option>GET</option>
                <option>POST</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
                <option>HEAD</option>
                <option>OPTIONS</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">URL</label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.example.com/endpoint"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Headers</label>
              <div className="space-y-2">
                {Object.entries(headers).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <Input
                      value={key}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        const newHeaders = { ...headers };
                        delete newHeaders[key];
                        newHeaders[newKey] = value;
                        setHeaders(newHeaders);
                      }}
                      placeholder="Header name"
                      className="flex-1"
                    />
                    <Input
                      value={value}
                      onChange={(e) =>
                        setHeaders({ ...headers, [key]: e.target.value })
                      }
                      placeholder="Header value"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        const newHeaders = { ...headers };
                        delete newHeaders[key];
                        setHeaders(newHeaders);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const existingKeys = Object.keys(headers);
                    const baseKey = "New-Header";
                    let newKey = baseKey;
                    let suffix = 1;
                    while (existingKeys.includes(newKey)) {
                      newKey = `${baseKey}-${suffix++}`;
                    }
                    setHeaders({ ...headers, [newKey]: "" });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Header
                </Button>
              </div>
            </div>
            {(method === "POST" || method === "PUT" || method === "PATCH") && (
              <div>
                <label className="text-sm font-medium mb-2 block">Body</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  className="font-mono text-sm"
                  rows={6}
                />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSend} disabled={loading || !url}>
                <Send className="h-4 w-4 mr-2" />
                {loading ? "Sending..." : "Send Request"}
              </Button>
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Save className="h-4 w-4 mr-2" />
                    Save Template
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Save Template</DialogTitle>
                    <DialogDescription>
                      Save this request configuration for later use.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Template Name
                      </label>
                      <Input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="My API Request"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveTemplate();
                          }
                        }}
                      />
                    </div>
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
              <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-96">
                {response}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">
                Send a request to see the response here
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Saved Templates</span>
            {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved templates. Create one by clicking &ldquo;Save
              Template&rdquo; above.
            </p>
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
