"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type VersionItem = {
  no: number;
  createdLabel: string;
  size: number;
  current: boolean;
};

// 소유자 전용. 이전 버전 보기는 CONTENT_HOST의 ?v= 주소를 새 탭으로 연다.
export function VersionList({
  fileId,
  token,
  contentBase,
  kind,
  ticket,
  versions,
}: {
  fileId: number;
  token: string;
  contentBase: string;
  kind: string;
  // 비밀번호 파일이면 CONTENT_HOST 경로 티켓. 없으면 접두사를 붙이지 않는다.
  ticket: string | null;
  versions: VersionItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [failed, setFailed] = useState<number | null>(null);
  const current = versions.find((v) => v.current);

  async function rollback(no: number) {
    setBusy(no);
    setFailed(null);
    const res = await fetch(`/api/files/${fileId}/rollback`, {
      method: "POST",
      body: JSON.stringify({ no }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) router.refresh();
    else setFailed(no);
  }

  return (
    <details className="share-versions">
      <summary>버전 {versions.length}개</summary>
      <ul>
        {versions.map((v) => (
          <li key={v.no}>
            <span className="share-versions-no">v{v.no}</span>
            <span>{v.createdLabel}</span>
            <span>{Math.max(1, Math.round(v.size / 1024))}KB</span>
            {v.current ? (
              <span className="share-versions-current">현재</span>
            ) : (
              <>
                {/* site는 이전 버전의 상대 자산이 현재 버전에서 읽혀 섞이므로 미리보기·비교 없이 되돌리기만 둔다 */}
                {kind === "site" ? null : (
                  <>
                    <a
                      className="copy-link"
                      href={`${contentBase}/c/${token}${ticket ? `/k/${ticket}` : ""}?v=${v.no}`}
                      target="_blank"
                      rel="noopener"
                    >
                      보기
                    </a>
                    <a
                      className="copy-link"
                      href={`/s/${token}/compare?a=${v.no}&b=${current?.no}`}
                    >
                      현재와 비교
                    </a>
                  </>
                )}
                <button
                  type="button"
                  className="copy-link"
                  disabled={busy !== null}
                  onClick={() => rollback(v.no)}
                >
                  {busy === v.no
                    ? "되돌리는 중…"
                    : failed === v.no
                      ? "다시 시도"
                      : "이 버전으로 되돌리기"}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
