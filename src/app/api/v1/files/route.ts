import { and, desc, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { ownerIdFromKey } from "@/lib/api-key";
import { createFile, fileJson } from "@/lib/files";
import { checkUpload } from "@/lib/upload";

// open API: API 키(Bearer)로만 인증한다. 세션 쿠키는 보지 않는다.

// 파일을 등록한다. multipart의 file 필드만 읽는다(암호화 업로드는 지원하지 않는다).
export async function POST(request: Request) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null)
    return NextResponse.json(
      { error: "API 키가 필요합니다." },
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

  const check = checkUpload(file.name, Buffer.from(await file.arrayBuffer()));
  if (!check.ok)
    return NextResponse.json({ error: check.error }, { status: 400 });

  const created = await createFile(ownerId, {
    title: file.name,
    kind: check.kind,
    body: check.body,
    encrypted: false,
  });
  if (!created.ok)
    return NextResponse.json({ error: created.error }, { status: 400 });
  return NextResponse.json(fileJson(created.file), { status: 201 });
}

// 관리할 수 있는 파일(내가 올린 파일과 소속 팀의 파일)을 최신순으로 돌려준다.
export async function GET(request: Request) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null)
    return NextResponse.json(
      { error: "API 키가 필요합니다." },
      { status: 401 },
    );

  const rows = await db
    .select()
    .from(files)
    .where(and(manageable(ownerId), isNull(files.deletedAt)))
    .orderBy(desc(files.createdAt), desc(files.id));
  return NextResponse.json({ items: rows.map(fileJson) });
}
