"use client";

import type { SessionEpilogue } from "@/game/session";
import type { NewsItem } from "@/game/news";
import LedgerPanel from "./LedgerPanel";

/**
 * 이번 주 신문 — 1막 7일 누적 돌려보낸 응급(누적 결산). 플레이 중 아침마다 한 건씩 스치던 기사가
 * 여기 한꺼번에 쌓인다. 해석 0(메모 game-show-dont-tell): 카피 없이 헤드라인과 숫자만 — '사람 명부'가
 * 바로 아래 '돈 장부' 옆에 놓이는 병치가 논지다. 비어 있으면(다 받은 주) 숨긴다.
 */
function WeekPaper({ news }: { news: NewsItem[] }) {
  if (news.length === 0) return null;
  return (
    <div className="w-full max-w-sm">
      <p className="mb-3 text-center text-xs uppercase tracking-[0.3em] text-ink-2">
        이번 주 신문 · {news.length}명
      </p>
      <ul className="flex flex-col gap-2 paper-card px-5 py-4">
        {news.map((n) => (
          <li key={n.id} className="border-l-2 border-rule pl-3">
            <p className="text-sm font-medium leading-snug text-ink">{n.headline}</p>
            <p className="mt-0.5 text-[11px] text-ink-2">{n.outlet}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 결말 — 이 세션 톤 아크의 냉정(red) 극. buildEpilogue(순수 함수)가 파생한 값만 렌더한다.
 * 낙차는 그 주 돌려보낸 사람 수에서 자연 파생한다 — 하드코딩은 라벨 문구뿐, 숫자(장부·명단)는 전부
 * ledger/weekNews에서 온다. 플레이어는 항상 '받는 벽'이라, 돌려보낸 사람은 내가 못 받아 다른 데서
 * 뺑뺑이가 된 사람들이다. 아무도 안 돌아간 주라도 승리는 아니다: 그 대가는 장부에 남는다.
 */
export default function Epilogue({
  epilogue,
  onRestart,
}: {
  epilogue: SessionEpilogue;
  onRestart: () => void;
}) {
  const { ledger, weekNews } = epilogue;
  const turnedAway = weekNews.length;

  const title = turnedAway > 0 ? `이번 주, ${turnedAway}명이 돌아갔다` : "이번 주, 아무도 돌려보내지 않았다";
  const subtitle =
    turnedAway > 0
      ? "받아줄 자리를 끝내 찾지 못한 사람들이다 — 명단은 아래."
      : "다 받아낸 대가는 아래 장부에 남는다.";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-on-desk bg-desk">
      <span
        className={`text-xs uppercase tracking-[0.25em] ${
          turnedAway > 0 ? "text-alarm" : "text-on-desk-muted"
        }`}
      >
        결말
      </span>

      <section className="flex flex-col items-center gap-2 text-center">
        <p className={`font-serif text-2xl font-bold ${turnedAway > 0 ? "text-alarm" : "text-on-desk"}`}>
          {title}
        </p>
        <p className="text-sm text-on-desk-muted">{subtitle}</p>
      </section>

      {/* 배치 = 논지: 제목 → 이번 주 신문(사람) → 장부(돈). 사람 바로 옆에 돈. */}
      <div className="flex flex-col items-center gap-4">
        <WeekPaper news={weekNews} />
        {ledger && <LedgerPanel ledger={ledger} />}
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-2 rounded-lg border border-frame px-5 py-2 text-sm font-medium text-on-desk transition-colors hover:bg-desk-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-paper"
      >
        다시 한 판
      </button>

      <p className="mt-4 max-w-md text-center text-xs leading-5 text-on-desk-muted">
        등장하는 병원·인물·사건은 모두 허구이며, 특정 개인·집단을 비난하지 않습니다.
      </p>
    </main>
  );
}
