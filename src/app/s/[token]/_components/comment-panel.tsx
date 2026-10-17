"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export type ReplyItem = {
  id: number;
  authorName: string;
  isOwner: boolean;
  body: string;
  createdLabel: string;
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

function Author({ c }: { c: ReplyItem }) {
  return (
    <p className="comment-meta">
      <strong>{c.authorName}</strong>
      {c.isOwner ? " (소유자)" : ""} · {c.createdLabel}
    </p>
  );
}

// 파일 종류와 무관한 댓글 목록·작성 UI. pending은 뷰어가 만든 임시 핀(없으면 일반 댓글).
export function CommentPanel({
  token,
  items,
  isOwner,
  pending,
  onSubmitted,
}: {
  token: string;
  items: CommentItem[];
  isOwner: boolean;
  pending?: PendingPin | null;
  onSubmitted?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
            <Author c={c} />
            <p className="comment-body">
              {c.pinNo !== null ? `[${c.pinNo}] ` : ""}
              {c.body}
            </p>
            <div className="comment-actions">
              <button
                type="button"
                aria-label={`${c.authorName}님의 댓글에 답글`}
                onClick={() => setReplyTo(c)}
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
                    <Author c={r} />
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
          <p className="reply-note">
            {replyTo.authorName}님의 댓글에 답글
            <button type="button" onClick={() => setReplyTo(null)}>
              취소
            </button>
          </p>
        ) : pending ? (
          <p aria-live="polite">핀 위치에 댓글을 남깁니다.</p>
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
            autoComplete="off"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            required
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? "작성 중…" : "댓글 작성"}
        </button>
      </form>
    </aside>
  );
}
