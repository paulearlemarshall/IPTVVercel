"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AccountModal from "@/components/AccountModal";
import CatalogUpdateButtons from "@/components/CatalogUpdateButtons";
import DbLogModal from "@/components/DbLogModal";
import ServerSelector from "@/components/ServerSelector";
import Sidebar from "@/components/Sidebar";
import SeriesDetailModal from "@/components/SeriesDetailModal";
import StatsModal from "@/components/StatsModal";
import StreamTooltip from "@/components/StreamTooltip";
import ThemeToggle from "@/components/ThemeToggle";
import TileImage from "@/components/TileImage";
import { Menu } from "lucide-react";
import { useFilteredStreams } from "@/hooks/useFilteredStreams";
import { useGroupedCategories } from "@/hooks/useGroupedCategories";
import { useHasHover } from "@/hooks/useHasHover";
import { useXCApi } from "@/hooks/useXCApi";

const VideoPlayer = dynamic(
  () => import("@/components/VideoPlayer"),
  { ssr: false },
);

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
  proxyUrl?: string | null;
  streamId?: string;
  title: string;
}

interface SeriesState {
  stream: Record<string, unknown>;
  details: Record<string, unknown> | null;
  isLoading: boolean;
}

const SECTIONS = ["live", "vod", "series"];

function getArtwork(stream: Record<string, unknown>, section?: string) {
  // For series tiles, prefer poster images (stream_icon/cover) over the wide backdrop
  if (section === "series") {
    const poster =
      (stream.stream_icon as string) ||
      (stream.cover as string) ||
      (stream.movie_image as string);
    if (poster) return poster;
  }
  // VOD & live: prefer stream_icon/cover, backdrop as fallback
  const poster =
    (stream.stream_icon as string) ||
    (stream.cover as string) ||
    (stream.movie_image as string);
  if (poster) return poster;
  const backdrop = stream.backdrop_path;
  if (Array.isArray(backdrop) && typeof backdrop[0] === "string") return backdrop[0];
  if (typeof backdrop === "string") return backdrop;
  return "";
}

