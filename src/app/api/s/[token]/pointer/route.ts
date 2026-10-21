import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isRecord, parseAnchor } from "@/lib/anchor";
import { findViewableFile } from "@/lib/shared-file";
import { isUnlocked } from "@/lib/unlock";
import { getVisitorId } from "@/lib/visitor";

const notFound = () =>
  NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

// 단일 인스턴스 전제: 구독자 집합은 프로세스 메모리다. 다중 인스턴스로 가면 다른 인스턴스의 커서가 보이지 않는다.
// 키는 파일 id가 아니라 요청 경로의 토큰이라, 링크를 새로 만들면 옛 링크로 열린 연결에는 커서가 가지 않는다.
// passwordHash는 구독 시점의 비밀번호 상태(비교용, 메모리에만 둔다). 현재와 다르면 중계하지 않는다.
type Sub = {
  visitorId: string;
  passwordHash: string | null;
  send: (chunk: string) => void;
};
const subs = new Map<string, Set<Sub>>();

// 다른 방문자에게 내보내는 id. 방문자 쿠키 값(삭제 권한의 근거)을 그대로 쓰지 않고, 서버 시작마다 달라지는 salt와 파일 id로 해시한다.
const SALT = randomBytes(16);
const pidOf = (fileId: number, visitorId: string) =>
  createHash("sha256")
    .update(SALT)
    .update(`${fileId}:${visitorId}`)
    .digest("hex")
    .slice(0, 12);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok") return notFound();
  const { file } = found;
  if (!(await isUnlocked(file)))
    return NextResponse.json(
      { error: "비밀번호가 필요합니다." },
      { status: 403 },
    );
  const visitorId = await getVisitorId();

  const encoder = new TextEncoder();
  let sub: Sub;
  const stream = new ReadableStream({
    start(controller) {
      sub = {
        visitorId,
        passwordHash: file.passwordHash,
        send: (chunk) => controller.enqueue(encoder.encode(chunk)),
      };
      const set = subs.get(token) ?? new Set<Sub>();
      set.add(sub);
      subs.set(token, set);
    },
    // 클라이언트가 연결을 끊으면 호출된다. 구독 해제는 이 한 곳에서만 한다.
    cancel() {
      const set = subs.get(token);
      set?.delete(sub);
      if (set?.size === 0) subs.delete(token);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      // no-transform: Next 내장 압축이 응답을 버퍼링하지 않게 한다.
      "Cache-Control": "no-cache, no-transform",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok") return notFound();
  const { file } = found;
  if (!(await isUnlocked(file)))
    return NextResponse.json(
      { error: "비밀번호가 필요합니다." },
      { status: 403 },
    );

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad("JSON 형식이 올바르지 않습니다.");
  }
  if (!isRecord(json)) return bad("요청 본문이 올바르지 않습니다.");
  const parsed = parseAnchor(json.anchor, file.kind);
  if ("error" in parsed) return bad(parsed.error);

  // 알려진 키만 내보낸다(html은 quote를 버린다).
  const a = parsed.anchor;
  const anchor =
    a.kind === "html"
      ? { kind: a.kind, selector: a.selector, relX: a.relX, relY: a.relY }
      : a;

  const visitorId = await getVisitorId();
  const chunk = `data: ${JSON.stringify({ id: pidOf(file.id, visitorId), anchor })}\n\n`;
  for (const s of subs.get(token) ?? []) {
    if (s.visitorId !== visitorId && s.passwordHash === file.passwordHash)
      s.send(chunk);
  }
  return new Response(null, { status: 204 });
}
