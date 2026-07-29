"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { FATIGUE_MAX } from "@/game/doctor";
import { GRID_W, GRID_H, type RoomType, type SimWorld } from "@/sim/world";
import { computeRegions, type Region } from "@/sim/regions";
import { BedSprite, ChairSprite, DeskSprite, DoctorSprite, DEPT_COLOR, PatientSprite } from "./PixelSprite";
import {
  busyDoctorIds,
  clampCamera,
  doctorActivityMark,
  doctorRoomlessMark,
  fatigueTone,
  FATIGUE_COLOR,
  pannedCamera,
  roomLabel,
  safeArea,
  tileFromPoint,
  zoomedCamera,
  type Camera,
  type Insets,
  type Rect,
  type Size,
} from "./simHud";

/**
 * 타일 병원 맵 — SimWorld를 그대로 그리는 순수 표시층. 세계를 만들지도 고치지도 않는다.
 *
 * 기존 HospitalMap과 같은 규칙 하나를 공유한다: **폰은 절대 remount하지 않는다.**
 * key={pawn.id}를 유지한 채 left/top만 바꿔야 CSS transition이 타일 사이를 걷는다.
 * 부모가 바뀌거나 key가 흔들리면 이동이 remount가 되어 순간이동으로 보인다.
 *
 * HospitalMap과 다른 점은 좌표계다 — 저쪽은 연출용 백분율이고 여기는 **타일 격자**다.
 * 화면 위치는 전부 `타일 × TILE`이라 시뮬의 정수 좌표와 1:1로 대응한다(별도 좌표 함수 없음).
 *
 * ⚠️ 폰은 게임 1분에 PAWN_TILES_PER_MIN(2)타일을 **점프**한다. transition이 그 사이를
 * 직선 보간하므로 경로가 꺾이는 지점에서 대각선이 벽 모서리를 스칠 수 있다 — 1주차 수용 한계다.
 * 도착 판정은 위치 기반이라 시뮬 결과에는 영향이 없다(연출만의 문제).
 */

/**
 * 타일 한 칸의 **내부 좌표계** 크기(px) — 스프라이트·라벨이 그려지는 기준 격자(48×32 = 768×512).
 *
 * ⚠️ 화면에 **보이는** 크기가 아니다. 맵은 부모가 준 자리에 맞춰 통째로 확대되므로
 * (`useFitScale` → CSS transform) 실제 타일은 이 값 × 배율이다. 그래서 포인터 좌표를
 * 이 상수로 나누면 안 된다 — 그 계산은 화면에 그려진 rect를 읽는 `simHud.tileFromPoint`가 진다.
 */
export const TILE = 16;

/** 부지 원본 크기(px) — 카메라 산술이 받는 `base`. 화면에 보이는 크기는 여기 × fit × zoom이다. */
const BASE: Size = { w: GRID_W * TILE, h: GRID_H * TILE };

/** 인셋 기본값(바 없음) — 모듈 상수라 렌더마다 새 객체가 생기지 않는다. */
const NO_INSETS: Insets = { top: 0, left: 0 };

/**
 * 뷰포트 측정(fit) + 그 위에 얹힌 카메라(줌·팬).
 *
 * `fit`은 옛 `useFitScale`이 주던 값과 **기준이 다르다** — 부지 전체가 들어가야 하는 곳이 뷰포트가
 * 아니라 **안전 영역**(HUD가 안 덮는 구간)이다. 바들은 오버레이라 뷰포트를 줄이지 않으므로,
 * 뷰포트로 맞추면 zoom 1에서 바깥쪽 타일 줄이 늘 바 밑에 깔리고 그 배율엔 팬 슬랙이 없어
 * 꺼낼 수도 없었다([T-102](../../claude-docs/troubleshooting/T-102.md)).
 * 그것이 **최종 배율이 아니라 zoom 1의 기준선**인 것은 그대로다(카메라 산술은 simHud).
 *
 * ⚠️ 인셋을 **객체가 아니라 숫자 둘로** 받는 것이 계약이다 — deps에 객체를 두면 부모가 매 렌더
 * 새로 만드는 순간 이 효과가 무한히 재실행된다.
 */
