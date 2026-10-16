import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { appOrigin } from "@/lib/hosts";

const COOKIE = "artipin_visitor";

/** APP_HOST 전용 익명 방문자 id. 쿠키가 없으면 발급해 설정한다(Route Handler에서만 호출). */
export async function getVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: appOrigin().startsWith("https:"),
  });
  return id;
}
