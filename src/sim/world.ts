// 타일 세계 — 순수 데이터와 통행 판정. 렌더·React 임포트 금지.
// dept.ts는 world를 모른다(단방향) — 그래서 값(freshHirePool)까지 당겨도 순환이 없다.
import { freshHiredSlots } from './candidate'
import { freshHirePool, type DeptMix, type SimDeptKey, type SimDeptStats } from './dept'
import type { EmergencyTurnAway } from './emergency' // 타입 전용 — emergency.ts가 world를 되받아도 런타임 순환 없음
import type { SimEventKind } from './events' // 타입 전용 — events.ts는 leaf라 값도 순환은 없지만 필요한 건 타입뿐이다
import type { Pawn } from './pawn' // 타입 전용 임포트 — pawn.ts가 world를 되받아도 순환 무해
import type { DayRecord } from './day' // 타입 전용 — day.ts가 SimWorld를 되받아도 런타임 순환 없음
import type { Pt } from './path' // 타입 전용 — path.ts가 world의 격자 상수를 되받아도 런타임 순환 없음

export const GRID_W = 48
export const GRID_H = 32
export const INITIAL_TREASURY_MANWON = 50_000 // 개원 자본 5억(기존 경제와 동일 단위)

/** 정문 — 그리드 아래 변 중앙. 여기에 벽을 세우면 아무도 못 들어오지만 그건 플레이어의 선택이다.
 *  **환자가 들어오는 문과 의사가 출근하는 문은 같은 문이다.** 격자에서 파생하는 상수라 자리는
 *  여기다 — 라이프사이클 모듈(patientFlow)에 두면 그 아래층인 pawn이 상위를 값으로 당기게 되고,
 *  patientFlow가 pawn의 값을 하나라도 쓰는 순간 실제 순환이 된다. */
export const ENTRANCE: Pt = { x: 24, y: GRID_H - 1 }

/** 타일 인덱스의 **단일 출처** — 벽·문 집합, 경로 blocked 집합, 영역 계산이 전부 이 공식을 쓴다.
 *  호출부가 `y * GRID_W + x`를 다시 쓰면 어느 한 곳이 바뀌는 날 조용히 갈린다. */
export const tileIndex = (x: number, y: number): number => y * GRID_W + x

/**
 * 부지가 선 **입지** — 새 판을 열 때 플레이어가 고르는 유일한 값이다.
 *
 * ⚠️ `src/game/types.ts`의 `RegionKey`(CAPITAL/METRO/RURAL)와 **이름을 공유하지 않는다** — 그쪽은
 * 전국 세계 시뮬의 권역이고 이쪽은 병원이 선 자리다. 뜻이 다른 두 축에 같은 이름을 주면 나중에
 * 매핑이 생기는 날 어느 쪽 RURAL인지 읽는 사람이 못 가린다(그래서 METRO를 값에서도 뺐다).
 *
 * 이 값은 **규칙에 닿는다** — 도착·믹스·응급·임대료·소송·시작 풀이 전부 아래 `REGIONS`의
 * 파생이다(설계 2026-07-30 「지역이 규칙에 닿는다」). 배경 선택은 그중 하나일 뿐이다.
 */
export type SimRegionKey = 'URBAN' | 'NEWTOWN' | 'PROVINCIAL' | 'RURAL'

/** 지역당 배경 후보 수 — 12종 카탈로그(Backdrop.tsx)가 지역마다 이만큼 든다. */
export const BACKDROP_COUNT = 3

/**
 * 한 지역이 쥐는 손잡이 전부 — **새 시스템은 하나도 없다.** 여섯 값이 각각 기존 훅포인트
 * (외래 도착 문턱 · 희망 과 표 · 응급 도착 문턱 · 주간 결산 · 소송 비용 · 시작 풀)에 곱해지거나
 * 갈아 끼워진다. `SimWorld`에 필드가 하나도 안 느는 이유가 그것이다: 규칙은 `region` 값의
 * **순수 파생**이라, 저장하면 카탈로그와 갈릴 값을 세계에 두지 않는다(events.ts의 "오늘의
 * 보정치를 저장하지 않는다"와 같은 계약).
 *
 * ⚠️ **문구(`label`·`line`)가 값 옆에 사는 것이 계약이다.** 카드가 약속하는 문장과 그 약속을
 * 지불하는 수치가 같은 리터럴 블록에 있어야, 수치를 고치며 약속을 안 고치는 drift가 리뷰에서
 * 보인다(화면이 표를 다시 적으면 그 순간 두 곳이 된다).
 *
 * ⚠️ **금액·배율은 전부 각색·튜닝값이다**(의료정책 주장 아님). 잠그는 것은 값이 아니라
 * **부호·대소·순서**이고, 그 불변식은 world.test.ts(I-R1~R6)가 소유한다.
 */
