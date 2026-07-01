"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Package, Cloud, Eye, EyeOff, Download, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  SBOM_COMPONENT_LABELS,
  SBOM_FORMAT_LABELS,
  deployViaLabel,
  rowsFromSbom,
} from "@/lib/build/sbom-format";
import type {
  SbomComponentId,
  SbomDocument,
  SbomFormatId,
  SbomRef,
} from "@/lib/build/sbom-format";

// Mirrors lib/build/build-info.ts BuildInfo (kept local so the client bundle
// doesn't pull the server module's node:fs imports).
interface DaaxDeployment {
  mode?: string;
  via?: string;
  by?: string;
  registry?: string;
  image?: string;
  imageTag?: string;
  workspace?: string;
  host?: string;
}
interface BuildInfo {
  version: string;
  gitSha: string;
  buildTime: string;
  nodeVersion: string;
  nextVersion: string;
  branch: string;
  hostname: string;
  sbomAvailable: boolean;
  sboms: SbomRef[];
  deployment?: DaaxDeployment;
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md border p-3">
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-sm">{value}</dd>
    </div>
  );
}

export function BuildPanel() {
  const [info, setInfo] = useState<BuildInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/build", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as BuildInfo;
      })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-destructive">
          Failed to load build info: {error}
        </CardContent>
      </Card>
    );
  }
  if (!info) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const versionRows: [string, string][] = [
    ["Version", info.version],
    ["Git SHA", info.gitSha],
    ["Build time", info.buildTime],
    ["Node runtime", info.nodeVersion],
    ["Next.js", info.nextVersion],
    ["Branch", info.branch],
  ];

  const dep = info.deployment;
  const deployRows: [string, string][] = dep
    ? (
        [
          ["Mode", dep.mode ?? ""],
          ["Deployed via", deployViaLabel(dep.via)],
          ["Deployed by", dep.by ?? ""],
          ["Registry", dep.registry ?? ""],
          ["Image", dep.image ?? ""],
          ["Image tag", dep.imageTag ?? ""],
          ["Workspace", dep.workspace ?? ""],
          ["Host", dep.host ?? ""],
        ] as [string, string][]
      ).filter(([, v]) => v !== "")
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" /> Build
        </CardTitle>
        <CardDescription>
          Exact version of the running app, where it&apos;s deployed, and its
          software bill of materials.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          data-testid="build-version"
        >
          {versionRows.map(([k, v]) => (
            <InfoTile key={k} label={k} value={v} />
          ))}
        </dl>

        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Cloud className="h-4 w-4 text-muted-foreground" /> Deployment
          </h3>
          {deployRows.length > 0 ? (
            <dl
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              data-testid="build-deployment"
            >
              {deployRows.map(([k, v]) => (
                <InfoTile key={k} label={k} value={v} />
              ))}
            </dl>
          ) : (
            <p
              className="text-sm text-muted-foreground"
              data-testid="build-deployment-none"
            >
              Not deployed — running from source (dev build).
            </p>
          )}
        </div>

        <SbomSection sboms={info.sboms} />
      </CardContent>
    </Card>
  );
}

function sbomUrl(
  component: SbomComponentId,
  format: SbomFormatId,
  inline = false,
): string {
  const q = `component=${component}&format=${format}${inline ? "&inline=1" : ""}`;
  return `/api/build/sbom?${q}`;
}

