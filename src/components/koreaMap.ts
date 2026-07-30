import type { SimRegionKey } from '@/sim/world'

/**
 * ── 대한민국 격자 지도 — 「어디에 병원을 지을까요」의 무대
 *
 * 지역 선택은 원래 카드 네 장이었다. 카드는 규칙을 정확히 말하지만 **어디인지는 말하지 않는다** —
 * "지방 소도시"는 분류이지 장소가 아니다. 림월드가 시작 시 지형을 고르게 하는 이유가 그것이라,
 * 여기서도 실제 대한민국을 펴 놓고 그 위의 한 점을 고르게 한다.
 *
 * ⚠️ **이 지도는 규칙을 하나도 안 쥔다.** 값 표의 단일 출처는 여전히 `world.REGIONS`이고, 여기
 * 있는 것은 「실제 지역 → 그 네 타입 중 하나」라는 **매핑뿐**이다. 서울을 고르든 부산을 고르든
 * 세계는 똑같은 `URBAN`으로 선다. 지역마다 수치를 따로 두고 싶어지면 그때는 이 파일이 아니라
 * `REGIONS`를 늘려야 한다 — 안 그러면 값이 두 곳에 살게 된다.
 *
 * ⚠️ **마스크는 손으로 찍은 그림이 아니라 실제 경계의 래스터화 결과다.** 통계청 2018 시도 경계
 * (southkorea-maps, `skorea-provinces-2018-topo-simple`)를 위도 33.15~38.62 · 경도 125.05~129.62
 * 로 자르고, 한 칸이 실거리로 정사각형이 되도록(Δ위도 = Δ경도 × cos36°) 28열로 나눈 뒤 칸마다
 * 5×5로 표집해 육지 비율 18% 이상을 육지로 잡았다. 그 다음 빈 행·열을 잘라 23×41이 됐다.
 * 눈대중이 아니라서 해안선·제주·최북단(강원 고성)이 제자리에 있다.
 *
 * 재생성이 필요하면(해상도 변경 등) 위 절차를 다시 밟는다. 결과가 통째로 어긋나는 사고는
 * koreaMap.test.ts의 육지 비율 밴드가 잡는다.
 */

/** 육지 `#` · 바다 `.` — 행이 북→남, 열이 서→동. */
export const KOREA_MASK: readonly string[] = [
  '...............#.......',
  '..............##.......',
  '.......##########......',
  '......###########......',
  '......############.....',
  '.....#############.....',
  '..#################....',
  '...#################...',
  '...#################...',
  '....#################..',
  '....##################.',
  '.....#################.',
  '...###################.',
  '..####################.',
  '.#####################.',
  '..####################.',
  '...###################.',
  '....##################.',
  '....##################.',
  '....###################',
  '....###################',
  '....###################',
  '....##################.',
  '...###################.',
  '...###################.',
  '..###################..',
  '.###################...',
  '...#############.#.....',
  '.#############.###.....',
  '##############..#......',
  '.#########.#...........',
  '.######.##.............',
  '....##.................',
  '....#..................',
  '.......................',
  '.......................',
  '.......................',
  '.......................',
  '...###.................',
  '..#####................',
  '..####.................',
]

export const MAP_COLS = 23
export const MAP_ROWS = KOREA_MASK.length

/** 격자 밖은 바다다 — 호출부가 경계를 매번 확인하지 않아도 되게 여기서 흡수한다. */
export function isLand(col: number, row: number): boolean {
  return row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS && KOREA_MASK[row][col] === '#'
}

/**
 * 정부가 공식으로 지정한 딱지 — **게임 규칙에 닿지 않는다.** 규칙은 여전히 타입(`REGIONS`)이
 * 전부 쥐고, 이건 플레이어가 고를 때 읽는 **사실**이다.
 *
 * ⚠️ **원문 대조 없이 항목을 늘리지 않는다.** 여기 있는 둘은 2026-07-30에 고시·공고 원문에서
 * 직접 확인했다(출처는 아래 `source`, 전체 목록은 `docs/research/medical-vulnerable-area-designations.md`).
 * 분만취약지는 **의도적으로 뺐다** — 고시 별표가 아니라 연간 지원사업 지침으로 운영되고,
 * 무엇보다 이 게임에 산부인과가 없어 **어떤 규칙에도 닿지 않는 사실**이 된다.
 */
export type DesignationKey = 'EMERGENCY_VULNERABLE' | 'POPULATION_DECLINING'

export const DESIGNATIONS: Record<DesignationKey, { label: string; source: string }> = {
  EMERGENCY_VULNERABLE: {
    label: '응급의료 취약지',
    source: '보건복지부 고시 제2024-261호(2024.12.30) 제2조',
  },
  POPULATION_DECLINING: {
    label: '인구감소지역',
    source: '행정안전부 인구감소지역 지정(89개 시군구)',
  },
}

export interface MapPlace {
  /** 화면에 안 나오는 안정 식별자 — 라벨을 다듬어도 선택 상태가 안 깨진다. */
  key: string
  /** 화면 이름. 광역시는 시도명이 곧 지명이라 한 낱말이고, 나머지는 「시도 시군」으로
   *  적는다 — **고성이 강원과 경남에 둘 있다.** 시도를 빼면 어디를 고른 건지 모른다. */
  label: string
  /** 이 지역이 속한 규칙 타입. 규칙 자체는 `REGIONS[region]`이 소유한다. */
  region: SimRegionKey
  col: number
  row: number
  /** 이 지역에 붙은 공식 지정. 없으면 빈 배열이고, 화면은 **아무 말도 안 한다**. */
  designations: readonly DesignationKey[]
}

