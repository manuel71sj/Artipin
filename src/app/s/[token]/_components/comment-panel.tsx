"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  htmlPin: {
    selector: string;
    relX: number;
    relY: number;
    quote?: string;
  } | null;
  pinNo: number | null;
  replies: ReplyItem[];
};

export type ImagePin = { kind: "image"; x: number; y: number };
export type HtmlPin = {
  kind: "html";
  selector: string;
  relX: number;
  relY: number;
  quote?: string;
};
export type PendingPin = ImagePin | HtmlPin;

// 답글 머리 줄: 작성자·시각, 오른쪽 끝에 삭제 아이콘.
function ReplyHead({ c, onDelete }: { c: ReplyItem; onDelete: () => void }) {
  return (
    <div className="comment-reply-head">
      <p className="comment-meta">
        <strong>{c.authorName}</strong>
        {c.isOwner ? <span className="comment-sub"> (소유자)</span> : null}{" "}
        <span className="comment-sub">{c.createdLabel}</span>
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

type Filter = "all" | "open" | "resolved";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "open", label: "미해결" },
  { value: "resolved", label: "해결" },
];

// 파일 종류와 무관한 댓글 목록. 한 줄로 접어 두고 누른 행만 펼친다(펼칠 때 핀 위치로 이동).
// 작성은 뷰어가 핀 위치에 띄우는 NewCommentPopover가 맡는다.
export function CommentPanel({
  items,
  isOwner,
  onSelect,
}: {
  items: CommentItem[];
  isOwner: boolean;
  onSelect: (c: CommentItem) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const openCount = items.filter((c) => !c.resolved).length;
  const shown = items.filter(
    (c) => filter === "all" || (filter === "open" ? !c.resolved : c.resolved),
  );

  function toggle(c: CommentItem) {
    const expanding = expandedId !== c.id;
    setExpandedId(expanding ? c.id : null);
    if (expanding && (c.pin || c.htmlPin)) onSelect(c);
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
      <div className="comments-head">
        <h2>댓글</h2>
        <span className="comments-count">
          미해결 {openCount} / 전체 {items.length}
        </span>
        <div className="comments-filter">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <p className="comment-empty">
          아직 댓글이 없습니다. 댓글 모드에서 화면을 눌러 첫 댓글을 남겨 보세요.
        </p>
      ) : (
        <ul>
          {shown.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <li
                key={c.id}
                className={`comment${c.resolved ? " resolved" : ""}${expanded ? " expanded" : ""}`}
              >
                <button
                  type="button"
                  className="comment-line"
                  aria-expanded={expanded}
                  onClick={() => toggle(c)}
                >
                  {c.pinNo != null ? (
                    <span className="comment-pin" aria-hidden="true">
                      {c.pinNo}
                    </span>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                  <span className="comment-author">
                    {c.pinNo != null ? (
                      <span className="sr-only">핀 {c.pinNo}, </span>
                    ) : null}
                    {c.authorName}
                  </span>
                  <span className="comment-snippet">
                    {expanded ? "" : c.body}
                  </span>
                  <span className="comment-time">{c.createdLabel}</span>
                </button>
                {expanded ? (
                  <div className="comment-detail">
                    {c.htmlPin?.quote ? (
                      <p className="comment-quote">{c.htmlPin.quote}</p>
                    ) : null}
                    <p className="comment-body">{c.body}</p>
                    {c.replies.map((r) => (
                      <div key={r.id} className="comment-reply">
                        <ReplyHead c={r} onDelete={() => remove(r.id)} />
                        <p className="comment-body">{r.body}</p>
                      </div>
                    ))}
                    {isOwner || c.canDelete ? (
                      <div className="comment-actions">
                        {isOwner ? (
                          <button
                            type="button"
                            className={c.resolved ? undefined : "primary"}
                            aria-label={`${c.authorName}님의 댓글 ${c.resolved ? "재개" : "해결"}`}
                            onClick={() => toggleResolved(c)}
                          >
                            {c.resolved ? "재개" : "해결"}
                          </button>
                        ) : null}
                        {c.canDelete ? (
                          <DeleteButton c={c} onClick={() => remove(c.id)} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <p className="comments-hint">
        로그인 없이 이름만 입력하면 댓글을 달 수 있습니다. 줄을 누르면 펼쳐지고
        핀 위치로 이동합니다.
      </p>

      {error ? (
        <p className="comment-error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