function useCamera(ref: RefObject<HTMLElement | null>, insetTop: number, insetLeft: number) {
  const [fit, setFit] = useState(1);
  const [safe, setSafe] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number, height: number) => {
      // 안전 영역 — 상단 바가 위를, 도구 패널이 왼쪽을 덮는다(아래·오른쪽은 비어 있다).
      const s = safeArea({ w: width, h: height }, { top: insetTop, left: insetLeft });
      if (s.w <= 0 || s.h <= 0) return; // 아직 배치 전(또는 바가 화면을 다 먹은 극단) — 접으면 맵이 사라진다
      const f = Math.min(s.w / BASE.w, s.h / BASE.h);
      setFit(f);
      setSafe(s);
      /* 리사이즈: **zoom은 유지하고 다시 클램프만** 한다 — 창을 줄였다고 플레이어가 당겨 둔
         배율까지 되돌리면 조작이 사라진다.
         ponytail: 보던 **중심 유지**는 안 한다 — 창 크기를 바꾸면 화면이 조금 밀린다. 필요해지면
         리사이즈 직전 중심을 앵커로 zoomedCamera(factor 1)를 한 번 태우면 된다. */
      setCam((c) => clampCamera(c, s, { w: BASE.w * f * c.zoom, h: BASE.h * f * c.zoom }));
    };
    /* ⚠️ **마운트 시 한 번은 직접 잰다** — ResizeObserver의 첫 콜백에 기대면 안 된다.
       그 콜백은 다음 *렌더링 스텝*에 오므로 ① 첫 프레임이 배율 1(768×512)로 그려졌다가 튀고,
       ② 페이지가 프레임을 그리지 않는 동안(숨은 탭·비표시 창) 콜백 자체가 오지 않아 맵이
       작은 채로 남는다 — 실측으로 잡은 결함이다(옵저버만 달았을 때 300ms 동안 콜백 0회).
       getBoundingClientRect 계열은 레이아웃을 즉시 계산하므로 컴포지팅과 무관하게 값을 준다. */
    measure(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
    // 인셋이 바뀌면(상단 바가 줄바꿈되거나 패널 폭이 갈림) **다시 재고 다시 클램프**해야 한다.
  }, [ref, insetTop, insetLeft]);
  return { cam, setCam, fit, safe };
}

/**
 * 방 타입별 바닥·벽 색. 지면(desk) 팔레트에서 파생한 어두운 계열 — 사람(스프라이트)이
 * 시선을 먼저 받아야 하므로 방은 대조를 낮게 유지한다. 원시 유틸(zinc/emerald…) 대신
 * 리터럴 hex를 쓰는 건 PixelSprite·HospitalMap과 같은 **회화 레이어**의 관례다.
 */
export const ROOM_STYLE: Record<RoomType, { floor: string; wall: string }> = {
  EXAM: { floor: "#16232a", wall: "#2d4650" },
  WARD: { floor: "#1e1a2a", wall: "#3b3352" },
  WAITING: { floor: "#241f18", wall: "#4a4130" },
  LOUNGE: { floor: "#16241c", wall: "#2c4a39" },
  RECEPTION: { floor: "#261a1a", wall: "#4f3232" },
  // 식당 — 휴게실(녹)의 이웃 색조(황록). 두 방은 같은 "쉬는 곳"이라 계열을 붙이되, 한 화면에
  // 나란히 서도 구별되게 색상만 옮긴다. `Record<RoomType, …>`이라 이 줄이 없으면 tsc가 막는다.
  CAFETERIA: { floor: "#24220f", wall: "#4a4620" },
};

/** 부지 바닥(방 밖) — 복도이자 마당. **화면 전체의 배경이기도 하다**(SimGame): 맵 둘레의 여백이
 *  같은 색이라야 부지가 화면 밖으로 이어지는 것으로 보이고, HUD가 그 위에 뜬 패널로 읽힌다. */
export const OUTSIDE_FLOOR = "#0d0d11";
const GRID_LINE = "rgba(216,207,175,0.045)"; // 격자 — 타일 경계를 겨우 읽을 만큼만

/** 용도 없는 영역·용도 영역에 안 닿은 벽의 색. 벽을 세웠지만 아직 무슨 방인지 안 정한 상태가
 *  화면에 **보여야** 한다 — 안 그리면 플레이어는 벽이 안 세워진 줄 안다(설계 PR 2의 도구 흐름). */
const NEUTRAL_STYLE = { floor: "#131318", wall: "#33333d" };

