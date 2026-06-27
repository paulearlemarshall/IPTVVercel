"use client";

import { X } from "lucide-react";

interface SeriesDetailModalProps {
  stream: Record<string, unknown>;
  details: Record<string, unknown> | null;
  isLoading: boolean;
  onClose: () => void;
}

function getText(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getInfo(stream: Record<string, unknown>, details: Record<string, unknown> | null) {
  const rawInfo = details?.info;
  return rawInfo && typeof rawInfo === "object" && !Array.isArray(rawInfo)
    ? rawInfo as Record<string, unknown>
    : stream;
}

function getBackdrop(stream: Record<string, unknown>, info: Record<string, unknown>) {
  const detailBackdrop = info.backdrop_path;
  if (Array.isArray(detailBackdrop) && typeof detailBackdrop[0] === "string") {
    return detailBackdrop[0];
  }
  if (typeof detailBackdrop === "string") return detailBackdrop;

  const streamBackdrop = stream.backdrop_path;
  if (Array.isArray(streamBackdrop) && typeof streamBackdrop[0] === "string") {
    return streamBackdrop[0];
  }
  if (typeof streamBackdrop === "string") return streamBackdrop;

  return getText(info.cover) || getText(stream.cover) || getText(stream.stream_icon);
}

function getEpisodes(details: Record<string, unknown> | null) {
  const rawEpisodes = details?.episodes;
  if (!rawEpisodes || typeof rawEpisodes !== "object" || Array.isArray(rawEpisodes)) return [];

  return Object.entries(rawEpisodes as Record<string, unknown>)
    .map(([season, episodes]) => ({
      season,
      episodes: Array.isArray(episodes)
        ? episodes.filter((episode): episode is Record<string, unknown> => Boolean(episode) && typeof episode === "object" && !Array.isArray(episode))
        : [],
    }))
    .filter((group) => group.episodes.length > 0)
    .sort((a, b) => Number(a.season) - Number(b.season));
}

function getSeasonInfo(details: Record<string, unknown> | null) {
  const rawSeasons = details?.seasons;
  if (!Array.isArray(rawSeasons)) return new Map<string, Record<string, unknown>>();

  return new Map(
    rawSeasons
      .filter((season): season is Record<string, unknown> => Boolean(season) && typeof season === "object" && !Array.isArray(season))
      .map((season, index) => [
        String(season.season_number ?? season.number ?? season.season ?? index + 1),
        season,
      ]),
  );
}

function episodeTitle(episode: Record<string, unknown>, index: number) {
  return getText(episode.title) || getText(episode.name) || `Episode ${index + 1}`;
}

function episodeNumber(episode: Record<string, unknown>, index: number) {
  const value = episode.episode_num ?? episode.episode_number ?? episode.num;
  return typeof value === "number" || typeof value === "string" ? String(value) : String(index + 1);
}

export default function SeriesDetailModal({
  stream,
  details,
  isLoading,
  onClose,
}: SeriesDetailModalProps) {
  const info = getInfo(stream, details);
  const backdrop = getBackdrop(stream, info);
  const name = getText(info.name) || getText(stream.name) || "Untitled Series";
  const plot = getText(info.plot) || getText(stream.plot);
  const genre = getText(info.genre) || getText(stream.genre);
  const rating = getText(info.rating) || getText(stream.rating);
  const releaseDate = getText(info.releaseDate) || getText(info.release_date) || getText(stream.releaseDate) || getText(stream.release_date);
  const groups = getEpisodes(details);
  const seasonInfo = getSeasonInfo(details);

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white">
      {backdrop && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url("${backdrop.replace(/"/g, "%22")}")` }}
        />
      )}
      <div className="absolute inset-0 bg-black/70" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black to-transparent" />

      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
        title="Close"
      >
        <X size={24} />
      </button>

      <div className="relative z-10 flex h-full flex-col overflow-hidden">
        <div className="max-w-5xl px-6 pt-16 sm:px-10">
          <h2 className="max-w-4xl text-3xl font-bold sm:text-5xl">{name}</h2>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-200">
            {releaseDate && <span>{releaseDate.split("-")[0]}</span>}
            {genre && <span>{genre}</span>}
            {rating && <span>Rating {rating}</span>}
          </div>
          {plot && (
            <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-100 sm:text-base">
              {plot}
            </p>
          )}
        </div>

        <div className="mt-6 flex-1 overflow-y-auto px-6 pb-8 sm:px-10">
          {isLoading ? (
            <div className="rounded border border-white/15 bg-black/45 p-4 text-sm text-gray-200">
              Loading seasons...
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded border border-white/15 bg-black/45 p-4 text-sm text-gray-200">
              No episode information available.
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group) => (
                <section key={group.season} className="rounded border border-white/15 bg-black/50 p-4 backdrop-blur-sm">
                  <div className="mb-3">
                    <h3 className="text-lg font-semibold">
                      {getText(seasonInfo.get(group.season)?.name) || `Season ${group.season}`}
                    </h3>
                    <div className="mt-1 text-xs text-gray-300">
                      {group.episodes.length} episodes
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {group.episodes.map((episode, index) => (
                      <div
                        key={getText(episode.id) || `${group.season}-${index}`}
                        className="rounded border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="text-[11px] uppercase tracking-wide text-gray-400">
                          Episode {episodeNumber(episode, index)}
                        </div>
                        <div className="mt-0.5 text-sm font-medium text-white">
                          {episodeTitle(episode, index)}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
