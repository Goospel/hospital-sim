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
  notice,
  week,
  day,
  onClose,
}: {
  kind: SimEventKind;
  /** 오늘의 연출문 — 폴백 문장이거나 LLM이 쓴 문장이다. **판정과 무관**하다(계획 §0-2). */
  narration: string;
  /** 결정론 효과의 **고지** — 연출문과 갈리는 자리다. 위(연출문)는 LLM이 갈아 끼울 수 있지만
   *  이 줄은 코어가 실제로 한 일이라(예: 소송의 위축 — narrative.chillNotice) AI 서사든
   *  폴백이든 함께 서야 한다. 그런 효과가 없는 이벤트에는 없다. */
  notice?: string;
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

          {/* 고지 — 연출문 아래 **다른 줄·다른 무게**로 선다(사직 통지와 편지가 갈리는 그 관례).
              한 문단으로 합치면 LLM 서사에 섞여 "일어난 일"과 "쓰인 말"이 구별되지 않는다. */}
          {notice && (
            <p className="border-t border-rule pt-3 text-center text-xs leading-relaxed text-ink-2">
              {notice}
            </p>
          )}
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
