import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db, sqlite } from "@/db";
import { comments, files, owners, teams, views } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import styles from "../home.module.css";
import admin from "./admin.module.css";

const KIND_LABEL = {
  image: "이미지",
  html: "HTML",
  pdf: "PDF",
  site: "사이트",
} as const;
const KINDS = ["image", "html", "pdf", "site"] as const;

const DAY = 86_400_000;

const date = (ms: number) =>
  new Date(ms).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export default async function AdminPage() {
  // 가드는 반드시 첫 두 문장에 둔다. 비로그인·비관리자 모두 404로, 관리자 화면의 존재를 드러내지 않는다(로그인으로 redirect하지 않는다).
  // notFound()는 응답이 시작되기 전에 불려야 실제 404 상태 코드가 나간다. 이 경로 위에 loading.tsx·Suspense를 두면 200으로 바뀐다.
  const session = await auth();
  if (!(await isAdmin(session))) notFound();

  const now = Date.now();

  const ownerCount = await db.$count(owners);
  const teamCount = await db.$count(teams);
  const kindRows = await db
    .select({ kind: files.kind, n: count() })
    .from(files)
    .where(isNull(files.deletedAt))
    .groupBy(files.kind);
  const [{ totalSize }] = await db
    .select({
      totalSize: sql<number>`coalesce(sum(${files.size}), 0)`.mapWith(Number),
    })
    .from(files)
    .where(isNull(files.deletedAt));
  // 댓글 수는 모두 소유자 측이 아닌 댓글(is_owner = 0, 답글 포함)만 센다. 외부 조회·사업화 지표와 같은 기준이다.
  const external = eq(comments.isOwner, false);
  const commentCount = await db.$count(comments, external);
  // 신규 업로드는 그 기간에 일어난 업로드 수라 삭제된 파일도 센다(파일 수 카드는 삭제 제외).
  const periods = await Promise.all(
    [7, 30].map(async (days) => {
      const since = now - days * DAY;
      return {
        days,
        uploads: await db.$count(files, gte(files.createdAt, since)),
        views: await db.$count(views, gte(views.firstSeenAt, since)),
        comments: await db.$count(
          comments,
          and(gte(comments.createdAt, since), external),
        ),
      };
    }),
  );

  // 사업화 지표 정의의 정본은 scripts/metrics.sql이다. 한쪽을 바꾸면 함께 바꾼다(삭제 파일도 포함한다 — deleted_at 필터를 넣지 않는다).
  const metrics = sqlite
    .prepare(
      `SELECT '전달: 소유자 외 조회가 있는 파일 수' AS metric, COUNT(DISTINCT file_id) AS value FROM views
UNION ALL
SELECT '댓글: 소유자 외 댓글이 있는 파일 수', COUNT(DISTINCT file_id) FROM comments WHERE is_owner = 0
UNION ALL
SELECT '재업로드: 파일을 2개 이상 올렸거나 교체한 적이 있는 소유자 수', COUNT(*) FROM (SELECT owner_id FROM files GROUP BY owner_id HAVING COUNT(*) >= 2 OR COUNT(replaced_at) > 0)`,
    )
    .all() as { metric: string; value: number }[];

  // 조인 없는 select에서는 drizzle이 보간한 컬럼을 테이블 이름 없이 내보내, 서브쿼리의 바깥 참조(owners.id)가 안쪽 테이블의 id로 잡힌다.
  // 그래서 이 쿼리의 서브쿼리는 테이블 이름을 붙인 원문으로 쓴다. provider_account_id와 key_hash는 읽지 않는다.
  const ownerRows = await db
    .select({
      id: owners.id,
      name: owners.name,
      email: owners.email,
      provider: owners.provider,
      fileCount:
        sql<number>`(select count(*) from files where files.owner_id = owners.id and files.deleted_at is null)`.mapWith(
          Number,
        ),
      size: sql<number>`(select coalesce(sum(files.size), 0) from files where files.owner_id = owners.id and files.deleted_at is null)`.mapWith(
        Number,
      ),
      // 파일이 없으면 null이다. mapWith(Number)를 붙이면 0(1970년)이 되므로 붙이지 않는다. 삭제된 파일도 포함한 실제 첫 업로드 시점이다.
      firstUploadAt: sql<
        number | null
      >`(select min(files.created_at) from files where files.owner_id = owners.id)`,
      teamCount:
        sql<number>`(select count(*) from team_members where team_members.owner_id = owners.id)`.mapWith(
          Number,
        ),
      keyCount:
        sql<number>`(select count(*) from api_keys where api_keys.owner_id = owners.id)`.mapWith(
          Number,
        ),
    })
    .from(owners)
    .orderBy(owners.id);

  // 삭제된 파일도 보여 준다. password_hash·view_token은 읽지 않는다(비밀번호는 유무만).
  const fileRows = await db
    .select({
      id: files.id,
      title: files.title,
      kind: files.kind,
      size: files.size,
      shareToken: files.shareToken,
      createdAt: files.createdAt,
      deletedAt: files.deletedAt,
      expiresAt: files.expiresAt,
      encrypted: files.encrypted,
      hasPassword: sql<number>`${files.passwordHash} is not null`.mapWith(
        Boolean,
      ),
      ownerName: owners.name,
      teamName: teams.name,
      comments:
        sql<number>`(select count(*) from ${comments} where ${comments.fileId} = ${files.id} and ${comments.isOwner} = 0)`.mapWith(
          Number,
        ),
      views:
        sql<number>`(select count(*) from ${views} where ${views.fileId} = ${files.id})`.mapWith(
          Number,
        ),
    })
    .from(files)
    .innerJoin(owners, eq(owners.id, files.ownerId))
    .leftJoin(teams, eq(teams.id, files.teamId))
    .orderBy(desc(files.createdAt), desc(files.id));

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand} translate="no">
          <span className={styles.brandDot} aria-hidden="true" />
          Artipin
        </span>
        <div className={styles.account}>
          <a className={styles.signout} href="/">
            파일 목록
          </a>
        </div>
      </header>

      <main id="main">
        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>현황</h2>
        </div>
        <dl className={admin.cards}>
          <div className={admin.card}>
            <dt>소유자</dt>
            <dd>{ownerCount}</dd>
          </div>
          {KINDS.map((kind) => (
            <div key={kind} className={admin.card}>
              <dt>{KIND_LABEL[kind]} 파일</dt>
              <dd>{kindRows.find((r) => r.kind === kind)?.n ?? 0}</dd>
            </div>
          ))}
          <div className={admin.card}>
            <dt>총 저장 용량(현재 버전)</dt>
            <dd>{bytes(totalSize)}</dd>
          </div>
          <div className={admin.card}>
            <dt>팀</dt>
            <dd>{teamCount}</dd>
          </div>
          <div className={admin.card}>
            <dt>외부 댓글</dt>
            <dd>{commentCount}</dd>
          </div>
        </dl>

        {periods.map((p) => (
          <section key={p.days}>
            <div className={styles.listHead}>
              <h2 className={styles.listTitle}>최근 {p.days}일</h2>
            </div>
            <dl className={admin.cards}>
              <div className={admin.card}>
                <dt>신규 업로드(삭제 포함)</dt>
                <dd>{p.uploads}</dd>
              </div>
              <div className={admin.card}>
                <dt>신규 외부 조회</dt>
                <dd>{p.views}</dd>
              </div>
              <div className={admin.card}>
                <dt>외부 댓글</dt>
                <dd>{p.comments}</dd>
              </div>
            </dl>
          </section>
        ))}

        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>사업화 지표</h2>
        </div>
        <div className={admin.tableWrap}>
          <table className={admin.table}>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.metric}>
                  <td>{m.metric}</td>
                  <td className={admin.num}>{m.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>사용자</h2>
          <span className={styles.count}>{ownerRows.length}</span>
        </div>
        <div className={admin.tableWrap}>
          <table className={admin.table}>
            <thead>
              <tr>
                <th>이름</th>
                <th>email</th>
                <th>제공자</th>
                <th className={admin.num}>파일</th>
                <th className={admin.num}>사용 용량(현재 버전)</th>
                <th>첫 업로드일</th>
                <th className={admin.num}>소속 팀</th>
                <th className={admin.num}>API 키</th>
              </tr>
            </thead>
            <tbody>
              {ownerRows.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{o.email}</td>
                  <td>{o.provider}</td>
                  <td className={admin.num}>{o.fileCount}</td>
                  <td className={admin.num}>{bytes(o.size)}</td>
                  <td>{o.firstUploadAt !== null && date(o.firstUploadAt)}</td>
                  <td className={admin.num}>{o.teamCount}</td>
                  <td className={admin.num}>{o.keyCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>파일</h2>
          <span className={styles.count}>{fileRows.length}</span>
        </div>
        <div className={admin.tableWrap}>
          <table className={admin.table}>
            <thead>
              <tr>
                <th>제목</th>
                <th>종류</th>
                <th className={admin.num}>크기</th>
                <th>소유자</th>
                <th>팀</th>
                <th>생성일</th>
                <th>상태</th>
                <th className={admin.num}>외부 댓글</th>
                <th className={admin.num}>외부 조회</th>
              </tr>
            </thead>
            <tbody>
              {fileRows.map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.deletedAt === null ? (
                      <a href={`/s/${f.shareToken}`}>{f.title}</a>
                    ) : (
                      f.title
                    )}
                  </td>
                  <td>{KIND_LABEL[f.kind]}</td>
                  <td className={admin.num}>{bytes(f.size)}</td>
                  <td>{f.ownerName}</td>
                  <td>{f.teamName ?? "개인"}</td>
                  <td>{date(f.createdAt)}</td>
                  <td>
                    <span className={admin.status}>
                      {f.deletedAt !== null && (
                        <span className={styles.kind}>삭제됨</span>
                      )}
                      {f.expiresAt !== null && f.expiresAt <= now && (
                        <span className={styles.kind}>만료됨</span>
                      )}
                      {f.hasPassword && (
                        <span className={styles.kind}>비밀번호</span>
                      )}
                      {f.encrypted && (
                        <span className={styles.kind}>암호화</span>
                      )}
                    </span>
                  </td>
                  <td className={admin.num}>{f.comments}</td>
                  <td className={admin.num}>{f.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
