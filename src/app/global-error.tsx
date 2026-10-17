"use client";

import "./globals.css";
import { StatusPage, statusStyles as styles } from "./_components/status-page";

// 루트 레이아웃까지 실패한 경우: 레이아웃을 대체하므로 html·body를 직접 그린다(폰트 변수는 없어 시스템 폰트로 대체된다).
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ko">
      <body>
        <title>Artipin 오류</title>
        <StatusPage title="화면을 불러오지 못했습니다">
          <p className={styles.next}>
            일시적인 문제일 수 있습니다. 다시 시도해도 같으면 아래 오류 번호와
            함께 알려 주세요.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => retry()}
            >
              다시 시도
            </button>
          </div>
          {error.digest ? (
            <p className={styles.digest}>
              오류 번호 <code translate="no">{error.digest}</code>
            </p>
          ) : null}
        </StatusPage>
      </body>
    </html>
  );
}
