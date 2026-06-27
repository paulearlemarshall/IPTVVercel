"use client";

import { useMemo } from "react";

interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export function useGroupedCategories(
  categories: Category[],
  searchQuery?: string,
  englishOnly?: boolean,
): Record<string, Category[]> {
  return useMemo(() => {
    const allowed = [
      "EN", "UK", "US", "GB", "CA", "MULTI", "NETFLIX", "APPLE+", "DISNEY+",
      "4K", "18", "24/7", "CHRISTMAS", "FORMULA", "FOR", "WORLDCUP", "BEIN",
      "WC", "NZ", "AU",
    ];

    const filtered = categories.filter((c) => {
      const nameUpper = (c.category_name || "").toUpperCase();
      if (searchQuery && !nameUpper.includes(searchQuery.toUpperCase())) return false;
      if (englishOnly) {
        const cleanName = nameUpper.replace(/^[|\s]+/, "");
        return allowed.some(
          (word) =>
            cleanName.startsWith(word.toUpperCase() + "|") ||
            cleanName.startsWith(word.toUpperCase() + " ") ||
            cleanName === word.toUpperCase(),
        );
      }
      return true;
    });

    const groups: Record<string, Category[]> = {};

    groups[" Favorites"] = [
      { category_id: "favorites", category_name: "★ Favorites", parent_id: 0 },
    ];

    filtered.forEach((cat) => {
      const name = cat.category_name || "";
      let prefix = "General";
      if (name.includes("|")) {
        const parts = name
          .split("|")
          .map((p) => p.trim())
          .filter((p) => p.length > 0);
        if (parts.length > 0) prefix = parts[0];
      } else {
        const firstWord = name.split(" ")[0];
        if (firstWord) prefix = firstWord;
      }
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(cat);
    });

    return groups;
  }, [categories, searchQuery, englishOnly]);
}
