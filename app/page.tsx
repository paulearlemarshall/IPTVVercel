"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ServerSelector from "@/components/ServerSelector";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";
import StatsModal from "@/components/StatsModal";
import StreamTooltip from "@/components/StreamTooltip";
import { useXCApi } from "@/hooks/useXCApi";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(
  () => import("@/components/VideoPlayer"),
  { ssr: false },
);
import { useGroupedCategories } from "@/hooks/useGroupedCategories";
import { useFilteredStreams } from "@/hooks/useFilteredStreams";

interface Profile {
  id: string;
  name: string;
  servers: string[];
  activeServerIndex: number;
}

interface HoverState {
  stream: Record<string, unknown>;
  mouseX: number;
  mouseY: number;
}

interface PlayerState {
  url: string;
  title: string;
}

const SECTIONS = ["live", "vod", "series"];

export default function HomePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [selectedSection, setSelectedSection] = useState("vod");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [englishOnly, setEnglishOnly] = useState(true);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoverMeta, setHoverMeta] = useState<Record<string, unknown> | null>(
    null,
  );
  const [hoverStreamUrl, setHoverStreamUrl] = useState("");
  const [hoverLoading, setHoverLoading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const {
    allCategories,
    streams,
    isLoading,
    status,
    fetchCategories,
    fetchStreams,
    fetchStreamMetadata,
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

  const handleMouseEnter = useCallback(
    (stream: Record<string, unknown>, e: React.MouseEvent) => {
      if (selectedSection === "live") return;
      clearTimeout(leaveTimer.current);
      setIsHovering(true);

      hoverTimer.current = setTimeout(async () => {
        setHoverMeta(null);
        setHoverStreamUrl("");
        setHoverLoading(true);
        setHover({ stream, mouseX: e.clientX, mouseY: e.clientY });
        if (activeProfile) {
          const [meta, urlRes] = await Promise.all([
            fetchStreamMetadata(stream, selectedSection, activeProfile.id),
            fetch("/api/stream-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profileId: activeProfile.id,
                stream,
                section: selectedSection,
              }),
            }).then((r) => r.json().catch(() => ({}))),
          ]);
          setHoverMeta(meta);
          setHoverStreamUrl(urlRes?.url || "");
        }
        setHoverLoading(false);
      }, 400);
    },
    [selectedSection, activeProfile, fetchStreamMetadata],
  );

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setIsHovering(false);
    leaveTimer.current = setTimeout(() => {
      if (!isHovering) {
        setHover(null);
        setHoverMeta(null);
        setHoverStreamUrl("");
        setHoverLoading(false);
      }
    }, 300);
  }, [isHovering]);

  const handleTooltipEnter = useCallback(() => {
    clearTimeout(leaveTimer.current);
    setIsHovering(true);
  }, []);

  const handleTooltipLeave = useCallback(() => {
    setIsHovering(false);
    leaveTimer.current = setTimeout(() => {
      setHover(null);
      setHoverMeta(null);
      setHoverStreamUrl("");
      setHoverLoading(false);
    }, 300);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (hover) {
        setHover((prev) =>
          prev ? { ...prev, mouseX: e.clientX, mouseY: e.clientY } : prev,
        );
      }
    },
    [hover],
  );

  const handleStreamClick = useCallback(
    async (stream: Record<string, unknown>) => {
      if (!activeProfile) return;
      try {
        const res = await fetch("/api/stream-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId: activeProfile.id,
            stream,
            section: selectedSection,
          }),
        });
        const data = await res.json();
        if (data.url) {
          setPlayer({
            url: data.url,
            title: (stream.name ?? stream.title ?? "Untitled") as string,
          });
        }
      } catch {
        /* ignore */
      }
    },
    [activeProfile, selectedSection],
  );

  const filteredStreams = useFilteredStreams(streams, undefined, englishOnly);

  const groupedCategories = useGroupedCategories(
    allCategories[selectedSection] ?? [],
    undefined,
    englishOnly,
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
            <button
              onClick={() => setEnglishOnly((v) => !v)}
              className={`rounded px-2 py-0.5 text-xs font-bold transition-colors ${
                englishOnly
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              }`}
              title="English Only Filter"
            >
              EN
            </button>
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
          {!isLoading && filteredStreams.length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Select a category to browse streams.
            </p>
          )}
          {filteredStreams.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredStreams.map((s, i) => (
                <div
                  key={(s.stream_id as string) ?? (s.id as string) ?? i}
                  className="relative cursor-pointer rounded-lg border border-gray-200 bg-white p-2 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                  onMouseEnter={(e) => handleMouseEnter(s, e)}
                  onMouseLeave={handleMouseLeave}
                  onMouseMove={handleMouseMove}
                  onClick={() => handleStreamClick(s)}
                >
                  <div
                    className="flex items-center justify-center overflow-hidden rounded bg-gray-100 dark:bg-gray-700"
                    style={{ height: "260px" }}
                  >
                    {(s.stream_icon as string) ? (
                      <img
                        src={s.stream_icon as string}
                        alt=""
                        className="max-h-full max-w-full object-contain"
                        onError={(e) => {
                          (
                            e.currentTarget as HTMLImageElement
                          ).style.display = "none";
                        }}
                      />
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs font-medium">
                    {(s.name ?? s.title ?? "Untitled") as string}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {hover && (
        <div
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
        >
          <StreamTooltip
            stream={hover.stream}
            streamUrl={hoverStreamUrl}
            metadata={hoverMeta}
            isLoading={hoverLoading}
            mouseX={hover.mouseX}
            mouseY={hover.mouseY}
            onClose={() => {
              setHover(null);
              setHoverMeta(null);
              setHoverStreamUrl("");
            }}
          />
        </div>
      )}
      {player && (
        <VideoPlayer
          url={player.url}
          title={player.title}
          onClose={() => setPlayer(null)}
        />
      )}
    </main>
  );
}
