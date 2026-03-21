"use client";

/**
 * TTP Browser - MITRE ATT&CK Style Matrix View
 *
 * Displays SAFE-MCP techniques organized by tactic in a scrollable matrix.
 * Supports filtering, search, and severity color-coding.
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Search,
  Filter,
  X,
  ExternalLink,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import type { Technique, Tactic, Severity } from "../types";
import { TACTICS } from "../types";

interface TTPBrowserProps {
  onSelectTechnique?: (technique: Technique) => void;
}

export function TTPBrowser({ onSelectTechnique }: TTPBrowserProps) {
  const router = useRouter();
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [documentedOnly, setDocumentedOnly] = useState(false);

  // Selected technique for detail view
  const [selectedTechnique, setSelectedTechnique] = useState<Technique | null>(
    null,
  );

  // Fetch techniques from API
  useEffect(() => {
    async function fetchTechniques() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (severityFilter !== "all") params.set("severity", severityFilter);
        if (documentedOnly) params.set("documented", "true");
        params.set("limit", "100");

        const response = await fetch(
          `/api/cyber/safe-mcp/techniques?${params}`,
        );
        const data = await response.json();

        if (data.success) {
          setTechniques(data.techniques);
          setError(null);
        } else {
          setError(data.error || "Failed to load techniques");
        }
      } catch (err) {
        setError("Failed to connect to API");
        console.error("Error fetching techniques:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchTechniques();
  }, [search, severityFilter, documentedOnly]);

  // Group techniques by tactic
  const techniquesByTactic = useMemo(() => {
    const grouped = new Map<string, Technique[]>();

    // Initialize all tactics
    for (const tactic of TACTICS) {
      grouped.set(tactic.id, []);
    }

    // Group techniques
    for (const technique of techniques) {
      const tacticId = technique.tactic.id;
      const existing = grouped.get(tacticId) || [];
      existing.push(technique);
      grouped.set(tacticId, existing);
    }

    return grouped;
  }, [techniques]);

  // Severity color mapping
  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/50";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "low":
        return "bg-green-500/20 text-green-400 border-green-500/50";
    }
  };

  const handleTechniqueClick = (technique: Technique) => {
    setSelectedTechnique(technique);
    onSelectTechnique?.(technique);
  };

  const clearFilters = () => {
    setSearch("");
    setSeverityFilter("all");
    setDocumentedOnly(false);
  };

  const hasActiveFilters = search || severityFilter !== "all" || documentedOnly;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search techniques..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={severityFilter}
          onValueChange={(value) =>
            setSeverityFilter(value as Severity | "all")
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={documentedOnly ? "secondary" : "outline"}
          size="sm"
          onClick={() => setDocumentedOnly(!documentedOnly)}
        >
          <Filter className="h-4 w-4 mr-1" />
          Documented Only
        </Button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}

        <div className="text-sm text-muted-foreground ml-auto">
          {techniques.length} techniques
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="px-6 py-4 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Matrix View */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-pulse text-muted-foreground">
                Loading techniques...
              </div>
            </div>
          ) : (
            <div className="flex gap-3 min-w-max">
              {TACTICS.map((tactic) => (
                <TacticColumn
                  key={tactic.id}
                  tactic={tactic}
                  techniques={techniquesByTactic.get(tactic.id) || []}
                  onTechniqueClick={handleTechniqueClick}
                  selectedId={selectedTechnique?.id}
                  getSeverityColor={getSeverityColor}
                />
              ))}
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Technique Detail Panel */}
      {selectedTechnique && (
        <TechniqueDetailPanel
          technique={selectedTechnique}
          onClose={() => setSelectedTechnique(null)}
          getSeverityColor={getSeverityColor}
          onViewDetails={(t) =>
            router.push(`/cyber/safe-mcp/techniques/${t.id}`)
          }
        />
      )}
    </div>
  );
}

// Tactic Column Component
interface TacticColumnProps {
  tactic: Tactic;
  techniques: Technique[];
  onTechniqueClick: (technique: Technique) => void;
  selectedId?: string;
  getSeverityColor: (severity: Severity) => string;
}

