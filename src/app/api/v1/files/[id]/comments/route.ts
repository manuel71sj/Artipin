import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { ownerIdFromKey } from "@/lib/api-key";
import { loadComments } from "@/lib/comments";
import { pathId } from "@/lib/path-id";

// open API: 파일의 모든 댓글(핀 댓글·핀 없는 댓글)과 답글을 돌려준다.
// 소유자 권한으로 읽으므로 링크의 비밀번호·만료와 무관하다. 방문자 식별자(visitorId)는 싣지 않는다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null)
    return NextResponse.json(
      { error: "API 키가 필요합니다." },
      { status: 401 },
    );

  const { id } = await params;
  const [file] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.id, pathId(id)),
        manageable(ownerId),
        isNull(files.deletedAt),
      ),
    );
  if (!file)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );

  // 핀 번호는 화면과 같아야 하므로 loadComments가 매긴 값을 쓴다.
  const { rows, items } = await loadComments(file.id, () => true);
  const pinNo = new Map(items.map((c) => [c.id, c.pinNo]));
  return NextResponse.json({
    items: rows
      .filter((c) => c.parentId === null)
      .map((c) => ({
        id: c.id,
        pinNo: pinNo.get(c.id) ?? null,
        authorName: c.authorName,
        isOwner: c.isOwner,
        body: c.body,
        resolved: c.resolvedAt !== null,
        createdAt: c.createdAt,
        anchor: c.anchor ?? null,
        replies: rows
          .filter((r) => r.parentId === c.id)
          .map((r) => ({
            id: r.id,
            authorName: r.authorName,
            isOwner: r.isOwner,
            body: r.body,
            createdAt: r.createdAt,
          })),
      })),
  });
}
