"use client";

/**
 * Technique Detail Page
 *
 * Displays full technique information including:
 * - Technique metadata (ID, tactic, severity, dates)
 * - Attack flow diagram (Mermaid)
 * - CIA impact visualization
 * - Related techniques and mitigations
 * - Expandable sub-techniques
 */

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import mermaid from "mermaid";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Shield,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  Calendar,
  Target,
  Eye,
  Lock,
  Activity,
  FileCode,
  Link2,
  Loader2,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type {
  Technique,
  Severity,
  ImpactLevel,
  Effectiveness,
  SubTechnique,
  MitigationRef,
} from "@/plugins/mcp-security/types";

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "strict",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
});

export default function TechniqueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [technique, setTechnique] = useState<Technique | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSubTechniques, setExpandedSubTechniques] = useState<
    Set<string>
  >(new Set());

  // Fetch technique data
  useEffect(() => {
    async function fetchTechnique() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/cyber/safe-mcp/techniques/${id}`);
        const data = await response.json();

        if (data.success) {
          setTechnique(data.technique);
        } else {
          setError(data.error || "Failed to load technique");
        }
      } catch (err) {
        setError("Failed to connect to API");
        console.error("Error fetching technique:", err);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchTechnique();
    }
  }, [id]);

  const toggleSubTechnique = (subId: string) => {
    setExpandedSubTechniques((prev) => {
      const next = new Set(prev);
      if (next.has(subId)) {
        next.delete(subId);
      } else {
        next.add(subId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading technique...</p>
        </div>
      </div>
    );
  }

  if (error || !technique) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <p className="text-lg font-medium">Technique Not Found</p>
          <p className="text-muted-foreground mt-1">
            {error || `Could not find technique ${id}`}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/cyber/safe-mcp")}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to TTP Browser
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Breadcrumb & Back Button */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/cyber/safe-mcp")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="text-sm text-muted-foreground">
            <Link href="/cyber/safe-mcp" className="hover:text-foreground">
              SAFE-MCP
            </Link>
            <span className="mx-2">/</span>
            <Link
              href={`/cyber/safe-mcp?tactic=${technique.tactic.id}`}
              className="hover:text-foreground"
            >
              {technique.tactic.name}
            </Link>
            <span className="mx-2">/</span>
            <span>{technique.id}</span>
          </div>
        </div>

        {/* Header */}
        <TechniqueHeader technique={technique} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {technique.description}
                </p>
              </CardContent>
            </Card>

            {/* Attack Flow Diagram */}
            {technique.attackFlowDiagram && (
              <MermaidDiagram
                diagram={technique.attackFlowDiagram}
                title="Attack Flow"
              />
            )}

            {/* Attack Vectors */}
            {technique.attackVectors.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Attack Vectors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {technique.attackVectors.map((vector, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                        <span>{vector}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Technical Details */}
            {technique.technicalDetails && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    Technical Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {technique.technicalDetails}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Detection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Detection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {technique.detection.iocs.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      Indicators of Compromise
                    </h4>
                    <ul className="space-y-1">
                      {technique.detection.iocs.map((ioc, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-500 flex-shrink-0" />
                          <code className="text-muted-foreground">{ioc}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {technique.detection.behavioralIndicators.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">
                      Behavioral Indicators
                    </h4>
                    <ul className="space-y-1">
                      {technique.detection.behavioralIndicators.map(
                        (indicator, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-sm"
                          >
                            <Activity className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                            <span className="text-muted-foreground">
                              {indicator}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sub-Techniques */}
            {technique.subTechniques && technique.subTechniques.length > 0 && (
              <SubTechniquesSection
                subTechniques={technique.subTechniques}
                expanded={expandedSubTechniques}
                onToggle={toggleSubTechnique}
              />
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* CIA Impact */}
            <CIAImpactCard impact={technique.impactAssessment} />

            {/* Mitigations */}
            <MitigationsCard mitigations={technique.mitigations} />

            {/* Related Techniques */}
            {technique.relatedTechniques.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Related Techniques
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {technique.relatedTechniques.map((relId) => (
                      <Link
                        key={relId}
                        href={`/cyber/safe-mcp/techniques/${relId}`}
                        className="text-sm text-primary hover:underline"
                      >
                        <Badge variant="outline">{relId}</Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* References */}
            {technique.references.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    References
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {technique.references.map((ref, i) => (
                      <li key={i}>
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-start gap-2"
                        >
                          <ExternalLink className="h-3 w-3 mt-1 flex-shrink-0" />
                          {ref.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* MITRE Mapping */}
            {technique.mitreMapping && technique.mitreMapping.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    MITRE ATT&CK Mapping
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {technique.mitreMapping.map((mitreId) => (
                      <a
                        key={mitreId}
                        href={`https://attack.mitre.org/techniques/${mitreId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm"
                      >
                        <Badge variant="secondary">{mitreId}</Badge>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

// Technique Header
function TechniqueHeader({ technique }: { technique: Technique }) {
  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/50";
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/50";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
      case "low":
        return "bg-blue-500/20 text-blue-400 border-blue-500/50";
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-mono text-muted-foreground">
                {technique.id}
              </span>
              <Badge className={getSeverityColor(technique.severity)}>
                {technique.severity}
              </Badge>
              <Badge variant="outline">{technique.tactic.name}</Badge>
            </div>
            <h1 className="text-2xl font-bold">{technique.name}</h1>
            <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
              {technique.firstObserved && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  First observed: {technique.firstObserved}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Updated: {technique.lastUpdated}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            {technique.hasDocumentation && (
              <Badge variant="secondary" className="gap-1">
                <FileCode className="h-3 w-3" />
                Documented
              </Badge>
            )}
            {technique.hasDetectionRule && (
              <Badge variant="secondary" className="gap-1">
                <Eye className="h-3 w-3" />
                Detection Rule
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mermaid Diagram Component
function MermaidDiagram({
  diagram,
  title,
}: {
  diagram: string;
  title: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function renderDiagram() {
      if (!diagram || !containerRef.current) return;

      try {
        const uniqueId = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueId, diagram);
        setSvgContent(svg);
        setError(null);
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError("Failed to render diagram");
      }
    }

    renderDiagram();
  }, [diagram]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={containerRef}
          className="overflow-x-auto bg-muted/30 rounded-lg p-4"
        >
          {error ? (
            <div className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : svgContent ? (
            <div
              dangerouslySetInnerHTML={{ __html: svgContent }}
              className="flex justify-center"
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Loading diagram...
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// CIA Impact Card
function CIAImpactCard({
  impact,
}: {
  impact: {
    confidentiality: ImpactLevel;
    integrity: ImpactLevel;
    availability: ImpactLevel;
    scope: string;
  };
}) {
  const getImpactValue = (level: ImpactLevel): number => {
    switch (level) {
      case "high":
        return 100;
      case "medium":
        return 66;
      case "low":
        return 33;
      case "none":
        return 0;
    }
  };

  const getImpactColor = (level: ImpactLevel): string => {
    switch (level) {
      case "high":
        return "bg-red-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      case "none":
        return "bg-gray-500";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4" />
          CIA Impact
        </CardTitle>
        <CardDescription>{impact.scope}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confidentiality */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-blue-400" />
              <span>Confidentiality</span>
            </div>
            <span className="font-medium capitalize">
              {impact.confidentiality}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${getImpactColor(impact.confidentiality)}`}
              style={{ width: `${getImpactValue(impact.confidentiality)}%` }}
            />
          </div>
        </div>

        {/* Integrity */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-green-400" />
              <span>Integrity</span>
            </div>
            <span className="font-medium capitalize">{impact.integrity}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${getImpactColor(impact.integrity)}`}
              style={{ width: `${getImpactValue(impact.integrity)}%` }}
            />
          </div>
        </div>

        {/* Availability */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-400" />
              <span>Availability</span>
            </div>
            <span className="font-medium capitalize">
              {impact.availability}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${getImpactColor(impact.availability)}`}
              style={{ width: `${getImpactValue(impact.availability)}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Mitigations Card
function MitigationsCard({
  mitigations,
}: {
  mitigations: { preventive: MitigationRef[]; detective: MitigationRef[] };
}) {
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

  const allMitigations = [...mitigations.preventive, ...mitigations.detective];

  if (allMitigations.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Mitigations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preventive */}
        {mitigations.preventive.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Preventive
            </h4>
            <div className="space-y-2">
              {mitigations.preventive.map((m) => (
                <Link
                  key={m.id}
                  href={`/cyber/safe-mcp?tab=mitigations&search=${m.id}`}
                  className="block hover:bg-muted/50 p-2 rounded-md transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    <Badge className={getEffectivenessColor(m.effectiveness)}>
                      {m.effectiveness}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{m.id}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Detective */}
        {mitigations.detective.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Detective
            </h4>
            <div className="space-y-2">
              {mitigations.detective.map((m) => (
                <Link
                  key={m.id}
                  href={`/cyber/safe-mcp?tab=mitigations&search=${m.id}`}
                  className="block hover:bg-muted/50 p-2 rounded-md transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{m.name}</span>
                    <Badge className={getEffectivenessColor(m.effectiveness)}>
                      {m.effectiveness}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{m.id}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Sub-Techniques Section
function SubTechniquesSection({
  subTechniques,
  expanded,
  onToggle,
}: {
  subTechniques: SubTechnique[];
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Sub-Techniques ({subTechniques.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {subTechniques.map((sub) => (
            <div key={sub.id} className="border rounded-md overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
                onClick={() => onToggle(sub.id)}
              >
                <div className="flex items-center gap-3">
                  {expanded.has(sub.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="text-sm font-mono text-muted-foreground">
                    {sub.id}
                  </span>
                  <span className="text-sm font-medium">{sub.name}</span>
                </div>
              </button>
              {expanded.has(sub.id) && (
                <div className="px-10 pb-3 text-sm text-muted-foreground">
                  {sub.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
