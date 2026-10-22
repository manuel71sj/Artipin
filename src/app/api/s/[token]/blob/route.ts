import { NextResponse } from "next/server";
import { findViewableFile } from "@/lib/shared-file";
import { readFile } from "@/lib/storage";
import { isUnlocked } from "@/lib/unlock";

// 암호화 파일의 암호문을 그대로 내려준다. 복호화는 뷰어(브라우저)가 하고 키는 서버가 모른다.
// 보기 전용 토큰은 받지 않는다(기본값). 평문 파일은 404다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok" || !found.file.encrypted)
    return new NextResponse(null, { status: 404 });
  if (!(await isUnlocked(found.file)))
    return NextResponse.json(
      { error: "비밀번호가 필요합니다." },
      { status: 403 },
    );
  let body: Buffer;
  try {
    body = await readFile(found.file.storagePath);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "attachment",
      "Cache-Control": "no-cache",
    },
  });
}
