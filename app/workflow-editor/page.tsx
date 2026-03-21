"use client";

import { WorkflowEditor } from "@/components/workflow-editor";
import { useProject } from "@/lib/project-context";

export default function WorkflowEditorPage() {
  const { activeProject, getProjectPath } = useProject();

  return (
    <div className="h-[calc(100vh-6rem)]">
      <WorkflowEditor
        projectPath={activeProject ? getProjectPath() : undefined}
      />
    </div>
  );
}
