import { PDF_MAX_PAGES } from "@/lib/upload";

const isUnit = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export type Anchor =
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
export function parseAnchor(
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
