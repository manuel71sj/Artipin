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

  async function upload(file: File) {
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
      <div className={styles.intro}>
        <h1 className={styles.title}>파일을 놓으면 링크가 됩니다</h1>
        <div className={styles.pick}>
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
              : "또는 이 영역에 끌어다 놓으세요"}
          </span>
        </div>

        <output className="sr-only">
          {done ? "업로드했습니다. 아래 목록에 추가되었습니다." : ""}
        </output>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <dl className={styles.spec}>
        <div>
          <dt>이미지</dt>
          <dd>PNG·JPG·WebP, 10MB 이하</dd>
        </div>
        <div>
          <dt>HTML</dt>
          <dd>독립형 파일, 5MB 이하</dd>
        </div>
      </dl>
    </form>
  );
}
