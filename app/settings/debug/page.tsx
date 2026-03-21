"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSettings,
  saveSettings,
  forceResetSettings,
  debugSettings,
  DEFAULT_SETTINGS,
} from "@/lib/settings";
import { RefreshCw, Trash2, Save, AlertCircle } from "lucide-react";

export default function SettingsDebugPage() {
  const [settings, setSettings] = useState<any>(null);
  const [localStorage, setLocalStorage] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const loadDebugInfo = async () => {
    // Get client-side info
    const currentSettings = getSettings();
    const raw = window.localStorage.getItem("daax-settings");
    setSettings(currentSettings);
    setLocalStorage(raw || "null");

    // Get server-side info
    try {
      const response = await fetch("/api/settings/debug");
      const data = await response.json();
      setDebugInfo(data);
    } catch (error) {
      console.error("Failed to load debug info:", error);
    }

    // Log to console
    debugSettings();
  };

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const handleForceReset = () => {
    if (
      confirm("This will delete all settings and reset to defaults. Continue?")
    ) {
      forceResetSettings();
      setTimeout(() => window.location.reload(), 100);
    }
  };

  const handleFixBasePath = () => {
    const fixed = { ...settings };
    // Fix any ~/ps references
    if (fixed.basePath?.includes("/ps")) {
      fixed.basePath = fixed.basePath.replace("~/ps", "~/prj");
      saveSettings(fixed);
      alert(`Fixed basePath: ${settings.basePath} -> ${fixed.basePath}`);
      loadDebugInfo();
    }
  };

  const handleSetPath = (path: string) => {
    saveSettings({ basePath: path });
    alert(`Set basePath to: ${path}`);
    loadDebugInfo();
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Settings Debug</h1>
          <Button onClick={loadDebugInfo} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Current Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Current Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
              {JSON.stringify(settings, null, 2)}
            </pre>
            {settings?.basePath?.includes("/ps") && (
              <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded flex items-center justify-between">
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertCircle className="h-5 w-5" />
                  <span>Found old ~/ps path!</span>
                </div>
                <Button size="sm" onClick={handleFixBasePath}>
                  Fix Now
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* localStorage Raw */}
        <Card>
          <CardHeader>
            <CardTitle>localStorage Raw Value</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto">
              {localStorage || "null"}
            </pre>
          </CardContent>
        </Card>

        {/* Server Debug Info */}
        {debugInfo && (
          <Card>
            <CardHeader>
              <CardTitle>Server Debug Info</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={() => handleSetPath("~/prj")} variant="outline">
                Set to ~/prj
              </Button>
              <Button
                onClick={() => handleSetPath("~/prj/jp")}
                variant="outline"
              >
                Set to ~/prj/jp
              </Button>
              <Button
                onClick={() => handleSetPath("~/prj/ps")}
                variant="outline"
              >
                Set to ~/prj/ps
              </Button>
            </div>

            <Button
              onClick={handleForceReset}
              variant="destructive"
              className="w-full"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Force Reset All Settings
            </Button>

            <div className="text-xs text-muted-foreground p-3 bg-muted rounded">
              <p className="font-mono mb-2">Browser Console Commands:</p>
              <code className="block">
                localStorage.getItem(&apos;daax-settings&apos;)
              </code>
              <code className="block">
                localStorage.removeItem(&apos;daax-settings&apos;)
              </code>
              <code className="block">location.reload()</code>
            </div>
          </CardContent>
        </Card>

        {/* Defaults Reference */}
        <Card>
          <CardHeader>
            <CardTitle>Default Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-4 rounded overflow-auto">
              {JSON.stringify(DEFAULT_SETTINGS, null, 2)}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
