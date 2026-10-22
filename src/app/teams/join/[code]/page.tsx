import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { teamMembers, teams } from "@/db/schema";
import { StatusPage, statusStyles } from "../../../_components/status-page";

// 초대 링크 확인 화면. 읽기만 하며(링크 미리보기·프리페치가 멤버를 만들지 않게), 가입은 아래 폼의 POST가 한다.
export default async function JoinTeamPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { code } = await params;
  const [team] = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.inviteCode, code));
  if (!team) notFound();

  const [member] = await db
    .select({ ownerId: teamMembers.ownerId })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, team.id),
        eq(teamMembers.ownerId, Number(session.user.id)),
      ),
    );
  if (member) redirect("/");

  return (
    <StatusPage title="팀에 초대되었습니다">
      <p className={statusStyles.next}>
        {team.name} 팀에 참여하면 팀 파일을 함께 관리할 수 있습니다.
      </p>
      <form
        className={statusStyles.actions}
        method="post"
        action={`/api/teams/join/${code}`}
      >
        <button type="submit" className={statusStyles.button}>
          팀에 참여
        </button>
      </form>
    </StatusPage>
  );
}
