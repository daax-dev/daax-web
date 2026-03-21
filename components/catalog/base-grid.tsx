"use client";

import { useState, useMemo } from "react";
import { Loader2, AlertCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaseCard } from "./base-card";
import { useBases } from "@/hooks/use-catalog";
import type { BaseImage, BaseImageCategory } from "@/types/catalog";
import { BASE_CATEGORY_CONFIG } from "@/types/catalog";

interface BaseGridProps {
  onSelect?: (base: BaseImage, version: string) => void;
  selectedBaseId?: string;
  compact?: boolean;
}

export function BaseGrid({ onSelect, selectedBaseId, compact }: BaseGridProps) {
  const { bases, loading, error, refetch } = useBases();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    "all" | BaseImageCategory
  >("all");

  const filteredBases = useMemo(() => {
    let result = bases;

    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter((b) => b.category === categoryFilter);
    }

    // Filter by search
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (b) =>
          b.name.toLowerCase().includes(searchLower) ||
          b.description.toLowerCase().includes(searchLower) ||
          b.id.toLowerCase().includes(searchLower),
      );
    }

    return result;
  }, [bases, categoryFilter, search]);

  const categories = useMemo(() => {
    const cats = new Set(bases.map((b) => b.category));
    return Array.from(cats) as BaseImageCategory[];
  }, [bases]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="h-12 w-12 mb-4 text-destructive" />
        <p className="text-destructive">{error}</p>
        <button onClick={refetch} className="mt-4 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search base images..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {categories.map((cat) => (
              <TabsTrigger key={cat} value={cat}>
                {BASE_CATEGORY_CONFIG[cat].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Grid */}
      {filteredBases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No base images found
        </div>
      ) : (
        <div
          className={
            compact
              ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
              : "space-y-4"
          }
        >
          {filteredBases.map((base) => (
            <BaseCard
              key={base.id}
              base={base}
              selected={selectedBaseId === base.id}
              onSelect={onSelect}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
