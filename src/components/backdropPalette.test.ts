import { describe, it, expect } from 'vitest'
import { BACKDROP_PALETTE, drawBackdrop, relativeLuminance } from './Backdrop'
import { OUTSIDE_FLOOR, NEUTRAL_STYLE, ROOM_STYLE, SHADE, shade, wallBands } from './TileMap'
import type { SimRegionKey } from '@/sim/world'

/**
 * 배경 톤 서열의 회귀 가드 — **두 방향**을 함께 잠근다.
 *
 * **왜 이 테스트가 있는가**: ① 배포 화면 실측에서 병원 부지(`OUTSIDE_FLOOR`)가 주변 배경보다
 * 어두워 화면에 뚫린 "구멍"처럼 보였다 — 설계 의도(시선이 병원에 먼저 간다)와 정반대다.
 * ② 그걸 고치자 **반대쪽으로 넘어갔다**: 전부 부지 아래로 눌러 담았더니 배경 내부의 밝기 차까지
 * 압축돼(지면 9.22 vs 건물 9.5~10.5) 건물 윤곽이 지면에 묻혔다. 상한만 보는 검사는 이 "다 같이
 * 어두워짐"을 **통과시킨다** — 그래서 하한·평균 서열·최소 간격을 함께 단언한다.
 * ③ 그래도 부족했다: 부지 천장이 13.29라 배경이 쓸 대역이 5~13뿐이었고, 그 좁은 구간에서는 지면·건물·
 * 물의 층위가 인지되지 않았다(해안·대로변 상단이 거의 균일한 검정). **천장 자체를 20.4로 올려** 대역을
 * 넓힌 것이 지금 표다 — 서열은 그대로 두고 전 항목을 위로 펼쳤다.
 * ④ **그것도 부족했다(2026-07-30)**: 20.4 천장에서도 배경 전체가 7~19에 갇혀 브라우저 실측상 부지 좌우가
 * 그냥 검정이었다 — 지역별 배경 12종이 화면에서 사라졌다. 세 번째 확장에서 **서열과 간격은 그대로 두고
 * 절대값만 3~3.5배로** 옮겼다(부지 천장 20.4 → 71.3).
 * ⑤ **밝은 병원 톤으로 전환(2026-07-31)**: 어두운 저채도 화면을 중간톤으로 올리는 아트 디렉션 변경이다.
 * 같은 방식으로 **서열은 그대로 두고 구간표와 요구 간격을 함께 ×2.4** 했다 — 대역만 올리고 요구 간격을
 * 두면 통과 기준이 2.4분의 1로 느슨해진다(아래 간격 단언의 ⚠️). 아래 표가 그 결과다. 팔레트 값과
 * 부지 천장(`OUTSIDE_FLOOR`)은 뒤따르는 커밋에서 이 표를 향해 올라온다(지금은 표가 먼저 간 RED 상태다).
 * ⚠️ 이 표는 이제 **알베도**(음영이 곱해지기 전 값)를 잠근다 — 실내는 `TileMap.shade`가 타일마다 조명·AO
 * 계수를 곱하므로, 최종 픽셀의 서열은 맨 아래 「알베도 서열이 음영을 거쳐도 살아남는다」가 따로 잠근다.
 * 색은 눈으로만 검수하면 다음 사람이 한 칸 밝히는 순간 조용히 되돌아간다. 숫자로 잠근다.
 *
 * 휘도 식은 **프로덕션 코드가 export한 `relativeLuminance`를 그대로 쓴다** — 테스트가 자기 식을
 * 따로 들면 구현과 갈려 초록불이 아무 말도 안 하게 된다.
 */

