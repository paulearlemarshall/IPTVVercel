import { pgTable, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

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
