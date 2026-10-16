import { readFileSync } from "node:fs";
import { sqlite } from "../src/db";

console.table(
  sqlite.prepare(readFileSync("scripts/metrics.sql", "utf8")).all(),
);
