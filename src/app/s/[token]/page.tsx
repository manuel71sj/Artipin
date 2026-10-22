import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { preconnect } from "react-dom";
import { auth } from "@/auth";
import { db } from "@/db";
import { fileVersions, views } from "@/db/schema";
import { loadComments } from "@/lib/comments";
import { contentOrigin } from "@/lib/hosts";
import { findViewableFile } from "@/lib/shared-file";
import { pdfPageCount } from "@/lib/storage";
import { relativeTime } from "@/lib/time";
import { contentTicket, isUnlocked } from "@/lib/unlock";
import { readVisitorId } from "@/lib/visitor";
import { StatusPage, statusStyles } from "../../_components/status-page";
import { CopyLink } from "./_components/copy-link";
import { HtmlViewer } from "./_components/html-viewer";
import { ImageViewer } from "./_components/image-viewer";
import { UnlockForm } from "./_components/unlock-form";
import { VersionList } from "./_components/version-list";
import { ViewBeacon } from "./_components/view-beacon";

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const found = await findViewableFile(token);
  if (found.status === "none") notFound();
  // 만료는 404와 구분해 안내한다(HTTP 200). 소유자도 예외 없이 이 화면을 본다.
  if (found.status === "expired")
    return (
      <StatusPage title="링크가 만료되었습니다">
        <p className={statusStyles.next}>
          올린 사람이 정한 공개 기간이 지났습니다. 계속 필요하면 올린 사람에게
          기간을 다시 설정해 달라고 요청하세요.
        </p>
        <div className={statusStyles.actions}>
          <Link className={statusStyles.link} href="/">
            내 파일로 이동
          </Link>
        </div>
      </StatusPage>
    );
  const { file } = found;
  // 잠금 화면에는 제목·종류·본문 주소를 싣지 않는다.
  if (!(await isUnlocked(file)))
    return (
      <StatusPage title="비밀번호가 필요합니다">
        <p className={statusStyles.next}>
          올린 사람에게 받은 비밀번호를 입력하세요.
        </p>
        <UnlockForm token={token} />
      </StatusPage>
    );

  // 본문(이미지·iframe)은 다른 origin(CONTENT_HOST)에서 오므로 연결을 미리 맺는다.
  preconnect(contentOrigin());

  // 비밀번호 파일의 본문 주소는 이 렌더가 발급한 경로 티켓을 거친다(콘텐츠 라우트가 검증).
  const k = file.passwordHash ? contentTicket(token, file.passwordHash) : null;
  const prefix = `/c/${token}${k ? `/k/${k}` : ""}`;
  // 비밀번호를 설정·변경·해제하면 뷰어를 다시 마운트해 새 주소를 쓰게 한다. 해시 원문은 클라이언트로 보내지 않는다.
  const lockKey = file.passwordHash
    ? `:${createHash("sha256").update(file.passwordHash).digest("hex").slice(0, 8)}`
    : "";

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

  const { rows, items } = await loadComments(file.id, can);

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
          {
            { image: "이미지", html: "HTML", pdf: "PDF", site: "사이트" }[
              file.kind
            ]
          }
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
          kind={file.kind}
          ticket={k}
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

  if (file.kind === "html" || file.kind === "site") {
    return (
      <>
        {bar}
        <main id="main" className="share">
          <ViewBeacon token={token} />
          {/* 롤백은 iframe src(/c/{token})를 바꾸지 않으므로 본문이 바뀌면 재마운트해 다시 불러온다 */}
          <HtmlViewer
            key={file.storagePath + lockKey}
            src={
              file.kind === "site"
                ? `${contentOrigin()}${prefix}/index.html`
                : `${contentOrigin()}${prefix}`
            }
            entryPath={
              file.kind === "site" ? `${prefix}/index.html` : undefined
            }
            token={token}
            items={items}
            isOwner={isOwner}
            edit={
              isOwner && file.kind === "html"
                ? { fileId: file.id, title: file.title }
                : undefined
            }
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
          (_, i) => `${contentOrigin()}${prefix}?p=${i + 1}${t && `&${t}`}`,
        )
      : [`${contentOrigin()}${prefix}${t && `?${t}`}`];

  return (
    <>
      {bar}
      <main id="main" className="share">
        <ViewBeacon token={token} />
        {/* 같은 URL의 이미지는 재사용되므로 교체·롤백 뒤에는 ?t=로 URL을 바꾼다 */}
        <ImageViewer
          key={file.storagePath + lockKey}
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
