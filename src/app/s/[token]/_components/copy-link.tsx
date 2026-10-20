"use client";

import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

const LABEL: Record<CopyState, string> = {
  idle: "링크 복사",
  copied: "복사했습니다",
  failed: "복사 실패",
};

// 지금 보고 있는 주소를 그대로 복사한다.
export function CopyLink() {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      next = "failed";
    }
    clearTimeout(timer.current);
    setState(next);
    timer.current = setTimeout(() => setState("idle"), 1500);
  }

  return (
    <button
      type="button"
      className="copy-link"
      data-state={state}
      aria-live="polite"
      onClick={copy}
    >
      {LABEL[state]}
    </button>
  );
}
