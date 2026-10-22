"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "../home.module.css";

type CopyState = "idle" | "copied" | "failed";
// 삭제는 파일 본문을 지우는 되돌릴 수 없는 작업이라 같은 자리에서 한 번 더 확인한다.
type DeleteState = "idle" | "confirm" | "deleting" | "failed";
// 교체는 핀 위치를 어긋나게 할 수 있으므로 파일을 고른 뒤 한 번 더 확인한다. 이전 본문은 버전으로 남는다.
type ReplaceState = "idle" | "confirm" | "replacing" | "failed";

// 링크 새로 만들기는 이전 링크를 즉시 닫으므로 한 번 더 확인한다.
type ReissueState = "idle" | "confirm" | "reissuing" | "failed";
// 기간 설정은 고르는 즉시 요청한다. 실패 표시는 role="alert" 문구로만 한다.
type ExpireState = "idle" | "saving" | "failed";
// 비밀번호 설정·변경은 입력을 받아 저장한다. 해제는 입력 없이 바로 요청한다.
type PasswordState = "idle" | "editing" | "saving" | "failed";

// 팀으로 옮기기·개인으로 되돌리기는 확인 없이 즉시 요청한다. 실패 표시는 role="alert" 문구로만 한다.
type MoveState = "idle" | "saving" | "failed";

// 보기 전용 링크 만들기·끊기는 확인 없이 즉시 요청한다(비밀번호 해제와 같다). 실패 표시는 role="alert" 문구로만 한다.
type ViewLinkState = "idle" | "saving" | "failed";

const COPY_LABEL: Record<CopyState, string> = {
  idle: "댓글 링크 복사",
  copied: "복사했습니다",
  failed: "복사 실패",
};