/**
 * 선택 가능한 17곳.
 *
 * **타입 분류의 근거는 인구 규모와 도시 성격이지 지정 여부가 아니다.** `designations`는 분류를
 * *만든* 값이 아니라 고른 뒤에 읽는 사실이고, 실제로 둘은 어긋난다 — 지방 소도시 다섯 중
 * 정읍·삼척은 양쪽 지정, 서귀포는 응급만, 안동은 인구감소만, **목포는 어느 쪽도 아니다**
 * (안동·목포는 권역 거점이라 응급 취약지에서 빠진다). 그 어긋남이 화면에 보이는 것이 맞다:
 * "지방 소도시"라는 한 타입 안에 지정된 곳과 안 된 곳이 섞여 있는 게 실제 데이터다.
 *
 * 제주에 서귀포가 있는 이유는 균형이 아니라 **거짓말 방지**다 — 섬을 그려 놓고 못 고르게 하면
 * 지도가 아니라 버그로 읽힌다. 그래서 지방 소도시만 다섯이다.
 *
 * ⚠️ `designations`를 고치려면 **고시 원문을 다시 본다**(`koreaMap.test.ts`의 대조표가 잠근다).
 */
const NONE: readonly DesignationKey[] = []
const EMG: readonly DesignationKey[] = ['EMERGENCY_VULNERABLE']
const POP: readonly DesignationKey[] = ['POPULATION_DECLINING']
const BOTH: readonly DesignationKey[] = ['EMERGENCY_VULNERABLE', 'POPULATION_DECLINING']

export const PLACES: readonly MapPlace[] = [
  { key: 'seoul', label: '서울', region: 'URBAN', col: 6, row: 7, designations: NONE },
  { key: 'busan', label: '부산', region: 'URBAN', col: 19, row: 26, designations: NONE },
  { key: 'daegu', label: '대구', region: 'URBAN', col: 16, row: 20, designations: NONE },
  { key: 'gwangju', label: '광주', region: 'URBAN', col: 6, row: 26, designations: NONE },

  { key: 'hwaseong', label: '경기 화성시', region: 'NEWTOWN', col: 7, row: 10, designations: NONE },
  { key: 'sejong', label: '세종', region: 'NEWTOWN', col: 8, row: 16, designations: NONE },
  { key: 'gimpo', label: '경기 김포시', region: 'NEWTOWN', col: 4, row: 7, designations: NONE },
  { key: 'yangsan', label: '경남 양산시', region: 'NEWTOWN', col: 19, row: 24, designations: NONE },

  { key: 'andong', label: '경북 안동시', region: 'PROVINCIAL', col: 17, row: 15, designations: POP },
  { key: 'mokpo', label: '전남 목포시', region: 'PROVINCIAL', col: 3, row: 28, designations: NONE },
  { key: 'jeongeup', label: '전북 정읍시', region: 'PROVINCIAL', col: 6, row: 23, designations: BOTH },
  { key: 'samcheok', label: '강원 삼척시', region: 'PROVINCIAL', col: 19, row: 8, designations: BOTH },
  { key: 'seogwipo', label: '제주 서귀포시', region: 'PROVINCIAL', col: 4, row: 40, designations: EMG },

  { key: 'sinan', label: '전남 신안군', region: 'RURAL', col: 2, row: 28, designations: BOTH },
  { key: 'yeongyang', label: '경북 영양군', region: 'RURAL', col: 19, row: 14, designations: BOTH },
  { key: 'hadong', label: '경남 하동군', region: 'RURAL', col: 11, row: 26, designations: BOTH },
  { key: 'goseong', label: '강원 고성군', region: 'RURAL', col: 15, row: 1, designations: BOTH },
]

/**
 * 지정 딱지 한 줄 — **없으면 빈 문자열**이다.
 *
 * 「중립 축은 안 적는다」의 지도판(`regionRuleText`가 URBAN의 배율 1을 안 적는 것과 같다).
 * 서울에 "취약지 아님"을 적는 건 정보가 아니라 소음이고, 빈 줄이 곧 "지정 없음"을 말한다.
 */
export function designationText(place: MapPlace): string {
  return place.designations.map(d => DESIGNATIONS[d].label).join(' · ')
}

export function placesByRegion(region: SimRegionKey): MapPlace[] {
  return PLACES.filter(p => p.region === region)
}

/**
 * 육지를 **가로 런으로 묶어** 돌려준다 — 칸마다 사각형을 그리면 516개, 런으로 묶으면 60여 개다.
 * 화면에 보이는 결과는 같고 DOM만 줄어든다.
 */
export function landRuns(): ReadonlyArray<{ row: number; col: number; len: number }> {
  const runs: { row: number; col: number; len: number }[] = []
  for (let row = 0; row < MAP_ROWS; row++) {
    let col = 0
    while (col < MAP_COLS) {
      if (KOREA_MASK[row][col] !== '#') { col++; continue }
      let len = 0
      while (col + len < MAP_COLS && KOREA_MASK[row][col + len] === '#') len++
      runs.push({ row, col, len })
      col += len
    }
  }
  return runs
}
