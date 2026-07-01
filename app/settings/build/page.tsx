import { Package } from "lucide-react";

import { BuildPanel } from "@/components/settings/BuildPanel";
import { BuildImages } from "@/components/settings/BuildImages";

export const metadata = {
  title: "Build — Settings",
};

export default function BuildSettingsPage() {
  return (
    <div className="container mx-auto max-w-screen-2xl px-4 py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Package className="h-6 w-6" />
          Build
        </h1>
        <p className="text-muted-foreground">
          Version, deployment, and software bill of materials for the running
          app.
        </p>
      </div>
      <div className="space-y-6">
        <BuildPanel />
        <BuildImages />
      </div>
    </div>
  );
}
