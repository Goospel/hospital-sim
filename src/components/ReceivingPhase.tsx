"use client";

import { receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  runningNetProfit,
  DAY_LABELS,
  type ReceivingState,
} from "@/game/receiving";
import { DAY_OPEN_MIN } from "@/game/daysim";
import type { NewsItem } from "@/game/news";
import SegmentTree from "./SegmentTree";
import DoctorRoster from "./DoctorRoster";
import HospitalMap from "./HospitalMap";
import CallCard from "./CallCard";
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

/**
 * 흐름 중 패널 — 결정할 게 없는 동안 콜 카드 자리를 채운다.
 *
 * 직전 콜 결과는 여기 없다 — 패널 밖 독립된 줄로 옮겨 흐름 중이 아닐 때도(플레이어가
 * 결정을 고민하는 동안도) 계속 보이게 한다. 이 패널이 하는 일은 마감 대기 문구와
 * 건너뛰기 버튼뿐이다.
 *
 * min-h는 브라우저 실측값이다(T-065) — 이 패널은 76px, CallCard는 종류별로
 * 247px(선택진료: 가격표+버튼 2개)~304px(응급: 사유 배너+버튼 1개)로 렌더된다.
 * 카드 자리가 roster 열보다 커 그 차이(최대 228px)가 그대로 행 높이 변화 → 페이지
 * 점프로 이어지는 걸 같은 세션에서 직접 rect로 확인했다. 손으로 찍은 값이 아니라
 * 실측한 두 값(247·304) 중 큰 쪽을 그대로 썼다 — 19rem = 304px.
 */
function FlowPanel({
  waitingForDayEnd,
  onSkip,
}: {
  waitingForDayEnd: boolean;
  onSkip: () => void;
}) {
  return (
    <section className="flex min-h-[19rem] flex-1 flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.03] px-4 py-4">
      {waitingForDayEnd && (
        <p aria-live="polite" className="text-xs text-zinc-400">
          오늘 콜은 모두 처리했습니다 · 마지막 진료가 끝나기를 기다립니다
        </p>
      )}
      <button
        type="button"
        onClick={onSkip}
        className="mt-auto rounded-lg border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        건너뛰기
      </button>
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

  // 마감이어도 **흐르는 동안에는** 맵을 계속 보여준다 — 19시를 넘겨 마지막 진료가
  // 끝나는 걸 보는 게 이 슬라이스의 목적이라, 흐름이 끝난 뒤에만 요약으로 넘어간다.
  if (receiving.done && !flowing) {
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

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 text-zinc-100 bg-zinc-950">
      {/*
        HUD — 요일·콜 진행·시각. 시각은 맵과 같은 atMin을 쓴다(흐르는 동안 시계도 함께 흐른다).
        해석 카피 0: 조명 이모지와 숫자만 놓는다.
        카운터는 클램프한다 — 마감 흐름에서는 index === queue.length라 「콜 6 / 5」가 된다.
      */}
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-[0.25em] text-zinc-500">{dayLabel} · 전원 콜 접수</span>
          <h1 className="text-lg font-semibold">
            콜 {Math.min(receiving.index + 1, receiving.queue.length)} / {receiving.queue.length}
          </h1>
        </div>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums text-zinc-400">
          {formatClock(atMin)}
          <span aria-hidden>{scene.lighting === "NIGHT" ? "🌙" : scene.lighting === "DUSK" ? "🌆" : "☀"}</span>
        </span>
      </header>

      {/*
        맵이 주인공. 재생 중 아무 데나 눌러도 건너뛴다 — 편의용 중복 진입점이고,
        키보드 경로는 FlowPanel의 「건너뛰기」 버튼이 담당한다.
      */}
      <div
        onClick={flowing ? skip : undefined}
        className={flowing ? "cursor-pointer" : undefined}
        role="presentation"
      >
        <HospitalMap scene={scene} />
      </div>

      <MorningPaper news={news} />

      {/*
        그날 첫 콜이라 직전이 없으면 아무 문구도 넣지 않는다.
        패널 밖 독립된 줄이라 흐름 중이든 플레이어가 고민 중이든 계속 보인다 —
        맵 스프라이트가 전부 aria-hidden이라 이 줄이 스크린리더의 유일한 서술 경로다.
      */}
      {prevCall && prevLine && (
        <p className="text-xs text-zinc-500">
          직전 · {prevCall.label} → {prevLine}
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/*
          흐르는 동안엔 결정할 게 없어 카드가 없다. 도착해야 뜬다.
          (마감 흐름에서는 queue[index]가 undefined라 CallCard가 렌더되면 터진다.)
        */}
        {flowing ? (
          <FlowPanel waitingForDayEnd={receiving.done} onSkip={skip} />
        ) : (
          <CallCard receiving={receiving} onDecide={onDecide} />
        )}

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
