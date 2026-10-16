import { type NextRequest, NextResponse } from "next/server";

// Host 헤더로 두 역할을 나눈다. CONTENT_HOST는 /c/*만 응답하고(자체 CSP를 쓰므로 그대로 통과),
// 그 외 호스트(APP_HOST 포함)는 /c/*를 404로 막고 frame-ancestors 'none'을 붙인다.
export function proxy(request: NextRequest) {
  const isContentHost =
    request.headers.get("host") === process.env.CONTENT_HOST;
  const isContentPath = request.nextUrl.pathname.startsWith("/c/");

  if (isContentHost && isContentPath) return NextResponse.next();

  const response =
    isContentHost || isContentPath
      ? new NextResponse(null, { status: 404 })
      : NextResponse.next();
  if (!isContentHost)
    response.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  return response;
}
