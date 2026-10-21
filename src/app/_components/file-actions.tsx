"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../home.module.css";

type CopyState = "idle" | "copied" | "failed";
// 삭제는 파일 본문을 지우는 되돌릴 수 없는 작업이라 같은 자리에서 한 번 더 확인한다.
type DeleteState = "idle" | "confirm" | "deleting" | "failed";
// 교체도 이전 본문을 되돌릴 수 없으므로 파일을 고른 뒤 한 번 더 확인한다.
type ReplaceState = "idle" | "confirm" | "replacing" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "링크 복사",
  copied: "복사했습니다",
  failed: "복사 실패",
};

export function FileActions({ id, path }: { id: number; path: string }) {
  const router = useRouter();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [del, setDel] = useState<DeleteState>("idle");
  const [replace, setReplace] = useState<ReplaceState>("idle");
  const [newFile, setNewFile] = useState<File | null>(null);
  // 연속으로 누르면 이전 타이머가 새 표시를 일찍 끄지 않도록 매번 취소한다.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const removeRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 요청 중 비활성화로 잃은 포커스를 실패 시 돌려준다.
  useEffect(() => {
    if (del === "failed") removeRef.current?.focus();
  }, [del]);
  useEffect(() => {
    if (replace === "failed") replaceRef.current?.focus();
  }, [replace]);

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

  async function replaceBody() {
    if (!newFile) return;
    setReplace("replacing");
    const body = new FormData();
    body.set("file", newFile);
    const res = await fetch(`/api/files/${id}`, { method: "PUT", body }).catch(
      () => null,
    );
    if (res?.ok) {
      setReplace("idle");
      setNewFile(null);
      router.refresh();
    } else setReplace("failed");
  }

  const confirming = del !== "idle";
  const replacing = replace !== "idle";

  return (
    <div className={styles.actions}>
      {replacing ? (
        <span className={styles.replaceNote}>
          이전 본문은 복구할 수 없습니다. 댓글은 유지되며, 위치가 맞지 않는 핀은
          목록에만 표시됩니다.
        </span>
      ) : null}
      {confirming || replacing ? null : (
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
      {confirming ? null : (
        <>
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              setNewFile(picked);
              setReplace("confirm");
            }}
          />
          <button
            ref={replaceRef}
            type="button"
            className={replacing ? styles.confirm : styles.remove}
            disabled={replace === "replacing"}
            onClick={() =>
              replacing ? replaceBody() : inputRef.current?.click()
            }
          >
            {replace === "replacing"
              ? "교체 중…"
              : replace === "failed"
                ? "다시 시도"
                : "교체"}
          </button>
        </>
      )}
      {replacing ? (
        <button
          type="button"
          className={styles.remove}
          disabled={replace === "replacing"}
          onClick={() => {
            setReplace("idle");
            setNewFile(null);
            replaceRef.current?.focus();
          }}
        >
          취소
        </button>
      ) : (
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
      )}
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
      {replace === "failed" ? (
        <span role="alert" className="sr-only">
          교체하지 못했습니다
        </span>
      ) : null}
    </div>
  );
}
