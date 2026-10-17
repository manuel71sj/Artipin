"use client";

import { useState } from "react";
import { type CommentItem, CommentPanel, type ImagePin } from "./comment-panel";
import { ModeToggle } from "./mode-toggle";

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

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  function place(e: React.MouseEvent<HTMLImageElement>) {
    if (!commentMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPending({
      kind: "image",
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    });
  }

  // 키보드: Enter·Space로 이미지 중앙에 핀을 놓고, 방향키로 2%(Shift는 10%)씩 옮긴다.
  // role="button"인 <img>는 브라우저가 Enter를 클릭으로 바꿔 주지 않으므로 직접 처리한다.
  function nudge(e: React.KeyboardEvent<HTMLImageElement>) {
    if (!commentMode) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPending((p) => p ?? { kind: "image", x: 0.5, y: 0.5 });
      return;
    }
    if (!pending) return;
    const step = e.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    setPending({
      kind: "image",
      x: clamp(pending.x + d[0]),
      y: clamp(pending.y + d[1]),
    });
  }

  return (
    <>
      <section className="viewer">
        <ModeToggle
          commentMode={commentMode}
          onChange={(comment) => {
            setCommentMode(comment);
            if (!comment) setPending(null);
          }}
        />
        {commentMode ? (
          <p className="viewer-note">
            이미지를 클릭하거나, Tab으로 이미지에 초점을 맞춘 뒤 Enter를 눌러
            핀을 놓고 방향키로 옮기세요.
          </p>
        ) : null}
        <div className={commentMode ? "stage commenting" : "stage"}>
          {/* biome-ignore lint/performance/noImgElement: CONTENT_HOST의 외부 origin 이미지 */}
          <img
            src={src}
            alt={alt}
            fetchPriority="high"
            decoding="async"
            onClick={place}
            onKeyDown={nudge}
            role={commentMode ? "button" : undefined}
            tabIndex={commentMode ? 0 : undefined}
            aria-label={
              commentMode ? `${alt}: 핀 위치 지정 (Enter, 방향키)` : undefined
            }
          />
          {items.map((c) =>
            c.pin ? (
              <span
                key={c.id}
                className={c.resolved ? "pin resolved" : "pin"}
                style={{ left: `${c.pin.x * 100}%`, top: `${c.pin.y * 100}%` }}
                aria-hidden="true"
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
              aria-hidden="true"
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
