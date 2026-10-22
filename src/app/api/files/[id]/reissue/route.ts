import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";

// 댓글 링크만 끊는다: share_token만 새로 만든다. view_token(보기 전용 링크)과 파일·댓글·조회 기록은 그대로 남는다.
export async function POST(
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
  const shareToken = randomBytes(16).toString("base64url");
  const [updated] = await db
    .update(files)
    .set({ shareToken })
    .where(
      and(
        eq(files.id, Number(id)),
        manageable(Number(session.user.id)),
        isNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });
  if (!updated)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return NextResponse.json({ shareToken });
}
