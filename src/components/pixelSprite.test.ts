import { describe, it, expect } from 'vitest'
import { spriteVariant, DEPT_COLOR } from './PixelSprite'
import type { DeptKey } from '@/game/types'

/**
 * 스프라이트에서 **판단이 드는 유일한 자리**를 잠근다 — 그리기(패스 좌표)는 눈이 판정하지만
 * 초상 변주는 계약이다: 같은 지원자 id가 언제나 같은 얼굴이어야 채용 카드와 맵의 아바타가
 * 같은 사람으로 읽힌다(RNG 0 원칙이 표시 레이어에도 적용된다 — character-design.md §4).
 *
 * 벡터 전환(2026-07-30)에서 이 함수는 `variantOf`(비공개) → `spriteVariant`(공개)로 나왔다.
 * 공개한 이유가 곧 이 파일이다: 결정론은 눈으로 검수할 수 없다.
 */
describe('spriteVariant — 초상 변주는 id의 순수 함수다', () => {
  const KEYS = ['d1', 'd2', 'd17', 'cand-abc', '의사-3', '', 'x'.repeat(64)]

  it.each(KEYS)('같은 키(%s)는 항상 같은 조합을 준다', (key) => {
    const a = spriteVariant(key)
    expect(spriteVariant(key)).toEqual(a)
    expect(spriteVariant(key)).toEqual(a) // 세 번째 호출까지 — 내부 상태가 없음을 못박는다
  })

  it('머리·피부가 실제 후보 목록 안에서만 나온다 — 범위를 벗어나면 화면에 빈 색이 뜬다', () => {
    for (const key of KEYS) {
      const { hair, skin } = spriteVariant(key)
      expect(hair, `hair ${hair}`).toMatch(/^#[0-9a-f]{6}$/)
      expect(skin, `skin ${skin}`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  /** 변주가 **실제로 갈리는지** — 늘 같은 값을 돌려주면 위 결정론 테스트는 통과하면서 목적이 증발한다. */
  it('서로 다른 키들이 한 조합으로 뭉치지 않는다', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(spriteVariant(`d${i}`))))
    expect(seen.size, `40개 키에서 조합 ${seen.size}종`).toBeGreaterThanOrEqual(4)
  })

  it('과 색은 8과 전부에 있고 서로 다르다 — 어깨 색이 과를 나르는 유일한 신호다', () => {
    const depts = Object.keys(DEPT_COLOR) as DeptKey[]
    expect(depts).toHaveLength(8)
    for (const d of depts) expect(DEPT_COLOR[d], d).toMatch(/^#[0-9a-f]{6}$/)
    // 수익과(미용·검진)는 무채색이라 서로 가깝지만, 같은 색이면 화면에서 과가 구별되지 않는다.
    expect(new Set(Object.values(DEPT_COLOR)).size).toBe(8)
  })
})
