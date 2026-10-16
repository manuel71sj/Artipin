"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UploadForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch("/api/files", { method: "POST", body });
    if (res.ok) {
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      setError(json?.error ?? `업로드에 실패했습니다 (${res.status}).`);
    }
    setBusy(false);
  }

  return (
    <form
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) upload(file);
      }}
    >
      <p>
        파일을 끌어다 놓거나 선택하세요. (PNG·JPG·WebP 10MB 이하, HTML 5MB 이하)
      </p>
      <input
        type="file"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
