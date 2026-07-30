import { describe, it, expect } from 'vitest'
import { BACKDROP_PALETTE, drawBackdrop, relativeLuminance } from './Backdrop'
import { OUTSIDE_FLOOR } from './TileMap'
import type { SimRegionKey } from '@/sim/world'

/**
 * 배경 톤 서열의 회귀 가드 — **두 방향**을 함께 잠근다.
 *
 * **왜 이 테스트가 있는가**: ① 배포 화면 실측에서 병원 부지(`OUTSIDE_FLOOR`)가 주변 배경보다
 * 어두워 화면에 뚫린 "구멍"처럼 보였다 — 설계 의도(시선이 병원에 먼저 간다)와 정반대다.
 * ② 그걸 고치자 **반대쪽으로 넘어갔다**: 전부 부지 아래로 눌러 담았더니 배경 내부의 밝기 차까지
 * 압축돼(지면 9.22 vs 건물 9.5~10.5) 건물 윤곽이 지면에 묻혔다. 상한만 보는 검사는 이 "다 같이
 * 어두워짐"을 **통과시킨다** — 그래서 하한·평균 서열·최소 간격을 함께 단언한다.
 * 색은 눈으로만 검수하면 다음 사람이 한 칸 밝히는 순간 조용히 되돌아간다. 숫자로 잠근다.
 *
 * 휘도 식은 **프로덕션 코드가 export한 `relativeLuminance`를 그대로 쓴다** — 테스트가 자기 식을
 * 따로 들면 구현과 갈려 초록불이 아무 말도 안 하게 된다.
 */

/** 부지 바닥 휘도 — 이 값이 서열의 기준선이다. 13.3을 여기에 리터럴로 박지 않는다(단일 출처는 TileMap). */
const FLOOR = relativeLuminance(OUTSIDE_FLOOR)

type PaletteKey = keyof typeof BACKDROP_PALETTE

/**
 * 카테고리별 휘도 **구간** — 이 표가 곧 스펙이다.
 *
 * ⚠️ **상한만 있으면 안 된다.** 첫 판(상한 전용)은 "배경 < 부지"는 잠갔지만 **전부 같이 어두워지는 것**을
 * 못 막았고, 실제로 그 회귀가 났다 — 지면 9.22 · 건물 9.5~10.5로 간격이 0.3~1.3까지 눌려 건물 윤곽이
 * 지면에 묻혔다(브라우저 실측: 도심 상단 2/3가 균일한 검정, 아파트 동이 사라짐). 그래서 하한을 함께 잠근다.
 *
 * 하한이 없는 칸(`min` 생략)은 표가 상한만 정한 자리다 — 그쪽은 아래 **간격 단언**이 대신 잠근다.
 */
const CATEGORIES: ReadonlyArray<{ name: string; min?: number; max: number; keys: readonly PaletteKey[] }> = [
  {
    name: '지면 base(풀밭·포장면·논·밭 어두운 이랑·나대지)', min: 5.5, max: 7.5,
    keys: [
      'ground', 'grassBase', 'grassNoiseDark', 'medianStrip',
      'pavementBase', 'pavementNoiseDark', 'pavementSeam', 'parkingLot',
      'dirtBase', 'dirtNoiseDark', 'fieldFurrowDark',
      'paddyBase', 'paddyCellDark', 'forestFloor', 'houseYardShadow',
    ],
  },
  {
    name: '지면 노이즈(밝은 쪽)·논둑', min: 7.5, max: 9.5,
    keys: ['grassNoiseLight', 'pavementNoiseLight', 'dirtNoiseLight', 'fieldFurrowLight', 'paddyCellLight', 'paddyBank'],
  },
  { name: '도로', min: 8, max: 9.5, keys: ['road', 'laneShoulder', 'dirtLane'] },
  { name: '인도·산책로', min: 10, max: 11.5, keys: ['sidewalk', 'parkPath', 'leveePath', 'seawall'] },
  {
    name: '건물 본체·시설·차량(옥상·아파트·주택 지붕)', min: 9, max: 11.5,
    keys: [
      'roofBase', 'roofEdge', 'aptBody', 'aptEdge',
      'houseRoofWarm', 'houseRoofWarmShade', 'houseRoofCool', 'houseRoofCoolShade',
      'materialStack', 'materialStackShade', 'breakwater', 'lampPost',
      'vehicleBlue', 'vehicleRed', 'vehicleGreen',
    ],
  },
  {
    name: '건물 디테일(실외기·승강기탑·용마루·옥탑)', max: 13,
    keys: ['roofVent', 'roofVentShade', 'roofPenthouse', 'aptTower', 'aptTowerLit', 'houseRidgeWarm', 'houseRidgeCool'],
  },
  { name: '풀포기·관목', min: 9, max: 12, keys: ['tuft', 'tuftShade', 'shrub'] },
  {
    name: '랜드마크(수관·숲·하천·바다·천창 불빛·벤치)', min: 11, max: 13.2,
    keys: [
      'treeCanopy', 'treeCanopyLit', 'treeShade',
      'forestCanopy', 'forestCanopyLit', 'forestCanopyDark',
      'riverBase', 'riverFlow', 'seaBase', 'seaRipple',
      'roofSkylight', 'bench',
    ],
  },
]

