// 업로드 허용 형식·한도. 쓰면서 조정할 값은 여기만 고친다.
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const HTML_MAX_BYTES = 5 * 1024 * 1024;

const startsWith = (buf: Buffer, bytes: number[], offset = 0) =>
  bytes.every((b, i) => buf[offset + i] === b);

function isImage(buf: Buffer): boolean {
  const png = startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const jpeg = startsWith(buf, [0xff, 0xd8, 0xff]);
  const webp =
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  return png || jpeg || webp;
}

export type UploadCheck =
  | { ok: true; kind: "image" | "html" }
  | { ok: false; error: string };

const mb = (bytes: number) => `${bytes / 1024 / 1024}MB`;

/** 확장자·클라이언트 MIME은 믿지 않고 본문으로 판정한다. HTML만 확장자를 본다. */
export function checkUpload(name: string, data: Buffer): UploadCheck {
  if (isImage(data)) {
    if (data.length > IMAGE_MAX_BYTES) {
      return {
        ok: false,
        error: `이미지는 ${mb(IMAGE_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    return { ok: true, kind: "image" };
  }
  if (name.toLowerCase().endsWith(".html")) {
    if (data.length > HTML_MAX_BYTES) {
      return {
        ok: false,
        error: `HTML은 ${mb(HTML_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
      };
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      return { ok: false, error: "HTML은 UTF-8 인코딩만 올릴 수 있습니다." };
    }
    return { ok: true, kind: "html" };
  }
  return {
    ok: false,
    error:
      "허용되지 않는 형식입니다. PNG·JPG·WebP 이미지 또는 .html 파일만 올릴 수 있습니다.",
  };
}
