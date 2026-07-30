import { describe, it, expect } from 'vitest'
import { BACKDROP_PALETTE, drawBackdrop, relativeLuminance } from './Backdrop'
import { OUTSIDE_FLOOR } from './TileMap'
import type { SimRegionKey } from '@/sim/world'

/**
 * 배경 톤 서열의 회귀 가드.
 *
 * **왜 이 테스트가 있는가**: 배포 화면 실측에서 병원 부지(`OUTSIDE_FLOOR`)가 주변 배경보다
 * 어두워 화면에 뚫린 "구멍"처럼 보였다 — 설계 의도(시선이 병원에 먼저 간다)와 정반대다.
 * 색은 눈으로만 검수하면 다음 사람이 한 칸 밝히는 순간 조용히 되돌아간다. 숫자로 잠근다.
 *
 * 휘도 식은 **프로덕션 코드가 export한 `relativeLuminance`를 그대로 쓴다** — 테스트가 자기 식을
 * 따로 들면 구현과 갈려 초록불이 아무 말도 안 하게 된다.
 */

/** 부지 바닥 휘도 — 이 값이 서열의 기준선이다. 13.3을 여기에 리터럴로 박지 않는다(단일 출처는 TileMap). */
const FLOOR = relativeLuminance(OUTSIDE_FLOOR)

type PaletteKey = keyof typeof BACKDROP_PALETTE

/**
 * 카테고리별 휘도 상한 — 이 표가 곧 스펙이다.
 *
 * 지역 구분은 밝기가 아니라 색조·패턴이 지므로, 배경은 전부 부지보다 어둡게 깐다.
 * **랜드마크만 예외**(≤20): 나무·숲 수관, 물, 천창 불빛, 벤치는 지역 식별의 핵심이라
 * 부지보다 약간 밝은 것까지 허용한다 — 대신 20을 못 넘는다.
 */
const CATEGORIES: ReadonlyArray<{ name: string; cap: number; keys: readonly PaletteKey[] }> = [
  {
    name: '일반 지면(풀밭·논·밭·나대지·포장면)', cap: 11,
    keys: [
      'ground', 'grassBase', 'grassNoiseLight', 'grassNoiseDark', 'medianStrip',
      'pavementBase', 'pavementNoiseLight', 'pavementNoiseDark', 'pavementSeam',
      'parkingLot', 'dirtBase', 'dirtNoiseLight', 'dirtNoiseDark',
      'fieldFurrowLight', 'fieldFurrowDark',
      'paddyBase', 'paddyCellLight', 'paddyCellDark',
      'forestFloor', 'houseYardShadow',
    ],
  },
  {
    name: '건물·시설·차량(옥상·아파트·주택 지붕·옥탑/실외기)', cap: 12,
    keys: [
      'roofBase', 'roofEdge', 'roofVent', 'roofVentShade', 'roofPenthouse',
      'aptBody', 'aptEdge', 'aptTower', 'aptTowerLit',
      'houseRoofWarm', 'houseRoofWarmShade', 'houseRidgeWarm',
      'houseRoofCool', 'houseRoofCoolShade', 'houseRidgeCool',
      'materialStack', 'materialStackShade', 'breakwater', 'lampPost',
      'vehicleBlue', 'vehicleRed', 'vehicleGreen',
    ],
  },
  {
    name: '도로·인도·산책로·논둑', cap: 13,
    keys: ['road', 'sidewalk', 'laneShoulder', 'dirtLane', 'leveePath', 'seawall', 'parkPath', 'paddyBank'],
  },
  { name: '풀포기·관목', cap: 15, keys: ['tuft', 'tuftShade', 'shrub'] },
  {
    name: '랜드마크(수관·물·천창 불빛·벤치)', cap: 20,
    keys: [
      'treeCanopy', 'treeCanopyLit', 'treeShade',
      'forestCanopy', 'forestCanopyLit', 'forestCanopyDark',
      'riverBase', 'riverFlow', 'seaBase', 'seaRipple',
      'roofSkylight', 'bench',
    ],
  },
]

describe('BACKDROP_PALETTE — 배경은 부지보다 어둡다', () => {
  it.each(CATEGORIES)('$name: 모든 항목이 휘도 $cap 이하', ({ cap, keys }) => {
    for (const key of keys) {
      const hex = BACKDROP_PALETTE[key]
      const L = relativeLuminance(hex)
      expect(L, `${key}(${hex}) = ${L.toFixed(2)}`).toBeLessThanOrEqual(cap)
    }
  })

  /**
   * 위 카테고리 검사는 "값 ≤ 상한"만 본다 — **상한 자체가 느슨해지면 통과하면서 목적이 증발한다.**
   * 그래서 상한을 부지 바닥에 묶는다. 값 검사와 이 검사가 함께여야 "배경 < 부지"가 실제로 잠긴다.
   * (돌연변이 실측: 이 단언 없이 상한을 13→14로 올리면 아무 테스트도 안 깨졌다.)
   */
  it('지면·건물·도로의 상한은 부지 바닥보다 낮게 잡혀 있다 — 부지가 "구멍"이 아니라 무대가 되도록', () => {
    for (const cat of CATEGORIES.filter((c) => c.name !== '풀포기·관목' && c.cap !== 20)) {
      expect(cat.cap, `${cat.name} 상한 ${cat.cap} vs 부지 ${FLOOR.toFixed(2)}`).toBeLessThan(FLOOR)
    }
  })

  it('랜드마크도 20을 못 넘는다 — 부지보다 밝아도 되지만 시선을 뺏으면 안 된다', () => {
    const landmark = CATEGORIES.find((c) => c.cap === 20)!
    for (const key of landmark.keys) {
      expect(relativeLuminance(BACKDROP_PALETTE[key])).toBeLessThanOrEqual(20)
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
