import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const owners = sqliteTable(
  "owners",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    email: text("email"),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("owners_provider_account_unique").on(
      t.provider,
      t.providerAccountId,
    ),
  ],
);

export const files = sqliteTable("files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerId: integer("owner_id")
    .notNull()
    .references(() => owners.id),
  kind: text("kind", { enum: ["image", "html", "pdf", "site"] }).notNull(),
  title: text("title").notNull(),
  storagePath: text("storage_path").notNull(),
  size: integer("size").notNull(),
  shareToken: text("share_token").notNull().unique(),
  // 보기 전용 링크 토큰. 소유자가 만들 때만 생기고(null이면 없음), 뷰어·콘텐츠·잠금 해제만 이 토큰을 받는다.
  viewToken: text("view_token").unique(),
  createdAt: integer("created_at").notNull().default(now),
  deletedAt: integer("deleted_at"),
  replacedAt: integer("replaced_at"),
  // 공개 링크 만료 시각(ms). null이면 만료 없음.
  expiresAt: integer("expires_at"),
  // 링크 비밀번호. scrypt 결과를 "salt:hash"(hex)로 저장한다. null이면 비밀번호 없음.
  passwordHash: text("password_hash"),
  // 종단간 암호화 파일. 저장 본문이 암호문이라 서버는 형식 판정·변환·브리지 주입을 하지 않는다.
  encrypted: integer("encrypted", { mode: "boolean" }).notNull().default(false),
});

export const fileVersions = sqliteTable(
  "file_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fileId: integer("file_id")
      .notNull()
      .references(() => files.id),
    no: integer("no").notNull(),
    storagePath: text("storage_path").notNull(),
    size: integer("size").notNull(),
    title: text("title").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("file_versions_file_no_unique").on(t.fileId, t.no)],
);

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
