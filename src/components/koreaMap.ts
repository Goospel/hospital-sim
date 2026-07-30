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
}

/**
 * 선택 가능한 17곳.
 *
 * **분류 근거는 인구 규모와 도시 성격이지 개별 지표가 아니다.** 응급의료분야 의료취약지
 * (복지부 고시)·인구감소지역(행안부) 같은 고시가 실재하지만, 17곳 각각의 명단 포함 여부를
 * 원문으로 확인하지 않았으므로 **화면에 시군별 수치를 적지 않는다**. 이 프로젝트가 "근거 있는
 * 것만 말한다"를 지켜 온 자리이고, 제도 비판은 이미 타입의 규칙(`REGIONS`)이 지고 있다.
 * 분류 자체(서울=대도시, 신안군=농어촌)는 근거를 댈 필요가 없을 만큼 자명한 선에서 멈춘다.
 *
 * 제주에 서귀포가 있는 이유는 균형이 아니라 **거짓말 방지**다 — 섬을 그려 놓고 못 고르게 하면
 * 지도가 아니라 버그로 읽힌다. 그래서 지방 소도시만 다섯이다.
 */
export const PLACES: readonly MapPlace[] = [
  { key: 'seoul', label: '서울', region: 'URBAN', col: 6, row: 7 },
  { key: 'busan', label: '부산', region: 'URBAN', col: 19, row: 26 },
  { key: 'daegu', label: '대구', region: 'URBAN', col: 16, row: 20 },
  { key: 'gwangju', label: '광주', region: 'URBAN', col: 6, row: 26 },

  { key: 'hwaseong', label: '경기 화성시', region: 'NEWTOWN', col: 7, row: 10 },
  { key: 'sejong', label: '세종', region: 'NEWTOWN', col: 8, row: 16 },
  { key: 'gimpo', label: '경기 김포시', region: 'NEWTOWN', col: 4, row: 7 },
  { key: 'yangsan', label: '경남 양산시', region: 'NEWTOWN', col: 19, row: 24 },

  { key: 'andong', label: '경북 안동시', region: 'PROVINCIAL', col: 17, row: 15 },
  { key: 'mokpo', label: '전남 목포시', region: 'PROVINCIAL', col: 3, row: 28 },
  { key: 'jeongeup', label: '전북 정읍시', region: 'PROVINCIAL', col: 6, row: 23 },
  { key: 'samcheok', label: '강원 삼척시', region: 'PROVINCIAL', col: 19, row: 8 },
  { key: 'seogwipo', label: '제주 서귀포시', region: 'PROVINCIAL', col: 4, row: 40 },

  { key: 'sinan', label: '전남 신안군', region: 'RURAL', col: 2, row: 28 },
  { key: 'yeongyang', label: '경북 영양군', region: 'RURAL', col: 19, row: 14 },
  { key: 'hadong', label: '경남 하동군', region: 'RURAL', col: 11, row: 26 },
  { key: 'goseong', label: '강원 고성군', region: 'RURAL', col: 15, row: 1 },
]

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