export interface SimRegionSpec {
  key: SimRegionKey
  /** 카드 제목 — 화면(SimGame)이 여기서 파생한다. */
  label: string
  /** 카드 서사 한 줄 — 이 지역이 하는 약속. 그 줄마다 아래 값 하나가 대응한다(설계 §3). */
  line: string
  /** 외래 도착 **문턱** 배율(patientFlow.maybeArrive). 시드가 아니라 문턱에 곱해야
   *  도착 분 집합이 부분집합 관계(RURAL ⊂ URBAN ⊂ NEWTOWN)로 남는다. */
  arrivalMul: number
  /** 희망 과 분포 — `null`이면 전국 표(patientFlow.ARRIVAL_DEPT_MIX) 그대로다.
   *  평시 표를 여기 복사하지 않는 이유는 events.arrivalDeptMixOf와 같다: 두 벌이 되는 순간
   *  전국 표를 튜닝해도 지역 표만 옛 값으로 남는다. */
  deptMix: DeptMix | null
  /** 응급 도착 **문턱** 배율(emergency.emergencyArrivalAt). */
  emergencyMul: number
  /** 주당 임대료(만원) — 주간 결산에서 청구된다. 과가 없으므로 과별 표에 섞지 않는다
   *  (간호 블록과 같은 이유 · week.WeekSummary). */
  rentManwon: number
  /** 의료소송 즉시 비용의 배율(events.applyEvent). 돌려보낸 환자가 갈 곳이 **있는가**가 이 값의 뜻이다. */
  lawsuitMul: number
  /** 전국 풀(dept.nationalPool) 대비 **가감**. 실제로는 감뿐이다 — 어느 지역도 전국보다
   *  두껍지 않다(I-R3ⓑ가 잠근다). 적지 않은 과는 전국 그대로. */
  hirePoolDelta: Partial<Record<SimDeptKey, number>>
}

/**
 * 지역 카탈로그 — 값 표의 **단일 출처**(설계 §5).
 *
 * ⚠️ **URBAN은 스트림 중립 지역이다**(배율 1 · 믹스 null · 델타 0). `createWorld`의 기본
 * 지역이라, 이 중립이 곧 이 설계의 결정론 회귀 잠금이다: 기존 스트림·풀 테스트 전체가
 * **수정 없이** 초록이어야 한다. URBAN의 정체성은 스트림이 아니라 경제(임대료 1,200 ·
 * 소송 절반)에만 있다 — 그래서 "옆 건물에도 병원이 있다"는 도착이 아니라 **소송 0.5**로
 * 번역된다(돌려보내도 옆 병원이 받으니 책임이 절반만 돌아온다).
 */
