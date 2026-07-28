// 전환 회귀 픽스처 — **rooms 기반과 영역 기반이 같은 세계를 낳는가**의 단일 계측기.
//
// 설계(2026-07-28 freeform-build) PR 1b의 계약은 하나다: *시뮬 규칙·수치는 동작 무변*.
// 소비자를 하나씩 옮기는 동안 어느 한 곳이 조용히 다른 자리를 고르면(방 열거 순서·좌석
// 선택·경로) 그 차이는 예외가 아니라 **숫자로만** 나타난다 — 진료 한 건, 좌표 한 칸.
// 그래서 값은 전환 **전**(HEAD = cb7f3b9, 1a 직후)에서 실측해 박아 둔다. 손으로 계산한
// 기대값이 아니라 옛 구현의 출력이라, 이 파일이 죽으면 전환이 틀린 것이다.
import { describe, it, expect } from 'vitest'
import { createWorld } from './world'
import { tick } from './tick'
import { hire, placeRoom } from './testHelpers'

/** 대기실 + 진료실(내과) + 병동 + 내과 의사 1명 — 외래 한 줄이 성립하는 최소 병원 */
function hospital() {
  let w = createWorld(7)
  for (const spec of [
    { type: 'WAITING' as const, x: 18, y: 24, w: 8, h: 6 },
    { type: 'EXAM' as const, dept: 'INTERNAL_MEDICINE' as const, x: 18, y: 14, w: 8, h: 6 },
    { type: 'WARD' as const, x: 28, y: 14, w: 8, h: 6 },
  ]) {
    const r = placeRoom(w, spec)
    if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
    w = r.world
  }
  return hire(w, 'INTERNAL_MEDICINE')
}

describe('영역 전환 회귀 — 300분을 돌린 세계가 전환 전과 같다', () => {
  it('집계·수입·폰 좌표가 전환 전 실측값과 일치한다', () => {
    const w0 = hospital()
    const w = tick(w0, 300)
    // ↓ 전환 **전**(1a HEAD = cb7f3b9)에서 실측해 박은 값이다. 손으로 맞추지 말 것 —
    //   값이 달라졌다면 테스트가 아니라 전환이 틀린 것이다.
    //   한 덩어리로 단언하는 이유: 네 축이 갈라져 있으면 첫 축에서 멈춰 나머지 어긋남이 안 보인다.
    expect({
      examsDone: w.stats.examsDone,
      leftCount: w.stats.leftCount,
      // **건설비가 아니라 300분 동안의 수입**을 잰다 — 비용표는 튜닝 대상이고(build.BUILD_COST)
      // 그게 바뀔 때마다 이 픽스처가 우는 건 회귀가 아니라 잡음이다. 시뮬이 낳은 값은 차액뿐이다.
      revenueManwon: w.treasuryManwon - w0.treasuryManwon,
      pawnTiles: w.pawns.map(p => `${p.x},${p.y}`).sort(),
    }).toEqual({
      examsDone: 3,
      // 대기실 좌석(9석)이 차 문간에서 돌아선 인원이 대부분이다 — 좌석 열거가 갈리면 여기가 먼저 운다.
      leftCount: 37,
      revenueManwon: 36,
      pawnTiles: ['19,16', '19,26', '20,25', '21,26', '22,25', '23,26', '24,25', '26,25', '26,26'],
    })
  })
})
