/** `APP_HOST`(host[:port])로 소유자 화면의 origin을 만든다. localhost면 http, 아니면 https. */
export function appOrigin(): string {
  const host = process.env.APP_HOST;
  if (!host) throw new Error("APP_HOST is not set");
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}

/** `CONTENT_HOST`(host[:port])로 업로드 본문을 서빙하는 origin을 만든다. 스킴 규칙은 appOrigin과 같다. */
export function contentOrigin(): string {
  const host = process.env.CONTENT_HOST;
  if (!host) throw new Error("CONTENT_HOST is not set");
  return `${host.includes("localhost") ? "http" : "https"}://${host}`;
}
