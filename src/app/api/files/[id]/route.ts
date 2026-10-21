import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { removeFile, saveFile } from "@/lib/storage";
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

// 같은 행의 본문만 바꾼다. share_token·댓글·조회 기록은 files.id에 묶여 그대로 남는다.
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
    .select({ kind: files.kind, storagePath: files.storagePath })
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
  // 이미지 앵커는 0~1 좌표, HTML 앵커는 선택자라 종류가 바뀌면 기존 핀이 의미를 잃는다.
  if (check.kind !== row.kind)
    return NextResponse.json(
      { error: "같은 종류의 파일로만 교체할 수 있습니다." },
      { status: 400 },
    );

  // 새 파일을 먼저 저장하고 행을 갱신한 뒤 이전 파일을 지운다. 갱신 전까지는 이전 본문이 서빙된다.
  const storagePath = await saveFile(data);
  await db
    .update(files)
    .set({
      storagePath,
      size: data.length,
      title: file.name,
      replacedAt: Date.now(),
    })
    .where(eq(files.id, Number(id)));
  await removeFile(row.storagePath);
  return new NextResponse(null, { status: 204 });
}
