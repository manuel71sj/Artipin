"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type ReplyItem = {
  id: number;
  authorName: string;
  isOwner: boolean;
  body: string;
  createdLabel: string;
  canDelete: boolean;
};

export type CommentItem = ReplyItem & {
  resolved: boolean;
  pin: { x: number; y: number } | null;
  htmlPin: { selector: string; relX: number; relY: number } | null;
  pinNo: number | null;
  replies: ReplyItem[];
};

export type ImagePin = { kind: "image"; x: number; y: number };
export type HtmlPin = {
  kind: "html";
  selector: string;
  relX: number;
  relY: number;
};
export type PendingPin = ImagePin | HtmlPin;

const NAME_KEY = "artipin:name";

// 머리 줄: 핀 점, 작성자·시각, 오른쪽 끝에 삭제 아이콘. 핀 점은 장식이라 글로 따로 읽어 준다.
function Head({
  c,
  pinNo,
  onDelete,
}: {
  c: ReplyItem;
  pinNo?: number | null;
  onDelete: () => void;
}) {
  return (
    <div className="comment-head">
      {pinNo != null ? (
        <span className="comment-pin" aria-hidden="true">
          {pinNo}
        </span>
      ) : null}
      <p className="comment-meta">
        {pinNo != null ? <span className="sr-only">핀 {pinNo}, </span> : null}
        <strong>{c.authorName}</strong>
        {c.isOwner ? <span className="comment-sub"> (소유자)</span> : null}{" "}
        <span className="comment-sub comment-time">{c.createdLabel}</span>
      </p>
      {c.canDelete ? <DeleteButton c={c} onClick={onDelete} /> : null}
    </div>
  );
}

// 텍스트 없이 휴지통 아이콘만 쓰는 삭제 버튼. 이름은 aria-label로 전한다.
function DeleteButton({ c, onClick }: { c: ReplyItem; onClick: () => void }) {
  return (
    <button
      type="button"
      className="comment-delete"
      aria-label={`${c.authorName}님의 댓글 삭제`}
      onClick={onClick}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
      </svg>
    </button>
  );
}

// 파일 종류와 무관한 댓글 목록·작성 UI. pending은 뷰어가 만든 임시 핀(없으면 일반 댓글).
export function CommentPanel({
  token,
  items,
  isOwner,
  pending,
  onSubmitted,
  onSelect,
}: {
  token: string;
  items: CommentItem[];
  isOwner: boolean;
  pending?: PendingPin | null;
  onSubmitted?: () => void;
  onSelect: (c: CommentItem) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setName(localStorage.getItem(NAME_KEY) ?? "");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/s/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author_name: name,
        body,
        parentId: replyTo?.id ?? null,
        anchor: replyTo ? null : (pending ?? null),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        ((await res.json().catch(() => null)) as { error?: string } | null)
          ?.error ?? "댓글을 작성하지 못했습니다. 잠시 후 다시 시도하세요.",
      );
      return;
    }
    localStorage.setItem(NAME_KEY, name.trim());
    setBody("");
    setReplyTo(null);
    onSubmitted?.();
    router.refresh();
  }

  async function toggleResolved(c: CommentItem) {
    const res = await fetch(`/api/comments/${c.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !c.resolved }),
    });
    if (res.ok) router.refresh();
    else setError("처리하지 못했습니다. 잠시 후 다시 시도하세요.");
  }

  async function remove(id: number) {
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else setError("삭제하지 못했습니다. 잠시 후 다시 시도하세요.");
  }

  return (
    <aside className="comments">
      {items.length === 0 ? (
        <p className="comment-empty">
          아직 댓글이 없습니다. 첫 댓글을 남겨 보세요.
        </p>
      ) : null}
      <ul>
        {items.map((c) => (
          <li key={c.id} className={c.resolved ? "resolved" : undefined}>
            <Head c={c} pinNo={c.pinNo} onDelete={() => remove(c.id)} />
            {c.pin || c.htmlPin ? (
              <button
                type="button"
                className="comment-body comment-body-pin"
                title="핀 위치로 이동"
                onClick={() => onSelect(c)}
              >
                {c.body}
              </button>
            ) : (
              <p className="comment-body">{c.body}</p>
            )}
            <div className="comment-actions">
              <button
                type="button"
                aria-label={`${c.authorName}님의 댓글에 답글`}
                onClick={() => {
                  setReplyTo(c);
                  bodyRef.current?.focus();
                }}
              >
                답글
              </button>
              {isOwner ? (
                <button
                  type="button"
                  aria-label={`${c.authorName}님의 댓글 ${c.resolved ? "재개" : "해결"}`}
                  onClick={() => toggleResolved(c)}
                >
                  {c.resolved ? "재개" : "해결"}
                </button>
              ) : null}
              {c.resolved ? <span>해결됨</span> : null}
            </div>
            {c.replies.length > 0 ? (
              <ul className="replies">
                {c.replies.map((r) => (
                  <li key={r.id}>
                    <Head c={r} onDelete={() => remove(r.id)} />
                    <p className="comment-body">{r.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <form onSubmit={submit}>
        {replyTo ? (
          <div className="reply-note">
            <p>{replyTo.authorName}님의 댓글에 답글</p>
            <button type="button" onClick={() => setReplyTo(null)}>
              취소
            </button>
            <p className="reply-quote">{replyTo.body}</p>
          </div>
        ) : pending ? (
          <p className="reply-note" aria-live="polite">
            핀 위치에 댓글을 남깁니다.
          </p>
        ) : null}
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
            ref={bodyRef}
            autoComplete="off"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={2}
            required
          />
        </label>
        <div className="comment-foot">
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "작성 중…" : replyTo ? "답글 작성" : "댓글 작성"}
          </button>
        </div>
      </form>
    </aside>
  );
}
