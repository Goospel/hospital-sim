"use client";

import { useEffect, useRef, useState } from "react";
import { callerPleaAt } from "@/game/dialogue";
import { formatSignedManwon } from "@/game/labels";
import {
  callDelta,
  canBump,
  bumpTarget,
  hardlockReason,
  isElective,
  startMinFor,
  CALL_ECONOMICS,
  type ReceivingState,
  type DecisionAction,
} from "@/game/receiving";
import { freeDoctorsOfDept, pickAssignee, formatClockFromOpen as formatClock } from "@/game/daysim";
import { handlingDept } from "@/game/doctor";
import { DEPARTMENTS } from "@/game/setup";
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
    <dl className="flex flex-col gap-1 rounded-xs border border-frame bg-desk px-3 py-2.5 font-mono text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-sans text-on-desk/70">{revenueLabel}</dt>
        <dd className="tabular-nums text-on-desk">{formatSignedManwon(e.revenueManwon)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="font-sans text-on-desk/70">원가</dt>
        <dd className="tabular-nums text-on-desk">{formatSignedManwon(-e.costManwon)}</dd>
      </div>
      <div className="my-0.5 border-t border-frame" />
      <div className="flex items-baseline justify-between gap-3">
        <dt className="sr-only">수용 시 손익</dt>
        {/*
          부호는 색이 아니라 숫자가 이미 말한다(formatSignedManwon의 +/−).
          손실만 alarm으로 물들여 어두운 책상 위에서 유일한 붉은색이 되게 한다 —
          종이 위 적자(stamp-ink)와 섞지 않는다(스펙 §2-C: 밝기 맥락으로 분리).
        */}
        <dd
          className={`ml-auto text-sm tabular-nums font-semibold ${delta < 0 ? "text-alarm" : "text-on-desk"}`}
        >
          {formatSignedManwon(delta)}
        </dd>
      </div>
    </dl>
  );
}

/**
 * 응급 결정 카운트다운(실초) — 구급대의 인내다. 만료면 환자는 다른 병원으로 넘어간다(TIMEOUT).
 *
 * 실시간은 여기 UI에만 있다 — 코어(decide)는 'TIMEOUT'이라는 명시 액션을 받을 뿐 시계를 모른다
 * (결정론 테스트에 실초가 새지 않는 경계, 스펙 §4). 값 조정은 이 상수 하나다.
 * 콜별 리셋은 ReceivingPhase의 key={call.id} 리마운트가 담당한다.
 *
 * 하드락(거부 도장이 이미 찍힌) 카드에서도 이 카운트다운은 그대로 돌고 만료 시 TIMEOUT이
 * 나간다 — 의도된 동작이다. 구급대의 인내는 우리 병원 사정과 무관하게 흐른다. 로그는
 * 오염되지 않는다: core의 decide가 `logReason = reason ?? (...)` 순서로 하드락 사유를
 * UNANSWERED보다 먼저 채택한다(src/game/receiving.ts). 결함으로 보고 되돌리지 말 것.
 */
const EMERGENCY_DECISION_SECONDS = 15;

