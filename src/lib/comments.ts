import { asc, eq } from "drizzle-orm";
import type { CommentItem } from "@/app/s/[token]/_components/comment-panel";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { relativeTime } from "@/lib/time";

/** 파일의 댓글을 조회해 뷰어가 쓰는 목록으로 조립한다. 서버 렌더와 폴링 응답이 같은 함수를 쓴다(핀 번호·삭제 권한이 갈라지지 않게). */
export async function loadComments(
  fileId: number,
  can: (visitorId: string) => boolean,
) {
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.fileId, fileId))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  let pinNo = 0;
  const items: CommentItem[] = rows
    .filter((c) => c.parentId === null)
    .map((c) => {
      const a = c.anchor as {
        kind?: string;
        x?: number;
        y?: number;
        page?: number;
        selector?: string;
        relX?: number;
        relY?: number;
        quote?: unknown;
      } | null;
      const pin =
        (a?.kind === "image" || (a?.kind === "pdf" && a.page !== undefined)) &&
        a.x !== undefined &&
        a.y !== undefined
          ? { x: a.x, y: a.y, page: a.page }
          : null;
      const htmlPin =
        a?.kind === "html" &&
        a.selector !== undefined &&
        a.relX !== undefined &&
        a.relY !== undefined
          ? {
              selector: a.selector,
              relX: a.relX,
              relY: a.relY,
              ...(typeof a.quote === "string" ? { quote: a.quote } : {}),
            }
          : null;
      return {
        id: c.id,
        authorName: c.authorName,
        isOwner: c.isOwner,
        body: c.body,
        createdLabel: relativeTime(c.createdAt),
        canDelete: can(c.visitorId),
        resolved: c.resolvedAt !== null,
        pin,
        htmlPin,
        pinNo: pin || htmlPin ? ++pinNo : null,
        replies: rows
          .filter((r) => r.parentId === c.id)
          .map((r) => ({
            id: r.id,
            authorName: r.authorName,
            isOwner: r.isOwner,
            body: r.body,
            createdLabel: relativeTime(r.createdAt),
            canDelete: can(r.visitorId),
          })),
      };
    });

  return { rows, items };
}
