// 영역(Region) 정의 계약 — "무엇이 영역인가"가 바뀌었다:
// 옛 정의(벽·문으로 둘러싸인 성분)가 아니라, **플레이어가 칠한 같은 (type·dept) 타일의
// 4방 연결 성분**이 영역이다(설계 2026-07-31-free-zone-designation §2). 벽은 통행·시각의
// 것이고 영역의 것이 아니다 — 접수처에 문을 달 필요가 없어진 이유가 이 파일에 있다.
import { describe, expect, it } from 'vitest'
import { computeRegions, computeRegionsUncached } from './regions'
import { createWorld, tileIndex, GRID_W, type SimWorld, type ZonePaint } from './world'
import { rectPts } from './testHelpers'

/** 사각형을 칠한 세계 — 테스트 전용 최소 픽스처(불변 교체 계약 준수). */
function paint(w: SimWorld, x: number, y: number, wd: number, ht: number, p: ZonePaint): SimWorld {
  const zones = new Map(w.zones)
  for (const t of rectPts(x, y, wd, ht)) zones.set(tileIndex(t.x, t.y), p)
  return { ...w, zones }
}

const fresh = (): SimWorld => createWorld(1)

describe('computeRegions — 칠한 타일의 (type·dept) 성분', () => {
  it('빈 부지에는 영역이 없다 — 칠이 없으면 성분도 없다', () => {
    expect(computeRegions(fresh())).toEqual([])
  })

  it('칠한 사각형 하나가 영역 하나다 — 벽 없이도, 가장자리에 닿아도', () => {
    // 옛 정의라면 가장자리(y=0)에 닿는 순간 마당이었다 — 그 판정 자체가 사라졌음을 잰다.
    const w = paint(fresh(), 0, 0, 4, 3, { type: 'WAITING' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect(rs[0].type).toBe('WAITING')
    expect(rs[0].tiles.size).toBe(12)
    expect(rs[0].id).toBe(tileIndex(0, 0)) // id = 성분 최소 타일 인덱스
  })

  it('떨어진 같은 용도 조각은 서로 다른 영역이다', () => {
    let w = paint(fresh(), 2, 2, 3, 3, { type: 'WARD' })
    w = paint(w, 10, 2, 3, 3, { type: 'WARD' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.id)).toEqual([tileIndex(2, 2), tileIndex(10, 2)]) // id 오름차순
  })

  it('이어 칠하면 하나로 합쳐진다 (병합이 공짜)', () => {
    let w = paint(fresh(), 2, 2, 3, 3, { type: 'WARD' })
    w = paint(w, 5, 2, 5, 3, { type: 'WARD' }) // 오른쪽에 붙여 칠함
    const rs = computeRegions(w)
    expect(rs).toHaveLength(1)
    expect(rs[0].tiles.size).toBe(24)
  })

  it('가운데를 지우면 둘로 갈라진다 (분할이 공짜)', () => {
    let w = paint(fresh(), 2, 2, 7, 1, { type: 'WAITING' })
    const zones = new Map(w.zones)
    zones.delete(tileIndex(5, 2))
    w = { ...w, zones }
    expect(computeRegions(w)).toHaveLength(2)
  })

  it('과가 다른 진료실은 벽 없이 붙여 칠해도 다른 영역이다', () => {
    let w = paint(fresh(), 2, 2, 3, 3, { type: 'EXAM', dept: 'INTERNAL_MEDICINE' })
    w = paint(w, 5, 2, 3, 3, { type: 'EXAM', dept: 'GENERAL_SURGERY' })
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.dept).sort()).toEqual(['GENERAL_SURGERY', 'INTERNAL_MEDICINE'])
  })

  it('용도가 다르면 붙어 있어도 다른 영역이다 (접수처가 대기실에 열려 있는 그림)', () => {
    let w = paint(fresh(), 2, 2, 4, 4, { type: 'WAITING' })
    w = paint(w, 6, 2, 2, 4, { type: 'RECEPTION' }) // 문도 벽도 없이 맞닿음
    const rs = computeRegions(w)
    expect(rs).toHaveLength(2)
    expect(rs.map(r => r.type).sort()).toEqual(['RECEPTION', 'WAITING'])
  })

  it('행 끝과 다음 행 머리는 이어지지 않는다 — 인덱스 인접 ≠ 격자 인접', () => {
    // 부지 오른쪽 끝과 왼쪽 끝은 타일 **인덱스**로는 1 차이라, x 범위 가드를 빼면 flood fill이
    // 행을 넘어 붙는다. 옛 정의에서는 가장자리 성분을 통째로 버려 이 버그가 가려졌지만,
    // 새 정의에서는 가장자리 칠이 정식 타일이라 실패 모드가 새로 열렸다.
    const zones = new Map([
      [tileIndex(GRID_W - 1, 5), { type: 'WARD' as const }],
      [tileIndex(0, 6), { type: 'WARD' as const }],
    ])
    expect(computeRegions({ ...fresh(), zones })).toHaveLength(2)
  })

  it('대각선만 닿은 조각은 이어지지 않는다 (4방 연결)', () => {
    let w = paint(fresh(), 2, 2, 2, 2, { type: 'WARD' })
    w = paint(w, 4, 4, 2, 2, { type: 'WARD' }) // 꼭짓점만 닿음
    expect(computeRegions(w)).toHaveLength(2)
  })

  it('id는 칠한 순서에 흔들리지 않는다 — 좌표만으로 정해진다', () => {
    // 같은 두 조각을 반대 순서로 칠한다. Map 삽입 순서를 그대로 순회하면 id·배열 순서가 뒤집힌다.
    let a = paint(fresh(), 2, 2, 2, 2, { type: 'WARD' })
    a = paint(a, 10, 8, 2, 2, { type: 'WARD' })
    let b = paint(fresh(), 10, 8, 2, 2, { type: 'WARD' })
    b = paint(b, 2, 2, 2, 2, { type: 'WARD' })
    expect(computeRegions(a).map(r => r.id)).toEqual([tileIndex(2, 2), tileIndex(10, 8)])
    expect(computeRegions(b).map(r => r.id)).toEqual(computeRegions(a).map(r => r.id))
  })

  it('EXAM이 아닌 칠에는 dept가 실리지 않는다', () => {
    const w = paint(fresh(), 2, 2, 2, 2, { type: 'WAITING' })
    expect(computeRegions(w)[0].dept).toBeUndefined()
  })

  it('캐시가 답을 바꾸지 않는다 — 같은 참조면 같은 배열, 새 Map이면 재계산', () => {
    const w = paint(fresh(), 2, 2, 3, 3, { type: 'WARD' })
    expect(computeRegions(w)).toBe(computeRegions(w)) // 참조 동일 = 캐시 적중
    const again = { ...w, zones: new Map(w.zones) }
    expect(computeRegions(again)).toEqual(computeRegionsUncached(again)) // 값은 언제나 같다
  })

  it('칠이 갈리면 캐시가 옛 답을 내지 않는다 — 용도가 캐시에 굳지 않는다', () => {
    const asWard = paint(fresh(), 2, 2, 3, 3, { type: 'WARD' })
    const asLounge = paint(fresh(), 2, 2, 3, 3, { type: 'LOUNGE' })
    expect(computeRegions(asWard)[0].type).toBe('WARD')
    expect(computeRegions(asLounge)[0].type).toBe('LOUNGE')
    expect(computeRegions(asWard)[0].type).toBe('WARD') // 되돌려도 옛 답이 안 남는다
  })
})
