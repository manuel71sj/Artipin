import { and, eq, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";
import { canManage } from "@/lib/access";
import { readVisitorId } from "@/lib/visitor";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// 파일 소유자(팀 파일이면 팀 멤버) 세션은 모든 댓글을, 방문자는 쿠키가 작성 당시 visitor_id와 같은 본인 댓글만 지운다.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const commentId = Number(id);
  const [row] = await db
    .select({
      visitorId: comments.visitorId,
      ownerId: files.ownerId,
      teamId: files.teamId,
    })
    .from(comments)
    .innerJoin(files, eq(files.id, comments.fileId))
    .where(and(eq(comments.id, commentId), isNull(files.deletedAt)));
  if (!row) return fail("댓글을 찾을 수 없습니다.", 404);

  const session = await auth();
  const cookieId = await readVisitorId();
  const allowed =
    (await canManage(session, row)) ||
    (cookieId !== null && cookieId === row.visitorId);
  if (!allowed) return fail("권한이 없습니다.", 403);

  // 한 문장이라 원자적이다. 답글은 같은 파일의 최상위에만 달리므로 답글 id로는 parent_id가 0행이다.
  await db
    .delete(comments)
    .where(or(eq(comments.id, commentId), eq(comments.parentId, commentId)));
  return new NextResponse(null, { status: 204 });
}
