import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";
import { relativeTime } from "@/lib/time";
import { FileActions } from "./_components/file-actions";
import { UploadForm } from "./_components/upload-form";
import styles from "./home.module.css";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  // open: 아직 해결되지 않은 댓글(답글 제외). 핀 댓글의 처리 대기 수를 목록에서 바로 보여준다.
  const myFiles = await db
    .select({
      id: files.id,
      title: files.title,
      kind: files.kind,
      shareToken: files.shareToken,
      createdAt: files.createdAt,
      open: sql<number>`count(case when ${comments.parentId} is null and ${comments.resolvedAt} is null then 1 end)`.mapWith(
        Number,
      ),
    })
    .from(files)
    .leftJoin(comments, eq(comments.fileId, files.id))
    .where(
      and(eq(files.ownerId, Number(session.user.id)), isNull(files.deletedAt)),
    )
    .groupBy(files.id)
    .orderBy(desc(files.createdAt), desc(files.id));

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
          <h2 className={styles.listTitle}>올린 파일</h2>
          <span className={styles.count}>{myFiles.length}</span>
        </div>
        {myFiles.length === 0 ? (
          <p className={styles.empty}>
            아직 올린 파일이 없습니다. 위 영역에 HTML이나 이미지를 놓으면 공유
            링크가 만들어지고, 이곳에 나타납니다.
          </p>
        ) : (
          <ul className={styles.list}>
            {myFiles.map((f) => (
              <li key={f.id} className={styles.row}>
                <span className={styles.titleCell}>
                  <a className={styles.name} href={`/s/${f.shareToken}`}>
                    {f.title}
                  </a>
                  <span className={styles.kind}>
                    {f.kind === "image" ? "이미지" : "HTML"}
                  </span>
                </span>
                <span className={styles.pinCell}>
                  {f.open > 0 && (
                    <span className={styles.pinCount}>
                      <span aria-hidden="true">{f.open}</span>
                      <span className="sr-only">미해결 댓글 {f.open}개</span>
                    </span>
                  )}
                </span>
                <span className={styles.when}>{relativeTime(f.createdAt)}</span>
                <FileActions id={f.id} path={`/s/${f.shareToken}`} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
