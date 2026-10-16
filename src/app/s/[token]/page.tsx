import { and, asc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { comments, files } from "@/db/schema";
import { contentOrigin } from "@/lib/hosts";
import { type CommentItem, CommentPanel } from "./_components/comment-panel";
import { ImageViewer } from "./_components/image-viewer";

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
      const a = c.anchor as { kind?: string; x?: number; y?: number } | null;
      const pin =
        a?.kind === "image" && a.x !== undefined && a.y !== undefined
          ? { x: a.x, y: a.y }
          : null;
      return {
        id: c.id,
        authorName: c.authorName,
        isOwner: c.isOwner,
        body: c.body,
        createdLabel: label(c.createdAt),
        resolved: c.resolvedAt !== null,
        pin,
        pinNo: pin ? ++pinNo : null,
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
      <main className="share">
        <p>HTML 뷰어는 다음 단계에서 제공됩니다</p>
        <CommentPanel token={token} items={items} isOwner={isOwner} />
      </main>
    );
  }

  return (
    <main className="share">
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
