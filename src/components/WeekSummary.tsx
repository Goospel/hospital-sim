"use client";

import { formatSignedManwon } from "@/game/labels";
import type { DeptLedgerLine } from "@/game/deptLedger";
import DeptLedgerTable from "./DeptLedgerTable";

/**
 * 주간 결산 — 한 주(7일)를 닫고 사용자가 계속할지 끝낼지 고르는 갈림길.
 *
 * 게임이 한 주로 끝나지 않는다는 걸 만드는 화면이다: [다음 주]로 세계가 다시 바뀌며 이어지고,
 * [종료]로 사용자가 끝을 정한다. 해석 0(메모 game-show-dont-tell): 이번 주/누적 숫자와 돌려보낸 응급 수만
 * 놓는다. "누적"이 매주 커지는 걸 보여 주는 게 이 화면의 일 — 세계 변화가 여러 주에 걸쳐 눈에 쌓인다.
 */
export default function WeekSummary({
  week,
  weekNetManwon,
  cumulativeNetManwon,
  received,
  turnedAway,
  treasury,
  insolvencyStreak,
  lines,
  onNextWeek,
  onEnd,
}: {
  week: number;
  weekNetManwon: number;
  cumulativeNetManwon: number;
  received: number;
  turnedAway: number;
  treasury: number;
  insolvencyStreak: number;
  lines: DeptLedgerLine[]; // 이번 주 7일 합산 과별 손익(SessionClient가 deptLedgerLines(ledgerDays, …)로 계산)
  onNextWeek: () => void;
  onEnd: () => void;
}) {
  const warning = insolvencyStreak === 1; // 아직 폐업 아님 — 경고
  const closed = insolvencyStreak >= 2; // 폐업
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 bg-desk px-5 py-10 text-on-desk">
      <span className="text-center text-xs font-medium uppercase tracking-[0.3em] text-on-desk/60">
        {week}주차 마감
      </span>

      {/*
        주간 마감 전표 — 하루 마감(DayEnd)과 같은 종이다. 하루가 모여 한 주가 되는 걸
        같은 물성으로 잇는다. 금액은 종이 잉크(흑자 go · 적자 stamp-ink).
      */}
      <section className="paper-card flex flex-col gap-5 px-6 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span
            className={`font-mono text-4xl font-semibold tabular-nums ${
              weekNetManwon < 0 ? "text-stamp-ink" : "text-go"
            }`}
          >
            {formatSignedManwon(weekNetManwon)}
          </span>
          {/* 받은/돌려보낸 응급을 나란히 — 해석 없이 두 숫자만(show-don't-tell). 돌려보낸 사람이 있으면 붉은 잉크로. */}
          <span
            className={`text-xs font-medium uppercase tracking-[0.2em] ${turnedAway > 0 ? "text-stamp-ink" : "text-ink-2"}`}
          >
            {turnedAway > 0
              ? `응급 · ${received}명 수용 · ${turnedAway}명 돌려보냄`
              : `응급 · ${received}명 전부 수용`}
          </span>
        </div>

        {/* 과별 손익 영수증 — 이번 주 순이익을 과별 7일 합산으로 쪼갠다(재투자 결정 직전에 가장 쓸모). */}
        <div className="border-t border-rule pt-3">
          <DeptLedgerTable lines={lines} />
        </div>

        <div className="flex flex-col gap-2 border-t border-rule pt-3 font-mono text-sm">
          {/* 누적 — 매주 커지는 '지금까지'. 주가 쌓일수록 세계 변화의 결과가 여기 모인다. */}
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-xs text-ink-2">{week}주 누적 손익</span>
            <span
              className={`tabular-nums font-semibold ${
                cumulativeNetManwon < 0 ? "text-stamp-ink" : "text-go"
              }`}
            >
              {formatSignedManwon(cumulativeNetManwon)}
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <span className="font-sans text-xs text-ink-2">금고 (다음 주 재투자 가능액)</span>
            <span
              className={`tabular-nums font-semibold ${treasury < 0 ? "text-stamp-ink" : "text-ink"}`}
            >
              {formatSignedManwon(treasury)}
            </span>
          </div>
        </div>
      </section>

      {(warning || closed) && (
        // 은행 통지 — 규칙의 사실만(해석 0). 경고는 "다음 주도 적자면 폐업", 폐업은 확정 통지.
        // 색 단독 신호 금지: 붉은 잉크 + 글자가 함께 판정을 진다.
        <p className="rounded-xs border border-stamp bg-stamp-field px-4 py-3 text-center text-sm font-medium text-stamp-ink">
          {closed
            ? `은행: 두 주 연속 적자입니다. 병원은 폐업합니다.`
            : `은행: 잔고 ${formatSignedManwon(treasury)}. 다음 주도 적자면 폐업합니다.`}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {!closed && (
          <button
            type="button"
            onClick={onNextWeek}
            className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            다음 주
          </button>
        )}
        <button
          type="button"
          onClick={onEnd}
          className={
            closed
              ? "rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
              : "rounded-xs border border-frame py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          }
        >
          {closed ? "결말 보기" : "종료"}
        </button>
      </div>
    </main>
  );
}
