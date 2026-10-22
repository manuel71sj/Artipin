import { eq, type SQL } from "drizzle-orm";
import type { Session } from "next-auth";
import { files } from "@/db/schema";

// 파일을 소유자처럼 다룰 수 있는지의 규칙은 이 파일 한 곳에 둔다.
// manageable은 SQL 조건, canManage는 이미 읽은 행에 대한 값 판정으로, 같은 규칙의 두 표현이라 함께 바꾼다.
export const manageable = (ownerId: number): SQL => eq(files.ownerId, ownerId);

export async function canManage(
  session: Session | null,
  file: { ownerId: number },
): Promise<boolean> {
  return session !== null && Number(session.user.id) === file.ownerId;
}
