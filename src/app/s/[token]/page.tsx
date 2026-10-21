import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { preconnect } from "react-dom";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files, fileVersions, views } from "@/db/schema";
import { contentOrigin } from "@/lib/hosts";
import { pdfPageCount } from "@/lib/storage";
import { relativeTime } from "@/lib/time";
import { readVisitorId } from "@/lib/visitor";
import type { CommentItem } from "./_components/comment-panel";
import { CopyLink } from "./_components/copy-link";
import { HtmlViewer } from "./_components/html-viewer";
import { ImageViewer } from "./_components/image-viewer";
import { VersionList } from "./_components/version-list";
import { ViewBeacon } from "./_components/view-beacon";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.shareToken, token), isNull(files.deletedAt)));
  if (!file) notFound();

  // 본문(이미지·iframe)은 다른 origin(CONTENT_HOST)에서 오므로 연결을 미리 맺는다.
  preconnect(contentOrigin());

  const session = await auth();
  const isOwner = Boolean(session) && Number(session?.user.id) === file.ownerId;
  // 쿠키가 httpOnly라 삭제 가능 여부는 서버에서 계산한다.
  const visitorId = await readVisitorId();
  const can = (v: string) => isOwner || (visitorId !== null && v === visitorId);

  // 버전 목록은 소유자에게만 조회·렌더한다. 최대 no가 현재 본문이다.
  const versions = isOwner
    ? await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, file.id))
        .orderBy(desc(fileVersions.no))
    : [];

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.fileId, file.id))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  // 열람자는 소유자에게만 조회·렌더한다. 익명이라 같은 방문자의 첫 댓글 작성자 이름을 쓴다.
  const viewers = isOwner
    ? await db
        .select()
        .from(views)
        .where(eq(views.fileId, file.id))
        .orderBy(asc(views.firstSeenAt))
    : [];
  const viewerNames = new Map<string, string>();
  for (const c of rows) {
    if (!viewerNames.has(c.visitorId))
      viewerNames.set(c.visitorId, c.authorName);
  }

  let pinNo = 0;
  const items: CommentItem[] = rows
    .filter((c) => c.parentId === null)
    .map((c) => {
      const a = c.anchor as {
        kind?: string;
        x?: number;
        y?: number;
        page?: number;
        selector?: string;
        relX?: number;
        relY?: number;
        quote?: unknown;
      } | null;
      const pin =
        (a?.kind === "image" || (a?.kind === "pdf" && a.page !== undefined)) &&
        a.x !== undefined &&
        a.y !== undefined
          ? { x: a.x, y: a.y, page: a.page }
          : null;
      const htmlPin =
        a?.kind === "html" &&
        a.selector !== undefined &&
        a.relX !== undefined &&
        a.relY !== undefined
          ? {
              selector: a.selector,
              relX: a.relX,
              relY: a.relY,
              ...(typeof a.quote === "string" ? { quote: a.quote } : {}),
            }
          : null;
      return {
        id: c.id,
        authorName: c.authorName,
        isOwner: c.isOwner,
        body: c.body,
        createdLabel: relativeTime(c.createdAt),
        canDelete: can(c.visitorId),
        resolved: c.resolvedAt !== null,
        pin,
        htmlPin,
        pinNo: pin || htmlPin ? ++pinNo : null,
        replies: rows
          .filter((r) => r.parentId === c.id)
          .map((r) => ({
            id: r.id,
            authorName: r.authorName,
            isOwner: r.isOwner,
            body: r.body,
            createdLabel: relativeTime(r.createdAt),
            canDelete: can(r.visitorId),
          })),
      };
    });

  // 링크를 받은 사람이 무엇을 보고 있는지 알 수 있도록 제목·종류·올린 시각을 상단에 둔다.
  const bar = (
    <>
      <header className="share-bar">
        <span className="share-brand" translate="no">
          <span className="share-brand-dot" aria-hidden="true" />
          Artipin
        </span>
        <CopyLink />
      </header>
      <div className="share-head">
        <h1 className="share-title">{file.title}</h1>
        <span className="share-kind">
          {{ image: "이미지", html: "HTML", pdf: "PDF" }[file.kind]}
        </span>
        <span className="share-when">
          {new Date(file.createdAt).toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          올림
        </span>
      </div>
      {isOwner ? (
        <VersionList
          fileId={file.id}
          token={token}
          contentBase={contentOrigin()}
          versions={versions.map((v, i) => ({
            no: v.no,
            createdLabel: relativeTime(v.createdAt),
            size: v.size,
            current: i === 0,
          }))}
        />
      ) : null}
      {isOwner ? (
        <details className="share-views">
          <summary>
            열람 {viewers.length}명
            {viewers[0] &&
              ` · 처음 열람 ${relativeTime(viewers[0].firstSeenAt)}`}
          </summary>
          <ul>
            {viewers.map((v) => (
              <li key={v.visitorId}>
                <span>{viewerNames.get(v.visitorId) ?? "익명 방문자"}</span>
                <span>{relativeTime(v.firstSeenAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );

  if (file.kind === "html") {
    return (
      <>
        {bar}
        <main id="main" className="share">
          <ViewBeacon token={token} />
          {/* 롤백은 iframe src(/c/{token})를 바꾸지 않으므로 본문이 바뀌면 재마운트해 다시 불러온다 */}
          <HtmlViewer
            key={file.storagePath}
            src={`${contentOrigin()}/c/${token}`}
            token={token}
            items={items}
            isOwner={isOwner}
          />
        </main>
      </>
    );
  }

  // PDF는 페이지마다 /c/{token}?p={n}으로 PNG를 받는다.
  const t = file.replacedAt ? `t=${file.replacedAt}` : "";
  const pages =
    file.kind === "pdf"
      ? Array.from(
          { length: await pdfPageCount(file.storagePath) },
          (_, i) => `${contentOrigin()}/c/${token}?p=${i + 1}${t && `&${t}`}`,
        )
      : [`${contentOrigin()}/c/${token}${t && `?${t}`}`];

  return (
    <>
      {bar}
      <main id="main" className="share">
        <ViewBeacon token={token} />
        {/* 같은 URL의 이미지는 재사용되므로 교체·롤백 뒤에는 ?t=로 URL을 바꾼다 */}
        <ImageViewer
          key={file.storagePath}
          pages={pages}
          kind={file.kind}
          alt={file.title}
          token={token}
          items={items}
          isOwner={isOwner}
        />
      </main>
    </>
  );
}
