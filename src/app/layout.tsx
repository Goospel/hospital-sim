import type { Metadata } from "next";
import localFont from "next/font/local";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/Pretendard-Variable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const d2coding = localFont({
  src: "./fonts/D2Coding.woff2",
  variable: "--font-d2coding",
  display: "swap",
});

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "수화기 너머의 벽",
  description:
    "걸려오는 응급 전원 요청 앞에서 누구를 받고 누구를 돌려보낼지 정하는 병원 경영 시뮬레이션 — 대한민국 의료 시스템의 구조적 벽을 의료진 시점에서 겪는다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${notoSerifKr.variable} ${d2coding.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
