"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CommentItem, PendingPin, ReplyItem } from "./comment-panel";

const NAME_KEY = "artipin:name";

function Entry({
  c,
  state,
  quote,
  onDelete,
}: {
  c: ReplyItem;
  state?: string;
  quote?: string;
  onDelete: () => void;
}) {
  return (
    <div className="pin-popover-entry">
      <div className="pin-popover-head">
        <p className="pin-popover-meta">
          <span>
            <strong>{c.authorName}</strong>
            {c.isOwner ? " (소유자)" : ""}
          </span>
          <span className="pin-popover-time">
            {c.createdLabel}
            {state ? ` · ${state}` : ""}
          </span>
        </p>
        {c.canDelete ? (
          <button
            type="button"
            className="pin-popover-delete"
            aria-label={`${c.authorName}님의 댓글 삭제`}
            onClick={onDelete}
          >
            삭제
          </button>
        ) : null}
      </div>
      {quote ? <p className="comment-quote">{quote}</p> : null}
      <p className="pin-popover-body">{c.body}</p>
    </div>
  );
}

// 핀을 누르면 그 핀의 댓글을 핀 옆에 박스로 보여 준다. left/top은 박스를 놓는 기준 좌표(CSS 값).
// 박스·핀 바깥을 누르거나 Esc를 누르면 닫는다. iframe 안의 클릭은 브리지가 pin-close로 알려 준다.
export function PinPopover({
  token,
  item,
  left,
  top,
  flip,
  onClose,
}: {
  token: string;
  item: CommentItem;
  left: string;
  top: string;
  flip: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  // 핀을 바꿔도 이 컴포넌트는 언마운트되지 않으므로, 오류에 핀 id를 붙여 다른 핀 박스에 남지 않게 한다.
  const [error, setError] = useState<{
    itemId: number;
    message: string;
  } | null>(null);
  const [replying, setReplying] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
  }, []);

  // 폼을 열면 비어 있는 첫 칸으로 포커스를 옮긴다
  useEffect(() => {
    if (!replying) return;
    (nameRef.current?.value ? bodyRef : nameRef).current?.focus();
  }, [replying]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Element;
      if (ref.current?.contains(t) || t.closest("[data-pin]")) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  async function remove(id: number) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(
      () => null,
    );
    if (res?.ok) {
      onClose();
      router.refresh();
      return;
    }
    setError({
      itemId: item.id,
      message:
        ((await res?.json().catch(() => null)) as { error?: string } | null)
          ?.error ?? "삭제하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
  }

  async function submitReply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/s/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_name: name, body, parentId: item.id }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError({
        itemId: item.id,
        message:
          ((await res?.json().catch(() => null)) as { error?: string } | null)
            ?.error ?? "답글을 작성하지 못했습니다. 잠시 후 다시 시도하세요.",
      });
      return;
    }
    localStorage.setItem(NAME_KEY, name.trim());
    setBody("");
    setReplying(false);
    router.refresh();
  }

  return (
    <div
      ref={ref}
      className={`pin-popover${flip ? " flip" : ""}${item.resolved ? " resolved" : ""}`}
      style={{ left, top }}
      role="dialog"
      aria-label={`핀 ${item.pinNo} 댓글`}
    >
      <div className="pin-popover-row">
        <span className="pin-popover-badge" aria-hidden="true">
          {item.pinNo}
        </span>
        <Entry
          c={item}
          state={item.resolved ? "해결됨" : undefined}
          quote={item.htmlPin?.quote}
          onDelete={() => remove(item.id)}
        />
      </div>
      {item.replies.map((r) => (
        <div key={r.id} className="pin-popover-reply">
          <Entry c={r} onDelete={() => remove(r.id)} />
        </div>
      ))}
      {replying ? (
        <form className="pin-popover-form" onSubmit={submitReply}>
          <label className="field">
            <span>이름</span>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
              spellCheck={false}
              maxLength={50}
              required
            />
          </label>
          <label className="field">
            <span>답글</span>
            <textarea
              ref={bodyRef}
              autoComplete="off"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={2}
              required
            />
          </label>
          <div className="pin-popover-form-foot">
            <button type="button" onClick={() => setReplying(false)}>
              취소
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "작성 중…" : "답글 작성"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="pin-popover-action"
          aria-label={`${item.authorName}님의 댓글에 답글`}
          onClick={() => setReplying(true)}
        >
          답글
        </button>
      )}
      {error?.itemId === item.id ? (
        <p role="alert" className="pin-popover-error">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

// 댓글모드에서 핀·DOM을 고르면 그 자리에 새 댓글 입력 폼을 박스로 띄운다. 취소·Esc·작성 완료로 닫는다.
// 핀을 다시 고르면 같은 박스가 새 위치로 옮겨 가므로 쓰던 내용은 유지된다.
export function NewCommentPopover({
  token,
  anchor,
  left,
  top,
  flip,
  onClose,
}: {
  token: string;
  anchor: PendingPin;
  left: string;
  top: string;
  flip: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/s/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author_name: name, body, anchor }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(
        ((await res?.json().catch(() => null)) as { error?: string } | null)
          ?.error ?? "댓글을 작성하지 못했습니다. 잠시 후 다시 시도하세요.",
      );
      return;
    }
    localStorage.setItem(NAME_KEY, name.trim());
    onClose();
    router.refresh();
  }

  return (
    <div
      className={`pin-popover${flip ? " flip" : ""}`}
      style={{ left, top }}
      role="dialog"
      aria-label="새 댓글"
    >
      <form className="pin-popover-form new" onSubmit={submit}>
        <label className="field">
          <span>이름</span>
          <input
            name="author_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="nickname"
            spellCheck={false}
            maxLength={50}
            required
          />
        </label>
        <label className="field">
          <span>댓글</span>
          <textarea
            name="body"
            autoComplete="off"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={2}
            required
          />
        </label>
        <div className="pin-popover-form-foot">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "작성 중…" : "댓글 작성"}
          </button>
        </div>
        {error ? (
          <p role="alert" className="pin-popover-error">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
