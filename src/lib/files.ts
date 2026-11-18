import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { files, fileVersions } from "@/db/schema";
import { manageable } from "@/lib/access";
import { appOrigin } from "@/lib/hosts";
import { removeFile, saveUpload } from "@/lib/storage";
import { checkUpload } from "@/lib/upload";

export type FileRow = typeof files.$inferSelect;

/** open API(/api/v1)가 돌려주는 파일 객체. passwordHash·storagePath·ownerId는 싣지 않는다. */
export function fileJson(row: FileRow) {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    size: row.size,
    url: `${appOrigin()}/s/${row.shareToken}`,
    viewUrl:
      row.viewToken === null ? null : `${appOrigin()}/s/${row.viewToken}`,
    expiresAt: row.expiresAt,
    hasPassword: row.passwordHash !== null,
    encrypted: row.encrypted,
    teamId: row.teamId,
    createdAt: row.createdAt,
    replacedAt: row.replacedAt,
  };
}

// 파일 등록·교체·삭제의 본문. 세션 라우트(/api/files)와 키 라우트(/api/v1/files)가 함께 쓴다.

/** 검증을 통과한 본문을 저장하고 파일 행을 만든다. */
export async function createFile(
  ownerId: number,
  input: {
    title: string;
    kind: "image" | "html" | "pdf" | "site";
    body: Buffer;
    encrypted: boolean;
  },
): Promise<{ ok: true; file: FileRow } | { ok: false; error: string }> {
  const shareToken = randomBytes(16).toString("base64url");
  const saved = await saveUpload(input.kind, input.body);
  if (!saved.ok) return { ok: false, error: saved.error };
  const { storagePath } = saved;
  // 현재 본문 = 최대 no 버전이라는 불변식을 지키려고 files와 no=1 행을 한 트랜잭션에 만든다.
  // 트랜잭션이 실패하면 방금 저장한 본문이 가리키는 행이 없으므로 지우고 예외를 그대로 올린다.
  let file: FileRow;
  try {
    file = db.transaction((tx) => {
      const created = tx
        .insert(files)
        .values({
          ownerId,
          kind: input.kind,
          title: input.title,
          storagePath,
          size: input.body.length,
          shareToken,
          encrypted: input.encrypted,
        })
        .returning()
        .get();
      tx.insert(fileVersions)
        .values({
          fileId: created.id,
          no: 1,
          storagePath,
          size: input.body.length,
          title: input.title,
        })
        .run();
      return created;
    });
  } catch (e) {
    await removeFile(storagePath);
    throw e;
  }
  return { ok: true, file };
}

// 같은 행의 본문만 바꾼다. share_token·댓글·조회 기록은 files.id에 묶여 그대로 남고, 이전 본문은 버전으로 보관한다.
export async function replaceFile(
  ownerId: number,
  id: number,
  name: string,
  data: Buffer,
): Promise<
  { ok: true; file: FileRow } | { ok: false; status: 400 | 404; error: string }
> {
  const check = checkUpload(name, data);
  if (!check.ok) return { ok: false, status: 400, error: check.error };

  const [row] = await db
    .select({ kind: files.kind, encrypted: files.encrypted })
    .from(files)
    .where(and(eq(files.id, id), manageable(ownerId), isNull(files.deletedAt)));
  if (!row)
    return { ok: false, status: 404, error: "파일을 찾을 수 없습니다." };
  if (row.encrypted)
    return {
      ok: false,
      status: 400,
      error: "암호화 파일은 교체할 수 없습니다.",
    };
  // 이미지 앵커는 0~1 좌표, PDF 앵커는 페이지+좌표, HTML 앵커는 선택자라 종류가 바뀌면 기존 핀이 의미를 잃는다.
  if (check.kind !== row.kind)
    return {
      ok: false,
      status: 400,
      error: "같은 종류의 파일로만 교체할 수 있습니다.",
    };

  // 새 파일을 먼저 저장하고 행 갱신과 버전 행 추가를 한 트랜잭션에 묶는다. 갱신 전까지는 이전 본문이 서빙된다.
  const saved = await saveUpload(check.kind, check.body);
  if (!saved.ok) return { ok: false, status: 400, error: saved.error };
  const { storagePath } = saved;
  let replaced: FileRow | null;
  try {
    replaced = db.transaction((tx) => {
      // 조회 뒤 저장하는 동안 권한이 회수됐을 수 있으므로(팀 탈퇴·개인으로 되돌리기) 갱신에도 manageable을 건다. 0행이면 버전 행도 남기지 않는다.
      const [updated] = tx
        .update(files)
        .set({
          storagePath,
          size: check.body.length,
          title: name,
          replacedAt: Date.now(),
        })
        .where(
          and(eq(files.id, id), manageable(ownerId), isNull(files.deletedAt)),
        )
        .returning()
        .all();
      if (!updated) return null;
      tx.insert(fileVersions)
        .values({
          fileId: id,
          no: sql<number>`(select max(${fileVersions.no}) + 1 from ${fileVersions} where ${fileVersions.fileId} = ${id})`,
          storagePath,
          size: check.body.length,
          title: name,
        })
        .run();
      return updated;
    });
  } catch (e) {
    // 트랜잭션이 실패하면 새 본문을 가리키는 행이 없으므로 지우고 예외를 그대로 올린다.
    await removeFile(storagePath);
    throw e;
  }
  if (!replaced) {
    await removeFile(storagePath);
    return { ok: false, status: 404, error: "파일을 찾을 수 없습니다." };
  }
  return { ok: true, file: replaced };
}

/** 관리할 수 있는 파일을 지운다. 지웠으면 true, 대상이 없으면 false. 이미 삭제된 파일에 다시 부르면 남은 본문 정리를 다시 하고 false. */
export async function deleteFile(
  ownerId: number,
  id: number,
): Promise<boolean> {
  // 행·댓글·조회 행은 남기고 deleted_at만 기록한다. 모든 버전의 본문 파일을 지운다.
  const [deleted] = await db
    .update(files)
    .set({ deletedAt: Date.now() })
    .where(and(eq(files.id, id), manageable(ownerId), isNull(files.deletedAt)))
    .returning({ id: files.id });
  // 삭제 표시는 됐는데 본문 정리가 도중에 실패했을 수 있으므로, 이미 삭제된 관리 가능 파일이면 정리만 다시 돈다.
  let fileId = deleted?.id;
  if (fileId === undefined) {
    const [already] = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(eq(files.id, id), manageable(ownerId), isNotNull(files.deletedAt)),
      );
    if (!already) return false;
    fileId = already.id;
  }

  // 롤백 행은 이전 버전과 같은 storage_path를 가리키므로 중복을 걷어낸다.
  const paths = await db
    .selectDistinct({ storagePath: fileVersions.storagePath })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, fileId));
  await Promise.all(paths.map((p) => removeFile(p.storagePath)));
  return deleted !== undefined;
}
