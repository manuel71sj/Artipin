"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../home.module.css";

type CopyState = "idle" | "copied" | "failed";
// 삭제는 파일 본문을 지우는 되돌릴 수 없는 작업이라 같은 자리에서 한 번 더 확인한다.
type DeleteState = "idle" | "confirm" | "deleting" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "링크 복사",
  copied: "복사했습니다",
  failed: "복사 실패",
};

export function FileActions({ id, path }: { id: number; path: string }) {
  const router = useRouter();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [del, setDel] = useState<DeleteState>("idle");
  // 연속으로 누르면 이전 타이머가 새 표시를 일찍 끄지 않도록 매번 취소한다.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const removeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 요청 중 비활성화로 잃은 포커스를 실패 시 돌려준다.
  useEffect(() => {
    if (del === "failed") removeRef.current?.focus();
  }, [del]);

  async function copyLink() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    } catch {
      next = "failed";
    }
    clearTimeout(timer.current);
    setCopy(next);
    timer.current = setTimeout(() => setCopy("idle"), 1500);
  }

  async function remove() {
    setDel("deleting");
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (res?.ok) router.refresh();
    else setDel("failed");
  }

  const confirming = del !== "idle";

  return (
    <div className={styles.actions}>
      {confirming ? null : (
        <button
          type="button"
          className={styles.copy}
          data-state={copy}
          aria-live="polite"
          onClick={copyLink}
        >
          {COPY_LABEL[copy]}
        </button>
      )}
      <button
        ref={removeRef}
        type="button"
        className={confirming ? styles.confirm : styles.remove}
        disabled={del === "deleting"}
        onClick={() => (confirming ? remove() : setDel("confirm"))}
      >
        {del === "deleting"
          ? "삭제 중…"
          : del === "failed"
            ? "다시 시도"
            : confirming
              ? "링크 닫고 삭제"
              : "삭제"}
      </button>
      {confirming ? (
        <button
          type="button"
          className={styles.remove}
          disabled={del === "deleting"}
          onClick={() => {
            setDel("idle");
            removeRef.current?.focus();
          }}
        >
          취소
        </button>
      ) : null}
      {del === "failed" ? (
        <span role="alert" className="sr-only">
          삭제하지 못했습니다
        </span>
      ) : null}
    </div>
  );
}
