import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { manageable } from "@/lib/access";
import { ownerIdFromKey } from "@/lib/api-key";
import { fileJson } from "@/lib/files";

// open API: 댓글 링크(url)를 새로 만든다. 이전 url은 끊기고 viewUrl·파일·댓글은 그대로 남는다.
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
  // 응답의 url에는 복호화 키(#k=)가 없어, 재발급하면 공유한 링크만 끊기고 열 수 있는 링크를 돌려주지 못한다. 화면도 이 버튼을 숨긴다.
  if (row.encrypted)
    return NextResponse.json(
      { error: "암호화 파일은 링크를 새로 만들 수 없습니다." },
      { status: 400 },
    );

  const [updated] = await db
    .update(files)
    .set({ shareToken: randomBytes(16).toString("base64url") })
    .where(owned)
    .returning();
  if (!updated)
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  return NextResponse.json(fileJson(updated));
}
