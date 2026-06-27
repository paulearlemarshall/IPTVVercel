import { db } from "@/lib/db";
import { profiles } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { buildApiUrl } from "@/lib/xc";
import { writeCachedXcData } from "@/lib/xc-db-cache";
import { recordCacheMetric } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SECTIONS = ["live", "vod", "series"] as const;
type Section = (typeof SECTIONS)[number];

const ACTIONS: Record<Section, { categories: string; streams: string }> = {
  live: { categories: "get_live_categories", streams: "get_live_streams" },
  vod: { categories: "get_vod_categories", streams: "get_vod_streams" },
  series: { categories: "get_series_categories", streams: "get_series" },
};

const EN_CATEGORY_PREFIXES = [
  "EN", "UK", "US", "GB", "CA", "MULTI", "NETFLIX", "APPLE+", "DISNEY+",
  "4K", "18", "24/7", "CHRISTMAS", "FORMULA", "FOR", "WORLDCUP", "BEIN",
  "WC", "NZ", "AU",
];

const NON_ENGLISH_STREAM_MARKERS = [
  "SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH",
  "ITALIAN", "SPANISH",
];

async function fetchXc<T>(
  serverUrl: string,
  action: string,
  username: string,
  password: string,
  params?: Record<string, string>,
): Promise<T> {
  const res = await fetch(buildApiUrl(serverUrl, action, username, password, params), {
    signal: AbortSignal.timeout(30_000),
  });
  await recordCacheMetric("upstream");
  if (!res.ok) throw new Error(`${action || "account"} returned ${res.status}`);
  return res.json() as Promise<T>;
}

function normalizeSections(value: unknown): Section[] {
  if (value === "all") return [...SECTIONS];
  return SECTIONS.includes(value as Section) ? [value as Section] : [];
}

function categoryName(category: Record<string, unknown>) {
  return String(category.category_name ?? category.name ?? category.category_id ?? "Unknown category");
}

function isEnglishCategory(category: Record<string, unknown>) {
  const cleanName = categoryName(category).toUpperCase().replace(/^[|\s]+/, "");
  return EN_CATEGORY_PREFIXES.some(
    (word) =>
      cleanName.startsWith(`${word}|`) ||
      cleanName.startsWith(`${word} `) ||
      cleanName === word,
  );
}

function isEnglishStream(stream: Record<string, unknown>) {
  const name = String(stream.name ?? stream.title ?? "").toUpperCase();
  return !NON_ENGLISH_STREAM_MARKERS.some((word) => name.includes(word));
}

function writeEvent(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: Record<string, unknown>) {
  controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const { profileId, section, englishOnly } = await request.json();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          const sections = normalizeSections(section);
          if (!profileId || sections.length === 0) {
            writeEvent(controller, encoder, { type: "error", message: "Invalid update request" });
            controller.close();
            return;
          }

          const [profile] = await db
            .select()
            .from(profiles)
            .where(eq(profiles.id, profileId));

          if (!profile) {
            writeEvent(controller, encoder, { type: "error", message: "Profile not found" });
            controller.close();
            return;
          }

          const serverUrl = profile.servers[profile.activeServerIndex];
          if (!serverUrl) {
            writeEvent(controller, encoder, { type: "error", message: "No server configured" });
            controller.close();
            return;
          }

          const summary: Record<string, { categories: number; streams: number; failures: number }> = {};

          for (const current of sections) {
            const actions = ACTIONS[current];
            writeEvent(controller, encoder, { type: "section", section: current, message: `Fetching ${current} categories` });
            const categories = await fetchXc<Record<string, unknown>[]>(
              serverUrl,
              actions.categories,
              profile.username,
              profile.password,
            );
            const allCategoryRows = Array.isArray(categories) ? categories : [];
            const categoryRows = englishOnly
              ? allCategoryRows.filter(isEnglishCategory)
              : allCategoryRows;
            await writeCachedXcData(
              { profileId, serverUrl, action: actions.categories },
              categoryRows,
            );
            writeEvent(controller, encoder, {
              type: "categories",
              section: current,
              totalCategories: categoryRows.length,
              message: englishOnly
                ? `${current}: ${categoryRows.length}/${allCategoryRows.length} EN categories`
                : `${current}: ${categoryRows.length} categories`,
            });

            let streamCount = 0;
            let failures = 0;
            for (const [index, category] of categoryRows.entries()) {
              const categoryId = String(category.category_id ?? "");
              if (!categoryId) continue;
              const name = categoryName(category);
              writeEvent(controller, encoder, {
                type: "category",
                section: current,
                index: index + 1,
                totalCategories: categoryRows.length,
                categoryId,
                categoryName: name,
                message: `${current} ${index + 1}/${categoryRows.length}: ${name}`,
              });
              try {
                const streams = await fetchXc<Record<string, unknown>[]>(
                  serverUrl,
                  actions.streams,
                  profile.username,
                  profile.password,
                  { category_id: categoryId },
                );
                const allStreamRows = Array.isArray(streams) ? streams : [];
                const streamRows = englishOnly
                  ? allStreamRows.filter(isEnglishStream)
                  : allStreamRows;
                streamCount += streamRows.length;
                await writeCachedXcData(
                  { profileId, serverUrl, action: actions.streams, params: { category_id: categoryId } },
                  streamRows,
                );
                writeEvent(controller, encoder, {
                  type: "categoryDone",
                  section: current,
                  index: index + 1,
                  totalCategories: categoryRows.length,
                  categoryId,
                  categoryName: name,
                  streams: streamRows.length,
                  message: `${current} ${index + 1}/${categoryRows.length}: ${name} (${streamRows.length} streams)`,
                });
              } catch (error) {
                failures += 1;
                writeEvent(controller, encoder, {
                  type: "categoryError",
                  section: current,
                  index: index + 1,
                  totalCategories: categoryRows.length,
                  categoryId,
                  categoryName: name,
                  message: error instanceof Error ? error.message : "Category update failed",
                });
              }
            }

            summary[current] = {
              categories: categoryRows.length,
              streams: streamCount,
              failures,
            };
          }

          writeEvent(controller, encoder, { type: "done", success: true, summary });
          controller.close();
        } catch (error) {
          writeEvent(controller, encoder, {
            type: "error",
            message: error instanceof Error ? error.message : "Catalogue update failed",
          });
          controller.close();
        }
      },
    }),
    {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    },
  );
}