/** 부지 바닥 휘도 — 이 값이 서열의 기준선이다. 숫자를 여기에 리터럴로 박지 않는다(단일 출처는 TileMap). */
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
    name: '지면 base(풀밭·포장면·논·밭 어두운 이랑·나대지)', min: 82, max: 100,
    keys: [
      'ground', 'grassBase', 'grassNoiseDark', 'medianStrip',
      'pavementBase', 'pavementNoiseDark', 'pavementSeam', 'parkingLot',
      'dirtBase', 'dirtNoiseDark', 'fieldFurrowDark',
      'paddyBase', 'paddyCellDark', 'forestFloor', 'houseYardShadow',
    ],
  },
  {
    name: '지면 노이즈(밝은 쪽)·논둑', min: 98, max: 114,
    keys: ['grassNoiseLight', 'pavementNoiseLight', 'dirtNoiseLight', 'fieldFurrowLight', 'paddyCellLight', 'paddyBank'],
  },
  { name: '도로', min: 92, max: 108, keys: ['road', 'laneShoulder', 'dirtLane'] },
  { name: '인도·산책로', min: 116, max: 132, keys: ['sidewalk', 'parkPath', 'leveePath', 'seawall'] },
  {
    name: '건물 본체·시설·차량(옥상·아파트·주택 지붕)', min: 122, max: 142,
    keys: [
      'roofBase', 'roofEdge', 'aptBody', 'aptEdge',
      'houseRoofWarm', 'houseRoofWarmShade', 'houseRoofCool', 'houseRoofCoolShade',
      'materialStack', 'materialStackShade', 'breakwater', 'lampPost',
      'vehicleBlue', 'vehicleRed', 'vehicleGreen',
    ],
  },
  {
    name: '건물 디테일(실외기·승강기탑·용마루·옥탑)', min: 143, max: 156,
    keys: ['roofVent', 'roofVentShade', 'roofPenthouse', 'aptTower', 'aptTowerLit', 'houseRidgeWarm', 'houseRidgeCool'],
  },
  { name: '풀포기·관목', min: 104, max: 128, keys: ['tuft', 'tuftShade', 'shrub'] },
  {
    name: '랜드마크(수관·숲·하천·바다·천창 불빛·벤치)', min: 134, max: 152,
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
  /* ⚠️ 대역을 3.5배로 넓혔으면 **요구 간격도 함께 올려야 한다** — 옛 값(4.0/1.5/1.5)을 그대로 두면
     새 대역에서는 통과 기준이 4분의 1로 느슨해져, 다음 사람이 전 항목을 다시 눌러 담아도 초록불이
     뜬다(이 파일이 세 번 경고한 "상한이 느슨해지면 통과하면서 목적이 증발" 그 자리다).
     ⑤(2026-07-31)에서 실제로 그 자리를 밟을 뻔했다 — 대역만 ×2.4 하고 요구 간격을 두면 요구/실측 비율이
     65% → 27%(정확히 1/2.4)로 내려앉는다. 그래서 14.0/5.0/6.0 → **33.6/12.0/14.4**로 같은 배수를 먹였다.
     교훈: 이 세 숫자는 대역과 **같은 커밋에서** 움직여야 한다 — 쪼개면 불변식이 깨진 커밋이 히스토리에 남는다.
     ⚠️ **⑥(2026-08-01)은 방향이 반대다** — 야경에서 낮으로 가며 지면(면적 지배)을 63.5 → 90.1로
     끌어올려 스프레드를 79 → 52로 **좁혔다**. 대역을 좁히면서 옛 간격(33.6/12.0/14.4)을 두면
     이번엔 느슨해지는 게 아니라 **통과가 불가능**해진다. 방향이 어느 쪽이든 규칙은 같다:
     이 세 숫자는 대역과 같은 커밋에서 움직인다. */
  it.each([
    { what: '건물 본체 − 지면', a: BODY, b: GROUND, gap: 27.8 },
    { what: '인도 − 도로', a: WALK, b: ROAD, gap: 13.0 },
    { what: '건물 디테일 − 건물 본체', a: DETAIL, b: BODY, gap: 12.5 },
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

  /** 식 자체의 고정점 — **부지 값이 아니라 계산식**을 못박는다(#14141a는 옛 부지색이고, 지금 부지는
   *  아래 `OUTSIDE_FLOOR`가 든다). 이 셋이 흔들리면 위 모든 숫자의 의미가 함께 흔들린다. */
  it('relativeLuminance의 고정점 — 식이 바뀌면 위 표 전체의 뜻이 바뀐다', () => {
    expect(relativeLuminance('#14141a')).toBeCloseTo(20.43, 2)
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(255, 4)
  })

  /** 배경 대역을 넓힌 만큼 **부지 천장도 같이 올라가 있어야** 한다 — 한쪽만 옮기면 ①의 "구멍" 회귀다. */
  it('부지 바닥이 배경 최상단 카테고리보다 충분히 위에 있다 — 여유 5 이상', () => {
    const top = Math.max(...CATEGORIES.map((c) => c.max))
    expect(FLOOR - top, `부지 ${FLOOR.toFixed(2)} − 배경 상한 ${top}`).toBeGreaterThanOrEqual(5)
  })

  /* 「실내 > 마당」은 여기 두지 않는다 — 아래 describe의 `%s 방 바닥이 부지보다 밝다` +
     `%s 벽이 자기 바닥보다 밝다`가 ROOM_STYLE 전수로 **같은 두 부등식**을 이미 잠근다.
     중복 가드는 한쪽만 고쳐질 때 어느 쪽이 진실인지 흐린다. */
  it('마당이 병원의 무대다 — 배경 랜드마크보다 확실히 밝다(간격 30 이상)', () => {
    const yard = relativeLuminance(OUTSIDE_FLOOR)
    const gap = yard - meanL(LANDMARK)
    expect(gap, `마당 ${yard.toFixed(1)} - 랜드마크 ${meanL(LANDMARK).toFixed(1)}`).toBeGreaterThanOrEqual(30)
  })
})

/**
 * 부지를 밝히면 **실내가 마당보다 어두워지는 반대편 회귀**가 열린다 — 배경 대역을 넓히려고 천장을
 * 올린 대가로 `NEUTRAL_STYLE`(용도 미지정 영역)이 부지 아래로 내려가면, 벽을 세운 자리가 마당보다
 * 어두워 "여기는 실내다"가 뒤집힌다. 배경 팔레트를 잠그는 이 파일이 **반대쪽 경계도 함께** 잠근다:
 * 한쪽만 있으면 다음 사람이 부지만 올리고 실내를 두고 갈 수 있다.
 */
describe('실내 바닥은 부지(마당)보다 밝다 — 벽 안이 벽 밖보다 어두우면 실내로 안 읽힌다', () => {
  it('용도 미지정 영역(NEUTRAL_STYLE)의 바닥이 부지보다 밝다', () => {
    const n = relativeLuminance(NEUTRAL_STYLE.floor)
    expect(n, `NEUTRAL floor ${NEUTRAL_STYLE.floor} = ${n.toFixed(2)} vs 부지 ${FLOOR.toFixed(2)}`).toBeGreaterThan(FLOOR)
  })

  it.each(Object.entries(ROOM_STYLE))('%s 방 바닥이 부지보다 밝다', (type, style) => {
    const f = relativeLuminance(style.floor)
    expect(f, `${type} floor ${style.floor} = ${f.toFixed(2)} vs 부지 ${FLOOR.toFixed(2)}`).toBeGreaterThan(FLOOR)
  })

  /** 벽은 그 방 바닥보다 위 — 용도 미지정이라고 이 관계까지 무너지면 벽이 안 보인다. */
  it('NEUTRAL_STYLE의 벽이 자기 바닥보다 밝다', () => {
    expect(relativeLuminance(NEUTRAL_STYLE.wall)).toBeGreaterThan(relativeLuminance(NEUTRAL_STYLE.floor))
  })

  it.each(Object.entries(ROOM_STYLE))('%s 벽이 자기 바닥보다 밝다', (_type, style) => {
    expect(relativeLuminance(style.wall)).toBeGreaterThan(relativeLuminance(style.floor))
  })
})

/**
 * 알베도 서열이 **음영을 거쳐도** 살아남는가 — 위 두 describe는 팔레트 리터럴만 본다.
 *
 * 조명·AO가 붙은 뒤로 화면에 실제로 나가는 값은 `shade(albedo, factor)`이고, 계수는 타일마다 다르다.
 * 그래서 리터럴 서열이 맞아도 **가장 어두운 계수를 맞은 방 바닥이 부지 아래로 내려갈 수 있다** —
 * 그러면 「실내가 마당보다 밝다」가 최종 픽셀에서 뒤집힌다(리터럴 검사는 그걸 통과시킨다).
 * 부지는 계수를 안 받으므로(`SHADE` 주석) 비교 대상은 부지의 리터럴 그대로다.
 */
describe('shade — 조명·AO를 곱해도 서열이 뒤집히지 않는다', () => {
  it('계수 1은 색을 안 바꾼다 — 조명이 없는 자리가 알베도와 달라지면 팔레트 검사가 헛말이 된다', () => {
    for (const hex of [OUTSIDE_FLOOR, NEUTRAL_STYLE.floor, ...Object.values(ROOM_STYLE).map((s) => s.floor)]) {
      expect(shade(hex, 1)).toBe(hex)
    }
  })

  it('계수가 커지면 휘도도 커진다 — 단조성이 깨지면 광원이 그늘로 보인다', () => {
    for (const hex of Object.values(ROOM_STYLE).map((s) => s.floor)) {
      /* ⚠️ 계수 목록은 **중복을 걷고 정렬해서** 만든다 — 옛 판은 `[min, base, 1, max]`를 그대로 늘어놓고
         `max > 1`을 암묵 가정했다. 조명 모델이 그늘 전용으로 바뀌며 `max === 1`이 되자 같은 값이 두 번
         들어가 단조성이 자기 자신과 비교돼 깨졌다(모델은 멀쩡한데 계측기만 붉어졌다). `1`은 "조명 없음
         = 알베도" 지점이라 남겨 둔다 — max가 다시 1 위로 가면 저절로 중간 지점으로 돌아온다. */
      const ls = [...new Set([SHADE.min, SHADE.base, 1, SHADE.max])]
        .sort((a, b) => a - b)
        .map((f) => relativeLuminance(shade(hex, f)))
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i], `${hex} 계수 단조성 ${ls.join(' < ')}`).toBeGreaterThan(ls[i - 1])
      }
    }
  })

  it('가장 어두운 계수를 맞은 방 바닥도 부지보다 밝다 — 최종 픽셀에서의 「실내 > 마당」', () => {
    for (const [type, style] of Object.entries(ROOM_STYLE)) {
      const darkest = relativeLuminance(shade(style.floor, SHADE.min))
      expect(darkest, `${type} 최암부 ${darkest.toFixed(2)} vs 부지 ${FLOOR.toFixed(2)}`).toBeGreaterThan(FLOOR)
    }
    const n = relativeLuminance(shade(NEUTRAL_STYLE.floor, SHADE.min))
    expect(n, `NEUTRAL 최암부 ${n.toFixed(2)} vs 부지 ${FLOOR.toFixed(2)}`).toBeGreaterThan(FLOOR)
  })

  it('가장 밝은 계수에서도 채널이 포화되지 않는다 — 흰색으로 뭉개지면 방 색이 사라진다', () => {
    for (const style of [...Object.values(ROOM_STYLE), NEUTRAL_STYLE]) {
      for (const hex of [style.floor, style.wall]) {
        const lit = shade(hex, SHADE.max)
        expect(relativeLuminance(lit), `${hex} → ${lit}`).toBeLessThan(235)
        expect(lit, `${hex} → ${lit} 포화`).not.toBe('#ffffff')
      }
    }
  })

  /**
   * ⚠️ 대비는 **계수 폭이 아니라 휘도 점수**로 잰다. 옛 판은 `max − min ≥ 0.2`였는데, 그 0.2는
   * *어두운 알베도(≈100)에서* 광원이 보이는 폭을 factor 단위로 적어 둔 값이었다 — 알베도가 밝아지면
   * 같은 계수 폭이 더 큰 대비를 내므로 이 숫자는 화면과 무관해진다. 실측이 그걸 보여준다:
   * 옛 모델(알베도 91~104 · 폭 0.36)의 화면 대비는 **32.6~37.5점**, 새 모델(알베도 218~220 · 폭 0.16)은
   * **34.9~35.4점** — 계수 폭은 절반 이하로 줄었는데 **눈에 보이는 대비는 그대로다.**
   * 그래서 단위를 화면 쪽으로 옮긴다. 이건 기준 완화가 아니라 **같은 계약을 옳은 단위로 다시 쓴 것**이고,
   * 알베도가 어느 대역에 있든 뜻이 유지된다(= 이 파일이 세 번 경고한 "대역을 옮기면 기준도 옮겨야 한다"를
   * 아예 대역 독립으로 만든 것). 이 단위 착오는 `SHADE` 자체가 밝은 톤에서 무너진 것과 **같은 근인**이다.
   *
   * **임계값 30점의 출처**(없으면 다음 사람이 임의로 조정한다): 위 실측의 **하한 32.6점**(옛 모델
   * NEUTRAL, 알베도 91.7 × 폭 0.36)에서 약간의 여유를 뺀 값이다. 즉 "옛 화면이 내던 최소 대비를
   * 밑돌지 않는다"가 이 숫자의 뜻이다 — 새로 만든 기준이 아니라 **이미 눈으로 승인된 대비를
   * 바닥으로 고정한 것**이다. 올릴 근거가 생기면 올리되, 근거 없이 내리지 마라.
   */
  it('조명·AO가 실제로 화면에서 읽히는 대비를 낸다 — 계수 폭이 아니라 휘도 점수로', () => {
    expect(SHADE.min).toBeLessThan(SHADE.base)
    expect(SHADE.base).toBeLessThan(SHADE.max)
    /* 조명 웅덩이가 **평탄화되지 않는다** — `base + pool`이 `max`를 넘으면 방 중심이 클램프에 눌려
       그라디언트가 판판해진다(AO가 `min`에 눌려 계조를 잃은 것과 정확히 같은 실패다).
       등호까지 허용하는 이유: 지금 값은 `0.90 + 0.10 = 1.0`으로 딱 붙어 있고, 그게 "웅덩이 중심이
       알베도에 정확히 닿는다"는 뜻이라 정상이다. 넘는 것만 막는다. */
    expect(SHADE.base + SHADE.pool, `base ${SHADE.base} + pool ${SHADE.pool}`).toBeLessThanOrEqual(SHADE.max)
    for (const style of [...Object.values(ROOM_STYLE), NEUTRAL_STYLE]) {
      const span =
        relativeLuminance(shade(style.floor, SHADE.max)) - relativeLuminance(shade(style.floor, SHADE.min))
      expect(span, `${style.floor} 최명부−최암부 = ${span.toFixed(1)}점`).toBeGreaterThanOrEqual(30)
    }
  })

  /**
   * AO 계조 — 벽에 닿은 면이 늘수록 **단계적으로** 어두워져야 구석이 가장자리보다 깊어 보인다.
   *
   * 위 「대비」 단언은 최명부−최암부의 **전체 폭**만 본다 — 그 폭이 어떻게 **나뉘는지**는 안 본다.
   * 2026-07-31 밝은 톤 전환에서 정확히 그 틈으로 회귀가 샜다: `base`−`min` 여유가 0.10 → 0.04로
   * 줄면서 `ao`(0.04)가 **벽 한 면 만에 `min`을 찍어**, 1·2·3·4면이 전부 같은 밝기가 됐다.
   * 계조가 4단(94/90/86/84)에서 2단(193/184/184/184)으로 무너졌는데 **49건이 전부 초록이었다** —
   * `ao`·`checker`의 *크기*를 재는 단언이 하나도 없었기 때문이다. 이 단언이 그 구멍이다.
   *
   * 양쪽으로 판별력이 있다: `ao`가 너무 크면(즉시 클램프) 두 번째 단이 0점이 되고,
   * 너무 작으면 단이 눈에 안 보여 둘 다 걸린다.
   *
   * ⚠️ **렌더가 세는 만큼(최대 4면) 봐야 한다.** `[1, 2]`까지만 보던 판은 `ao 0.04`+`base 0.90`에서
   * 계조가 `0.90/0.86/0.84/0.84/0.84`로 **2·3·4면이 평탄화**되는데도 통과했다 — 이 단언의 존재 이유인
   * 바로 그 회귀를 부분적으로 놓쳤다. `checker`는 `lum`이 모델에 안 넣으므로(AO만 격리해 보려는 것)
   * 아래 별도 부등식이 대신 잠근다 — 주석이 "잰다"고 했는데 안 재는 상태를 남기지 않는다.
   */
  it('벽에 닿는 면이 늘수록 단계적으로 어두워진다 — 한 면에서 곧장 클램프되면 구석이 평평해진다', () => {
    /** 렌더와 같은 산술: `f = base − ao × 벽에 닿은 변 수`를 `[min, max]`로 잠근다(TileMap의 factorOf). */
    const lum = (hex: string, sides: number) =>
      relativeLuminance(shade(hex, Math.max(SHADE.min, Math.min(SHADE.max, SHADE.base - SHADE.ao * sides))))
    for (const style of [...Object.values(ROOM_STYLE), NEUTRAL_STYLE]) {
      for (const sides of [1, 2, 3]) {
        const step = lum(style.floor, sides - 1) - lum(style.floor, sides)
        expect(step, `${style.floor} 벽 ${sides - 1}면 → ${sides}면 = ${step.toFixed(1)}점`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  /**
   * 체커 무늬가 AO 한 단을 삼키지 않는다 — 위 단언은 `checker`를 모델에서 빼고 AO만 격리해 본다.
   * 그래서 `checker`의 **크기**는 여기서 따로 잠근다(d7545d2가 0.018 → 0.008로 줄인 그 값이다).
   *
   * 체커는 이웃한 칸을 `±checker`로 엇갈리게 흔든다 — 진폭이 `2 × checker`이므로, 그게 AO 한 단
   * (`ao`)보다 크면 **바둑판이 벽 그늘을 덮어** 구석이 깊어 보이는 신호가 무늬에 묻힌다.
   * (실측: `checker`를 0.08로 키우면 진폭 ±17.5점으로 AO 한 단 4.4점을 통째로 삼킨다.)
   */
  it('체커 진폭이 AO 한 단보다 작다 — 무늬가 벽 그늘을 덮으면 구석이 안 읽힌다', () => {
    expect(2 * SHADE.checker, `체커 진폭 ${2 * SHADE.checker} vs AO 한 단 ${SHADE.ao}`).toBeLessThan(SHADE.ao)
  })

  /**
   * 벽 캡이 **방 밝기를 따라간다** — `neighborOf`가 굳이 이웃의 계수까지 넘기는 이유가
   * *"먼 구석의 벽이 광원 아래 벽과 똑같이 밝으면 깊이가 사라진다"*인데, 옛 캡 식
   * `min(SHADE.max, factor + 0.16)`은 `factor ≤ 1.0 = max`라 **항상 잘려 상수**였다 — 계약이
   * 코드에 적혀 있는데 값은 정반대였고, 이 자리에 가드가 없어 그대로 배포됐다.
   * 세 단이 전부 `factor`에 비례하는지, 그리고 서로 갈리는지를 함께 본다.
   */
  it('벽 세 단이 방 밝기를 따라 움직이고 서로 갈린다 — 캡이 상수가 되면 벽에서 깊이가 사라진다', () => {
    for (const style of [...Object.values(ROOM_STYLE), NEUTRAL_STYLE]) {
      const dim = wallBands(style.wall, SHADE.min)
      const lit = wallBands(style.wall, SHADE.max)
      // ① 같은 벽이라도 어두운 방과 밝은 방에서 캡이 달라야 한다(옛 버그가 정확히 여기서 죽었다)
      const spread = relativeLuminance(lit.cap) - relativeLuminance(dim.cap)
      expect(spread, `${style.wall} 캡 factor 변동폭 ${spread.toFixed(1)}점`).toBeGreaterThanOrEqual(10)
      // ② 한 벽 안에서 캡 > 몸통 > 밑동 — 세 단이 붙으면 두께가 안 읽힌다
      for (const band of [dim, lit]) {
        const [c, b, f] = [band.cap, band.body, band.foot].map(relativeLuminance)
        expect(c - b, `${style.wall} 캡−몸통 ${(c - b).toFixed(1)}점`).toBeGreaterThanOrEqual(10)
        expect(b - f, `${style.wall} 몸통−밑동 ${(b - f).toFixed(1)}점`).toBeGreaterThanOrEqual(10)
      }
    }
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
    const calls = { fillRect: 0, gradient: 0, fills: new Set<string>(), composites: [] as string[] }
    return {
      calls,
      ctx: {
        set fillStyle(v: unknown) { if (typeof v === 'string') calls.fills.add(v) },
        set strokeStyle(_v: unknown) {}, set lineWidth(_v: number) {},
        // 발광 패스는 합성 모드로만 구별된다 — 값을 기록해 "additive로 그렸는가"를 단언한다.
        set globalCompositeOperation(v: string) { calls.composites.push(v) },
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
    /* urban2는 lamp를 4개 세운다 — 얼룩처럼 보이던 단색 arc로 되돌아가면 여기서 걸린다.
       ⚠️ 정확한 개수(옛 `toBe(4)`)를 못 쓴다: 발광 패스가 창문·전조등 그라디언트를 변형마다 다른
       수로 더한다. 대신 하한을 지키고, **발광 패스 자체의 존재**는 바로 아래 두 건이 잠근다. */
    const { ctx, calls } = stubCtx()
    drawBackdrop(ctx, 'URBAN', 2)
    expect(calls.gradient).toBeGreaterThanOrEqual(4)
  })

  /**
   * 발광 — 밝기만 올리고 발광을 빼면 화면이 "밝은 회색 판"이 된다(켜져 있다는 신호가 없다).
   * 12종 전부에 걸려 있어야 하고, **끝난 뒤 반드시 source-over로 되돌려야** 한다:
   * 남겨 두면 다음 렌더(지역 교체)의 첫 fill이 additive로 그려져 배경이 하얗게 탄다.
   */
  it.each(REGIONS)('%s의 변형 0·1·2가 발광 패스를 돌고 합성 모드를 되돌린다', (region) => {
    for (const variant of [0, 1, 2]) {
      const { ctx, calls } = stubCtx()
      drawBackdrop(ctx, region, variant)
      expect(calls.composites, `${region}/${variant}`).toContain('lighter')
      expect(calls.composites.at(-1), `${region}/${variant} 마지막 합성 모드`).toBe('source-over')
    }
  })
})
