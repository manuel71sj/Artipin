import { eq, inArray, or, type SQL } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/db";
import { files, teamMembers } from "@/db/schema";

// 파일을 소유자처럼 다룰 수 있는지의 규칙은 이 파일 한 곳에 둔다: 본인이 올린 파일이거나, 파일의 팀(team_id)에 내가 속해 있다.
// manageable은 SQL 조건, canManage는 이미 읽은 행에 대한 값 판정으로, 같은 규칙의 두 표현이라 함께 바꾼다.

// 내가 속한 팀의 id 목록. manageable과 canManage의 팀 분기가 함께 쓰고, 파일을 팀으로 옮길 때 대상 팀 멤버 확인에도 쓴다.
export const myTeams = (ownerId: number) =>
  db
    .select({ id: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.ownerId, ownerId));

export const manageable = (ownerId: number): SQL =>
  or(
    eq(files.ownerId, ownerId),
    inArray(files.teamId, myTeams(ownerId)),
  ) as SQL;

export async function canManage(
  session: Session | null,
  file: { ownerId: number; teamId: number | null },
): Promise<boolean> {
  if (session === null) return false;
  const me = Number(session.user.id);
  if (me === file.ownerId) return true;
  if (file.teamId === null) return false;
  return (await myTeams(me)).some((t) => t.id === file.teamId);
}
