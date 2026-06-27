import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  serverUrl: text("server_url").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  favorites: jsonb("favorites").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
