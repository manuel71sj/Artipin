"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../home.module.css";

type Key = { id: number; name: string; createdAt: number };
// 폐기는 되돌릴 수 없으므로 한 번 더 확인한다.
type RevokeState = "idle" | "confirm" | "saving" | "failed";

function KeyRow({ apiKey, onRevoked }: { apiKey: Key; onRevoked: () => void }) {
  const router = useRouter();
  const [revoke, setRevoke] = useState<RevokeState>("idle");

  async function revokeKey() {
    setRevoke("saving");
    const res = await fetch(`/api/keys/${apiKey.id}`, {
      method: "DELETE",
    }).catch(() => null);
    // 성공하면 목록 갱신으로 이 행이 사라진다.
    if (res?.ok) {
      onRevoked();
      router.refresh();
    } else setRevoke("failed");
  }

  const confirming = revoke !== "idle";

  return (
    <div className={styles.teamRow}>
      <span className={styles.teamName}>{apiKey.name}</span>
      <span className={styles.when}>
        {new Date(apiKey.createdAt).toLocaleDateString("ko-KR", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}{" "}
        발급
      </span>
      {confirming ? (
        <span className={styles.replaceNote}>
          폐기하면 이 키로 새로 들어오는 호출이 거절됩니다
        </span>
      ) : null}
      <button
        type="button"
        className={confirming ? styles.confirm : styles.remove}
        disabled={revoke === "saving"}
        onClick={() => (confirming ? revokeKey() : setRevoke("confirm"))}
      >
        {revoke === "saving"
          ? "폐기하는 중…"
          : revoke === "failed"
            ? "다시 시도"
            : confirming
              ? "키 폐기"
              : "폐기"}
      </button>
      {confirming ? (
        <button
          type="button"
          className={styles.remove}
          disabled={revoke === "saving"}
          onClick={() => setRevoke("idle")}
        >
          취소
        </button>
      ) : null}
      {revoke === "failed" ? (
        <span role="alert" className={styles.replaceNote}>
          키를 폐기하지 못했습니다
        </span>
      ) : null}
    </div>
  );
}

// API 키 발급·목록·폐기. 원문은 발급 응답으로 한 번만 받아 이 컴포넌트의 상태에만 둔다(새로고침하면 사라진다).
export function ApiKeys({ keys }: { keys: Key[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState<"idle" | "saving" | "failed">(
    "idle",
  );
  const [issued, setIssued] = useState<{ id: number; key: string } | null>(
    null,
  );
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  async function createKey() {
    setCreating("saving");
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    const created = res?.ok ? await res.json().catch(() => null) : null;
    if (typeof created?.key !== "string") {
      setCreating("failed");
      return;
    }
    setCreating("idle");
    setName("");
    setIssued({ id: created.id, key: created.key });
    setCopy("idle");
    router.refresh();
  }

  async function copyKey() {
    if (issued === null) return;
    try {
      await navigator.clipboard.writeText(issued.key);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <>
      <div className={styles.teamPanel}>
        <div className={styles.teamRow}>
          <input
            className={styles.password}
            aria-label="키 이름"
            placeholder="키 이름 (예: 내 에이전트)"
            maxLength={50}
            value={name}
            disabled={creating === "saving"}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // 한글 조합을 확정하는 Enter는 발급으로 보지 않는다.
              if (
                e.key === "Enter" &&
                !e.nativeEvent.isComposing &&
                name.trim() !== ""
              )
                createKey();
            }}
          />
          <button
            type="button"
            className={styles.copy}
            disabled={creating === "saving" || name.trim() === ""}
            onClick={createKey}
          >
            {creating === "saving" ? "발급하는 중…" : "키 발급"}
          </button>
          {creating === "failed" ? (
            <span role="alert" className={styles.replaceNote}>
              키를 발급하지 못했습니다
            </span>
          ) : null}
        </div>
        {issued !== null ? (
          <div className={styles.teamRow}>
            <code className={styles.teamName} translate="no">
              {issued.key}
            </code>
            <button
              type="button"
              className={styles.copy}
              data-state={copy}
              aria-live="polite"
              onClick={copyKey}
            >
              {copy === "idle"
                ? "복사"
                : copy === "copied"
                  ? "복사했습니다"
                  : "복사 실패"}
            </button>
            <span className={styles.replaceNote}>
              이 키는 다시 볼 수 없습니다. 지금 복사해 두세요.
            </span>
          </div>
        ) : null}
      </div>

      {keys.length === 0 ? (
        <p className={styles.empty}>
          발급한 키가 없습니다. 키를 발급하면 AI 에이전트나 스크립트가 로그인
          없이 문서를 등록하고 관리할 수 있습니다.
        </p>
      ) : (
        <div className={styles.teamPanel}>
          {keys.map((k) => (
            <KeyRow
              key={k.id}
              apiKey={k}
              // 방금 발급한 키를 폐기하면 위의 원문 표시도 지운다.
              onRevoked={() => {
                setIssued((cur) => (cur?.id === k.id ? null : cur));
              }}
            />
          ))}
        </div>
      )}

      <p className={styles.hint}>
        API 사용법: <a href="/llms.txt">/llms.txt</a> ·{" "}
        <a href="/openapi.json">/openapi.json</a>
      </p>
    </>
  );
}
