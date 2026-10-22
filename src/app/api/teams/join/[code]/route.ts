import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { appOrigin } from "@/lib/hosts";

// 초대 코드로 팀에 가입한다. 확인 화면(/teams/join/[code])의 폼 POST로만 들어오며, 코드 조회와 가입을 한 동기 트랜잭션에 묶어 재발급과 섞여도 이전 코드로 들어가지 못한다.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const { code } = await params;
  const joined = db.transaction((tx) => {
    const [team] = tx
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.inviteCode, code))
      .all();
    if (!team) return false;
    tx.insert(teamMembers)
      .values({ teamId: team.id, ownerId: Number(session.user.id) })
      .onConflictDoNothing()
      .run();
    return true;
  });
  if (!joined)
    return NextResponse.json(
      { error: "초대 링크가 올바르지 않습니다." },
      { status: 404 },
    );
  // 폼 POST의 결과 화면이므로 홈으로 보낸다(303이라 GET으로 이동).
  return new NextResponse(null, {
    status: 303,
    headers: { Location: new URL("/", appOrigin()).toString() },
  });
}
