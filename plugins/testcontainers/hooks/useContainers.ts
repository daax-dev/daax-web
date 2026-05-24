/**
 * Test Containers Hook - Container Management
 *
 * React hook for managing test containers with auto-refresh.
 */

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type {
  TestContainer,
  ContainerListResponse,
  ContainerFilter,
  ContainerCreateRequest,
  ContainerActionResponse,
  DockerConnectionStatus,
} from "../types";
import { DEFAULT_SETTINGS } from "../constants";

interface UseContainersOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  filter?: ContainerFilter;
}

interface UseContainersReturn {
  containers: TestContainer[];
  total: number;
  loading: boolean;
  error: string | null;
  dockerStatus: DockerConnectionStatus | null;
  refresh: () => Promise<void>;
  createContainer: (request: ContainerCreateRequest) => Promise<TestContainer>;
  startContainer: (id: string) => Promise<ContainerActionResponse>;
  stopContainer: (id: string) => Promise<ContainerActionResponse>;
  restartContainer: (id: string) => Promise<ContainerActionResponse>;
  removeContainer: (
    id: string,
    force?: boolean,
  ) => Promise<ContainerActionResponse>;
}

export function useContainers(
  options: UseContainersOptions = {},
): UseContainersReturn {
  const {
    autoRefresh = true,
    refreshInterval = DEFAULT_SETTINGS.autoRefreshInterval * 1000,
    filter,
  } = options;

  const [containers, setContainers] = useState<TestContainer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dockerStatus, setDockerStatus] =
    useState<DockerConnectionStatus | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Stable serialized filter key to avoid re-renders from new object references
  const filterKey = useMemo(() => JSON.stringify(filter ?? null), [filter]);

  const fetchContainers = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentController = controller;
    try {
      setError(null);

      // Parse filter from stable key
      const currentFilter: ContainerFilter | null = JSON.parse(filterKey);

      // Build query params from filter
      const params = new URLSearchParams();
      if (currentFilter?.status)
        params.set("status", currentFilter.status.join(","));
      if (currentFilter?.project) params.set("project", currentFilter.project);
      if (currentFilter?.search) params.set("search", currentFilter.search);

      const url = `/api/testcontainers${params.toString() ? `?${params}` : ""}`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch containers");
      }

      const data: ContainerListResponse = await response.json();
      setContainers(data.containers);
      setTotal(data.total);

      // Update Docker status from successful request
      setDockerStatus({
        connected: true,
        lastCheck: new Date().toISOString(),
      });
    } catch (err) {
      // Ignore aborted requests
      if (err instanceof DOMException && err.name === "AbortError") return;

      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);

      // Check if it's a Docker connection error
      if (message.includes("Docker daemon")) {
        setDockerStatus({
          connected: false,
          error: message,
          lastCheck: new Date().toISOString(),
        });
      }
    } finally {
      // Only clear loading if this is still the active request
      if (abortControllerRef.current === currentController) {
        setLoading(false);
      }
    }
  }, [filterKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchContainers();
  }, [fetchContainers]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchContainers();

    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(fetchContainers, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchContainers, autoRefresh, refreshInterval]);

  const createContainer = useCallback(
    async (request: ContainerCreateRequest): Promise<TestContainer> => {
      const response = await fetch("/api/testcontainers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create container");
      }

      const data = await response.json();

      // Refresh the list
      await fetchContainers();

      return data.container;
    },
    [fetchContainers],
  );

  const startContainer = useCallback(
    async (id: string): Promise<ContainerActionResponse> => {
      const response = await fetch(`/api/testcontainers/${id}/start`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to start container");
      }

      const data = await response.json();
      await fetchContainers();
      return data;
    },
    [fetchContainers],
  );

  const stopContainer = useCallback(
    async (id: string): Promise<ContainerActionResponse> => {
      const response = await fetch(`/api/testcontainers/${id}/stop`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to stop container");
      }

      const data = await response.json();
      await fetchContainers();
      return data;
    },
    [fetchContainers],
  );

  const restartContainer = useCallback(
    async (id: string): Promise<ContainerActionResponse> => {
      const response = await fetch(`/api/testcontainers/${id}/restart`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to restart container");
      }

      const data = await response.json();
      await fetchContainers();
      return data;
    },
    [fetchContainers],
  );

  const removeContainer = useCallback(
    async (id: string, force = false): Promise<ContainerActionResponse> => {
      const response = await fetch(`/api/testcontainers/${id}?force=${force}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove container");
      }

      const data = await response.json();
      await fetchContainers();
      return data;
    },
    [fetchContainers],
  );

  return {
    containers,
    total,
    loading,
    error,
    dockerStatus,
    refresh,
    createContainer,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
  };
}
