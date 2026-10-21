"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type CommentItem, CommentPanel, type HtmlPin } from "./comment-panel";
import { ModeToggle } from "./mode-toggle";
import { NewCommentPopover, PinPopover } from "./pin-popover";
import { useLiveComments } from "./use-live-comments";
import { usePointers } from "./use-pointers";

const BRIDGE_TIMEOUT_MS = 3000;

// 반응형 확인용 iframe 폭. null은 뷰어 폭 전체다. 선택은 저장하지 않는다.
const VIEWPORTS = [
  { label: "데스크톱", width: null },
  { label: "태블릿", width: 768 },
  { label: "모바일", width: 390 },
] as const;

const isRel = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

// iframe(업로드 HTML)에서 온 메시지는 신뢰할 수 없는 입력이다. 허용 목록과 스키마를 통과한 것만 돌려준다.
function parseMessage(
  data: unknown,
):
  | { type: "bridge-ready"; path: string }
  | { type: "anchor-picked"; anchor: HtmlPin; x: number; y: number }
  | { type: "pin-click"; id: number; x: number; y: number }
  | { type: "pin-close" }
  | { type: "pointer"; anchor: HtmlPin }
  | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === "bridge-ready" &&
    typeof d.path === "string" &&
    d.path.length <= 2000
  )
    return { type: "bridge-ready", path: d.path };
  if (d.type === "pin-close") return { type: "pin-close" };
  if (
    d.type === "pointer" &&
    typeof d.selector === "string" &&
    d.selector.length >= 1 &&
    d.selector.length <= 500 &&
    isRel(d.relX) &&
    isRel(d.relY)
  ) {
    return {
      type: "pointer",
      anchor: {
        kind: "html",
        selector: d.selector,
        relX: d.relX,
        relY: d.relY,
      },
    };
  }
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
    isRel(d.relY) &&
    (d.quote === undefined ||
      (typeof d.quote === "string" &&
        d.quote.length >= 1 &&
        d.quote.length <= 300)) &&
    typeof d.x === "number" &&
    Number.isFinite(d.x) &&
    typeof d.y === "number" &&
    Number.isFinite(d.y)
  ) {
    return {
      type: "anchor-picked",
      x: d.x,
      y: d.y,
      anchor: {
        kind: "html",
        selector: d.selector,
        relX: d.relX,
        relY: d.relY,
        ...(typeof d.quote === "string" ? { quote: d.quote } : {}),
      },
    };
  }
  return null;
}