const cat = (name: string) => CATEGORIES.find((c) => c.name.startsWith(name))!
/** 카테고리의 평균 휘도 — 서열·간격 단언의 단위. 개별 값이 아니라 면적감이 서열을 만든다. */
const meanL = (name: string) => {
  const { keys } = cat(name)
  return keys.reduce((s, k) => s + relativeLuminance(BACKDROP_PALETTE[k]), 0) / keys.length
}

const GROUND = '지면 base', BODY = '건물 본체', DETAIL = '건물 디테일'
const LANDMARK = '랜드마크', ROAD = '도로', WALK = '인도'

describe('BACKDROP_PALETTE — 배경은 부지보다 어둡되, 배경 안에서는 형태가 읽힌다', () => {
  it.each(CATEGORIES)('$name: 모든 항목이 구간 안에 있다', ({ min, max, keys }) => {
    for (const key of keys) {
      const hex = BACKDROP_PALETTE[key]
      const L = relativeLuminance(hex)
      const label = `${key}(${hex}) = ${L.toFixed(2)}`
      expect(L, label).toBeLessThanOrEqual(max)
      if (min !== undefined) expect(L, label).toBeGreaterThanOrEqual(min)
    }
  })

  /**
   * 서열 — 면적을 지배하는 지면이 가장 어둡고, 그 위에 건물, 그 위에 랜드마크, 맨 위가 부지다.
   * 이 단언은 표가 아니라 **팔레트 값에서 직접 파생**하므로 상한·하한 표가 통째로 느슨해져도 살아남는다.
   */
  it('평균 휘도 서열: 지면 < 건물 본체 < 랜드마크 < 부지 바닥', () => {
    const g = meanL(GROUND), b = meanL(BODY), l = meanL(LANDMARK)
    const trace = `지면 ${g.toFixed(2)} / 건물 ${b.toFixed(2)} / 랜드마크 ${l.toFixed(2)} / 부지 ${FLOOR.toFixed(2)}`
    expect(g, trace).toBeLessThan(b)
    expect(b, trace).toBeLessThan(l)
    expect(l, trace).toBeLessThan(FLOOR)
  })

  /**
   * 간격 — 서열만으로는 부족하다. 0.3 차이도 "작다"가 아니라 "같다"로 보이기 때문이다.
   * 이 세 간격이 각각 무엇을 지키는지: 건물이 지면에서 떠오르는가 · 인도가 도로와 갈리는가 ·
   * 옥상 요철이 지붕 위에서 읽히는가.
   */
  it.each([
    { what: '건물 본체 − 지면', a: BODY, b: GROUND, gap: 2.5 },
    { what: '인도 − 도로', a: WALK, b: ROAD, gap: 1.0 },
    { what: '건물 디테일 − 건물 본체', a: DETAIL, b: BODY, gap: 1.0 },
  ])('$what 평균 간격이 $gap 이상 — 스프레드가 눌리면 형태가 안 읽힌다', ({ what, a, b, gap }) => {
    const d = meanL(a) - meanL(b)
    expect(d, `${what} = ${meanL(a).toFixed(2)} − ${meanL(b).toFixed(2)} = ${d.toFixed(2)}`).toBeGreaterThanOrEqual(gap)
  })

  /**
   * 위 카테고리 검사는 "값 ≤ 상한"만 본다 — **상한 자체가 느슨해지면 통과하면서 목적이 증발한다.**
   * 그래서 상한을 부지 바닥에 묶는다. 값 검사와 이 검사가 함께여야 "배경 < 부지"가 실제로 잠긴다.
   * (돌연변이 실측: 이 단언 없이 상한을 13→14로 올리면 아무 테스트도 안 깨졌다.)
   */
  it('카테고리 상한이 전부 부지 바닥보다 낮게 잡혀 있다 — 부지가 "구멍"이 아니라 무대가 되도록', () => {
    for (const c of CATEGORIES) {
      expect(c.max, `${c.name} 상한 ${c.max} vs 부지 ${FLOOR.toFixed(2)}`).toBeLessThan(FLOOR)
    }
  })

  it('팔레트의 모든 키가 정확히 한 카테고리에 속한다 — 새 색이 상한 없이 새어 들어오면 가드가 죽는다', () => {
    const covered = CATEGORIES.flatMap((c) => c.keys)
    expect(new Set(covered).size, '카테고리 간 중복 없음').toBe(covered.length)
    expect([...covered].sort()).toEqual(Object.keys(BACKDROP_PALETTE).sort())
  })

  it('relativeLuminance는 부지 바닥 #0d0d11을 13.3으로 읽는다 — 실측치와 같은 식임을 못박는다', () => {
    expect(relativeLuminance('#0d0d11')).toBeCloseTo(13.29, 2)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(255, 4)
  })
})