export const REGIONS: Record<SimRegionKey, SimRegionSpec> = {
  URBAN: {
    key: 'URBAN',
    label: '대도시 도심',
    line: '병상은 남아도는데 옆 건물에도 병원이 있다. 임대료가 먼저 나간다.',
    arrivalMul: 1,
    deptMix: null,
    emergencyMul: 1,
    // 1,200 = 내과 의사 1명 주급(1,500)의 8할 — "의사 한 명 몫이 건물주에게".
    // 12주 총 14,400 = 개원 자본의 29%. 유일하게 풀 델타가 0인 자유의 값이 이 줄이다.
    rentManwon: 1_200,
    lawsuitMul: 0.5,
    hirePoolDelta: {},
  },
  NEWTOWN: {
    key: 'NEWTOWN',
    label: '신도시·중소도시',
    // ⚠️ 둘째 문장은 **교체된 것이다**(설계 §13-1). 옛 문구 "아이를 볼 곳은 그만큼 늘지
    // 않았다"는 소아과를 요구하는데 이 슬라이스에 그 과가 없어 **번역 불가**였다 —
    // 규칙 없는 약속을 남기지 않으려고 문구 쪽을 바꿨다(과 신설은 범위 밖).
    line: '젊은 인구가 계속 들어온다. 미용 간판은 늘고, 필수과는 오지 않는다.',
    // 1.2 — 하루 기대 60→72명. 대기실·수납 압박이 체감되는 최소 폭이고,
    // 이벤트 최대 겹침(전염병 ×1.6)에도 분당 확률 0.24 < 1이라 안전하다.
    arrivalMul: 1.2,
    // 40/18/7/35 — 젊은 도시의 수요 형태(미용 최대·순환기 최소).
    deptMix: [
      ['INTERNAL_MEDICINE', 0.40],
      ['GENERAL_SURGERY', 0.58],
      ['CARDIOLOGY', 0.65],
      ['AESTHETICS', 1.00],
    ],
    // 0.8 — 하루 기대 4→3.2건. 응급 수익 기회가 얇아지는 것이 이 지역의 뺏는 쪽 절반이다.
    emergencyMul: 0.8,
    // 800 — 신도시 상가 임대료는 실제로 높다(미용 의사 주급과 같은 값).
    rentManwon: 800,
    lawsuitMul: 1,
    // "필수과는 오지 않는다"의 번역 — 외과·순환기만 얇아진다(미용·내과는 전국 그대로).
    hirePoolDelta: { GENERAL_SURGERY: -1, CARDIOLOGY: -1 },
  },
  PROVINCIAL: {
    key: 'PROVINCIAL',
    label: '지방 소도시',
    line: '환자는 늙어 가고, 의사를 구한다는 공고는 해를 넘긴다.',
    arrivalMul: 1,
    // 55/20/20/5 — 고령 수요. **미용 5%가 이 지역의 정체**다: 흑자 엔진이 없는 도시라
    // 저수가 내과 박리다매로 버텨야 한다.
    deptMix: [
      ['INTERNAL_MEDICINE', 0.55],
      ['GENERAL_SURGERY', 0.75],
      ['CARDIOLOGY', 0.95],
      ['AESTHETICS', 1.00],
    ],
    emergencyMul: 1,
    rentManwon: 300, // 간호사 주급 수준
    lawsuitMul: 1,
    // 전 과 기근 — 지방일수록, 미용일수록 격차가 크다(수도권 인력 집중의 각색).
    hirePoolDelta: {
      AESTHETICS: -4, INTERNAL_MEDICINE: -2, GENERAL_SURGERY: -1, CARDIOLOGY: -1,
    },
  },
  RURAL: {
    key: 'RURAL',
    label: '농어촌',
    line: '가장 가까운 큰 병원까지 한 시간. 그 한 시간이 사람을 가른다.',
    // 0.7 — 하루 기대 42명. 외래 경제가 "안 되는" 것을 체감시키되 내과 1~2명 빌드는 도는 선.
    arrivalMul: 0.7,
    deptMix: [
      ['INTERNAL_MEDICINE', 0.50],
      ['GENERAL_SURGERY', 0.75],
      ['CARDIOLOGY', 0.95],
      ['AESTHETICS', 1.00],
    ],
    // ⚠️ **1.2는 취향이 아니라 상한이다.** 부호 불변식 I-B1 ⓑ("응급을 최대로 받아도 순환기는
    // 적자")가 천장을 정한다: STEMI 주 상한 17건 × 1.2 ≈ 20건 × 350 = 7,000 + 순환기 외래
    // (0.7볼륨 · 20%믹스 ≈ 520) = 7,520 < 주급 8,000. ×1.25부터 부호가 뒤집힐 수 있다 —
    // emergency.test.ts의 I-R4가 이 계산을 카탈로그 값으로 다시 세워 잠근다.
    emergencyMul: 1.2,
    rentManwon: 0, // 빈 건물은 많다 — 임대인이 없는 것이 이 지역의 유일한 "준다"에 가깝다
    // 2.0 — 갈 곳이 없는 곳에서 돌려보낸 응급은 두 배로 돌아온다(1,600만원).
    lawsuitMul: 2.0,
    // 미용 −6이 가장 크다 — 농어촌에 미용 의사가 둘뿐이라는 것이 이 표의 주장이다.
    hirePoolDelta: {
      AESTHETICS: -6, INTERNAL_MEDICINE: -2, GENERAL_SURGERY: -1, CARDIOLOGY: -1,
    },
  },
}

/** 지역 조회 — 카탈로그의 유일한 진입점. 없는 지역에 `undefined`를 돌려주면 호출부에서
 *  `undefined.arrivalMul`이 되어 도착 문턱이 NaN이 되고, NaN 비교는 항상 거짓이라 **환자가
 *  한 명도 안 오는 병원**이 예외 하나 없이 선다(simDept가 던지는 것과 같은 이유). */
export function simRegion(key: SimRegionKey): SimRegionSpec {
  const spec = REGIONS[key]
  if (!spec) throw new Error(`simRegion: 카탈로그에 없는 지역(${key}) — 오타이거나 새 지역을 표에 안 넣었다`)
  return spec
}

/**
 * 그 지역에서 판을 열 때의 **시작 채용 풀** — 전국 풀(카탈로그 파생) + 지역 델타.
 *
 * **음수 클램프를 두지 않는다**: 클램프가 있으면 오타 델타(순환기 −3 같은)가 조용히 0으로
 * 접혀 "그 과를 영영 못 뽑는 지역"이 에러 하나 없이 서고, 하한 불변식(I-R3)이 죽여야 할
 * 돌연변이가 안 죽는다. 실수는 컴파일 다음 단계(테스트)에서 잡는 편이 낫다.
 *
 * ⚠️ 매번 **새 객체**다(freshHirePool이 그렇다) — 카탈로그의 델타 객체를 세계가 공유하면
 * 한 판의 채용이 다음 판의 시작 풀을 깎는다.
 */
