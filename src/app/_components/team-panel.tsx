"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../home.module.css";

type CopyState = "idle" | "copied" | "failed";
// 재발급은 이전 초대 링크를 즉시 닫으므로 한 번 더 확인한다.
type ReissueState = "idle" | "confirm" | "saving" | "failed";

function TeamRow({
  team,
}: {
  team: { id: number; name: string; inviteCode: string | null };
}) {
  const router = useRouter();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [reissue, setReissue] = useState<ReissueState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 재발급 뒤 목록 갱신으로 inviteCode가 새 값이 되면 처리 중 상태를 끝낸다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: inviteCode가 바뀔 때만 실행한다
  useEffect(() => {
    setReissue((r) => (r === "saving" ? "idle" : r));
  }, [team.inviteCode]);

  async function copyInvite() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/teams/join/${team.inviteCode}`,
      );
    } catch {
      next = "failed";
    }
    clearTimeout(timer.current);
    setCopy(next);
    timer.current = setTimeout(() => setCopy("idle"), 1500);
  }

  async function reissueInvite() {
    setReissue("saving");
    const res = await fetch(`/api/teams/${team.id}/invite`, {
      method: "POST",
    }).catch(() => null);
    // 성공해도 목록이 새 코드로 갱신될 때까지(위 effect) 처리 중으로 두어, 복사 버튼이 이전 링크를 복사하지 않게 한다.
    if (res?.ok) router.refresh();
    else setReissue("failed");
  }

  const confirming = reissue !== "idle";

  return (
    <div className={styles.teamRow}>
      <span className={styles.teamName}>{team.name}</span>
      {confirming ? (
        <span className={styles.replaceNote}>
          이전 초대 링크로는 더 이상 참여할 수 없습니다. 이미 참여한 멤버는
          그대로 유지됩니다.
        </span>
      ) : null}
      {team.inviteCode === null || confirming ? null : (
        <button
          type="button"
          className={styles.copy}
          data-state={copy}
          aria-live="polite"
          onClick={copyInvite}
        >
          {copy === "idle"
            ? "초대 링크 복사"
            : copy === "copied"
              ? "복사했습니다"
              : "복사 실패"}
        </button>
      )}
      <button
        type="button"
        className={confirming ? styles.confirm : styles.remove}
        disabled={reissue === "saving"}
        onClick={() => (confirming ? reissueInvite() : setReissue("confirm"))}
      >
        {reissue === "saving"
          ? "만드는 중…"
          : reissue === "failed"
            ? "다시 시도"
            : confirming
              ? "새 초대 링크 만들기"
              : "초대 링크 재발급"}
      </button>
      {confirming ? (
        <button
          type="button"
          className={styles.remove}
          disabled={reissue === "saving"}
          onClick={() => setReissue("idle")}
        >
          취소
        </button>
      ) : null}
      {reissue === "failed" ? (
        <span role="alert" className="sr-only">
          초대 링크를 새로 만들지 못했습니다
        </span>
      ) : null}
    </div>
  );
}

// 팀 파일 구역 머리말. 소속 팀이 없으면 팀 만들기를, 있으면 팀별 초대 링크 복사·재발급을 보인다.
export function TeamPanel({
  teams,
}: {
  teams: { id: number; name: string; inviteCode: string | null }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState<"idle" | "saving" | "failed">(
    "idle",
  );

  async function createTeam() {
    setCreating("saving");
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).catch(() => null);
    if (res?.ok) {
      setCreating("idle");
      setName("");
      router.refresh();
    } else setCreating("failed");
  }

  if (teams.length > 0)
    return (
      <div className={styles.teamPanel}>
        {teams.map((t) => (
          <TeamRow key={t.id} team={t} />
        ))}
      </div>
    );

  return (
    <div className={styles.teamPanel}>
      <input
        className={styles.password}
        aria-label="팀 이름"
        placeholder="팀 이름"
        maxLength={50}
        value={name}
        disabled={creating === "saving"}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // 한글 조합을 확정하는 Enter는 팀 만들기로 보지 않는다.
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            name.trim() !== ""
          )
            createTeam();
        }}
      />
      <button
        type="button"
        className={styles.copy}
        disabled={creating === "saving" || name.trim() === ""}
        onClick={createTeam}
      >
        {creating === "saving" ? "만드는 중…" : "팀 만들기"}
      </button>
      {creating === "failed" ? (
        <span role="alert" className={styles.replaceNote}>
          팀을 만들지 못했습니다
        </span>
      ) : null}
    </div>
  );
}