export function HtmlViewer({
  src,
  token,
  items: initialItems,
  isOwner,
  entryPath,
}: {
  src: string;
  token: string;
  items: CommentItem[];
  isOwner: boolean;
  // site(zip)의 진입 페이지 경로. 있으면 iframe 안에서 다른 페이지로 이동했을 때 핀을 끈다.
  entryPath?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { items, viewing } = useLiveComments(token, initialItems);
  const { others, move } = usePointers(token, viewing);
  // message 리스너는 한 번만 달리므로 최신 move를 ref로 읽는다.
  const moveRef = useRef(move);
  moveRef.current = move;
  const [listening, setListening] = useState(false);
  const [readySeq, setReadySeq] = useState(0);
  // 브리지가 알린 iframe 문서의 경로. 문서가 로드될 때마다 비우고 다시 받는다.
  const [path, setPath] = useState<string | null>(null);
  const bridgeReady = path !== null;
  const offEntry =
    entryPath !== undefined && path !== null && path !== entryPath;
  // 핀·커서는 진입 페이지로 확인된 문서에서만 주고받는다(zip 사이트는 경로 재확인 중에도 막는다).
  const onEntry = entryPath === undefined || path === entryPath;
  // 리스너가 최신 값을 읽도록 ref에 둔다.
  const onEntryRef = useRef(onEntry);
  onEntryRef.current = onEntry;
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [viewport, setViewport] = useState<number | null>(null);
  // x·y는 클릭한 자리(iframe 안 뷰포트 좌표)로, 새 댓글 박스를 놓는 기준이다.
  const [pending, setPending] = useState<{
    anchor: HtmlPin;
    x: number;
    y: number;
    flip: boolean;
  } | null>(null);
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
                quote: c.htmlPin.quote,
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
      if (msg.type === "bridge-ready") {
        setPath(msg.path);
        setReadySeq((n) => n + 1);
      } else if (msg.type === "pin-close") {
        setOpen(null);
        setPending(null);
      } else if (msg.type === "pointer") {
        if (onEntryRef.current) moveRef.current(msg.anchor);
      } else if (msg.type === "pin-click") {
        setPending(null);
        setOpen({
          id: msg.id,
          x: msg.x,
          y: msg.y,
          flip: msg.x > (iframeRef.current?.clientWidth ?? 0) / 2,
        });
      } else {
        setOpen(null);
        setPending({
          anchor: msg.anchor,
          x: msg.x,
          y: msg.y,
          flip: msg.x > (iframeRef.current?.clientWidth ?? 0) / 2,
        });
      }
    }
    window.addEventListener("message", onMessage);
    setListening(true);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!loaded || path !== null) return;
    const t = setTimeout(() => setTimedOut(true), BRIDGE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [loaded, path]);

  // 진입 페이지로 확인되지 않은 문서(하위 페이지·경로 재확인 중·브리지 없는 문서)에서는 작성창과 댓글 모드를 닫는다.
  useEffect(() => {
    if (onEntry) return;
    setCommentMode(false);
    setPending(null);
    setOpen(null);
  }, [onEntry]);

  useEffect(() => {
    if (readySeq > 0)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "mode", mode: commentMode ? "comment" : "browse" },
        "*",
      );
  }, [readySeq, commentMode]);

  useEffect(() => {
    if (readySeq > 0 && onEntry)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "render-pins", pins },
        "*",
      );
  }, [readySeq, pins, onEntry]);

  useEffect(() => {
    if (readySeq > 0 && onEntry)
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "render-pointers",
          pointers: others.flatMap((o) =>
            o.anchor.kind === "html"
              ? [
                  {
                    id: o.id,
                    selector: o.anchor.selector,
                    relX: o.anchor.relX,
                    relY: o.anchor.relY,
                  },
                ]
              : [],
          ),
        },
        "*",
      );
  }, [readySeq, others, onEntry]);

  useEffect(() => {
    if (readySeq > 0)
      iframeRef.current?.contentWindow?.postMessage(
        { type: "pending", selector: pending?.anchor.selector ?? null },
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
        <div className="viewer-tools">
          <ModeToggle
            commentMode={commentMode}
            disabled={!bridgeReady || offEntry}
            onChange={setMode}
          />
          <div className="mode-toggle">
            {VIEWPORTS.map((v) => (
              <button
                key={v.label}
                type="button"
                aria-pressed={viewport === v.width}
                onClick={() => setViewport(v.width)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
        {commentMode ? (
          <p className="viewer-note">화면의 원하는 위치를 클릭하세요.</p>
        ) : null}
        {offEntry ? (
          <p className="viewer-note">이 페이지는 핀 댓글 미지원</p>
        ) : null}
        {timedOut && !bridgeReady ? (
          <p className="viewer-note">
            이 파일은 핀 댓글을 지원하지 않을 수 있습니다.
          </p>
        ) : null}
        {/* 핀 박스가 iframe 기준 좌표로 놓이므로 iframe과 함께 무대 폭을 줄인다 */}
        <div
          className="html-stage"
          style={viewport ? { width: `${viewport}px` } : undefined}
        >
          {listening ? (
            <iframe
              ref={iframeRef}
              className="html-frame"
              title="업로드된 HTML"
              sandbox="allow-scripts"
              src={src}
              onLoad={() => {
                setLoaded(true);
                // bridge-ready가 load보다 먼저 올 수 있어 비운 뒤 브리지에 다시 묻는다. 답이 없으면 브리지 없는 페이지다.
                setPath(null);
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "hello" },
                  "*",
                );
              }}
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
          {pending ? (
            <NewCommentPopover
              token={token}
              anchor={pending.anchor}
              left={`${pending.x}px`}
              top={`${pending.y}px`}
              flip={pending.flip}
              onClose={() => setPending(null)}
            />
          ) : null}
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
