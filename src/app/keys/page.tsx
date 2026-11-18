import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import styles from "../home.module.css";
import { ApiKeys } from "./_components/api-keys";

export default async function KeysPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // 해시는 클라이언트로 내리지 않는다. 원문은 저장하지 않으므로 여기서 보여 줄 수 없다.
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.ownerId, Number(session.user.id)))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));

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
          <h2 className={styles.listTitle}>API 키</h2>
          <span className={styles.count}>{keys.length}</span>
        </div>
        <ApiKeys keys={keys} />
      </main>
    </div>
  );
}
