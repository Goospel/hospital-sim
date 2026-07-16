"use client";

import { useState } from "react";
import { runningNetProfit, type ReceivingState } from "@/game/receiving";
import { formatSignedBillions } from "@/game/labels";

// 붕괴 전환 지속시간(ms) — 아래 Tailwind duration-700 클래스와 반드시 일치시킨다(뷰 전용 타이밍).
const COLLAPSE_MS = 700;

/**
 * 막간 — 1막(콜 큐) 종료와 2막(응급) 사이의 시점 전환.
 * 명랑한 분기 마감 숫자로 열었다가, 같은 화면 안에서 톤이 꺾여 냉정한 STEMI 경보로 닫는다.
 * 해석 0 원칙: 숫자는 담담히 보여줄 뿐 — 장부의 소송비용 같은 대가는 결말(에필로그)에서만 실현된다.
 *
 * 시그니처 — 막간 붕괴: [계속]을 누르면 onContinue()를 즉시 부르지 않고 `collapsing`으로 전환해
 * 명랑한 초록 프레이밍이 눈앞에서 탈색(grayscale)·dim 되고 응급 경보가 차갑게 고조되는 ~700ms
 * 전환을 보여준 뒤에야 응급으로 넘어간다 — "당신의 이익 챙기기가 당신이 책임질 응급으로 곤두박질친다"는
 * 주제를 한 제스처로 구현한다. `prefers-reduced-motion: reduce`면 전환 없이 즉시 onContinue().
 */
export default function Interstitial({
  receiving,
  onContinue,
}: {
  receiving: ReceivingState;
  onContinue: () => void;
}) {
  const [collapsing, setCollapsing] = useState(false);

  const net = runningNetProfit(receiving);

  function handleContinue() {
    if (collapsing) return; // 중복 클릭 가드 — 전환 중 재진입 금지.
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onContinue(); // 애니메이션 생략, 즉시 전이(품질 바닥).
      return;
    }
    setCollapsing(true);
    setTimeout(onContinue, COLLAPSE_MS);
  }

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 overflow-hidden px-5 py-8 text-zinc-100 bg-zinc-950">
      {/* 냉각 워시 — 붕괴 중 화면 전체에 번지는 붉은 글로우(대담함은 이 한 곳에만). */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(127,29,29,0.35),transparent_70%)] transition-opacity duration-700 ease-out motion-reduce:transition-none ${
          collapsing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* 명랑 — 분기 마감. 붕괴 시 탈색(grayscale)되며 dim. */}
      <section
        className={`relative flex flex-col items-center gap-2 text-center transition-all duration-700 ease-out motion-reduce:transition-none ${
          collapsing ? "grayscale opacity-40" : ""
        }`}
      >
        <span className="text-xs uppercase tracking-[0.25em] text-zinc-600">분기 마감</span>
        <p className="text-2xl font-semibold text-zinc-200">
          순이익{" "}
          <span
            className={`font-mono tabular-nums ${net > 0 ? "text-emerald-400" : "text-zinc-300"}`}
          >
            {formatSignedBillions(net)}
          </span>
        </p>
        {net > 0 && <p className="text-sm font-medium text-emerald-400">이번 분기 흑자 🎉</p>}
        {/*
          연결 조직 — 이 순이익은 결말 장부 첫 줄로 이어진다(소송 비용이 없으면 같은 값 그대로).
          "그대로 남는다"처럼 항상-동일을 단언하지 않는다 — 1막에서 STEMI 콜을 수용해 소송 노출이
          쌓이면 결말에서 더 깎이므로(해석 0 원칙: 사실이 아닐 수 있는 단언은 하지 않는다).
        */}
        <p className="text-xs text-zinc-600">오늘 손익은 여기서 끝나지 않는다 — 결말 장부로 이어진다.</p>
      </section>

      <div className="relative h-px w-24 bg-zinc-800" />

      {/* 톤 꺾임 — 응급 경보(냉정). 붕괴 시 차갑게 고조(scale-up + 글로우). */}
      <section
        className={`relative flex flex-col items-center gap-2 text-center transition-all duration-700 ease-out motion-reduce:transition-none ${
          collapsing ? "scale-110 opacity-100" : "opacity-90"
        }`}
      >
        <span className="text-xs uppercase tracking-[0.25em] text-red-500/80">응급 경보</span>
        <p className="text-lg text-zinc-300">
          이번엔 <span className="font-semibold text-red-400">당신 응급실로</span> STEMI가 온다.
        </p>
      </section>

      <button
        type="button"
        onClick={handleContinue}
        disabled={collapsing}
        className={`relative rounded-lg bg-zinc-100 px-8 py-3 text-base font-semibold text-zinc-900 transition-opacity duration-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 motion-reduce:transition-none ${
          collapsing ? "opacity-0" : "opacity-100"
        }`}
      >
        계속
      </button>
    </main>
  );
}