export function regionHirePool(key: SimRegionKey): Record<SimDeptKey, number> {
  const pool = freshHirePool()
  for (const [dept, delta] of Object.entries(simRegion(key).hirePoolDelta) as [SimDeptKey, number][]) {
    pool[dept] += delta
  }
  return pool
}

export type RoomType = 'EXAM' | 'WARD' | 'WAITING' | 'LOUNGE' | 'RECEPTION' | 'CAFETERIA'

/** 칠한 한 타일의 용도 — `dept`는 `EXAM`에만 실린다(옛 Designation과 같은 규약).
 *  영역은 이 칠에서 **파생**한다(regions.computeRegions — 같은 (type·dept) 성분).
 *  벽·문 타일에는 칠이 없다는 것이 build.paintZone의 계약이다. */
export interface ZonePaint { type: RoomType; dept?: SimDeptKey }

export type FurnitureKind = 'DESK' | 'CHAIR' | 'BED' | 'COUNTER'

/**
 * 의자의 겉모습 — **종류가 아니라 하위 속성**이다(설계 §3).
 *
 * 새 `FurnitureKind`로 쪼개지 않은 이유: `kind === 'CHAIR'` 검사가 프로덕션에만 여덟 곳이고
 * (`blocksWalk`·`spots`·`patientFlow`×2·`needs`×2·`TileMap`×2), 하나라도 집합 검사로 못 바꾸면
 * **앉을 수 없는 소파**가 생기는데 그 버그는 에러 없이 조용하다 — 화면엔 의자가 있는데 폰이 안 앉는다.
 * `variant`는 그 여덟 곳을 **전부 무변으로** 통과한다.
 *
 * ⚠️ **시뮬은 이 필드를 한 번도 읽지 않는다.** 그게 "외형만 다르다"(②-a)를 규칙이 아니라 구조로
 * 보장하는 자리다 — 기능 차이는 ②-b에서 안락함 수치로 들어온다.
 */
export type ChairVariant = 'STOOL' | 'PLASTIC' | 'BENCH' | 'SOFA' | 'RECLINER'

/** 집기 한 점 — **소속 필드가 없다**(설계 §1-1). 이 가구가 어느 방의 것인지는 좌표가 말한다:
 *  `regions.computeRegions`가 낳은 영역 중 이 타일을 담은 것이 곧 이 가구의 방이다.
 *  옛 `roomId`를 지운 이유는 이중 기재다 — 벽을 옮겨 영역이 갈라지거나 합쳐지면 그 필드는
 *  갱신할 자리가 없어 조용히 낡고, 그때부터 화면의 방과 규칙의 방이 달라진다. */
export interface Furniture {
  kind: FurnitureKind
  x: number
  y: number
  /** 의자에만 실린다. **미지정이면 키를 만들지 않는 것이 계약이다** — 이유는 둘이다:
   *  ① 진짜 기본값을 채우면 가구 배열을 통째로 비교하는 회귀가 깨진다(EXAM 자동 가구).
   *  ② 읽는 쪽이 「없음」과 「기본값」 둘을 구별해야 한다.
   *  ⚠️ 반면 `undefined`를 **값으로** 싣는 것은 그 회귀가 **못 잡는다** — vitest `toEqual`이
   *  undefined 키를 무시하고 이 저장소엔 `toStrictEqual`이 0건이다(돌연변이 실측). 그래서
   *  build.test의 `Object.keys` 단언이 그 경로의 **유일한 가드**다 — 「깊은 비교가 이미
   *  잡으니 중복」이라 판단해 지우면 안 된다(T-145).
   *  기본값은 그리는 쪽이 접는다(PixelSprite.ChairSprite). */
  variant?: ChairVariant
}

/** 세계의 진행 국면 — RUNNING일 때만 시간이 흐른다.
 *  마감·결산 화면 동안 세계가 계속 굴러가면 플레이어가 읽는 숫자와 세계가 어긋난다. */
export type SimPhase = 'RUNNING' | 'DAY_END' | 'WEEK_END' | 'CLOSED'

/** 판이 **왜** 끝났는가 — 돈(INSOLVENCY)·사람(NO_PEOPLE)·시간(CAMPAIGN_END).
 *  `phase: 'CLOSED'` 하나로는 세 결말이 한 화면으로 뭉개진다. 판정은 주간 결산 한 곳뿐이다(week.endingOf). */
export type EndingKind = 'INSOLVENCY' | 'NO_PEOPLE' | 'CAMPAIGN_END'

