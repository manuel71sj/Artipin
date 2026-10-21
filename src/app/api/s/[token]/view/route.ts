import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { views } from "@/db/schema";
import { findViewableFile } from "@/lib/shared-file";
import { getVisitorId } from "@/lib/visitor";

// 뷰어가 로드되면 클라이언트가 1회 호출한다. 파일 소유자 세션의 조회는 기록하지 않는다.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok")
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );

  const { file } = found;
  const session = await auth();
  if (session && Number(session.user.id) === file.ownerId)
    return new NextResponse(null, { status: 204 });

  await db
    .insert(views)
    .values({ fileId: file.id, visitorId: await getVisitorId() })
    .onConflictDoNothing();
  return new NextResponse(null, { status: 204 });
}
