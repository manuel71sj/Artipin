import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files, fileVersions } from "@/db/schema";
import { saveUpload } from "@/lib/storage";
import { checkUpload } from "@/lib/upload";

export async function POST(request: Request) {
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

  const shareToken = randomBytes(16).toString("base64url");
  const saved = await saveUpload(check.kind, check.body);
  if (!saved.ok)
    return NextResponse.json({ error: saved.error }, { status: 400 });
  const { storagePath } = saved;
  // 현재 본문 = 최대 no 버전이라는 불변식을 지키려고 files와 no=1 행을 한 트랜잭션에 만든다.
  db.transaction((tx) => {
    const { id } = tx
      .insert(files)
      .values({
        ownerId: Number(session.user.id),
        kind: check.kind,
        title: file.name,
        storagePath,
        size: check.body.length,
        shareToken,
      })
      .returning({ id: files.id })
      .get();
    tx.insert(fileVersions)
      .values({
        fileId: id,
        no: 1,
        storagePath,
        size: check.body.length,
        title: file.name,
      })
      .run();
  });
  return NextResponse.json({ shareToken }, { status: 201 });
}
