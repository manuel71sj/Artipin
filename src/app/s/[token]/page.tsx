import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { preconnect } from "react-dom";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";
import { contentOrigin } from "@/lib/hosts";
import { relativeTime } from "@/lib/time";
import { readVisitorId } from "@/lib/visitor";
import type { CommentItem } from "./_components/comment-panel";
import { CopyLink } from "./_components/copy-link";
import { HtmlViewer } from "./_components/html-viewer";
import { ImageViewer } from "./_components/image-viewer";
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

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.fileId, file.id))
    .orderBy(asc(comments.createdAt), asc(comments.id));

  let pinNo = 0;
  const items: CommentItem[] = rows
    .filter((c) => c.parentId === null)
    .map((c) => {
      const a = c.anchor as {
        kind?: string;
        x?: number;
        y?: number;
        selector?: string;
        relX?: number;
        relY?: number;
      } | null;
      const pin =
        a?.kind === "image" && a.x !== undefined && a.y !== undefined
          ? { x: a.x, y: a.y }
          : null;
      const htmlPin =
        a?.kind === "html" &&
        a.selector !== undefined &&
        a.relX !== undefined &&
        a.relY !== undefined
          ? { selector: a.selector, relX: a.relX, relY: a.relY }
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
          {file.kind === "image" ? "이미지" : "HTML"}
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
    </>
  );

  if (file.kind === "html") {
    return (
      <>
        {bar}
        <main id="main" className="share">
          <ViewBeacon token={token} />
          <HtmlViewer
            src={`${contentOrigin()}/c/${token}`}
            token={token}
            items={items}
            isOwner={isOwner}
          />
        </main>
      </>
    );
  }

  return (
    <>
      {bar}
      <main id="main" className="share">
        <ViewBeacon token={token} />
        <ImageViewer
          src={`${contentOrigin()}/c/${token}`}
          alt={file.title}
          token={token}
          items={items}
          isOwner={isOwner}
        />
      </main>
    </>
  );
}
