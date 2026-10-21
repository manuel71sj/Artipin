import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile as read,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { uploadsDir } from "@/db";
import { PDF_MAX_PAGES, PDF_PAGE_PX, PDF_TIMEOUT_MS } from "@/lib/upload";

/** 본문을 저장하고 `files.storage_path`에 넣을 파일명을 돌려준다. */
export async function saveFile(data: Buffer): Promise<string> {
  const name = randomUUID();
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, name), data);
  return name;
}

type Saved = { ok: true; storagePath: string } | { ok: false; error: string };

/**
 * 업로드 본문을 저장한다. PDF는 pdftoppm으로 `uploads/<uuid>/{n}.png`로 변환하고,
 * 실패하면 디렉터리를 지워 고아를 남기지 않는다. pdftoppm이 없으면(ENOENT) 입력 오류가 아니므로 예외를 던진다.
 */
export async function saveUpload(
  kind: "image" | "html" | "pdf",
  body: Buffer,
): Promise<Saved> {
  if (kind !== "pdf") return { ok: true, storagePath: await saveFile(body) };

  const name = randomUUID();
  const dir = join(uploadsDir, name);
  await mkdir(dir, { recursive: true });
  let saved = false;
  try {
    try {
      await new Promise<void>((resolve, reject) => {
        // 신뢰할 수 없는 PDF를 읽는 자식이라 비밀 env를 넘기지 않는다(NODE_ENV는 ProcessEnv 타입 때문에 함께 둔다). -l은 페이지 상한 초과를 알아챌 만큼만 렌더한다.
        const child = execFile(
          "pdftoppm",
          [
            "-png",
            "-scale-to",
            String(PDF_PAGE_PX),
            "-l",
            String(PDF_MAX_PAGES + 1),
            "-",
            join(dir, "p"),
          ],
          {
            timeout: PDF_TIMEOUT_MS,
            killSignal: "SIGKILL",
            env: { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV },
          },
          (err) => (err ? reject(err) : resolve()),
        );
        // 자식이 먼저 죽으면 stdin에 EPIPE가 나는데, 실패 판정은 위 콜백의 에러로 한다.
        child.stdin?.on("error", () => {});
        child.stdin?.end(body);
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") throw err;
      return {
        ok: false,
        error: (err as { killed?: boolean }).killed
          ? "PDF 변환 시간이 초과되었습니다."
          : "PDF를 읽을 수 없습니다.",
      };
    }
    const pages = await readdir(dir);
    if (pages.length === 0)
      return { ok: false, error: "PDF를 읽을 수 없습니다." };
    if (pages.length > PDF_MAX_PAGES)
      return {
        ok: false,
        error: `PDF는 ${PDF_MAX_PAGES}페이지 이하만 올릴 수 있습니다.`,
      };
    // 출력명 p-1.png·p-01.png는 총 페이지 수에 따라 0 패딩이 달라지므로 {n}.png로 통일한다.
    await Promise.all(
      pages.map((f) =>
        rename(join(dir, f), join(dir, `${Number(f.slice(2, -4))}.png`)),
      ),
    );
    saved = true;
    return { ok: true, storagePath: name };
  } finally {
    if (!saved) await rm(dir, { recursive: true, force: true });
  }
}

/** PDF 페이지 PNG 디렉터리의 페이지 수. */
export async function pdfPageCount(storagePath: string): Promise<number> {
  return (await readdir(join(uploadsDir, storagePath))).length;
}

export function readFile(storagePath: string): Promise<Buffer> {
  return read(join(uploadsDir, storagePath));
}

export function removeFile(storagePath: string): Promise<void> {
  // PDF는 페이지 PNG 디렉터리라 recursive가 필요하다.
  return rm(join(uploadsDir, storagePath), { force: true, recursive: true });
}
