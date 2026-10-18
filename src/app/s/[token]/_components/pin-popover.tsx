"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CommentItem, ReplyItem } from "./comment-panel";

function Entry({
  c,
  state,
  onDelete,
}: {
  c: ReplyItem;
  state?: string;
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
      <p className="pin-popover-body">{c.body}</p>
    </div>
  );
}

// 핀을 누르면 그 핀의 댓글을 핀 옆에 박스로 보여 준다. left/top은 박스를 놓는 기준 좌표(CSS 값).
// 박스·핀 바깥을 누르거나 Esc를 누르면 닫는다. iframe 안의 클릭은 브리지가 pin-close로 알려 준다.
export function PinPopover({
  item,
  left,
  top,
  flip,
  onClose,
}: {
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
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) {
      onClose();
      router.refresh();
      return;
    }
    setError({
      itemId: item.id,
      message:
        ((await res.json().catch(() => null)) as { error?: string } | null)
          ?.error ?? "삭제하지 못했습니다. 잠시 후 다시 시도하세요.",
    });
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
          onDelete={() => remove(item.id)}
        />
      </div>
      {item.replies.map((r) => (
        <div key={r.id} className="pin-popover-reply">
          <Entry c={r} onDelete={() => remove(r.id)} />
        </div>
      ))}
      {error?.itemId === item.id ? (
        <p role="alert" className="pin-popover-error">
          {error.message}
        </p>
      ) : null}
    </div>
  );
}
