"use client";

import { callerPleaAt, receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  callDelta,
  hardlockReason,
  isElective,
  runningNetProfit,
  CALL_ECONOMICS,
  DAY_LABELS,
  type ReceivingState,
} from "@/game/receiving";
import { DAY_OPEN_MIN, freeDoctorsOfDept, pickAssignee } from "@/game/daysim";
import { handlingDept } from "@/game/doctor";
import { REASON_CLAUSE, type NewsItem } from "@/game/news";
import type { IncomingCall } from "@/game/types";
import SegmentTree from "./SegmentTree";
import DoctorRoster from "./DoctorRoster";
import HospitalMap from "./HospitalMap";
import { deriveMapScene } from "@/game/hospitalMap";
import { useHospitalClock } from "./useHospitalClock";

/** 09:00(DAY_OPEN_MIN) 기준 하루 시각(분)을 HH:MM으로. */
function formatClock(clockMin: number): string {
  const total = DAY_OPEN_MIN + clockMin;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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
 * 명랑 장부(사이드) — 오늘치 부문 손익 + 라이브 오늘 진료 수익 + 오늘 순이익.
 * lawsuitExposure는 여기서 절대 표시하지 않는다 — 냉정한 소송 비용은 결말(에필로그)에서만 실현된다.
 * 명랑한 숫자만 보이는 게 바로 1막 다크코미디의 논지다.
 */
function CheerfulLedger({ receiving }: { receiving: ReceivingState }) {
  // 부문 손익은 주간 손익의 1/7(오늘 몫)을 하루 진행률만큼 누적 — 콜 0에서 출발, 정적 선반영이 아님.
  const segments = accruedSegments(receiving);
  const netProfit = runningNetProfit(receiving);

  return (
    <section className="rounded-lg border border-zinc-800 bg-black/40 px-5 py-4">
      <p className="mb-3 text-xs uppercase tracking-[0.3em] text-zinc-600">
        {receiving.hospital.name} · 오늘 장부
      </p>
      <div className="flex flex-col gap-2 font-mono text-sm">
        <SegmentTree segments={segments} />
        <div className="my-1 border-t border-zinc-800/80" />
        <div className="flex items-baseline justify-between">
          <span className="text-zinc-400">오늘 진료 수익</span>
          <span className="tabular-nums text-emerald-400">
            {formatSignedBillions(receiving.netProfitDeltaBillions)}
          </span>
        </div>
        {/* 검사 수익은 진료 수익 바로 아래 별도 줄 — 덮는 게 뭔지 보여야 한다. 해석은 없다. */}
        {receiving.workupRevenueBillions !== 0 && (
          <div className="flex items-baseline justify-between">
            <span className="text-zinc-400">오늘 검사 수익</span>
            <span className="tabular-nums text-emerald-400">
              {formatSignedBillions(receiving.workupRevenueBillions)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-zinc-200">오늘 순이익</span>
          <span
            className={`tabular-nums font-semibold ${netProfit > 0 ? "text-emerald-400" : "text-zinc-300"}`}
          >
            {formatSignedBillions(netProfit)}
          </span>
        </div>
      </div>
      {netProfit > 0 && (
        <p className="mt-3 text-center text-xs font-medium text-emerald-400">오늘 흑자 🎉</p>
      )}
    </section>
  );
}

/**
 * 오늘 아침 신문 — 어제 돌려보낸 사람들의 후일담.
 *
 * 해석 0(메모 game-show-dont-tell): "당신이 죽였다"고 쓰지 않는다. 헤드라인은 **무주체**다 —
 * 병원명도 의사명도 환자 이름도 없다. 숫자(N곳, T시간)가 스스로 말한다.
 * 실제 응급실 뺑뺑이 보도 38건이 정확히 그렇게 쓰여 있고, 그게 이 게임의 원칙과 같다.
 */
function MorningPaper({ news }: { news: NewsItem[] }) {
  if (news.length === 0) return null;
  return (
    <section className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-4 py-3">
      <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500">오늘 아침 신문</p>
      <ul className="flex flex-col gap-2">
        {news.map((n) => (
          <li key={n.id} className="border-l-2 border-zinc-700 pl-3">
            <p className="text-sm font-medium leading-snug text-zinc-200">{n.headline}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{n.outlet}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function ReceivingPhase({
  receiving,
  day,
  news,
  fatigue,
  onDecide,
  onContinue,
}: {
  receiving: ReceivingState;
  day: number;
  news: NewsItem[];
  fatigue: Record<string, number>;
  onDecide: (accept: boolean) => void;
  onContinue: () => void;
}) {
  const dayLabel = `${DAY_LABELS[day - 1]}요일`;
  const { atMin, flowing, skip } = useHospitalClock(receiving);
  const scene = deriveMapScene(receiving, atMin);
  if (receiving.done) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 bg-zinc-950">
        <header className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            오늘의 콜 {receiving.queue.length}통을 모두 처리했습니다
          </h1>
        </header>

        <div className="flex flex-col gap-1.5">
          {receiving.log.map((entry, i) => {
            const call = receiving.queue[i];
            const label = entry.accepted
              ? "수용"
              : entry.disposition === "HARDLOCK_REJECT"
                ? "하드락"
                : "거절";
            return (
              <div
                key={entry.callId}
                className="flex items-center justify-between rounded-md border border-zinc-800 bg-white/[0.03] px-3 py-2 text-xs"
              >
                <span className="text-zinc-400">{call.label}</span>
                <span className={entry.accepted ? "text-emerald-400" : "text-zinc-600"}>{label}</span>
              </div>
            );
          })}
        </div>

        <CheerfulLedger receiving={receiving} />

        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg bg-emerald-600 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          계속
        </button>
      </main>
    );
  }

  const call = receiving.queue[receiving.index];
  const reason = hardlockReason(
    receiving.hospital,
    call,
    receiving.busyUntil,
    receiving.hospital.roster ?? [],
  );
  const plea = callerPleaAt(receiving.queue, receiving.index);

  const prevCall = receiving.index > 0 ? receiving.queue[receiving.index - 1] : undefined;
  const prevLog = receiving.log[receiving.log.length - 1];
  const prevLine =
    prevCall && prevLog
      ? receivingLine(
          prevCall,
          prevLog.disposition,
          prevLog.accepted,
          receiving.index - 1,
          prevLog.reason ?? undefined,
        )
      : undefined;

  const elective = isElective(call.kind);
  const dept = handlingDept(call);
  const arrivalMin = call.arrivalMin ?? 0;
  const free = freeDoctorsOfDept(receiving.hospital.roster ?? [], receiving.busyUntil, dept, arrivalMin);
  // decide()와 같은 가드 — 담당 과 자유 의사가 있으면 점유한다(세분 응급 포함, GENERAL 특례 제거).
  const assignee = free.length > 0 ? pickAssignee(free, receiving.busyUntil) : undefined;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 text-zinc-100 bg-zinc-950">
      {/*
        HUD — 요일·콜 진행·시각. 시각은 맵과 같은 atMin을 쓴다(빨리감기 중에는 시계도 함께 흐른다).
        해석 카피 0: 조명 이모지와 숫자만 놓는다.
      */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            콜 {receiving.index + 1} / {receiving.queue.length}
          </h1>
        </div>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-zinc-400">
          {formatClock(atMin)}
          <span aria-hidden>{scene.lighting === "NIGHT" ? "🌙" : scene.lighting === "DUSK" ? "🌆" : "☀"}</span>
        </span>
      </header>

      {/* 맵이 주인공. 재생 중 아무 데나 누르면 즉시 건너뛴다(반복 플레이 필수). */}
      <div
        onClick={flowing ? skip : undefined}
        className={flowing ? "cursor-pointer" : undefined}
        role="presentation"
      >
        <HospitalMap scene={scene} />
      </div>

      <MorningPaper news={news} />

      {prevLine && (
        <p className="text-xs text-zinc-600">
          직전 · {prevCall!.label} → {prevLine}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <section className="flex flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4">
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

        {/*
          명단을 남기는 이유: 아바타는 진료 중/자유만 보이고 피로도 막대는 못 보인다.
          맵이 순간 상태를, 명단이 누적을 담당한다.
        */}
        <div className="flex w-full flex-col gap-4 sm:w-72 sm:shrink-0">
          <DoctorRoster
            roster={receiving.hospital.roster ?? []}
            receiving={receiving}
            fatigue={fatigue}
            atMin={atMin}
          />
          <CheerfulLedger receiving={receiving} />
        </div>
      </div>
    </main>
  );
}
