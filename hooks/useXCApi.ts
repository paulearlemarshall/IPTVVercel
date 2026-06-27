"use client";

import { useCallback, useState } from "react";

interface Profile {
  id: string;
  username: string;
  password: string;
  servers: string[];
  activeServerIndex: number;
}

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function useXCApi() {
  const [allCategories, setAllCategories] = useState<Record<string, Category[]>>({
    live: [],
    vod: [],
    series: [],
  });
  const [streams, setStreams] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("Ready");

  const proxyRequest = useCallback(
    async <T>(action: string, profileId: string, params?: Record<string, string>): Promise<ApiResult<T>> => {
      try {
        const res = await fetch("/api/xc-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, action, params }),
        });
        if (!res.ok) {
          const err = await res.json();
          return { success: false, error: err.error ?? `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, data };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
    [],
  );

  const fetchCategories = useCallback(
    async (section: string, profileId: string) => {
      setIsLoading(true);
      setStatus(`Loading ${section} categories...`);

      const actionMap: Record<string, string> = {
        live: "get_live_categories",
        vod: "get_vod_categories",
        series: "get_series_categories",
      };

      const result = await proxyRequest<Category[]>(actionMap[section], profileId);
      if (!result.success) {
        setStatus(`Error: ${result.error}`);
        setIsLoading(false);
        return;
      }

      const cats = Array.isArray(result.data) ? result.data : [];
      setAllCategories((prev) => ({ ...prev, [section]: cats }));
      setStatus(`Loaded ${cats.length} ${section} categories.`);
      setIsLoading(false);
    },
    [proxyRequest],
  );

  const fetchStreams = useCallback(
    async (section: string, catId: string, profileId: string) => {
      setIsLoading(true);
      setStatus("Loading streams...");

      const actionMap: Record<string, string> = {
        live: "get_live_streams",
        vod: "get_vod_streams",
        series: "get_series",
      };

      const params = catId ? { category_id: catId } : undefined;
      const result = await proxyRequest<Record<string, unknown>[]>(actionMap[section], profileId, params);
      if (!result.success) {
        setStatus(`Error: ${result.error}`);
        setIsLoading(false);
        return;
      }

      const data = Array.isArray(result.data) ? result.data : [];
      setStreams(data);
      setStatus(`Loaded ${data.length} streams.`);
      setIsLoading(false);
    },
    [proxyRequest],
  );

  return {
    allCategories,
    setAllCategories,
    streams,
    setStreams,
    isLoading,
    status,
    setStatus,
    fetchCategories,
    fetchStreams,
  };
}
