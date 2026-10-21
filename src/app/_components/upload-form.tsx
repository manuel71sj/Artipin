"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import styles from "../home.module.css";

export function UploadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  // 자식 요소를 지날 때마다 dragleave가 발생하므로 진입 횟수로 센다.
  const depth = useRef(0);
  const [html, setHtml] = useState("");

  async function upload(file: File): Promise<boolean> {
    setBusy(true);
    setError(null);
    setDone(false);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/files", { method: "POST", body });
    if (res.ok) {
      setDone(true);
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      setError(
        json?.error ??
          `업로드하지 못했습니다 (${res.status}). 파일을 확인하고 다시 시도하세요.`,
      );
    }
    setBusy(false);
    return res.ok;
  }

  // 붙여넣은 HTML을 .html 파일로 만들어 파일 업로드와 같은 경로로 보낸다. 제목은 <title>, 없으면 기본값.
  async function uploadHtml() {
    const title =
      html
        .match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]
        .trim()
        .slice(0, 80) || "붙여넣은 HTML";
    const file = new File([html], `${title}.html`, { type: "text/html" });
    if (await upload(file)) setHtml("");
  }

  return (
    <form
      className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
      aria-busy={busy}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      <div className={styles.strip}>
        <h1 className={styles.title}>파일을 놓으면 링크가 됩니다</h1>
        <label>
          <input
            className={styles.file}
            type="file"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <span className={styles.pickButton}>
            {busy ? "올리는 중…" : "파일 선택"}
          </span>
        </label>
        <span className={styles.hint}>
          {dragging
            ? "놓으면 바로 올립니다"
            : ".html·.md·.markdown·.json 5MB, 이미지(PNG·JPG·WebP) 10MB, PDF 20MB·50페이지 이하"}
        </span>
      </div>

      <details className={styles.paste}>
        <summary>HTML 코드를 붙여넣어 올리기</summary>
        <textarea
          className={styles.pasteInput}
          value={html}
          disabled={busy}
          rows={8}
          spellCheck={false}
          aria-label="HTML 코드"
          placeholder="Claude·ChatGPT 아티팩트의 HTML 코드를 복사해 붙여넣으세요"
          onChange={(e) => setHtml(e.target.value)}
        />
        <button
          type="button"
          className={`${styles.pickButton} ${styles.pasteSubmit}`}
          disabled={busy || !html.trim()}
          onClick={uploadHtml}
        >
          {busy ? "올리는 중…" : "링크 만들기"}
        </button>
      </details>

      <output className="sr-only">
        {done ? "업로드했습니다. 아래 목록에 추가되었습니다." : ""}
      </output>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
