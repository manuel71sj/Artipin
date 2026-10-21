"use client";

import { useEffect, useRef, useState } from "react";
import type { CommentItem } from "./comment-panel";

const POLL_MS = 15_000;

// 서버가 렌더한 items를 15초마다 다시 받아 오는 목록으로 대체한다. 탭이 보일 때만 요청한다.
// 응답의 viewing은 지금 같은 파일을 보는 사람 수다. 탭을 숨기거나 파일을 더 볼 수 없으면 null이다.
export function useLiveComments(token: string, items: CommentItem[]) {
  // router.refresh()로 새 items가 오면 같은 렌더에서 폴링 상태를 덮는다(effect로 하면 옛 목록을 한 번 더 그린다).
  const [prev, setPrev] = useState(items);
  const [live, setLive] = useState(items);
  const [viewing, setViewing] = useState<number | null>(null);
  if (items !== prev) {
    setPrev(items);
    setLive(items);
  }
  // 늦게 도착한 오래된 응답을 버리기 위한 요청 순번.
  const seq = useRef(0);
  // router.refresh()로 새 items가 들어오면 그 전에 보낸 폴링 응답은 더 오래된 목록이므로 버린다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: items가 바뀔 때만 순번을 올린다
  useEffect(() => {
    seq.current++;
  }, [items]);

  useEffect(() => {
    async function tick() {
      if (document.visibilityState !== "visible") return;
      const mine = ++seq.current;
      try {
        const res = await fetch(`/api/s/${token}/comments`);
        if (mine !== seq.current) return;
        // 만료·삭제·링크 재발급: 접속자 수를 비워 SSE 연결이 정리되게 한다.
        if (res.status === 404) {
          setViewing(null);
          return;
        }
        if (!res.ok) return;
        const json = (await res.json()) as {
          items: CommentItem[];
          viewing: number;
        };
        if (mine !== seq.current) return;
        setLive(json.items);
        setViewing(json.viewing);
      } catch {
        // 네트워크 실패는 다음 주기에 다시 시도한다.
      }
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        tick();
      } else {
        seq.current++;
        setViewing(null);
      }
    }
    // 첫 요청은 한 주기 뒤에 보낸다. 첫 방문에서 조회 기록(ViewBeacon)과 동시에 보내면
    // 방문자 쿠키가 둘 발급되어 혼자 보는데도 2명으로 셀 수 있다.
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token]);

  return { items: live, viewing };
}
