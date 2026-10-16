import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const owners = sqliteTable("owners", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
});

export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owners.id),
  kind: text("kind", { enum: ["image", "html"] }).notNull(),
  title: text("title").notNull(),
  storagePath: text("storage_path").notNull(),
  size: integer("size").notNull(),
  shareToken: text("share_token").notNull().unique(),
  createdAt: integer("created_at").notNull().default(now),
  deletedAt: integer("deleted_at"),
});

export const comments = sqliteTable(
  "comments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id),
    parentId: integer("parent_id"),
    authorName: text("author_name").notNull(),
    visitorId: text("visitor_id").notNull(),
    isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
    body: text("body").notNull(),
    anchor: text("anchor", { mode: "json" }),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("comments_file_idx").on(t.fileId)],
);

export const views = sqliteTable(
  "views",
  {
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id),
    visitorId: text("visitor_id").notNull(),
    firstSeenAt: integer("first_seen_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.fileId, t.visitorId] })],
);
