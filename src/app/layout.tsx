import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR, Noto_Serif_KR } from "next/font/google";
import "./globals.css";

// 제목(h1)은 Noto Serif KR 700, 본문은 IBM Plex Sans KR(영문·숫자·한글 한 가족).
const display = Noto_Serif_KR({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "700",
});

const body = IBM_Plex_Sans_KR({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});
export const metadata: Metadata = {
  title: "Artipin",
  description: "AI가 만든 HTML·이미지를 링크로 공유하고 핀 댓글을 받습니다.",
};

// 주소창·상태바 색을 페이지 배경(--color-background)과 맞춘다.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1114" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <body>
        <a className="skip-link" href="#main">
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
