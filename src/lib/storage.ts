import { randomUUID } from "node:crypto";
import { mkdir, readFile as read, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { uploadsDir } from "@/db";

/** 본문을 저장하고 `files.storage_path`에 넣을 파일명을 돌려준다. */
export async function saveFile(data: Buffer): Promise<string> {
  const name = randomUUID();
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, name), data);
  return name;
}

export function readFile(storagePath: string): Promise<Buffer> {
  return read(join(uploadsDir, storagePath));
}

export function removeFile(storagePath: string): Promise<void> {
  return rm(join(uploadsDir, storagePath), { force: true });
}
