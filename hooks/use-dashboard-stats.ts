/**
 * React hook for fetching dashboard statistics with caching and auto-refresh
 */

import { useState, useEffect, useCallback } from "react";
import { DashboardStatsResponse } from "@/types/catalog";

export interface UseDashboardStatsResult {
  stats: DashboardStatsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | undefined;
  mutate: () => void;
}

export function useDashboardStats(): UseDashboardStatsResult {
  const [stats, setStats] = useState<DashboardStatsResponse | undefined>(
    undefined,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsError(false);
      setError(undefined);

      const response = await fetch("/api/catalog/dashboard/stats");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: DashboardStatsResponse = await response.json();
      setStats(data);
    } catch (err) {
      setIsError(true);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStats]);

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => {
      fetchStats();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchStats]);

  return {
    stats,
    isLoading,
    isError,
    error,
    mutate: fetchStats,
  };
}
