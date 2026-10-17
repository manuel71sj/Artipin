import type { ReactNode } from "react";
import styles from "../status.module.css";

export const statusStyles = styles;

// 404·오류 화면의 공통 뼈대. 서버·클라이언트 어디서든 쓸 수 있도록 훅을 쓰지 않는다.
export function StatusPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  // 마지막 단어와 핀을 한 덩어리로 묶어 핀이 혼자 줄바꿈되지 않게 한다.
  const cut = title.lastIndexOf(" ") + 1;
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand} translate="no">
          <span className={styles.brandDot} aria-hidden="true" />
          Artipin
        </span>
      </header>
      <main id="main" className={styles.main}>
        <h1 className={styles.title}>
          {title.slice(0, cut)}
          <span className={styles.tail}>
            {title.slice(cut)}
            <span className={styles.pin} aria-hidden="true" />
          </span>
        </h1>
        {children}
      </main>
    </div>
  );
}
