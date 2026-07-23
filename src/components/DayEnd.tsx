"use client";

import { DAY_LABELS } from "@/game/receiving";
import { formatSignedBillions } from "@/game/labels";
import { DAYS_PER_WEEK } from "@/game/setup";
import type { DayRecord } from "@/game/session";

/**
 * 하루 마감 달력 — 한 주(7일)가 한 칸씩 채워진다.
 *
 * 해석 0 원칙(메모 game-show-dont-tell): 숫자와 색만 놓는다. "흑자라 좋다"거나 "환자를 돌려보냈다"는
 * 말은 어디에도 없다. 일곱 칸이 다 차면 그 달력 자체가 플레이어의 초상이 된다 —
 * 미용으로 자리를 채운 사람의 달력은 일곱 칸 전부 초록이고, 받은 사람의 달력만 붉다.
 * 돌려보낸 환자는 달력에 찍히지 않는다는 것도 말하지 않는다. 보면 안다.
 */
export default function DayEnd({
  days,
  currentDay,
  isLast,
  onContinue,
}: {
  days: DayRecord[];
  currentDay: number;
  isLast: boolean;
  onContinue: () => void;
}) {
  const today = days.find((d) => d.day === currentDay);
  const weekTotal = days.reduce((n, d) => n + d.netProfitBillions, 0);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col justify-center gap-6 bg-desk px-5 py-8 text-on-desk">
      <span className="text-center text-xs font-medium uppercase tracking-[0.3em] text-on-desk/60">
        {DAY_LABELS[currentDay - 1]}요일 마감
      </span>

      {/*
        하루치 마감 전표 — **1막의 유일한 종이**다(디자인 스펙 §6).
        낮 동안은 어두운 책상에서 결정하고, 하루가 끝나면 그 결과가 종이에 인쇄돼 나온다.
        그래서 금액은 여기서 종이 잉크를 쓴다: 흑자=go, 적자=stamp-ink(§2-C, 지면 위
        alarm과 섞지 않는다).
      */}
      <section aria-label="이번 주 장부" className="paper-card flex flex-col gap-5 px-6 py-6">
        <p className="text-center">
          <span
            className={`font-mono text-4xl font-semibold tabular-nums ${
              (today?.netProfitBillions ?? 0) < 0 ? "text-stamp-ink" : "text-go"
            }`}
          >
            {formatSignedBillions(today?.netProfitBillions ?? 0)}
          </span>
        </p>

        {/* 달력 — 지난 날은 숫자, 오늘은 테두리, 아직 안 온 날은 빈칸. */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
            const day = i + 1;
            const rec = days.find((d) => d.day === day);
            const isToday = day === currentDay;
            /*
              흑자 칸에 배경 틴트를 깔지 않는다 — paper-edge를 얹으면 종이가 어두워져
              초록 잉크(go) 대비가 4.10:1까지 떨어졌다(실측). 맨 종이 위에서는 4.56이라
              AA를 넘는다. 적자만 stamp-field(종이보다 **밝은** 도장밭)라 7.84로 더 잘 읽힌다.
              칸을 가르는 건 틴트가 아니라 괘선과 숫자다.
            */
            const tone = !rec
              ? "border-rule/50 text-ink-2"
              : rec.netProfitBillions < 0
                ? "border-stamp/40 bg-stamp-field text-stamp-ink"
                : "border-rule text-go";
            return (
              <div
                key={day}
                className={`flex flex-col items-center gap-1 rounded-stamp border px-1 py-2.5 transition-colors ${tone} ${
                  isToday ? "outline outline-1 outline-offset-1 outline-ink" : ""
                }`}
              >
                <span className="font-mono text-[10px] font-semibold tracking-wide text-ink-2">
                  {DAY_LABELS[i]}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums">
                  {rec ? formatSignedBillions(rec.netProfitBillions).replace("억", "") : "·"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-baseline justify-between border-t border-rule pt-3 font-mono text-sm">
          <span className="font-sans text-xs font-semibold text-ink">이번 주 누계</span>
          <span
            className={`text-base tabular-nums font-semibold ${weekTotal < 0 ? "text-stamp-ink" : "text-go"}`}
          >
            {formatSignedBillions(weekTotal)}
          </span>
        </div>
      </section>

      {/* 조작 UI는 종이에 얹지 않는다 — 버튼은 언제나 책상 위 고딕(§6 관통 규칙). */}
      <button
        type="button"
        onClick={onContinue}
        className="rounded-xs border border-frame py-3 text-base font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
      >
        {isLast ? "계속" : `${DAY_LABELS[currentDay]}요일로`}
      </button>
    </main>
  );
}