/**
 * 12종이 **끝까지 그려지는지**만 본다(그림의 아름다움은 눈이 판정한다).
 * 포장면의 이음매 루프와 가로등 방사형 그라디언트가 이번에 새로 들어와, 종료·API 사용을
 * 확인할 계측기가 없으면 무한 루프나 오타가 배포까지 간다.
 */
describe('drawBackdrop — 12종이 예외 없이 끝까지 그려진다', () => {
  /** 캔버스 없는 노드 환경용 최소 스텁 — 호출을 세기만 한다. */
  const stubCtx = () => {
    const calls = { fillRect: 0, gradient: 0, fills: new Set<string>() }
    return {
      calls,
      ctx: {
        set fillStyle(v: unknown) { if (typeof v === 'string') calls.fills.add(v) },
        set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
        fillRect: () => { calls.fillRect++ },
        strokeRect: () => {}, clearRect: () => {}, beginPath: () => {}, fill: () => {},
        arc: () => {}, setLineDash: () => {},
        createRadialGradient: () => { calls.gradient++; return { addColorStop: () => {} } },
      } as unknown as CanvasRenderingContext2D,
    }
  }

  const REGIONS: readonly SimRegionKey[] = ['URBAN', 'NEWTOWN', 'PROVINCIAL', 'RURAL']

  it.each(REGIONS)('%s의 변형 0·1·2가 모두 완주하고 실제로 뭔가를 그린다', (region) => {
    for (const variant of [0, 1, 2]) {
      const { ctx, calls } = stubCtx()
      expect(() => drawBackdrop(ctx, region, variant)).not.toThrow()
      expect(calls.fillRect, `${region}/${variant}`).toBeGreaterThan(100)
    }
  })

  it.each([0, 1, 2])('도심 변형 %i의 바닥은 잔디가 아니라 포장면이다 — 건물 사이가 초록이면 도심으로 안 읽힌다', (variant) => {
    const { ctx, calls } = stubCtx()
    drawBackdrop(ctx, 'URBAN', variant)
    expect(calls.fills).toContain(BACKDROP_PALETTE.pavementBase)
    expect(calls.fills).not.toContain(BACKDROP_PALETTE.grassBase)
  })

  it('도심 밖(농촌)은 잔디를 유지한다 — 포장면 교체는 도심 3종에 한정된 변경이다', () => {
    const { ctx, calls } = stubCtx()
    drawBackdrop(ctx, 'RURAL', 1)
    expect(calls.fills).toContain(BACKDROP_PALETTE.grassBase)
    expect(calls.fills).not.toContain(BACKDROP_PALETTE.pavementBase)
  })

  it('가로등이 있는 변형은 단색 원반이 아니라 방사형 그라디언트를 만든다', () => {
    // urban2는 lamp를 4개 세운다 — 얼룩처럼 보이던 단색 arc로 되돌아가면 여기서 걸린다.
    const { ctx, calls } = stubCtx()
    drawBackdrop(ctx, 'URBAN', 2)
    expect(calls.gradient).toBe(4)
  })
})
