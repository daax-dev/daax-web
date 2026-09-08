import { Radar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentViewPanel } from "@/components/agentview/AgentViewPanel";
import { DaemonConsole } from "@/components/agentview/DaemonConsole";

export const metadata = {
  title: "Agent View",
  description:
    "What the coding agents on this machine are doing, as the dist-agent daemon observes it.",
};

export default function AgentViewPage() {
  return (
    <div className="container mx-auto max-w-screen-xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Radar className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-bold">Agent View</h1>
          <p className="text-sm text-muted-foreground">
            What the coding agents on this machine are doing, as the dist-agent
            daemon observes it — agents, capabilities, and the live event
            timeline.
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="agentview-tabs">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="console">Console</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <AgentViewPanel />
        </TabsContent>
        <TabsContent value="console">
          <DaemonConsole />
        </TabsContent>
      </Tabs>
    </div>
  );
}
