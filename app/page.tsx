"use client";

import { useCallback, useEffect, useState } from "react";
import ServerSelector from "@/components/ServerSelector";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import StatsModal from "@/components/StatsModal";
import { useXCApi } from "@/hooks/useXCApi";
import { useGroupedCategories } from "@/hooks/useGroupedCategories";

interface Profile {
  id: string;
  name: string;
  servers: string[];
  activeServerIndex: number;
}

const SECTIONS = ["live", "vod", "series"];

export default function HomePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [selectedSection, setSelectedSection] = useState("vod");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const {
    allCategories,
    streams,
    isLoading,
    status,
    fetchCategories,
    fetchStreams,
  } = useXCApi();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: Profile[]) => {
        setProfiles(data);
        if (data.length > 0) setActiveProfile(data[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeProfile) return;
    fetchCategories(selectedSection, activeProfile.id);
    setSelectedCategory(null);
  }, [selectedSection, activeProfile, fetchCategories]);

  const handleSectionChange = useCallback((section: string) => {
    setSelectedSection(section);
  }, []);

  const handleCategoryClick = useCallback(
    (catId: string) => {
      if (!activeProfile) return;
      setSelectedCategory(catId);
      fetchStreams(selectedSection, catId, activeProfile.id);
    },
    [activeProfile, selectedSection, fetchStreams],
  );

  const handleServerChange = useCallback(
    (index: number) => {
      setActiveProfile((prev) =>
        prev ? { ...prev, activeServerIndex: index } : prev,
      );
    },
    [],
  );

  const groupedCategories = useGroupedCategories(
    allCategories[selectedSection] ?? [],
  );

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h1 className="text-lg font-semibold">IPTV Player</h1>
        {activeProfile && (
          <>
            <ServerSelector
              profileId={activeProfile.id}
              servers={activeProfile.servers}
              activeServerIndex={activeProfile.activeServerIndex}
              onServerChange={handleServerChange}
            />
            <span className="text-xs text-gray-400">{status}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <StatsModal />
          <ThemeToggle />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {activeProfile && (
          <Sidebar
            sections={SECTIONS}
            selectedSection={selectedSection}
            onSectionChange={handleSectionChange}
            groupedCategories={groupedCategories}
            selectedCategory={selectedCategory}
            onCategoryClick={handleCategoryClick}
          />
        )}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading...
            </p>
          )}
          {!isLoading && streams.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Select a category to browse streams.
            </p>
          )}
          {streams.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {streams.map((s, i) => (
                <div
                  key={(s.stream_id as string) ?? i}
                  className="rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="aspect-video rounded bg-gray-100 dark:bg-gray-700" />
                  <p className="mt-1 truncate text-xs font-medium">
                    {(s.name ?? s.title ?? "Untitled") as string}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
