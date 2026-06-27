"use client";

import { useMemo } from "react";

export function useFilteredStreams(
  streams: Record<string, unknown>[],
  searchQuery?: string,
  englishOnly?: boolean,
) {
  const result = useMemo(() => {
    let filtered = streams;
    const lowerQuery = (searchQuery || "").toLowerCase();

    if (searchQuery) {
      filtered = filtered.filter(
        (s) =>
          ((s.name || s.title || "") as string)
            .toLowerCase()
            .includes(lowerQuery),
      );
    }

    if (englishOnly) {
      const forbidden = [
        "SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH",
        "ITALIAN", "SPANISH",
      ];
      filtered = filtered.filter(
        (s) =>
          !forbidden.some((word) =>
            ((s.name || s.title) as string)?.toUpperCase().includes(word),
          ),
      );
    }

    return filtered;
  }, [streams, searchQuery, englishOnly]);

  return result;
}
