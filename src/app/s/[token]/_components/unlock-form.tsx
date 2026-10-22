"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../../status.module.css";

// 맞으면 잠금 해제 쿠키가 설정되므로 서버 렌더를 다시 받아 본문을 연다.
export function UnlockForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/s/${token}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
    else {
      setBusy(false);
      // 401만 비밀번호 오류다. 나머지를 비밀번호 탓으로 보이면 맞는 비밀번호를 계속 다시 넣게 된다.
      setError(
        res?.status === 401
          ? "비밀번호가 맞지 않습니다"
          : res?.status === 404
            ? "열 수 없는 링크입니다. 만료되었거나 삭제되었을 수 있습니다"
            : "연결하지 못했습니다. 잠시 후 다시 시도하세요",
      );
    }
  }

  return (
    <form className={styles.actions} onSubmit={submit}>
      <label className="sr-only" htmlFor="unlock-password">
        비밀번호
      </label>
      <input
        id="unlock-password"
        className={styles.input}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button type="submit" className={styles.button} disabled={busy}>
        열기
      </button>
      {error ? (
        <span role="alert" className={styles.digest}>
          {error}
        </span>
      ) : null}
    </form>
  );
}
