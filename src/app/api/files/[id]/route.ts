import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable, myTeams } from "@/lib/access";
import { deleteFile, replaceFile } from "@/lib/files";
import { pathId } from "@/lib/path-id";
import { hashPassword, isLinkPassword } from "@/lib/unlock";

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
  if (!(await deleteFile(Number(session.user.id), pathId(id))))
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return new NextResponse(null, { status: 204 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    // proxyClientMaxBodySize를 넘으면 본문이 잘려 파싱에 실패한다.
    return NextResponse.json(
      { error: "요청이 너무 크거나 올바르지 않습니다." },
      { status: 413 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const data = Buffer.from(await file.arrayBuffer());
  const { id } = await params;
  const replaced = await replaceFile(
    Number(session.user.id),
    pathId(id),
    file.name,
    data,
  );
  if (!replaced.ok)
    return NextResponse.json(
      { error: replaced.error },
      { status: replaced.status },
    );
  return new NextResponse(null, { status: 204 });
}

// 공개 링크 속성을 정한다. password(줄바꿈 없는 1~100자, null이면 해제)가 있으면 비밀번호를, teamId(정수 또는 null)가 있으면 소속 팀을, 아니면 만료 시각을 정한다. 만료는 프리셋(1·7·30일)만 받고 null이면 없앤다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const body = await request.json().catch(() => null);
  const { id } = await params;
  const owned = and(
    eq(files.id, pathId(id)),
    manageable(Number(session.user.id)),
    isNull(files.deletedAt),
  );

  if (body?.password !== undefined) {
    const pw = body.password;
    if (pw !== null && !isLinkPassword(pw))
      return NextResponse.json(
        {
          error:
            "password는 줄바꿈 없는 1~100자 문자열 또는 null이어야 합니다.",
        },
        { status: 400 },
      );
    const [changed] = await db
      .update(files)
      .set({ passwordHash: pw === null ? null : await hashPassword(pw) })
      .where(owned)
      .returning({ id: files.id });
    if (!changed)
      return NextResponse.json(
        { error: "파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    return new NextResponse(null, { status: 204 });
  }

  if (body?.teamId !== undefined) {
    const teamId = body.teamId;
    if (teamId !== null && !Number.isInteger(teamId))
      return NextResponse.json(
        { error: "teamId는 정수 또는 null이어야 합니다." },
        { status: 400 },
      );
    // 관리할 수 있는 파일을 내가 속한 팀으로 옮기거나(null이면 개인으로) 되돌린다. 한 문장이라 원자적이다.
    // 팀으로 옮기는 것은 개인 파일만이다. 개인 파일은 owned가 본인 파일만 통과시키므로, 팀원이 남의 팀 파일을 다른 팀으로 옮길 수 없다.
    const [moved] = await db
      .update(files)
      .set({ teamId })
      .where(
        teamId === null
          ? owned
          : and(
              owned,
              isNull(files.teamId),
              inArray(sql`${teamId}`, myTeams(Number(session.user.id))),
            ),
      )
      .returning({ id: files.id });
    if (!moved)
      return NextResponse.json(
        { error: "파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    return new NextResponse(null, { status: 204 });
  }

  const days = body?.expiresInDays;
  if (days !== null && days !== 1 && days !== 7 && days !== 30)
    return NextResponse.json(
      { error: "expiresInDays는 1, 7, 30 또는 null이어야 합니다." },
      { status: 400 },
    );

  const [updated] = await db
    .update(files)
    .set({ expiresAt: days === null ? null : Date.now() + days * 86_400_000 })
    .where(owned)
    .returning({ id: files.id });
  if (!updated)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return new NextResponse(null, { status: 204 });
}
