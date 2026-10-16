import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { saveFile } from "@/lib/storage";
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
  const storagePath = await saveFile(data);
  await db.insert(files).values({
    ownerId: Number(session.user.id),
    kind: check.kind,
    title: file.name,
    storagePath,
    size: data.length,
    shareToken,
  });
  return NextResponse.json({ shareToken }, { status: 201 });
}
