"use client";

import { useCallback, useRef, useState } from "react";

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

const ALL_EN_VOD_CATEGORY_ID = "__all_en_vod__";
const EN_CATEGORY_PREFIXES = [
  "EN", "UK", "US", "GB", "CA", "MULTI", "NETFLIX", "APPLE+", "DISNEY+",
  "4K", "18", "24/7", "CHRISTMAS", "FORMULA", "FOR", "WORLDCUP", "BEIN",
  "WC", "NZ", "AU",
];

type ApiResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function cleanCategoryName(category: Category) {
  return (category.category_name || "").toUpperCase().replace(/^[|\s]+/, "");
}

function isEnglishCategory(category: Category) {
  const cleanName = cleanCategoryName(category);
  return EN_CATEGORY_PREFIXES.some(
    (word) =>
      cleanName.startsWith(`${word}|`) ||
      cleanName.startsWith(`${word} `) ||
      cleanName === word,
  );
}

function withSyntheticAllEnVod(categories: Category[]) {
  if (!categories.some(isEnglishCategory)) return categories;
  return [
    {
      category_id: ALL_EN_VOD_CATEGORY_ID,
      category_name: "|EN| All VOD",
      parent_id: 0,
    },
    ...categories,
  ];
}

function getStreamKey(stream: Record<string, unknown>, index: number) {
  return String(stream.stream_id ?? stream.id ?? `${stream.name ?? stream.title ?? "stream"}-${index}`);
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
  const metadataCache = useRef<Map<string, Record<string, unknown>>>(new Map());

  const proxyRequest = useCallback(
    async <T>(action: string, profileId: string, params?: Record<string, string>, forceRefresh?: boolean): Promise<ApiResult<T>> => {
      try {
        const res = await fetch("/api/xc-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId, action, params, forceRefresh }),
        });
        if (!res.ok) {
          const err = await res.json();
          return { success: false, error: err.error ?? `HTTP ${res.status}` };
        }
        const data = await res.json();
        return { success: true, data: data as T };
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
      const categories = section === "vod" ? withSyntheticAllEnVod(cats) : cats;
      setAllCategories((prev) => ({ ...prev, [section]: categories }));
      setStatus(`Loaded ${cats.length} ${section} categories.`);
      setIsLoading(false);
    },
    [proxyRequest],
  );

  const fetchStreams = useCallback(
    async (section: string, catId: string, profileId: string, forceRefresh = false) => {
      setIsLoading(true);
      setStatus("Loading streams...");

      const actionMap: Record<string, string> = {
        live: "get_live_streams",
        vod: "get_vod_streams",
        series: "get_series",
      };

      if (section === "vod" && catId === ALL_EN_VOD_CATEGORY_ID) {
        const categories = allCategories.vod.filter(
          (category) =>
            category.category_id !== ALL_EN_VOD_CATEGORY_ID &&
            isEnglishCategory(category),
        );
        const seen = new Set<string>();
        const merged: Record<string, unknown>[] = [];

        for (const [index, category] of categories.entries()) {
          setStatus(`Loading All EN VOD ${index + 1}/${categories.length}...`);
          const result = await proxyRequest<Record<string, unknown>[]>(
            actionMap.vod,
            profileId,
            { category_id: category.category_id },
            forceRefresh,
          );

          if (!result.success) {
            setStatus(`Error: ${result.error}`);
            setIsLoading(false);
            return;
          }

          const data = Array.isArray(result.data) ? result.data : [];
          data.forEach((stream, streamIndex) => {
            const key = getStreamKey(stream, streamIndex);
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(stream);
          });
        }

        setStreams(merged);
        setStatus(`Loaded ${merged.length} All EN VOD streams.`);
        setIsLoading(false);
        return;
      }

      const params = catId ? { category_id: catId } : undefined;
      const result = await proxyRequest<Record<string, unknown>[]>(actionMap[section], profileId, params, forceRefresh);
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
    [allCategories.vod, proxyRequest],
  );

  const fetchStreamMetadata = useCallback(
    async (
      stream: Record<string, unknown>,
      section: string,
      profileId: string,
    ): Promise<Record<string, unknown> | null> => {
      if (section === "live") return null;

      const id = (stream.stream_id ?? stream.series_id ?? stream.id) as string | undefined;
      if (!id) return null;

      const cacheKey = `${section}_${id}`;
      const cached = metadataCache.current.get(cacheKey);
      if (cached) return cached;

      const action = section === "vod" ? "get_vod_info" : "get_series_info";
      const paramKey = section === "vod" ? "vod_id" : "series_id";

      const result = await proxyRequest<Record<string, unknown>>(action, profileId, {
        [paramKey]: id,
      });

      if (!result.success) return null;

      const info = (result.data?.info ?? result.data) as Record<string, unknown> | undefined;
      if (info) metadataCache.current.set(cacheKey, info);
      return info ?? null;
    },
    [proxyRequest],
  );

  const fetchSeriesDetails = useCallback(
    async (
      stream: Record<string, unknown>,
      profileId: string,
    ): Promise<Record<string, unknown> | null> => {
      const id = (stream.series_id ?? stream.id) as string | undefined;
      if (!id) return null;

      const cacheKey = `series_details_${id}`;
      const cached = metadataCache.current.get(cacheKey);
      if (cached) return cached;

      const result = await proxyRequest<Record<string, unknown>>(
        "get_series_info",
        profileId,
        { series_id: id },
      );

      if (!result.success) return null;
      metadataCache.current.set(cacheKey, result.data);
      return result.data;
    },
    [proxyRequest],
  );

  return {
    allCategories,
    streams,
    setStreams,
    isLoading,
    status,
    setStatus,
    fetchCategories,
    fetchStreams,
    fetchStreamMetadata,
    fetchSeriesDetails,
  };
}
