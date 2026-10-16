"use client";

import { useEffect } from "react";

/** 뷰어 로드 시 조회를 1회 기록한다. 크롤러 오집계를 줄이려고 서버 렌더가 아니라 클라이언트에서 호출한다. */
export function ViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    fetch(`/api/s/${token}/view`, { method: "POST" });
  }, [token]);
  return null;
}