export function FileActions({
  id,
  path,
  viewPath,
  hasPassword,
  encrypted,
  teamId,
  teams,
}: {
  id: number;
  path: string;
  viewPath: string | null;
  hasPassword: boolean;
  // 암호화 파일은 키가 업로드 직후 한 번만 보이므로, 키 없는 링크를 만드는 복사·새로 만들기·보기 전용 링크와 평문 교체를 숨긴다.
  encrypted: boolean;
  // 팀 파일이면 그 팀의 id. 소속 팀(teams)이 있으면 개인 파일을 그 팀으로 옮길 수 있다.
  teamId: number | null;
  teams: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [copy, setCopy] = useState<CopyState>("idle");
  const [viewCopy, setViewCopy] = useState<CopyState>("idle");
  const [viewLink, setViewLink] = useState<ViewLinkState>("idle");
  const [move, setMove] = useState<MoveState>("idle");
  const [del, setDel] = useState<DeleteState>("idle");
  const [replace, setReplace] = useState<ReplaceState>("idle");
  const [reissue, setReissue] = useState<ReissueState>("idle");
  const [expire, setExpire] = useState<ExpireState>("idle");
  const [pw, setPw] = useState<PasswordState>("idle");
  const [password, setPassword] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  // 연속으로 누르면 이전 타이머가 새 표시를 일찍 끄지 않도록 매번 취소한다.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const removeRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const reissueRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  // 요청 중 비활성화로 잃은 포커스를 실패 시 돌려준다.
  useEffect(() => {
    if (del === "failed") removeRef.current?.focus();
  }, [del]);
  useEffect(() => {
    if (replace === "failed") replaceRef.current?.focus();
  }, [replace]);
  useEffect(() => {
    if (reissue === "failed") reissueRef.current?.focus();
  }, [reissue]);
  // 재발급 뒤 목록 갱신으로 path가 새 토큰이 되면 처리 중 상태를 끝낸다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: path가 바뀔 때만 실행한다
  useEffect(() => {
    setReissue((r) => (r === "reissuing" ? "idle" : r));
  }, [path]);

  // 댓글 링크와 보기 전용 링크가 같은 타이머를 쓰므로 한 번에 하나의 표시만 켠다.
  async function copyLink(target: string, set: (s: CopyState) => void) {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${target}`);
    } catch {
      next = "failed";
    }
    clearTimeout(timer.current);
    setCopy("idle");
    setViewCopy("idle");
    set(next);
    timer.current = setTimeout(() => set("idle"), 1500);
  }

  // 만들기는 POST, 끊기는 DELETE. 성공하면 목록을 갱신해 버튼을 바꾼다.
  async function changeViewLink(method: "POST" | "DELETE") {
    setViewLink("saving");
    const res = await fetch(`/api/files/${id}/view-link`, { method }).catch(
      () => null,
    );
    if (res?.ok) {
      setViewLink("idle");
      router.refresh();
    } else setViewLink("failed");
  }

  // teamId가 null이면 개인 파일로 되돌린다.
  async function moveTo(target: number | null) {
    setMove("saving");
    const res = await fetch(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: target }),
    }).catch(() => null);
    if (res?.ok) {
      setMove("idle");
      router.refresh();
    } else setMove("failed");
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

  // days가 ""이면 안내 항목이라 요청하지 않는다. "none"은 만료 없음이다.
  async function setPeriod(days: string) {
    if (days === "") return;
    setExpire("saving");
    const res = await fetch(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expiresInDays: days === "none" ? null : Number(days),
      }),
    }).catch(() => null);
    if (res?.ok) {
      setExpire("idle");
      router.refresh();
    } else setExpire("failed");
  }

  // value가 null이면 비밀번호를 해제한다.
  async function savePassword(value: string | null) {
    setPw("saving");
    const res = await fetch(`/api/files/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: value }),
    }).catch(() => null);
    if (res?.ok) {
      setPw("idle");
      setPassword("");
      router.refresh();
    } else setPw("failed");
  }

  async function reissueLink() {
    setReissue("reissuing");
    const res = await fetch(`/api/files/${id}/reissue`, {
      method: "POST",
    }).catch(() => null);
    // 성공해도 목록이 새 토큰으로 갱신될 때까지(아래 effect) 처리 중으로 두어, 복사 버튼이 이전 링크를 복사하지 않게 한다.
    if (res?.ok) router.refresh();
    else setReissue("failed");
  }

  const confirming = del !== "idle";
  const replacing = replace !== "idle";
  const reissuing = reissue !== "idle";
  // 해제는 입력 없이 요청하므로(password가 비어 있음) saving·failed여도 입력 칸을 열지 않는다.
  const editingPw = pw === "editing" || (pw !== "idle" && password !== "");

  return (
    <div className={styles.actions}>
      {replacing ? (
        <span className={styles.replaceNote}>
          이전 본문은 버전 기록에 남아 뷰어에서 되돌릴 수 있습니다. 댓글은
          유지되며, 위치가 맞지 않는 핀은 목록에만 표시됩니다.
        </span>
      ) : null}
      {reissuing ? (
        <span className={styles.replaceNote}>
          이전 댓글 링크로는 더 이상 열 수 없습니다. 보기 전용 링크·댓글·조회
          기록은 그대로 유지됩니다.
        </span>
      ) : null}
      {editingPw ? (
        <>
          <span className={styles.replaceNote}>
            비밀번호는 링크와 따로 전달하세요.
          </span>
          <input
            className={styles.password}
            type="password"
            aria-label="비밀번호"
            autoComplete="new-password"
            maxLength={100}
            value={password}
            disabled={pw === "saving"}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password !== "") savePassword(password);
            }}
          />
          <button
            type="button"
            className={styles.copy}
            disabled={pw === "saving" || password === ""}
            onClick={() => savePassword(password)}
          >
            {pw === "saving" ? "저장 중…" : "저장"}
          </button>
          <button
            type="button"
            className={styles.remove}
            disabled={pw === "saving"}
            onClick={() => {
              setPw("idle");
              setPassword("");
            }}
          >
            취소
          </button>
        </>
      ) : confirming || replacing || reissuing ? null : (
        <>
          {encrypted ? null : (
            <>
              <button
                type="button"
                className={styles.copy}
                data-state={copy}
                aria-live="polite"
                onClick={() => copyLink(path, setCopy)}
              >
                {COPY_LABEL[copy]}
              </button>
              {viewPath === null ? (
                <button
                  type="button"
                  className={styles.remove}
                  disabled={viewLink === "saving"}
                  onClick={() => changeViewLink("POST")}
                >
                  보기 전용 링크 만들기
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={styles.copy}
                    data-state={viewCopy}
                    aria-live="polite"
                    onClick={() => copyLink(viewPath, setViewCopy)}
                  >
                    {viewCopy === "idle"
                      ? "보기 전용 링크 복사"
                      : COPY_LABEL[viewCopy]}
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={viewLink === "saving"}
                    onClick={() => changeViewLink("DELETE")}
                  >
                    보기 전용 링크 끊기
                  </button>
                </>
              )}
            </>
          )}
          {/* 현재 값을 역산해 보여주지 않는 동작 전용 컨트롤이다. 요청이 끝나면 안내 항목으로 돌아간다. */}
          <select
            className={styles.period}
            aria-label="링크 공개 기간"
            value=""
            disabled={expire === "saving"}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="">만료 설정…</option>
            <option value="none">만료 없음</option>
            <option value="1">1일</option>
            <option value="7">7일</option>
            <option value="30">30일</option>
          </select>
          <button
            type="button"
            className={styles.remove}
            disabled={pw === "saving"}
            onClick={() => setPw("editing")}
          >
            {hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
          </button>
          {hasPassword ? (
            <button
              type="button"
              className={styles.remove}
              disabled={pw === "saving"}
              onClick={() => savePassword(null)}
            >
              비밀번호 해제
            </button>
          ) : null}
        </>
      )}
      {confirming || replacing || reissuing || editingPw ? null : teamId !==
        null ? (
        <button
          type="button"
          className={styles.remove}
          disabled={move === "saving"}
          onClick={() => moveTo(null)}
        >
          개인으로 되돌리기
        </button>
      ) : (
        teams.map((t) => (
          <button
            key={t.id}
            type="button"
            className={styles.remove}
            disabled={move === "saving"}
            onClick={() => moveTo(t.id)}
          >
            팀으로 옮기기: {t.name}
          </button>
        ))
      )}
      {confirming || replacing || editingPw || encrypted ? null : (
        <button
          ref={reissueRef}
          type="button"
          className={reissuing ? styles.confirm : styles.remove}
          disabled={reissue === "reissuing"}
          onClick={() => (reissuing ? reissueLink() : setReissue("confirm"))}
        >
          {reissue === "reissuing"
            ? "만드는 중…"
            : reissue === "failed"
              ? "다시 시도"
              : reissuing
                ? "새 댓글 링크 만들기"
                : "댓글 링크 새로 만들기"}
        </button>
      )}
      {reissuing ? (
        <button
          type="button"
          className={styles.remove}
          disabled={reissue === "reissuing"}
          onClick={() => {
            setReissue("idle");
            reissueRef.current?.focus();
          }}
        >
          취소
        </button>
      ) : null}
      {confirming || reissuing || editingPw || encrypted ? null : (
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
      {reissuing || editingPw ? null : replacing ? (
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
      {move === "failed" ? (
        <span role="alert" className="sr-only">
          파일을 옮기지 못했습니다
        </span>
      ) : null}
      {del === "failed" ? (
        <span role="alert" className="sr-only">
          삭제하지 못했습니다
        </span>
      ) : null}
      {expire === "failed" ? (
        <span role="alert" className="sr-only">
          기간을 설정하지 못했습니다
        </span>
      ) : null}
      {pw === "failed" ? (
        <span role="alert" className="sr-only">
          비밀번호를 저장하지 못했습니다
        </span>
      ) : null}
      {viewLink === "failed" ? (
        <span role="alert" className="sr-only">
          보기 전용 링크를 바꾸지 못했습니다
        </span>
      ) : null}
      {reissue === "failed" ? (
        <span role="alert" className="sr-only">
          링크를 새로 만들지 못했습니다
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
