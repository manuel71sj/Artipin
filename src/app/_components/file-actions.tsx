"use client";

import { useRouter } from "next/navigation";

export function FileActions({ id, link }: { id: number; link: string }) {
  const router = useRouter();

  return (
    <>
      <button type="button" onClick={() => navigator.clipboard.writeText(link)}>
        링크 복사
      </button>{" "}
      <button
        type="button"
        onClick={async () => {
          if (!confirm("삭제하면 링크가 더 이상 열리지 않습니다. 삭제할까요?"))
            return;
          const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
          if (res.ok) router.refresh();
          else alert("삭제에 실패했습니다.");
        }}
      >
        삭제
      </button>
    </>
  );
}
