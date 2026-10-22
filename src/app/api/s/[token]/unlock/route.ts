import { NextResponse } from "next/server";
import { findViewableFile } from "@/lib/shared-file";
import { setUnlockCookie, verifyPassword } from "@/lib/unlock";

// 잠금 화면이 비밀번호를 보낸다. 맞으면 이 파일의 잠금 해제 쿠키를 설정한다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token, true);
  if (found.status !== "ok")
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  const { file } = found;
  if (file.passwordHash === null)
    return new NextResponse(null, { status: 204 });

  const body = await request.json().catch(() => null);
  if (
    typeof body?.password !== "string" ||
    !(await verifyPassword(body.password, file.passwordHash))
  )
    return NextResponse.json(
      { error: "비밀번호가 맞지 않습니다." },
      { status: 401 },
    );
  await setUnlockCookie({ id: file.id, passwordHash: file.passwordHash });
  return new NextResponse(null, { status: 204 });
}
