"use client";

import { useEffect, useRef } from "react";
import { receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  isAutoAccept,
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
import { deriveMapScene, type Lighting } from "@/game/hospitalMap";
import { useHospitalClock } from "./useHospitalClock";

/** 09:00(DAY_OPEN_MIN) 기준 하루 시각(분)을 HH:MM으로. */
function formatClock(clockMin: number): string {
  const total = DAY_OPEN_MIN + clockMin;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 시간대 라벨 — 조명 이모지(☀🌆🌙)를 활자로 바꾼 것.
 *
 * 테마 규율이 이모지를 전면 금지한다(디자인 스펙 §8-A) — 이모지는 서류의 무게를 즉시
 * 증발시킨다. 밝기 자체는 맵의 조명 워시가 이미 보여주므로, 여기 글자는 그 워시에
 * 이름을 붙이는 역할만 한다(해석 0 — "늦었다"고 쓰지 않는다).
 */
const LIGHTING_LABEL: Record<Lighting, string> = {
  DAY: "주간",
  DUSK: "일몰",
  NIGHT: "야간",
};

/**
 * 명랑 장부(사이드) — 오늘치 부문 손익 + 라이브 오늘 진료 수익 + 오늘 순이익.
 * lawsuitExposure는 여기서 절대 표시하지 않는다 — 냉정한 소송 비용은 결말(에필로그)에서만 실현된다.
 * 명랑한 숫자만 보이는 게 바로 1막 다크코미디의 논지다.
 *
 * **이 화면의 유일한 종이**다(디자인 스펙 §6: 콜 접수는 desk 위주, 종이는 그날의 기록물 1장까지).
 * 어두운 책상 위에서 결정하고, 그 결과는 밝은 장부에 적힌다 — 명암 낙차 자체가 정보다.
 */
function CheerfulLedger({ receiving }: { receiving: ReceivingState }) {
  // 부문 손익은 주간 손익의 1/7(오늘 몫)을 하루 진행률만큼 누적 — 콜 0에서 출발, 정적 선반영이 아님.
  const segments = accruedSegments(receiving);
  const netProfit = runningNetProfit(receiving);

  return (
    <section className="paper-card px-5 py-4">
      <p className="mb-3 font-sans text-xs font-medium uppercase tracking-[0.25em] text-ink-2">
        {receiving.hospital.name} · 오늘 장부
      </p>
      <div className="flex flex-col gap-2 font-mono text-sm">
        <SegmentTree segments={segments} />
        <div className="my-1 border-t border-rule" />
        <div className="flex items-baseline justify-between">
          <span className="font-sans text-xs text-ink-2">오늘 진료 수익</span>
          <span className="tabular-nums text-go">
            {formatSignedBillions(receiving.netProfitDeltaBillions)}
          </span>
        </div>
        {/* 검사 수익은 진료 수익 바로 아래 별도 줄 — 덮는 게 뭔지 보여야 한다. 해석은 없다. */}
        {receiving.workupRevenueBillions !== 0 && (
          <div className="flex items-baseline justify-between">
            <span className="font-sans text-xs text-ink-2">오늘 검사 수익</span>
            <span className="tabular-nums text-go">
              {formatSignedBillions(receiving.workupRevenueBillions)}
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-rule pt-2">
          <span className="font-sans text-xs font-semibold text-ink">오늘 순이익</span>
          <span
            className={`text-base tabular-nums font-semibold ${netProfit < 0 ? "text-stamp-ink" : "text-go"}`}
          >
            {formatSignedBillions(netProfit)}
          </span>
        </div>
      </div>
      {/*
        색 단독 신호 금지(스펙 §7) — 초록만으로 흑자를 말하지 않고 글자를 함께 놓는다.
        이모지(🎉)는 제거했다: 명랑함은 초록 잉크와 "흑자" 두 글자가 이미 나른다.
      */}
      {netProfit > 0 && (
        <p className="mt-3 border-t border-rule pt-2 text-center font-sans text-xs font-medium text-go">
          오늘 흑자
        </p>
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
 *
 * 종이로 만들지 않는다 — 이 화면의 종이 한 장은 장부가 쓴다(스펙 §6 "1장까지"). 신문이
 * 종이 물성을 받는 자리는 결말의 「이번 주 신문」이고, 여기선 그 예고편처럼 데스크 위
 * 스트립으로 스친다.
 */
function MorningPaper({ news }: { news: NewsItem[] }) {
  if (news.length === 0) return null;
  return (
    <section className="rounded-xs border border-frame bg-desk-2 px-4 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.25em] text-on-desk/60">
        오늘 아침 신문
      </p>
      <ul className="flex flex-col gap-2">
        {news.map((n) => (
          <li key={n.id} className="border-l-2 border-frame pl-3">
            <p className="font-serif text-lg leading-snug text-on-desk">{n.headline}</p>
            <p className="mt-0.5 font-mono text-xs text-on-desk/70">{n.outlet}</p>
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
 * 결정을 고민하는 동안도) 계속 보이게 한다.
 *
 * 상태 문구는 **항상** 뜬다. 처음엔 마감 대기 문구만 뒀는데 그건 `receiving.done`일
 * 때만 참이라, 정작 대부분의 시간인 콜과 콜 사이에는 패널에 버튼만 남아 아래 min-h가
 * 그 공백을 304px로 키웠다(T-066). 두 문구 다 지금 무슨 일이 일어나는지만 말한다.
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
    <section className="flex min-h-[19rem] flex-1 flex-col gap-3 rounded-xs border border-frame bg-desk-2 px-4 py-4">
      <p
        aria-live="polite"
        className="flex flex-1 items-center justify-center text-center text-xs text-on-desk/70"
      >
        {waitingForDayEnd
          ? "오늘 콜은 모두 처리했습니다 · 마지막 진료가 끝나기를 기다립니다"
          : "다음 콜을 기다립니다"}
      </p>
      <button
        type="button"
        onClick={onSkip}
        className="rounded-xs border border-frame py-2.5 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
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

  /*
    자동 접수 — 워크인(보톡스·검진)은 도착해도 카드를 세우지 않고 곧바로 받는다.
    그 콜엔 결정이 없었기 때문이다(isAutoAccept 주석). 받은 사실은 아래 「직전」 줄과
    맵(의사가 방으로 들어간다)이 보여준다 — 조용히 사라지지 않는다.

    ref로 콜당 1회를 잠근다. onDecide는 함수형 setState라 같은 콜에 두 번 불리면 큐가
    두 칸 전진한다 — StrictMode의 이중 마운트가 정확히 그 두 번을 만든다.
    콜 id는 하루 안에서 고유하고(`d{day}c{n}`), 하루가 바뀌면 이 컴포넌트가 언마운트돼
    ref도 함께 초기화된다.
  */
  const arrived = receiving.done ? undefined : receiving.queue[receiving.index];
  const autoCallId = arrived && !flowing && isAutoAccept(arrived.kind) ? arrived.id : undefined;
  const autoDecidedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoCallId === undefined || autoDecidedRef.current === autoCallId) return;
    autoDecidedRef.current = autoCallId;
    onDecide(true);
  }, [autoCallId, onDecide]);

  // 마감이어도 **흐르는 동안에는** 맵을 계속 보여준다 — 19시를 넘겨 마지막 진료가
  // 끝나는 걸 보는 게 이 슬라이스의 목적이라, 흐름이 끝난 뒤에만 요약으로 넘어간다.
  if (receiving.done && !flowing) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 bg-desk px-5 py-8 text-on-desk">
        <header className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-on-desk/60">
            {dayLabel} · 전원 콜 접수
          </span>
          <h1 className="font-serif text-xl">
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
                className="flex items-center justify-between rounded-xs border border-frame bg-desk-2 px-3 py-2 text-xs"
              >
                <span className="text-on-desk">{call.label}</span>
                <span
                  className={`font-mono ${entry.accepted ? "text-on-desk" : "text-alarm"}`}
                >
                  {entry.accepted ? "✓ " : "× "}
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        <CheerfulLedger receiving={receiving} />

        <button
          type="button"
          onClick={onContinue}
          className="rounded-xs bg-go py-3 text-base font-semibold text-paper transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
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
  // 자동으로 받은 콜은 그 사실을 표시한다 — 안 그러면 플레이어가 못 본 사이 결정된 것처럼 읽힌다.
  const prevWasAuto = prevCall !== undefined && isAutoAccept(prevCall.kind);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col gap-4 bg-desk px-4 py-6 text-on-desk">
      {/*
        HUD — 요일·콜 진행·시각. 시각은 맵과 같은 atMin을 쓴다(흐르는 동안 시계도 함께 흐른다).
        해석 카피 0: 시각과 시간대 이름만 놓는다(이모지 제거 — 스펙 §8-A).
        카운터는 클램프한다 — 마감 흐름에서는 index === queue.length라 「콜 6 / 5」가 된다.
      */}
      <header className="flex items-end justify-between gap-3 border-b border-frame pb-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.25em] text-on-desk/60">
            {dayLabel} · 전원 콜 접수
          </span>
          <h1 className="font-mono text-base tabular-nums text-on-desk">
            콜 {Math.min(receiving.index + 1, receiving.queue.length)}
            <span className="text-on-desk/70"> / {receiving.queue.length}</span>
          </h1>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-2xl font-semibold leading-none tabular-nums text-on-desk">
            {formatClock(atMin)}
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-on-desk/60">
            {LIGHTING_LABEL[scene.lighting]}
          </span>
        </div>
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
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-on-desk/70">
          <span className="font-mono uppercase tracking-widest">직전</span>
          {prevWasAuto && (
            <span className="rounded-xs border border-frame px-1.5 py-0.5 font-mono text-[11px] text-on-desk/70">
              자동 접수
            </span>
          )}
          <span className="text-on-desk">{prevCall.label}</span>
          <span>→ {prevLine}</span>
        </p>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/*
          흐르는 동안엔 결정할 게 없어 카드가 없다. 도착해야 뜬다.
          (마감 흐름에서는 queue[index]가 undefined라 CallCard가 렌더되면 터진다.)
          자동 접수 콜도 카드를 안 세운다 — 위 effect가 같은 프레임에 결정을 끝낸다.
        */}
        {flowing || autoCallId !== undefined ? (
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
