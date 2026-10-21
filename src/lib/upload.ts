import { parse } from "marked";

// 업로드 허용 형식·한도. 쓰면서 조정할 값은 여기만 고친다.
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const HTML_MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

/** 본문 첫 바이트로 이미지 MIME을 판정한다. 이미지가 아니면 null. */
export function imageMime(
  buf: Buffer,
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
  | { ok: true; kind: "image" | "html"; body: Buffer }
  | { ok: false; error: string };

const mb = (bytes: number) => `${bytes / 1024 / 1024}MB`;

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
      "허용되지 않는 형식입니다. PNG·JPG·WebP 이미지 또는 .html·.md·.markdown·.json 파일만 올릴 수 있습니다.",
  };
}
