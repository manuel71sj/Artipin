"use client";

import { useEffect, useState } from "react";
import { decrypt } from "@/lib/e2ee";
import { imageMime } from "@/lib/upload";
import type { CommentItem } from "./comment-panel";
import { HtmlViewer } from "./html-viewer";
import { ImageViewer } from "./image-viewer";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "html"; html: string }
  | { status: "image"; url: string };

// 암호화 파일 뷰어. 키는 주소의 #k=에서 읽어 이 컴포넌트 안에서만 쓰고, 요청·props·메시지로 내보내지 않는다.
// 복호화가 끝난 뒤에야 HtmlViewer·ImageViewer를 마운트한다(브리지 3초 타이머가 복호화 시간에 걸리지 않도록).
export function EncryptedViewer({
  kind,
  src,
  title,
  token,
  items,
  isOwner,
}: {
  kind: "image" | "html";
  src: string;
  title: string;
  token: string;
  items: CommentItem[];
  isOwner: boolean;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  // 같은 주소에서 #k만 바꾸면 문서가 다시 로드되지 않으므로, 새 키로 처음부터 다시 연다.
  // 본문 바로가기(#main) 같은 앵커 이동은 키가 없으므로 다시 로드하지 않는다.
  useEffect(() => {
    const reload = () => {
      if (new URLSearchParams(location.hash.slice(1)).get("k"))
        location.reload();
    };
    window.addEventListener("hashchange", reload);
    return () => window.removeEventListener("hashchange", reload);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const fail = (message: string) => {
      if (!cancelled) setState({ status: "error", message });
    };
    (async () => {
      const key = new URLSearchParams(location.hash.slice(1)).get("k");
      if (!key) return fail("키가 없어 열 수 없습니다.");
      const res = await fetch(`/api/s/${token}/blob`).catch(() => null);
      if (!res?.ok)
        return fail("링크가 만료됐거나 잠겼습니다. 새로고침해 주세요.");
      let plain: Uint8Array<ArrayBuffer>;
      try {
        plain = await decrypt(new Uint8Array(await res.arrayBuffer()), key);
      } catch {
        return fail("링크의 키가 맞지 않아 열 수 없습니다.");
      }
      if (cancelled) return;
      if (kind === "html")
        return setState({
          status: "html",
          html: new TextDecoder().decode(plain),
        });
      // 서버가 kind를 검증하지 못하므로 이미지 MIME이 아니면 열지 않는다.
      const mime = imageMime(plain);
      if (!mime) return fail("이미지로 열 수 없는 파일입니다.");
      url = URL.createObjectURL(new Blob([plain], { type: mime }));
      setState({ status: "image", url });
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, kind]);

  if (state.status === "html")
    return (
      <HtmlViewer
        src={src}
        html={state.html}
        token={token}
        items={items}
        isOwner={isOwner}
      />
    );
  if (state.status === "image")
    return (
      <ImageViewer
        pages={[state.url]}
        kind="image"
        alt={title}
        token={token}
        items={items}
        isOwner={isOwner}
      />
    );
  return (
    <section className="viewer">
      <p
        className="viewer-note"
        role={state.status === "error" ? "alert" : undefined}
      >
        {state.status === "error" ? state.message : "복호화하는 중…"}
      </p>
    </section>
  );
}
