"use client";

import { useEffect, useRef, useState } from "react";
import type { PendingPin } from "./comment-panel";

const SEND_MS = 100;
const EXPIRE_MS = 5000;

export type Pointer = { id: string; anchor: PendingPin };

// 같은 파일을 2명 이상 보는 동안만 다른 사람의 포인터를 SSE로 받고(others), 내 포인터를 POST로 보낸다(move).
// 서버는 보낸 사람에게는 돌려주지 않는다. 받은 포인터는 5초 동안 갱신이 없으면 지운다.
export function usePointers(token: string, viewing: number | null) {
  const sharing = viewing !== null && viewing >= 2;
  const [others, setOthers] = useState<Pointer[]>([]);
  const latest = useRef<PendingPin | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!sharing) return;
    const byId = new Map<string, { anchor: PendingPin; at: number }>();
    const publish = () =>
      setOthers(Array.from(byId, ([id, v]) => ({ id, anchor: v.anchor })));
    const source = new EventSource(`/api/s/${token}/pointer`);
    source.onmessage = (e) => {
      const p = JSON.parse(e.data) as Pointer;
      byId.set(p.id, { anchor: p.anchor, at: Date.now() });
      publish();
    };
    const sweep = setInterval(() => {
      let removed = false;
      for (const [id, v] of byId) {
        if (Date.now() - v.at > EXPIRE_MS) {
          byId.delete(id);
          removed = true;
        }
      }
      if (removed) publish();
    }, 1000);
    return () => {
      source.close();
      clearInterval(sweep);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      latest.current = null;
      setOthers([]);
    };
  }, [sharing, token]);

  // 마지막 값만 들고, 마지막 전송 뒤 100ms가 지나면 한 번 보낸다.
  function move(anchor: PendingPin) {
    if (!sharing) return;
    latest.current = anchor;
    if (timer.current) return;
    timer.current = setTimeout(
      () => {
        timer.current = null;
        lastSent.current = Date.now();
        fetch(`/api/s/${token}/pointer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anchor: latest.current }),
        }).catch(() => {});
      },
      Math.max(0, lastSent.current + SEND_MS - Date.now()),
    );
  }

  return { others, move };
}