function EmergencyCountdown({ onExpire }: { onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(EMERGENCY_DECISION_SECONDS);
  const firedRef = useRef(false); // StrictMode 이중 마운트·재렌더에서 TIMEOUT 1회 보장
  useEffect(() => {
    // 0 이하로는 더 셀 필요가 없다 — tick 안에서 스스로 clearInterval해 언마운트 전까지
    // 매초 불필요한 리렌더가 쌓이는 걸 막는다. TIMEOUT 1회 보장은 아래 firedRef가 별도로 맡는다.
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) clearInterval(t);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (secondsLeft <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire();
    }
  }, [secondsLeft, onExpire]);
  return (
    // role="timer"는 정확히 이 용도의 ARIA 역할이고 기본이 비발화(암묵 aria-live="off")다.
    // 매초 바뀌는 값에 aria-live="polite"를 걸면 스크린리더가 15초 내내 초를 읽어 카드의
    // 다른 정보(대사·수가·버튼)를 덮는다 — 빈번히 바뀌는 콘텐츠에 aria-live는 안티패턴.
    // 숫자 텍스트 자체는 그대로 둔다(색 단독 신호 금지 규칙, 스펙 §7) — 접근 가능하되 조용할 뿐이다.
    <div role="timer" aria-label="결정 제한 시간" className="flex items-center gap-2">
      <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-xs bg-desk">
        <div
          className="h-full bg-alarm transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.max(0, (secondsLeft / EMERGENCY_DECISION_SECONDS) * 100)}%` }}
        />
      </div>
      {/* 해석 0 — 숫자만. 색(alarm) 단독 신호 금지라 초 숫자가 판정을 진다(스펙 §7). */}
      <span className="shrink-0 font-mono text-xs tabular-nums text-on-desk/70">
        {Math.max(0, secondsLeft)}초
      </span>
    </div>
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
  onDecide: (action: DecisionAction) => void;
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
  /*
    decide()와 **같은 함수**로 판정한다(startMinFor). 예전엔 여기서 도착 시각의 자유 의사만
    셌는데, 대기가 생긴 뒤로 그 판정이 실제 처리와 어긋났다 — 담당 의사가 지금 바쁘기만 하면
    「받기」가 비활성인데 decide는 기다렸다 받을 수 있었다. 두 곳에 판정을 각각 적으면 카드가
    거짓말을 한다(브라우저에서 실제로 진행 불가 상태가 나왔다, 2026-07-23).
  */
  const start = startMinFor(call, receiving.busyUntil, roster);
  const canStart = typeof start === "number";
  const assignee = canStart
    ? pickAssignee(freeDoctorsOfDept(roster, receiving.busyUntil, dept, start), receiving.busyUntil)
    : undefined;
  // 지금 바로 못 보고 기다려야 하는 시간. 0이면 즉시 진료다.
  const waitMin = canStart ? start - arrivalMin : 0;

  // BUMP(예약 미루고 받기) — 하드락이면 canBump가 false라 이 계산 자체가 무의미해진다(구조의 벽은 못 뚫는다).
  const bumpable = !elective && canBump(receiving, call);
  const bumpDoctor = bumpable
    ? (receiving.hospital.roster ?? []).find((d) => d.id === bumpTarget(receiving, call))
    : undefined;
  const bumpedDelta = bumpDoctor ? receiving.busyWith[bumpDoctor.id]?.deltaManwon ?? 0 : 0;

  return (
    // 카드는 이제 화면 중앙 오버레이 안에 뜬다(ReceivingPhase) — 페이지 흐름의 한 칸이
    // 아니므로 자리를 잡아두는 min-h가 필요 없다. 폭만 잡고 높이는 내용에 맡긴다.
    <section
      ref={cardRef}
      tabIndex={-1}
      className="flex w-full max-w-md flex-col gap-3 rounded-xs border border-frame bg-desk-2 px-4 py-4 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
    >
      {/*
        야간 표시 — 왜 밤에만 막히는지 플레이어가 스스로 잇게 하려면 시간대가 보여야 한다.
        해석은 없다. '야간' 두 글자와, 순환기를 뽑고도 밤에 거절당하는 경험만 놓는다.

        진단명은 명조(font-serif) — "사람이 쓴 판정"이 명조의 역할이다(스펙 §3-A).
        명조는 소형에서 한글 획이 무너져 18px(text-lg) 이상에서만 쓴다(§3-C).
      */}
      <div className="flex items-baseline gap-2">
        <p className="font-serif text-lg leading-snug text-on-desk">{call.label}</p>
        {call.nightShift && (
          <span className="shrink-0 rounded-xs border border-frame px-1.5 py-0.5 font-mono text-[11px] tracking-wider text-on-desk/70">
            야간
          </span>
        )}
      </div>
      <p className="text-sm text-on-desk/70">&ldquo;{plea}&rdquo;</p>

      <CallEconomicsBreakdown call={call} />

      {/*
        기다려야 받을 수 있는 콜이면 그 사실을 먼저 말한다 — 「받기」가 활성인데 정작 지금
        비어 있는 의사가 없으면, 플레이어는 자기가 무엇에 동의하는지 모른 채 누르게 된다.
        해석 0: 대기 분수와 담당자 이름만 놓는다("위험하다"고 쓰지 않는다).
      */}
      {waitMin > 0 && (
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          {waitMin}분 대기 후 진료 시작 · {assignee?.name}
        </p>
      )}

      {elective && !canStart && (
        // 받기가 잠긴 이유를 사실로 — 「그 과 의사가 다 진료 중, N시에 자리」 또는 「그 과 의사 없음」.
        // 선택진료는 하드락이 아니라 사유 도장을 안 쓴다(그건 응급의 구조적 벽 전용). 담백한 한 줄.
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          {start === "NO_FREE_SPECIALIST"
            ? `${DEPARTMENTS.find((d) => d.key === dept)?.label ?? dept} 의사가 없습니다`
            : `${DEPARTMENTS.find((d) => d.key === dept)?.label ?? dept} 의사가 모두 진료 중 · 오늘 자리 없음`}
        </p>
      )}

      {elective && canStart && assignee && (
        // 수락 결과를 사실로 — 「이 의사가 이 시각까지 묶인다」. 그 시간에 같은 과 응급이 오면
        // 못 받는다는 결론은 플레이어가 스스로 잇는다(해석 0). start·durationMin은 decide와 같은
        // 값이라(startMinFor 공유) 카드에 뜬 미리보기와 실제 점유가 어긋나지 않는다.
        <p className="rounded-xs border border-frame bg-desk px-3 py-2 font-mono text-xs text-on-desk/70">
          수락 시 {assignee.name} · {formatClock(start + (call.durationMin ?? 0))}까지 점유
        </p>
      )}

      {elective ? (
        // 선택진료 — 플레이어가 받기/보내기를 정한다. 하드락은 없다(reason은 항상 null) —
        // 그 과 의사가 아예 없거나 대기 한계를 넘길 때만 '받기'가 비활성이다.
        <div className="mt-auto flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onDecide("ACCEPT")}
            disabled={!canStart}
            aria-label={`${call.label} 받기`}
            className="flex-1 rounded-xs bg-go py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            받기
          </button>
          <button
            type="button"
            onClick={() => onDecide("DECLINE")}
            aria-label={`${call.label} 보내기`}
            className="flex-1 rounded-xs border border-frame py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            보내기
          </button>
        </div>
      ) : (
        // 응급 — 이제 결과 통보가 아니라 결정이다. 하드락이면 그 사유가 도장으로 서고
        // 「받기」가 잠긴다 — 결과는 코드가 정했지만, 돌려보내는 버튼은 플레이어가 누른다.
        <div className="mt-auto flex flex-col gap-3">
          {reason !== null && (
            /*
              판정 도장 — 색 단독 신호 금지(스펙 §7)라 사유 텍스트를 반드시 싣는다(흑백으로
              찍어도 판정이 남는다). 이 화면의 유일한 도장(§5 "화면당 0~1종, 불가역 판정에만").
              회전 -1.5°는 상한 ±3° 안 — 서류는 반듯하고, 도장만 손으로 찍혀 살짝 기운다.
            */
            <p className="-rotate-[1.5deg] self-start rounded-stamp border-2 border-stamp bg-stamp-field px-3 py-1.5 font-serif text-lg leading-tight text-stamp-ink">
              전원 불가 · {REASON_CLAUSE[reason]}
            </p>
          )}
          <EmergencyCountdown onExpire={() => onDecide("TIMEOUT")} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onDecide("ACCEPT")}
              disabled={reason !== null}
              aria-label={`${call.label} 받기`}
              className="flex-1 rounded-xs bg-go py-3 text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-desk disabled:text-on-desk/70 disabled:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              받기{reason === null && assignee ? ` · ${assignee.name}` : ""}
            </button>
            <button
              type="button"
              onClick={() => onDecide("DECLINE")}
              aria-label={`${call.label} 돌려보내기`}
              className="flex-1 rounded-xs border border-frame py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              돌려보내기
            </button>
          </div>
          {bumpable && bumpDoctor && (
            // 「예약 미루고 받기」 — 라벨은 사실만: 누구의 진료를 중단하고 얼마를 잃는가(해석 0).
            // 하드락이면 canBump가 false라 이 버튼은 애초에 안 뜬다(구조의 벽은 못 뚫는다).
            <button
              type="button"
              onClick={() => onDecide("BUMP_ACCEPT")}
              aria-label={`예약 미루고 받기 — ${bumpDoctor.name} 진료 중단`}
              className="rounded-xs border border-frame bg-desk py-3 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
            >
              예약 미루고 받기 · {bumpDoctor.name} 진료 중단 · {formatSignedManwon(-bumpedDelta)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
