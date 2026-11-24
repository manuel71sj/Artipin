import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/db";
import { owners } from "@/db/schema";

// 관리자 판정 규칙은 이 파일 한 곳에 둔다: 세션의 owners 행 (provider, provider_account_id)가 환경변수 ADMIN_ACCOUNTS 목록에 있는가.
// email은 미검증 값일 수 있어 판정에 쓰지 않는다(소유자 식별에 email을 쓰지 않는 것과 같은 이유).
export async function isAdmin(session: Session | null): Promise<boolean> {
  if (session === null) return false;
  const [owner] = await db
    .select({
      provider: owners.provider,
      providerAccountId: owners.providerAccountId,
    })
    .from(owners)
    .where(eq(owners.id, Number(session.user.id)));
  if (!owner) return false;
  return (process.env.ADMIN_ACCOUNTS ?? "")
    .split(",")
    .map((a) => a.trim())
    .includes(`${owner.provider}:${owner.providerAccountId}`);
}
