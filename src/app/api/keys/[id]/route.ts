import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { pathId } from "@/lib/path-id";

// 내 API 키를 폐기한다(행 삭제). 세션으로만 부를 수 있다.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const { id } = await params;
  // 키의 소유 확인이다. 파일 권한(access.ts)과 달리 팀원끼리 키를 공유하지 않는다.
  const [deleted] = await db
    .delete(apiKeys)
    .where(
      and(
        eq(apiKeys.id, pathId(id)),
        eq(apiKeys.ownerId, Number(session.user.id)),
      ),
    )
    .returning({ id: apiKeys.id });
  if (!deleted)
    return NextResponse.json(
      { error: "키를 찾을 수 없습니다." },
      { status: 404 },
    );
  return new NextResponse(null, { status: 204 });
}
