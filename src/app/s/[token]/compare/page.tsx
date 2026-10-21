import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { fileVersions } from "@/db/schema";
import { contentOrigin } from "@/lib/hosts";
import { findViewableFile } from "@/lib/shared-file";

// 두 버전의 본문을 나란히 놓는다. 댓글·핀은 없다. 접근 범위는 /c/{token}?v= 와 같다(토큰 보유자).
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  const { a, b } = await searchParams;
  if (typeof a !== "string" || typeof b !== "string") notFound();
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) notFound();

  const viewable = await findViewableFile(token);
  if (viewable.status !== "ok") notFound();
  const { file } = viewable;

  const found = await db
    .select({ no: fileVersions.no })
    .from(fileVersions)
    .where(eq(fileVersions.fileId, file.id));
  const nos = found.map((v) => v.no);
  if (!nos.includes(Number(a)) || !nos.includes(Number(b))) notFound();

  return (
    <>
      <div className="share-head">
        <h1 className="share-title">{file.title}</h1>
        <span className="share-when">
          v{a} ↔ v{b}
        </span>
        <a href={`/s/${token}`}>뷰어로</a>
      </div>
      <main id="main" className="compare">
        {[a, b].map((n) => (
          <section key={n}>
            <h2>v{n}</h2>
            {file.kind === "html" ? (
              <iframe
                className="html-frame"
                title={`버전 ${n}`}
                sandbox="allow-scripts"
                src={`${contentOrigin()}/c/${token}?v=${n}`}
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: CONTENT_HOST의 외부 origin 이미지
              <img
                src={`${contentOrigin()}/c/${token}?v=${n}`}
                alt={`버전 ${n}`}
              />
            )}
          </section>
        ))}
      </main>
    </>
  );
}
