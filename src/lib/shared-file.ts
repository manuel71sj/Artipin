import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { files } from "@/db/schema";

export type ViewableFile =
  | { status: "ok"; file: typeof files.$inferSelect; viewOnly: boolean }
  | { status: "expired" }
  | { status: "none" };

/**
 * 토큰으로 삭제되지 않은 파일을 찾는다. expires_at이 지났으면 expired. 토큰 경로는 모두 이 함수로 조회한다.
 * 기본은 share_token만 찾는다. 보기 전용 토큰(view_token)은 allowViewToken을 켠 호출부(뷰어·콘텐츠·잠금 해제)만 받고,
 * 나머지(댓글·조회·커서·비교)는 view_token을 404로 돌려 쓰기 경로가 열리지 않는다.
 */
export async function findViewableFile(
  token: string,
  allowViewToken = false,
): Promise<ViewableFile> {
  const [file] = await db
    .select()
    .from(files)
    .where(
      and(
        allowViewToken
          ? or(eq(files.shareToken, token), eq(files.viewToken, token))
          : eq(files.shareToken, token),
        isNull(files.deletedAt),
      ),
    );
  if (!file) return { status: "none" };
  if (file.expiresAt !== null && file.expiresAt <= Date.now())
    return { status: "expired" };
  return { status: "ok", file, viewOnly: file.viewToken === token };
}
