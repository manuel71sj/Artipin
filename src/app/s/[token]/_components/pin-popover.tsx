"use client";

import { useEffect, useRef } from "react";
import type { CommentItem, ReplyItem } from "./comment-panel";

function Entry({ c }: { c: ReplyItem }) {
  return (
    <>
      <p className="comment-meta">
        <strong>{c.authorName}</strong>
        {c.isOwner ? " (소유자)" : ""} · {c.createdLabel}
      </p>
      <p className="comment-body">{c.body}</p>
    </>
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
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={ref}
      className={flip ? "pin-popover flip" : "pin-popover"}
      style={{ left, top }}
      role="dialog"
      aria-label={`핀 ${item.pinNo} 댓글`}
    >
      <Entry c={item} />
      {item.replies.map((r) => (
        <div key={r.id} className="pin-popover-reply">
          <Entry c={r} />
        </div>
      ))}
    </div>
  );
}
