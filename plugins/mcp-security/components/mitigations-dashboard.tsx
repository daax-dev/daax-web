"use client";

/**
 * Mitigations Dashboard
 *
 * Displays SAFE-MCP mitigations with category filtering and effectiveness ratings.
 */

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import type { Mitigation, MitigationCategory, Effectiveness } from "../types";

const CATEGORIES: MitigationCategory[] = [
  "Architectural Defense",
  "Cryptographic Control",
  "AI-Based Defense",
  "Input Validation",
  "Supply Chain Security",
  "UI Security",
  "Isolation and Containment",
  "Detective Control",
  "Preventive Control",
  "Architectural Control",
  "Data Security",
  "Risk Management",
  "Human Factors",
];

export function MitigationsDashboard() {
  const [mitigations, setMitigations] = useState<Mitigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    MitigationCategory | "all"
  >("all");
  const [effectivenessFilter, setEffectivenessFilter] = useState<
    Effectiveness | "all"
  >("all");

  // Selected mitigation
  const [selectedMitigation, setSelectedMitigation] =
    useState<Mitigation | null>(null);

  // Fetch mitigations
  useEffect(() => {
    async function fetchMitigations() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (categoryFilter !== "all") params.set("category", categoryFilter);
        if (effectivenessFilter !== "all")
          params.set("effectiveness", effectivenessFilter);

        const response = await fetch(
          `/api/cyber/safe-mcp/mitigations?${params}`,
        );
        const data = await response.json();

        if (data.success) {
          setMitigations(data.mitigations);
          setError(null);
        } else {
          setError(data.error || "Failed to load mitigations");
        }
      } catch (err) {
        setError("Failed to connect to API");
        console.error("Error fetching mitigations:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchMitigations();
  }, [search, categoryFilter, effectivenessFilter]);

  // Calculate statistics
  const stats = {
    total: mitigations.length,
    byEffectiveness: {
      high: mitigations.filter((m) => m.effectiveness === "high").length,
      "medium-high": mitigations.filter(
        (m) => m.effectiveness === "medium-high",
      ).length,
      medium: mitigations.filter((m) => m.effectiveness === "medium").length,
      low: mitigations.filter((m) => m.effectiveness === "low").length,
    },
  };

  const getEffectivenessColor = (effectiveness: Effectiveness) => {
    switch (effectiveness) {
      case "high":
        return "bg-green-500/20 text-green-400 border-green-500/50";
      case "medium-high":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "low":
        return "bg-red-500/20 text-red-400 border-red-500/50";
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case "high":
        return "text-red-400";
      case "medium":
        return "text-yellow-400";
      case "low":
        return "text-green-400";
      default:
        return "text-muted-foreground";
    }
  };

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setEffectivenessFilter("all");
  };

  const hasActiveFilters =
    search || categoryFilter !== "all" || effectivenessFilter !== "all";

  return (
    <div className="flex flex-col h-full">
      {/* Stats Header */}
      <div className="border-b px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            title="Total Mitigations"
            value={stats.total}
            icon={<ShieldCheck className="h-4 w-4" />}
          />
          <StatCard
            title="High Effectiveness"
            value={stats.byEffectiveness.high}
            color="text-green-400"
          />
          <StatCard
            title="Medium-High"
            value={stats.byEffectiveness["medium-high"]}
            color="text-blue-400"
          />
          <StatCard
            title="Medium"
            value={stats.byEffectiveness.medium}
            color="text-yellow-400"
          />
          <StatCard
            title="Low"
            value={stats.byEffectiveness.low}
            color="text-red-400"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="border-b px-6 py-3 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search mitigations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={categoryFilter}
          onValueChange={(value) =>
            setCategoryFilter(value as MitigationCategory | "all")
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={effectivenessFilter}
          onValueChange={(value) =>
            setEffectivenessFilter(value as Effectiveness | "all")
          }
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Effectiveness" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Effectiveness</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium-high">Medium-High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
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
        {/* Mitigations List */}
        <ScrollArea className="flex-1 border-r">
          <div className="p-6 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-muted-foreground">
                  Loading mitigations...
                </div>
              </div>
            ) : mitigations.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                No mitigations found
              </div>
            ) : (
              mitigations.map((mitigation) => (
                <MitigationCard
                  key={mitigation.id}
                  mitigation={mitigation}
                  isSelected={selectedMitigation?.id === mitigation.id}
                  onClick={() => setSelectedMitigation(mitigation)}
                  getEffectivenessColor={getEffectivenessColor}
                  getComplexityColor={getComplexityColor}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Detail Panel */}
        {selectedMitigation && (
          <div className="w-[400px] flex-shrink-0 overflow-auto">
            <MitigationDetail
              mitigation={selectedMitigation}
              onClose={() => setSelectedMitigation(null)}
              getEffectivenessColor={getEffectivenessColor}
              getComplexityColor={getComplexityColor}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
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

// Mitigation Card Component
interface MitigationCardProps {
  mitigation: Mitigation;
  isSelected: boolean;
  onClick: () => void;
  getEffectivenessColor: (e: Effectiveness) => string;
  getComplexityColor: (c: string) => string;
}

function MitigationCard({
  mitigation,
  isSelected,
  onClick,
  getEffectivenessColor,
  getComplexityColor,
}: MitigationCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-colors ${
        isSelected ? "border-primary" : "hover:border-muted-foreground/30"
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-mono text-muted-foreground">
              {mitigation.id}
            </span>
            <CardTitle className="text-base mt-1">{mitigation.name}</CardTitle>
          </div>
          <Badge className={getEffectivenessColor(mitigation.effectiveness)}>
            {mitigation.effectiveness}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-sm">
          <Badge variant="outline">{mitigation.category}</Badge>
          <span className="text-muted-foreground">
            Complexity:{" "}
            <span
              className={getComplexityColor(
                mitigation.implementationComplexity,
              )}
            >
              {mitigation.implementationComplexity}
            </span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
          {mitigation.description}
        </p>
        {mitigation.mitigates.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {mitigation.mitigates.slice(0, 4).map((techId) => (
              <Badge key={techId} variant="secondary" className="text-xs">
                {techId}
              </Badge>
            ))}
            {mitigation.mitigates.length > 4 && (
              <Badge variant="secondary" className="text-xs">
                +{mitigation.mitigates.length - 4}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Mitigation Detail Component
interface MitigationDetailProps {
  mitigation: Mitigation;
  onClose: () => void;
  getEffectivenessColor: (e: Effectiveness) => string;
  getComplexityColor: (c: string) => string;
}

function MitigationDetail({
  mitigation,
  onClose,
  getEffectivenessColor,
  getComplexityColor,
}: MitigationDetailProps) {
  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-xs font-mono text-muted-foreground">
            {mitigation.id}
          </span>
          <h2 className="text-lg font-semibold mt-1">{mitigation.name}</h2>
          <Badge variant="outline" className="mt-1">
            {mitigation.category}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Effectiveness & Complexity */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              Effectiveness
            </div>
            <Badge className={getEffectivenessColor(mitigation.effectiveness)}>
              {mitigation.effectiveness}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Complexity</div>
            <span
              className={getComplexityColor(
                mitigation.implementationComplexity,
              )}
            >
              {mitigation.implementationComplexity}
            </span>
          </div>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-sm font-medium mb-2">Description</h3>
          <p className="text-sm text-muted-foreground">
            {mitigation.description}
          </p>
        </div>

        {/* Benefits */}
        {mitigation.benefits.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Benefits</h3>
            <ul className="space-y-1">
              {mitigation.benefits.map((benefit, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Limitations */}
        {mitigation.limitations.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Limitations</h3>
            <ul className="space-y-1">
              {mitigation.limitations.map((limitation, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{limitation}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Mitigates */}
        {mitigation.mitigates.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">
              Mitigates ({mitigation.mitigates.length} techniques)
            </h3>
            <div className="flex flex-wrap gap-1">
              {mitigation.mitigates.map((techId) => (
                <Badge key={techId} variant="secondary" className="text-xs">
                  {techId}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
