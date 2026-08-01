"use client";

import {
  useCallback,
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
import Backdrop from "./Backdrop";
import {
  BedSprite,
  ChairSeatFrontSprite,
  ChairSprite,
  CounterSprite,
  DeskSprite,
  DoctorSprite,
  DEPT_COLOR,
  LyingPatientSprite,
  NurseSprite,
  PatientSprite,
} from "./PixelSprite";
import {
  BACKDROP_MARGIN,
  busyDoctorIds,
  doctorActivityMark,
  doctorRoomlessMark,
  fatigueTone,
  FATIGUE_COLOR,
  openingZoom,
  pannedCamera,
  roomLabel,
  safeArea,
  settledCamera,
  tileFromPoint,
  zoomedCamera,
  type Camera,
  type CameraView,
  type Insets,
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

/** 배경이 부지 밖으로 뻗는 여백(px) — 타일 값은 simHud(BACKDROP_MARGIN)가 소유하고 여기선 TILE만 곱한다.
 *  카메라는 이 사각형 밖(= 페이지 공백)을 화면에 들이지 않는다(simHud.zoomFloor·clampCamera). */
const MARGIN: Size = { w: BACKDROP_MARGIN.x * TILE, h: BACKDROP_MARGIN.y * TILE };

/** 인셋 기본값(바 없음) — 모듈 상수라 렌더마다 새 객체가 생기지 않는다. */
const NO_INSETS: Insets = { top: 0, left: 0 };

/** 이만큼 안 움직였으면 팬이 아니라 **클릭**이다(px). 손가락·트랙패드는 누르는 동안 몇 px씩
 *  흔들리므로 0으로 두면 클릭이 거의 성립하지 않고, 크게 두면 짧은 팬이 폰 선택으로 새어 나간다. */
const CLICK_SLOP = 5;

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
  /** 카메라 산술의 입력 한 벌. 낱개 state로 쪼개면 리사이즈 중간에 fit만 새 값이고 host는 옛 값인
   *  프레임이 생겨, 그 한 프레임 동안 클램프가 엉뚱한 화면을 기준으로 돈다. */
  const [view, setView] = useState<CameraView>({
    host: { w: 0, h: 0 }, safe: { x: 0, y: 0, w: 0, h: 0 }, base: BASE, margin: MARGIN, fit: 1,
  });
  const [cam, setCam] = useState<Camera>({ zoom: 1, x: 0, y: 0 });
  /** 플레이어가 카메라를 **한 번이라도** 건드렸는가. 그전까지는 측정이 갱신될 때마다 시작
   *  프레임을 다시 앉힌다.
   *  ⚠️ **「첫 측정 때만」으로는 안 된다**: `insets`는 부모(SimGame)가 effect에서 재는데 React가
   *  자식 effect를 먼저 돌려, 이 컴포넌트의 첫 측정은 **언제나 인셋 0**인 상태로 일어난다.
   *  그 시점의 안전 영역은 실제와 달라 배율이 어긋난다(1440×900에서 0.923이어야 할 값이 0.889).
   *  건드림을 기준으로 두면 인셋이 뒤늦게 도착해도 첫 프레임이 의도한 그림으로 맞춰진다. */
  const touched = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (width: number, height: number) => {
      const host: Size = { w: width, h: height };
      // 안전 영역 — 상단 바가 위를, 도구 패널이 왼쪽을 덮는다(아래·오른쪽은 비어 있다).
      const s = safeArea(host, { top: insetTop, left: insetLeft });
      if (s.w <= 0 || s.h <= 0) return; // 아직 배치 전(또는 바가 화면을 다 먹은 극단) — 접으면 맵이 사라진다
      const next: CameraView = { host, safe: s, base: BASE, margin: MARGIN, fit: Math.min(s.w / BASE.w, s.h / BASE.h) };
      setView(next);
      /* 리사이즈: **zoom은 유지하고 다시 앉히기만** 한다 — 창을 줄였다고 플레이어가 당겨 둔
         배율까지 되돌리면 조작이 사라진다. 다만 창을 **키우면** 옛 배율이 새 하한 아래로 떨어질
         수 있어(배경이 화면보다 작아진다) settledCamera가 하한으로 받친다.
         ponytail: 보던 **중심 유지**는 안 한다 — 창 크기를 바꾸면 화면이 조금 밀린다. 필요해지면
         리사이즈 직전 중심을 앵커로 zoomedCamera(factor 1)를 한 번 태우면 된다. */
      /* 건드리기 전이면 **시작 배율로 다시 앉힌다**. 건드린 뒤에는 옛 계약 그대로 줌을 유지하고
         하한만 받친다 — 창을 줄였다고 플레이어가 당겨 둔 배율까지 되돌리면 조작이 사라진다. */
      setCam((c) => settledCamera(touched.current ? c : { ...c, zoom: openingZoom(next) }, next));
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
  /** 밖으로 나가는 setter는 **건드림을 표시하는 래퍼**다 — 휠·줌 버튼·⌂·팬이 전부 이 반환값을
   *  쓰므로 호출부를 하나도 안 고쳐도 표시된다(위 `measure`만 원본 setter를 쓴다).
   *  ⚠️ `useCallback`이 필수다: 휠 효과의 deps가 `[view, setCam]`이라, 매 렌더 새 함수가 되면
   *  네이티브 리스너를 렌더마다 떼었다 붙인다. */
  const setCamByUser = useCallback<typeof setCam>((update) => {
    touched.current = true;
    setCam(update);
  }, []);
  return { cam, setCam: setCamByUser, view };
}

/**
 * 방 타입별 바닥·벽 색. **밝은 병원 톤의 저채도 계열**(2026-07-31 아트 디렉션 전환 — 옛 값은
 * 지면 팔레트에서 파생한 어두운 계열이었다). 밝기는 올렸지만 방끼리의 대조는 여전히 낮게 유지한다 —
 * 사람(스프라이트)이 시선을 먼저 받아야 하므로 색상(hue)만 갈리고 휘도는 바닥 218.7~219.7 ·
 * 벽 229.1~230.6에 모여 있다. **이 값은 이제 각 표면이 도달할 수 있는 최댓값이기도 하다** —
 * 조명 계수가 1을 안 넘으므로(아래 `SHADE`) 화면의 어떤 픽셀도 알베도보다 밝아지지 않는다.
 * 원시 유틸(zinc/emerald…) 대신 리터럴 hex를 쓰는 건 PixelSprite·HospitalMap과 같은 **회화 레이어**의 관례다.
 */
export const ROOM_STYLE: Record<RoomType, { floor: string; wall: string }> = {
  EXAM: { floor: "#d1dee0", wall: "#e1e8e9" },
  WARD: { floor: "#dcd9e8", wall: "#e6e4ee" },
  WAITING: { floor: "#e0dbd0", wall: "#e9e6de" },
  LOUNGE: { floor: "#d3dfd5", wall: "#e0e8e1" },
  RECEPTION: { floor: "#e3d9d7", wall: "#ece4e2" },
  // 식당 — 휴게실(녹)의 이웃 색조(황록). 두 방은 같은 "쉬는 곳"이라 계열을 붙이되, 한 화면에
  // 나란히 서도 구별되게 색상만 옮긴다. `Record<RoomType, …>`이라 이 줄이 없으면 tsc가 막는다.
  CAFETERIA: { floor: "#dedccc", wall: "#e8e7db" },
};

/**
 * 타일에 곱하는 **조명·AO 계수**의 상수 한 벌 — 알베도(위 팔레트)와 최종 픽셀 사이의 유일한 통로다.
 *
 * `base`에서 출발해 방 중심 쪽으로 `pool`만큼 올라가고, 벽에 닿은 변마다 `ao`만큼 내려간 뒤
 * `[min, max]`로 잠긴다. **부지(마당)는 계수를 안 받는다** — 실외 조명은 배경 캔버스가 자기 안에서
 * 지고 있고(Backdrop의 발광 패스), 여기서 또 곱하면 「배경 < 부지」 서열의 기준선이 흔들린다.
 *
 * ⚠️ **`max`가 1.0인 것이 이 표의 핵심이다 — 조명은 밝히지 않고 그늘만 진다**(2026-07-31).
 * 옛 표(max 1.2)는 *어두운 알베도를 밝혀서 조명을 만든다*는 전제 위에 있었다. 밝은 병원 톤으로
 * 옮기면서 그 전제가 무너졌다: 휘도 219를 20% 밝히면 조명이 아니라 그냥 흰색이 된다(실측 #fdffff —
 * 방 색이 사라진다). 곱셈 모델은 밝은 알베도에서 **바닥과 천장을 동시에 뚫는다** — 같은 계수 폭이
 * 어두운 팔레트에서는 휘도 몇 점이지만 220대에서는 ∓35 / +44점이라, 최암부는 마당 아래로 내려가고
 * 최명부는 포화 한계를 넘는다. 두 요구를 겹치면 실제로 **해가 없었다**(`floor > 마당/min` ∧
 * `wall < 235/max` ∧ `wall > floor`가 공집합 — 어떤 색을 골라도 못 맞춘다).
 * 그래서 계수 범위를 통째로 아래로 옮겼다: **알베도가 곧 가장 밝은 상태**이고, 조명 웅덩이는
 * "더 밝음"이 아니라 **"그늘이 덜함"**이다. 밝은 표면에서 깊이를 내는 것은 밝히기가 아니라 그늘이다.
 * `base + pool = max`라는 관계는 그대로다(옛 표도 0.94 + 0.26 = 1.2였다).
 *
 * ⚠️ `min`은 여전히 이 표의 위험한 값이다: 이걸 낮추면 방 구석이 마당보다 어두워져 "실내가 실외보다
 * 어둡다"가 최종 픽셀에서 뒤집힌다(팔레트 리터럴 검사는 그걸 통과시킨다 — backdropPalette.test.ts의
 * shade describe가 잠근다). 지금 여유는 최암부 183.6~185.4 vs 마당 176.0 = 7.6~9.4다
 * (7개 스타일 전수 — 6개 방 + `NEUTRAL_STYLE`. NEUTRAL을 빼고 세면 상한이 185.0으로 어긋난다).
 *
 * ⚠️⚠️ **이 표의 값은 전부 계수(factor)라, 화면 효과가 알베도 대역에 비례한다** — 같은 숫자가 어두운
 * 팔레트와 밝은 팔레트에서 다른 그림을 그린다. 알베도가 100 → 219로 갔으므로 **모든 factor 상수의
 * 화면 효과가 2.2배**가 됐다. 2026-07-31 전환에서 이걸 **두 번** 밟았다:
 *   ① `max` 1.2 — 어두울 땐 조명이던 것이 밝은 알베도에서는 포화(#fdffff)가 됐다(위 문단).
 *   ② `ao`·`checker` — 크기를 안 건드렸는데 화면 효과만 2.2배가 됐고, 동시에 `base`−`min` 여유가
 *      0.10 → 0.04로 줄어 **벽 한 면에서 곧장 `min`에 클램프**됐다. AO 계조가 4단(94/90/86/84)에서
 *      2단(193/184/184/184)으로 무너져 구석이 가장자리보다 깊어 보이지 않았다. 테스트 49건이
 *      전부 초록인 채로 통과했다 — `ao`·`checker`의 **크기**를 재는 단언이 없었기 때문이다(지금은 있다).
 * **교훈: 팔레트 대역을 옮기면 이 표의 숫자도 함께 재산정한다.** 서열·상한 같은 관계식만 보고
 * 통과시키면 안 된다 — 관계는 그대로여도 화면에 나가는 양이 배로 달라진다. 옮길 때 기준은 factor가
 * 아니라 **휘도 점수**로 잡는다(그게 눈이 보는 단위다).
 */
export const SHADE = { min: 0.84, base: 0.90, max: 1.0, pool: 0.10, ao: 0.02, checker: 0.008 } as const;

/** 벽 한 칸에서 **윗면(캡)이 차지하는 px** — 16px 타일의 5px(≈31%). 두께가 읽히는 최소치이고,
 *  더 키우면 통행 가능한 칸처럼 넓어 보인다(벽은 한 칸을 통째로 막는다는 규칙이 흐려진다). */
const CAP_PX = 5;

/** 벽 세 단의 계수 — 캡은 `factor` 그대로(그 방에서 가장 밝은 면), 몸통·밑동은 그 아래로 내려간다.
 *  0.90/0.78은 단 간격을 저울질해 고른 값이다(factor 0.84에서 캡−몸통 19.8점 · 몸통−밑동 23.0점,
 *  factor 1.0에서 22.8 · 27.8). 0.88로 내리면 윗면 하이라이트가 접지 그늘보다 커져(23.8 > 19.0)
 *  무게가 뒤집히고, 0.92로 올리면 캡−몸통이 15.8점으로 눌려 캡이 몸통에 붙는다.
 *  ⚠️ 이 둘도 factor라 **알베도 대역이 바뀌면 화면 효과가 같이 변한다**(SHADE 주석의 교훈). */
const WALL_BODY = 0.9;
const WALL_FOOT = 0.78;

/**
 * 알베도 hex에 계수를 곱한다 — 채널 선형 스케일이라 **색조가 보존된다**(휘도만 움직인다).
 *
 * 계수 1에서 입력을 그대로 돌려주는 것이 계약이다: 조명이 없는 자리가 알베도와 달라지면
 * 팔레트를 잠근 테스트가 화면과 무관한 말을 하게 된다.
 */
export function shade(hex: string, factor: number): string {
  if (factor === 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

/**
 * 벽 한 칸의 **세 단**(캡 = 윗면 / 몸통 = 벽면 / 밑동 = 바닥과 만나는 그늘)을 한 번에 낸다.
 *
 * ⚠️ **캡을 밝히지 않고 몸통을 어둡게 해서 두께를 만든다** — `SHADE`가 "밝은 알베도에서는 밝히지 않고
 * 그늘로 깊이를 만든다"로 간 것과 **같은 원칙을 벽에도 적용**한 것이다. 옛 판은 캡을
 * `min(SHADE.max, factor + 0.16)`으로 올렸는데, `factor ≤ 1.0`이고 `max = 1.0`이라 **덧셈이 항상
 * 잘려 캡이 상수가 됐다**(7개 스타일 × factor 0.84/0.90/1.0에서 캡 hex가 전부 동일). 그러면 바로 위
 * `neighborOf`가 계수를 넘기는 이유 — *먼 구석의 벽이 광원 아래 벽과 똑같이 밝으면 깊이가 사라진다* —
 * 가 통째로 무효가 된다. 지금은 세 단이 전부 `factor`에 비례해 함께 움직인다(캡의 factor 변동폭 36.8점).
 *
 * 이건 이 전환에서 **세 번째로 같은 근인**이다 — factor 상수(`+0.16`)를 알베도 대역이 바뀐 뒤에도
 * 그대로 뒀다. `backdropPalette.test.ts`가 캡이 factor를 따라가는지 단언한다.
 */
export function wallBands(wall: string, factor: number) {
  return {
    cap: shade(wall, factor),
    body: shade(wall, factor * WALL_BODY),
    foot: shade(wall, factor * WALL_FOOT),
  };
}

/** 부지 바닥(방 밖) — 복도이자 마당. **화면 전체의 배경이기도 하다**(SimGame): 맵 둘레의 여백이
 *  같은 색이라야 부지가 화면 밖으로 이어지는 것으로 보이고, HUD가 그 위에 뜬 패널로 읽힌다.
 *
 *  ⚠️ **이 값은 배경(`Backdrop`)의 천장이다.** 옛 #0d0d11(휘도 13.29)에서는 배경이 쓸 대역이
 *  5~13뿐이라 지면·건물·물의 층위가 인지되지 않았다(실측: 해안·대로변 상단이 균일한 검정).
 *  20.4 → 71.3(2026-07-30)으로 두 번 올려 대역을 넓혔고, **네 번째로 176.0까지 올렸다**(2026-07-31):
 *  앞의 셋은 어두운 화면 안에서 대역을 짜내는 싸움이었고, 이번은 화면 전체를 밝은 병원 톤으로
 *  옮기는 아트 디렉션 전환이다 — 배경 팔레트가 먼저 ×2.4로 올라와(랜드마크 평균 142.8) 부지가
 *  그 위에 서려면 천장도 같이 가야 했다. 바꿀 땐 `backdropPalette.test.ts`가 양쪽(배경 < 부지 < 실내)을 잠근다.
 *
 *  ⚠️ 이 값은 위아래로 **동시에** 끼여 있다: 아래로는 배경 랜드마크(142.8)와 30 이상 벌어져야 하고,
 *  위로는 방 바닥의 **최암부**(바닥 × `SHADE.min`)보다 낮아야 한다. 올릴 땐 실내와 조명 계수를 같이
 *  본다 — 부지만 올리면 실내가 마당보다 어두워지는 반대편 회귀가 열린다. */
export const OUTSIDE_FLOOR = "#abb1b5";
/** 격자 — 타일 경계를 겨우 읽을 만큼만. **밝은 선에서 어두운 이음매로 뒤집혔다**: 부지가 20.4일 때는
 *  밝은 선(216,207,175)만이 대비를 낼 수 있었지만, 71.3부터는 같은 선이 바닥을 하얗게 들어 올린다.
 *  콘크리트 슬래브의 줄눈처럼 어두운 쪽이 자연스럽다. **알파는 바닥 밝기에 반비례해야 한다** —
 *  같은 어두운 선이 176.0짜리 밝은 바닥 위에서는 훨씬 진하게 보여 격자가 화면을 지배하므로,
 *  부지를 71.3 → 176.0으로 올리면서 0.16 → 0.10으로 낮췄다(합성 대비 ΔL/L ≈ 9%). */
const GRID_LINE = "rgba(10,8,18,0.10)";

/** 어느 영역에도 안 닿은 벽의 색. 벽을 세웠지만 아직 무슨 방인지 안 정한 상태가 화면에
 *  **보여야** 한다 — 안 그리면 플레이어는 벽이 안 세워진 줄 안다(설계 PR 2의 도구 흐름).
 *  부지를 176.0으로 올렸으니 이쪽도 같이 올라간다(220/228) — 한쪽만 옮기면 "실내가 마당보다 어둡다"로 뒤집힌다. */
export const NEUTRAL_STYLE = { floor: "#d7dde4", wall: "#e0e5ea" };

/** 진료실 바닥에 얹는 과 색의 알파 — 8자리 hex의 끝 두 자리(0x24 ≈ 14%).
 *  옛 렌더가 별도 오버레이 div에 `opacity: 0.14`로 주던 값과 같은 농도이고, 타일당 div를
 *  하나로 유지한다(영역은 임의 모양이라 사각형 오버레이를 덮을 수 없다). */
const DEPT_TINT_ALPHA = "24";

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
  /** 지금 카드가 떠 있는 폰 — 그 아바타에 선택 링이 붙는다. 판정은 부모가 갖는다(SimGame.inspectId). */
  selectedId?: string;
  /** 영역 오버레이(과 색 틴트 + 방 이름표)를 그리는가. **기본은 안 그린다** — 판정은 부모가
   *  소유한다(`simHud.regionOverlayOn`: 토글 + 용도 도구). 여기선 그릴지 말지만 받는다. */
  regionOverlay?: boolean;
  /** 오버레이 버튼을 눌렀다 — 버튼이 **줌 버튼 옆**에 사는 것은 둘 다 "무엇을 보는가"라서다
   *  (판을 바꾸는 행동은 좌측 패널에 있다 — SimGame의 관통 규칙). */
  onToggleRegionOverlay?: () => void;
  onTileDown?: (t: { x: number; y: number }) => void;
  onTileMove?: (t: { x: number; y: number }) => void;
  /** **팬이 아니라 클릭**이었다 — 주버튼을 누른 자리에서 `CLICK_SLOP` 안에서 뗐다는 뜻이다.
   *  도구를 들었을 땐 오지 않는다(그 클릭은 건설이다 — `buildReady` 경로가 먼저 가져간다). */
  onTileClick?: (t: { x: number; y: number }) => void;
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
  selectedId,
  regionOverlay = false,
  onToggleRegionOverlay,
  onTileDown,
  onTileMove,
  onTileClick,
  onTileUp,
  onTileCancel,
}: TileMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { cam, setCam, view } = useCamera(hostRef, insets.top, insets.left);
  const scale = view.fit * cam.zoom;

  /* 팬 중인 포인터와 직전 위치 — **상태가 아니라 ref**다: 드래그 한 프레임마다 리렌더를 유발하면
     수백 개 타일 div가 딸려 오고, 무엇보다 다음 델타는 *직전 이벤트*에서 오지 렌더에서 오지 않는다.
     `sx`·`sy`는 **누른 자리**라 팬 중에도 안 움직인다(x·y는 매 move마다 갈린다) — 손을 뗄 때
     이 둘과의 거리로 "밀었나 눌렀나"를 가른다. `click`은 주버튼이었는가다(중·우클릭은 순수 팬). */
  const panRef = useRef<{ id: number; x: number; y: number; sx: number; sy: number; click: boolean } | null>(null);
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
      setCam((c) => zoomedCamera(c, { x: e.clientX - r.left, y: e.clientY - r.top }, factor, view));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [view, setCam]);

  /** 줌 버튼 한 번 — 앵커는 **안전 영역의 중앙**이다(커서가 없는 조작이라 중앙이 유일하게 뜻을
   *  갖고, 지금 보이는 곳의 중앙은 뷰포트 중앙이 아니라 상단 바·좌측 패널을 뺀 구간의 중앙이다). */
  const safeCenter = { x: view.safe.x + view.safe.w / 2, y: view.safe.y + view.safe.h / 2 };
  const zoomBy = (factor: number) => setCam((c) => zoomedCamera(c, safeCenter, factor, view));

  /* 앉아 있는 폰을 몇 px 들어 올린다. 시뮬에서 "앉는다"는 의자 타일에 서는 것인데
     (world.blocksWalk), 폰과 의자가 같은 16px 칸을 쓰므로 그냥 겹쳐 그리면 **선 것과 구별되지
     않는다** — 기능은 들어갔는데 화면은 그대로인, 사용자가 처음 신고한 그 모습이다.
     ⚠️ 이 4px이 하는 일은 인물이 3/4 시점이 된 뒤로(2026-07-31) 바뀌었다. 옛 주석은
     *"의자 스프라이트의 아랫단(좌석 앞면·다리)이 폰 밑으로 드러난다"*고 적었는데, 3/4 인물은
     몸이 커져 **의자가 검은 후광 정도로만 남아** 더 이상 참이 아니다. 지금 이 들어올림은
     **밑단을 좌면 뒤로 넣는** 역할이다 — 가운 앞섶 밑단이 타일 로컬 15.6이고 좌면 앞단 띠가
     10.6~13.4라, 4를 올리면 밑단 11.6이 띠에 완전히 물리고 0이면 **2.2단위가 띠 아래로
     삐져나와** 옷자락과 의자 다리가 좌면 밑에 드러나 "앉음"이 깨진다.
     ⚠️ *머리를 좌면 위로 빼는* 역할이 아니다(2026-07-31 실측으로 정정). 머리 타원은
     cy4·ry3.1이라 y0.9~7.1이고 띠보다 3.5단위 위라 **lift가 0이어도 가려질 수 없다** —
     lift 4 / lift 0 / 오버레이 없음을 10배로 나란히 렌더해 확인했다.
     앉음을 실제로 읽히게 하는 것은 아래 폰 루프 뒤의 좌면 앞단 레이어이고(그쪽 주석이 왜
     좌면 "앞단만"인지의 단일 출처), 둘은 짝이라 한쪽만 두면 다시 안 읽힌다. */
  const SEAT_LIFT = TILE / 4;
  /* 의자 타일 → 그 의자의 변종. 건설로만 갈리는 값이라 `world.furniture` identity에 memo를 건다
     (지형 memo와 같은 계약: 폰이 매 프레임 움직여도 이 집합을 다시 만들지 않는다).
     ⚠️ **Set이 아니라 Map인 이유**: 아래 좌면 앞단 층이 변종별로 다른 도형을 깔아야 하는데,
     좌표만 담으면 그 정보가 여기서 소실돼 앉은 소파 위에 플라스틱 의자의 좌면이 얹힌다(에러 없음). */
  const seatTiles = useMemo(
    () =>
      new Map(
        world.furniture
          .filter((f) => f.kind === "CHAIR")
          .map((f) => [`${f.x},${f.y}`, f.variant] as const),
      ),
    [world.furniture],
  );
  /* 침대 타일 — 의자와 같은 이유의 같은 집합이다. 시뮬에서 "눕는다"도 그 칸에 서는 것이라
     (world.blocksWalk에 침대가 합류한 뒤로) **화면이 눕혀 그리지 않으면 서 있는 것과 구별되지
     않는다** — 사용자 보고 *"응급 환자가 침대에 눕지 않고 옆에 서 있다"*를 고친 자리가 시뮬과
     이 두 곳이고, 한쪽만 가면 고치기 전과 같아 보인다. */
  const bedTiles = useMemo(
    () => new Set(world.furniture.filter((f) => f.kind === "BED").map((f) => `${f.x},${f.y}`)),
    [world.furniture],
  );
  /* 지금 누가 누워 있는 침대 — 매트리스 색이 갈린다(BedSprite.occupied). 누운 환자 그림은 좌우로
     절반쯤만 덮으므로(침대 폭 13.6 중 몸통 7.25) 이 단서는 **좌우 각 2.2단위 띠**로 남는다.
     회전·축소가 걸리는 쪽은 전용 그림이 없는 폰뿐이다(아래). */
  const occupiedTiles = useMemo(
    () => new Set(world.pawns.map((p) => `${p.x},${p.y}`)),
    [world.pawns],
  );

  // 진료 중인 의사 — 환자의 doctorId가 "바쁨"의 단일 출처다(patientFlow와 같은 규칙).
  // 집합을 만드는 식 자체도 simHud가 든다: 인사 패널이 태업 판정에 같은 집합을 쓰므로
  // 여기서 따로 적으면 두 화면이 각자의 "바쁨"을 갖게 된다.
  const busyDoctors = busyDoctorIds(world.pawns);

  /*
    지형 — 벽·문·영역을 **타일 단위**로 그린다. 사각형 방(world.rooms)을 그리던 자리이고,
    바뀐 이유는 규칙이 이미 영역을 보기 때문이다: 화면이 사각형을 계속 그리면 벽이 뚫린 방을
    멀쩡한 방으로 보여 주고("왜 환자가 안 오지"), 자유 벽(설계 PR 2)은 아예 안 보인다.

    memo 키가 walls·doors·zones **셋뿐**인 것이 성능 계약이다 — 이 셋은 건설에서만 새 객체로
    갈리므로, 폰이 매 프레임 움직여도 수백 개의 타일 div가 다시 만들어지지 않는다.
    벽·문이 키에 남는 이유는 **지형(벽·문 렌더)** 때문이지 영역 때문이 아니다: 영역 파생의
    키는 이제 `zones` 하나다(computeRegions가 그 필드만 받는다 — regions.ts 주석).
  */
  const { walls, doors, zones } = world;
  const { terrain, roomCount } = useMemo(() => {
    const regions = computeRegions({ zones });
    // 타일 → 그 타일을 담은 영역. 벽·문의 색을 이웃 영역에서 빌려 올 때 쓴다.
    const regionAt = new Map<number, Region>();
    for (const r of regions) for (const t of r.tiles) regionAt.set(t, r);
    /** 이 타일에 닿은 첫 영역 — 벽 하나가 두 방 사이에 서면 먼저 만난 쪽을 따른다(둘 다 그릴
     *  수는 없다). 어느 영역에도 안 닿았으면 중립색이다 — **용도 없는 영역은 이제 없다**
     *  (칠한 타일에서만 성분이 나온다 — regions.ts).
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
    /** 4방만 — AO는 **맞닿은 벽**만 센다(대각 벽은 그늘을 안 만든다). 위 배열의 앞 4칸이 곧 그것이라
     *  따로 적지 않는다: 두 곳에 적으면 한쪽 순서를 고치는 날 조용히 갈린다. */
    const SIDES = AROUND.slice(0, 4);
    /**
     * 타일마다의 조명·AO 계수 — **한 숫자가 조명과 앰비언트 오클루전을 함께 나른다.**
     *
     * 방 중심에 광원 하나를 놓고(천장등) 거리에 따라 떨어뜨린 뒤, 벽에 닿은 변마다 한 단 어둡게 한다.
     * 별도 오버레이 레이어(`mix-blend-mode`)를 쓰지 않는 것이 계약이다: 오버레이는 폰 위의 판독용
     * 표시(선택 링·피로 막대·글리프)까지 같이 눌러 어둡게 만들고, z 순서 싸움이 붙는다. 계수를
     * 색에 미리 곱해 두면 DOM이 한 겹도 안 늘고 HUD는 손댈 필요가 없다.
     *
     * 폰은 계수를 안 받는다 — 사람이 시선을 먼저 받아야 한다는 이 파일의 기존 규칙(ROOM_STYLE 주석)이
     * 그대로 이유다: 어두운 구석의 환자가 배경에 묻히면 "몇 명이 밀려 있나"를 못 읽는다.
     */
    const factorOf = new Map<number, number>();
    for (const r of regions) {
      // 중심 — 타일 좌표 평균. 오목한 방이면 중심이 벽 위에 앉을 수 있지만 쓰는 것은 거리뿐이라 무해하다.
      let sx = 0, sy = 0;
      for (const t of r.tiles) { sx += t % GRID_W; sy += Math.floor(t / GRID_W); }
      const n = r.tiles.size;
      const cx = sx / n, cy = sy / n;
      // 반경 — 면적에서 파생. 큰 방은 천장등이 여러 개인 셈이라 광원 하나를 넓게 퍼뜨린다.
      const rad = Math.max(2.2, Math.sqrt(n) * 0.75);
      for (const t of r.tiles) {
        const x = t % GRID_W, y = Math.floor(t / GRID_W);
        const pool = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / rad);
        let sides = 0;
        for (const [dx, dy] of SIDES) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
          if (walls.has(ny * GRID_W + nx)) sides++;
        }
        // 체커 — 장판 이음매의 홀짝. 재질감을 만드는 가장 싼 수단이고 계수 안에 얹혀 DOM이 안 는다.
        const checker = (x + y) & 1 ? SHADE.checker : -SHADE.checker;
        const f = SHADE.base + SHADE.pool * pool - SHADE.ao * sides + checker;
        factorOf.set(t, Math.max(SHADE.min, Math.min(SHADE.max, f)));
      }
    }

    /** 이 타일이 빌려 쓸 이웃의 **색과 계수** — 계수를 함께 넘겨야 벽이 자기 방의 밝기를 따라간다
     *  (벽마다 같은 값을 주면 먼 구석의 벽이 광원 아래 벽과 똑같이 밝아 깊이가 사라진다). */
    const neighborOf = (t: number): { style: { floor: string; wall: string }; factor: number } => {
      const x = t % GRID_W;
      const y = (t - x) / GRID_W;
      for (const [dx, dy] of AROUND) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const nt = ny * GRID_W + nx;
        const r = regionAt.get(nt);
        if (r) return { style: ROOM_STYLE[r.type], factor: factorOf.get(nt) ?? SHADE.base };
      }
      return { style: NEUTRAL_STYLE, factor: SHADE.base };
    };
    const at = (t: number) => ({ left: (t % GRID_W) * TILE, top: Math.floor(t / GRID_W) * TILE });

    const nodes: ReactNode[] = [];
    // ① 바닥 — 영역 타일마다 한 칸. 진료실은 과 색을 옅게 얹는다(색 단독 신호 금지: 같은 조건에서
    //    켜지는 아래 라벨이 과 이름을 함께 쓴다 — 옛 렌더에서 이어받은 관통 규칙).
    //
    //    ⚠️ **바닥색 자체는 오버레이를 안 탄다** — 방 색(#16232a 계열)은 바깥(#0d0d11)과 겨우
    //    구별되는 농도라 "여기는 실내다"만 나르고, 그건 주석이 아니라 건물의 일부다. 오버레이가
    //    감추는 것은 그 위에 얹힌 **판독용 표시**(과 색·이름표)뿐이다.
    for (const r of regions) {
      const style = ROOM_STYLE[r.type];
      const tint =
        regionOverlay && r.type === "EXAM" && r.dept ? `${DEPT_COLOR[r.dept]}${DEPT_TINT_ALPHA}` : null;
      for (const t of r.tiles) {
        const f = factorOf.get(t) ?? SHADE.base;
        nodes.push(
          <div
            key={`f${t}`}
            className="pointer-events-none absolute"
            style={{
              ...at(t),
              width: TILE,
              height: TILE,
              backgroundColor: shade(style.floor, f),
              // 과 색은 배경 **위에** 한 겹 더 — 단색 그라디언트라 오버레이 div가 필요 없다.
              backgroundImage: tint ? `linear-gradient(${tint}, ${tint})` : undefined,
              // 줄눈 — 오른·아래 한 픽셀. 격자선이 부지에만 깔려 있어 방 안은 이음매가 없었다.
              boxShadow: "inset -1px -1px 0 rgba(10,8,18,0.13)",
            }}
            aria-hidden
          />,
        );
      }
    }
    // ② 벽 — 타일 한 칸을 통째로 채운다(옛 렌더의 inset 그림자와 같은 두께). 얇은 선으로 그리면
    //    안쪽이 실제보다 넓어 보여, 왜 여기 못 서는지 설명이 안 된다.
    //
    //    **한 칸 안에서 위→아래로 캡·몸통·밑동 세 단**을 준다. 탑다운에서 두께를 만드는 값싼 수단이고
    //    (캡 = 벽의 윗면, 몸통 = 벽면, 밑동 = 바닥과 만나는 그늘), 남쪽이 트인 벽은 아래 칸으로
    //    낙영까지 떨군다. 낙영을 **남쪽이 벽이 아닐 때만** 그리는 것이 계약이다: 벽줄 안쪽에 그리면
    //    다음 벽이 덮을지 말지가 Set의 순회 순서(건설 순서)에 달려 화면이 판마다 달라진다.
    for (const t of walls) {
      const { style, factor } = neighborOf(t);
      const { cap, body, foot } = wallBands(style.wall, factor);
      const southOpen = !walls.has(t + GRID_W);
      nodes.push(
        <div
          key={`w${t}`}
          className="pointer-events-none absolute"
          style={{
            ...at(t),
            width: TILE,
            height: TILE,
            backgroundImage: `linear-gradient(180deg, ${cap} 0 ${CAP_PX}px, ${body} ${CAP_PX}px ${TILE - 3}px, ${foot} ${TILE - 3}px)`,
            boxShadow: southOpen ? "0 3px 5px -1px rgba(8,6,16,0.55)" : undefined,
          }}
          aria-hidden
        />,
      );
    }
    // ③ 문 — 벽줄을 끊는 바닥 칸. 통행이 전부 여기를 지나므로 벽과 확실히 달라 보여야 한다.
    for (const t of doors) {
      const { style, factor } = neighborOf(t);
      nodes.push(
        <div
          key={`d${t}`}
          className="pointer-events-none absolute"
          style={{
            ...at(t),
            width: TILE,
            height: TILE,
            backgroundColor: shade(style.floor, factor),
            // 문틀 — 아래에 벽색 두 줄. 위쪽 그늘은 문이 벽줄에 파인 자리임을 말한다.
            boxShadow: `inset 0 -2px 0 ${shade(style.wall, factor)}, inset 0 3px 4px -2px rgba(8,6,16,0.6)`,
          }}
          aria-hidden
        />,
      );
    }
    // ④ 라벨 — 영역 id가 곧 성분의 최소 타일 인덱스라(regions.ts) 왼쪽 위 칸에 선다. 옛 렌더가
    //    (방 좌상단 + 1칸)에 놓던 그 자리다(벽이 테두리라 내부 좌상단 = 최소 인덱스).
    //
    //    이름표에 **바탕과 z**를 준 것은 방이 이름보다 좁기 때문이다: 3칸(48px) 방에 「진료실 ·
    //    미용·피부」가 90px로 서면 옆방까지 넘어가 이름 여럿이 한 덩어리로 뭉갠다. 바탕이 있으면
    //    적어도 맨 위 하나는 읽힌다(겹침 자체는 방 폭이 정하는 값이라 여기서 못 없앤다).
    if (regionOverlay) {
      for (const r of regions) {
        const p = at(r.id);
        nodes.push(
          <span
            key={`l${r.id}`}
            className="pointer-events-none absolute whitespace-nowrap px-0.5 font-mono text-[9px] leading-[1.4] text-on-desk/70"
            style={{ left: p.left + 1, top: p.top + 1, backgroundColor: "rgba(13,13,17,0.72)", zIndex: 1 }}
          >
            {roomLabel({ type: r.type, dept: r.dept })}
          </span>,
        );
      }
    }
    return { terrain: nodes, roomCount: regions.length };
    // ⚠️ `regionOverlay`가 deps에 있어 토글마다 타일 div가 통째로 다시 만들어진다 — 사람 손이
    //    누를 때만 일어나는 일이라 프레임 예산과 무관하다(memo의 성능 계약은 폰 이동이 기준이다).
  }, [walls, doors, zones, regionOverlay]);

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
          panRef.current = {
            id: e.pointerId, x: e.clientX, y: e.clientY,
            sx: e.clientX, sy: e.clientY, click: e.button === 0,
          };
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
            setCam((c) => pannedCamera(c, e.clientX - p.x, e.clientY - p.y, view));
            panRef.current = { ...p, x: e.clientX, y: e.clientY };
            return;
          }
          onTileMove?.(tileOf(e));
        }}
        onPointerUp={(e) => {
          const p = panRef.current;
          if (p) {
            panRef.current = null;
            setPanning(false);
            /* 팬 경로에서 **클릭을 되찾는다** — 도구를 안 든 주버튼 누름은 여기로 오는데, 거의
               안 움직였으면 그건 화면을 민 것이 아니라 무언가를 가리킨 것이다. 거리는 팬 델타의
               누적이 아니라 **시작·끝 비교**다(왕복 드래그가 클릭이 되는 건 무시할 코너다). */
            if (p.click && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < CLICK_SLOP) {
              onTileClick?.(tileOf(e));
            }
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
        {/* 부지 밖 풍경 — **첫 자식**이라 지형·가구·폰 전부가 그 위에 선다. 부지 안쪽은 이
            캔버스가 투명하게 비워 두므로(Backdrop.drawBackdrop) 이 div의 바닥색과 격자가
            그 구멍으로 그대로 비친다. 지역·배경은 세계가 든 값을 그대로 읽는다 — 같은 값을
            props로 한 번 더 받으면 world와 갈릴 자리가 생긴다(가구·폰과 같은 규약). */}
        <Backdrop region={world.region} variant={world.backdrop} />

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
              <ChairSprite variant={f.variant} />
            ) : f.kind === "BED" ? (
              <BedSprite occupied={occupiedTiles.has(`${f.x},${f.y}`)} />
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
          // 이 칸에 의자가 있으면 앉아 있는 것이다 — 폰에 자세 필드를 두지 않는 것이 계약이다:
          // 앉음의 단일 출처는 **좌표**이고(시뮬이 그렇게 정한다), 필드를 따로 들면 자리를 뜨는
          // 순간 되돌리는 걸 잊어 서 있는 폰이 영영 앉은 채로 그려진다.
          const seated = seatTiles.has(`${p.x},${p.y}`);
          // 누움도 **좌표가 단일 출처**다(앉음과 같은 계약 — 폰에 자세 필드를 두지 않는다).
          const lying = bedTiles.has(`${p.x},${p.y}`);
          // 누운 자세 전용 그림은 **환자에게만** 있다(LyingPatientSprite). 다른 종류가 침대 칸에
          // 서면 종전대로 회전으로 눕힌다 — 판정을 여기 한 번만 두어 회전과 그림 선택이 갈리지
          // 않게 한다(둘을 따로 쓰면 과 없는 의사가 누운 그림을 받고 **거기에 회전까지** 걸린다).
          const lyingPatient = lying && p.kind === "PATIENT";
          return (
          <div
            key={p.id}
            className="pointer-events-none absolute"
            style={{
              left: p.x * TILE,
              top: p.y * TILE - (seated ? SEAT_LIFT : 0),
              width: TILE,
              height: TILE,
              transition: stepMs > 0 ? `left ${stepMs}ms linear, top ${stepMs}ms linear` : "none",
              zIndex: 2,
            }}
          >
            {/* 접지 그림자 — **스프라이트보다 먼저** 그려야 사람 밑에 깔린다. 이 한 겹이 없으면
                아바타가 바닥에 붙지 않고 위에 얹힌 스티커로 보인다(방향은 집기 낙영과 같은 남동쪽).
                앉은 폰은 SEAT_LIFT만큼 들려 있으므로 그림자도 같이 올라가는 게 맞다 — 의자 위에
                앉은 사람의 그림자는 의자에 진다.
                ⚠️ **누운 폰은 그림자가 없다** — 바닥에 서 있지 않으므로 접지가 없고(침대가 자기
                그림자를 이미 진다), 남겨 두면 침대 발치에 원인 없는 얼룩으로 남는다.
                ⚠️ 폭 계수를 **줄이지 마라**. 0.62(= 9.92단위, x3.04~12.96)이던 것을 0.90으로
                넓힌 이유는 3/4 인물의 밑단이 x3.2~12.8을 채워 **옛 폭이 통째로 가려졌기**
                때문이다 — 그림자 있음/없음을 나란히 렌더해도 구별되지 않았다. 옛 스프라이트는
                다리 사각형 둘 사이가 벌어져 그 틈으로 비쳤는데, 3/4는 앞섶이 이어져 틈이 없다.
                즉 위의 "이 한 겹이 없으면 스티커로 보인다"가 **코드는 그대로인 채 화면에서만
                무효**였다. 높이 0.26과 그라디언트는 그대로 둔다 — shape를 생략한
                `radial-gradient(closest-side, …)`의 ending shape는 **원이 아니라 타원**이라
                가로·세로 반지름을 **각각** 가까운 변에 맞춘다(지금 rx7.2 / ry2.08). 그래서 폭을
                키우면 rx가 4.96 → 7.2로 커져 **중심 알파 0.5는 유지된 채 중심을 벗어난 모든
                점이 진해진다**(중심에서 3단위 옆: 0.198 → 0.292) — 원하던 방향이다. 정말 세로만
                반지름을 정한다면 폭을 키워도 아무 변화가 없어야 하니, 두 문장 위의 실측과
                모순된다. */}
            <div
              className="pointer-events-none absolute left-1/2 -translate-x-1/2"
              hidden={lying}
              style={{
                bottom: 0,
                width: TILE * 0.9,
                height: TILE * 0.26,
                background: "radial-gradient(closest-side, rgba(8,6,16,0.5), rgba(8,6,16,0))",
              }}
              aria-hidden
            />
            {/* 선택 링 — 지금 카드가 보고 있는 폰. **네모**인 것이 계약이다: 응급의 둥근 링과
                겹쳐 서도 둘이 구별돼야 한다(응급 표시는 손대지 않는다 — 겹치면 두 링이 다 보인다). */}
            {p.id === selectedId && (
              <div
                className="absolute -inset-px"
                style={{ boxShadow: "inset 0 0 0 1px var(--on-desk)" }}
                aria-hidden
              />
            )}
            {/* 응급 환자 — 붉은 링. 스프라이트는 익명 회색 하나뿐이라(character-design.md: 환자에
                개인 서사를 붙이지 않는다) 링만으로 "지금 병원 안에 응급이 있다"를 나른다. */}
            {p.emergency && (
              <div
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: "inset 0 0 0 1.5px var(--alarm)" }}
                aria-hidden
              />
            )}
            {/* 간호사가 **먼저**다 — 과가 없어서(pawn.hireNurse) 아래 의사 분기의 `p.dept`
                조건에 걸리지 않으면 그대로 환자로 그려진다(익명 회색). 종류를 명시로 갈라
                그 폴백에 안 얹는 것이 계약이다. */}
            {/* 누운 자세 — **환자는 전용 그림**(LyingPatientSprite), 나머지는 가로로 눕히고 조금 줄인다.
                회전을 환자에서 걷어낸 이유: 인물이 3/4 시점이 된 뒤로(2026-07-31) 90° 돌리면 몸통
                앞면이 옆을 봐 "누운 사람"이 아니라 **"옆으로 넘어진 사람"**이 된다. 회전이 남는
                쪽(**환자가 아닌 폰 전부** — 간호사·의사. 조건이 `!lyingPatient`라 과가 있는 의사도
                포함된다)에는 그 그림이 없어 종전 처리를 유지한다 — 회전만으로는 실루엣이
                서 있는 것과 거의 같아 보이고, 줄이지 않으면 폰이 타일을 꽉 채워 침대가 통째로 가려
                "무엇 위에 누웠는지"가 사라진다(의자에 SEAT_LIFT가 필요했던 것과 같은 문제다).
                래퍼는 자세와 무관하게 **늘 있다** — 조건부로 감싸면 React 트리가 갈려 이동
                transition이 remount로 끊긴다(이 파일 머리말의 폰 규칙). */}
            <div className="absolute inset-0" style={{ transform: lying && !lyingPatient ? "rotate(90deg) scale(0.8)" : undefined }}>
              {p.kind === "NURSE" ? (
                <NurseSprite variantKey={p.id} />
              ) : p.kind === "DOCTOR" && p.dept ? (
                <DoctorSprite dept={p.dept} busy={busyDoctors.has(p.id)} variantKey={p.id} />
              ) : lyingPatient ? (
                <LyingPatientSprite />
              ) : (
                <PatientSprite />
              )}
            </div>
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

        {/* 의자 좌면 앞단 — 폰 **위에** 덧까는 한 겹. 인물이 3/4 시점이 된 뒤로(2026-07-31) 몸이
            커져 가구 레이어의 의자는 검은 후광 정도로만 남아 **앉은 폰이 선 폰과 구별되지 않는다**.
            그렇다고 의자를 통째로 앞에 보내면 사람이 머리만 남아 과 색·직종·busy가 전부 사라진다
            (SEAT_LIFT를 0으로 두는 안과 함께 실측으로 기각). 좌면 앞단 **한 조각만** 앞으로 보내면
            상체(가운·과 색)는 그대로 보이고 하체만 좌면 뒤로 들어가 "의자에 앉은 사람"으로 읽힌다.
            zIndex가 폰과 같은 2인 것이 계약이다 — 같은 z에서는 DOM 순서가 늦은 쪽이 위라 새 층이
            필요 없고, 3·4는 건설 미리보기와 그 라벨이 이미 쓰므로 그쪽으로 올리면 프리뷰가 좌면
            뒤로 숨는다. 앉은 폰이 있는지 따지지 않고 **모든 의자 타일**에 그린다 — 계약은
            *"빈 의자에선 화면이 같다"*가 아니라 **모든 의자에 똑같이 걸려 의자끼리는 갈리지
            않는다**이다(2026-07-31 픽셀 비교로 정정). 같은 패스를 두 번 그리면 안티앨리어싱이
            2회 합성돼(α'=1−(1−α)²) 빈 의자도 실제로 달라진다 — 16/29/64px 래스터에서 픽셀의
            3.5~10.9%가 최대 Δ33까지 바뀐다. EDGE=0.45 stroke를 두 번은 단일 0.70과 사실상
            같고, 좌면 앞단의 좌·우·아래 변이 몸체 rect 윤곽과 겹치면 **3회 합성**이다
            (α=1−0.55³=0.83). 즉 좌면 윤곽만 다른 집기보다 굵게 읽힌다 — `EDGE` 계약의 알려진
            예외다. **다만 예외의 크기는 변종마다 다르다**(α=1−0.55ⁿ): 3회는 플라스틱·스툴
            기준이고, 벤치는 몸체 rect에 `stroke`가 아예 없어 겹칠 윤곽이 없으므로 2회(0.70),
            소파는 팔걸이 rect가 잉크를 한 번 더 그어 4회(0.91)다. 굵기를 맞추려면 플래그를
            `ChairSprite`까지 밀어야 해 아티팩트 크기 대비 과하다고 판단했다. */}
        {[...seatTiles].map(([key, variant]) => {
          const [x, y] = key.split(",").map(Number);
          return (
            <div
              key={`seat-front-${key}`}
              className="pointer-events-none absolute"
              style={{ left: x * TILE, top: y * TILE, width: TILE, height: TILE, zIndex: 2 }}
              aria-hidden
            >
              <ChairSeatFrontSprite variant={variant} />
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
          ⌂는 **시작 프레임 복귀**다(zoom 1이 아니다) — 둘이 갈리면 화면에 「기본 화면」이 두 개
          생겨, 처음 본 그림으로 돌아갈 길이 없어진다. 목표 배율을 현재 배율로 나눈 **배수**를 한 번
          태우면 클램프가 중앙 정렬까지 해 주고, 하한 받침은 `zoomedCamera`가 안에서 한다.
          ponytail: 핀치 줌은 안 넣었다 — 포인터 두 개를 추적하는 상태가 통째로 필요하고 이 버튼이
          같은 일을 한다. 터치 사용자가 확대를 자주 쓴다는 신호가 오면 그때 붙인다. */}
      <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1">
        {[
          { label: "+", title: "확대", run: () => zoomBy(1.4) },
          { label: "⌂", title: "부지 전체 보기", run: () => setCam((c) => zoomedCamera(c, safeCenter, openingZoom(view) / c.zoom, view)) },
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
        {/* 영역 보기 — 줌과 **같은 묶음**인 것이 자리의 근거다: 둘 다 판을 안 바꾸고 무엇을 보는지만
            바꾼다. 한 칸 띄워 둔 것은 그래도 축(배율 ↔ 표시층)이 다르기 때문이다.
            ⚠️ 용도 도구를 든 동안에는 부모가 강제로 켜므로(regionOverlayOn) 이 버튼이 눌린 채로
            굳은 것처럼 보인다 — 화면에 켜져 있는 것이 사실이라 그대로 비춘다. */}
        <button
          type="button"
          title="영역 보기 — 방 색과 이름표를 겹쳐 봅니다(용도 도구를 들면 자동으로 켜집니다)"
          aria-label="영역 보기"
          aria-pressed={regionOverlay}
          onClick={onToggleRegionOverlay}
          className={`mt-2 h-7 w-7 border bg-desk-2/80 font-mono text-sm backdrop-blur-sm transition-colors ${
            regionOverlay
              ? "border-on-desk text-on-desk"
              : "border-frame text-on-desk-muted hover:border-on-desk-muted hover:text-on-desk"
          }`}
        >
          ▦
        </button>
      </div>
    </div>
  );
}
