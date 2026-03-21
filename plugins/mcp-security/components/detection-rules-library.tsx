"use client";

/**
 * Detection Rules Library
 *
 * Browse Sigma-format detection rules with syntax highlighting,
 * filtering, and optional test log replay capability.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  X,
  AlertCircle,
  AlertTriangle,
  FileCode,
  Play,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Shield,
  Terminal,
} from "lucide-react";
import type { DetectionRule, RuleLevel, TestLog } from "../types";

export function DetectionRulesLibrary() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<RuleLevel | "all">("all");
  const [statusFilter, setStatusFilter] = useState<
    "experimental" | "stable" | "all"
  >("all");

  // Selected rule
  const [selectedRule, setSelectedRule] = useState<DetectionRule | null>(null);

  // Fetch rules
  useEffect(() => {
    async function fetchRules() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (levelFilter !== "all") params.set("level", levelFilter);
        if (statusFilter !== "all") params.set("status", statusFilter);

        const response = await fetch(`/api/cyber/safe-mcp/rules?${params}`);
        const data = await response.json();

        if (data.success) {
          setRules(data.rules);
          setError(null);
        } else {
          setError(data.error || "Failed to load rules");
        }
      } catch (err) {
        setError("Failed to connect to API");
        console.error("Error fetching rules:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchRules();
  }, [search, levelFilter, statusFilter]);

  const getLevelColor = (level: RuleLevel) => {
    switch (level) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/50";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "low":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "informational":
        return "bg-gray-500/20 text-gray-400 border-gray-500/50";
    }
  };

  const getLevelIcon = (level: RuleLevel) => {
    switch (level) {
      case "critical":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "high":
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case "medium":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "low":
        return <Shield className="h-4 w-4 text-blue-500" />;
      case "informational":
        return <Shield className="h-4 w-4 text-gray-500" />;
    }
  };

  const clearFilters = () => {
    setSearch("");
    setLevelFilter("all");
    setStatusFilter("all");
  };

  const hasActiveFilters =
    search || levelFilter !== "all" || statusFilter !== "all";

  // Calculate statistics
  const stats = {
    total: rules.length,
    byLevel: {
      critical: rules.filter((r) => r.level === "critical").length,
      high: rules.filter((r) => r.level === "high").length,
      medium: rules.filter((r) => r.level === "medium").length,
      low: rules.filter((r) => r.level === "low").length,
    },
    stable: rules.filter((r) => r.status === "stable").length,
    experimental: rules.filter((r) => r.status === "experimental").length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stats Header */}
      <div className="border-b px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <StatCard
            title="Total Rules"
            value={stats.total}
            icon={<FileCode className="h-4 w-4" />}
          />
          <StatCard
            title="Critical"
            value={stats.byLevel.critical}
            color="text-red-400"
          />
          <StatCard
            title="High"
            value={stats.byLevel.high}
            color="text-orange-400"
          />
          <StatCard
            title="Medium"
            value={stats.byLevel.medium}
            color="text-yellow-400"
          />
          <StatCard
            title="Stable"
            value={stats.stable}
            color="text-green-400"
          />
          <StatCard
            title="Experimental"
            value={stats.experimental}
            color="text-blue-400"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={levelFilter}
          onValueChange={(value) => setLevelFilter(value as RuleLevel | "all")}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="informational">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as "experimental" | "stable" | "all")
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
            <SelectItem value="experimental">Experimental</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="px-6 py-4 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Rules List */}
        <ScrollArea className="flex-1 border-r">
          <div className="p-6 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-muted-foreground">
                  Loading rules...
                </div>
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No rules found
              </div>
            ) : (
              rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  isSelected={selectedRule?.id === rule.id}
                  onClick={() => setSelectedRule(rule)}
                  getLevelColor={getLevelColor}
                  getLevelIcon={getLevelIcon}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Detail Panel */}
        {selectedRule && (
          <div className="w-[500px] flex-shrink-0 overflow-hidden flex flex-col">
            <RuleDetailPanel
              rule={selectedRule}
              onClose={() => setSelectedRule(null)}
              getLevelColor={getLevelColor}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card
interface StatCardProps {
  title: string;
  value: number;
  icon?: React.ReactNode;
  color?: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        {icon}
        {title}
      </div>
      <div className={`text-2xl font-bold ${color || ""}`}>{value}</div>
    </div>
  );
}

// Rule Card
interface RuleCardProps {
  rule: DetectionRule;
  isSelected: boolean;
  onClick: () => void;
  getLevelColor: (level: RuleLevel) => string;
  getLevelIcon: (level: RuleLevel) => React.ReactNode;
}

function RuleCard({
  rule,
  isSelected,
  onClick,
  getLevelColor,
  getLevelIcon,
}: RuleCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${
        isSelected ? "border-primary" : "hover:border-muted-foreground/30"
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {getLevelIcon(rule.level)}
              <Badge className={getLevelColor(rule.level)}>{rule.level}</Badge>
              <Badge
                variant={rule.status === "stable" ? "default" : "secondary"}
              >
                {rule.status}
              </Badge>
            </div>
            <CardTitle className="text-base line-clamp-1">
              {rule.title}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
          {rule.description}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link
            href={`/cyber/safe-mcp/techniques/${rule.techniqueId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline"
          >
            {rule.techniqueId}
          </Link>
          <span>by {rule.author}</span>
          <span>{rule.date}</span>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {rule.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
          {rule.tags.length > 3 && (
            <Badge variant="outline" className="text-xs">
              +{rule.tags.length - 3}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Rule Detail Panel
interface RuleDetailPanelProps {
  rule: DetectionRule;
  onClose: () => void;
  getLevelColor: (level: RuleLevel) => string;
}

function RuleDetailPanel({
  rule,
  onClose,
  getLevelColor,
}: RuleDetailPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["yaml", "detection"]),
  );
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState<{
    loading: boolean;
    result: { anyMatch: boolean; matched: number; tested: number } | null;
    error: string | null;
  }>({ loading: false, result: null, error: null });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const copyYaml = () => {
    navigator.clipboard.writeText(rule.rawYaml);
  };

  const runTest = async () => {
    if (!testInput.trim()) return;

    try {
      setTestResult({ loading: true, result: null, error: null });

      let logData;
      try {
        logData = JSON.parse(testInput);
      } catch {
        setTestResult({
          loading: false,
          result: null,
          error: "Invalid JSON input",
        });
        return;
      }

      const response = await fetch(
        `/api/cyber/safe-mcp/rules/${rule.id}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ logData }),
        },
      );

      const data = await response.json();

      if (data.success) {
        setTestResult({
          loading: false,
          result: {
            anyMatch: data.anyMatch,
            matched: data.matched,
            tested: data.tested,
          },
          error: null,
        });
      } else {
        setTestResult({ loading: false, result: null, error: data.error });
      }
    } catch (err) {
      setTestResult({
        loading: false,
        result: null,
        error: "Failed to run test",
      });
    }
  };

  const loadTestLog = (log: TestLog) => {
    setTestInput(JSON.stringify(log.data, null, 2));
    setTestResult({ loading: false, result: null, error: null });
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <Badge className={getLevelColor(rule.level)}>{rule.level}</Badge>
            <Badge
              variant={rule.status === "stable" ? "default" : "secondary"}
              className="ml-2"
            >
              {rule.status}
            </Badge>
            <h2 className="text-lg font-semibold mt-2">{rule.title}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {rule.description}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">Author:</span> {rule.author}
          </div>
          <div>
            <span className="text-muted-foreground">Date:</span> {rule.date}
          </div>
          <div>
            <span className="text-muted-foreground">Technique:</span>{" "}
            <Link
              href={`/cyber/safe-mcp/techniques/${rule.techniqueId}`}
              className="text-primary hover:underline"
            >
              {rule.techniqueId}
            </Link>
          </div>
          <div>
            <span className="text-muted-foreground">Log Source:</span>{" "}
            {rule.logsource.product}/{rule.logsource.service}
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-4">
          {rule.tags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* YAML Section */}
        <CollapsibleSection
          title="Sigma Rule (YAML)"
          icon={<FileCode className="h-4 w-4" />}
          isExpanded={expandedSections.has("yaml")}
          onToggle={() => toggleSection("yaml")}
          actions={
            <Button variant="ghost" size="icon" onClick={copyYaml}>
              <Copy className="h-4 w-4" />
            </Button>
          }
        >
          <div className="relative">
            <pre className="bg-muted p-4 rounded-md overflow-x-auto text-xs font-mono whitespace-pre">
              <YamlHighlight yaml={rule.rawYaml} />
            </pre>
          </div>
        </CollapsibleSection>

        {/* False Positives */}
        {rule.falsePositives.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              False Positives
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {rule.falsePositives.map((fp, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span>-</span>
                  <span>{fp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Test Logs */}
        {rule.testLogs && rule.testLogs.length > 0 && (
          <CollapsibleSection
            title="Test Logs"
            icon={<Terminal className="h-4 w-4" />}
            isExpanded={expandedSections.has("testlogs")}
            onToggle={() => toggleSection("testlogs")}
          >
            <div className="space-y-2">
              {rule.testLogs.map((log, i) => (
                <div
                  key={i}
                  className="p-3 bg-muted/50 rounded-md flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {log.shouldMatch ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className="text-sm font-medium">{log.name}</span>
                    </div>
                    {log.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadTestLog(log)}
                  >
                    Load
                  </Button>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Test Runner */}
        <CollapsibleSection
          title="Test Rule"
          icon={<Play className="h-4 w-4" />}
          isExpanded={expandedSections.has("test")}
          onToggle={() => toggleSection("test")}
        >
          <div className="space-y-3">
            <Textarea
              placeholder="Paste log data as JSON..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="font-mono text-xs min-h-[100px]"
            />
            <div className="flex items-center gap-3">
              <Button
                onClick={runTest}
                disabled={testResult.loading || !testInput.trim()}
              >
                {testResult.loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Test
                  </>
                )}
              </Button>
              {testResult.result && (
                <div className="flex items-center gap-2">
                  {testResult.result.anyMatch ? (
                    <Badge className="bg-red-500/20 text-red-400">
                      Match ({testResult.result.matched}/
                      {testResult.result.tested})
                    </Badge>
                  ) : (
                    <Badge className="bg-green-500/20 text-green-400">
                      No Match
                    </Badge>
                  )}
                </div>
              )}
              {testResult.error && (
                <span className="text-sm text-destructive">
                  {testResult.error}
                </span>
              )}
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </ScrollArea>
  );
}

// Collapsible Section
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  actions,
}: CollapsibleSectionProps) {
  return (
    <div className="border rounded-md mt-4">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </button>
      {isExpanded && <div className="p-3 pt-0">{children}</div>}
    </div>
  );
}

// YAML Syntax Highlighting
function YamlHighlight({ yaml }: { yaml: string }) {
  if (!yaml) return null;

  const lines = yaml.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        // Key-value detection
        const keyMatch = line.match(
          /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(:\s*)(.*)?$/,
        );
        if (keyMatch) {
          const [, indent, key, colon, value] = keyMatch;
          return (
            <div key={i}>
              <span>{indent}</span>
              <span className="text-cyan-400">{key}</span>
              <span>{colon}</span>
              {value && (
                <span className="text-green-400">{highlightValue(value)}</span>
              )}
            </div>
          );
        }

        // List item
        if (line.trim().startsWith("- ")) {
          const indent = line.match(/^(\s*)/)?.[1] || "";
          const content = line.trim().substring(2);
          return (
            <div key={i}>
              <span>{indent}</span>
              <span className="text-yellow-400">- </span>
              <span className="text-green-400">{highlightValue(content)}</span>
            </div>
          );
        }

        // Comment
        if (line.trim().startsWith("#")) {
          return (
            <div key={i} className="text-gray-500">
              {line}
            </div>
          );
        }

        return <div key={i}>{line}</div>;
      })}
    </>
  );
}

function highlightValue(value: string): React.ReactNode {
  // Quoted strings
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return <span className="text-amber-400">{value}</span>;
  }

  // Booleans
  if (value === "true" || value === "false") {
    return <span className="text-purple-400">{value}</span>;
  }

  // Numbers
  if (/^\d+$/.test(value)) {
    return <span className="text-blue-400">{value}</span>;
  }

  return value;
}