export interface SimWorld {
  minute: number   // 개장(09:00)부터의 게임 분
  day: number      // 1부터
  week: number     // 1부터
  phase: SimPhase
  treasuryManwon: number
  /** 벽 타일(tileIndex) — **통행 판정의 단일 출처**다. 방 사각형에서 유도하지 않는다:
   *  자유 건설에서는 벽이 방에 속하지 않고 홀로 선다(건설 도구는 build.ts). */
  walls: ReadonlySet<number>
  /** 문 타일 — **통행 가능하되 벽 집합에는 없다**. 이 이중성이 문의 정의다.
   *  문이 영역을 가르는 것은 이제 **간접적**이다: 영역은 칠(zones)에서 파생하는데 `paintZone`이
   *  문 타일을 칠하지 않으므로, 문 자리에 칠의 구멍이 남아 성분이 그 자리에서 끊긴다.
   *  즉 문은 "경계로 선언된 것"이 아니라 "칠할 수 없는 칸"이다 — 벽을 헐어도 영역은 안 바뀐다. */
  doors: ReadonlySet<number>
  /** 칠한 타일 → 용도. **불변 취급** — 편집은 새 Map으로 교체한다(walls와 같은 계약).
   *  computeRegions memo와 TileMap 지형 memo가 이 참조를 키로 쓴다.
   *
   *  ⚠️ 값에 `Readonly`가 붙은 것이 계약의 일부다. `ReadonlyMap`은 `set`만 막고 **꺼낸 값의
   *  필드 쓰기는 막지 않는데**, `paintZone`이 한 호출의 모든 타일에 paint 객체 **하나**를
   *  공유하므로 `w.zones.get(i)!.type = ...` 한 줄이 그 칠 전체를 갈아 치우면서 Map 참조는
   *  그대로 둔다 — memo가 영영 적중해 조용히 낡는다. 이 한 겹이 그 경로를 tsc로 막는다. */
  zones: ReadonlyMap<number, Readonly<ZonePaint>>
  furniture: Furniture[]
  pawns: Pawn[]
  nextId: number
  seed: number
  /** 하루 집계 — 폰은 퇴장하면 배열에서 사라지므로, 무슨 일이 있었는지는 여기에만 남는다. */
  stats: SimStats
  /** 이번 주의 하루 기록 — 주를 넘기면 비운다(주간 결산이 이 배열을 합산한다). */
  days: DayRecord[]
  /** 금고가 음수로 끝난 주가 몇 번 **연속**됐는가 — 기존 게임의 폐업 규칙(2주 연속)이 읽는다.
   *  흑자로 끝난 주가 한 번이라도 끼면 0으로 리셋된다(누적이 아니라 연속이다). */
  insolvencyStreak: number
  /** 이번 주 결산(고정비 차감)이 이미 끝났는가 — 이중 정산 가드.
   *  phase를 바꿔 표시하지 않는 이유: 결산 화면은 `WEEK_END` 하나로 떠 있고 그 화면 **안에서**
   *  결산이 돌기 때문이다(진입 시 자동 1회 → 요약을 읽고 → 다음 주 버튼). phase를 옮기면
   *  결산이 끝나는 순간 플레이어가 읽어야 할 화면이 사라진다. */
  weekSettled: boolean
  /** **전국에 남은** 과별 의사 수 — 채용이 하나씩 깎고(pawn.hireDoctor), 0이면 그 과를 더 뽑을 수
   *  없다. 사직자는 여기로 **돌아오지 않는다**(week.startNextWeek) — 다른 병원으로 옮긴 게 아니라
   *  필수의료를 떠난 것이라, 이 숫자는 한 판 동안 단조 감소한다.
   *  초기값은 카탈로그 파생이다(dept.freshHirePool) — 두 곳에 적지 않는다. */
  hirePool: Record<SimDeptKey, number>
  /** 과별로 **이미 뽑힌 후보 슬롯**(candidate.ts) — hirePool 카운트의 명단판이다.
   *  카운트를 지우지 않는 이유: 기존 테스트·화면·이벤트가 전부 카운트를 읽는다. 쓰기 경로가
   *  hireDoctor 하나뿐이라 어긋날 면이 없고, 일치는 불변식 테스트가 잠근다
   *  (hirePool[d] + hiredSlots[d].length === regionHirePool(region)[d]). */
  hiredSlots: Record<SimDeptKey, number[]>
  /** 판을 끝낸 결말 — **`phase: 'CLOSED'`와 항상 함께** 세팅된다(settleWeek 한 곳).
   *  살아 있는 세계에는 없다(optional인 이유): 있으면 끝난 판이고, 없으면 아직 굴러가는 판이다. */
  ending?: EndingKind
  /** 오늘 붙은 이벤트 — **하루짜리다.** 아침 전이 직후에 세팅되고(`events.applyEvent`)
   *  다음 아침이 지운다(`day.freshMorning`). 효과는 여기에 저장되지 않는다: 판정식이 그때그때
   *  배율 함수로 읽어 간다(events.arrivalProbMulOf 등) — "오늘의 보정치"를 따로 들면 이 필드와
   *  갈릴 수 있다. 객체로 감싼 이유는 연출문·LLM 텍스트가 나중에 같은 자리에 붙기 때문이다.
   *
   *  ⚠️ `chilledName`은 그 확장의 첫 입주자다 — LAWSUIT이 **응급 우선순위를 한 단계 내린
   *  의사의 이름**이고(events.applyEvent), 화면이 그걸로 고지문을 세운다(narrative.chillNotice).
   *  효과가 아니라 **이미 일어난 일의 이름표**라 위 "보정치를 저장하지 않는다"에 어긋나지 않는다:
   *  우선순위는 그 폰에 이미 적혔고 여기 남는 건 누가 그랬는지뿐이다. LAWSUIT이 아니거나 대상이
   *  없으면 **필드 자체가 없다**(다음 아침이 event를 통째로 지우므로 별도 정리 경로도 없다).
   *
   *  ⚠️ `costManwon`은 그 계약의 **둘째 입주자**다 — LAWSUIT이 그 자리에서 금고에서 뺀 액수
   *  (지역 배율 포함)이고, 화면이 그걸로 「합의금 N만원이 빠져나갔습니다」를 세운다. 역시
   *  **이미 일어난 일의 이름표**라 "보정치를 저장하지 않는다"에 어긋나지 않는다: 돈은 이미
   *  `treasuryManwon`에서 빠졌고 여기 남는 건 얼마였는지뿐이다(누구였는지를 남기는 chilledName과
   *  같은 성격). LAWSUIT이 아니면 **필드 자체가 없다**. */
  event?: { kind: SimEventKind; chilledName?: string; costManwon?: number }
  /** **판 전체**에서 되돌아간 응급의 누적 건수 — 의료소송(LAWSUIT) 전제의 유일한 근거다.
   *  기존 `stats.emergencyTurnedAway`는 아침마다 비워지고 `days`는 주마다 비워져 "이 판에서
   *  몇 명을 돌려보냈나"를 읽을 축이 없었다. 단조 증가하고 하루·주 리셋이 없다
   *  (`saturatedDays`와 같은 계약 — *돌려보낸 일은 남는다*). */
  turnedAwayTotal: number
  /**
   * 이번 **주**에 의료소송 합의금으로 나간 돈의 누계(만원, 항상 양수) — **표시용 장부다.**
   *
   * ⚠️ **차감은 이 값이 하지 않는다.** 합의금은 이벤트가 붙는 그 순간 `applyEvent`가 이미
   * 금고에서 뺐고, 이 누계는 주간 결산표가 *"이번 주 소송으로 얼마가 나갔나"*를 말하기 위해서만
   * 존재한다. `weekSummary.netManwon` 식이나 `settleWeek`의 청구에 끼우면 **같은 돈이 주말에 한 번
   * 더 빠진다** — settleWeek이 청구액을 `revenue − net`의 **차**로 유도하기 때문이다(week.ts).
   * 그 이중 차감은 화면상 순익이 그럴듯해 보여서 조용하다. events.test.ts 「주간 결산은 소송
   * 누계를 다시 빼지 않는다」가 이 계약을 잠근다.
   *
   * 이 축이 생긴 이유는 12주 실플레이 관측이다: 합의금이 어느 화면에도 안 보여, **금고 변화와
   * 결산표의 합이 안 맞는데 어디서 갈렸는지 물을 자리가 없었다.**
   *
   * **주간 축이라 주를 넘기면 0이다**(`days`와 같은 계약 · `startNextWeek`). 판 누적인
   * `turnedAwayTotal`·`nursesResignedTotal`과 갈리는 지점이 그것이다 — 결산표는 그 주의 이야기다.
   */
  lawsuitManwonWeek: number
  /**
   * **판 전체**에서 병원을 떠난 간호사의 누적 — 「유휴」 장부다(설계 2026-07-30 §3).
   *
   * ⚠️ **자원이 아니라 장부다.** 이 숫자는 채용을 막지 않는다(간호사는 전국 풀이 없다 —
   * `hireNurse`에 거부 사유가 없는 그 이유). 풀이 채용을 막으면 메시지가 "사람이 없다"로
   * 뒤집히는데, 리서치의 사실은 **"뽑을 사람은 있는데 잔류가 안 된다"**다(활동률 51~54%·유휴
   * 20.4만의 번역) — 그래서 떠난 사람은 필수의료를 떠난 의사와 달리 **면허를 들고 유휴로**
   * 돌아가고, 세계는 그 수만 센다.
   *
   * 쓰이는 곳이 둘이다: 결산 화면의 누계 줄과 **채용 이름의 서수**(pawn.hireNurse — 재직 인원만
   * 세면 사직 뒤 같은 이름이 재등장한다).
   *
   * `stats`가 아니라 여기 있는 이유: `SimStats`는 아침마다 비워진다(`freshStats`). 판 단위로
   * 단조 증가하는 축은 이 층에 산다 — `turnedAwayTotal`과 같은 계약이다(*떠난 일은 남는다*).
   */
  nursesResignedTotal: number
  /** 부지가 선 지역 — 도착·믹스·응급·임대료·소송·시작 풀이 전부 이 값의 파생이다(`REGIONS`).
   *  판이 열릴 때 정해지고 그 뒤 불변이다(지역 재선택은 범위 밖). */
  region: SimRegionKey
  /** 그 지역 안에서 뽑힌 배경 변형(0..2) — 새 판을 열 때 한 번 정해지고 그 뒤 불변.
   *  시드에서 파생하지 않는 이유는 시드가 1로 고정돼 있어서다(SimGame) — 파생하면 지역마다
   *  배경이 영영 한 장으로 굳는다. 무작위는 시뮬 밖(새 판 클릭 핸들러)에서 한 번 일어나고
   *  결과만 여기 저장되므로, 세계가 만들어진 뒤는 지금까지와 똑같이 결정론이다. */
  backdrop: number
}

