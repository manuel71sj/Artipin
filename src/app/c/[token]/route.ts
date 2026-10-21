import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fileVersions } from "@/db/schema";
import { injectBridge } from "@/lib/bridge";
import { appOrigin } from "@/lib/hosts";
import { findViewableFile } from "@/lib/shared-file";
import { readFile } from "@/lib/storage";
import { imageMime } from "@/lib/upload";

// CONTENT_HOST에서만 도달한다(호스트 분기는 proxy.ts). 업로드 본문을 앱과 다른 origin에서 서빙한다.
// PDF는 페이지 PNG로 변환돼 있어 ?p={n}(기본 1)으로 n페이지 이미지를 서빙한다. ?v=와 함께 쓰면 그 버전의 페이지다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  // ?v={no}가 있으면 그 버전의 본문을 서빙한다. 같은 토큰을 아는 사람에게 열려 있다(위협 모델 문서 참조).
  const v = request.nextUrl.searchParams.get("v");
  if (v !== null && !/^\d+$/.test(v))
    return new NextResponse(null, { status: 404 });
  const found = await findViewableFile(token);
  if (found.status !== "ok") return new NextResponse(null, { status: 404 });
  const { file } = found;

  let path = file.storagePath;
  if (v) {
    const [version] = await db
      .select({ storagePath: fileVersions.storagePath })
      .from(fileVersions)
      .where(
        and(eq(fileVersions.fileId, file.id), eq(fileVersions.no, Number(v))),
      );
    if (!version) return new NextResponse(null, { status: 404 });
    path = version.storagePath;
  }
  if (file.kind === "pdf") {
    const p = request.nextUrl.searchParams.get("p") ?? "1";
    if (!/^\d+$/.test(p)) return new NextResponse(null, { status: 404 });
    path = join(path, `${p}.png`);
  }

  let body: Buffer;
  try {
    body = await readFile(path);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (file.kind === "image" || file.kind === "pdf") {
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
