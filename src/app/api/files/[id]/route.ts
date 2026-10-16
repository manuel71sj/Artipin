import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { removeFile } from "@/lib/storage";

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
  // 행·댓글·조회 행은 남기고 deleted_at만 기록한다. 본문 파일만 지운다.
  const [deleted] = await db
    .update(files)
    .set({ deletedAt: Date.now() })
    .where(
      and(
        eq(files.id, Number(id)),
        eq(files.ownerId, Number(session.user.id)),
        isNull(files.deletedAt),
      ),
    )
    .returning({ storagePath: files.storagePath });
  if (!deleted)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );

  await removeFile(deleted.storagePath);
  return new NextResponse(null, { status: 204 });
}