/** 진료실 바닥에 얹는 과 색의 알파 — 8자리 hex의 끝 두 자리(0x24 ≈ 14%).
 *  옛 렌더가 별도 오버레이 div에 `opacity: 0.14`로 주던 값과 같은 농도이고, 타일당 div를
 *  하나로 유지한다(영역은 임의 모양이라 사각형 오버레이를 덮을 수 없다). */
const DEPT_TINT_ALPHA = "24";

/** 접수 카운터 — PixelSprite에 없는 유일한 가구라 여기서만 쓰는 8×8 격자로 둔다. */
function CounterSprite() {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
      <rect x="0" y="2" width="8" height="4" fill="#4a3f33" />
      <rect x="0" y="2" width="8" height="1" fill="#6b5a45" />
      <rect x="1" y="4" width="2" height="1" fill="#d8d3c0" />
      <rect x="5" y="4" width="2" height="1" fill="#d8d3c0" />
    </svg>
  );
}

/** 의사 아바타 위 피로 막대(타일 폭). 0이어도 트랙을 남긴다 — 눈금이 있어야 "아직 0"이 읽힌다. */
function FatigueBar({ fatigue }: { fatigue: number }) {
  const ratio = Math.max(0, Math.min(1, fatigue / FATIGUE_MAX));
  return (
    <div
      className="absolute left-0.5 right-0.5 -top-1 h-[2px] overflow-hidden"
      style={{ backgroundColor: "rgba(216,207,175,0.18)" }}
      aria-hidden
    >
      <div className="h-full" style={{ width: `${ratio * 100}%`, backgroundColor: FATIGUE_COLOR[fatigueTone(fatigue)] }} />
    </div>
  );
}

export interface BuildPreview {
  /** 지금 손을 떼면 **실제로** 서거나 사라질 타일. 드래그 사각형이 아니다 — 이미 벽이 선 칸은
   *  건너뛰므로, 사각형을 그대로 칠하면 미리보기가 결과보다 넓어진다(설치 후 "왜 덜 지어졌지"). */
  tiles: readonly number[];
  /** 지금 손을 떼면 성사되는가 — 판정은 코어(build.ts)가 하고 여기선 색만 고른다. */
  ok: boolean;
  /** 칸 수와 금액 한 줄 — 문구는 simHud.previewLabel이 소유한다(철거는 환불로 뒤집힌다). */
  label: string;
}

export interface TileMapProps {
  world: SimWorld;
  preview?: BuildPreview | null;
  /** 폰 이동 transition 길이(ms). 배속이 오르면 짧아진다 — 0이면 전환 없이 즉시(일시정지). */
  stepMs: number;
  /** 지금 주버튼 드래그가 **건설**인가 — 아니면 그 드래그는 카메라 팬이다(도구를 안 골랐을 때가 그 상태).
   *  판정은 SimGame이 소유한다(`ready`): 여기서 다시 세면 도구 팔레트와 맵의 "지을 수 있다"가 갈린다. */
  buildReady?: boolean;
  /** HUD가 덮는 두께(px) — 상단 바의 높이(`top`)와 좌측 도구 패널의 폭(`left`). **fit과 클램프의
   *  기준**이 여기서 갈린다(useCamera). 재는 것은 부모 몫이다: 바를 소유한 쪽만 그것이 몇 px인지
   *  알 수 있고, 맵이 되짚으면 DOM을 가로질러 형제를 캐야 한다.
   *  기본 0이면 옛 계약(뷰포트 전체가 안전 영역)이다. */
  insets?: Insets;
  onTileDown?: (t: { x: number; y: number }) => void;
  onTileMove?: (t: { x: number; y: number }) => void;
  /** 손을 뗐다 — **확정**. 여기서만 건설이 일어난다. */
  onTileUp?: (t: { x: number; y: number }) => void;
  /** 포인터가 취소됐다 — **파기**. 타일 좌표를 넘기지 않는 것이 계약이다(확정과 섞이지 않게). */
  onTileCancel?: () => void;
}

/** 포인터 위치 → 타일 좌표. 산술은 `simHud.tileFromPoint`가 지고 여기선 **화면에 그려진 rect**만
 *  넘긴다 — 그 rect가 확대된 크기라 배율이 자동으로 반영된다(그 함수 주석의 계약). */
