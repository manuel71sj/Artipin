"use client";

import { useState } from "react";
import { type CommentItem, CommentPanel, type ImagePin } from "./comment-panel";

export function ImageViewer({
  src,
  alt,
  token,
  items,
  isOwner,
}: {
  src: string;
  alt: string;
  token: string;
  items: CommentItem[];
  isOwner: boolean;
}) {
  const [commentMode, setCommentMode] = useState(false);
  const [pending, setPending] = useState<ImagePin | null>(null);

  function place(e: React.MouseEvent<HTMLImageElement>) {
    if (!commentMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPending({
      kind: "image",
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    });
  }

  return (
    <>
      <section className="viewer">
        <label>
          <input
            type="checkbox"
            checked={commentMode}
            onChange={(e) => {
              setCommentMode(e.target.checked);
              if (!e.target.checked) setPending(null);
            }}
          />{" "}
          댓글 모드
        </label>
        <div className={commentMode ? "stage commenting" : "stage"}>
          {/* biome-ignore lint/performance/noImgElement: CONTENT_HOST의 외부 origin 이미지 */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: 핀 위치 지정은 포인터 전용 */}
          <img src={src} alt={alt} onClick={place} />
          {items.map((c) =>
            c.pin ? (
              <span
                key={c.id}
                className={c.resolved ? "pin resolved" : "pin"}
                style={{ left: `${c.pin.x * 100}%`, top: `${c.pin.y * 100}%` }}
              >
                {c.pinNo}
              </span>
            ) : null,
          )}
          {pending ? (
            <span
              className="pin pending"
              style={{
                left: `${pending.x * 100}%`,
                top: `${pending.y * 100}%`,
              }}
            >
              +
            </span>
          ) : null}
        </div>
      </section>
      <CommentPanel
        token={token}
        items={items}
        isOwner={isOwner}
        pending={pending}
        onSubmitted={() => setPending(null)}
      />
    </>
  );
}