export interface SimStats {
  examsDone: number  // 완료된 진료 수(수익의 근거)
  leftCount: number  // 대기 못 하고 떠난 환자 수(접수처 반려 + 자리 부족 + 인내 초과)
  /** 그중 **접수처 반려** — 그 과를 아예 안 보는 병원이라 대기실까지 들어오지도 못한 수.
   *  `leftCount`의 **부분집합**이지 따로 세는 축이 아니다(총합을 두 번 세면 화면이 갈린다).
   *
   *  이 축이 따로 필요한 이유: 나머지 이탈(자리 부족·인내 초과)은 **더 지으면 줄지만** 이건
   *  안 줄어든다 — 채용해야 줄어든다. 한 숫자로 접으면 결산이 "의자를 더 놓으라"고 말하는데
   *  실제로는 사람을 뽑아야 하는 상황이 생긴다. */
  leftNoDept: number
  /** 과별 진료·수익 — 수가가 과마다 달라진 뒤로 **총수익을 여기서 유도한다**(Σ revenueManwon).
   *  총액을 따로 들고 있으면 과별 합과 어긋나도 아무도 모른다(deptLedger 불변식 I-A 계승). */
  byDept: SimDeptStats
  /** 수용한 응급 건수 — **도착 즉시 판정** 기준이라 처치 완료가 아니라 받아들인 시점에 센다.
   *  (완료 기준으로 세면 마감에 걸린 처치가 사라져 "받았는데 안 센" 건이 생긴다.) */
  emergencyAccepted: number
  /** 되돌아간 응급 — 카운터가 아니라 **내역**이다. 몇 건인지보다 *왜*가 중요하다:
   *  `NO_SPECIALIST`는 그 과를 안 뽑아서고 `NO_BED`는 병동이 모자라서라, 플레이어가 할 일이
   *  다르다(계획 Task 6이 이 사유를 그대로 토스트로 보여준다). */
  emergencyTurnedAway: EmergencyTurnAway[]
  /**
   * 오늘 **받지 못한** 진료비의 합(만원) — 수납 창구가 없어 그냥 샌 돈이다
   * (`patientFlow.hasCashier`가 거짓일 때 외래·응급의 수가가 여기로 간다).
   *
   * 금고에 안 들어간 돈이라 `byDept`에도 없다 — 그래서 이 축이 없으면 "진료는 했는데 수익이
   * 0"이라는 사실만 남고 **얼마가 샜는지**를 물을 자리가 사라진다(leftNoDept가 leftCount에서
   * 사유를 떼어낸 것과 같은 이유: 그냥 안 번 것과 벌었는데 못 받은 것은 할 일이 다르다).
   * 하루 집계라 아침마다 0으로 돌아간다(freshStats) — 그날치 총액은 DayRecord가 보존한다.
   */
  unpaidManwon: number
}

