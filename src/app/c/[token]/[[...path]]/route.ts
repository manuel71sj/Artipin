import { readFile as readAbsolute } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db, uploadsDir } from "@/db";
import { fileVersions } from "@/db/schema";
import { envelopeHtml, injectBridge } from "@/lib/bridge";
import { appOrigin } from "@/lib/hosts";
import { findViewableFile } from "@/lib/shared-file";
import { readFile } from "@/lib/storage";
import { verifyContentTicket } from "@/lib/unlock";
import { imageMime, SITE_TYPES } from "@/lib/upload";

// CONTENT_HOST에서만 도달한다(호스트 분기는 proxy.ts). 업로드 본문을 앱과 다른 origin에서 서빙한다.
// PDF는 페이지 PNG로 변환돼 있어 ?p={n}(기본 1)으로 n페이지 이미지를 서빙한다. ?v=와 함께 쓰면 그 버전의 페이지다.
// site(zip)는 /c/{token}/{path}로 디렉터리 안의 파일을 서빙한다. 진입은 index.html이고 ?v=는 받지 않는다.
// 비밀번호 파일은 모든 경로 앞에 /c/{token}/k/{ticket}/…를 요구하고, 접두사 뒤는 접두사가 없을 때와 같다.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path: all = [] } = await params;
  // ?v={no}가 있으면 그 버전의 본문을 서빙한다. 같은 토큰을 아는 사람에게 열려 있다(위협 모델 문서 참조).
  const v = request.nextUrl.searchParams.get("v");
  if (v !== null && !/^\d+$/.test(v))
    return new NextResponse(null, { status: 404 });
  const found = await findViewableFile(token, true);
  if (found.status !== "ok") return new NextResponse(null, { status: 404 });
  const { file } = found;
  // 비밀번호 파일은 뷰어 렌더가 발급한 경로 티켓이 있어야 한다. 접두사 두 칸을 떼고 나머지를 기존대로 처리한다.
  let segs = all;
  let prefix = `/c/${token}`;
  if (file.passwordHash !== null) {
    if (
      all[0] !== "k" ||
      !verifyContentTicket(token, file.passwordHash, all[1])
    )
      return new NextResponse(null, { status: 404 });
    segs = all.slice(2);
    prefix += `/k/${all[1]}`;
  }
  const csp = `sandbox allow-scripts; connect-src 'none'; form-action 'none'; frame-ancestors ${appOrigin()}`;

  // 암호화 파일은 저장 본문(암호문)을 읽지 않고 고정 봉투를 내준다. 평문은 뷰어가 복호화해 봉투로 넘긴다.
  if (file.encrypted) {
    if (file.kind !== "html" || v !== null || segs.length > 0)
      return new NextResponse(null, { status: 404 });
    return new NextResponse(envelopeHtml(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-cache",
      },
    });
  }

  if (file.kind === "site") {
    // 이전 버전의 상대 자산이 현재 버전에서 읽혀 섞이므로 ?v=는 받지 않는다.
    if (v !== null) return new NextResponse(null, { status: 404 });
    // 사이트 안 ./ 링크가 /c/{token}으로 착지해도 진입 페이지로 돌아온다. 상대 Location이라 프록시 뒤 호스트와 무관하다.
    if (segs.length === 0)
      return new NextResponse(null, {
        status: 302,
        headers: { Location: `${prefix}/index.html` },
      });
    if (
      segs.some((s) => s === "" || s === "." || s === ".." || /[\0/\\]/.test(s))
    )
      return new NextResponse(null, { status: 404 });
    const root = resolve(uploadsDir, file.storagePath);
    const target = resolve(root, ...segs);
    if (!target.startsWith(root + sep))
      return new NextResponse(null, { status: 404 });
    const ext = extname(target).slice(1).toLowerCase();
    const type = SITE_TYPES.get(ext);
    if (!type) return new NextResponse(null, { status: 404 });
    let content: Buffer;
    try {
      content = await readAbsolute(target);
    } catch {
      return new NextResponse(null, { status: 404 });
    }
    // 하위 HTML·SVG를 top-level로 열어도 CONTENT_HOST origin에서 스크립트가 돌지 않도록 본문 응답 전부에 CSP를 붙인다.
    // ACAO는 sandbox(opaque origin) 문서의 module 스크립트·@font-face 요청이 CORS 모드라 필요하다.
    return new NextResponse(
      ext === "html" || ext === "htm"
        ? injectBridge(content.toString("utf-8"))
        : new Uint8Array(content),
      {
        headers: {
          "Content-Type": type,
          "Content-Security-Policy": csp,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  // 파일 하나짜리 종류는 하위 경로가 없다.
  if (segs.length > 0) return new NextResponse(null, { status: 404 });

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
        "Referrer-Policy": "no-referrer",
        // 본문 교체 직후 이전 본문이 캐시에서 나오지 않도록 매번 재검증한다.
        "Cache-Control": "no-cache",
      },
    });
  }

  return new NextResponse(injectBridge(body.toString("utf-8")), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-cache",
    },
  });
}
