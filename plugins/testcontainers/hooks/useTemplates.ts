/**
 * Test Containers Hook - Template Management
 *
 * React hook for managing container templates.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ContainerTemplate, TemplateCategory } from '../types';

interface UseTemplatesReturn {
  templates: ContainerTemplate[];
  templatesByCategory: Record<TemplateCategory, ContainerTemplate[]>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getTemplate: (id: string) => ContainerTemplate | undefined;
}

export function useTemplates(): UseTemplatesReturn {
  const [templates, setTemplates] = useState<ContainerTemplate[]>([]);
  const [templatesByCategory, setTemplatesByCategory] = useState<Record<TemplateCategory, ContainerTemplate[]>>({
    database: [],
    messaging: [],
    cache: [],
    service: [],
    custom: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setError(null);

      // Fetch grouped templates
      const response = await fetch('/api/testcontainers/templates?grouped=true');

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch templates');
      }

      const grouped: Record<TemplateCategory, ContainerTemplate[]> = await response.json();
      setTemplatesByCategory(grouped);

      // Flatten for easy access
      const allTemplates = Object.values(grouped).flat();
      setTemplates(allTemplates);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchTemplates();
  }, [fetchTemplates]);

  const getTemplate = useCallback(
    (id: string): ContainerTemplate | undefined => templates.find((t) => t.id === id),
    [templates]
  );

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    templatesByCategory,
    loading,
    error,
    refresh,
    getTemplate,
  };
}
