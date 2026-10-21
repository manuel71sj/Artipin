import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { findViewableFile } from "@/lib/shared-file";
import { PDF_MAX_PAGES } from "@/lib/upload";
import { getVisitorId } from "@/lib/visitor";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

const isUnit = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

type Anchor =
  | { kind: "image"; x: number; y: number }
  | { kind: "pdf"; page: number; x: number; y: number }
  | {
      kind: "html";
      selector: string;
      relX: number;
      relY: number;
      quote?: string;
    };

// 파일 종류와 일치하는 앵커만 허용하고, 알려진 키만 뽑아 돌려준다.
function parseAnchor(
  raw: unknown,
  fileKind: "image" | "html" | "pdf",
): { anchor: Anchor } | { error: string } {
  if (!isRecord(raw)) return { error: "anchor 형식이 올바르지 않습니다." };
  if (raw.kind !== "image" && raw.kind !== "html" && raw.kind !== "pdf")
    return { error: "anchor.kind가 올바르지 않습니다." };
  if (raw.kind !== fileKind)
    return { error: "anchor.kind가 파일 종류와 맞지 않습니다." };

  if (raw.kind === "image") {
    if (!isUnit(raw.x) || !isUnit(raw.y))
      return { error: "anchor 좌표는 0~1 사이 숫자여야 합니다." };
    return { anchor: { kind: "image", x: raw.x, y: raw.y } };
  }
  if (raw.kind === "pdf") {
    if (
      !Number.isInteger(raw.page) ||
      (raw.page as number) < 1 ||
      (raw.page as number) > PDF_MAX_PAGES
    )
      return { error: `anchor.page는 1~${PDF_MAX_PAGES} 정수여야 합니다.` };
    if (!isUnit(raw.x) || !isUnit(raw.y))
      return { error: "anchor 좌표는 0~1 사이 숫자여야 합니다." };
    return {
      anchor: { kind: "pdf", page: raw.page as number, x: raw.x, y: raw.y },
    };
  }
  if (
    typeof raw.selector !== "string" ||
    raw.selector.length < 1 ||
    raw.selector.length > 500
  )
    return { error: "anchor.selector는 1~500자 문자열이어야 합니다." };
  if (!isUnit(raw.relX) || !isUnit(raw.relY))
    return { error: "anchor 좌표는 0~1 사이 숫자여야 합니다." };
  if (
    raw.quote !== undefined &&
    (typeof raw.quote !== "string" ||
      raw.quote.length < 1 ||
      raw.quote.length > 300)
  )
    return { error: "anchor.quote는 1~300자 문자열이어야 합니다." };
  return {
    anchor: {
      kind: "html",
      selector: raw.selector,
      relX: raw.relX,
      relY: raw.relY,
      ...(typeof raw.quote === "string" ? { quote: raw.quote } : {}),
    },
  };
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
  const isOwner = Boolean(session) && Number(session?.user.id) === file.ownerId;
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
