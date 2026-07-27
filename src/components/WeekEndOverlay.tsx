"use client";

import { formatManwon, formatSignedManwon } from "@/game/labels";
import type { DayRecord } from "@/sim/day";
import { simDept, type SimDeptKey } from "@/sim/dept";
import type { WeekDeptLine, WeekSummary } from "@/sim/week";

/**
 * 주간 결산 오버레이 — 7일이 끝나고 **비용이 청구되는** 자리.
 *
 * 하루 마감(DayEndOverlay)이 매일 밤 수익만 보여 주는 것과 짝을 이룬다: 하루만 있으면 돈이
 * 늘기만 해 게임에 실패가 없고, 여기서 고정비를 한 번에 빼야 "한 판"이 성립한다. 그래서
 * 이 화면의 주인공은 큰 수익이 아니라 **순이익과 금고**다.
 *
 * 숫자는 전부 코어가 준 것을 그대로 읽는다 — 합계는 `weekSummary`(단일 출처), 금고는
 * 결산이 끝난 세계의 값. 화면이 자기 식으로 다시 빼면 장부가 두 벌이 된다.
 *
 * 폐업(CLOSED)은 [다음 주]가 **없는** 화면이다. 버튼을 남겨 두고 눌렀을 때 막는 대신 아예
 * 안 그린다: 코어(startNextWeek)가 CLOSED에서 throw하므로 누를 수 있는 버튼은 곧 크래시다.
 */