export default function HomePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [selectedSection, setSelectedSection] = useState("vod");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [englishOnly, setEnglishOnly] = useState(true);
  const [yearFilter, setYearFilter] = useState("");
  const [hover, setHover] = useState<HoverState | null>(null);
  const [hoverMeta, setHoverMeta] = useState<Record<string, unknown> | null>(null);
  const [hoverStreamUrl, setHoverStreamUrl] = useState("");
  const [hoverLoading, setHoverLoading] = useState(false);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [seriesDetail, setSeriesDetail] = useState<SeriesState | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hasHover = useHasHover();

  const {
    allCategories,
    streams,
    isLoading,
    status,
    setStatus,
    fetchCategories,
    fetchStreams,
    fetchStreamMetadata,
    fetchSeriesDetails,
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
      setSidebarOpen(false); // close the drawer on mobile after picking a category
      fetchStreams(selectedSection, catId, activeProfile.id);
    },
    [activeProfile, selectedSection, fetchStreams],
  );

  const handleCategoryDoubleClick = useCallback(
    (catId: string) => {
      if (!activeProfile) return;
      setSelectedCategory(catId);
      fetchStreams(selectedSection, catId, activeProfile.id, true);
    },
    [activeProfile, selectedSection, fetchStreams],
  );

  const handleServerChange = useCallback((index: number) => {
    setActiveProfile((prev) =>
      prev ? { ...prev, activeServerIndex: index } : prev,
    );
  }, []);

  const clearHover = useCallback(() => {
    setHover(null);
    setHoverMeta(null);
    setHoverStreamUrl("");
    setHoverLoading(false);
  }, []);

  const doFetchHover = useCallback(
    async (stream: Record<string, unknown>, e: React.MouseEvent) => {
      setHoverMeta(null);
      setHoverStreamUrl("");
      setHoverLoading(true);
      setHover({ stream, mouseX: e.clientX, mouseY: e.clientY });
      if (activeProfile) {
        const metaPromise = fetchStreamMetadata(stream, selectedSection, activeProfile.id);
        const urlPromise = selectedSection === "series"
          ? Promise.resolve({})
          : fetch("/api/stream-url", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                profileId: activeProfile.id,
                stream,
                section: selectedSection,
              }),
            }).then((r) => r.json().catch(() => ({})));
        const [meta, urlRes] = await Promise.all([metaPromise, urlPromise]);
        setHoverMeta(meta);
        setHoverStreamUrl((urlRes as { url?: string })?.url || "");
      }
      setHoverLoading(false);
    },
    [selectedSection, activeProfile, fetchStreamMetadata],
  );

  // Cancel any pending dismiss (mouse is over a tile or the tooltip).
  const cancelClear = useCallback(() => {
    clearTimeout(leaveTimer.current);
  }, []);

  // Schedule a dismiss; a short grace period lets the mouse travel from a tile
  // into the tooltip without it vanishing. Anything else (menu, sidebar, empty
  // space) leaves it unanswered, so the tooltip closes.
  const scheduleClear = useCallback(() => {
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(clearHover, 200);
  }, [clearHover]);

  const handleMouseEnter = useCallback(
    (stream: Record<string, unknown>, e: React.MouseEvent) => {
      if (!hasHover) return; // no hover tooltips on touch devices
      cancelClear();

      if (hover) {
        doFetchHover(stream, e);
      } else {
        hoverTimer.current = setTimeout(() => doFetchHover(stream, e), 400);
      }
    },
    [hasHover, hover, doFetchHover, cancelClear],
  );

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    scheduleClear();
  }, [scheduleClear]);

  const handleTooltipEnter = useCallback(() => {
    cancelClear();
  }, [cancelClear]);

  const handleTooltipLeave = useCallback(() => {
    scheduleClear();
  }, [scheduleClear]);

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
      if (selectedSection === "series") {
        clearHover();
        setSeriesDetail({ stream, details: null, isLoading: true });
        const details = await fetchSeriesDetails(stream, activeProfile.id);
        setSeriesDetail({ stream, details, isLoading: false });
        return;
      }

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
            proxyUrl: data.proxyUrl,
            streamId: String(stream.stream_id ?? stream.id ?? ""),
            title: (stream.name ?? stream.title ?? "Untitled") as string,
          });
        }
      } catch {
        /* ignore */
      }
    },
    [activeProfile, selectedSection, fetchSeriesDetails, clearHover],
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  const filteredStreams = useFilteredStreams(streams, undefined, englishOnly, yearFilter);
  const groupedCategories = useGroupedCategories(
    allCategories[selectedSection] ?? [],
    undefined,
    englishOnly,
  );

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        {activeProfile && (
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
            title="Menu"
            aria-label="Toggle category menu"
          >
            <Menu size={18} />
          </button>
        )}
        <h1 className="text-lg font-semibold">IPTV Player</h1>
        {activeProfile && (
          <>
            <ServerSelector
              profileId={activeProfile.id}
              servers={activeProfile.servers}
              activeServerIndex={activeProfile.activeServerIndex}
              onServerChange={handleServerChange}
            />
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              title="Filter by year in title"
            >
              <option value="">All Years</option>
              {years.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
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
            <CatalogUpdateButtons
              englishOnly={englishOnly}
              profileId={activeProfile.id}
              onStatus={setStatus}
            />
            <span className="text-xs text-gray-400">{status}</span>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <AccountModal profileId={activeProfile?.id} />
          <DbLogModal />
          <StatsModal />
          <ThemeToggle />
        </div>
      </header>
      <div className="relative flex flex-1 overflow-hidden">
        {activeProfile && (
          <>
            {sidebarOpen && (
              <div
                className="fixed inset-0 z-30 bg-black/40 md:hidden"
                onClick={() => setSidebarOpen(false)}
                aria-hidden
              />
            )}
            <Sidebar
              sections={SECTIONS}
              selectedSection={selectedSection}
              onSectionChange={handleSectionChange}
              groupedCategories={groupedCategories}
              selectedCategory={selectedCategory}
              onCategoryClick={handleCategoryClick}
              onCategoryDoubleClick={handleCategoryDoubleClick}
              open={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />
          </>
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
              {filteredStreams.map((stream, index) => {
                const artwork = getArtwork(stream, selectedSection);
                return (
                  <div
                    key={(stream.stream_id as string) ?? (stream.series_id as string) ?? (stream.id as string) ?? index}
                    className="relative cursor-pointer rounded-lg border border-gray-200 bg-white p-2 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                    onMouseEnter={(e) => handleMouseEnter(stream, e)}
                    onMouseLeave={handleMouseLeave}
                    onMouseMove={handleMouseMove}
                    onClick={() => handleStreamClick(stream)}
                  >
                    <div
                      className="flex items-center justify-center overflow-hidden rounded bg-gray-100 dark:bg-gray-700"
                      style={{ aspectRatio: selectedSection === "live" ? "16 / 9" : "2 / 3" }}
                    >
                      {artwork ? (
                        <TileImage
                          src={artwork}
                          className={
                            selectedSection === "live"
                              ? "max-h-full max-w-full object-contain"
                              : "h-full w-full object-cover"
                          }
                        />
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs font-medium">
                      {(stream.name ?? stream.title ?? "Untitled") as string}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {hover && (
        <div onMouseEnter={handleTooltipEnter} onMouseLeave={handleTooltipLeave}>
          <StreamTooltip
            stream={hover.stream}
            streamUrl={hoverStreamUrl}
            metadata={hoverMeta}
            isLoading={hoverLoading}
            mouseX={hover.mouseX}
            mouseY={hover.mouseY}
          />
        </div>
      )}
      {player && (
        <VideoPlayer
          url={player.url}
          proxyUrl={player.proxyUrl}
          title={player.title}
          profileId={activeProfile?.id}
          section={selectedSection}
          streamId={player.streamId}
          onClose={() => setPlayer(null)}
        />
      )}
      {seriesDetail && (
        <SeriesDetailModal
          stream={seriesDetail.stream}
          details={seriesDetail.details}
          isLoading={seriesDetail.isLoading}
          onClose={() => setSeriesDetail(null)}
          onPlayEpisode={async (episode) => {
            if (!activeProfile) return;
            try {
              const res = await fetch("/api/stream-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  profileId: activeProfile.id,
                  stream: episode,
                  section: "episode",
                }),
              });
              const data = await res.json();
              if (data.url) {
                setSeriesDetail(null);
                setPlayer({
                  url: data.url,
                  proxyUrl: data.proxyUrl,
                  streamId: String(episode.id ?? episode.stream_id ?? ""),
                  title: (episode.title ?? episode.name ?? "Episode") as string,
                });
              }
            } catch {
              /* ignore */
            }
          }}
        />
      )}
    </main>
  );
}
