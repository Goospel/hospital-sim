import { describe, expect, it } from 'vitest'

import { KOREA_MASK, MAP_COLS, MAP_ROWS, PLACES, isLand, landRuns, placesByRegion } from './koreaMap'
import { REGIONS, type SimRegionKey } from '@/sim/world'

/**
 * 지도는 **회화 레이어**라 "예쁜가"는 못 잠근다. 대신 이 파일이 잠그는 것은 지도가 데이터로서
 * 성립하는 조건이다 — 격자가 직사각형인가, 점이 육지 위에 있는가, 4타입이 전부 닿는가.
 *
 * 이 셋이 깨지면 화면은 **에러 없이** 틀린다: 바다에 뜬 점은 클릭은 되는데 지도로는 거짓이고,
 * 닿지 않는 타입은 카탈로그에 규칙이 있는데 아무도 못 고르는 죽은 코드가 된다. 배경 팔레트
 * 테스트가 「휘도 서열은 순수 함수로 잠글 수 있다」고 한 것과 같은 자리다.
 */
describe('koreaMap — 격자 마스크', () => {
  it('모든 행이 MAP_COLS 길이의 직사각형이다', () => {
    expect(KOREA_MASK).toHaveLength(MAP_ROWS)
    for (const [i, row] of KOREA_MASK.entries()) {
      expect(row, `${i}행`).toHaveLength(MAP_COLS)
    }
  })

  it('마스크는 육지(#)와 바다(.)만 쓴다', () => {
    // 오타 한 글자가 조용히 바다가 되는 것을 막는다 — isLand가 `=== '#'`이라 다른 문자는 전부 바다다.
    expect(KOREA_MASK.join('').replace(/[#.]/g, '')).toBe('')
  })

  it('육지가 격자의 3~7할이다', () => {
    // 재생성(래스터화 임계값 변경)이 통째로 빈 지도·꽉 찬 사각형을 뱉는 사고를 잡는 밴드.
    // ⚠️ 기대값을 마스크에서 파생하지 않는다 — 파생하면 무엇을 넣어도 통과한다(T-111).
    const land = KOREA_MASK.join('').split('#').length - 1
    const ratio = land / (MAP_COLS * MAP_ROWS)
    expect(ratio).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(0.7)
  })

  it('isLand는 격자 밖을 바다로 답한다', () => {
    expect(isLand(-1, 0)).toBe(false)
    expect(isLand(0, -1)).toBe(false)
    expect(isLand(MAP_COLS, 0)).toBe(false)
    expect(isLand(0, MAP_ROWS)).toBe(false)
  })
})

describe('landRuns — 육지를 가로 런으로 묶는다', () => {
  it('런이 덮는 칸이 육지 전부와 정확히 같다', () => {
    // 개수만 세면 "한 칸 흘리고 다른 칸을 두 번 센" 오프바이원이 통과한다 — 칸 집합으로 비교한다.
    const covered = new Set<string>()
    for (const r of landRuns()) for (let i = 0; i < r.len; i++) covered.add(`${r.col + i},${r.row}`)
    const expected = new Set<string>()
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) if (isLand(col, row)) expected.add(`${col},${row}`)
    }
    expect(covered).toEqual(expected)
  })

  it('런이 최대 길이다 — 양 끝 바깥은 육지가 아니다', () => {
    // 이게 없으면 "칸마다 길이 1 런"이라는 무의미한 구현도 위 테스트를 통과한다.
    for (const r of landRuns()) {
      expect(r.len, `${r.row}행 ${r.col}열`).toBeGreaterThan(0)
      expect(isLand(r.col - 1, r.row), `${r.row}행 ${r.col}열 왼쪽`).toBe(false)
      expect(isLand(r.col + r.len, r.row), `${r.row}행 ${r.col}열 오른쪽`).toBe(false)
    }
  })
})

describe('koreaMap — 선택 지역', () => {
  it('모든 지역이 육지 칸 위에 있다', () => {
    // 바다에 뜬 점은 **에러가 안 난다** — 클릭도 되고 게임도 시작된다. 지도만 거짓말을 한다.
    for (const p of PLACES) {
      expect(isLand(p.col, p.row), `${p.label} (${p.col},${p.row})`).toBe(true)
    }
  })

  it('두 지역이 같은 칸을 쓰지 않는다', () => {
    // 겹치면 위에 그려진 하나가 아래를 완전히 가려, 한 지역이 **영영 클릭 불가**가 된다.
    const cells = PLACES.map(p => `${p.col},${p.row}`)
    expect(new Set(cells).size).toBe(PLACES.length)
  })

  it('key가 유일하다', () => {
    expect(new Set(PLACES.map(p => p.key)).size).toBe(PLACES.length)
  })

  it('모든 지역의 region이 카탈로그에 있다', () => {
    for (const p of PLACES) {
      expect(REGIONS[p.region], `${p.label}`).toBeDefined()
    }
  })

  it('네 타입이 전부 최소 한 곳씩 도달 가능하다', () => {
    // 규칙 카탈로그에 타입을 더하고 지도에 안 얹으면 **아무도 못 고르는 규칙**이 된다.
    // 기대값을 PLACES가 아니라 REGIONS에서 세는 것이 요점이다 — 지도가 카탈로그를 따라가야 한다.
    for (const key of Object.keys(REGIONS) as SimRegionKey[]) {
      expect(placesByRegion(key).length, `${key}에 갈 수 있는 지역`).toBeGreaterThan(0)
    }
  })

  it('placesByRegion은 그 타입만 돌려준다', () => {
    for (const key of Object.keys(REGIONS) as SimRegionKey[]) {
      for (const p of placesByRegion(key)) expect(p.region).toBe(key)
    }
  })
})
