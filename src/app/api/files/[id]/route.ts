import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files, fileVersions } from "@/db/schema";
import { removeFile, saveUpload } from "@/lib/storage";
import { hashPassword } from "@/lib/unlock";
import { checkUpload } from "@/lib/upload";

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
  // 행·댓글·조회 행은 남기고 deleted_at만 기록한다. 모든 버전의 본문 파일을 지운다.
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
    .returning({ id: files.id });
  if (!deleted)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );

  // 롤백 행은 이전 버전과 같은 storage_path를 가리키므로 중복을 걷어낸다.
  const paths = await db
    .selectDistinct({ storagePath: fileVersions.storagePath })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, deleted.id));
  await Promise.all(paths.map((p) => removeFile(p.storagePath)));
  return new NextResponse(null, { status: 204 });
}

// 같은 행의 본문만 바꾼다. share_token·댓글·조회 기록은 files.id에 묶여 그대로 남고, 이전 본문은 버전으로 보관한다.
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
  const check = checkUpload(file.name, data);
  if (!check.ok)
    return NextResponse.json({ error: check.error }, { status: 400 });

  const { id } = await params;
  const [row] = await db
    .select({ kind: files.kind })
    .from(files)
    .where(
      and(
        eq(files.id, Number(id)),
        eq(files.ownerId, Number(session.user.id)),
        isNull(files.deletedAt),
      ),
    );
  if (!row)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  // 이미지 앵커는 0~1 좌표, PDF 앵커는 페이지+좌표, HTML 앵커는 선택자라 종류가 바뀌면 기존 핀이 의미를 잃는다.
  if (check.kind !== row.kind)
    return NextResponse.json(
      { error: "같은 종류의 파일로만 교체할 수 있습니다." },
      { status: 400 },
    );

  // 새 파일을 먼저 저장하고 버전 행 추가와 행 갱신을 한 트랜잭션에 묶는다. 갱신 전까지는 이전 본문이 서빙된다.
  const saved = await saveUpload(check.kind, check.body);
  if (!saved.ok)
    return NextResponse.json({ error: saved.error }, { status: 400 });
  const { storagePath } = saved;
  db.transaction((tx) => {
    tx.insert(fileVersions)
      .values({
        fileId: Number(id),
        no: sql<number>`(select max(${fileVersions.no}) + 1 from ${fileVersions} where ${fileVersions.fileId} = ${Number(id)})`,
        storagePath,
        size: check.body.length,
        title: file.name,
      })
      .run();
    tx.update(files)
      .set({
        storagePath,
        size: check.body.length,
        title: file.name,
        replacedAt: Date.now(),
      })
      .where(eq(files.id, Number(id)))
      .run();
  });
  return new NextResponse(null, { status: 204 });
}

// 공개 링크 속성을 정한다. password(1~100자, null이면 해제)가 있으면 비밀번호를, 아니면 만료 시각을 정한다. 만료는 프리셋(1·7·30일)만 받고 null이면 없앤다.
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
    eq(files.id, Number(id)),
    eq(files.ownerId, Number(session.user.id)),
    isNull(files.deletedAt),
  );

  if (body?.password !== undefined) {
    const pw = body.password;
    if (
      pw !== null &&
      (typeof pw !== "string" || pw.length < 1 || pw.length > 100)
    )
      return NextResponse.json(
        { error: "password는 1~100자 문자열 또는 null이어야 합니다." },
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
