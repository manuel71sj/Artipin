import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { isRecord } from "@/lib/anchor";
import { createApiKey } from "@/lib/api-key";

// API 키를 발급한다. body: { name: 1~50자 }. 원문(key)은 이 응답에만 싣고 저장하지 않는다.
// 세션으로만 부를 수 있다. Bearer 헤더를 읽지 않으므로 키로 키를 만들 수 없다.
export async function POST(request: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const body: unknown = await request.json().catch(() => null);
  const name = isRecord(body) ? body.name : undefined;
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 50)
    return NextResponse.json(
      { error: "name은 1~50자 문자열이어야 합니다." },
      { status: 400 },
    );

  const { key, keyHash } = createApiKey();
  const [created] = await db
    .insert(apiKeys)
    .values({ ownerId: Number(session.user.id), name: name.trim(), keyHash })
    .returning({
      id: apiKeys.id,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
    });
  return NextResponse.json({ ...created, key }, { status: 201 });
}
