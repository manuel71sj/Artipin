import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

export const dataDir = resolve(process.env.DATA_DIR ?? "./data");
export const uploadsDir = join(dataDir, "uploads");

mkdirSync(uploadsDir, { recursive: true });

const sqlite = new Database(join(dataDir, "app.db"));
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
