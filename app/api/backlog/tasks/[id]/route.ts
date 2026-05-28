/**
 * /api/backlog/tasks/[id]
 * PATCH: Update a task
 * DELETE: Delete a task
 *
 * SECURITY: All operations require authentication via requireAuth()
 */

import { NextRequest, NextResponse } from "next/server";
import { getMultiBacklogStore } from "@/server/backlog-multi-store";
import type { Task, TaskUpdateInput } from "@/types/backlog";
import { requireAuth } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require authentication for updating tasks
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { project, updates } = body as {
      project: string;
      updates: TaskUpdateInput;
    };

    // Validate project parameter
    if (!project || typeof project !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: project" },
        { status: 400 },
      );
    }

    // Validate updates object
    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return NextResponse.json(
        { error: "Invalid updates object" },
        { status: 400 },
      );
    }

    // Get existing task to apply TaskUpdateInput operations
    const existingProject = getMultiBacklogStore().getProject(project);
    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const existingTask = existingProject.tasks.find((t) => t.id === id);
    if (!existingTask) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Apply TaskUpdateInput operations to create final task state
    // Start with direct-assignable fields from TaskUpdateInput
    // Build updatedFields using a processing function to maintain type safety
    const buildUpdatedFields = (): Partial<Task> => {
      // Track if milestone was explicitly set (even to null) to handle clearing
      const milestoneExplicitlySet = "milestone" in updates;
      // Convert null milestone to undefined (which clears the field in Task type)
      // undefined in TaskUpdateInput means "don't change", null means "clear"
      const milestoneValue: string | undefined =
        updates.milestone === null ? undefined : updates.milestone;

      const fields: Partial<Task> = {
        title: updates.title,
        description: updates.description,
        status: updates.status,
        priority: updates.priority,
        labels: updates.labels,
        assignee: updates.assignee,
        ordinal: updates.ordinal,
        dependencies: updates.dependencies,
        implementationPlan: updates.implementationPlan,
        implementationNotes: updates.implementationNotes,
        acceptanceCriteriaItems: updates.acceptanceCriteria?.map(
          (crit, idx) => ({
            index: idx + 1,
            text: crit.text,
            checked: crit.checked || false,
          }),
        ),
        rawContent: updates.rawContent,
      };

      // Only set milestone if it was explicitly provided in updates
      // (null → undefined to clear, string → string to set)
      if (milestoneExplicitlySet) {
        fields.milestone = milestoneValue;
      }

      // Remove undefined values to avoid overwriting existing values with undefined
      // But keep milestone if explicitly set (even to undefined to clear it)
      Object.keys(fields).forEach((key) => {
        const value = fields[key as keyof Task];
        if (
          value === undefined &&
          !(key === "milestone" && milestoneExplicitlySet)
        ) {
          delete fields[key as keyof Task];
        }
      });

      // Handle addLabels/removeLabels operations
      if (updates.addLabels || updates.removeLabels) {
        const currentLabels = existingTask.labels || [];
        let newLabels = [...currentLabels];

        if (updates.addLabels) {
          newLabels = [...new Set([...newLabels, ...updates.addLabels])];
        }
        // Type guard: removeLabels is checked in parent condition but TypeScript needs explicit check
        const removeLabels = updates.removeLabels;
        if (removeLabels) {
          newLabels = newLabels.filter((l) => !removeLabels.includes(l));
        }

        fields.labels = newLabels;
      }

      // Handle addDependencies/removeDependencies operations
      if (updates.addDependencies || updates.removeDependencies) {
        const currentDeps = existingTask.dependencies || [];
        let newDeps = [...currentDeps];

        if (updates.addDependencies) {
          newDeps = [...new Set([...newDeps, ...updates.addDependencies])];
        }
        // Type guard: removeDependencies is checked in parent condition but TypeScript needs explicit check
        const removeDependencies = updates.removeDependencies;
        if (removeDependencies) {
          newDeps = newDeps.filter((d) => !removeDependencies.includes(d));
        }

        fields.dependencies = newDeps;
      }

      // Handle implementation plan operations
      if (updates.appendImplementationPlan) {
        const current = existingTask.implementationPlan || "";
        fields.implementationPlan =
          current + "\n" + updates.appendImplementationPlan.join("\n");
      }
      if (updates.clearImplementationPlan) {
        fields.implementationPlan = "";
      }

      // Handle implementation notes operations
      if (updates.appendImplementationNotes) {
        const current = existingTask.implementationNotes || "";
        fields.implementationNotes =
          current + "\n" + updates.appendImplementationNotes.join("\n");
      }
      if (updates.clearImplementationNotes) {
        fields.implementationNotes = "";
      }

      // Handle acceptance criteria operations
      if (
        updates.addAcceptanceCriteria ||
        updates.removeAcceptanceCriteria ||
        updates.checkAcceptanceCriteria ||
        updates.uncheckAcceptanceCriteria
      ) {
        const currentCriteria = existingTask.acceptanceCriteriaItems || [];
        let newCriteria = [...currentCriteria];

        if (updates.addAcceptanceCriteria) {
          const maxIndex = Math.max(0, ...newCriteria.map((c) => c.index));
          updates.addAcceptanceCriteria.forEach((crit, idx) => {
            newCriteria.push({
              index: maxIndex + idx + 1,
              text: typeof crit === "string" ? crit : crit.text,
              checked: typeof crit === "string" ? false : crit.checked || false,
            });
          });
        }

        // Type guards: TypeScript needs explicit checks even though parent condition verifies
        const removeAc = updates.removeAcceptanceCriteria;
        if (removeAc) {
          newCriteria = newCriteria.filter((c) => !removeAc.includes(c.index));
        }

        const checkAc = updates.checkAcceptanceCriteria;
        if (checkAc) {
          newCriteria = newCriteria.map((c) =>
            checkAc.includes(c.index) ? { ...c, checked: true } : c,
          );
        }

        const uncheckAc = updates.uncheckAcceptanceCriteria;
        if (uncheckAc) {
          newCriteria = newCriteria.map((c) =>
            uncheckAc.includes(c.index) ? { ...c, checked: false } : c,
          );
        }

        fields.acceptanceCriteriaItems = newCriteria;
      }

      return fields;
    };

    const updatedFields = buildUpdatedFields();

    const updatedTask = await getMultiBacklogStore().updateTask(
      project,
      id,
      updatedFields,
    );

    if (!updatedTask) {
      // The project and task were both validated to exist above, so a null
      // result here means the persist step failed (e.g. the task's markdown
      // file is missing on disk, or a filesystem error occurred). Surface it
      // as a server error with a clear message rather than a misleading 404 —
      // a blanket 404 previously masked write failures as "task not found".
      return NextResponse.json(
        {
          error: "Failed to persist task update",
          message:
            "The task exists in memory but its update could not be written to disk. Check server logs for the underlying error.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error("[API] Error updating task:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require authentication for deleting tasks
  const auth = await requireAuth();
  if (!auth.authenticated) return auth.response;

  try {
    const { id } = await params;
    const body = await request.json();
    const { project } = body;

    if (!project || typeof project !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid required parameter: project" },
        { status: 400 },
      );
    }

    const success = await getMultiBacklogStore().deleteTask(project, id);

    if (!success) {
      return NextResponse.json(
        { error: "Task not found or delete failed" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting task:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
