"use client";

import { type RefObject, useState } from "react";

export type TextEdit = { selector: string; before: string; after: string };

// 소유자 전용 본문 텍스트 편집 목록. 값은 iframe이 보낸 문자열이라 React 텍스트로만 렌더한다.
export function EditPanel({
  edits,
  editsRef,
  fileId,
  title,
  onCancel,
}: {
  edits: TextEdit[];
  // 같은 클릭의 blur 커밋이 반영되도록 다운로드는 fetch 뒤에 최신 목록을 ref로 읽는다.
  editsRef: RefObject<TextEdit[]>;
  fileId: number;
  title: string;
  onCancel: (selector: string) => void;
}) {
  const [error, setError] = useState(false);
  const [missed, setMissed] = useState<TextEdit[]>([]);

  // 원본 소스를 비활성 문서로 파싱해 before가 맞는 요소만 바꾼다. 그 노드를 화면 문서에 넣지 않는다.
  async function download() {
    setError(false);
    setMissed([]);
    const res = await fetch(`/api/files/${fileId}/source`).catch(() => null);
    if (!res?.ok) {
      setError(true);
      return;
    }
    const doc = new DOMParser().parseFromString(await res.text(), "text/html");
    const failed: TextEdit[] = [];
    for (const e of editsRef.current) {
      let el: Element | null = null;
      try {
        el = doc.querySelector(e.selector);
      } catch {}
      if (el && el.children.length === 0 && el.textContent === e.before)
        el.textContent = e.after;
      else failed.push(e);
    }
    setMissed(failed);
    const html =
      (doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>\n` : "") +
      doc.documentElement.outerHTML;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\.[^./]+$/, "")}-edited.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="edit-panel">
      <p>
        편집 내용은 이 화면에만 있고 새로고침하면 사라집니다. 원본 파일은 바뀌지
        않습니다. 같은 링크에 반영하려면 수정본을 내려받아 내 파일에서
        교체하세요.
      </p>
      <ul>
        {edits.map((e) => (
          <li key={e.selector}>
            <span className="edit-before">{e.before}</span>
            <span className="edit-after">{e.after}</span>
            <button type="button" onClick={() => onCancel(e.selector)}>
              취소
            </button>
          </li>
        ))}
      </ul>
      <div className="comment-actions">
        <button type="button" className="primary" onClick={download}>
          수정본 다운로드
        </button>
      </div>
      {error ? <p role="alert">원본을 불러오지 못했습니다.</p> : null}
      {missed.length > 0 ? (
        <div role="alert">
          <p>원본에서 찾지 못해 반영하지 못한 변경 {missed.length}건</p>
          <ul>
            {missed.map((e) => (
              <li key={e.selector}>{e.before}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
