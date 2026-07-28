"use client";

import { SIM_EVENTS, type SimEventKind } from "@/sim/events";

/**
 * 이벤트 카드 — 아침에 오늘의 일이 붙으면 부지 위에 올라오는 **속보 한 장**.
 *
 * 이 오버레이가 있어야 이벤트가 "규칙"이 아니라 "사건"으로 읽힌다: 배율은 코드가 조용히
 * 곱하므로(events.arrivalProbMulOf) 카드가 없으면 플레이어는 그날 환자가 왜 몰렸는지 영영
 * 모른다 — 회차 토스트가 없으면 응급이 사라진 것처럼 보이는 것과 같은 이유다.
 *
 * 계산도 판정도 하지 않는다: 무엇이 붙었는지는 코어(`world.event`)가, 라벨은 카탈로그
 * (`SIM_EVENTS`)가, 연출문은 `narrative`(폴백) 또는 LLM 텍스트가 정해서 온다.
 *
 * 떠 있는 동안 세계가 멈추는 것은 이 파일이 아니라 화면의 `paused` 파생이 한다(건설·채용·인사와
 * 같은 기계). 정지 상태를 하나 더 만들면 둘이 어긋나 카드를 닫아도 시계가 안 돌아온다.
 */
export default function EventCard({
  kind,
  narration,
  week,
  day,
  onClose,
}: {
  kind: SimEventKind;
  /** 오늘의 연출문 — 폴백 문장이거나 LLM이 쓴 문장이다. **판정과 무관**하다(계획 §0-2). */
  narration: string;
  week: number;
  day: number;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${SIM_EVENTS[kind].label} — ${week}주 ${day}일차`}
      /* 세로 가운데는 아이의 `my-auto`로 잡는다(T-088) — 결산·인사 오버레이와 같은 구조다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-sm flex-col gap-4">
        <section className="paper-card flex flex-col gap-4 px-6 py-6">
          {/* 「속보」 — 공문 질감. 결산지가 같은 자간(0.3em)의 머리글을 쓰는 그 자리다. */}
          <span className="text-center text-xs font-medium uppercase tracking-[0.3em] text-ink-2">
            속보 · {week}주 {day}일차
          </span>

          {/* 무슨 일인가 — 라벨은 카탈로그에서 온다(화면이 이름을 따로 적으면 두 벌이 된다). */}
          <h2 className="border-y border-rule py-3 text-center text-xl font-semibold text-ink">
            {SIM_EVENTS[kind].label}
          </h2>

          {/* 연출문 — 해석 카피는 붙이지 않는다(§show don't tell). 무슨 일이 있었는지만 말하고
              "그래서 응급이 3배입니다" 같은 수치 해설은 안 쓴다: 그날의 결과는 HUD와 마감이 보여 준다. */}
          <p className="text-center text-sm leading-relaxed text-ink">{narration}</p>
        </section>

        {/* 조작 UI는 종이에 얹지 않는다(§6) — 결산 오버레이의 [다음 주]와 같은 자리·같은 모양. */}
        <button
          type="button"
          onClick={onClose}
          className="rounded-xs border border-frame bg-desk-2 py-3 text-base font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          확인
        </button>
      </div>
    </div>
  );
}
