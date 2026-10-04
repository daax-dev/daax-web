"use client";

import { useState } from "react";
import { Check, Plus, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { WorkerGoal } from "@/types/workers";
import { workersApi } from "./api";

export function GoalsTab({
  workerId,
  goals,
  onChanged,
}: {
  workerId: string;
  goals: WorkerGoal[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [projectRef, setProjectRef] = useState("");
  const [criteria, setCriteria] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const add = () =>
    run(async () => {
      await workersApi.addGoal(workerId, {
        title: title.trim(),
        projectRef: projectRef.trim() || null,
        successCriteria: criteria.trim(),
      });
      setTitle("");
      setProjectRef("");
      setCriteria("");
    });

  return (
    <div className="space-y-4" data-testid="goals-tab">
      <ul className="space-y-2">
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-start justify-between gap-3 rounded border p-3"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={
                    g.status === "active"
                      ? "font-medium"
                      : "font-medium text-muted-foreground line-through"
                  }
                >
                  {g.title}
                </span>
                <Badge variant="outline">{g.status}</Badge>
              </div>
              {g.projectRef && (
                <p className="font-mono text-xs text-muted-foreground">
                  {g.projectRef}
                </p>
              )}
              {g.successCriteria && (
                <p className="text-xs text-muted-foreground">
                  Done when: {g.successCriteria}
                </p>
              )}
            </div>
            <div className="flex gap-1">
              {g.status === "active" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Mark done"
                  onClick={() =>
                    void run(() =>
                      workersApi.updateGoal(workerId, g.id, { status: "done" }),
                    )
                  }
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Reactivate"
                  onClick={() =>
                    void run(() =>
                      workersApi.updateGoal(workerId, g.id, {
                        status: "active",
                      }),
                    )
                  }
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                aria-label="Delete goal"
                onClick={() =>
                  void run(() => workersApi.deleteGoal(workerId, g.id))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
        {goals.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No goals yet. Without goals the worker reports on every project it
            can see.
          </li>
        )}
      </ul>

      <div className="space-y-2 rounded border p-3">
        <p className="text-sm font-medium">Add a goal</p>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Goal — e.g. Ship Postgres RBAC to production"
          aria-label="Goal title"
        />
        <Input
          value={projectRef}
          onChange={(e) => setProjectRef(e.target.value)}
          placeholder="Backlog.md project path (optional) — e.g. /workspace/dx/src/daax-web"
          aria-label="Project"
        />
        <Textarea
          value={criteria}
          onChange={(e) => setCriteria(e.target.value)}
          placeholder="Done when… (optional)"
          rows={2}
          aria-label="Success criteria"
        />
        <Button onClick={() => void add()} disabled={!title.trim()}>
          <Plus className="mr-1 h-4 w-4" /> Add goal
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
