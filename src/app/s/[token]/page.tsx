import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { preconnect } from "react-dom";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";
import { contentOrigin } from "@/lib/hosts";
import type { CommentItem } from "./_components/comment-panel";
import { HtmlViewer } from "./_components/html-viewer";
import { ImageViewer } from "./_components/image-viewer";
import { ViewBeacon } from "./_components/view-beacon";

const label = (ms: number) =>
  new Date(ms).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

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
        createdLabel: label(c.createdAt),
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
            createdLabel: label(r.createdAt),
          })),
      };
    });

  if (file.kind === "html") {
    return (
      <main id="main" className="share">
        <h1 className="sr-only">{file.title}</h1>
        <ViewBeacon token={token} />
        <HtmlViewer
          src={`${contentOrigin()}/c/${token}`}
          token={token}
          items={items}
          isOwner={isOwner}
        />
      </main>
    );
  }

  return (
    <main id="main" className="share">
      <h1 className="sr-only">{file.title}</h1>
      <ViewBeacon token={token} />
      <ImageViewer
        src={`${contentOrigin()}/c/${token}`}
        alt={file.title}
        token={token}
        items={items}
        isOwner={isOwner}
      />
    </main>
  );
}
