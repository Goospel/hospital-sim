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

/* 게임명은 2026-07-29 「심스피탈」(Sim + hoSPITAL)로 바뀌었다 — 옛 이름 "수화기 너머의 벽"은
   전화 협상이 핵심이던 시절의 것이라 병원 경영 시뮬이 된 지금과 안 맞는다. 설명은 지금 `/`가
   내는 화면(타일 병원)을 말한다. 이전 판의 설명은 `/classic`의 metadata가 이어받았다. */
export const metadata: Metadata = {
  title: "심스피탈",
  description:
    "빈 부지에 진료실을 짓고 의사를 채용해 환자를 받는 병원 경영 시뮬레이션 — 7일마다 결산이 오고, 지친 사람은 떠난다. 대한민국 의료 시스템의 구조적 벽을 의료진 시점에서 겪는다.",
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
