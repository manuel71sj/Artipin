import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readFile as read,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import yauzl from "yauzl";
import { uploadsDir } from "@/db";
import {
  mb,
  PDF_MAX_PAGES,
  PDF_PAGE_PX,
  PDF_TIMEOUT_MS,
  SITE_MAX_BYTES,
  SITE_MAX_ENTRIES,
  SITE_TYPES,
} from "@/lib/upload";

/** 본문을 저장하고 `files.storage_path`에 넣을 파일명을 돌려준다. */
export async function saveFile(data: Buffer): Promise<string> {
  const name = randomUUID();
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(join(uploadsDir, name), data);
  return name;
}

type Saved = { ok: true; storagePath: string } | { ok: false; error: string };

const BAD_ZIP = "zip 파일을 읽을 수 없습니다.";
const BAD_PATH = "zip 안에 허용되지 않는 경로가 있습니다.";

/**
 * zip을 dest에 푼다. 규칙을 어기면 거절 문구를, 통과하면 null을 돌려준다.
 * 항목은 하나씩 읽고 쓰기를 기다리므로, 어느 경로로 끝나든 진행 중인 쓰기가 남지 않는다.
 */
async function unzipInto(body: Buffer, dest: string): Promise<string | null> {
  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromBufferPromise(body);
  } catch {
    return BAD_ZIP;
  }
  let entries = 0;
  let total = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (++entries > SITE_MAX_ENTRIES)
        return `zip 항목은 ${SITE_MAX_ENTRIES}개 이하만 올릴 수 있습니다.`;
      const name = entry.fileName;
      // 건너뛸 항목이라도 링크면 전체를 거절하므로 건너뛰기보다 먼저 본다.
      if (((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000)
        return "zip 안에 심볼릭 링크가 있습니다.";
      // macOS가 zip에 끼우는 메타데이터는 무시한다. 단일 최상위 폴더 판정에도 남지 않는다.
      if (name.split("/")[0] === "__MACOSX" || basename(name) === ".DS_Store")
        continue;
      if (name.endsWith("/")) continue;
      if (!SITE_TYPES.has(extname(name).slice(1).toLowerCase()))
        return `허용되지 않는 파일 형식이 zip 안에 있습니다: ${name}`;
      const target = resolve(dest, name);
      if (!target.startsWith(dest + sep)) return BAD_PATH;

      // 선언 크기는 믿지 않고 실제로 풀린 바이트를 센다.
      const chunks: Buffer[] = [];
      for await (const chunk of await zip.openReadStreamPromise(entry)) {
        total += chunk.length;
        if (total > SITE_MAX_BYTES)
          return `압축을 푼 크기는 ${mb(SITE_MAX_BYTES)} 이하만 올릴 수 있습니다.`;
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      // 서빙할 때 UTF-8로 읽고 브리지를 넣으므로 단일 HTML 업로드와 같이 UTF-8만 받는다.
      if (/\.html?$/i.test(name)) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(data);
        } catch {
          return `zip 안의 HTML은 UTF-8 인코딩만 올릴 수 있습니다: ${name}`;
        }
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data);
    }
    return null;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // yauzl이 파일명 검증(드라이브 문자·절대 경로·..)에 실패하면 이 메시지로 던진다.
    if (
      /^(invalid relative path|absolute path|invalid characters)/.test(
        e.message,
      )
    )
      return BAD_PATH;
    // syscall이 있으면 파일 쓰기 오류다. a.css와 a.css/b.js처럼 경로가 겹치면 입력 오류, 나머지(디스크 등)는 서버 오류다.
    if (e.syscall) {
      if (e.code === "ENOTDIR" || e.code === "EEXIST" || e.code === "EISDIR")
        return BAD_ZIP;
      throw err;
    }
    return BAD_ZIP;
  } finally {
    zip.close();
  }
}

/**
 * zip을 풀어 `uploads/<uuid>/`로 저장한다. 임시 디렉터리에 먼저 풀고, 진입 디렉터리
 * (루트 또는 단일 최상위 폴더)만 rename 한 번으로 옮겨서 실패해도 흔적을 남기지 않는다.
 */
async function extractSite(body: Buffer): Promise<Saved> {
  const name = randomUUID();
  const tmp = join(uploadsDir, `${name}.tmp`);
  try {
    await mkdir(tmp, { recursive: true });
    const error = await unzipInto(body, tmp);
    if (error) return { ok: false, error };
    const hasIndex = (es: Dirent[]) =>
      es.some((e) => e.isFile() && e.name === "index.html");
    const top = await readdir(tmp, { withFileTypes: true });
    let entryDir: string | null = null;
    if (hasIndex(top)) entryDir = tmp;
    else if (top.length === 1 && top[0].isDirectory()) {
      const inner = join(tmp, top[0].name);
      if (hasIndex(await readdir(inner, { withFileTypes: true })))
        entryDir = inner;
    }
    if (!entryDir)
      return {
        ok: false,
        error: "zip의 루트 또는 단일 최상위 폴더에 index.html이 있어야 합니다.",
      };
    await rename(entryDir, join(uploadsDir, name));
    return { ok: true, storagePath: name };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * 업로드 본문을 저장한다. zip은 풀어서 디렉터리로 저장한다. PDF는 pdftoppm으로 `uploads/<uuid>/{n}.png`로 변환하고,
 * 실패하면 디렉터리를 지워 고아를 남기지 않는다. pdftoppm이 없으면(ENOENT) 입력 오류가 아니므로 예외를 던진다.
 */
export async function saveUpload(
  kind: "image" | "html" | "pdf" | "site",
  body: Buffer,
): Promise<Saved> {
  if (kind === "site") return extractSite(body);
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
