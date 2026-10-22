import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";

// 팀을 만들고 만든 사람을 첫 멤버로 넣는다. body: { name: 1~50자 }
export async function POST(request: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );

  const name = (await request.json().catch(() => null))?.name;
  if (typeof name !== "string" || name.trim().length < 1 || name.length > 50)
    return NextResponse.json(
      { error: "name은 1~50자 문자열이어야 합니다." },
      { status: 400 },
    );

  const id = db.transaction((tx) => {
    const [team] = tx
      .insert(teams)
      .values({
        name: name.trim(),
        inviteCode: randomBytes(16).toString("base64url"),
      })
      .returning({ id: teams.id })
      .all();
    tx.insert(teamMembers)
      .values({ teamId: team.id, ownerId: Number(session.user.id) })
      .run();
    return team.id;
  });
  return NextResponse.json({ id }, { status: 201 });
}
