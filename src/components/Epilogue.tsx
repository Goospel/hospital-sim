"use client";

import type { SessionEpilogue } from "@/game/session";
import type { NewsItem } from "@/game/news";
import Receipt from "./Receipt";
import LedgerPanel from "./LedgerPanel";

/**
 * 이번 주 신문 — 1막 7일 누적 돌려보낸 STEMI(누적 결산). 플레이 중 아침마다 한 건씩 스치던 기사가
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
  const { survived, ledger, debrief, weekNews } = epilogue;

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
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-on-desk bg-desk">
      <span
        className={`text-xs uppercase tracking-[0.25em] ${
          survived ? "text-on-desk-muted" : "text-alarm"
        }`}
      >
        결말 · {survived ? "생존" : "사망"}
      </span>

      <section className="flex flex-col items-center gap-2 text-center">
        <p className={`font-serif text-2xl font-bold ${survived ? "text-on-desk" : "text-alarm"}`}>
          {title}
        </p>
        <p className="text-sm text-on-desk-muted">{subtitle}</p>
      </section>

      {/* 배치 = 논지: 제목 → 이번 주 신문(사람) → 장부(돈) → 전원 기록(2막). 사람 바로 옆에 돈. */}
      <div className="flex flex-col items-center gap-4">
        <WeekPaper news={weekNews} />
        {ledger && <LedgerPanel ledger={ledger} />}
        {debrief && <Receipt debrief={debrief} />}
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
