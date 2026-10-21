"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../../status.module.css";

// 맞으면 잠금 해제 쿠키가 설정되므로 서버 렌더를 다시 받아 본문을 연다.
export function UnlockForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setWrong(false);
    const res = await fetch(`/api/s/${token}/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) router.refresh();
    else {
      setBusy(false);
      setWrong(true);
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
      {wrong ? (
        <span role="alert" className={styles.digest}>
          비밀번호가 맞지 않습니다
        </span>
      ) : null}
    </form>
  );
}
