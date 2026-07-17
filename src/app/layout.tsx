import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "수화기 너머의 벽",
  description:
    "골든타임 안에 응급환자를 받아줄 병원을 찾는 실시간 전원 협상 시뮬레이션 — 대한민국 의료 시스템의 구조적 벽을 의료진 시점에서 겪는다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: DarkReader 등 브라우저 확장이 하이드레이션 전에 <html>에 data-* 속성을
    // 주입해 서버/클라이언트 속성이 어긋나는 것을 억제(우리 코드 무관·확장 유발·dev 오버레이 전용).
    // <html> 이 한 요소의 속성 불일치만 억제하며, 자식·컴포넌트의 실제 하이드레이션 버그는 그대로 잡힌다.
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
