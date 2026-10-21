"use client";

import { useState } from "react";
import {
  type CommentItem,
  CommentPanel,
  type ImagePin,
  type PdfPin,
} from "./comment-panel";
import { ModeToggle } from "./mode-toggle";
import { NewCommentPopover, PinPopover } from "./pin-popover";
import { useLiveComments } from "./use-live-comments";
import { usePointers } from "./use-pointers";

// 이미지는 pages가 1개, PDF는 페이지마다 PNG 하나씩이다. PDF 앵커는 페이지 번호(1부터)를 함께 가진다.
export function ImageViewer({
  pages,
  kind,
  alt,
  token,
  items: initialItems,
  isOwner,
}: {
  pages: string[];
  kind: "image" | "pdf";
  alt: string;
  token: string;
  items: CommentItem[];
  isOwner: boolean;
}) {
  const { items, viewing } = useLiveComments(token, initialItems);
  const { others, move: movePointer } = usePointers(token, viewing);
  const [commentMode, setCommentMode] = useState(false);
  const [pending, setPending] = useState<ImagePin | PdfPin | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const opened = items.find((c) => c.id === openId && c.pin);

  const clamp = (v: number) => Math.min(1, Math.max(0, v));

  function scrollToPin(c: CommentItem) {
    document
      .getElementById(`pin-${c.id}`)
      ?.scrollIntoView({ block: "center", inline: "center" });
  }

  const pinAt = (page: number, x: number, y: number): ImagePin | PdfPin =>
    kind === "pdf" ? { kind, page, x, y } : { kind, x, y };

  function place(e: React.MouseEvent<HTMLImageElement>, page: number) {
    if (!commentMode) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPending(
      pinAt(
        page,
        clamp((e.clientX - r.left) / r.width),
        clamp((e.clientY - r.top) / r.height),
      ),
    );
  }

  function track(e: React.PointerEvent<HTMLImageElement>, page: number) {
    const r = e.currentTarget.getBoundingClientRect();
    movePointer(
      pinAt(
        page,
        clamp((e.clientX - r.left) / r.width),
        clamp((e.clientY - r.top) / r.height),
      ),
    );
  }

  // 키보드: Enter·Space로 이미지 중앙에 핀을 놓고, 방향키로 2%(Shift는 10%)씩 옮긴다.
  // role="button"인 <img>는 브라우저가 Enter를 클릭으로 바꿔 주지 않으므로 직접 처리한다.
  function nudge(e: React.KeyboardEvent<HTMLImageElement>, page: number) {
    if (!commentMode) return;
    // PDF는 초점이 간 페이지의 핀만 다룬다. 다른 페이지에 놓인 핀은 Enter로 이 페이지 중앙에 다시 놓는다.
    const onThisPage = (p: ImagePin | PdfPin) =>
      p.kind !== "pdf" || p.page === page;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setPending((p) => (p && onThisPage(p) ? p : pinAt(page, 0.5, 0.5)));
      return;
    }
    if (!pending || !onThisPage(pending)) return;
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
      ...pending,
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
        <div className="pages">
          {pages.map((src, i) => {
            const page = i + 1;
            const pinOnPage = (c: CommentItem) => (c.pin?.page ?? 1) === page;
            const pageAlt = kind === "pdf" ? `${alt} ${page}페이지` : alt;
            return (
              <div
                key={src}
                className={commentMode ? "stage commenting" : "stage"}
              >
                {/* biome-ignore lint/performance/noImgElement: CONTENT_HOST의 외부 origin 이미지 */}
                <img
                  src={src}
                  alt={pageAlt}
                  fetchPriority={i === 0 ? "high" : undefined}
                  decoding="async"
                  onClick={(e) => place(e, page)}
                  onPointerMove={(e) => track(e, page)}
                  onKeyDown={(e) => nudge(e, page)}
                  role={commentMode ? "button" : undefined}
                  tabIndex={commentMode ? 0 : undefined}
                  aria-label={
                    commentMode
                      ? `${pageAlt}: 핀 위치 지정 (Enter, 방향키)`
                      : undefined
                  }
                />
                {others.map((o) =>
                  o.anchor.kind !== "html" &&
                  (o.anchor.kind === "pdf" ? o.anchor.page : 1) === page ? (
                    <span
                      key={o.id}
                      className="pointer-dot"
                      style={{
                        left: `${o.anchor.x * 100}%`,
                        top: `${o.anchor.y * 100}%`,
                      }}
                      aria-hidden="true"
                    />
                  ) : null,
                )}
                {items.map((c) =>
                  c.pin && pinOnPage(c) ? (
                    <button
                      key={c.id}
                      id={`pin-${c.id}`}
                      type="button"
                      data-pin
                      className={
                        c.resolved
                          ? "pin pin-button resolved"
                          : "pin pin-button"
                      }
                      style={{
                        left: `${c.pin.x * 100}%`,
                        top: `${c.pin.y * 100}%`,
                      }}
                      aria-label={`핀 ${c.pinNo} 댓글 보기`}
                      aria-expanded={openId === c.id}
                      onClick={() => {
                        setPending(null);
                        setOpenId(openId === c.id ? null : c.id);
                      }}
                    >
                      {c.pinNo}
                    </button>
                  ) : null,
                )}
                {opened?.pin && pinOnPage(opened) ? (
                  <PinPopover
                    key={opened.id}
                    token={token}
                    item={opened}
                    left={`${opened.pin.x * 100}%`}
                    top={`${opened.pin.y * 100}%`}
                    flip={opened.pin.x > 0.5}
                    onClose={() => setOpenId(null)}
                  />
                ) : null}
                {pending &&
                (pending.kind === "pdf" ? pending.page : 1) === page ? (
                  <>
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
                    <NewCommentPopover
                      token={token}
                      anchor={pending}
                      left={`${pending.x * 100}%`}
                      top={`${pending.y * 100}%`}
                      flip={pending.x > 0.5}
                      onClose={() => setPending(null)}
                    />
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <CommentPanel
        items={items}
        isOwner={isOwner}
        viewing={viewing}
        onSelect={scrollToPin}
      />
    </>
  );
}
