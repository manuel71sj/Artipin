import { randomBytes } from "node:crypto";
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";

// 보기 전용 링크(view_token)를 만들거나 끊는다. 댓글 링크(share_token)는 건드리지 않는다.
// 결과 view_token을 돌려주고, 로그인·소유권이 맞지 않으면 오류 응답을 돌려준다.
async function setViewToken(
  params: Promise<{ id: string }>,
  viewToken: SQL | null,
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const { id } = await params;
  const [updated] = await db
    .update(files)
    .set({ viewToken })
    .where(
      and(
        eq(files.id, Number(id)),
        eq(files.ownerId, Number(session.user.id)),
        isNull(files.deletedAt),
      ),
    )
    .returning({ viewToken: files.viewToken });
  if (!updated)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return updated;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // 이미 있으면 그대로 둔다. 다른 탭의 오래된 "만들기"가 공유한 링크를 끊지 않게 한다.
  const fresh = randomBytes(16).toString("base64url");
  const result = await setViewToken(
    params,
    sql`coalesce(${files.viewToken}, ${fresh})`,
  );
  return result instanceof NextResponse
    ? result
    : NextResponse.json({ viewToken: result.viewToken });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await setViewToken(params, null);
  return result instanceof NextResponse
    ? result
    : new NextResponse(null, { status: 204 });
}
