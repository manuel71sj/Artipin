/** 경로의 id 조각을 양의 10진 정수로 읽는다. 아니면 NaN(바인딩하면 0행이라 호출부는 404로 이어진다). */
export function pathId(raw: string): number {
  return /^[1-9]\d*$/.test(raw) ? Number(raw) : Number.NaN;
}
