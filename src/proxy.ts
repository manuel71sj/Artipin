import { NextResponse } from "next/server";

// APP_HOST 응답에 frame-ancestors 'none'. /c/*(콘텐츠 호스트)는 자체 CSP를 쓰므로 제외한다.
export function proxy() {
  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}

export const config = {
  matcher: "/((?!c/).*)",
};
