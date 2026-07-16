"use client";

/**
 * 2막(IN_HOUSE) — 순환기 배후를 지은 병원의 STEMI는 전원 뺑뺑이 없이 내 응급실에서 끝난다.
 * 전원 미니게임 없이 결과만 냉정하게 전한다. 장부(적자)·소송 노출 같은 대가는 결말(에필로그)에서
 * 실현되므로, 여기서는 해석·과장 없이 사실만 짧게 진술한다.
 */
export default function InHouseEmergency({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-zinc-100 bg-zinc-950">
      <span className="text-xs uppercase tracking-[0.25em] text-zinc-600">응급 · 원내</span>

      <section className="flex flex-col items-center gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-6 py-6 text-center">
        <p className="text-xs uppercase tracking-widest text-red-400">응급 환자 도착</p>
        <h1 className="text-lg font-semibold text-zinc-100">급성 심근경색(STEMI) 의심</h1>
        <p className="text-sm text-zinc-400">내 순환기팀이 직접 PCI를 시행한다.</p>
        <p className="text-sm font-medium text-zinc-300">환자는 생존했다.</p>
      </section>

      <button
        type="button"
        onClick={onContinue}
        className="rounded-lg bg-zinc-100 px-8 py-3 text-base font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        계속
      </button>
    </main>
  );
}
