"use client";

import { useEffect, useRef } from "react";
import { callerPleaAt } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  callDelta,
  hardlockReason,
  isElective,
  CALL_ECONOMICS,
  type ReceivingState,
} from "@/game/receiving";
import { freeDoctorsOfDept, pickAssignee } from "@/game/daysim";
import { handlingDept } from "@/game/doctor";
import { REASON_CLAUSE } from "@/game/news";
import type { IncomingCall } from "@/game/types";

/**
 * 콜당 수가/원가 내역 — "가격을 누가 정하는가"를 두 줄로만 놓는다.
 *
 * 해석 0 원칙(메모 game-show-dont-tell): "정부가 원가도 안 준다"고 쓰지 않는다.
 * 미용은 '진료비 (병원 책정)'이 원가보다 크고, 급여는 '수가 (정부 고시)'가 원가보다 작다 —
 * 그 대조가 콜마다 반복되면 플레이어가 스스로 읽는다. 라벨 한 단어가 전부다.
 */
function CallEconomicsBreakdown({ call }: { call: IncomingCall }) {
  const e = CALL_ECONOMICS[call.kind];
  const delta = callDelta(call.kind);
  const revenueLabel = e.priceSetter === "HOSPITAL" ? "진료비 (병원 책정)" : "수가 (정부 고시)";

  return (
    <dl className="flex flex-col gap-1 rounded-md border border-zinc-800 bg-black/30 px-3 py-2.5 font-mono text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-zinc-400">{revenueLabel}</dt>
        <dd className="tabular-nums text-zinc-300">{formatSignedBillions(e.revenueBillions)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-zinc-400">원가</dt>
        <dd className="tabular-nums text-zinc-300">{formatSignedBillions(-e.costBillions)}</dd>
      </div>
      <div className="my-0.5 border-t border-zinc-800" />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="sr-only">수용 시 손익</dt>
        <dd className="ml-auto tabular-nums font-semibold text-zinc-100">
          {formatSignedBillions(delta)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * 도착한 콜 한 통 — 라벨·대사·수가·행동.
 *
 * **전제: `!receiving.done`.** done이면 index === queue.length라 queue[index] 읽기가
 * undefined를 낸다 — `flowing === false`는 이 전제와 다르다(done && !flowing에서도
 * flowing은 false지만 call은 여전히 undefined이므로 그 조건으론 안전을 보장 못 한다).
 */
export default function CallCard({
  receiving,
  onDecide,
}: {
  receiving: ReceivingState;
  onDecide: (accept: boolean) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);

  /**
   * 카드가 도착하는 순간(마운트)에 포커스를 이 섹션으로 옮긴다.
   *
   * 이유 둘: (1) 카드는 흐름 6~12초 동안 DOM에서 사라졌다 돌아오는데 그 복귀가
   * 스크린리더·키보드 사용자에게 아무 신호도 없었다. (2) 건너뛰기 버튼에서 Enter로
   * 도착한 경우 그 버튼 자체가 언마운트되며 포커스가 body로 떨어져, 다음 Tab이
   * 문서 맨 위부터 다시 시작했다. 버튼이 아니라 섹션을 잡는 이유: 선택진료의
   * 「받기」는 자유 의사가 없으면 disabled인데 disabled 요소는 포커스를 못 받는다 —
   * 섹션을 타깃으로 하면 그 분기를 아예 피한다. tabIndex={-1}이라 마우스 사용자에게는
   * 포커스 링이 안 보이면서도 스크린리더 커서는 옮겨가고 Tab 순서는 액션 버튼 직전으로
   * 재설정된다. 훗날 이 effect를 불필요하다고 지우지 말 것 — 위 두 문제가 되돌아온다.
   */
  useEffect(() => {
    cardRef.current?.focus();
  }, []);

  const call = receiving.queue[receiving.index];
  if (call === undefined) {
    // 산문 전제(!receiving.done)를 코드로 강제한다 — 다른 호출부나 이후 수정이 이 전제를
    // 깨도 throw 대신 빈 패널로 눈에 띄게 실패한다.
    return null;
  }
  const roster = receiving.hospital.roster ?? [];
  const reason = hardlockReason(receiving.hospital, call, receiving.busyUntil, roster);
  const plea = callerPleaAt(receiving.queue, receiving.index);

  const elective = isElective(call.kind);
  const dept = handlingDept(call);
  const arrivalMin = call.arrivalMin ?? 0;
  const free = freeDoctorsOfDept(roster, receiving.busyUntil, dept, arrivalMin);
  // decide()와 같은 가드 — 담당 과 자유 의사가 있으면 점유한다(세분 응급 포함, GENERAL 특례 제거).
  const assignee = free.length > 0 ? pickAssignee(free, receiving.busyUntil) : undefined;

  return (
    // min-h는 FlowPanel(ReceivingPhase.tsx)과 공유하는 값이다 — 19rem = 304px,
    // 실측한 두 카드 높이(선택진료 247px·응급 304px) 중 큰 쪽. 손으로 찍은 값이
    // 아니라 실측값이므로 둘 중 하나만 고치면 행 높이가 다시 흔들린다 — 함께 바꾼다.
    <section
      ref={cardRef}
      tabIndex={-1}
      className="flex min-h-[19rem] flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4"
    >
      {/*
        야간 표시 — 왜 밤에만 막히는지 플레이어가 스스로 잇게 하려면 시간대가 보여야 한다.
        해석은 없다. '야간' 두 글자와, 순환기를 뽑고도 밤에 거절당하는 경험만 놓는다.
      */}
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-zinc-100">{call.label}</p>
        {call.nightShift && (
          <span className="rounded-full border border-indigo-800/70 bg-indigo-950/50 px-2 py-0.5 text-[10px] font-medium tracking-wider text-indigo-300">
            야간
          </span>
        )}
      </div>
      <p className="text-sm italic text-zinc-400">&ldquo;{plea}&rdquo;</p>

      <CallEconomicsBreakdown call={call} />

      {elective ? (
        // 선택진료 — 플레이어가 받기/보내기를 정한다. 하드락은 없다(reason은 항상 null) —
        // 그 과 자유 의사가 없으면 '받기'만 비활성(구조가 막은 게 아니라 자원이 없는 것).
        <div className="mt-1 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onDecide(true)}
            disabled={free.length === 0}
            aria-label={`${call.label} 받기`}
            className="flex-1 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            받기
          </button>
          <button
            type="button"
            onClick={() => onDecide(false)}
            aria-label={`${call.label} 보내기`}
            className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            보내기
          </button>
        </div>
      ) : (
        // 응급 — decide가 accept를 무시하고 자동 판정한다. 여기선 그 결과만 먼저 보여주고
        // '계속'이 실제 decide(true)를 부른다(전개는 그대로, accept 값은 무의미).
        <div className="mt-1 flex flex-col gap-3">
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              reason === null
                ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-300"
                : "border-amber-800/60 bg-amber-950/30 text-amber-300"
            }`}
          >
            {reason === null ? `수용${assignee ? ` · ${assignee.name}` : ""}` : `전원 불가 · ${REASON_CLAUSE[reason]}`}
          </div>
          <button
            type="button"
            onClick={() => onDecide(true)}
            className="rounded-lg bg-zinc-100 py-3 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            계속
          </button>
        </div>
      )}
    </section>
  );
}
