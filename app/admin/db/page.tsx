"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Lock, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface TableSummary {
  name: string;
  estimatedRows: number;
}

interface ColumnMeta {
  name: string;
  udt: string;
  dataType: string;
  nullable: boolean;
  hasDefault: boolean;
}

interface RowPage {
  table: string;
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 50;

/** Render an arbitrary cell value as a compact, readable string. */
function renderCell(value: unknown): string {
  if (value === null || value === undefined) return "∅";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AdminDbConsolePage() {
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState<RowPage | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadTables = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/db/tables");
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to list tables (${res.status})`);
      }
      const data = await res.json();
      setTables(data.tables ?? []);
      setWritesEnabled(!!data.writesEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRows = useCallback(async (table: string, nextOffset: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/db/tables/${encodeURIComponent(table)}?limit=${PAGE_SIZE}&offset=${nextOffset}`,
      );
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to read table (${res.status})`);
      }
      const data: RowPage = await res.json();
      setPage(data);
      setOffset(nextOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  const selectTable = (table: string) => {
    setSelected(table);
    setPage(null);
    void loadRows(table, 0);
  };

  if (forbidden) {
    return (
      <div className="container mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Access denied
            </CardTitle>
            <CardDescription>
              The admin database console requires super-admin privileges. Add
              your username or email to the{" "}
              <code className="text-foreground">
                DAAX_DB_CONSOLE_SUPERADMINS
              </code>{" "}
              allow-list to gain access.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Database className="h-6 w-6" />
            Data
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only inspection of the Postgres database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {writesEnabled ? (
            <Badge variant="destructive">Writes enabled</Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              Read-only
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTables()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tables</CardTitle>
            <CardDescription>{tables.length} inspectable</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {tables.map((t) => (
              <button
                key={t.name}
                onClick={() => selectTable(t.name)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                  selected === t.name
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <span className="truncate font-mono">{t.name}</span>
                {t.estimatedRows >= 0 && (
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    ~{t.estimatedRows}
                  </span>
                )}
              </button>
            ))}
            {tables.length === 0 && !loading && (
              <p className="text-sm text-muted-foreground">No tables.</p>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-mono text-base">
              {selected ?? "Select a table"}
            </CardTitle>
            {page && (
              <CardDescription>
                {page.total} row{page.total === 1 ? "" : "s"} · showing{" "}
                {page.rows.length === 0 ? 0 : page.offset + 1}–
                {page.offset + page.rows.length}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="min-w-0 overflow-x-auto">
            {page ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {page.columns.map((c) => (
                        <TableHead key={c.name} className="whitespace-nowrap">
                          <span className="font-mono">{c.name}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {c.udt}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.rows.map((row, i) => (
                      <TableRow key={i}>
                        {page.columns.map((c) => (
                          <TableCell
                            key={c.name}
                            className="max-w-xs truncate font-mono text-xs"
                            title={renderCell(row[c.name])}
                          >
                            {renderCell(row[c.name])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0 || loading}
                    onClick={() =>
                      selected &&
                      void loadRows(selected, Math.max(0, offset - PAGE_SIZE))
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      loading || offset + page.rows.length >= page.total
                    }
                    onClick={() =>
                      selected && void loadRows(selected, offset + PAGE_SIZE)
                    }
                  >
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading…" : "Choose a table to inspect its rows."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
