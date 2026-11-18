import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";

// open API(/api/v1) 키. 원문은 256비트 난수라 느린 해시 없이 SHA-256(hex)만 저장하고, 인증은 해시 일치 조회 한 번이다.
const hash = (key: string) => createHash("sha256").update(key).digest("hex");

/** 새 키 원문과 저장할 해시를 만든다. 원문은 발급 응답에만 싣는다. */
export function createApiKey(): { key: string; keyHash: string } {
  const key = `artipin_${randomBytes(32).toString("base64url")}`;
  return { key, keyHash: hash(key) };
}

/** `Authorization: Bearer artipin_…` 헤더의 키가 가리키는 소유자 id. 헤더가 없거나 형식이 다르거나 폐기된 키면 null. 세션 쿠키는 보지 않는다. */
export async function ownerIdFromKey(request: Request): Promise<number | null> {
  const match = /^Bearer (artipin_[A-Za-z0-9_-]{43})$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) return null;
  const [row] = await db
    .select({ ownerId: apiKeys.ownerId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash(match[1])));
  return row?.ownerId ?? null;
}
