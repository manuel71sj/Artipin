import { parse } from "marked";

// 업로드 허용 형식·한도. 쓰면서 조정할 값은 여기만 고친다.
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const HTML_MAX_BYTES = 5 * 1024 * 1024;
// PDF는 업로드 때 pdftoppm으로 페이지 PNG로 바꾼다. PAGE_PX는 페이지 긴 변의 픽셀 상한이다.
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const PDF_MAX_PAGES = 50;
export const PDF_TIMEOUT_MS = 30_000;
export const PDF_PAGE_PX = 1600;
// zip은 업로드 때 풀어 uploads/<uuid>/ 디렉터리로 저장한다. SITE_MAX_BYTES는 압축을 푼 총량, SITE_MAX_ENTRIES는 읽은 항목 수(디렉터리·건너뛴 항목 포함)다.
export const ZIP_MAX_BYTES = 20 * 1024 * 1024;
export const SITE_MAX_BYTES = 20 * 1024 * 1024;
export const SITE_MAX_ENTRIES = 300;
// zip 안에 둘 수 있는 확장자와 서빙할 Content-Type. 표 밖 확장자는 업로드 거절·서빙 404다.
export const SITE_TYPES = new Map([
  ["html", "text/html; charset=utf-8"],
  ["htm", "text/html; charset=utf-8"],
  ["css", "text/css; charset=utf-8"],
  ["js", "text/javascript; charset=utf-8"],
  ["mjs", "text/javascript; charset=utf-8"],
  ["json", "application/json"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["ico", "image/x-icon"],
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
]);

const startsWith = (buf: Uint8Array, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

/** 본문 첫 바이트로 이미지 MIME을 판정한다. 이미지가 아니면 null. */
export function imageMime(
  buf: Uint8Array,
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
  )
    return "image/webp";
  return null;
}

export type UploadCheck =
  | { ok: true; kind: "image" | "html" | "pdf" | "site"; body: Buffer }
  | { ok: false; error: string };

export const mb = (bytes: number) => `${bytes / 1024 / 1024}MB`;

// 암호화 업로드 본문은 평문 앞뒤로 IV(12바이트)와 GCM 태그(16바이트)가 붙는다.
const ENCRYPTION_OVERHEAD = 28;

/** 암호화 업로드는 본문을 읽을 수 없으므로 클라이언트가 선언한 kind(html·image)와 크기만 본다. */
export function checkEncryptedUpload(kind: unknown, data: Buffer): UploadCheck {
  if (kind !== "html" && kind !== "image")
    return {
      ok: false,
      error: "암호화 업로드는 HTML과 이미지만 지원합니다.",
    };
  const limit = kind === "image" ? IMAGE_MAX_BYTES : HTML_MAX_BYTES;
  if (data.length > limit + ENCRYPTION_OVERHEAD)
    return {
      ok: false,
      error: `${kind === "image" ? "이미지" : "HTML"}는 ${mb(limit)} 이하만 올릴 수 있습니다.`,
    };
  return { ok: true, kind, body: data };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 변환 결과 껍데기. `</body>`가 있어야 injectBridge가 그 앞에 브리지를 넣는다.
const wrapDocument = (title: string, bodyHtml: string) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{max-width:46rem;margin:2rem auto;padding:0 1rem;font:16px/1.65 system-ui,sans-serif;color:#1a1a1a}
pre{overflow-x:auto;padding:.75rem 1rem;background:#f5f5f4;border-radius:4px;font:13px/1.5 ui-monospace,monospace}
code{font-family:ui-monospace,monospace}
table{border-collapse:collapse}th,td{border:1px solid #d6d3d1;padding:.35rem .6rem}
img{max-width:100%}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;

/**
 * 확장자·클라이언트 MIME은 믿지 않고 본문으로 판정하고 저장할 본문을 돌려준다.
 * 텍스트 형식은 확장자를 본다. .md·.markdown·.json은 HTML로 변환해 kind "html"로 저장한다.
 */
export function checkUpload(name: string, data: Buffer): UploadCheck {
  if (imageMime(data)) {
    if (data.length > IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `이미지는 ${mb(IMAGE_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    return { ok: true, kind: "image", body: data };
  }
  if (startsWith(data, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    // "%PDF-"
    if (data.length > PDF_MAX_BYTES) {
      return {
        ok: false,
        error: `PDF는 ${mb(PDF_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    return { ok: true, kind: "pdf", body: data };
  }
  if (startsWith(data, [0x50, 0x4b, 0x03, 0x04])) {
    // "PK\x03\x04". 풀기와 항목 검사는 저장 단계(extractSite)에서 한다.
    if (data.length > ZIP_MAX_BYTES) {
      return {
        ok: false,
        error: `zip은 ${mb(ZIP_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    return { ok: true, kind: "site", body: data };
  }
  const lower = name.toLowerCase();
  const isMarkdown = lower.endsWith(".md") || lower.endsWith(".markdown");
  const isJson = lower.endsWith(".json");
  if (lower.endsWith(".html") || isMarkdown || isJson) {
    if (data.length > HTML_MAX_BYTES) {
      return {
        ok: false,
        error: `HTML·Markdown·JSON 파일은 ${mb(HTML_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return {
        ok: false,
        error: "HTML·Markdown·JSON 파일은 UTF-8 인코딩만 올릴 수 있습니다.",
      };
    }
    if (isMarkdown) {
      const html = wrapDocument(name, parse(text, { async: false }));
      return { ok: true, kind: "html", body: Buffer.from(html, "utf-8") };
    }
    if (isJson) {
      // 지나치게 깊은 중첩은 parse를 통과해도 stringify에서 스택을 넘기므로 함께 감싼다.
      let pretty: string;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return { ok: false, error: "JSON 형식이 올바르지 않습니다." };
      }
      const html = wrapDocument(name, `<pre>${escapeHtml(pretty)}</pre>`);
      return { ok: true, kind: "html", body: Buffer.from(html, "utf-8") };
    }
    return { ok: true, kind: "html", body: data };
  }
  return {
    ok: false,
    error:
      "허용되지 않는 형식입니다. PNG·JPG·WebP 이미지, PDF, .zip 또는 .html·.md·.markdown·.json 파일만 올릴 수 있습니다.",
  };
}
