"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import {
  TerminalManagerProvider,
  useTerminalManager,
} from "@/components/terminal/TerminalManager";
import { ProjectProvider, useProject } from "@/lib/project-context";
import { PluginProvider } from "@/components/plugins/PluginProvider";
import { ScreenRecorderProvider } from "@/plugins/screen-recorder";
import { ConfigProvider } from "@/lib/config-provider";
import { PresentationModeToggle } from "@/components/presentation/PresentationModeToggle";

/**
 * Registers TerminalManager's stopAllAISessions with ProjectContext
 * for cleanup when switching projects.
 */
function CleanupRegistration() {
  const { registerCleanupCallback } = useProject();
  const { stopAllAISessions } = useTerminalManager();

  useEffect(() => {
    registerCleanupCallback({
      stopAllTerminals: stopAllAISessions,
    });
  }, [registerCleanupCallback, stopAllAISessions]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // ThemeProvider is outermost so all components (including ConfigProvider's loading state)
  // inherit the correct theme colors. ConfigProvider blocks rendering until config is loaded,
  // but its loading screen will now show with proper dark/light mode styling.
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <ConfigProvider>
        <TooltipProvider>
          <PluginProvider>
            <ProjectProvider>
              <TerminalManagerProvider>
                <CleanupRegistration />
                {children}
                <Toaster position="bottom-right" richColors />
                <ScreenRecorderProvider />
                <PresentationModeToggle />
              </TerminalManagerProvider>
            </ProjectProvider>
          </PluginProvider>
        </TooltipProvider>
      </ConfigProvider>
    </ThemeProvider>
  );
}
