"use client";

import { useMemo } from "react";

// Best-effort release year for a stream: explicit year/release-date fields, else
// the most recent 4-digit year found in the title (so "Title (2026)" sorts above
// "Title (2019)"). Returns 0 when no year is detectable.
function streamYear(stream: Record<string, unknown>): number {
  const direct = stream.year ?? stream.releaseDate ?? stream.release_date ?? stream.releasedate;
  if (typeof direct === "number" && direct > 1900) return direct;
  if (typeof direct === "string") {
    const y = Number.parseInt(direct.slice(0, 4), 10);
    if (y > 1900 && y < 2100) return y;
  }

  const text = String(stream.name ?? stream.title ?? "");
  const matches = text.match(/(?:19|20)\d{2}/g);
  if (matches && matches.length > 0) {
    return Math.max(...matches.map(Number));
  }
  return 0;
}

export function useFilteredStreams(
  streams: Record<string, unknown>[],
  searchQuery?: string,
  englishOnly?: boolean,
  yearFilter?: string,
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

    if (yearFilter) {
      filtered = filtered.filter((s) =>
        ((s.name || s.title || "") as string).includes(yearFilter),
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

    // Deterministic order: newest year first, then by name, then by id. Without
    // the secondary keys, ties (and the large no-year bucket) would be broken by
    // the source array order, which differs between a DB read and an upstream
    // fetch — so a force-refresh would reshuffle identical content. A total
    // ordering means the layout only changes when the content itself changes.
    return [...filtered].sort((a, b) => {
      const byYear = streamYear(b) - streamYear(a);
      if (byYear !== 0) return byYear;
      const nameA = String(a.name ?? a.title ?? "");
      const nameB = String(b.name ?? b.title ?? "");
      const byName = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
      if (byName !== 0) return byName;
      const idA = String(a.stream_id ?? a.series_id ?? a.id ?? "");
      const idB = String(b.stream_id ?? b.series_id ?? b.id ?? "");
      return idA.localeCompare(idB);
    });
  }, [streams, searchQuery, englishOnly, yearFilter]);

  return result;
}