/** 하루 집계의 영점 — `createWorld`와 `freshMorning`(day.ts)이 **같은 모양**을 써야 한다.
 *  한쪽만 새 필드를 빠뜨리면 그날 집계가 undefined로 시작해 조용히 무너진다. */
export function freshStats(): SimStats {
  return {
    examsDone: 0, leftCount: 0, leftNoDept: 0, byDept: {},
    emergencyAccepted: 0, emergencyTurnedAway: [], unpaidManwon: 0,
  }
}

/**
 * 배경 번호를 0..2로 **떨어뜨린다** — 범위 밖은 뜻이 없으므로 0이다.
 *
 * clamp도 나머지 연산도 아닌 것이 결정이다: 나머지는 음수에서 음수를 낳아(-1 % 3 === -1) 캔버스가
 * 없는 인덱스를 그리려 들고, clamp는 3과 99를 서로 다른 뜻으로 보존한다 — 후보 3종은 **동등**해서
 * 잘못된 값에 담을 뜻이 없다. NaN·소수도 같은 문에서 걸린다(조용히 undefined로 새지 않는다).
 */
const safeBackdrop = (v: number | undefined): number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < BACKDROP_COUNT ? (v as number) : 0

/** 새 세계 — 두 번째 인자는 **가산**이다(생략하면 도심 0번, 기존 호출부 전부 무변). */
export function createWorld(
  seed: number,
  start?: { region?: SimRegionKey; backdrop?: number },
): SimWorld {
  const region = start?.region ?? 'URBAN'
  return {
    minute: 0, day: 1, week: 1, phase: 'RUNNING', treasuryManwon: INITIAL_TREASURY_MANWON,
    walls: new Set(), doors: new Set(), zones: new Map(),
    furniture: [], pawns: [], nextId: 1, seed,
    stats: freshStats(), days: [], insolvencyStreak: 0, weekSettled: false,
    // 시작 풀은 **지역이 정한다** — URBAN은 델타 0이라 전국 풀 그대로다(기존 회귀 무변).
    // ⚠️ 이 한 줄이 **채용 화면에 누가 남아 있는지**까지 정한다: 남은 후보는 시작 풀에서 소비된
    // 슬롯을 뺀 나머지이고(candidate.remainingCandidates), 지역이 풀을 깎으면 뒤쪽 슬롯의
    // 사람들은 그 판에 아예 존재하지 않는다. 이름은 (과, 슬롯)이 정하므로 풀 크기가 바뀌어도
    // 남은 사람들의 이름은 그대로다 — 옛 서수 방식이 겪던 "지역을 깎으면 이름이 밀린다"는
    // 조용한 어긋남(에러 0)이 그 분할로 사라졌다.
    hirePool: regionHirePool(region), hiredSlots: freshHiredSlots(),
    turnedAwayTotal: 0, nursesResignedTotal: 0, lawsuitManwonWeek: 0,
    region, backdrop: safeBackdrop(start?.backdrop),
  }
}

