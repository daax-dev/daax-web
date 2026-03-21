"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { RecordCard } from "./RecordCard";
import type { AnyRecord } from "@/types/jsonl";

interface RecordListProps {
  records: AnyRecord[];
  searchQuery?: string;
}

export function RecordList({ records, searchQuery }: RecordListProps) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
        <p className="text-sm">
          {searchQuery
            ? "No records match your search"
            : "No records to display"}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-16rem)]">
      <div className="space-y-2 pr-4">
        {records.map((record, index) => (
          <RecordCard key={record.id || index} record={record} index={index} />
        ))}
      </div>
    </ScrollArea>
  );
}
