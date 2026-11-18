import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { ownerIdFromKey } from "@/lib/api-key";
import { fileJson } from "@/lib/files";

// open API: 보기 전용 링크(viewUrl)를 만든다. 이미 있으면 그대로 둔다. 끊기는 화면에서만 한다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ownerId = await ownerIdFromKey(request);
  if (ownerId === null)
    return NextResponse.json(
      { error: "API 키가 필요합니다." },
      { status: 401 },
    );

  const { id } = await params;
  const owned = and(
    eq(files.id, Number(id)),
    manageable(ownerId),
    isNull(files.deletedAt),
  );
  const [row] = await db
    .select({ encrypted: files.encrypted })
    .from(files)
    .where(owned);
  if (!row)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  // 암호화 파일의 보기 전용 링크는 복호화 키(#k=)를 붙여도 열리지 않는다. 화면도 이 버튼을 숨긴다.
  if (row.encrypted)
    return NextResponse.json(
      { error: "암호화 파일은 링크를 새로 만들 수 없습니다." },
      { status: 400 },
    );

  const fresh = randomBytes(16).toString("base64url");
  const [updated] = await db
    .update(files)
    .set({ viewToken: sql`coalesce(${files.viewToken}, ${fresh})` })
    .where(owned)
    .returning();
  if (!updated)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return NextResponse.json(fileJson(updated));
}
