"use client";

import { useEffect, useState } from "react";
import { getSettings } from "@/lib/settings";
import { useProject } from "@/lib/project-context";

export function SettingsDebug() {
  const [clientSettings, setClientSettings] = useState<any>(null);
  const [serverDebug, setServerDebug] = useState<any>(null);
  const { basePath, directories } = useProject();

  useEffect(() => {
    // Get client-side settings
    const settings = getSettings();
    setClientSettings(settings);

    // Get server-side debug info
    fetch("/api/debug/workspace")
      .then((res) => res.json())
      .then((data) => setServerDebug(data))
      .catch((err) => console.error("Debug fetch error:", err));
  }, []);

  return (
    <div className="fixed bottom-4 right-4 p-4 bg-background border rounded-lg shadow-lg max-w-lg z-50">
      <h3 className="font-bold mb-2">Settings Debug</h3>
      <div className="space-y-2 text-xs">
        <div>
          <strong>Client basePath:</strong> {clientSettings?.basePath}
        </div>
        <div>
          <strong>Context basePath:</strong> {basePath}
        </div>
        <div>
          <strong>localStorage:</strong>{" "}
          {typeof window !== "undefined"
            ? localStorage.getItem("daax-settings")
            : "N/A"}
        </div>
        <div>
          <strong>Directories count:</strong> {directories.length}
        </div>
        <div>
          <strong>First 3 dirs:</strong>{" "}
          {directories
            .slice(0, 3)
            .map((d) => d.name)
            .join(", ")}
        </div>
        {serverDebug && (
          <div>
            <strong>Server says:</strong>{" "}
            {JSON.stringify(serverDebug.settings.basePath)}
          </div>
        )}
      </div>
    </div>
  );
}
