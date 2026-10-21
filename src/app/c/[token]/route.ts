import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { files } from "@/db/schema";
import { injectBridge } from "@/lib/bridge";
import { appOrigin } from "@/lib/hosts";
import { readFile } from "@/lib/storage";
import { imageMime } from "@/lib/upload";

// CONTENT_HOST에서만 도달한다(호스트 분기는 proxy.ts). 업로드 본문을 앱과 다른 origin에서 서빙한다.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const [file] = await db
    .select({ kind: files.kind, storagePath: files.storagePath })
    .from(files)
    .where(and(eq(files.shareToken, token), isNull(files.deletedAt)));
  if (!file) return new NextResponse(null, { status: 404 });

  let body: Buffer;
  try {
    body = await readFile(file.storagePath);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (file.kind === "image") {
    const mime = imageMime(body);
    if (!mime) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        // 본문 교체 직후 이전 본문이 캐시에서 나오지 않도록 매번 재검증한다.
        "Cache-Control": "no-cache",
      },
    });
  }

  return new NextResponse(injectBridge(body.toString("utf-8")), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `sandbox allow-scripts; connect-src 'none'; form-action 'none'; frame-ancestors ${appOrigin()}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
