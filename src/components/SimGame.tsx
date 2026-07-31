"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LANDING } from "@/components/landingPalette";
import TileMap, { OUTSIDE_FLOOR, type BuildPreview } from "@/components/TileMap";
import DayEndOverlay from "@/components/DayEndOverlay";
import EventCard from "@/components/EventCard";
import HirePanel from "@/components/HirePanel";
import PriorityPanel from "@/components/PriorityPanel";
import RegionPicker from "@/components/RegionPicker";
import WeekEndOverlay from "@/components/WeekEndOverlay";
import {
  BUILD_TOOLS,
  ERASE_LABEL,
  ROOM_LABEL,
  TOOL_LABEL,
  alertsOf,
  buildBlockReason,
  buildResultText,
  escTarget,
  formatManwon,
  inspectCard,
  isDragTool,
  previewLabel,
  rectModeOf,
  rectTiles,
  regionOverlayOn,
  resigningNotices,
  setupSteps,
  setupWarningText,
  statusLineText,
  toggledSpeed,
  toolCostText,
  traitBadges,
  turnAwayBatchText,
  type BuildTool,
  type PauseCause,
  type ZonePick,
} from "@/components/simHud";
import { effectiveSpeed, useSimClock, SIM_MS_PER_GAME_MIN, type SimSpeed } from "@/components/useSimClock";
import { formatClockFromOpen } from "@/game/daysim";
import { BACKDROP_COUNT, createWorld, type RoomType, type SimWorld } from "@/sim/world";
import { computeRegions } from "@/sim/regions";
import { buildWalls, demolish, eraseZone, paintZone, placeDoor, placeFurniture, type PlaceResult } from "@/sim/build";
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from "@/sim/dept";
import { hireDoctor, hireNurse, setDoctorPriority, type HireResult, type Priority, type PriorityKind } from "@/sim/pawn";
import { ARRIVAL_WINDOW_MIN } from "@/sim/patientFlow";
import { startNextDay } from "@/sim/day";
import { applyMorningEvent, eligibleEvents, fallbackDirectorChoice, type DirectorChoice } from "@/sim/director";
import { chillNotice, epilogueText, eventNarration } from "@/sim/narrative";
import { resigningSimDoctors, settleWeek, startNextWeek, weekSummary } from "@/sim/week";
import { newLlmBudget, requestDirector, requestNarrativeText, type DirectorReply } from "@/lib/storyteller";

/**
 * 타일 병원 본편. 시뮬 코어(src/sim)를 **읽고 그리기만** 한다.
 *
 * 여기가 가진 상태는 셋뿐이다: 세계 · 배속 · 건설 드래그. 게임 규칙은 하나도 없다 —
 * 지을 수 있는지는 건설 도구(build.ts)가, 시간이 흐르는 건 useSimClock+tick이 정한다.
 * 미리보기조차 그 도구를 **그대로 한 번 돌려** 정한다(검증 규칙을 여기 베끼면 미리보기는
 * 초록인데 손을 떼면 거부되는 어긋남이 생긴다 — 규칙의 단일 출처는 build.ts다).
 *
 * **컴포넌트이지 라우트가 아니다.** `/`와 `/sim`이 둘 다 이것을 렌더한다 — 랜딩이 이 게임으로
 * 바뀐 뒤에도 옛 링크·문서가 가리키는 `/sim`이 같은 화면을 내야 하고, 그러려면 본문이 어느 한
 * 라우트 파일에 살면 안 된다(둘 중 하나가 곧 다른 하나의 복사본이 된다). 이전 판은 `/classic`에 있다.
 * 서버 기능을 쓰지 않아 Pages 정적 export에 그대로 실린다.
 */

/** 지정할 수 있는 용도 — **식당(CAFETERIA)이 여기 없으면 그 방은 존재하지 않는 것과 같다**.
 *  코어는 이미 식당을 알고(needs) 굶주림 감속도 돌지만, 이 배열에 줄이 없으면 플레이어는
 *  영영 못 만든다 — 그러면 "밥을 못 먹어 오후가 느려진다"가 규칙이 아니라 버그로 보인다. */
const ROOM_TYPES: RoomType[] = ["EXAM", "WAITING", "WARD", "RECEPTION", "LOUNGE", "CAFETERIA"];

/** 채용 거부 사유 → 화면 문구. 건설 쪽 대응물은 simHud.buildResultText다(사유는 코어가, 말은 화면이). */
const HIRE_REASON_TEXT: Record<Exclude<HireResult, { ok: true }>["reason"], string> = {
  NO_POOL: "전국에 남은 그 과 의사가 없습니다",
};

/**
 * 좌측 패널의 최상위 묶음 — 누르면 그 아래가 열린다(아코디언: 한 번에 하나).
 *
 * 가른 축은 **무엇을 바꾸는가**다: `PEOPLE`은 사람을, `BUILD`는 부지를 바꾼다. 도구 8종이
 * 전부 `BUILD`인 것은 용도·철거도 결국 부지 편집이라서다 — 「용도」를 따로 세우면 최상위가
 * 셋이 되는데, 그 셋째는 클릭 한 번에 도구까지 무장하는 **다른 종류의 버튼**이 되어
 * "카테고리는 열기만 한다"는 규칙이 첫 줄부터 깨진다(보이는 것보다 규칙이 먼저다).
 *
 * ⚠️ 여기 있고 `simHud`에 없는 이유: 라벨을 읽는 것이 JSX뿐이다. `TOOL_LABEL`이 저쪽에 있는
 * 것은 순수 함수(`statusLineText`·`toolCostText`)가 그 표를 읽기 때문이지 라벨이라서가 아니다.
 */
type PaletteSection = "PEOPLE" | "BUILD";
const PALETTE_SECTIONS: Array<{ key: PaletteSection; label: string }> = [
  { key: "PEOPLE", label: "사람" },
  { key: "BUILD", label: "건설" },
];

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

