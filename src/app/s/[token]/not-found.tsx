import Link from "next/link";
import {
  StatusPage,
  statusStyles as styles,
} from "../../_components/status-page";

// notFound()는 삭제된 파일과 없는 토큰을 구분하지 않는다(의도). 두 경우를 함께 안내한다.
export default function ShareNotFound() {
  return (
    <StatusPage title="이 링크는 더 이상 열리지 않습니다">
      <dl className={styles.reasons}>
        <div>
          <dt>삭제됨</dt>
          <dd>올린 사람이 파일을 삭제하면 링크도 함께 닫힙니다.</dd>
        </div>
        <div>
          <dt>주소 오류</dt>
          <dd>
            주소의 일부가 빠졌거나 바뀌었을 수 있습니다. 받은 링크를 그대로 다시
            열어 보세요.
          </dd>
        </div>
      </dl>
      <p className={styles.next}>
        계속 필요하면 올린 사람에게 새 링크를 요청하세요.
      </p>
      <div className={styles.actions}>
        <Link className={styles.link} href="/">
          내 파일로 이동
        </Link>
      </div>
    </StatusPage>
  );
}
