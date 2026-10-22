import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { teams } from "@/db/schema";
import { myTeams } from "@/lib/access";

// 초대 코드를 새로 만든다. 덮어쓰기 한 문장이라 이전 초대 링크는 즉시 끊긴다. 팀 멤버면 누구나 할 수 있다.
export async function POST(
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
  const [updated] = await db
    .update(teams)
    .set({ inviteCode: randomBytes(16).toString("base64url") })
    .where(
      and(
        eq(teams.id, Number(id)),
        inArray(teams.id, myTeams(Number(session.user.id))),
      ),
    )
    .returning({ inviteCode: teams.inviteCode });
  if (!updated)
    return NextResponse.json(
      { error: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  return NextResponse.json({ inviteCode: updated.inviteCode });
}