function tileOf(e: ReactPointerEvent<HTMLDivElement>): { x: number; y: number } {
  return tileFromPoint({ x: e.clientX, y: e.clientY }, e.currentTarget.getBoundingClientRect());
}

export default function TileMap({
  world,
  preview,
  stepMs,
  buildReady = false,
  insets = NO_INSETS,
  onTileDown,
  onTileMove,
  onTileUp,
  onTileCancel,
}: TileMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { cam, setCam, fit, safe } = useCamera(hostRef, insets.top, insets.left);
  const scale = fit * cam.zoom;

  /* 팬 중인 포인터와 직전 위치 — **상태가 아니라 ref**다: 드래그 한 프레임마다 리렌더를 유발하면
     수백 개 타일 div가 딸려 오고, 무엇보다 다음 델타는 *직전 이벤트*에서 오지 렌더에서 오지 않는다. */
  const panRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);

  /* 휠 줌 — **네이티브 리스너 + passive:false**여야 한다. React의 onWheel은 패시브로 붙어
     preventDefault가 무시되고, 그러면 확대하려던 휠이 페이지를 스크롤한다. */
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // 지수식이라 트랙패드의 잔 델타와 휠의 큰 델타가 같은 비율 감각으로 붙는다(선형이면
      // 트랙패드에서 거의 안 움직이거나 휠 한 칸에 화면이 튄다).
      const factor = Math.exp(-e.deltaY * 0.0015);
      // 앵커는 **커서가 있는 뷰포트 px** 그대로다 — 커서는 바 위에도 올라간다(인셋은 클램프에만 든다).
      setCam((c) => zoomedCamera(c, { x: e.clientX - r.left, y: e.clientY - r.top }, factor, safe, BASE, fit));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit, safe, setCam]);

  /** 줌 버튼 한 번 — 앵커는 **안전 영역의 중앙**이다(커서가 없는 조작이라 중앙이 유일하게 뜻을
   *  갖고, 지금 보이는 곳의 중앙은 뷰포트 중앙이 아니라 상단 바·좌측 패널을 뺀 구간의 중앙이다). */
  const safeCenter = { x: safe.x + safe.w / 2, y: safe.y + safe.h / 2 };
  const zoomBy = (factor: number) => setCam((c) => zoomedCamera(c, safeCenter, factor, safe, BASE, fit));

  // 진료 중인 의사 — 환자의 doctorId가 "바쁨"의 단일 출처다(patientFlow와 같은 규칙).
  // 집합을 만드는 식 자체도 simHud가 든다: 인사 패널이 태업 판정에 같은 집합을 쓰므로
  // 여기서 따로 적으면 두 화면이 각자의 "바쁨"을 갖게 된다.
  const busyDoctors = busyDoctorIds(world.pawns);

  /*
    지형 — 벽·문·영역을 **타일 단위**로 그린다. 사각형 방(world.rooms)을 그리던 자리이고,
    바뀐 이유는 규칙이 이미 영역을 보기 때문이다: 화면이 사각형을 계속 그리면 벽이 뚫린 방을
    멀쩡한 방으로 보여 주고("왜 환자가 안 오지"), 자유 벽(설계 PR 2)은 아예 안 보인다.

    memo 키가 walls·doors·designations **셋뿐**인 것이 성능 계약이다 — 이 셋은 건설에서만
    새 객체로 갈리므로, 폰이 매 프레임 움직여도 수백 개의 타일 div가 다시 만들어지지 않는다.
    (그래서 computeRegions가 SimWorld 전체가 아니라 이 세 필드를 받는다 — regions.ts 주석.)
  */
  const { walls, doors, designations } = world;
  const { terrain, roomCount } = useMemo(() => {
    const regions = computeRegions({ walls, doors, designations });
    // 타일 → 그 타일을 담은 영역. 벽·문의 색을 이웃 영역에서 빌려 올 때 쓴다.
    const regionAt = new Map<number, Region>();
    for (const r of regions) for (const t of r.tiles) regionAt.set(t, r);
    /** 이 타일에 닿은 첫 **용도 있는** 영역 — 벽 하나가 두 방 사이에 서면 먼저 만난 쪽을
     *  따른다(둘 다 그릴 수는 없다). 용도 없는 이웃뿐이면 중립색이다.
     *
     *  ⚠️ **대각까지 보는 이유는 방의 네 모서리다**: 모서리 벽은 4방 이웃이 전부 벽·바깥이라
     *  (안쪽 칸이 대각선에만 있다) 4방만 보면 방마다 회색 모서리 네 개가 남는다 — 실측으로
     *  잡은 실제 결함이다(브라우저에서 모서리 4곳이 전부 중립색으로 그려졌다). 옛 렌더는
     *  사각형에 테두리를 둘러 이 문제가 없었다.
     *  4방을 **먼저** 훑는 순서가 계약이다: 두 방이 벽을 맞대면 맞닿은 쪽(4방)이 이기고,
     *  대각은 어느 방도 4방으로 닿지 않을 때만 쓰이는 폴백이다. */
    const AROUND = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [-1, -1], [1, -1], [1, 1], [-1, 1],
    ] as const;
    const neighborStyle = (t: number) => {
      const x = t % GRID_W;
      const y = (t - x) / GRID_W;
      for (const [dx, dy] of AROUND) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const r = regionAt.get(ny * GRID_W + nx);
        if (r?.type) return ROOM_STYLE[r.type];
      }
      return NEUTRAL_STYLE;
    };
    const at = (t: number) => ({ left: (t % GRID_W) * TILE, top: Math.floor(t / GRID_W) * TILE });

    const nodes: ReactNode[] = [];
    // ① 바닥 — 영역 타일마다 한 칸. 진료실은 과 색을 옅게 얹는다(색 단독 신호 금지: 아래 라벨이
    //    과 이름을 함께 쓴다 — 옛 렌더에서 이어받은 관통 규칙).
    for (const r of regions) {
      const style = r.type ? ROOM_STYLE[r.type] : NEUTRAL_STYLE;
      const tint = r.type === "EXAM" && r.dept ? `${DEPT_COLOR[r.dept]}${DEPT_TINT_ALPHA}` : null;
      for (const t of r.tiles) {
        nodes.push(
          <div
            key={`f${t}`}
            className="pointer-events-none absolute"
            style={{
              ...at(t),
              width: TILE,
              height: TILE,
              backgroundColor: style.floor,
              // 과 색은 배경 **위에** 한 겹 더 — 단색 그라디언트라 오버레이 div가 필요 없다.
              backgroundImage: tint ? `linear-gradient(${tint}, ${tint})` : undefined,
            }}
            aria-hidden
          />,
        );
      }
    }
    // ② 벽 — 타일 한 칸을 통째로 채운다(옛 렌더의 inset 그림자와 같은 두께). 얇은 선으로 그리면
    //    안쪽이 실제보다 넓어 보여, 왜 여기 못 서는지 설명이 안 된다.
    for (const t of walls) {
      nodes.push(
        <div
          key={`w${t}`}
          className="pointer-events-none absolute"
          style={{ ...at(t), width: TILE, height: TILE, backgroundColor: neighborStyle(t).wall }}
          aria-hidden
        />,
      );
    }
    // ③ 문 — 벽줄을 끊는 바닥 칸. 통행이 전부 여기를 지나므로 벽과 확실히 달라 보여야 한다.
    for (const t of doors) {
      const style = neighborStyle(t);
      nodes.push(
        <div
          key={`d${t}`}
          className="pointer-events-none absolute"
          style={{
            ...at(t),
            width: TILE,
            height: TILE,
            backgroundColor: style.floor,
            boxShadow: `inset 0 -2px 0 ${style.wall}`,
          }}
          aria-hidden
        />,
      );
    }
    // ④ 라벨 — 영역 id가 곧 성분의 최소 타일 인덱스라(regions.ts) 왼쪽 위 칸에 선다. 옛 렌더가
    //    (방 좌상단 + 1칸)에 놓던 그 자리다(벽이 테두리라 내부 좌상단 = 최소 인덱스).
    for (const r of regions) {
      if (!r.type) continue;
      const p = at(r.id);
      nodes.push(
        <span
          key={`l${r.id}`}
          className="pointer-events-none absolute font-mono text-[9px] leading-none text-on-desk/45"
          style={{ left: p.left + 1, top: p.top + 1 }}
        >
          {roomLabel({ type: r.type, dept: r.dept })}
        </span>,
      );
    }
    return { terrain: nodes, roomCount: regions.filter((r) => r.type).length };
  }, [walls, doors, designations]);

  return (
    /* 부모가 준 자리를 꽉 채우고 그 안에서 맵을 **카메라로 밀고 당긴다** — 림월드처럼 부지가 화면이 된다.
       위치·배율은 CSS transform 하나로 끝난다: 타일마다 박힌 px를 배율로 곱하면 반올림 오차가 칸마다
       쌓여 격자가 어긋나고, 무엇보다 폰 이동 transition이 매 배율마다 다시 계산된다.
       ⚠️ transform에 transition을 걸지 않는다 — 팬 드래그가 손보다 늦게 따라오면 조작이 미끄럽지 않다.

       옛 판에 있던 **중앙 정렬 껍데기 한 겹이 사라졌다**: 중앙값은 이제 클램프가 돌려준다
       (콘텐츠 < 안전 영역이면 그 안에서 중앙 — simHud.clampCamera).
       ⚠️ host는 `inset-0`(화면 전체)이고 안전 영역은 클램프에만 쓰인다 — 줌인하면 맵이 반투명
       바 **밑으로** 미끄러져 들어가는 것이 의도다(림월드처럼). 안 가리는 것은 zoom 1뿐이고,
       그 배율에서 부지 전체가 상단 바 아래·도구 패널 오른쪽 구간에 딱 맞는다. */
    <div
      ref={hostRef}
      className="relative h-full w-full overflow-hidden"
      // 우클릭 팬과 브라우저 메뉴가 충돌한다 — 메뉴가 뜨면 포인터가 그 자리에서 끊긴다.
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`absolute left-0 top-0 touch-none select-none ${panning ? "cursor-grabbing" : ""}`}
        style={{
          width: GRID_W * TILE,
          height: GRID_H * TILE,
          transform: `translate(${cam.x}px, ${cam.y}px) scale(${scale})`,
          transformOrigin: "top left",
          backgroundColor: OUTSIDE_FLOOR,
          /* 부지 테두리 — **`border`가 아니라 inset 그림자**여야 한다. border-box에서 1px 테두리는
             패딩 박스를 1px 안으로 밀고, 절대 배치된 타일들은 그 원점을 따르므로 격자 전체가
             1px 어긋나 오른쪽·아래로 1px 삐져나온다. zoom 1에서 상자가 안전 영역에 딱 맞는 지금은
             그 1px이 곧 **마지막 타일 줄이 footer 밑에 깔리는 양**이다(실측 1.14px). 그림자는
             레이아웃을 안 건드려 격자와 상자가 정확히 겹친다(포인터→타일 산술도 같이 정확해진다). */
          boxShadow: "inset 0 0 0 1px var(--frame)",
          backgroundImage: `repeating-linear-gradient(90deg, ${GRID_LINE} 0 1px, transparent 1px ${TILE}px), repeating-linear-gradient(180deg, ${GRID_LINE} 0 1px, transparent 1px ${TILE}px)`,
        }}
        role="img"
        aria-label={`병원 부지 ${GRID_W}×${GRID_H} 타일 — 방 ${roomCount}개, 인원 ${world.pawns.length}명`}
        /* ⚠️ **포인터 → 타일 산술은 카메라가 생겨도 무변이다** — `tileOf`가 화면에 그려진 rect를
           읽으므로(simHud.tileFromPoint) 맵이 밀리든 당겨지든 그 rect가 이미 답을 담고 있다.
           그게 T-099 계열을 산술에서 닫아 둔 값이고, 이번 변경이 그 값을 그대로 회수한다. */
        onPointerDown={(e) => {
          /* 버튼이 조작을 가른다: **주버튼 + 지을 수 있음**만 건설이고 나머지는 전부 팬이다.
             중·우클릭이 늘 팬인 것은 도구를 든 채로도 화면을 옮겨야 하기 때문이고, 이 갈래가
             옛 버그도 함께 닫는다 — 버튼 구분이 없어 **우클릭이 건설 드래그를 시작**했다. */
          if (e.button === 0 && buildReady) {
            // 순서가 의미를 갖는다 — 캡처가 먼저면 setPointerCapture가 던질 때(이미 끝난
            // 포인터 등 NotFoundError) 드래그가 아예 시작되지 않는다. 시작을 먼저 알리면
            // 최악의 경우도 "맵 밖으로 나가면 놓친다"로 그친다.
            const t = tileOf(e);
            onTileDown?.(t);
            try {
              e.currentTarget.setPointerCapture(e.pointerId); // 드래그가 맵 밖으로 나가도 안 끊기게
            } catch {
              /* 캡처 실패는 연출 손해일 뿐이라 삼킨다 */
            }
            return;
          }
          // 주버튼인데 못 짓는 상태면 **팬 전에 한 번 알린다** — 도구를 반쯤 고른 상태(용도만
          // 고르고 방 종류를 안 고름)의 안내 토스트가 이 호출에 걸려 있다. 삼키면 부지를 눌러도
          // 아무 말이 없어 판이 죽은 것으로 보인다(SimGame onTileDown).
          if (e.button === 0) onTileDown?.(tileOf(e));
          e.preventDefault(); // 중클릭 자동 스크롤(십자 커서)이 뜨면 드래그가 통째로 가로채인다
          panRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          setPanning(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* 위와 같다 — 캡처 실패는 "맵 밖에서 놓치면 끝"으로 그친다 */
          }
        }}
        onPointerMove={(e) => {
          const p = panRef.current;
          if (p) {
            setCam((c) => pannedCamera(c, e.clientX - p.x, e.clientY - p.y, safe, BASE, fit));
            panRef.current = { id: p.id, x: e.clientX, y: e.clientY };
            return;
          }
          onTileMove?.(tileOf(e));
        }}
        onPointerUp={(e) => {
          if (panRef.current) {
            panRef.current = null;
            setPanning(false);
            return; // 팬은 아무것도 짓지 않는다
          }
          onTileUp?.(tileOf(e));
        }}
        // 취소는 **확정과 다른 경로**여야 한다. 한때 이 자리에서 onTileUp을 불렀는데,
        // 그러면 브라우저가 드래그를 가로챌 때(스크롤 제스처·포인터 강제 해제 등)
        // 손을 떼지도 않은 사각형이 그대로 지어진다 — 철거 수단이 없어 비가역이다.
        onPointerCancel={() => {
          if (panRef.current) {
            panRef.current = null;
            setPanning(false);
            return;
          }
          onTileCancel?.();
        }}
      >
        {/* 지형(벽·문·영역 바닥·라벨) — 위 useMemo가 만든다. */}
        {terrain}

        {/* 가구 — 집기라 상호작용이 없다. 타일 자체가 막혀 있어(buildBlockedSet) 폰이 그 위에 못 선다.
            key가 좌표인 것은 이제 필연이다: 가구에 소속 필드가 없고(world.Furniture) 한 타일에
            둘을 놓을 수 없으므로 좌표가 곧 신원이다. */}
        {world.furniture.map((f) => (
          <div
            key={`${f.kind}-${f.x}-${f.y}`}
            className="pointer-events-none absolute"
            style={{ left: f.x * TILE, top: f.y * TILE, width: TILE, height: TILE }}
            aria-hidden
          >
            {f.kind === "DESK" ? (
              <DeskSprite />
            ) : f.kind === "CHAIR" ? (
              <ChairSprite />
            ) : f.kind === "BED" ? (
              <BedSprite occupied={false} />
            ) : (
              <CounterSprite />
            )}
          </div>
        ))}

        {/* 폰 — key는 id로 고정한다(위 주석). 이동은 left/top transition이 걷는다. */}
        {world.pawns.map((p) => {
          // 욕구 표시는 의사만 갖는 상태라 환자에는 언제나 null이다(activity 필드가 없다) —
          // 그래서 kind로 한 번 더 거르지 않는다.
          //
          // 자리 없음(?)은 **욕구가 없을 때만** 뜬다: 쉬러 간 의사는 자리가 없어서가 아니라
          // 스스로 자리를 뜬 것이라, 두 표시가 겹치면 이유가 뒤바뀐다(판정은 simHud가 진다).
          const activityMark = doctorActivityMark(p) ?? doctorRoomlessMark(p);
          return (
          <div
            key={p.id}
            className="pointer-events-none absolute"
            style={{
              left: p.x * TILE,
              top: p.y * TILE,
              width: TILE,
              height: TILE,
              transition: stepMs > 0 ? `left ${stepMs}ms linear, top ${stepMs}ms linear` : "none",
              zIndex: 2,
            }}
          >
            {/* 응급 환자 — 붉은 링. 스프라이트는 익명 회색 하나뿐이라(character-design.md: 환자에
                개인 서사를 붙이지 않는다) 링만으로 "지금 병원 안에 응급이 있다"를 나른다. */}
            {p.emergency && (
              <div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "inset 0 0 0 1.5px var(--alarm)" }}
                aria-hidden
              />
            )}
            {p.kind === "DOCTOR" && p.dept ? (
              <DoctorSprite dept={p.dept} busy={busyDoctors.has(p.id)} variantKey={p.id} />
            ) : (
              <PatientSprite />
            )}
            {/* 피로 막대 — 의사 머리 위. 기존 게임 FatigueBar의 표현 계승(저=회백 / 중=밝음 /
                고=적)이고 경계 판정은 simHud.fatigueTone 하나가 진다. 색이 아니라 **길이**가
                판정을 나르는 것도 그대로다 — 흑백으로 찍어도 읽힌다. */}
            {p.kind === "DOCTOR" && <FatigueBar fatigue={p.fatigue ?? 0} />}
            {/* 휴식·식사 글리프 — 책상을 비운 의사가 아무 표시 없이 걸어가면 화면에서는 그냥
                **의사가 사라진 것**으로 보인다("왜 진료를 안 하지"). 휴게실·식당을 지은 보람이
                여기 있다: 걷는 동안에도 글리프가 붙어 있어 왕복에 걸리는 시간이 눈에 보인다.
                표시 판정은 simHud.doctorActivityMark(단일 출처)가 하고 여기선 놓기만 한다. */}
            {activityMark && (
              <span
                className="pointer-events-none absolute -right-1 -top-1 font-mono text-[8px] leading-none text-on-desk"
                style={{ textShadow: "0 0 2px var(--desk)" }}
                title={activityMark.label}
              >
                {activityMark.glyph}
              </span>
            )}
          </div>
          );
        })}

        {/* 건설 미리보기 — 지금 손을 떼면 **정확히 어느 칸이** 생기고 사라지는지. 거부되면 붉게
            남아 사유 토스트와 짝이 된다. 타일 단위인 이유는 위 BuildPreview 주석에 있다. */}
        {preview?.tiles.map((t) => (
          <div
            key={`pv${t}`}
            className="pointer-events-none absolute"
            style={{
              left: (t % GRID_W) * TILE,
              top: Math.floor(t / GRID_W) * TILE,
              width: TILE,
              height: TILE,
              backgroundColor: preview.ok ? "rgba(216,207,175,0.22)" : "rgba(229,72,77,0.28)",
              boxShadow: `inset 0 0 0 1px ${preview.ok ? "var(--on-desk-muted)" : "var(--alarm)"}`,
              zIndex: 3,
            }}
            aria-hidden
          />
        ))}
        {preview && preview.tiles.length > 0 && (
          <span
            className="pointer-events-none absolute whitespace-nowrap font-mono text-[10px] tabular-nums"
            style={{
              // 대상 타일의 좌상단 — 인덱스 최소값이 곧 그 자리다(regions.id와 같은 규약).
              left: (Math.min(...preview.tiles) % GRID_W) * TILE,
              top: Math.floor(Math.min(...preview.tiles) / GRID_W) * TILE - 14,
              color: preview.ok ? "var(--on-desk)" : "var(--alarm)",
              zIndex: 4,
            }}
          >
            {preview.label}
          </span>
        )}
      </div>

      {/* 줌 버튼 — **터치·트랙패드 사용자의 유일한 줌 수단**이라 필수다(휠이 없는 손이 있다).
          ⌂는 zoom 1 복귀: 배수의 역수를 한 번 태우면 클램프가 중앙 정렬까지 해 준다.
          ponytail: 핀치 줌은 안 넣었다 — 포인터 두 개를 추적하는 상태가 통째로 필요하고 이 버튼이
          같은 일을 한다. 터치 사용자가 확대를 자주 쓴다는 신호가 오면 그때 붙인다. */}
      <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
        {[
          { label: "+", title: "확대", run: () => zoomBy(1.4) },
          { label: "⌂", title: "부지 전체 보기", run: () => setCam((c) => zoomedCamera(c, safeCenter, 1 / c.zoom, safe, BASE, fit)) },
          { label: "−", title: "축소", run: () => zoomBy(1 / 1.4) },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onClick={b.run}
            className="h-7 w-7 border border-frame bg-desk-2/80 font-mono text-sm text-on-desk-muted backdrop-blur-sm transition-colors hover:border-on-desk-muted hover:text-on-desk"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
