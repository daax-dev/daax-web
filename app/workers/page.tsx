import { UserCog } from "lucide-react";
import { WorkersList } from "@/components/workers/WorkersList";

export const metadata = {
  title: "Digital Workers",
  description:
    "AI workers with goals and tools, run on a schedule, on demand, or continuously.",
};

export default function WorkersPage() {
  return (
    <div className="container mx-auto max-w-screen-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <UserCog className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold">Digital Workers</h1>
          <p className="text-sm text-muted-foreground">
            AI workers with goals and MCP tools. They run on a schedule, on
            demand, or continuously — manage them here, from the CLI (
            <code className="font-mono">bun run workers</code>), or by voice.
          </p>
        </div>
      </div>
      <WorkersList />
    </div>
  );
}
