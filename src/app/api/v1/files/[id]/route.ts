import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { isRecord } from "@/lib/anchor";
import { ownerIdFromKey } from "@/lib/api-key";
import { deleteFile, fileJson, replaceFile } from "@/lib/files";
import { hashPassword } from "@/lib/unlock";

// open API: API 키(Bearer)로만 인증한다. 세션 쿠키는 보지 않는다.

type Context = { params: Promise<{ id: string }> };

const unauthorized = () =>
  NextResponse.json({ error: "API 키가 필요합니다." }, { status: 401 });
const notFound = () =>
  NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });

export async function GET(request: Request, { params }: Context) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null) return unauthorized();

  const { id } = await params;
  const [row] = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, Number(id)),
        manageable(ownerId),
        isNull(files.deletedAt),
      ),
    );
  if (!row) return notFound();
  return NextResponse.json(fileJson(row));
}

// 본문을 교체한다. url·댓글은 그대로 남고 title은 새 파일명이 된다.
export async function PUT(request: Request, { params }: Context) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null) return unauthorized();

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
  const replaced = await replaceFile(ownerId, Number(id), file.name, data);
  if (!replaced.ok)
    return NextResponse.json(
      { error: replaced.error },
      { status: replaced.status },
    );
  return NextResponse.json(fileJson(replaced.file));
}

export async function DELETE(request: Request, { params }: Context) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null) return unauthorized();

  const { id } = await params;
  if (!(await deleteFile(ownerId, Number(id)))) return notFound();
  return new NextResponse(null, { status: 204 });
}

// 공개 링크 속성을 정한다. 한 요청에 expiresInDays(1·7·30, null이면 해제) 또는 password(1~100자, null이면 해제) 하나만 받는다.
// 팀 이동(teamId)은 받지 않는다(화면에서만 한다).
export async function PATCH(request: Request, { params }: Context) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null) return unauthorized();

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body))
    return NextResponse.json(
      { error: "본문은 JSON 객체여야 합니다." },
      { status: 400 },
    );
  // 필드 유무는 키가 있는지로 가른다. 값이 null이면 해제다.
  const pw = body.password;
  const days = body.expiresInDays;
  // 다른 필드(teamId 등)가 섞여 있으면 무시하고 성공으로 답하지 않는다.
  if (
    (pw !== undefined) === (days !== undefined) ||
    Object.keys(body).length !== 1
  )
    return NextResponse.json(
      { error: "expiresInDays와 password 중 하나만 보내야 합니다." },
      { status: 400 },
    );

  let change: { passwordHash: string | null } | { expiresAt: number | null };
  if (pw !== undefined) {
    if (
      pw !== null &&
      (typeof pw !== "string" || pw.length < 1 || pw.length > 100)
    )
      return NextResponse.json(
        { error: "password는 1~100자 문자열 또는 null이어야 합니다." },
        { status: 400 },
      );
    change = { passwordHash: pw === null ? null : await hashPassword(pw) };
  } else {
    if (days !== null && days !== 1 && days !== 7 && days !== 30)
      return NextResponse.json(
        { error: "expiresInDays는 1, 7, 30 또는 null이어야 합니다." },
        { status: 400 },
      );
    change = {
      expiresAt: days === null ? null : Date.now() + days * 86_400_000,
    };
  }

  const { id } = await params;
  const [updated] = await db
    .update(files)
    .set(change)
    .where(
      and(
        eq(files.id, Number(id)),
        manageable(ownerId),
        isNull(files.deletedAt),
      ),
    )
    .returning();
  if (!updated) return notFound();
  return NextResponse.json(fileJson(updated));
}
