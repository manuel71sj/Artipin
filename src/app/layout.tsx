import type { Metadata, Viewport } from "next";
import {
  Atkinson_Hyperlegible_Next,
  Hahmlet,
  Noto_Sans_KR,
} from "next/font/google";
import "./globals.css";

// 제목(워드마크·h1·h2)은 Hahmlet 700, 본문은 영문·숫자 Atkinson + 한글 Noto Sans KR(font-family 순서로 글리프 단위 폴백).
const display = Hahmlet({
  variable: "--font-display",
  subsets: ["latin"],
});

const latin = Atkinson_Hyperlegible_Next({
  variable: "--font-latin",
  subsets: ["latin"],
});

const hangul = Noto_Sans_KR({
  variable: "--font-hangul",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Artipin",
  description: "AI가 만든 HTML·이미지를 링크로 공유하고 핀 댓글을 받습니다.",
};

// 주소창·상태바 색을 페이지 배경(--color-background)과 맞춘다.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${latin.variable} ${hangul.variable}`}
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
