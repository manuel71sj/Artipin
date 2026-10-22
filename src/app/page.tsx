import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { comments, files, teamMembers, teams, views } from "@/db/schema";
import { manageable } from "@/lib/access";
import { relativeTime } from "@/lib/time";
import { FileActions } from "./_components/file-actions";
import { TeamPanel } from "./_components/team-panel";
import { UploadForm } from "./_components/upload-form";
import styles from "./home.module.css";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  // open: 아직 해결되지 않은 댓글(답글 제외). 핀 댓글의 처리 대기 수를 목록에서 바로 보여준다.
  const me = Number(session.user.id);
  const rows = await db
    .select({
      id: files.id,
      title: files.title,
      kind: files.kind,
      shareToken: files.shareToken,
      viewToken: files.viewToken,
      createdAt: files.createdAt,
      replacedAt: files.replacedAt,
      encrypted: files.encrypted,
      teamId: files.teamId,
      teamName: teams.name,
      expiresAt: files.expiresAt,
      // 해시 자체는 클라이언트로 내리지 않는다.
      hasPassword: sql<number>`${files.passwordHash} is not null`.mapWith(
        Boolean,
      ),
      open: sql<number>`count(case when ${comments.id} is not null and ${comments.parentId} is null and ${comments.resolvedAt} is null then 1 end)`.mapWith(
        Number,
      ),
      // 댓글 left join에 views를 더 join하면 댓글 수만큼 곱해지므로 상관 서브쿼리로 센다.
      views:
        sql<number>`(select count(*) from ${views} where ${views.fileId} = ${files.id})`.mapWith(
          Number,
        ),
    })
    .from(files)
    .leftJoin(comments, eq(comments.fileId, files.id))
    .leftJoin(teams, eq(teams.id, files.teamId))
    .where(and(manageable(me), isNull(files.deletedAt)))
    .groupBy(files.id)
    .orderBy(desc(files.createdAt), desc(files.id));
  // 내가 올렸어도 팀으로 옮긴 파일은 팀 파일 구역에만 나온다.
  const myFiles = rows.filter((f) => f.teamId === null);
  const teamFiles = rows.filter((f) => f.teamId !== null);
  const myTeamList = await db
    .select({ id: teams.id, name: teams.name, inviteCode: teams.inviteCode })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.ownerId, me))
    .orderBy(teams.id);

  const row = (f: (typeof rows)[number]) => (
    <li key={f.id} className={styles.row}>
      <span className={styles.titleCell}>
        <a className={styles.name} href={`/s/${f.shareToken}`}>
          {f.title}
        </a>
        <span className={styles.kind}>
          {
            {
              image: "이미지",
              html: "HTML",
              pdf: "PDF",
              site: "사이트",
            }[f.kind]
          }
        </span>
        {f.encrypted && <span className={styles.kind}>암호화</span>}
        {f.teamName !== null && (
          <span className={styles.kind}>{f.teamName}</span>
        )}
        {f.expiresAt !== null &&
          (f.expiresAt <= Date.now() ? (
            <span className={styles.expiry} data-expired>
              만료됨
            </span>
          ) : (
            <span className={styles.expiry}>
              {new Date(f.expiresAt).toLocaleDateString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "long",
                day: "numeric",
              })}{" "}
              만료
            </span>
          ))}
      </span>
      <span className={styles.pinCell}>
        {f.open > 0 && (
          <span className={styles.pinCount}>
            <span aria-hidden="true">{f.open}</span>
            <span className="sr-only">미해결 댓글 {f.open}개</span>
          </span>
        )}
      </span>
      <span className={styles.views}>열람 {f.views}명</span>
      <span className={styles.when}>
        {f.replacedAt
          ? `교체됨 · ${relativeTime(f.replacedAt)}`
          : relativeTime(f.createdAt)}
      </span>
      <FileActions
        id={f.id}
        path={`/s/${f.shareToken}`}
        viewPath={f.viewToken ? `/s/${f.viewToken}` : null}
        hasPassword={f.hasPassword}
        encrypted={f.encrypted}
        teamId={f.teamId}
        teams={myTeamList}
      />
    </li>
  );

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand} translate="no">
          <span className={styles.brandDot} aria-hidden="true" />
          Artipin
        </span>
        <div className={styles.account}>
          {session.user.email && (
            <span className={styles.email}>{session.user.email}</span>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className={styles.signout}>
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <main id="main">
        <UploadForm />

        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>내 파일</h2>
          <span className={styles.count}>{myFiles.length}</span>
        </div>
        {myFiles.length === 0 ? (
          <p className={styles.empty}>
            아직 올린 파일이 없습니다. 위 영역에 HTML이나 이미지를 놓으면 공유
            링크가 만들어지고, 이곳에 나타납니다.
          </p>
        ) : (
          <ul className={styles.list}>{myFiles.map(row)}</ul>
        )}

        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>팀 파일</h2>
          <span className={styles.count}>{teamFiles.length}</span>
        </div>
        <TeamPanel teams={myTeamList} />
        {teamFiles.length === 0 ? (
          <p className={styles.empty}>
            팀으로 옮긴 파일이 없습니다. 내 파일에서 &ldquo;팀으로
            옮기기&rdquo;를 누르면 팀 멤버가 함께 관리할 수 있습니다.
          </p>
        ) : (
          <ul className={styles.list}>{teamFiles.map(row)}</ul>
        )}
      </main>
    </div>
  );
}
