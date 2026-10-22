import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { readFile } from "@/lib/storage";

// 소유자가 단일 HTML의 저장 본문(브리지 주입 전)을 내려받는다. 수정본 다운로드가 부모에서 이 소스를 파싱한다.
// 소유자가 아니거나 HTML이 아니면 존재를 숨기려고 모두 404다.
// 첨부 헤더라 주소를 직접 열어도 APP origin에서 업로드 HTML이 렌더되지 않는다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const notFound = () => new NextResponse(null, { status: 404 });
  const session = await auth();
  if (!session) return notFound();

  const { id } = await params;
  const [file] = await db
    .select({ storagePath: files.storagePath, title: files.title })
    .from(files)
    .where(
      and(
        eq(files.id, Number(id)),
        manageable(Number(session.user.id)),
        eq(files.kind, "html"),
        isNull(files.deletedAt),
      ),
    );
  if (!file) return notFound();

  return new NextResponse(new Uint8Array(await readFile(file.storagePath)), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.title)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
