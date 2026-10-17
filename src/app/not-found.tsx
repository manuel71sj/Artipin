import Link from "next/link";
import { StatusPage, statusStyles as styles } from "./_components/status-page";

export default function NotFound() {
  return (
    <StatusPage title="찾을 수 없는 주소입니다">
      <p className={styles.next}>
        주소를 다시 확인하세요. 받은 링크라면 올린 사람에게 새 링크를
        요청하세요.
      </p>
      <div className={styles.actions}>
        <Link className={styles.link} href="/">
          내 파일로 이동
        </Link>
      </div>
    </StatusPage>
  );
}
