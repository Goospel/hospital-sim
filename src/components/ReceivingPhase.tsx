"use client";

import { useEffect, useRef } from "react";
import { receivingLine } from "@/game/dialogue";
import { formatSignedBillions } from "@/game/labels";
import {
  accruedSegments,
  needsDecision,
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
 * 처리 스트림에 남기는 최근 건수. 하루 20~40통이라 전부 쌓으면 페이지가 무한히 길어지고,
 * 그러면 정작 방금 무슨 일이 있었는지가 안 보인다. 하루 전체 목록은 마감 화면이 낸다.
 */
const RECENT_COUNT = 5;

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
  const acceptedCount = receiving.log.filter((e) => e.accepted).length;
  // 기다리다 떠난 사람 — 북적임의 대가다. 0이면 아예 안 띄운다(없는 걸 0으로 강조하지 않는다).
  const leftCount = receiving.log.filter((e) => e.reason === "LEFT_WAITING").length;

  /*
    자동 처리 — 결정이 없는 콜(응급의 구조 판정 · 워크인 접수)은 시계가 그 도착 시각을
    지나는 순간 카드 없이 처리된다. 흐름이 멈추는 건 예약진료뿐이다(needsDecision).

    **한 렌더에 한 통씩**만 처리한다. onDecide는 setState라 index가 즉시 안 바뀌어,
    한 effect 안에서 여러 번 부르면 같은 콜을 두 번 넘기거나 큐를 건너뛴다. 대신 처리하면
    상태가 바뀌어 다시 렌더되고, 그 렌더가 다음 콜을 같은 조건으로 집는다 — 몰려 도착한
    콜들은 그렇게 연쇄로 흘러간다(시각은 그대로라 화면상 동시에 처리된 것으로 보인다).

    ref로 콜당 1회를 잠근다. StrictMode의 이중 마운트가 같은 콜에 effect를 두 번 태우는데,
    그러면 큐가 두 칸 전진한다. 콜 id는 하루 안에서 고유하고(`d{day}c{n}`), 하루가 바뀌면
    이 컴포넌트가 언마운트돼 ref도 함께 초기화된다.
  */
  const arrived = receiving.done ? undefined : receiving.queue[receiving.index];
  const autoCallId =
    arrived && !needsDecision(arrived) && (arrived.arrivalMin ?? 0) <= atMin ? arrived.id : undefined;
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
            오늘 {receiving.queue.length}명이 왔고 {acceptedCount}명을 봤습니다
          </h1>
        </header>

        {/*
          받은 사람은 세기만 하고 **못 받은 사람만 나열한다**.
          하루가 5통일 땐 전부 나열해도 다섯 줄이었지만 20~40통이면 화면이 목록으로 덮이고,
          그 안에서 정작 봐야 할 줄(못 받은 사람)이 묻힌다. 무엇이 남는지가 이 화면의 전부다.
        */}
        <div className="flex flex-col gap-1.5">
          {receiving.log
            .map((entry, i) => ({ entry, call: receiving.queue[i] }))
            .filter((x) => !x.entry.accepted)
            .map(({ entry, call }) => (
              <div
                key={entry.callId}
                className="flex items-center justify-between gap-3 rounded-xs border border-frame bg-desk-2 px-3 py-2 text-xs"
              >
                <span className="text-on-desk">{call.label}</span>
                <span className="shrink-0 font-mono text-alarm">
                  ×{" "}
                  {entry.reason === "LEFT_WAITING"
                    ? "기다리다 감"
                    : entry.disposition === "HARDLOCK_REJECT"
                      ? "하드락"
                      : "거절"}
                </span>
              </div>
            ))}
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

  /*
    처리 스트림 — 최근 처리된 콜 몇 건. 「직전」 한 줄을 대체한다.

    카드가 사라지면서 **응급 판정이 화면에서 사라질 뻔했다**: 예전엔 응급마다 카드가 서서
    「전원 불가 · 사유」 도장을 보여줬는데, 이제 응급은 흐르는 동안 자동 처리된다. 그 판정이
    여기 남지 않으면 플레이어는 자기 병원이 누구를 못 받았는지 영영 모른다 — 이 게임의 논지가
    통째로 증발한다. 그래서 스트림은 장식이 아니라 **카드가 지던 역할의 이전처**다.

    맵 스프라이트가 전부 aria-hidden이라 이 목록이 스크린리더의 유일한 서술 경로이기도 하다.
  */
  const recent = receiving.log
    .map((entry, i) => ({ entry, call: receiving.queue[i], i }))
    .slice(-RECENT_COUNT)
    .reverse();

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
          {/*
            「콜 3 / 5」 카운터를 걷어냈다 — 그 분모가 "오늘 받을 수 있는 콜은 정해져 있다"는
            인상의 직접적 출처였고, 하루의 끝이 개수에서 시각으로 옮겨간 지금은 사실도 아니다
            (총량은 병상 티어에서 파생한다). 대신 지금 병원의 상태를 센다.
            해석 카피 0(메모 game-show-dont-tell): 숫자와 명사만 놓는다.
          */}
          <h1 className="flex flex-wrap items-baseline gap-x-3 font-mono text-base tabular-nums text-on-desk">
            <span>대기 {scene.waitingCount}명</span>
            <span className="text-on-desk/70">진료 {acceptedCount}명</span>
            {leftCount > 0 && <span className="text-alarm">이탈 {leftCount}명</span>}
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
      {recent.length > 0 && (
        <ul aria-live="polite" className="flex flex-col gap-1">
          {recent.map(({ entry, call, i }) => (
            <li
              key={entry.callId}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-on-desk/70"
            >
              <span className="font-mono tabular-nums text-on-desk/50">
                {formatClock(call.arrivalMin ?? 0)}
              </span>
              <span className="text-on-desk">{call.label}</span>
              <span>
                →{" "}
                {receivingLine(
                  call,
                  entry.disposition,
                  entry.accepted,
                  i,
                  entry.reason ?? undefined,
                )}
              </span>
            </li>
          ))}
        </ul>
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
