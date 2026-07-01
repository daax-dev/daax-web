"use client";

import { useState, useEffect, useMemo } from "react";
import { Layers, Loader2, Eye, EyeOff, Download } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { rowsFromSbom } from "@/lib/build/sbom-format";
import type { SbomDocument } from "@/lib/build/sbom-format";

type ImageCategory = "runtime" | "platform" | "devcontainer";

interface KnownImage {
  category: ImageCategory;
  name: string;
  ref: string;
  digest: string | null;
  present: boolean;
}

const CATEGORY_LABELS: Record<ImageCategory, string> = {
  runtime: "App runtime base",
  platform: "Platform & tooling",
  devcontainer: "Devcontainer base catalog",
};

const CATEGORY_ORDER: ImageCategory[] = ["runtime", "platform", "devcontainer"];

function imageSbomUrl(ref: string, inline = false): string {
  return `/api/build/images/sbom?ref=${encodeURIComponent(ref)}${inline ? "&inline=1" : ""}`;
}

export function BuildImages() {
  const [images, setImages] = useState<KnownImage[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/build/images", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { images: KnownImage[] };
      })
      .then((data) => {
        if (!cancelled) setImages(data.images);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<ImageCategory, KnownImage[]>();
    for (const img of images ?? []) {
      const list = map.get(img.category) ?? [];
      list.push(img);
      map.set(img.category, list);
    }
    return map;
  }, [images]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-5 w-5" /> Base &amp; dependency images
        </CardTitle>
        <CardDescription>
          The container images daax is built on and uses, with the exact digest
          resolved from the local Docker daemon and a per-image SBOM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error && (
          <p className="text-sm text-destructive">
            Failed to load images: {error}
          </p>
        )}
        {!images && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}
        {images &&
          CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {CATEGORY_LABELS[category]}
              </h3>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Image</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Digest</TableHead>
                      <TableHead className="text-right">SBOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(grouped.get(category) ?? []).map((img) => (
                      <ImageRow key={img.ref} img={img} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        {images && images.length === 0 && (
          <p className="text-sm text-muted-foreground">No images configured.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ImageRow({ img }: { img: KnownImage }) {
  const [open, setOpen] = useState(false);
  const [sbom, setSbom] = useState<SbomDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open || sbom) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    fetch(imageSbomUrl(img.ref, true), { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404)
          throw new Error("not available (image not pulled)");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as SbomDocument;
      })
      .then((s) => {
        if (!cancelled) setSbom(s);
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
  }, [open, sbom, img.ref]);

  const rows = useMemo(() => (sbom ? rowsFromSbom(sbom) : []), [sbom]);

  return (
    <>
      <TableRow>
        <TableCell className="font-medium">{img.name}</TableCell>
        <TableCell className="break-all font-mono text-xs">{img.ref}</TableCell>
        <TableCell className="break-all font-mono text-xs text-muted-foreground">
          {img.digest ?? <Badge variant="outline">not pulled</Badge>}
        </TableCell>
        <TableCell className="text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            disabled={!img.present}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {open ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {open ? "Hide" : "View"}
          </button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating SBOM via
                syft…
              </p>
            )}
            {err && (
              <p className="text-sm text-destructive">
                Couldn&apos;t load SBOM: {err}
              </p>
            )}
            {sbom && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {sbom.bomFormat
                      ? `${sbom.bomFormat}${sbom.specVersion ? ` ${sbom.specVersion}` : ""}`
                      : "SBOM"}
                  </span>
                  <span>· {rows.length} components</span>
                  <a
                    href={imageSbomUrl(img.ref)}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
                <div className="max-h-80 overflow-auto rounded-md border">
                  <Table>
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
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
