import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// 소유자 세션만 최상위 댓글을 해결/재개할 수 있다. body: { resolved: boolean }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return fail("로그인이 필요합니다.", 401);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail("JSON 형식이 올바르지 않습니다.", 400);
  }
  const resolved = (json as { resolved?: unknown } | null)?.resolved;
  if (typeof resolved !== "boolean")
    return fail("resolved는 boolean이어야 합니다.", 400);

  const { id } = await params;
  const [comment] = await db
    .select({ parentId: comments.parentId, ownerId: files.ownerId })
    .from(comments)
    .innerJoin(files, eq(files.id, comments.fileId))
    .where(and(eq(comments.id, Number(id)), isNull(files.deletedAt)));
  if (!comment) return fail("댓글을 찾을 수 없습니다.", 404);
  if (comment.ownerId !== Number(session.user.id))
    return fail("권한이 없습니다.", 403);
  if (comment.parentId !== null)
    return fail("답글은 해결 처리할 수 없습니다.", 400);

  await db
    .update(comments)
    .set({ resolvedAt: resolved ? Date.now() : null })
    .where(eq(comments.id, Number(id)));
  return new NextResponse(null, { status: 204 });
}