export default function WeekEndOverlay({
  week,
  days,
  summary,
  treasuryManwon,
  insolvencyStreak,
  closed,
  onNextWeek,
}: {
  week: number;
  days: DayRecord[];
  summary: WeekSummary;
  treasuryManwon: number;
  /** 금고가 음수로 끝난 주의 **연속** 횟수 — 1이면 은행 경고, 문턱을 채우면 폐업(closed). */
  insolvencyStreak: number;
  /** 세계가 CLOSED인가 — 판정은 코어(settleWeek)가 했고 여기선 그 결과만 읽는다. */
  closed: boolean;
  onNextWeek: () => void;
}) {
  const warning = !closed && insolvencyStreak > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${week}주차 결산`}
      /* 세로 가운데는 `items-center`가 아니라 **아이의 `my-auto`**로 잡는다. 스크롤 컨테이너에서
         items-center는 내용이 뷰포트보다 길어지는 순간 아이의 top을 음수로 밀어내는데, 넘친
         위쪽은 **스크롤해도 닿을 수 없다**(실측: 900px 아이의 top이 −434px). 7일 표가 든 이
         화면은 창이 낮으면 바로 그 상태가 된다 — 마진 오토는 자리가 남을 때만 가운데로 민다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-sm flex-col gap-4">
        <section className="paper-card flex flex-col gap-5 px-6 py-6">
          <span className="text-center text-xs font-medium uppercase tracking-[0.3em] text-ink-2">
            {week}주차 결산
          </span>

          {/* 순이익 — 수익에서 고정비를 뺀 값. 이 화면에서 처음으로 숫자가 음수가 될 수 있다. */}
          <p
            className={`text-center font-mono text-4xl font-semibold tabular-nums ${
              summary.netManwon < 0 ? "text-stamp-ink" : "text-go"
            }`}
          >
            {formatSignedManwon(summary.netManwon)}
          </p>

          {/* 7일 표 — 주간 합계를 하루로 쪼갠다. 어느 날 이탈이 터졌는지 여기서만 보인다. */}
          <table className="w-full border-t border-rule pt-3 font-mono text-xs tabular-nums">
            <thead>
              <tr className="text-ink-2">
                <th scope="col" className="py-1 text-left font-sans font-normal">
                  일
                </th>
                <th scope="col" className="py-1 text-right font-sans font-normal">
                  진료
                </th>
                <th scope="col" className="py-1 text-right font-sans font-normal">
                  이탈
                </th>
                <th scope="col" className="py-1 text-right font-sans font-normal">
                  수익
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-t border-rule/40 text-ink">
                  <td className="py-1">{d.day}</td>
                  <td className="py-1 text-right">{d.examsDone}</td>
                  <td className={`py-1 text-right ${d.leftCount > 0 ? "text-stamp-ink" : ""}`}>{d.leftCount}</td>
                  <td className="py-1 text-right">{formatManwon(d.revenueManwon)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 과별 표 — 이 화면의 논지가 여기 있다. 필수과는 수익보다 고정비가 커서 순익이
              음수로 서고, 미용만 흑자가 된다. 해석 카피는 없다(§show don't tell): 부호가
              나란히 놓일 뿐이고, "옳은 의료를 할수록 장부가 나빠진다"는 플레이어가 읽는다.
              줄 순서·줄이 서는 조건은 코어(weekSummary.byDept)가 정한다 — 화면은 그대로 놓는다. */}
          <table className="w-full border-t border-rule pt-3 font-mono text-xs tabular-nums">
            <thead>
              <tr className="text-ink-2">
                <th scope="col" className="py-1 text-left font-sans font-normal">과</th>
                <th scope="col" className="py-1 text-right font-sans font-normal">인원</th>
                <th scope="col" className="py-1 text-right font-sans font-normal">수익</th>
                <th scope="col" className="py-1 text-right font-sans font-normal">고정비</th>
                <th scope="col" className="py-1 text-right font-sans font-normal">순익</th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(summary.byDept) as [SimDeptKey, WeekDeptLine][]).map(([key, line]) => (
                <tr key={key} className="border-t border-rule/40 text-ink">
                  <td className="py-1 font-sans">{simDept(key).label}</td>
                  <td className="py-1 text-right">{line.doctors}</td>
                  <td className="py-1 text-right">{formatManwon(line.revenueManwon)}</td>
                  <td className="py-1 text-right text-stamp-ink">−{formatManwon(line.fixedCostManwon)}</td>
                  <td className={`py-1 text-right ${line.netManwon < 0 ? "text-stamp-ink" : "text-ink"}`}>
                    {formatSignedManwon(line.netManwon)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="flex flex-col gap-1.5 border-t border-rule pt-3 font-mono text-sm tabular-nums">
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-xs text-ink-2">진료 수익</dt>
              <dd className="text-ink">{formatManwon(summary.revenueManwon)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              {/* 고정비는 주에 한 번 — 하루 마감엔 없던 항목이라 이름을 그대로 쓴다(월급). */}
              <dt className="font-sans text-xs text-ink-2">고정비 (의사 월급)</dt>
              <dd className="text-stamp-ink">−{formatManwon(summary.fixedCostManwon)}</dd>
            </div>
            {/* 응급 줄 — **문앞 판정** 기준이다. 수용은 "받아들인 시점"에 세므로, 처치까지 못
                간 채 마감을 맞은 건은 여기 수용에 들어 있으면서 위 과별 표의 수익에는 없다.
                라벨이 그 사실을 직접 말한다(숫자만 놓으면 표와 어긋나 보인다).
                ⚠️ 사유별 내역(의사 없음/병상 없음)은 **하루 마감**에만 있다 — 코어의 주간 기록
                (DayRecord.emergencies)이 건수만 들고 사유는 그날의 stats에만 남기 때문이다. */}
            <div className="flex items-baseline justify-between">
              <dt className="font-sans text-xs text-ink-2">응급 (문앞 판정)</dt>
              <dd className="text-ink">
                수용 {summary.emergencies.accepted}
                <span className="text-ink-2"> · 회차 </span>
                <span className={summary.emergencies.turnedAway > 0 ? "text-stamp-ink" : "text-ink"}>
                  {summary.emergencies.turnedAway}
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-rule pt-2">
              <dt className="font-sans text-xs font-semibold text-ink">금고</dt>
              <dd className={`font-semibold ${treasuryManwon < 0 ? "text-stamp-ink" : "text-ink"}`}>
                {formatSignedManwon(treasuryManwon)}
              </dd>
            </div>
          </dl>
        </section>

        {(warning || closed) && (
          // 은행 통지 — 규칙의 사실만(해석 0). 색 단독 신호 금지: 붉은 잉크 + 글자가 함께 판정을 진다.
          <p className="rounded-xs border border-stamp bg-stamp-field px-4 py-3 text-center text-sm font-medium text-stamp-ink">
            {closed
              ? "은행: 두 주 연속 적자입니다. 병원은 폐업합니다."
              : `은행: 잔고 ${formatSignedManwon(treasuryManwon)}. 다음 주도 적자면 폐업합니다.`}
          </p>
        )}

        {/* 조작 UI는 종이에 얹지 않는다(§6). 폐업이면 버튼 자체가 없다 — 이 판은 여기서 끝난다. */}
        {closed ? (
          <p className="text-center text-sm text-on-desk-muted">병원 문을 닫았습니다. 새로고침하면 다시 개원합니다.</p>
        ) : (
          <button
            type="button"
            onClick={onNextWeek}
            className="rounded-xs border border-frame bg-desk-2 py-3 text-base font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            다음 주
          </button>
        )}
      </div>
    </div>
  );
}
