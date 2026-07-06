"use client";

/**
 * Admin DB Console (F6 — issue #102).
 *
 * Read-first inspection console over Postgres, super-admin only. Lists the
 * inspectable tables and paginates rows for a selected table. Identifier safety
 * and authorization live entirely on the server (`/api/admin/db/*`); this
 * component is a thin read-only viewer. Writes are opt-in on the API (D4) and
 * intentionally NOT exposed in this UI (read-first).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";

interface TableListItem {
  name: string;
  columns: number;
  estimatedRows: number;
}

interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
}

interface InspectResult {
  table: string;
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  totalCapped: boolean;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

/** Render a cell value defensively — objects/arrays to JSON, null as a muted dash. */
function renderCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">∅</span>;
  }
  if (typeof value === "object") {
    return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  }
  return <span className="font-mono text-xs">{String(value)}</span>;
}

export default function DbConsole() {
  const [tables, setTables] = useState<TableListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<InspectResult | null>(null);
  const [offset, setOffset] = useState(0);
  const [loadingTables, setLoadingTables] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/db/tables");
      if (!res.ok) throw new Error(`Failed to load tables (${res.status})`);
      const json = (await res.json()) as { tables: TableListItem[] };
      setTables(json.tables);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingTables(false);
    }
  }, []);

  const loadRows = useCallback(async (table: string, off: number) => {
    setLoadingRows(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(off),
      });
      const res = await fetch(
        `/api/admin/db/tables/${encodeURIComponent(table)}?${params.toString()}`,
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Failed to load rows (${res.status})`);
      }
      setData((await res.json()) as InspectResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (selected) loadRows(selected, offset);
  }, [selected, offset, loadRows]);

  const onSelectTable = (name: string) => {
    setSelected(name);
    setOffset(0);
  };

  const page = data ? Math.floor(data.offset / data.limit) + 1 : 1;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const canPrev = offset > 0;
  const canNext = data ? data.offset + data.rows.length < data.total : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Console
        </CardTitle>
        <CardDescription>
          Read-only inspection of the Postgres tables (RBAC, catalog, releases).
          Super-admin only. Writes are disabled by default.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selected ?? undefined} onValueChange={onSelectTable}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a table to inspect" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                  <span className="text-muted-foreground ml-2 text-xs">
                    (~{t.estimatedRows} rows, {t.columns} cols)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            aria-label="Refresh"
            onClick={() =>
              selected ? loadRows(selected, offset) : loadTables()
            }
            disabled={loadingTables || loadingRows}
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingTables || loadingRows ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {loadingTables && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tables…
          </div>
        )}

        {selected && data && (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {data.total}
                {data.totalCapped ? "+" : ""} rows
              </span>
              <span>
                Page {page} of {totalPages}
              </span>
            </div>
            <ScrollArea className="w-full rounded-md border">
              <div className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {data.columns.map((c) => (
                        <TableHead key={c.name} className="whitespace-nowrap">
                          {c.name}
                          <Badge
                            variant="outline"
                            className="ml-2 font-normal text-[10px]"
                          >
                            {c.dataType}
                          </Badge>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={data.columns.length}
                          className="text-center text-muted-foreground"
                        >
                          No rows
                        </TableCell>
                      </TableRow>
                    )}
                    {data.rows.map((row, i) => (
                      <TableRow key={i}>
                        {data.columns.map((c) => (
                          <TableCell
                            key={c.name}
                            className="whitespace-nowrap max-w-[320px] truncate"
                          >
                            {renderCell(row[c.name])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={!canPrev || loadingRows}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={!canNext || loadingRows}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
