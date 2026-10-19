"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type CommentItem, CommentPanel, type HtmlPin } from "./comment-panel";
import { ModeToggle } from "./mode-toggle";
import { PinPopover } from "./pin-popover";

const BRIDGE_TIMEOUT_MS = 3000;

const isRel = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

// iframe(업로드 HTML)에서 온 메시지는 신뢰할 수 없는 입력이다. 허용 목록과 스키마를 통과한 것만 돌려준다.
function parseMessage(
  data: unknown,
):
  | { type: "bridge-ready" }
  | { type: "anchor-picked"; anchor: HtmlPin }
  | { type: "pin-click"; id: number; x: number; y: number }
  | { type: "pin-close" }
  | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.type === "bridge-ready") return { type: "bridge-ready" };
  if (d.type === "pin-close") return { type: "pin-close" };
  if (
    d.type === "pin-click" &&
    typeof d.id === "number" &&
    typeof d.x === "number" &&
    Number.isFinite(d.x) &&
    typeof d.y === "number" &&
    Number.isFinite(d.y)
  ) {
    return { type: "pin-click", id: d.id, x: d.x, y: d.y };
  }
  if (
    d.type === "anchor-picked" &&
    typeof d.selector === "string" &&
    d.selector.length >= 1 &&
    d.selector.length <= 500 &&
    isRel(d.relX) &&
    isRel(d.relY)
  ) {
    return {
      type: "anchor-picked",
      anchor: {
        kind: "html",
        selector: d.selector,
        relX: d.relX,
        relY: d.relY,
      },
    };
  }
  return null;
}

export function HtmlViewer({
  src,
  token,
  items,
  isOwner,
}: {
  src: string;
  token: string;
  items: CommentItem[];
  isOwner: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [listening, setListening] = useState(false);
  const [readySeq, setReadySeq] = useState(0);
  const bridgeReady = readySeq > 0;
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [pending, setPending] = useState<HtmlPin | null>(null);
  // x·y는 iframe 안 뷰포트 좌표(브리지가 핀 중심을 보낸다). 박스 본문은 부모가 가진 댓글에서 id로 찾는다.
  const [open, setOpen] = useState<{
    id: number;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);
  const opened = open ? items.find((c) => c.id === open.id && c.htmlPin) : null;

  const pins = useMemo(
    () =>
      items.flatMap((c) =>
        c.htmlPin && c.pinNo !== null
          ? [
              {
                id: c.id,
                n: c.pinNo,
                selector: c.htmlPin.selector,
                relX: c.htmlPin.relX,
                relY: c.htmlPin.relY,
                resolved: c.resolved,
              },
            ]
          : [],
      ),
    [items],
  );

  // iframe보다 먼저 리스너를 달아 bridge-ready를 놓치지 않는다(iframe은 listening 이후에 렌더).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const msg = parseMessage(e.data);
      if (!msg) return;
      if (msg.type === "bridge-ready") setReadySeq((n) => n + 1);
      else if (msg.type === "pin-close") setOpen(null);
      else if (msg.type === "pin-click")
        setOpen({
          id: msg.id,
          x: msg.x,
          y: msg.y,
          flip: msg.x > (iframeRef.current?.clientWidth ?? 0) / 2,
        });
      else setPending(msg.anchor);
    }
    window.addEventListener("message", onMessage);
    setListening(true);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!loaded || readySeq > 0) return;
    const t = setTimeout(() => setTimedOut(true), BRIDGE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loaded, readySeq]);

  useEffect(() => {
    if (readySeq > 0)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "mode", mode: commentMode ? "comment" : "browse" },
        "*",
      );
  }, [readySeq, commentMode]);

  useEffect(() => {
    if (readySeq > 0)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "render-pins", pins },
        "*",
      );
  }, [readySeq, pins]);

  useEffect(() => {
    if (readySeq > 0)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "pending", selector: pending?.selector ?? null },
        "*",
      );
  }, [readySeq, pending]);

  function setMode(comment: boolean) {
    setCommentMode(comment);
    if (!comment) setPending(null);
  }

  function scrollToPin(c: CommentItem) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "scroll-to-pin", id: c.id },
      "*",
    );
  }

  return (
    <>
      <section className="viewer">
        <ModeToggle
          commentMode={commentMode}
          disabled={!bridgeReady}
          onChange={setMode}
        />
        {timedOut && !bridgeReady ? (
          <p className="viewer-note">
            이 파일은 핀 댓글을 지원하지 않을 수 있습니다.
          </p>
        ) : null}
        <div className="html-stage">
          {listening ? (
            <iframe
              ref={iframeRef}
              className="html-frame"
              title="업로드된 HTML"
              sandbox="allow-scripts"
              src={src}
              onLoad={() => setLoaded(true)}
            />
          ) : null}
          {opened && open ? (
            <PinPopover
              key={opened.id}
              token={token}
              item={opened}
              left={`${open.x}px`}
              top={`${open.y}px`}
              flip={open.flip}
              onClose={() => setOpen(null)}
            />
          ) : null}
        </div>
      </section>
      <CommentPanel
        token={token}
        items={items}
        isOwner={isOwner}
        pending={pending}
        onSubmitted={() => setPending(null)}
        onSelect={scrollToPin}
      />
    </>
  );
}
