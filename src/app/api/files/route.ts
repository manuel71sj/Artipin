import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createFile } from "@/lib/files";
import { checkEncryptedUpload, checkUpload } from "@/lib/upload";

export async function POST(request: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  let file: FormDataEntryValue | null;
  let form: FormData;
  try {
    form = await request.formData();
    file = form.get("file");
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
  // 암호화 업로드는 본문이 암호문이라 형식을 판정하지 못한다. 브라우저가 평문으로 판정한 kind와 크기만 본다.
  const encrypted = form.get("encrypted") === "1";
  const check = encrypted
    ? checkEncryptedUpload(form.get("kind"), data)
    : checkUpload(file.name, data);
  if (!check.ok)
    return NextResponse.json({ error: check.error }, { status: 400 });

  const created = await createFile(Number(session.user.id), {
    title: file.name,
    kind: check.kind,
    body: check.body,
    encrypted,
  });
  if (!created.ok)
    return NextResponse.json({ error: created.error }, { status: 400 });
  return NextResponse.json(
    { shareToken: created.file.shareToken },
    { status: 201 },
  );
}
