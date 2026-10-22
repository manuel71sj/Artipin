import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { canManage } from "@/lib/access";
import { type Anchor, isRecord, parseAnchor } from "@/lib/anchor";
import { loadComments } from "@/lib/comments";
import { findViewableFile } from "@/lib/shared-file";
import { isUnlocked } from "@/lib/unlock";
import { getVisitorId, readVisitorId } from "@/lib/visitor";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

// 단일 인스턴스 전제: 프로세스 메모리 상태다. 다중 인스턴스로 가거나 재시작하면 "지금 보는 중" 숫자가 틀어진다.
// 파일 id → (방문자 id → 마지막 폴링 시각). 폴링이 heartbeat를 겸한다.
const seen = new Map<number, Map<string, number>>();
// 폴링 주기(15초) × 2 + 5초. 한 번 놓친 heartbeat로 빠지지 않는다.
const SEEN_TTL_MS = 35_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok")
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  const { file } = found;
  if (!(await isUnlocked(file)))
    return NextResponse.json(
      { error: "비밀번호가 필요합니다." },
      { status: 403 },
    );

  const session = await auth();
  const isOwner = await canManage(session, file);
  // 방문자 쿠키는 조회 기록(/view)만 발급한다. 첫 방문에서 두 요청이 동시에 발급해 한 사람이 둘로 세지지 않게 한다.
  const visitorId = await readVisitorId();
  const { items } = await loadComments(
    file.id,
    (v) => isOwner || v === visitorId,
  );

  // heartbeat를 기록하고, 같은 요청에서 모든 파일의 만료 항목을 지워 크기를 "최근 보는 사람"에 묶는다.
  // 쿠키가 아직 없으면(조회 기록 응답 전) 세지 않는다.
  const now = Date.now();
  const mine = seen.get(file.id) ?? new Map<string, number>();
  if (visitorId) mine.set(visitorId, now);
  seen.set(file.id, mine);
  for (const [fileId, visitors] of seen) {
    for (const [v, at] of visitors) {
      if (now - at > SEEN_TTL_MS) visitors.delete(v);
    }
    if (visitors.size === 0) seen.delete(fileId);
  }
  return NextResponse.json({ items, viewing: mine.size });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status !== "ok")
    return NextResponse.json(
      { error: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
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

  const authorName =
    typeof json.author_name === "string" ? json.author_name.trim() : "";
  if (authorName.length < 1 || authorName.length > 50)
    return bad("이름은 1~50자여야 합니다.");
  const body = typeof json.body === "string" ? json.body.trim() : "";
  if (body.length < 1 || body.length > 2000)
    return bad("댓글은 1~2000자여야 합니다.");

  const hasAnchor = json.anchor !== undefined && json.anchor !== null;
  let anchor: Anchor | null = null;
  if (hasAnchor) {
    const parsed = parseAnchor(json.anchor, file.kind);
    if ("error" in parsed) return bad(parsed.error);
    anchor = parsed.anchor;
  }

  let parentId: number | null = null;
  if (json.parentId !== undefined && json.parentId !== null) {
    if (!Number.isInteger(json.parentId))
      return bad("parentId가 올바르지 않습니다.");
    if (hasAnchor) return bad("답글에는 anchor를 지정할 수 없습니다.");
    const [parent] = await db
      .select({ id: comments.id })
      .from(comments)
      .where(
        and(
          eq(comments.id, json.parentId as number),
          eq(comments.fileId, file.id),
          isNull(comments.parentId),
        ),
      );
    if (!parent) return bad("답글 대상 댓글을 찾을 수 없습니다.");
    parentId = parent.id;
  }

  const session = await auth();
  const isOwner = await canManage(session, file);
  const visitorId = await getVisitorId();

  const [created] = await db
    .insert(comments)
    .values({
      fileId: file.id,
      parentId,
      authorName,
      visitorId,
      isOwner,
      body,
      anchor,
    })
    .returning({ id: comments.id });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
