"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TileMap, { type BuildPreview } from "@/components/TileMap";
import DayEndOverlay from "@/components/DayEndOverlay";
import EventCard from "@/components/EventCard";
import HirePanel from "@/components/HirePanel";
import PriorityPanel from "@/components/PriorityPanel";
import WeekEndOverlay from "@/components/WeekEndOverlay";
import { ROOM_LABEL, formatManwon, resigningNotices, turnAwayBatchText } from "@/components/simHud";
import { effectiveSpeed, useSimClock, type SimSpeed } from "@/components/useSimClock";
import { MS_PER_GAME_MIN } from "@/game/hospitalMap";
import { formatClockFromOpen } from "@/game/daysim";
import { createWorld, type RoomType, type SimWorld } from "@/sim/world";
import { placeRoom, roomCostManwon, COST_PER_TILE_MANWON, MIN_ROOM_W, MIN_ROOM_H, type PlaceResult } from "@/sim/build";
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from "@/sim/dept";
import { hireDoctor, setDoctorPriority, type HireResult, type Priority, type PriorityKind } from "@/sim/pawn";
import { ARRIVAL_WINDOW_MIN } from "@/sim/patientFlow";
import { startNextDay } from "@/sim/day";
import { applyMorningEvent } from "@/sim/director";
import { epilogueText, eventNarration } from "@/sim/narrative";
import { resigningSimDoctors, settleWeek, startNextWeek, weekSummary } from "@/sim/week";

/**
 * /sim — 타일 병원의 첫 화면. 시뮬 코어(src/sim)를 **읽고 그리기만** 한다.
 *
 * 여기가 가진 상태는 셋뿐이다: 세계 · 배속 · 건설 드래그. 게임 규칙은 하나도 없다 —
 * 지을 수 있는지는 placeRoom이, 시간이 흐르는 건 useSimClock+tick이 정한다.
 * 미리보기 색조차 placeRoom을 **그대로 한 번 돌려** 정한다(검증 규칙을 여기 베끼면
 * 미리보기는 초록인데 손을 떼면 거부되는 어긋남이 생긴다 — 규칙의 단일 출처는 build.ts다).
 *
 * 기존 게임(/)과 공존한다. 이 라우트는 서버 기능을 쓰지 않아 Pages 정적 export에 그대로 실린다.
 */

/** 지을 수 있는 방 — **식당(CAFETERIA)이 여기 없으면 그 방은 존재하지 않는 것과 같다**.
 *  코어는 이미 식당을 알고(build·needs) 굶주림 감속도 돌지만, 이 배열에 줄이 없으면 플레이어는
 *  영영 못 짓는다 — 그러면 "밥을 못 먹어 오후가 느려진다"가 규칙이 아니라 버그로 보인다. */
const ROOM_TYPES: RoomType[] = ["EXAM", "WAITING", "WARD", "RECEPTION", "LOUNGE", "CAFETERIA"];

const REASON_TEXT: Record<Exclude<PlaceResult, { ok: true }>["reason"], string> = {
  TOO_SMALL: `너무 좁습니다 — 최소 ${MIN_ROOM_W}×${MIN_ROOM_H}`,
  OUT_OF_BOUNDS: "부지 밖입니다 — 가장자리 한 칸은 비워 둡니다",
  OVERLAP: "다른 방과 겹칩니다",
  NO_MONEY: "자금이 부족합니다",
};

/** 채용 거부 사유 → 화면 문구. 건설의 REASON_TEXT와 같은 형태다(사유는 코어가, 말은 화면이). */
const HIRE_REASON_TEXT: Record<Exclude<HireResult, { ok: true }>["reason"], string> = {
  NO_POOL: "전국에 남은 그 과 의사가 없습니다",
};

const SPEEDS: Array<{ value: SimSpeed; label: string; title: string }> = [
  { value: 0, label: "❚❚", title: "일시정지" },
  { value: 1, label: "1×", title: "보통 속도" },
  { value: 3, label: "3×", title: "3배속" },
];

