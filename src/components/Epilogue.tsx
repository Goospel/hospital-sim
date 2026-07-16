"use client";

import type { SessionEpilogue } from "@/game/session";
import Receipt from "./Receipt";
import LedgerPanel from "./LedgerPanel";

/**
 * 결말 — 이 세션 톤 아크의 냉정(red) 극. buildEpilogue(순수 함수)가 파생한 값만 렌더한다.
 * 세 낙차(공범·사망 / 공범·생존 / 양심·생존)는 survived·debrief 유무에서 자연 파생한다 —
 * 하드코딩은 라벨 문구뿐, 숫자(장부·전원 기록)는 전부 ledger/debrief에서 온다.
 * "생존"도 승리가 아니다: 공범·생존은 빠져나간 것이고, 양심·생존은 대가를 치르고 옳은 일을 한 것이다.
 */
export default function Epilogue({
  epilogue,
  onRestart,
}: {
  epilogue: SessionEpilogue;
  onRestart: () => void;
}) {
  const { survived, ledger, debrief } = epilogue;

  // 헤드라인도 낙차를 따라간다 — 공범·생존은 "살았다"(다른 병원이 대신 받았을 뿐, 내 손으로 한 일이 아니다),
  // 양심·생존만 "살렸습니다"(내 응급실이 직접 받아 낸 결과). 부제의 구분을 헤드라인까지 밀어 냉정 톤을 강화한다.
  const title = !survived
    ? "골든타임을 놓쳤습니다"
    : debrief
      ? "환자는 살았다"
      : "환자를 살렸습니다";
  const subtitle = !survived
    ? "받아줄 병원을 끝내 찾지 못했다."
    : debrief
      ? "다른 병원이 대신 받았다 — 빠져나간 몫의 대가는 장부에 남는다."
      : "내 응급실이 직접 받았다 — 그 대가도 내 몫이다.";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-zinc-100 bg-zinc-950">
      <span
        className={`text-xs uppercase tracking-[0.25em] ${
          survived ? "text-zinc-500" : "text-red-500/80"
        }`}
      >
        결말 · {survived ? "생존" : "사망"}
      </span>

      <section className="flex flex-col items-center gap-2 text-center">
        <p className={`text-2xl font-bold ${survived ? "text-zinc-100" : "text-red-500"}`}>
          {title}
        </p>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </section>

      <div className="flex flex-col items-center gap-4">
        {debrief && <Receipt debrief={debrief} />}
        {ledger && <LedgerPanel ledger={ledger} />}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-2 rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        다시 한 판
      </button>

      <p className="mt-4 max-w-md text-center text-xs leading-5 text-zinc-600">
        등장하는 병원·인물·사건은 모두 허구이며, 특정 개인·집단을 비난하지 않습니다.
      </p>
    </main>
  );
}
