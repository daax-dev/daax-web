import { Eye } from "lucide-react";
import { AttentionBoard } from "@/components/attention/AttentionBoard";

export const metadata = {
  title: "Attention",
  description: "Live status of every active agent session.",
};

export default function AttentionPage() {
  return (
    <div className="container mx-auto max-w-screen-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Eye className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold">Attention</h1>
          <p className="text-sm text-muted-foreground">
            Every active agent session at a glance — live status, current tool,
            and recent activity.
          </p>
        </div>
      </div>

      <AttentionBoard />
    </div>
  );
}