/**
 * 개원 시점의 세계 — 빈 부지, **의사 0명**.
 *
 * 1주차엔 내과·외과 의사 두 명을 하드코딩해 세워 두었다. 과와 채용이 생긴 지금 그 두 줄은
 * 지운다: 의사가 미리 서 있으면 "무슨 과를 뽑을 것인가"라는 이 슬라이스의 **첫 결정**이
 * 이미 내려진 채로 판이 시작되고, 그 결정이 만드는 주급도 플레이어가 고른 것이 아니게 된다.
 * 이제 채용은 입구 앞 통행 타일 탐색까지 코어(hireDoctor)가 한다 — 화면이 좌표를 정하지 않는다.
 */
function initialWorld(): SimWorld {
  return createWorld(1);
}

interface Drag {
  start: { x: number; y: number };
  cur: { x: number; y: number };
}

/** 두 타일이 만드는 사각형 — 어느 방향으로 끌든 같은 결과가 되게 정규화한다. */
function rectOf(d: Drag) {
  return {
    x: Math.min(d.start.x, d.cur.x),
    y: Math.min(d.start.y, d.cur.y),
    w: Math.abs(d.cur.x - d.start.x) + 1,
    h: Math.abs(d.cur.y - d.start.y) + 1,
  };
}

export default function SimPage() {
  const [world, setWorld] = useState<SimWorld>(initialWorld);
  const [speed, setSpeed] = useState<SimSpeed>(1);
  const [selected, setSelected] = useState<RoomType | null>(null);
  /** 지을 진료실의 과 — EXAM을 고른 뒤 **한 번 더** 고르게 한다(과 없는 진료실은 못 짓는다).
   *  EXAM 선택을 풀면 같이 비운다: 다음에 다시 고를 때 지난 선택이 몰래 남아 있으면
   *  "과를 골랐다"는 사실 없이 드래그가 열린다. */
  const [examDept, setExamDept] = useState<SimDeptKey | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  /* 이미 읽은 이벤트 카드 — **닫힘을 상태로 두지 않고 "읽은 것"을 기억한다.** 카드가 뜨는
     조건(`world.event`)은 세계가 정하므로, 열림 플래그를 따로 두면 아침 전이가 그것을 켜 줘야
     하고 그 자리는 setState 업데이터 안이다(StrictMode 이중 호출 · 상태 두 개가 어긋날 자리).
     읽은 이벤트의 키만 기억하면 카드 표시는 **순수 파생**이 되어 효과도 플래그도 필요 없다. */
  const [seenEvent, setSeenEvent] = useState<string | null>(null);
  /* 토스트에 key를 함께 두는 이유: 같은 문구가 잇달아 뜰 수 있다(순환기 없는 병원의 STEMI
     회차는 늘 같은 말이다). 문자열만 상태로 두면 두 번째부터 값이 안 바뀌어 React가 렌더를
     건너뛰고, 그러면 **첫 토스트의 타이머**가 그대로 흘러 두 번째 알림이 곧바로 사라진다. */
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const showToast = (text: string) => setToast((t) => ({ text, key: (t?.key ?? 0) + 1 }));

  /*
    건설·채용 중 자동 일시정지 — 드래그 시작부터 확정·파기까지, 그리고 채용 패널이 떠 있는 동안
    세계가 멈춘다. speed를 0으로 **덮어쓰지 않고** 파생값으로 두는 게 핵심이다: 저장·복원을 하면
    드래그가 취소되거나 중간에 언마운트될 때 배속이 0에 갇힌다. drag/hireOpen을 비우는 것이
    곧 시계 재개라, 확정 경로와 파기 경로가 재개를 각자 기억할 필요가 없다.
    채용이 같은 식에 합류하는 것도 그래서다 — 정지 상태를 하나 더 만들면 둘이 어긋날 수 있다.
    인사 패널도 같은 자리에 합류한다: 우선순위를 고르는 동안 세계가 흐르면 표에서 읽은 피로와
    누른 결과가 어긋나고, 무엇보다 **떠나는 사람을 보면서 손을 쓸 시간**이 없어진다.
  */
  /* 오늘의 이벤트 카드 — 세계에 이벤트가 붙어 있고 아직 안 읽었으면 뜬다. 키에 (주,일)을 넣는
     이유는 같은 종류가 이틀 연속 붙을 수 있어서다(그때도 새 속보다). */
  const eventKey = world.event ? `${world.week}-${world.day}-${world.event.kind}` : null;
  const eventOpen = eventKey !== null && seenEvent !== eventKey;

  const paused = drag !== null || hireOpen || priorityOpen || eventOpen;
  const running: SimSpeed = effectiveSpeed(world.phase, paused ? 0 : speed);
  useSimClock(running, setWorld);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /*
    되돌아간 응급 알림 — 폰이 만들어지지 않는 사건이라(문전 판정) 화면에 아무 흔적이 없다.
    그래서 **상태의 변화**를 본다: stats.emergencyTurnedAway가 길어진 만큼이 이번에 붙은
    건들이다. 이벤트 큐를 세계에 두지 않는 이유는 그러면 코어가 "누가 읽었는가"를 기억해야
    하기 때문이다(순수 세계에 UI 수명이 섞인다).

    ⚠️ **한 프레임에 여러 건이 들어온다.** 3배속 한 프레임은 최대 15게임분이라(useSimClock의
    MAX_FRAME_MS) 그 사이 회차가 둘 이상 붙을 수 있다 — 마지막 한 건만 띄우면 나머지는 흔적
    없이 사라진다. 그래서 마지막 항목이 아니라 **읽은 지점부터의 구간**을 넘겨 요약하게 한다.

    ⚠️ 세는 자리는 ref다 — 상태로 두면 이 효과가 자기 자신을 다시 부른다. 하루가 바뀌면
    배열이 [] 로 리셋되므로(freshStats) 길이가 줄고, 그때는 알리지 않고 기준만 되돌린다.
  */
  const turnedAway = world.stats.emergencyTurnedAway;
  const seenTurnAwayRef = useRef(0);
  useEffect(() => {
    const pending = turnedAway.slice(seenTurnAwayRef.current);
    if (pending.length > 0) showToast(turnAwayBatchText(pending));
    seenTurnAwayRef.current = turnedAway.length;
  }, [turnedAway]);

  /*
    주간 결산 자동 1회 — 7일차 밤에 세계가 WEEK_END로 들어오면 여기서 고정비를 뺀다.
    플레이어가 누르는 게 아니라 자동인 이유: 결산은 선택지가 아니라 청구서다(누를 수
    있으면 안 누르고 버티는 게 최적 전략이 된다).

    ⚠️ **정확히 1회**여야 한다 — settleWeek을 두 번 부르면 고정비가 두 번 빠져 멀쩡한
    병원이 장부로만 망한다. 코어가 이중 정산을 throw로 막으므로(weekSettled) 방어를
    소홀히 하면 no-op이 아니라 **크래시**다. 가드는 세 겹이다:
      ① `world.weekSettled` 이른 반환  ② settlingRef  ③ 업데이터 안 재확인.

    관측된 재진입 경로는 하나다 — 결산으로 weekSettled가 바뀌며 deps가 재실행되는 것
    (WEEK_END/true). ①②③은 그 한 경로를 겹쳐 막는 **중복 벨트**이고, 셋 중 하나만 남아도
    이중 정산은 일어나지 않는다(실측: ①만 제거해도 ②가 잡아 크래시가 없고 고정비도 한 번만
    빠진다 / 셋 다 제거하면 settleWeek이 throw해 화면이 죽는다). ②는 StrictMode 이중 마운트가
    WEEK_END 상태에서 일어나는 경우의 대비이며, 정상 흐름(마운트 시 phase=RUNNING)에서는
    발동하지 않는다.
    1주차의 이중 건설(setState 업데이터 안에서 placeRoom)과 같은 함정이라 같은 자리를 막는다.
  */
  const settlingRef = useRef(false);
  useEffect(() => {
    if (world.phase !== "WEEK_END" || world.weekSettled) {
      settlingRef.current = false;
      return;
    }
    if (settlingRef.current) return;
    settlingRef.current = true;
    setWorld((w) => (w.phase === "WEEK_END" && !w.weekSettled ? settleWeek(w) : w));
  }, [world.phase, world.weekSettled]);

  /** 지금 드래그를 시작할 수 있는가 — 진료실은 **과까지 골라야** 열린다.
   *  코어(placeRoom)는 과 없는 EXAM을 내과로 접지만(마이그레이션 절단), 그 기본값이 화면에서
   *  도달 가능해지면 플레이어는 고르지도 않은 과의 진료실을 짓게 된다. */
  const ready = selected !== null && (selected !== "EXAM" || examDept !== null);
  /** 이번 건설의 과 — 진료실이 아니면 없다(placeRoom이 어차피 떨군다). */
  const buildDept = selected === "EXAM" && examDept ? examDept : undefined;

  const preview: BuildPreview | null = useMemo(() => {
    if (!drag || !selected) return null;
    const rect = rectOf(drag);
    // 판정을 베끼지 않고 실제 placeRoom을 돌려 본다 — 결과 세계는 버린다(순수 함수라 안전).
    const res = placeRoom(world, { type: selected, dept: buildDept, ...rect });
    return { ...rect, type: selected, ok: res.ok, costManwon: roomCostManwon(rect.w, rect.h) };
  }, [drag, selected, buildDept, world]);

  const commit = (d: Drag) => {
    if (!selected) return;
    // 진료실은 고른 과를 그대로 싣는다 — 여기서 기본값으로 접으면 화면이 고른 것과 세계가 갈린다.
    const res = placeRoom(world, { type: selected, dept: buildDept, ...rectOf(d) });
    if (res.ok) setWorld(res.world);
    else showToast(REASON_TEXT[res.reason]);
  };

  /** 채용 — 확정은 setState **바깥**에서 한다(건설 commit과 같은 이유: 업데이터 안에서 부르면
   *  StrictMode의 이중 호출이 두 명을 뽑는다).
   *
   *  ⚠️ 대신 이 world는 **렌더 시점의 스냅샷**이다. 패널이 떠 있는 동안 시계가 멈춰(paused)
   *  클럭발 갱신은 오지 않지만, **같은 소스의 연타**는 남는다 — 두 클릭이 한 렌더의 world를
   *  같이 보면 뒤엣것이 앞엣것을 덮어 한 명이 유실된다. 실사용 위험이 낮은 건 클릭이 discrete
   *  이벤트라 React가 각 클릭을 별도 태스크로 갈라 사이에 렌더가 끼기 때문이지, 정지 자체가
   *  막아 주기 때문이 아니다. 업데이터로 옮기려면 StrictMode 이중 채용 검증이 먼저다. */
  const hire = (dept: SimDeptKey) => {
    // 채용도 건설(commit)과 같은 모양으로 실패한다 — 전국에 그 과 사람이 남지 않았으면 거부되고
    // 세계는 그대로다. 여기서 조용히 삼키면 버튼이 먹통인 것과 구별되지 않는다.
    // ⚠️ 패널이 풀 0인 과의 버튼을 비활성으로 잠그는 지금도 **이 거부 경로는 남긴다** — 이중
    // 벨트다: 화면 쪽 판정이 어긋나 버튼이 열려도 세계는 안 바뀌고, 그 사실이 토스트로 말해진다.
    const res = hireDoctor(world, dept);
    if (res.ok) setWorld(res.world);
    else showToast(HIRE_REASON_TEXT[res.reason]);
  };

  /** 우선순위 한 칸 — 채용·건설과 달리 **업데이터 안**에서 확정한다.
   *  두 번 불려도(StrictMode) 같은 축에 같은 값을 두 번 쓸 뿐이라 결과가 같고, 그 대신 렌더
   *  스냅샷이 아니라 최신 세계 위에서 갈아 끼워진다. 값은 `nextPriority`가 만든 0~3이라
   *  코어의 범위 throw는 도달 불가다(simHud.nextPriority 주석). */
  const setPriority = (doctorId: string, kind: PriorityKind, value: Priority) =>
    setWorld((w) => setDoctorPriority(w, doctorId, kind, value));

  /* 이번 주말에 떠나는 사람들 — **코어가 단일 출처**다(week.resigningSimDoctors). 주중에도
     계산되므로 인사 패널의 「이번 주말 떠남」 배지와 결산의 통지 줄이 **같은 명단**을 읽고,
     `startNextWeek`이 지우는 명단도 그것이다. 화면이 임계를 따로 적으면 안 떠난 사람이
     통지되거나 통지 없이 사람이 사라진다. */
  const resigning = resigningSimDoctors(world);
  const resigningIds = new Set(resigning.map((p) => p.id));

  /* 에필로그 — 판이 끝났을 때만 만든다. 문장은 `narrative.epilogueText`가 소유하고 여기선
     지표만 모은다: 금액 포맷은 화면 층의 단일 함수(formatManwon)를 지나므로 HUD·결산과 같은
     단위가 보장된다(계획 §0-8). ⚠️ 이탈 수는 **이 주치**다 — 세계가 주마다 days를 비워
     판 누적 축이 없다(narrative.EpilogueStats 주석). */
  const epilogue = world.ending
    ? epilogueText(world.ending, {
        week: world.week,
        leftCount: weekSummary(world).leftCount,
        resignedNames: resigning.map((p) => p.name).filter((n): n is string => !!n),
        treasuryText: formatManwon(world.treasuryManwon),
      })
    : undefined;

  const closed = world.minute >= ARRIVAL_WINDOW_MIN;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-4">
      {/* ── 상단 바 — 시각·금고·오늘 집계·시간 조작 ── */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-frame bg-desk-2 px-4 py-2 font-mono text-sm tabular-nums text-on-desk">
        <span className="text-base font-semibold">{formatClockFromOpen(world.minute)}</span>
        {/* 하루 안의 시각만으로는 지금이 몇 번째 하루인지 알 수 없다 — 주·일이 리듬의 좌표다. */}
        <span className="text-on-desk-muted">
          {world.week}주 {world.day}일
        </span>
        <span>
          <span className="text-on-desk-muted">금고 </span>
          {/* 접는 정책(1억 이상은 「N.N억」)은 화면 층 한 함수가 소유한다 — 여기서 직접 찍으면
              개원 자본 5억이 "50,000만원"으로 뜨고 결산지와 단위가 갈린다(계획 §0-8). */}
          {formatManwon(world.treasuryManwon)}
        </span>
        <span>
          <span className="text-on-desk-muted">진료 </span>
          {world.stats.examsDone}
        </span>
        <span>
          <span className="text-on-desk-muted">이탈 </span>
          <span className={world.stats.leftCount > 0 ? "text-alarm" : undefined}>{world.stats.leftCount}</span>
        </span>
        {/* 응급 — 받은 건수와 되돌아간 건수를 나란히. 회차는 폰이 만들어지지 않아 화면에
            흔적이 없으므로(문전 판정) 이 숫자가 유일한 기록이다. */}
        <span title="문앞 판정 기준 — 처치 완료와 다를 수 있음">
          <span className="text-on-desk-muted">응급 </span>
          {world.stats.emergencyAccepted}
          <span className="text-on-desk-muted"> · 회차 </span>
          <span className={turnedAway.length > 0 ? "text-alarm" : undefined}>{turnedAway.length}</span>
        </span>
        {closed && <span className="text-on-desk-muted">접수 마감</span>}
        <div className="ml-auto flex items-center gap-1">
          {paused && (
            <span className="mr-2 text-xs text-on-desk-muted">
              {drag
                ? "건설 중 — 일시정지"
                : hireOpen
                  ? "채용 중 — 일시정지"
                  : priorityOpen
                    ? "인사 중 — 일시정지"
                    : "속보 — 일시정지"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setHireOpen(true)}
            className="border border-frame px-2 py-1 text-xs text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk"
          >
            채용
          </button>
          {/* [인사] — 채용 옆에 나란히. 채용이 "사람을 들이는" 버튼이면 이쪽은 **들인 사람이
              무엇을 할지** 정하는 버튼이다. 떠날 사람이 있으면 붉게 — 주말 통지를 기다리지
              않고 주중에 눈에 띄어야 대응할 시간이 생긴다. */}
          <button
            type="button"
            onClick={() => setPriorityOpen(true)}
            className={`mr-2 border px-2 py-1 text-xs transition-colors ${
              resigning.length > 0
                ? "border-alarm text-alarm hover:bg-alarm/10"
                : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
            }`}
          >
            인사{resigning.length > 0 ? ` · 이탈 ${resigning.length}` : ""}
          </button>
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.title}
              aria-pressed={speed === s.value}
              onClick={() => setSpeed(s.value)}
              className={`min-w-9 border px-2 py-1 text-xs transition-colors ${
                speed === s.value
                  ? "border-on-desk-muted bg-frame text-on-desk"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </header>

      <TileMap
        world={world}
        preview={preview}
        // 폰은 게임 1분마다 2타일을 건너뛴다 — 그 1분의 실시간 길이가 곧 전환 시간이다.
        stepMs={running > 0 ? MS_PER_GAME_MIN / running : 0}
        onTileDown={(t) => ready && setDrag({ start: t, cur: t })}
        onTileMove={(t) => setDrag((d) => (d ? { ...d, cur: t } : d))}
        onTileUp={(t) => {
          // 확정은 setState **바깥**에서 한다 — 업데이터 안에서 건설하면 StrictMode가
          // 업데이터를 두 번 불러 방이 두 번 지어지고 비용도 두 번 빠진다.
          if (drag) commit({ ...drag, cur: t });
          setDrag(null);
        }}
        // 취소는 아무것도 짓지 않고 사각형만 버린다(시계는 drag가 비면 저절로 재개된다).
        onTileCancel={() => setDrag(null)}
      />

      {/* ── 하단 바 — 방 타입 선택. 고른 뒤 부지를 드래그하면 그 사각형이 방이 된다. ── */}
      <footer className="flex flex-col gap-2 border border-frame bg-desk-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {ROOM_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={selected === t}
              onClick={() => {
                setSelected((cur) => (cur === t ? null : t));
                // 방 타입을 바꾸거나 선택을 풀면 과 선택도 함께 비운다 — 남겨 두면 다음에 EXAM을
                // 고르는 순간 고르지도 않은 과로 드래그가 열린다.
                setExamDept(null);
              }}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                selected === t
                  ? "border-on-desk-muted bg-frame text-on-desk"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              {ROOM_LABEL[t]}
            </button>
          ))}
          <span className="ml-auto font-mono text-xs tabular-nums text-on-desk-muted">
            타일당 {COST_PER_TILE_MANWON}만원 · 최소 {MIN_ROOM_W}×{MIN_ROOM_H}
          </span>
        </div>

        {/* 진료실의 과 — EXAM을 고르면 한 줄이 더 열린다. 진료가 성립하려면 환자·진료실·의사의
            과가 셋 다 같아야 하므로(코어의 삼중 일치), 무슨 과로 짓는지가 건설의 절반이다. */}
        {selected === "EXAM" && (
          <div className="flex flex-wrap items-center gap-2 border-t border-frame pt-2">
            <span className="text-xs text-on-desk-muted">과</span>
            {HIRABLE_DEPTS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={examDept === d}
                onClick={() => setExamDept((cur) => (cur === d ? null : d))}
                className={`border px-2.5 py-1 text-xs transition-colors ${
                  examDept === d
                    ? "border-on-desk-muted bg-frame text-on-desk"
                    : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
                }`}
              >
                {simDept(d).label}
              </button>
            ))}
          </div>
        )}

        <p className="min-h-5 text-xs">
          {toast ? (
            <span className="text-alarm">{toast.text}</span>
          ) : ready && selected ? (
            <span className="text-on-desk-muted">
              {selected === "EXAM" && examDept ? `${ROOM_LABEL[selected]} · ${simDept(examDept).label}` : ROOM_LABEL[selected]}
              {" — 부지를 드래그해 크기를 정하세요. 건설하는 동안 시간이 멈춥니다."}
            </span>
          ) : selected === "EXAM" ? (
            <span className="text-on-desk-muted">진료실은 과를 골라야 지을 수 있습니다.</span>
          ) : (
            <span className="text-on-desk-muted">
              방 타입을 고르면 건설할 수 있습니다. 환자는 대기실 의자에 앉고, 자기 과 진료실의 의사가 차례로 부릅니다.
            </span>
          )}
        </p>
      </footer>

      {/*
        마감·결산은 라우트를 바꾸지 않고 부지 위에 덮는다 — 타일 병원은 한 장면으로 이어지는 게
        리듬이다. 세계가 흐르지 않는 건 오버레이가 아니라 phase가 보장한다(effectiveSpeed·tick).

        전이는 전부 **업데이터 안에서 phase를 다시 확인**하고 부른다. 코어의 startNextDay·
        startNextWeek은 국면이 어긋나면 throw이므로, 버튼을 두 번 눌러 두 갱신이 줄 서면
        두 번째가 크래시가 된다 — 화면이 사라진 뒤의 클릭은 조용히 버리는 게 맞다.
      */}
      {/* 채용 패널 — 결산 오버레이와 **같은 층**에 뜨지만 국면과 무관하다(운영 중에도 뽑는다).
          시계는 phase가 아니라 hireOpen이 세운다(위 paused 파생). */}
      {hireOpen && (
        <HirePanel
          pawns={world.pawns}
          hirePool={world.hirePool}
          treasuryManwon={world.treasuryManwon}
          onHire={hire}
          onClose={() => setHireOpen(false)}
        />
      )}

      {/* 인사 패널 — 채용 패널과 같은 층·같은 규칙(국면과 무관하게 뜨고, 열려 있는 동안 시계가 선다). */}
      {priorityOpen && (
        <PriorityPanel
          pawns={world.pawns}
          resigningIds={resigningIds}
          onSetPriority={setPriority}
          onClose={() => setPriorityOpen(false)}
        />
      )}

      {/* 오늘의 속보 — 아침에 붙은 이벤트를 한 장으로 알린다. 떠 있는 동안 시계는 위 `paused`
          파생이 세운다(건설·채용·인사와 같은 기계). 연출문은 폴백 카탈로그에서 온다 —
          계획 Task 5의 LLM 텍스트가 도착해 있으면 그것이 이 자리를 대신한다(판정·수치 불변). */}
      {eventOpen && world.event && (
        <EventCard
          kind={world.event.kind}
          narration={eventNarration(world.event.kind, world.week, world.day)}
          week={world.week}
          day={world.day}
          onClose={() => setSeenEvent(eventKey)}
        />
      )}

      {world.phase === "DAY_END" && (
        <DayEndOverlay
          week={world.week}
          day={world.day}
          days={world.days}
          turnedAway={turnedAway}
          // 아침 전이 **직후**에 오늘의 이벤트가 붙는다 — 합성은 `applyMorningEvent` 한 곳뿐이다
          // (배선이 [다음 날]·[다음 주]로 흩어지면 한 곳만 고쳐 요일에 따라 스토리텔러가 꺼진다).
          // 순수 함수라 StrictMode의 이중 호출에도 같은 세계가 나온다.
          onNextDay={() => setWorld((w) => (w.phase === "DAY_END" ? applyMorningEvent(startNextDay(w)) : w))}
        />
      )}

      {/* 결산 **전** 한 프레임(weekSettled=false)은 아직 고정비가 안 빠진 금고라 띄우지 않는다 —
          그 한 장이 보이면 플레이어는 순이익이 아니라 수익을 결산으로 읽는다. */}
      {(world.phase === "WEEK_END" || world.phase === "CLOSED") && world.weekSettled && (
        <WeekEndOverlay
          week={world.week}
          days={world.days}
          summary={weekSummary(world)}
          // 명단도 문장 파생도 여기서 끝낸다 — 오버레이는 세계를 통째로 받지 않는다(summary와 같은 관례).
          leaving={resigningNotices(resigning)}
          treasuryManwon={world.treasuryManwon}
          insolvencyStreak={world.insolvencyStreak}
          closed={world.phase === "CLOSED"}
          // 왜 끝났는가는 코어가 이미 판정해 두었다 — 화면이 streak으로 되짚지 않는다.
          ending={world.ending}
          epilogue={epilogue}
          onNextWeek={() => setWorld((w) => (w.phase === "WEEK_END" ? applyMorningEvent(startNextWeek(w)) : w))}
        />
      )}
    </main>
  );
}