/**
 * 이 가구가 통행을 막는가 — **몸을 얹는 가구(의자·침대)만 막지 않는다.**
 *
 * 앉음·누움을 표현할 수 있는 자리가 타일뿐이라 이 한 줄이 곧 그 정의다: 막히면 폰은 영영 가구
 * **옆**에 설 수밖에 없고(spots.standSpot), 화면에서는 그 가구가 늘 비어 보인다 — 사용자 보고
 * *"의자를 추가해도 캐릭터들이 의자를 사용 안 해"*와 *"응급 환자가 침대에 눕지 않고 옆에 서
 * 있다"*가 정확히 같은 한 줄에서 나온 같은 모습이었다.
 *
 * 침대가 뒤늦게 합류한 것은 **스프라이트가 필요했기 때문이다**: 의자는 앉은 자세와 선 자세가
 * 화면에서 구별되지 않아 타일만으로 성립했지만, 침대는 폰을 눕혀 그려야 "누웠다"로 읽힌다
 * (TileMap의 `lying` 회전 — 그 렌더가 붙은 지금 여기서 막힘을 푸는 것이 곧 기능이다).
 * 책상·카운터는 그대로 막는다 — 그 위에 올라가는 몸은 없다.
 *
 * **판정을 여기 한 줄로 모으는 것이 계약이다** — `isWalkable`과 경로탐색의 `buildBlockedSet`이
 * 각자 종류를 세면 한쪽만 고쳐지는 날 화면과 경로가 다른 세계를 본다(path.test.ts가 전 타일에서
 * 두 판정을 대조하지만, 그건 결과만 볼 뿐 규칙이 하나임을 강제하지는 못한다).
 */
export const blocksWalk = (f: Furniture): boolean => f.kind !== 'CHAIR' && f.kind !== 'BED'

/** 통행 판정 — 벽 ∪ **막는** 가구. **문은 벽이 아니므로 통행 가능**하다.
 *  경로탐색의 `buildBlockedSet`(path.ts)과 같은 규칙을 봐야 한다(path.test.ts가 전 타일에서 대조). */
export function isWalkable(w: SimWorld, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false
  if (w.walls.has(tileIndex(x, y))) return false
  for (const f of w.furniture) if (f.x === x && f.y === y) return !blocksWalk(f)
  return true
}