function TacticColumn({
  tactic,
  techniques,
  onTechniqueClick,
  selectedId,
  getSeverityColor,
}: TacticColumnProps) {
  return (
    <div className="w-[200px] flex-shrink-0">
      {/* Tactic Header */}
      <div className="bg-muted/50 rounded-t-lg p-3 border border-b-0">
        <h3 className="font-medium text-sm truncate" title={tactic.name}>
          {tactic.name}
        </h3>
        <p
          className="text-xs text-muted-foreground truncate"
          title={tactic.description}
        >
          {tactic.description}
        </p>
        <Badge variant="outline" className="mt-1 text-xs">
          {techniques.length} techniques
        </Badge>
      </div>

      {/* Technique Cards */}
      <div className="border rounded-b-lg min-h-[200px] bg-background">
        {techniques.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No techniques
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {techniques.map((technique) => (
              <TechniqueCard
                key={technique.id}
                technique={technique}
                onClick={() => onTechniqueClick(technique)}
                isSelected={technique.id === selectedId}
                getSeverityColor={getSeverityColor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Technique Card Component
interface TechniqueCardProps {
  technique: Technique;
  onClick: () => void;
  isSelected: boolean;
  getSeverityColor: (severity: Severity) => string;
}

function TechniqueCard({
  technique,
  onClick,
  isSelected,
  getSeverityColor,
}: TechniqueCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2 rounded border transition-colors ${
        isSelected
          ? "border-primary bg-primary/10"
          : "border-transparent hover:border-muted-foreground/20 hover:bg-muted/50"
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="text-xs font-mono text-muted-foreground">
          {technique.id}
        </span>
        <Badge
          className={`text-[10px] px-1 py-0 ${getSeverityColor(technique.severity)}`}
        >
          {technique.severity}
        </Badge>
      </div>
      <p className="text-sm font-medium mt-1 line-clamp-2">{technique.name}</p>
      {technique.hasDocumentation && (
        <Badge variant="outline" className="text-[10px] mt-1">
          Documented
        </Badge>
      )}
    </button>
  );
}

// Technique Detail Panel
interface TechniqueDetailPanelProps {
  technique: Technique;
  onClose: () => void;
  getSeverityColor: (severity: Severity) => string;
  onViewDetails: (technique: Technique) => void;
}

function TechniqueDetailPanel({
  technique,
  onClose,
  getSeverityColor,
  onViewDetails,
}: TechniqueDetailPanelProps) {
  return (
    <div className="border-t bg-muted/30">
      <div className="px-6 py-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">
                {technique.id}
              </span>
              <Badge className={getSeverityColor(technique.severity)}>
                {technique.severity}
              </Badge>
            </div>
            <h2 className="text-lg font-semibold mt-1">{technique.name}</h2>
            <p className="text-sm text-muted-foreground">
              {technique.tactic.name} ({technique.tactic.id})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={() => onViewDetails(technique)}
            >
              View Full Details
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium mb-2">Description</h3>
            <p className="text-sm text-muted-foreground line-clamp-4">
              {technique.description}
            </p>
          </div>

          {/* Attack Vectors */}
          <div>
            <h3 className="text-sm font-medium mb-2">Attack Vectors</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              {technique.attackVectors.slice(0, 3).map((vector, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary">-</span>
                  <span className="line-clamp-1">{vector}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Impact */}
          <div>
            <h3 className="text-sm font-medium mb-2">Impact Assessment</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Confidentiality:</span>{" "}
                <span className="font-medium">
                  {technique.impactAssessment.confidentiality}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Integrity:</span>{" "}
                <span className="font-medium">
                  {technique.impactAssessment.integrity}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Availability:</span>{" "}
                <span className="font-medium">
                  {technique.impactAssessment.availability}
                </span>
              </div>
            </div>
          </div>

          {/* Mitigations */}
          <div>
            <h3 className="text-sm font-medium mb-2">Key Mitigations</h3>
            <div className="flex flex-wrap gap-1">
              {technique.mitigations.preventive.slice(0, 3).map((m) => (
                <Badge key={m.id} variant="outline" className="text-xs">
                  {m.id}
                </Badge>
              ))}
              {technique.mitigations.detective.slice(0, 2).map((m) => (
                <Badge key={m.id} variant="secondary" className="text-xs">
                  {m.id}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {/* References */}
        {technique.references.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">References</h3>
            <div className="flex flex-wrap gap-2">
              {technique.references.slice(0, 3).map((ref, i) => (
                <a
                  key={i}
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {ref.title}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
