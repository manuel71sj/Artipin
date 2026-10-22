import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { files, fileVersions } from "@/db/schema";
import { manageable } from "@/lib/access";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// 소유자가 고른 버전의 본문으로 되돌린다. 파일 복사 없이 포인터만 옮기고, 새 번호의 버전으로 남긴다. body: { no: number }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return fail("로그인이 필요합니다.", 401);

  const no = ((await request.json()) as { no?: unknown } | null)?.no;
  if (!Number.isInteger(no)) return fail("no는 정수여야 합니다.", 400);

  const { id } = await params;
  const [version] = await db
    .select({
      storagePath: fileVersions.storagePath,
      size: fileVersions.size,
      title: fileVersions.title,
    })
    .from(files)
    .innerJoin(fileVersions, eq(fileVersions.fileId, files.id))
    .where(
      and(
        eq(files.id, Number(id)),
        manageable(Number(session.user.id)),
        isNull(files.deletedAt),
        eq(fileVersions.no, no as number),
      ),
    );
  if (!version) return fail("버전을 찾을 수 없습니다.", 404);

  db.transaction((tx) => {
    tx.insert(fileVersions)
      .values({
        fileId: Number(id),
        no: sql<number>`(select max(${fileVersions.no}) + 1 from ${fileVersions} where ${fileVersions.fileId} = ${Number(id)})`,
        ...version,
      })
      .run();
    tx.update(files)
      .set({ ...version, replacedAt: Date.now() })
      .where(eq(files.id, Number(id)))
      .run();
  });
  return new NextResponse(null, { status: 204 });
}