export default function SimGame() {
  const [world, setWorld] = useState<SimWorld>(initialWorld);
  /* 첫 판은 **일시정지로 시작한다** — 하루가 1배속 약 6분이라(SIM_MS_PER_GAME_MIN) 처음 여는
     사람이 화면을 파악하는 동안 하루가 흘러 버린다. 개원 시점을 플레이어가 정하게 두면 방을 짓고
     의사를 뽑은 뒤 1×를 누르는 것이 곧 "개원"이 된다(그 안내는 팔레트 상태줄이 맡는다). */
  const [speed, setSpeed] = useState<SimSpeed>(0);
  /* 스페이스가 되돌아갈 배속 — **0이 아닌 값만** 기억한다(그래야 토글이 왕복이 된다).
     상태가 아니라 ref인 이유: 이 값은 화면에 하나도 안 나오므로 바뀌었다고 다시 그릴 게 없다.
     초기값 1은 "첫 스페이스 = 개원"이라는 뜻이다(판은 일시정지로 시작한다). */
  const lastRunSpeed = useRef<SimSpeed>(1);
  const changeSpeed = (s: SimSpeed) => {
    if (s !== 0) lastRunSpeed.current = s;
    setSpeed(s);
  };
  /** 지금 펼쳐 둔 좌측 패널 묶음 — **한 번에 하나**(아코디언)이고 `null`이면 전부 접혀 있다.
   *  묶은 이유는 평평한 10줄이 곧 스크롤이기 때문이다: 카테고리만 서 있으면 패널이 짧게 유지되고,
   *  펼친 하나만 아래로 자란다(사용자 지시 *"건설은 건설로 묶자"*). */
  const [section, setSection] = useState<PaletteSection | null>(null);
  /** 손에 든 건설 도구 — 벽·문·가구 4종·용도·철거. 없으면 맵은 구경거리다(클릭이 조용히 지나간다). */
  const [tool, setTool] = useState<BuildTool | null>(null);
  /** 용도 도구가 지정할 방 종류. 도구를 바꾸면 함께 비운다 — 남겨 두면 다음에 용도를 고르는
   *  순간 고르지도 않은 방으로 클릭이 열린다(옛 examDept와 같은 함정).
   *  `"ERASE"`(「지정 해제」)는 **화면에만 있는 값**이다 — 코어의 `paintZone`은 이 값을 모르고,
   *  `runTool`이 그것을 `eraseZone`으로 갈라 준다(simHud.buildBlockReason 주석의 계약). */
  const [roomType, setRoomType] = useState<ZonePick | null>(null);
  /** 지정할 진료실의 과 — 진료실을 고른 뒤 **한 번 더** 고르게 한다(과 없는 진료실은 코어가 던진다). */
  const [examDept, setExamDept] = useState<SimDeptKey | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** 영역 오버레이를 **손으로** 켜 뒀는가 — 그릴지 말지는 여기에 도구를 더해 정한다
   *  (`regionOverlayOn`). 도구가 이 값을 안 건드리는 것이 계약이라, 용도 지정을 마치면
   *  플레이어가 마지막에 고른 상태로 돌아온다. */
  const [overlayToggled, setOverlayToggled] = useState(false);
  /** 지금 카드를 열어 둔 폰의 id — **id만** 든다. 폰 자체를 스냅샷으로 들면 그 사람이 걸어가도
   *  카드의 수치가 그 순간에 굳고, 퇴장(배열에서 제거)한 뒤에도 유령 카드가 남는다. */
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  /** **스타팅 로스터 게이트** — 판이 열리자마자 채용 패널이 뜨고, 최소 인원을 채워야 닫힌다
   *  (사용자 지시 2026-07-29). `true`로 **시작**하는 것이 곧 강제다.
   *
   *  왜 세계가 아니라 화면 상태인가: 게이트는 규칙이 아니라 **안내**다. 코어에 「개원했는가」
   *  플래그를 두면 tick·결산·회귀 픽스처가 전부 그 국면을 알아야 하는데, 이 게이트가 막는 것은
   *  시뮬이 아니라 사람이다(닫고 나면 세계는 지금까지와 완전히 같다).
   *  ⚠️ 한 번 닫으면 다시 안 뜬다 — 전원 사직으로 의사가 0이 되어도 그때는 게이트가 아니라
   *  경고 스택과 체크리스트가 말한다(이미 판을 아는 사람에게 시작 화면을 다시 띄우지 않는다). */
  const [rosterOpen, setRosterOpen] = useState(true);
  /** **지역을 골랐는가** — 스타팅 로스터보다 한 겹 앞선 게이트다(사용자 컨셉 2026-07-30).
   *
   *  순서가 뒤집히면 안 된다: 카드를 누르면 `createWorld`로 세계를 **통째로 갈아 끼우므로**,
   *  먼저 뽑은 의사가 있으면 그 채용이 조용히 사라진다. 그래서 이게 열려 있는 동안은
   *  채용 패널을 아예 렌더하지 않는다(아래 게이트 조건).
   *
   *  ⚠️ 한 번 닫으면 다시 안 뜬다 — 로스터 게이트와 같은 계약이다. 저장·불러오기가 없는 지금
   *  "새 판 = 새로고침"이라 재선택 UI를 만들 자리가 없다(설계 §7 범위 밖). */
  const [regionPicked, setRegionPicked] = useState(false);
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
    ── 스토리텔러(LLM) 배선 ───────────────────────────────────────────────
    계약은 계획 §0-5 그대로다: **선택은 클릭 시점에 1회 확정**되고, 늦게 도착한 응답은
    **연출문 텍스트만** 갈아 끼운다(판정·수치 불변). 그래서 아래 상태는 전부 "문장" 아니면
    "아직 안 쓴 선택"이고, 세계를 바꾸는 값은 하나도 없다.

    예산이 ref인 이유: 새로고침이 곧 새 판이라 컴포넌트 수명과 판 수명이 같다. 모듈 전역에
    두면 판이 끝나도 소모가 남는다(storyteller.LlmBudget 주석).
  */
  const llmBudget = useRef(newLlmBudget());
  /* 다음 아침에 쓸 선택 — 오버레이가 떠 있는 동안 미리 발사해 클릭 시점의 지연을 0으로 만든다.
     상태가 아니라 ref인 것이 요점이다: 도착이 렌더를 유발하면 오버레이가 깜빡이고, 무엇보다
     클릭 핸들러는 **그 순간의 값**을 읽어야 하는데 상태는 렌더 시점에 고정된 스냅샷이다. */
  const directorSlot = useRef<{ key: string; reply: DirectorReply | null } | null>(null);
  /* 도착한 문장들 — 키(이벤트는 주-일-종류, 편지는 폰 id, 결말문은 주차)가 지금 화면과 맞을 때만
     쓰인다. 키가 어긋나면 그냥 안 쓰이고 폴백 문장이 그대로 선다 — 버리는 분기를 따로 안 짜도 된다. */
  const [llmNarration, setLlmNarration] = useState<{ key: string; text: string } | null>(null);
  const [llmLetter, setLlmLetter] = useState<{ key: string; text: string } | null>(null);
  const [llmEpilogue, setLlmEpilogue] = useState<{ key: string; text: string } | null>(null);
  /* HUD 배지 — 마지막 호출이 성공했는가. 「AI 서사」/「기본 서사」 두 글자가 폴백 강등을 눈에
     보이게 만든다(무키 배포본에서 게임이 멀쩡히 도는 것이 버그가 아니라 설계임을 화면이 말한다). */
  const [llmLive, setLlmLive] = useState(false);

  /* 아침 전이가 열려 있는 동안(마감·결산 오버레이) 다음 날의 이벤트를 미리 묻는다.
     ⚠️ 전이 세계를 **한 번 더 계산해서 버린다**(startNextDay/startNextWeek은 순수 함수라 안전).
     후보 목록(eligible)은 아침 세계 기준이라 그 세계 없이는 물어볼 수가 없다. */
  useEffect(() => {
    if (world.phase !== "DAY_END" && !(world.phase === "WEEK_END" && world.weekSettled)) return;
    const morning = world.phase === "DAY_END" ? startNextDay(world) : startNextWeek(world);
    const key = `${morning.week}-${morning.day}`;
    if (directorSlot.current?.key === key) return; // StrictMode 이중 실행·재렌더에서 두 번 묻지 않는다
    const slot: { key: string; reply: DirectorReply | null } = { key, reply: null };
    directorSlot.current = slot;
    const eligible = eligibleEvents(morning);
    void requestDirector(
      llmBudget.current,
      {
        week: morning.week,
        day: morning.day,
        eligible,
        doctors: morning.pawns.filter((p) => p.kind === "DOCTOR").length,
        treasuryManwon: morning.treasuryManwon,
        turnedAwayTotal: morning.turnedAwayTotal,
        // 규칙이 보는 병동(= 벽에 둘러싸이고 WARD로 지정된 영역)을 센다 — 스토리텔러가 읽는
        // 숫자와 응급 수용이 보는 숫자가 갈리면, 못 받는 병원에 대량 응급이 떨어진다.
        wards: computeRegions(morning).filter((r) => r.type === "WARD").length,
      },
      eligible,
    ).then((reply) => {
      setLlmLive(reply !== null);
      if (!reply) return;
      slot.reply = reply;
      // 종류까지 키에 넣는다 — 늦게 도착한 응답이 폴백이 고른 **다른** 이벤트의 카드에
      // 남의 연출문을 씌우는 일이 구조적으로 불가능해진다(키가 안 맞으면 그냥 안 쓰인다).
      if (reply.kind) setLlmNarration({ key: `${key}-${reply.kind}`, text: reply.narration });
    });
  }, [world]);

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

  /* 무엇이 시계를 세웠는가 — 사유까지 남기는 이유는 상태줄이 그걸 문구로 쓰기 때문이다.
     불리언 하나로 접으면 "왜 멈췄나"가 화면에서 사라진다(넷은 할 일이 서로 다르다). */
  // 스타팅 게이트도 채용과 **같은 사유**로 시계를 세운다(HIRE) — 사유를 하나 더 만들면
  // 상태줄 문구 표가 늘고, 플레이어에게는 둘 다 "채용 중"이라 구별할 이유가 없다.
  const pause: PauseCause =
    drag !== null ? "BUILD" : hireOpen || rosterOpen ? "HIRE" : priorityOpen ? "PRIORITY" : eventOpen ? "EVENT" : null;
  const paused = pause !== null;
  const running: SimSpeed = effectiveSpeed(world.phase, paused ? 0 : speed);
  useSimClock(running, setWorld);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /*
    ── 키보드 최소셋 — 스페이스(일시정지) · ESC(한 겹 닫기) ──────────────────
    둘 다 **가속 수단**이다: 배속 버튼도 패널 닫기 버튼도 그대로 남는다("마우스만으로 완주"는
    제출 문서의 계약이라 어떤 기능도 키보드 전용이 되면 안 된다).

    리스너가 `window`에 하나인 이유: 맵은 포커스를 받지 않는 div라 거기 붙이면 클릭 전에는
    키가 안 듣는다. 무엇을 할지는 전부 simHud의 순수 함수가 정하고 여기선 부르기만 한다.

    ⚠️ `preventDefault`가 필수다 — 스페이스는 페이지를 스크롤하고, 직전에 배속 버튼을 눌렀다면
       그 버튼을 한 번 더 누른다(포커스가 남아 있다).
    ⚠️ `e.repeat` 무시 — 누르고 있으면 시계가 초당 수십 번 서고 돈다.
    ⚠️ 배속은 **업데이터**로 뒤집는다: 그러면 이 효과가 speed에 안 묶여 배속을 바꿀 때마다
       리스너를 갈아 끼우지 않는다. 업데이터 안에 부수 효과가 없어 StrictMode 이중 호출에도
       같은 값이 나온다(기억은 `changeSpeed`가 버튼 경로에서만 갱신한다 — 토글은 그 기억을
       읽기만 하므로 여기서 다시 쓸 것이 없다).
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      /* 스타팅 게이트가 떠 있는 동안 키보드는 **통째로 잠긴다.** 스페이스는 게이트 뒤의 시계를
         켜려 들고(아직 의사가 없는 판이 돌기 시작한다), ESC는 이 모달을 못 닫으면서 그 아래
         도구를 놓아 "ESC가 먹통"으로 읽힌다. 블로킹 모달의 계약은 *뒤가 조작되지 않는다*이다. */
      // 지역 선택도 같은 이유로 통째로 잠근다 — 뒤의 세계는 어차피 곧 갈아 끼워질 임시 판이다.
      if (!regionPicked || rosterOpen) return;
      if (e.code === "Space") {
        e.preventDefault();
        setSpeed((cur) => toggledSpeed(cur, lastRunSpeed.current));
        return;
      }
      if (e.key !== "Escape") return;
      // 결산 오버레이(DAY_END·WEEK_END)는 입력에 없다 — 닫으면 [다음 날]이 사라진다(escTarget 주석).
      switch (escTarget({
        modalOpen: hireOpen || priorityOpen || eventOpen,
        inspectOpen: inspectId !== null,
        tool,
      })) {
        case "modal":
          // 한 번에 한 겹 — 겹쳐 떠 있어도 위엣것부터 닫는다(이벤트 카드는 「읽음」으로 접힌다).
          if (hireOpen) setHireOpen(false);
          else if (priorityOpen) setPriorityOpen(false);
          else setSeenEvent(eventKey);
          break;
        case "inspect":
          setInspectId(null);
          break;
        case "tool":
          // 도구를 놓을 땐 용도·과도 함께 비운다 — 팔레트의 초기화(toggleSection)와 같은 세 줄이다.
          setTool(null);
          setRoomType(null);
          setExamDept(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hireOpen, rosterOpen, regionPicked, priorityOpen, eventOpen, eventKey, tool, inspectId]);

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

  /** 지금 부지를 눌러 무언가 할 수 있는가 — 용도는 **방 종류(진료실이면 과까지)**를 골라야 열린다. */
  const ready = tool !== null && buildBlockReason(tool, roomType, examDept) === null;

  /**
   * 도구 한 번 — 판정도 세계 생성도 전부 코어가 한다. 여기는 **어느 함수에 넘길지**만 고른다.
   * 순수 함수라 미리보기가 결과 세계를 버리고 같은 호출을 그대로 써도 안전하다(옛 관례 계승).
   */
  const runTool = (t: BuildTool, tiles: Array<{ x: number; y: number }>): PlaceResult => {
    if (t === "WALL") return buildWalls(world, tiles);
    if (t === "DEMOLISH") return demolish(world, tiles);
    if (t === "DOOR") return placeDoor(world, tiles[0]);
    if (t === "DESIGNATE") {
      // 드래그 **전체**를 넘긴다 — 칠한 타일이 곧 영역이라(설계 2026-07-31 §2) 한 칸만 넘기면
      // 사각형을 끌어도 한 칸짜리 방이 선다.
      if (roomType === "ERASE") return eraseZone(world, tiles);
      // roomType은 `ready`가 보장한다 — 진료실이면 과까지(코어는 과 없는 EXAM에 던진다).
      return paintZone(world, tiles, roomType!, examDept ?? undefined);
    }
    return placeFurniture(world, t, tiles);
  };

  /** 드래그가 낳는 타일 — 벽만 테두리다(simHud.rectModeOf). */
  const dragTiles = (d: Drag, t: BuildTool) => rectTiles(d.start, d.cur, rectModeOf(t));

  const preview: BuildPreview | null = useMemo(() => {
    if (!drag || !tool || !ready) return null;
    const res = runTool(tool, dragTiles(drag, tool));
    return { tiles: res.tiles, ok: res.ok, label: previewLabel(tool, res, roomType) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runTool은 아래 값들의 파생이다
  }, [drag, tool, ready, roomType, examDept, world]);

  /** 확정 — 성공하면 세계를 갈아 끼우고, 말할 것이 있으면(거부·부분 설치) 토스트로 말한다. */
  const commit = (t: BuildTool, tiles: Array<{ x: number; y: number }>) => {
    const res = runTool(t, tiles);
    if (res.ok) setWorld(res.world);
    const said = buildResultText(t, res, roomType);
    if (said) showToast(said);
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

  /** 간호사 채용 — 위와 **같은 자리·같은 타이밍**이되 실패 경로가 없다(전국 풀이 없다).
   *  그래서 토스트도 없다: 말할 사유가 없는데 문장을 만들면 그게 곧 거짓말이다. */
  const hireNurseHere = () => setWorld(hireNurse(world));

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

  /* 오늘의 선택 — **클릭 시점에 한 번** 불린다. 도착해 있으면 LLM의 선택, 아니면 폴백.
     기다리지 않는 것이 핵심이다: 여기서 await 하면 [다음 날] 버튼이 최대 10초 먹통이 되고,
     그건 폴백이 있는데도 게임을 LLM 지연에 묶는 것이다.
     도착분도 치역을 **다시** 확인한다 — 후보는 요청 시점 세계에서 냈고 확정은 지금이라,
     그 사이가 벌어질 수 있는 배선이 생기면 applyEvent의 throw(= 흰 화면)로 나타난다. */
  const chooseToday: DirectorChoice = (w) => {
    const ready = directorSlot.current;
    if (ready?.key === `${w.week}-${w.day}` && ready.reply) {
      const kind = ready.reply.kind;
      if (kind === null) return null; // LLM이 고른 조용한 하루 — 폴백으로 되묻지 않는다
      if (eligibleEvents(w).includes(kind)) return kind;
    }
    return fallbackDirectorChoice(w);
  };

  /* 결산에 들어서면 편지·결말문을 발사한다 — 폴백 문장이 이미 그려진 뒤라 도착하면 갈아 끼울 뿐이다.
     주차 키 하나로 한 번만 보낸다(결산 화면은 여러 번 렌더된다). */
  const settledKey =
    world.weekSettled && (world.phase === "WEEK_END" || world.phase === "CLOSED") ? `w${world.week}` : null;
  const sentSettleRef = useRef<string | null>(null);
  useEffect(() => {
    if (settledKey === null || sentSettleRef.current === settledKey) return;
    sentSettleRef.current = settledKey;

    // 편지는 **한 명분**만 청한다. 여러 명이 떠나는 주에 사람 수만큼 호출하면 판당 상한이
    // 한 주에 소진되고, 그렇다고 한 번에 몰아 쓰게 하면 문장이 명단 낭독이 된다.
    const leaver = resigning[0];
    if (leaver?.dept) {
      void requestNarrativeText(llmBudget.current, "letter", {
        name: leaver.name,
        deptLabel: simDept(leaver.dept).label,
        saturatedDays: leaver.saturatedDays ?? 0,
        traits: traitBadges(leaver).map((t) => t.label),
        week: world.week,
      }).then((text) => {
        setLlmLive(text !== null);
        if (text) setLlmLetter({ key: leaver.id, text });
      });
    }

    if (world.ending) {
      void requestNarrativeText(llmBudget.current, "epilogue", {
        ending: world.ending,
        week: world.week,
        leftCount: weekSummary(world).leftCount,
        resignedNames: resigning.map((p) => p.name).filter(Boolean),
        // **이미 포맷된 금액**을 넘긴다 — 폴백 경로(epilogueText)와 같은 값이라야 두 결말문이
        // 같은 단위를 말한다. 원본 숫자를 넘기면 LLM이 「3200만원」이라 쓰고 폴백은 「3,200만원」,
        // 억 단위에선 아예 갈린다. narrative.EpilogueStats 주석이 경고한 그 우회다.
        treasuryText: formatManwon(world.treasuryManwon),
      }).then((text) => {
        setLlmLive(text !== null);
        if (text) setLlmEpilogue({ key: `w${world.week}`, text });
      });
    }
  }, [settledKey, world, resigning]);

  /* 에필로그 — 판이 끝났을 때만 만든다. 문장은 `narrative.epilogueText`가 소유하고 여기선
     지표만 모은다: 금액 포맷은 화면 층의 단일 함수(formatManwon)를 지나므로 HUD·결산과 같은
     단위가 보장된다(계획 §0-8). ⚠️ 이탈 수는 **이 주치**다 — 세계가 주마다 days를 비워
     판 누적 축이 없다(narrative.EpilogueStats 주석). */
  const epilogue = world.ending
    ? // LLM 결말문이 이 주차로 도착해 있으면 그것, 아니면 폴백 원고. 지표는 어느 쪽이든 같은 세계에서 왔다.
      llmEpilogue?.key === `w${world.week}`
      ? llmEpilogue.text
      : epilogueText(world.ending, {
          week: world.week,
          leftCount: weekSummary(world).leftCount,
          resignedNames: resigning.map((p) => p.name).filter((n): n is string => !!n),
          treasuryText: formatManwon(world.treasuryManwon),
        })
    : undefined;

  /* 사직 통지 — 편지 본문(body)만 LLM 문장으로 갈아 끼운다. 머리줄(head: 누가 떠나는가)은
     세계에서 파생된 **사실**이라 손대지 않는다: LLM이 이름이나 과를 잘못 쓰면 화면이 거짓말을 한다. */
  const leavingNotices = resigningNotices(resigning);
  const leaving = llmLetter
    ? leavingNotices.map((n) => (n.key === llmLetter.key ? { ...n, body: llmLetter.text } : n))
    : leavingNotices;

  const closed = world.minute >= ARRIVAL_WINDOW_MIN;

  /* 경고 스택이 읽는 목록 — 판정·문구·순서는 전부 simHud.alertsOf가 소유한다.
     상태줄의 배치 경고(setupWarningText)도 같은 함수의 파생이라 두 자리가 갈릴 수 없다. */
  const alerts = alertsOf(world);

  /* 개원 준비 체크리스트 — 위 경고와 **같은 판정**(simHud.setupSteps)이다. 경고는 그 목록의
     첫 미완 단계이고, 여기서는 전부를 진행률과 함께 편다. 남은 것이 없으면 목록이 사라진다. */
  const setupSteps_ = setupSteps(world);
  const setupTodo = setupSteps_.filter((s) => !s.done);
  const setupDone = setupSteps_.length - setupTodo.length;

  /* 인스펙트 카드 — **매 렌더 세계에서 폰을 다시 찾는다**(스냅샷 금지). 그래서 그 사람이
     걸어가면 카드의 수치가 따라 살고, 퇴장하면(배열에서 빠지면) 찾기가 실패해 카드가 저절로
     닫힌다 — 남은 id는 무해하므로 상태를 따로 비울 필요가 없다. */
  const inspected = inspectId === null ? undefined : world.pawns.find((p) => p.id === inspectId);
  const card = inspected ? inspectCard(inspected, world) : null;

  /*
    ── HUD가 덮는 두께 ─────────────────────────────────────────────────────
    맵의 fit·클램프 기준이 뷰포트가 아니라 **안전 영역**이라(TileMap.useCamera), 바가 몇 px인지를
    맵에 알려 줘야 한다. **재는** 이유는 셀 수 없기 때문이다: 상단 바는 글꼴·창 폭·줄바꿈에 따라
    높이가 갈리고, 도구 패널 폭도 rem이라 글꼴 크기를 따른다 — 상수로 박으면 즉시 어긋난다
    (T-101이 고정 px을 버린 그 이유).

    측정 방식은 useCamera와 **같은 패턴**이고 이유도 같다 — 마운트에 한 번 직접 재고(옵저버 첫
    콜백은 다음 렌더링 스텝에 오고, 프레임을 안 그리는 창에서는 아예 안 온다 · T-086) 그 뒤는
    ResizeObserver가 잇는다.

    ⚠️ 패널에서 읽는 값이 높이가 아니라 **폭**인 것이 세로 배치의 이점이다: 도구 줄이 열리고
    닫혀도 폭은 그대로라 맵 배율이 흔들릴 자리가 없다(T-101이 하단 바에서 겪은 그 결합).
  */
  const headerRef = useRef<HTMLElement>(null);
  const paletteRef = useRef<HTMLElement>(null);
  const [insets, setInsets] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const header = headerRef.current;
    const palette = paletteRef.current;
    if (!header || !palette) return;
    // 같은 값이면 **같은 객체를 돌려준다** — RO는 레이아웃이 흔들릴 때마다 부르는데, 매번 새
    // 객체를 넣으면 이 컴포넌트가 그때마다 다시 렌더된다(값은 하나도 안 바뀐 채로).
    const measure = () =>
      setInsets((prev) =>
        prev.top === header.offsetHeight && prev.left === palette.offsetWidth
          ? prev
          : { top: header.offsetHeight, left: palette.offsetWidth },
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    ro.observe(palette);
    return () => ro.disconnect();
  }, []);

  /** 카테고리 토글 — 같은 것을 다시 누르면 접힌다.
   *
   *  **접거나 갈아탈 때 들고 있던 도구를 놓는 것**이 이 함수의 요점이다: 안 보이는 도구가 무장된
   *  채로 남으면 부지를 눌렀을 때 벽이 서는데 화면 어디에도 그 이유가 없다(팔레트가 접혀 있으니
   *  무엇을 들었는지 볼 자리가 없다). 도구 버튼이 이미 쓰는 초기화와 같은 세 줄이다.
   *
   *  ⚠️ 업데이터 **바깥**에서 초기화한다 — 안에서 부르면 StrictMode의 이중 호출에 side effect가
   *  두 번 실린다(이 파일의 `onTileUp`이 같은 이유로 setState 밖에서 확정한다). */
  const toggleSection = (s: PaletteSection) => {
    setSection((cur) => (cur === s ? null : s));
    setTool(null);
    setRoomType(null);
    setExamDept(null);
  };

  return (
    /*
      한 화면 = 부지 하나. **맵이 화면 전체이고 HUD는 그 위에 뜬 패널**이다(림월드의 배치).

      전 판은 3행 그리드(auto · 1fr · auto)로 자리를 **나눠** 줬다. 겹치지 못한 이유는 하나뿐이었다 —
      가려진 타일에 벽을 세울 방법이 없다는 것(부지가 고정 48×32라 화면 밖으로 밀 데가 없었다).
      **카메라가 그 전제를 없앴다**: 이제 가려진 자리는 팬·줌으로 끌어내 지을 수 있으므로 HUD가
      맵을 덮어도 도달 불가능한 타일이 생기지 않는다. 그래서 맵을 `inset-0`으로 화면 전체에 깔고
      상단 바와 좌측 팔레트를 그 위에 절대 배치한다 — 부지가 HUD 뒤로 이어져 보이는 것이 이제
      착시가 아니다.

      맵 크기는 여전히 이 파일에 안 나온다 — TileMap이 자기 자리를 재서 fit을 정하고, 그 위에
      플레이어의 카메라가 얹힌다.
    */
    /* 아트 디렉션 ④ — desk 토큰을 이 서브트리에서만 밝은 값으로 재정의한다.
       @theme inline이라 유틸리티가 var(--desk)를 직접 참조하므로 하위 99곳이
       클래스 무변으로 뒤집히고, /classic은 :root의 어두운 값 그대로다.
       hex는 landingPalette(TS)에만 있다 — globals.css 무변 계약. */
    <main
      className="relative h-dvh overflow-hidden"
      style={
        {
          backgroundColor: OUTSIDE_FLOOR,
          "--desk": LANDING.backdrop,
          "--desk-2": LANDING.card,
          "--frame": LANDING.edge,
          "--on-desk": LANDING.ink,
          "--on-desk-muted": LANDING.inkMuted,
          "--alarm": LANDING.alarmDeep,
        } as CSSProperties
      }
    >
      {/* ── 상단 바 — 시각·금고·오늘 집계·시간 조작 ── */}
      <header ref={headerRef} className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-frame bg-desk-2/80 px-4 py-2 font-mono text-sm tabular-nums text-on-desk backdrop-blur-sm">
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
        {/* 서사 출처 배지 — 지금 화면의 문장이 LLM인지 폴백인지. 키 없는 배포본에서 게임이
            멀쩡히 도는 것이 고장이 아니라 설계임을 두 글자로 말한다(계획 §0-5). */}
        <span
          className="text-on-desk-muted"
          title={llmLive ? "LLM 스토리텔러가 문장을 씁니다" : "사전 작성 문장으로 진행합니다 (키 없음·지연·실패)"}
        >
          {llmLive ? "AI 서사" : "기본 서사"}
        </span>
        {/* ⚠️ 정지 사유 문구는 여기 없다 — 좌측 팔레트의 상태줄에 있다. 한때 이 자리에 있었는데,
            드래그를 **시작하는 순간** 문구가 생겨 헤더가 한 줄 늘고 맵이 32px 내려가
            드래그 좌표가 두 타일 어긋났다([T-099](../../claude-docs/troubleshooting/T-099.md):
            7×6을 그렸는데 7×4가 지어졌다).
            **그 두 전파 경로는 이제 둘 다 닫혔다** — 좌표는 포인터 변환이 그려진 rect를 읽어
            산술에서(simHud.tileFromPoint), 배율은 헤더가 오버레이가 되어 맵 크기에 영향을 줄 수
            없게 됐다(맵은 뷰포트 크기만 본다). 그래도 문구는 팔레트에 둔다 — **손이 가 있는 자리**가
            거기다(도구 목록과 같은 패널이라 도구별 안내를 눈이 따라간다). */}
        {/* ⚠️ [채용]·[인사]도 여기 없다 — 좌측 패널로 옮겼다(사용자 지시). 남은 것은 **시간 조작**
            뿐이라 이 바는 이제 *읽는 것(시각·금고·집계) + 시계*만 든다. 사람을 들이고 배치하는
            것은 벽을 세우는 것과 같은 **판을 바꾸는 행동**이라 도구 팔레트 쪽이 제자리다. */}
        <div className="ml-auto flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.title}
              aria-pressed={speed === s.value}
              onClick={() => changeSpeed(s.value)}
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

      {/* 부지 — 화면 전체(`inset-0`). HUD가 그 위에 뜨지만 **zoom 1에서는 아무것도 안 가린다**:
          맵이 뷰포트가 아니라 **상단 바 아래·팔레트 오른쪽(안전 영역)**에 맞춰 fit되기 때문이다.
          줌인하면 그때부터 바 밑으로 미끄러져 들어가고, 그 자리는 팬으로 끌어내 짓는다. */}
      <div className="absolute inset-0">
      <TileMap
        world={world}
        preview={preview}
        // 두 바가 덮는 두께 — fit·클램프의 기준을 안전 영역으로 만든다(위 측정 효과).
        insets={insets}
        // 주버튼 드래그가 건설인가 팬인가 — 판정은 여기(`ready`) 하나가 소유한다.
        // 도구를 안 골랐으면 드래그는 카메라를 미는 동작이 된다(그 클릭은 원래도 탐색이었다).
        buildReady={ready}
        // 폰은 게임 1분마다 2타일을 건너뛴다 — 그 1분의 실시간 길이가 곧 전환 시간이다.
        stepMs={running > 0 ? SIM_MS_PER_GAME_MIN / running : 0}
        // 열려 있으면 도구가 듣고, 아니면 **왜 안 되는지를 말한다** — 조용히 무시하면 부지를
        // 눌러도 미리보기도 토스트도 없어 플레이어에게는 판이 죽은 것으로 보인다.
        // 도구 자체를 안 골랐을 때만 조용하다(그 클릭은 탐색이다 — buildBlockReason).
        onTileDown={(t) => {
          if (!ready || !tool) {
            const reason = buildBlockReason(tool, roomType, examDept);
            if (reason) showToast(reason);
            return;
          }
          // 문만 한 칸을 겨누는 클릭이다 — 드래그를 열면 사각형이 뜻 없이 따라다닌다.
          // (용도는 드래그로 칠한다 — 칠한 사각형이 곧 영역이다.)
          if (isDragTool(tool)) setDrag({ start: t, cur: t });
          else commit(tool, [t]);
        }}
        onTileMove={(t) => setDrag((d) => (d ? { ...d, cur: t } : d))}
        // 지금 카드를 보고 있는 폰 — 아바타에 선택 링이 붙는다(맵이 판정하지 않는다).
        selectedId={inspectId ?? undefined}
        // 영역 오버레이 — **끄고 사는 것이 기본**이다. 판정은 여기 하나가 소유한다: 맵은 도구를
        // 모르므로(buildReady와 같은 계약) 용도 도구가 강제로 켜는 갈래를 맵이 알 수 없다.
        regionOverlay={regionOverlayOn({ toggled: overlayToggled, tool })}
        onToggleRegionOverlay={() => setOverlayToggled((v) => !v)}
        // 도구를 안 든 주버튼 클릭 = **가리키기**. 도구를 들었으면 이 콜백은 오지 않는다(건설이 먼저다).
        onTileClick={(t) => {
          // 한 칸에 겹쳐 선 폰 중 **마지막**을 고른다 — 배열 뒤가 화면 위에 그려지는 쪽이라,
          // 눈에 보이는 사람과 카드가 가리키는 사람이 같아진다.
          const hit = [...world.pawns].reverse().find((p) => p.x === t.x && p.y === t.y);
          // 빈 타일 클릭은 **닫기**다 — 카드를 닫는 데 마우스 경로가 하나 더 생긴다(× 버튼과 함께).
          setInspectId(hit?.id ?? null);
        }}
        onTileUp={(t) => {
          // 확정은 setState **바깥**에서 한다 — 업데이터 안에서 건설하면 StrictMode가
          // 업데이터를 두 번 불러 벽이 두 번 서고 비용도 두 번 빠진다.
          if (drag && tool) commit(tool, dragTiles({ ...drag, cur: t }, tool));
          setDrag(null);
        }}
        // 취소는 아무것도 짓지 않고 사각형만 버린다(시계는 drag가 비면 저절로 재개된다).
        onTileCancel={() => setDrag(null)}
      />
      </div>

      {/*
        ── 경고 스택 — **지금 이 병원에 대해 할 말 전부**(simHud.alertsOf가 정한다).

        상태줄은 한 줄이라 배치 경고 하나만 말할 수 있었고, 그 한 줄마저 토스트·정지 사유에
        늘 밀렸다 — 즉 급한 말일수록 안 보였다. 스택은 그 경합을 없앤다(상태줄은 그대로 둔다:
        손이 가 있는 자리의 도구 안내는 여전히 거기가 제자리다).

        `pointer-events-none`이라 맵 조작을 막지 않는다 — 클릭 동작이 없으니(카메라 점프는
        나중) 이 칩들이 부지 위에 뜬 채로 드래그를 삼킬 이유가 없다.
        `top`이 헤더 높이를 따르는 것은 팔레트와 같다(상단 바가 오버레이라 자리를 안 비켜 준다).
      */}
      {alerts.length > 0 && (
        <div
          style={{ top: insets.top + 8 }}
          className="pointer-events-none absolute right-2 z-10 flex flex-col items-end gap-1"
        >
          {alerts.map((a) => (
            <span
              key={a.key}
              // max-w는 미수 경고가 「필요 인원」까지 말하게 되면서 붙었다 — 폭 제한이 없으면
              // 긴 한 줄이 부지를 가로질러 지도를 덮는다(칩이 `items-end`라 왼쪽으로 자란다).
              className={`max-w-[22rem] border px-2 py-1 font-mono text-[11px] leading-snug backdrop-blur-sm bg-desk-2/80 ${
                // 색 단독 신호 금지(관통 규칙) — 등급이 갈리는 자리지만 문구가 이미 사실을
                // 통째로 말한다. 색은 읽는 순서를 돕는 보조일 뿐이다.
                a.severity === "danger" ? "border-alarm text-alarm" : "border-frame text-on-desk-muted"
              }`}
            >
              {a.text}
            </span>
          ))}
        </div>
      )}

      {/*
        ── 개원 준비 체크리스트 — **경고가 말하지 못하는 「전체 순서」**.

        사용자 결정(2026-07-29): *"튜토리얼을 필요로 하는 사용자에게는 건설도 안내해 줘야 한다고
        생각해. 림월드가 한국에서는 그렇게 일반적인 장르는 아니거든."* 경고 스택은 계약상 **한
        건만** 낸다(무엇부터 할지가 사라지지 않게) — 그건 아는 사람에게 맞는 형태이고, 처음 보는
        사람에게는 *앞으로 몇 개가 남았는지*와 *어떻게 하는지*가 함께 있어야 한다.

        판정은 한 줄도 여기 없다 — `simHud.setupSteps`가 단일 출처이고 위 경고가 그 **첫 미완
        단계**다. 그래서 체크리스트에 체크가 없는 줄과 경고 칩이 언제나 같은 단계를 가리킨다.

        **다 끝나면 통째로 사라진다.** 남겨 두면 아는 사람의 화면을 영영 좁히고, 사라지는 것
        자체가 "준비가 끝났다"는 신호다. 스타팅 게이트가 떠 있는 동안에는 그 모달이 이미 첫
        단계를 맡고 있으므로 뒤에 겹쳐 띄우지 않는다.
      */}
      {!rosterOpen && setupTodo.length > 0 && (
        <aside
          /* 좌측 패널 **바로 옆**이다(`insets.left`) — 안내가 가리키는 버튼([건설]·[벽]…)이
             그 패널에 있어서, 문장과 손이 갈 자리가 한 화면에 붙어 있어야 한다. */
          style={{ top: insets.top + 8, left: insets.left + 8 }}
          aria-label="개원 준비"
          className="pointer-events-none absolute z-10 w-60 border border-frame bg-desk-2/85 px-3 py-2.5 backdrop-blur-sm"
        >
          <h2 className="mb-1.5 font-mono text-[11px] text-on-desk">
            개원 준비 <span className="tabular-nums text-on-desk-muted">{setupDone}/{setupSteps_.length}</span>
          </h2>
          <ol className="flex flex-col gap-1">
            {setupSteps_.map((s) => (
              <li key={s.key} className="flex gap-1.5 text-[11px] leading-snug">
                {/* 체크는 **글리프**로 진다 — 색만으로 지면 흑백에서 완료·미완이 같은 줄이 된다
                    (관통 규칙). `aria-hidden`이 아닌 것은 스크린리더도 상태를 읽어야 해서다. */}
                <span className="font-mono text-on-desk-muted">{s.done ? "✔" : "□"}</span>
                <div className={s.done ? "text-on-desk-muted/50" : "text-on-desk"}>
                  <p className={s.done ? "line-through" : ""}>{s.label}</p>
                  {/* 조작 안내는 **지금 할 일에만** 편다 — 다섯 줄이 전부 펼쳐지면 그건 목록이
                      아니라 설명서라, 무엇부터 할지가 다시 묻힌다(경고가 한 건만 내는 그 이유). */}
                  {!s.done && s.key === setupTodo[0].key && (
                    <p className="mt-0.5 text-[10px] text-on-desk-muted">{s.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </aside>
      )}

      {/*
        ── 좌측 패널 — **판을 바꾸는 행동이 전부 여기 있다.** 상단 바에 남은 것은 읽는 값과 시계뿐이다.

        행동은 **카테고리로 묶여 접혀 있다**(사용자 지시 *"건설은 건설로 묶자"*): [사람]·[건설]이
        서 있고 누른 하나만 아래로 열린다. 평평하게 늘어놓던 10줄이 짧은 창에서 곧 스크롤이었고
        (600px에서 실측 `878 > 558`), 그 스크롤은 맨 아래 상태줄까지 밀어냈다.
        도구가 아니라 **묶음**이 최상위인 것이 계약이다 — 카테고리는 열기만 하고 도구는 안 든다. ──

        **하단 전폭 바에서 좌측 세로 패널로 옮겨 왔다.** 부지는 가로로 넓은 48×32라 zoom 1에서
        좌우에 늘 여백이 남는데(fit이 세로에 걸린다), 하단 바는 그 남는 가로를 못 쓰면서 세로만
        깎아 **맵을 두 번 좁혔다** — 이제 팔레트가 그 빈 자리를 채우고 세로는 통째로 부지에 간다.

        ⚠️ 폭(`w-40`)이 **고정**인 것이 T-101을 구조적으로 닫는다: 아래 용도·과 줄이 열리고 닫혀도
        맵에 넘기는 인셋(= 이 패널의 폭)이 안 변하므로 배율이 흔들릴 수 없다. 하단 바 시절엔 그
        줄들이 곧 높이였고, 높이가 곧 인셋이라 도구를 고를 때마다 화면 전체 해상도가 튀었다
        ([T-101](../../claude-docs/troubleshooting/T-101.md): *"하단 메뉴를 클릭하면 해상도가 바뀌어
        어지럽다"*). 그래서 그 시절 필요했던 `invisible` 자리 예약도 함께 걷어냈다 — 예약은 배율을
        묶으려던 수단이었지 목적이 아니었고, 세로로 서면서 묶을 것 자체가 사라졌다.

        `top`이 상단 바 높이를 따르는 것은 그 바가 오버레이라서다(자리를 안 비켜 준다).
      */}
      <aside
        ref={paletteRef}
        style={{ top: insets.top }}
        className="absolute bottom-0 left-0 z-10 flex w-40 flex-col gap-2 overflow-y-auto border-r border-frame bg-desk-2/80 px-3 py-3 backdrop-blur-sm"
      >
        {/* ── 카테고리 — 누르면 **바로 아래에** 그 묶음이 열린다(아코디언: 한 번에 하나). ──
            평평한 10줄이 곧 스크롤이었다: 600px 높이에서 [용도]·[진료실]까지 펼치면 패널이
            잘렸다. 카테고리만 서 있으면 패널이 두 줄로 유지되고 펼친 하나만 아래로 자란다.

            ⚠️ [사람]에 **이탈 경고를 승계**한다 — 안쪽 [인사]에만 두면 묶음이 접힌 동안 붉은
            신호가 통째로 사라진다. 주말 통지를 기다리지 않고 **주중에 눈에 띄어야** 대응할
            시간이 생기는 것이 그 경고의 존재 이유라, 접힌 채로 안 보이면 없는 것과 같다. */}
        <div className="flex flex-col gap-1.5">
          {PALETTE_SECTIONS.map((s) => {
            const open = section === s.key;
            const alarm = s.key === "PEOPLE" && resigning.length > 0;
            return (
              <button
                key={s.key}
                type="button"
                aria-expanded={open}
                onClick={() => toggleSection(s.key)}
                className={`flex items-center justify-between border px-3 py-1.5 text-sm transition-colors ${
                  open
                    ? "border-on-desk-muted bg-frame text-on-desk"
                    : alarm
                      ? "border-alarm text-alarm hover:bg-alarm/10"
                      : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
                }`}
              >
                <span>
                  {s.label}
                  {alarm ? ` · 이탈 ${resigning.length}` : ""}
                </span>
                {/* 펼침 표시 — 화살표 하나가 "이 버튼은 창을 여는 버튼"임을 말한다(도구 버튼과 구별). */}
                <span aria-hidden className="font-mono text-xs">
                  {open ? "▾" : "▸"}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── 사람 — [채용]·[인사]. 채용이 "사람을 들이는" 버튼이면 인사는 **들인 사람이
            무엇을 할지** 정하는 버튼이다. ── */}
        {section === "PEOPLE" && (
          <div className="flex flex-col gap-1.5 border-t border-frame pt-2">
            <button
              type="button"
              onClick={() => setHireOpen(true)}
              className="border border-frame px-3 py-1.5 text-sm text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk"
            >
              채용
            </button>
            <button
              type="button"
              onClick={() => setPriorityOpen(true)}
              className={`border px-3 py-1.5 text-sm transition-colors ${
                resigning.length > 0
                  ? "border-alarm text-alarm hover:bg-alarm/10"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              인사{resigning.length > 0 ? ` · 이탈 ${resigning.length}` : ""}
            </button>
          </div>
        )}

        {/* ── 건설 — 도구 8종. 용도로 바닥을 칠하고 → 가구를 놓는다. 벽·문은 나누고 싶을 때만 세운다
            (칠한 자리가 곧 영역이라 방을 만드는 데 벽이 필요 없다 — 설계 2026-07-31 §2).
            용도·철거까지 여기 드는 것은 셋 다 **부지를 바꾸는 행위**라서다(PALETTE_SECTIONS 주석). ── */}
        {section === "BUILD" && (
          <div className="flex flex-col gap-1.5 border-t border-frame pt-2">
            {BUILD_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tool === t}
                onClick={() => {
                  setTool((cur) => (cur === t ? null : t));
                  // 도구를 바꾸거나 놓으면 용도 선택도 함께 비운다 — 남겨 두면 다음에 용도 도구를
                  // 고르는 순간 고르지도 않은 방 종류로 클릭이 열린다.
                  setRoomType(null);
                  setExamDept(null);
                }}
                className={`border px-3 py-1.5 text-sm transition-colors ${
                  tool === t
                    ? "border-on-desk-muted bg-frame text-on-desk"
                    : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
                }`}
              >
                {TOOL_LABEL[t]}
              </button>
            ))}
            {/* 가격표는 **고른 도구의 값**이다 — 값 자체는 코어 표에서 온다(simHud.toolCostText).
                건설 묶음 안에 있는 이유: 도구가 없으면 말할 값도 없다(접혀 있을 땐 빈 줄이 된다). */}
            <p className="font-mono text-[11px] leading-snug tabular-nums text-on-desk-muted">
              {tool ? toolCostText(tool) : "도구를 고르면 비용이 표시됩니다"}
            </p>
          </div>
        )}

        {/* 용도 6종 + 지정 해제 — [용도]를 고르면 열린다. 용도가 **곧** 영역이라는 것을 이 목록이
            말한다: 벽으로 두르지 않아도 칠한 자리가 그대로 방이 된다(설계 2026-07-31 §2).
            벽은 통행을 막고 그림을 만드는 것이지 방의 조건이 아니다. */}
        {tool === "DESIGNATE" && (
          <div className="flex flex-col gap-1.5 border-t border-frame pt-2">
            <span className="text-xs text-on-desk-muted">용도</span>
            {ROOM_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={roomType === t}
                onClick={() => {
                  setRoomType((cur) => (cur === t ? null : t));
                  setExamDept(null); // 방 종류를 바꾸면 과 선택은 뜻을 잃는다
                }}
                className={`border px-2.5 py-1 text-xs transition-colors ${
                  roomType === t
                    ? "border-on-desk-muted bg-frame text-on-desk"
                    : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
                }`}
              >
                {ROOM_LABEL[t]}
              </button>
            ))}
            {/* 지정 해제 — 용도의 반대말이라 같은 줄의 마지막에 선다(철거 도구와 분리한 것이 계약:
                벽·가구까지 같이 부수는 오조작을 막는다 — 설계 §1). */}
            <button
              type="button"
              aria-pressed={roomType === "ERASE"}
              onClick={() => {
                setRoomType((cur) => (cur === "ERASE" ? null : "ERASE"));
                setExamDept(null);
              }}
              className={`border px-2.5 py-1 text-xs transition-colors ${
                roomType === "ERASE"
                  ? "border-on-desk-muted bg-frame text-on-desk"
                  : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
              }`}
            >
              {ERASE_LABEL}
            </button>
          </div>
        )}

        {/* 진료실의 과 — 진료가 성립하려면 환자·진료실·의사의 과가 셋 다 같아야 하므로
            (코어의 삼중 일치), 무슨 과로 지정하는지가 건설의 절반이다. */}
        {tool === "DESIGNATE" && roomType === "EXAM" && (
          <div className="flex flex-col gap-1.5 border-t border-frame pt-2">
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

        {/* 상태줄 — **화면에서 유일하게 문구가 바뀌는 자리**. 무엇을 쓸지는 simHud.statusLineText
            (우선순위 체인)가 정하고 여기선 칠만 한다: 판정이 JSX 안에 있으면 그 우선순위를 겨눌 수
            있는 테스트가 하나도 없다.
            `mt-auto`로 패널 바닥에 붙인다 — 도구에서 눈이 내려오는 끝자리이자, 목록이 짧을 때
            패널이 위쪽만 채워진 채 비어 보이지 않게 하는 자리다. */}
        <p className="mt-auto min-h-5 border-t border-frame pt-2 text-xs leading-snug">
          <span className={toast ? "text-alarm" : "text-on-desk-muted"}>
            {statusLineText({
              toast: toast?.text ?? null,
              pause,
              // 플레이어가 스스로 멈춰 둔 상태 — 마감·결산 국면의 정지는 여기 해당하지 않는다
              // (그때는 오버레이가 이미 다음 행동을 말한다).
              idle: speed === 0 && world.phase === "RUNNING",
              warning: setupWarningText(world),
              tool,
              roomType,
              dept: examDept,
            })}
          </span>
        </p>
      </aside>

      {/*
        ── 인스펙트 카드 — 클릭한 폰 한 명. **팔레트 오른쪽 아래**에 선다(insets.left를 그대로
        재활용한다 — 팔레트 폭이 갈려도 카드가 그 밑에 깔리지 않는다).

        z-10이라 오버레이(채용·인사·속보·결산 = z-20) **아래** 층이다: 모달이 뜨면 가려지는
        것이 옳다(그때 플레이어가 보는 것은 그 모달이다).

        닫는 길이 셋이다 — ESC(§키보드) · 빈 타일 클릭 · 이 × 버튼. 마지막 것이 있어야
        "마우스만으로 완주"가 유지된다(키보드는 언제나 가속 수단일 뿐이다).
      */}
      {card && (
        <aside
          style={{ left: insets.left + 8 }}
          className="absolute bottom-2 z-10 w-56 border border-frame bg-desk-2/80 px-3 py-2 backdrop-blur-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-mono text-xs leading-snug text-on-desk">{card.title}</h2>
            <button
              type="button"
              title="닫기"
              onClick={() => setInspectId(null)}
              className="-mr-1 -mt-0.5 px-1 font-mono text-xs text-on-desk-muted transition-colors hover:text-on-desk"
            >
              ×
            </button>
          </div>
          <ul className="mt-1.5 flex flex-col gap-1 border-t border-frame pt-1.5">
            {card.lines.map((l, i) => (
              // 줄은 순수 함수가 만든 문장 배열이라 자리가 곧 신원이다(같은 문장이 두 줄 설 수 있다).
              <li key={i} className="font-mono text-[11px] leading-snug text-on-desk-muted">
                {l}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {/*
        마감·결산은 라우트를 바꾸지 않고 부지 위에 덮는다 — 타일 병원은 한 장면으로 이어지는 게
        리듬이다. 세계가 흐르지 않는 건 오버레이가 아니라 phase가 보장한다(effectiveSpeed·tick).

        전이는 전부 **업데이터 안에서 phase를 다시 확인**하고 부른다. 코어의 startNextDay·
        startNextWeek은 국면이 어긋나면 throw이므로, 버튼을 두 번 눌러 두 갱신이 줄 서면
        두 번째가 크래시가 된다 — 화면이 사라진 뒤의 클릭은 조용히 버리는 게 맞다.
      */}
      {/* 채용 패널 — 결산 오버레이와 **같은 층**에 뜨지만 국면과 무관하다(운영 중에도 뽑는다).
          시계는 phase가 아니라 hireOpen이 세운다(위 paused 파생). */}
      {/*
        ── 지역 선택 — 판이 열리기 전의 **첫 화면**(RegionPicker).

        림월드가 시작 시 지형을 고르듯, 이 게임은 대한민국의 어느 지역에 병원을 지을지 고른다.
        지역별 의료 격차가 그 지형의 자리이고, 그 격차는 **규칙에 닿는다**(world.REGIONS).

        화면(지도·문구·두 단계 흐름)은 전부 RegionPicker가 갖고, 여기 남는 것은 **고른 뒤에
        무슨 일이 일어나는가**뿐이다 — 이 파일이 1,200줄이라 첫 화면부터 떼어냈다.

        배경은 플레이어가 안 고른다 — 지역 후보 3종 중 하나가 **확정 시점에** 무작위로 정해져
        세계에 저장된다. 시뮬 안이 아니라 여기서 `Math.random`을 부르는 것이 계약이다: 세계가
        만들어진 뒤로는 지금까지와 똑같이 완전 결정론이다(world.SimWorld.backdrop 주석).
      */}
      {!regionPicked && (
        <RegionPicker
          onPick={(region) => {
            /* 세계를 **갈아 끼운다** — 판은 일시정지로 시작하고 아직 아무도 없으므로
               버릴 것이 없다(기본 세계는 이 화면 뒤를 채우기 위한 임시판이다).
               world를 nullable로 만들지 않는 이유: 조기 return이 훅 순서와 충돌한다. */
            setWorld(createWorld(1, { region, backdrop: Math.floor(Math.random() * BACKDROP_COUNT) }));
            setRegionPicked(true);
          }}
        />
      )}

      {/* ⚠️ `regionPicked` 조건이 **순서**를 강제한다 — 지역 카드가 세계를 갈아 끼우므로
          그 전에 뽑은 의사는 사라진다. 한 겹 앞선 게이트를 먼저 통과해야 이 패널이 존재한다. */}
      {regionPicked && (hireOpen || rosterOpen) && (
        <HirePanel
          pawns={world.pawns}
          hirePool={world.hirePool}
          treasuryManwon={world.treasuryManwon}
          // 스타팅 모드는 **게이트가 열려 있는 동안만**이다 — 닫은 뒤 [채용]으로 다시 열면
          // 평소 패널이다(같은 컴포넌트가 두 얼굴을 갖되 상태는 하나다).
          starting={rosterOpen}
          onHire={hire}
          onHireNurse={hireNurseHere}
          onClose={() => (rosterOpen ? setRosterOpen(false) : setHireOpen(false))}
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
          // LLM 연출문이 이 카드(주-일-종류)로 도착해 있으면 그것, 아니면 폴백 원고.
          // 늦게 도착해도 카드가 아직 떠 있으면 이 자리에서 바로 교체된다(판정·수치는 불변).
          narration={
            llmNarration?.key === eventKey
              ? llmNarration.text
              : eventNarration(world.event.kind, world.week, world.day)
          }
          // 위축 고지 — **연출문과 별개의 줄**이다. 소송이 실제로 누군가의 응급 우선순위를
          // 내렸다는 결정론 사실이라, LLM 서사가 도착했든 폴백이든 반드시 함께 뜬다.
          // 종류를 따로 묻지 않는 이유: 이 필드는 LAWSUIT일 때만 실린다(events.applyEvent).
          notice={world.event.chilledName ? chillNotice(world.event.chilledName) : undefined}
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
          onNextDay={() => setWorld((w) => (w.phase === "DAY_END" ? applyMorningEvent(startNextDay(w), chooseToday) : w))}
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
          leaving={leaving}
          treasuryManwon={world.treasuryManwon}
          insolvencyStreak={world.insolvencyStreak}
          closed={world.phase === "CLOSED"}
          // 왜 끝났는가는 코어가 이미 판정해 두었다 — 화면이 streak으로 되짚지 않는다.
          ending={world.ending}
          epilogue={epilogue}
          onNextWeek={() => setWorld((w) => (w.phase === "WEEK_END" ? applyMorningEvent(startNextWeek(w), chooseToday) : w))}
        />
      )}
    </main>
  );
}
