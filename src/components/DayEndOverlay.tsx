"use client";

import { formatManwon } from "@/game/labels";
import type { DayRecord } from "@/sim/day";

/**
 * 하루 마감 오버레이 — 19:00에 세계가 멈추고 그날의 종이 한 장이 올라온다.
 *
 * 기존 게임의 DayEnd와 같은 물성을 쓴다(§6: 낮은 어두운 책상, 마감은 종이). 다른 점은
 * 이 화면이 **부지 위에 덮인다**는 것뿐이다 — 타일 병원은 화면이 갈리지 않고 한 장면으로
 * 이어지는 게 리듬이라, 라우트를 바꾸지 않고 같은 자리에 종이를 얹는다.
 *
 * 숫자는 해석 없이 놓는다(메모 game-show-dont-tell). "환자를 돌려보냈다"는 문장 없이
 * 이탈 수만 붉게 뜬다 — 대기 의자를 덜 놓은 사람의 마감이 저절로 붉어진다.
 *
 * 계산을 하지 않는 것도 규칙이다: 오늘치는 settleDay가 만든 DayRecord를, 주간 누계는
 * 그 기록들의 합을 그대로 읽는다. 화면이 자기 식으로 다시 세면 정산과 조용히 갈린다.
 */
export default function DayEndOverlay({
  week,
  day,
  days,
  onNextDay,
}: {
  week: number;
  day: number;
  days: DayRecord[];
  onNextDay: () => void;
}) {
  const today = days.find((d) => d.day === day);
  const examsDone = days.reduce((n, d) => n + d.examsDone, 0);
  const leftCount = days.reduce((n, d) => n + d.leftCount, 0);
  const revenueManwon = days.reduce((n, d) => n + d.revenueManwon, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${week}주 ${day}일차 마감`}
      /* 세로 가운데는 아이의 `my-auto`로 잡는다 — 스크롤 컨테이너에서 items-center는 내용이
         뷰포트보다 길어지면 아이의 top을 음수로 밀어내고, 그 위쪽은 스크롤해도 닿을 수 없다.
         주간 결산(WeekEndOverlay)과 같은 구조를 쓴다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-sm flex-col gap-4">
        <section className="paper-card flex flex-col gap-5 px-6 py-6">
          <span className="text-center text-xs font-medium uppercase tracking-[0.3em] text-ink-2">
            {week}주 {day}일차 마감
          </span>

          {/* 오늘 수익 — 하루가 벌어들인 액수. 고정비는 주에 한 번이라 여기 없다(주간 결산이 뺀다). */}
          <p className="text-center font-mono text-4xl font-semibold tabular-nums text-go">
            {formatManwon(today?.revenueManwon ?? 0)}
          </p>

          <dl className="flex flex-col gap-1.5 border-t border-rule pt-3 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-xs text-ink-2">오늘 진료</dt>
              <dd className="font-semibold text-ink">{today?.examsDone ?? 0}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-xs text-ink-2">오늘 이탈</dt>
              {/* 색 단독 신호 금지 — 0이면 잉크색이고, 있을 때만 붉어진다(숫자가 함께 판정을 진다). */}
              <dd className={`font-semibold ${(today?.leftCount ?? 0) > 0 ? "text-stamp-ink" : "text-ink"}`}>
                {today?.leftCount ?? 0}
              </dd>
            </div>
          </dl>

          {/* 이번 주 누계 — 하루가 모여 주가 되는 걸 매일 밤 보여 준다. 7일째 밤엔 이 합이 곧 결산의 재료다. */}
          <dl className="flex flex-col gap-1.5 border-t border-rule pt-3 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-xs font-semibold text-ink">이번 주 누계 ({days.length}일)</dt>
              <dd className="font-semibold text-go">{formatManwon(revenueManwon)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-ink-2">
              <dt className="font-sans">진료 · 이탈</dt>
              <dd className="tabular-nums">
                {examsDone} · <span className={leftCount > 0 ? "text-stamp-ink" : undefined}>{leftCount}</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* 조작 UI는 종이에 얹지 않는다 — 버튼은 언제나 책상 위 고딕(§6 관통 규칙). */}
        <button
          type="button"
          onClick={onNextDay}
          className="rounded-xs border border-frame bg-desk-2 py-3 text-base font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          다음 날
        </button>
      </div>
    </div>
  );
}
