"use client";

import { useEffect, useState } from "react";
import { AlertCircle, X } from "lucide-react";

interface BacklogHealthResponse {
  service: string;
  status: string;
  timestamp: string;
  error: {
    message: string;
    name: string;
  } | null;
}

export function BacklogHealthBanner() {
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch("/api/health/backlog");
        const data: BacklogHealthResponse = await response.json();

        if (data.status === "unavailable" || response.status === 503) {
          setIsUnavailable(true);
          setErrorMessage(
            data.error?.message || "Backlog service initialization failed",
          );
        } else {
          setIsUnavailable(false);
        }
      } catch (error) {
        // If health check fails, show banner
        setIsUnavailable(true);
        setErrorMessage("Unable to connect to backlog service");
      }
    };

    checkHealth();
  }, []);

  if (!isUnavailable || dismissed) {
    return null;
  }

  return (
    <div className="bg-yellow-500/10 border-l-4 border-yellow-500 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
            Backlog Service Unavailable
          </h3>
          <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
            The backlog feature is currently unavailable. Task management
            functionality will not work.
          </p>
          {errorMessage && (
            <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-2 font-mono">
              {errorMessage}
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-yellow-500 hover:text-yellow-700 dark:hover:text-yellow-300 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
