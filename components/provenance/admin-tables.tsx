"use client";

/**
 * Provenance Admin Tables Component
 *
 * Provides CRUD UI for all provenance database tables.
 * Used in the Settings page Admin tab.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Search,
  ArrowUpDown,
} from "lucide-react";
import {
  useTables,
  useTableSchema,
  useTableRows,
  useTableMutations,
} from "@/hooks/use-provenance-admin";
import type {
  TableInfo,
  ColumnInfo,
  ListRowsParams,
} from "@/types/provenance-admin";

// ============================================================================
// Table Selector
// ============================================================================

interface TableSelectorProps {
  tables: TableInfo[];
  selectedTable: string | null;
  onSelectTable: (table: string) => void;
  loading: boolean;
}

function TableSelector({
  tables,
  selectedTable,
  onSelectTable,
  loading,
}: TableSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tables...
      </div>
    );
  }

  return (
    <Select value={selectedTable || ""} onValueChange={onSelectTable}>
      <SelectTrigger className="w-[280px]">
        <SelectValue placeholder="Select a table..." />
      </SelectTrigger>
      <SelectContent>
        {tables.map((t) => (
          <SelectItem key={t.name} value={t.name}>
            <div className="flex items-center justify-between gap-4 w-full">
              <span>{t.name}</span>
              <span className="text-muted-foreground text-xs">
                {t.row_count} rows
              </span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================================
// Row Editor Dialog
// ============================================================================

interface RowEditorDialogProps {
  open: boolean;
  onClose: () => void;
  columns: ColumnInfo[];
  row?: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  mode: "create" | "edit";
  tableName: string;
}

function RowEditorDialog({
  open,
  onClose,
  columns,
  row,
  onSave,
  mode,
  tableName,
}: RowEditorDialogProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(row || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Editable columns (exclude auto-generated primary key for create)
  const editableColumns = columns.filter((col) => {
    if (mode === "create" && col.is_primary_key) {
      return false; // Don't show PK for create
    }
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? `Create Row in ${tableName}`
              : `Edit Row in ${tableName}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Fill in the fields to create a new row."
              : "Modify the fields and save changes."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {editableColumns.map((col) => (
              <div key={col.name} className="space-y-2">
                <Label htmlFor={col.name} className="flex items-center gap-2">
                  {col.name}
                  {col.is_primary_key && (
                    <span className="text-xs text-muted-foreground">(PK)</span>
                  )}
                  {!col.nullable && !col.is_primary_key && (
                    <span className="text-xs text-destructive">*</span>
                  )}
                </Label>
                <Input
                  id={col.name}
                  value={String(formData[col.name] ?? "")}
                  onChange={(e) =>
                    setFormData({ ...formData, [col.name]: e.target.value })
                  }
                  placeholder={
                    col.default_value
                      ? `Default: ${col.default_value}`
                      : undefined
                  }
                  disabled={mode === "edit" && col.is_primary_key}
                />
                <p className="text-xs text-muted-foreground">
                  Type: {col.type}
                  {col.nullable && " (nullable)"}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm p-2 bg-destructive/10 rounded">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Create" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Delete Confirmation Dialog
// ============================================================================

interface DeleteConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  tableName: string;
  rowId: string | number;
}

function DeleteConfirmDialog({
  open,
  onClose,
  onConfirm,
  tableName,
  rowId,
}: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // Error handled by caller
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Row?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete row {String(rowId)} from {tableName}
            ? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================================
// Data Table
// ============================================================================

interface DataTableProps {
  tableName: string;
  columns: ColumnInfo[];
  primaryKey: string;
}

function DataTable({ tableName, columns, primaryKey }: DataTableProps) {
  const [params, setParams] = useState<ListRowsParams>({
    page: 1,
    page_size: 10,
  });
  const [searchValue, setSearchValue] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(false);

  const { data, loading, error, refetch } = useTableRows(tableName, params);
  const mutations = useTableMutations(tableName);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingRow, setEditingRow] = useState<
    Record<string, unknown> | undefined
  >();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | number | null>(
    null,
  );

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDesc) {
        // Third click: clear sort
        setSortColumn(null);
        setSortDesc(false);
        setParams({ ...params, sort: undefined });
      } else {
        // Second click: desc
        setSortDesc(true);
        setParams({ ...params, sort: `-${column}` });
      }
    } else {
      // First click: asc
      setSortColumn(column);
      setSortDesc(false);
      setParams({ ...params, sort: column });
    }
  };

  const handleSearch = useCallback(() => {
    if (searchValue.trim()) {
      // Search by primary key or first text column
      const filters: Record<string, string> = {};
      filters[primaryKey] = searchValue.trim();
      setParams({ ...params, page: 1, filters });
    } else {
      setParams({ ...params, page: 1, filters: undefined });
    }
  }, [searchValue, params, primaryKey]);

  const handleCreate = () => {
    setEditorMode("create");
    setEditingRow(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (row: Record<string, unknown>) => {
    setEditorMode("edit");
    setEditingRow(row);
    setEditorOpen(true);
  };

  const handleDelete = (rowId: string | number) => {
    setDeletingRowId(rowId);
    setDeleteDialogOpen(true);
  };

  const handleSaveRow = async (formData: Record<string, unknown>) => {
    if (editorMode === "create") {
      await mutations.createRow(formData);
    } else if (editingRow) {
      const id = editingRow[primaryKey] as string | number;
      await mutations.patchRow(id, formData);
    }
    refetch();
  };

  const handleConfirmDelete = async () => {
    if (deletingRowId !== null) {
      await mutations.deleteRow(deletingRowId);
      refetch();
    }
  };

  const pagination = data?.pagination;
  const items = data?.items || [];

  // Visible columns (limit to first 6 for readability)
  const visibleColumns = columns.slice(0, 6);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search by ${primaryKey}...`}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8 w-[200px]"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleSearch}>
            Search
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Data table */}
      {!loading && !error && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => (
                  <TableHead key={col.name}>
                    <button
                      onClick={() => handleSort(col.name)}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {col.name}
                      {col.is_primary_key && (
                        <span className="text-xs text-muted-foreground">
                          (PK)
                        </span>
                      )}
                      <ArrowUpDown
                        className={`h-3 w-3 ${
                          sortColumn === col.name
                            ? "text-foreground"
                            : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length + 1}
                    className="text-center text-muted-foreground py-8"
                  >
                    No rows found
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row, idx) => (
                  <TableRow key={String(row[primaryKey] ?? idx)}>
                    {visibleColumns.map((col) => (
                      <TableCell
                        key={col.name}
                        className="max-w-[200px] truncate"
                      >
                        {formatCellValue(row[col.name])}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(row)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleDelete(row[primaryKey] as string | number)
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages} (
            {pagination.total_rows} total rows)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setParams({ ...params, page: pagination.page - 1 })
              }
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setParams({ ...params, page: pagination.page + 1 })
              }
              disabled={pagination.page >= pagination.total_pages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Editor Dialog */}
      <RowEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        columns={columns}
        row={editingRow}
        onSave={handleSaveRow}
        mode={editorMode}
        tableName={tableName}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        tableName={tableName}
        rowId={deletingRowId || ""}
      />
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

// ============================================================================
// Main Component
// ============================================================================

export function ProvenanceAdminTables() {
  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refetch: refetchTables,
  } = useTables();
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const {
    schema,
    loading: schemaLoading,
    error: schemaError,
  } = useTableSchema(selectedTable || "");

  const handleSelectTable = (table: string) => {
    setSelectedTable(table);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Database className="h-5 w-5 text-muted-foreground" />
          <TableSelector
            tables={tables}
            selectedTable={selectedTable}
            onSelectTable={handleSelectTable}
            loading={tablesLoading}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={refetchTables}
          disabled={tablesLoading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${tablesLoading ? "animate-spin" : ""}`}
          />
          Refresh Tables
        </Button>
      </div>

      {/* Error states */}
      {tablesError && (
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {tablesError}
        </div>
      )}

      {schemaError && (
        <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4" />
          {schemaError}
        </div>
      )}

      {/* Schema loading */}
      {schemaLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Data table */}
      {selectedTable && schema && !schemaLoading && (
        <DataTable
          tableName={selectedTable}
          columns={schema.columns}
          primaryKey={schema.primary_key}
        />
      )}

      {/* Empty state */}
      {!selectedTable && !tablesLoading && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Database className="h-12 w-12 mb-4" />
          <p>Select a table to view and manage data</p>
        </div>
      )}
    </div>
  );
}

export default ProvenanceAdminTables;
