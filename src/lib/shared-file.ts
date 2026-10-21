import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";

export type ViewableFile =
  | { status: "ok"; file: typeof files.$inferSelect }
  | { status: "expired" }
  | { status: "none" };

/** share_token으로 삭제되지 않은 파일을 찾는다. expires_at이 지났으면 expired. 토큰 경로는 모두 이 함수로 조회한다. */
export async function findViewableFile(token: string): Promise<ViewableFile> {
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.shareToken, token), isNull(files.deletedAt)));
  if (!file) return { status: "none" };
  if (file.expiresAt !== null && file.expiresAt <= Date.now())
    return { status: "expired" };
  return { status: "ok", file };
}
