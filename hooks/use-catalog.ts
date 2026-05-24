/**
 * React hooks for the Image Catalog
 */

import { useState, useEffect, useCallback } from "react";
import type {
  BaseImage,
  Feature,
  BuildSpec,
  BuildJob,
  BuiltImage,
  ListBasesResponse,
  ListFeaturesResponse,
  ListBuildsResponse,
  FeatureCategory,
} from "@/types/catalog";

// ============================================================================
// Base Images Hook
// ============================================================================

interface UseBasesReturn {
  bases: BaseImage[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBases(): UseBasesReturn {
  const [bases, setBases] = useState<BaseImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBases = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/catalog/bases");
      if (!res.ok) throw new Error("Failed to fetch bases");
      const data: ListBasesResponse = await res.json();
      setBases(data.bases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBases();
  }, [fetchBases]);

  return { bases, loading, error, refetch: fetchBases };
}

// ============================================================================
// Single Base Hook
// ============================================================================

interface UseBaseReturn {
  base: BaseImage | null;
  loading: boolean;
  error: string | null;
}

export function useBase(id: string): UseBaseReturn {
  const [base, setBase] = useState<BaseImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBase() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/catalog/bases/${id}`);
        if (!res.ok) throw new Error("Failed to fetch base");
        const data: BaseImage = await res.json();
        setBase(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchBase();
  }, [id]);

  return { base, loading, error };
}

// ============================================================================
// Features Hook
// ============================================================================

interface UseFeaturesOptions {
  category?: FeatureCategory;
  baseId?: string;
}

interface UseFeaturesReturn {
  features: Feature[];
  categories: FeatureCategory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFeatures(options?: UseFeaturesOptions): UseFeaturesReturn {
  // Destructure to stable locals: React Compiler cannot preserve manual
  // memoization when the useCallback deps are optional-chain expressions on a
  // possibly-unstable arg (options?.category). Plain identifiers are analyzable.
  const category = options?.category;
  const baseId = options?.baseId;

  const [features, setFeatures] = useState<Feature[]>([]);
  const [categories, setCategories] = useState<FeatureCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeatures = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (baseId) params.set("baseId", baseId);

      const url = `/api/catalog/features${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch features");
      const data: ListFeaturesResponse = await res.json();
      setFeatures(data.features);
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [category, baseId]);

  useEffect(() => {
    fetchFeatures();
  }, [fetchFeatures]);

  return { features, categories, loading, error, refetch: fetchFeatures };
}

// ============================================================================
// Single Feature Hook
// ============================================================================

interface UseFeatureReturn {
  feature: Feature | null;
  loading: boolean;
  error: string | null;
}

export function useFeature(id: string): UseFeatureReturn {
  const [feature, setFeature] = useState<Feature | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFeature() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/catalog/features/${id}`);
        if (!res.ok) throw new Error("Failed to fetch feature");
        const data: Feature = await res.json();
        setFeature(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    if (id) fetchFeature();
  }, [id]);

  return { feature, loading, error };
}

// ============================================================================
// Build Specs Hook
// ============================================================================

interface UseBuildsReturn {
  builds: BuildSpec[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createBuild: (
    spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
  ) => Promise<BuildSpec>;
  deleteBuild: (id: string) => Promise<void>;
}

export function useBuilds(): UseBuildsReturn {
  const [builds, setBuilds] = useState<BuildSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBuilds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/catalog/builds");
      if (!res.ok) throw new Error("Failed to fetch builds");
      const data: ListBuildsResponse = await res.json();
      setBuilds(data.builds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const createBuild = useCallback(
    async (
      spec: Omit<BuildSpec, "id" | "createdAt" | "updatedAt">,
    ): Promise<BuildSpec> => {
      const res = await fetch("/api/catalog/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(spec),
      });
      if (!res.ok) throw new Error("Failed to create build");
      const created = await res.json();
      await fetchBuilds();
      return created;
    },
    [fetchBuilds],
  );

  const deleteBuild = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/catalog/builds/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete build");
      await fetchBuilds();
    },
    [fetchBuilds],
  );

  useEffect(() => {
    fetchBuilds();
  }, [fetchBuilds]);

  return {
    builds,
    loading,
    error,
    refetch: fetchBuilds,
    createBuild,
    deleteBuild,
  };
}

// ============================================================================
// Single Build Spec Hook
// ============================================================================

interface UseBuildReturn {
  build: BuildSpec | null;
  jobs: BuildJob[];
  loading: boolean;
  error: string | null;
  startBuild: () => Promise<BuildJob>;
  refetchJobs: () => Promise<void>;
}

export function useBuild(id: string): UseBuildReturn {
  const [build, setBuild] = useState<BuildSpec | null>(null);
  const [jobs, setJobs] = useState<BuildJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBuild = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [specRes, jobsRes] = await Promise.all([
        fetch(`/api/catalog/builds/${id}`),
        fetch(`/api/catalog/builds/${id}/jobs`),
      ]);

      if (!specRes.ok) throw new Error("Failed to fetch build");

      const spec: BuildSpec = await specRes.json();
      setBuild(spec);

      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData.jobs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchJobs = useCallback(async () => {
    const res = await fetch(`/api/catalog/builds/${id}/jobs`);
    if (res.ok) {
      const data = await res.json();
      setJobs(data.jobs);
    }
  }, [id]);

  const startBuild = useCallback(async (): Promise<BuildJob> => {
    const res = await fetch(`/api/catalog/builds/${id}/start`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to start build");
    const data = await res.json();
    await fetchJobs();
    return data.job;
  }, [id, fetchJobs]);

  useEffect(() => {
    if (id) fetchBuild();
  }, [id, fetchBuild]);

  return { build, jobs, loading, error, startBuild, refetchJobs: fetchJobs };
}

// ============================================================================
// Built Images Hook
// ============================================================================

interface UseImagesReturn {
  images: BuiltImage[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useImages(): UseImagesReturn {
  const [images, setImages] = useState<BuiltImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/catalog/images");
      if (!res.ok) throw new Error("Failed to fetch images");
      const data = await res.json();
      setImages(data.images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  return { images, loading, error, refetch: fetchImages };
}
