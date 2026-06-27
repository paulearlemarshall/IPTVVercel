import { integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  servers: jsonb("servers").$type<string[]>().notNull().default([]),
  activeServerIndex: integer("active_server_index").notNull().default(0),
  username: text("username").notNull(),
  password: text("password").notNull(),
  favorites: jsonb("favorites").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const xcCategories = pgTable(
  "xc_categories",
  {
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    section: text("section").notNull(),
    categoryId: text("category_id").notNull(),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.serverUrl, table.section, table.categoryId],
    }),
  }),
);

export const xcStreams = pgTable(
  "xc_streams",
  {
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    section: text("section").notNull(),
    categoryId: text("category_id").notNull(),
    streamId: text("stream_id").notNull(),
    name: text("name").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.serverUrl, table.section, table.categoryId, table.streamId],
    }),
  }),
);

export const xcStreamMetadata = pgTable(
  "xc_stream_metadata",
  {
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    section: text("section").notNull(),
    streamId: text("stream_id").notNull(),
    info: jsonb("info").$type<Record<string, unknown>>().notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.serverUrl, table.section, table.streamId],
    }),
  }),
);

export const xcSeriesEpisodes = pgTable(
  "xc_series_episodes",
  {
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    seriesId: text("series_id").notNull(),
    seasonNumber: integer("season_number").notNull(),
    episodeId: text("episode_id").notNull(),
    episodeNum: integer("episode_num"),
    title: text("title").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.serverUrl, table.seriesId, table.seasonNumber, table.episodeId],
    }),
  }),
);

export const xcSeriesSeasons = pgTable(
  "xc_series_seasons",
  {
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    serverUrl: text("server_url").notNull(),
    seriesId: text("series_id").notNull(),
    seasonNumber: integer("season_number").notNull(),
    name: text("name").notNull(),
    episodeCount: integer("episode_count"),
    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.profileId, table.serverUrl, table.seriesId, table.seasonNumber],
    }),
  }),
);