function SbomSection({ sboms }: { sboms: SbomRef[] }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [cache, setCache] = useState<Record<string, SbomDocument>>({});

  const components = useMemo(
    () =>
      (["app"] as SbomComponentId[]).filter((c) =>
        sboms.some((s) => s.component === c),
      ),
    [sboms],
  );
  const formatsFor = useCallback(
    (c: SbomComponentId) =>
      (["cyclonedx", "spdx"] as SbomFormatId[]).filter((f) =>
        sboms.some((s) => s.component === c && s.format === f),
      ),
    [sboms],
  );

  const [sel, setSel] = useState<SbomRef>(
    () => sboms[0] ?? { component: "app", format: "cyclonedx" },
  );

  const key = `${sel.component}.${sel.format}`;
  const sbom = cache[key] ?? null;

  useEffect(() => {
    if (!open) return;
    // Cache hit: show it and clear any error left over from a prior selection.
    if (cache[key]) {
      setErr("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetch(sbomUrl(sel.component, sel.format, true), { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SbomDocument;
      })
      .then((s) => {
        if (!cancelled) setCache((c) => ({ ...c, [key]: s }));
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, key, sel.component, sel.format, cache]);

  const rows = useMemo(() => (sbom ? rowsFromSbom(sbom) : []), [sbom]);
  const rawJson = useMemo(
    () => (raw && sbom ? JSON.stringify(sbom, null, 2) : ""),
    [raw, sbom],
  );

  if (sboms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="sbom-none">
        No SBOM bundled in this build (dev/from-source). Run{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          bun run sbom:generate
        </code>{" "}
        to produce one.
      </p>
    );
  }

  function pickComponent(c: SbomComponentId) {
    const fmts = formatsFor(c);
    setSel({
      component: c,
      format: fmts.includes(sel.format) ? sel.format : (fmts[0] ?? "cyclonedx"),
    });
  }

  const formatLabel = sbom?.bomFormat
    ? `${sbom.bomFormat}${sbom.specVersion ? ` ${sbom.specVersion}` : ""}`
    : sbom?.spdxVersion
      ? sbom.spdxVersion
      : SBOM_FORMAT_LABELS[sel.format];
  const rowNoun = sel.format === "spdx" ? "package" : "component";

  const toggleBtn =
    "inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium transition-colors hover:bg-accent";
  const pillBtn =
    "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          data-testid="sbom-view-toggle"
          aria-expanded={open}
          aria-controls="sbom-panel"
          className={toggleBtn}
        >
          {open ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{" "}
          {open ? "Hide SBOM" : "View SBOM"}
        </button>
        <a
          href={sbomUrl(sel.component, sel.format)}
          data-testid="sbom-download"
          className={toggleBtn}
        >
          <Download className="h-4 w-4" /> Download{" "}
          {SBOM_FORMAT_LABELS[sel.format]} (
          {SBOM_COMPONENT_LABELS[sel.component]})
        </a>
      </div>

      {open && (
        <div id="sbom-panel" className="space-y-3" data-testid="sbom-panel">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {components.length > 1 && (
              <div
                className="flex items-center gap-1"
                data-testid="sbom-component-select"
              >
                {components.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pickComponent(c)}
                    aria-pressed={sel.component === c}
                    className={cn(
                      pillBtn,
                      sel.component === c
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:bg-accent",
                    )}
                  >
                    {SBOM_COMPONENT_LABELS[c]}
                  </button>
                ))}
              </div>
            )}
            <div
              className="flex items-center gap-1"
              data-testid="sbom-format-select"
            >
              {formatsFor(sel.component).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSel((s) => ({ ...s, format: f }))}
                  aria-pressed={sel.format === f}
                  className={cn(
                    pillBtn,
                    sel.format === f
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input hover:bg-accent",
                  )}
                >
                  {SBOM_FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading SBOM…
            </p>
          )}
          {err && (
            <p className="text-sm text-destructive">
              Couldn&apos;t load SBOM: {err}
            </p>
          )}
          {sbom && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{formatLabel}</span>
                <span>
                  · {rows.length} {rowNoun}
                  {rows.length === 1 ? "" : "s"}
                </span>
                <button
                  type="button"
                  onClick={() => setRaw((v) => !v)}
                  data-testid="sbom-raw-toggle"
                  aria-pressed={raw}
                  className="text-primary hover:underline"
                >
                  {raw ? "Show table" : "Show raw JSON"}
                </button>
              </div>
              {raw ? (
                <pre
                  data-testid="sbom-raw"
                  className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed"
                >
                  {rawJson}
                </pre>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  SBOM has no {rowNoun}s listed.
                </p>
              ) : (
                <div className="max-h-[28rem] overflow-auto rounded-md border">
                  <Table data-testid="sbom-table">
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Component</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>License</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((c, i) => (
                        <TableRow key={`${c.name}-${c.version}-${i}`}>
                          <TableCell className="font-medium">
                            {c.name}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {c.version}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.type}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {c.license}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
