import { describe, it, expect } from 'vitest'
import { relativeLuminance } from './Backdrop'
import { LANDING } from './landingPalette'

/**
 * 랜딩 팔레트의 회귀 가드 — 「밝은 종이 위 잉크 지도」의 서열을 숫자로 잠근다.
 *
 * 어두운 시절 랜딩의 서열은 "육지는 바탕, 점이 내용"(밝을수록 내용)이었다. 밝은 화면에서는
 * **어두울수록 내용**이므로 극성만 뒤집고 서열은 유지한다: 잉크 < 육지 < 배경 < 카드.
 * 색은 눈으로만 검수하면 다음 사람이 한 칸 밝히는 순간 조용히 되돌아간다 — 숫자로 잠근다.
 *
 * 톤 서열은 프로덕션의 relativeLuminance(선형 가중)로, 텍스트 가독은 WCAG 대비(감마 보정)로
 * 잰다 — 두 식이 공존하는 것은 측정 목적이 달라서다.
 */

/** WCAG 2.x 상대 휘도 기반 대비율 — 텍스트 가독 전용. */
function wcagContrast(a: string, b: string): number {
  const lin = (hex: string) => {
    const n = parseInt(hex.slice(1), 16)
    const ch = (v: number) => {
      const s = v / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
  }
  const [hi, lo] = [lin(a), lin(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const L = (k: keyof typeof LANDING) => relativeLuminance(LANDING[k])

describe('랜딩 팔레트 — 종이 위 잉크 지도', () => {
  it('휘도 서열: 잉크 < 육지 < 배경 < 카드 (어두울수록 내용)', () => {
    expect(L('ink')).toBeLessThan(L('land'))
    expect(L('land')).toBeLessThan(L('backdrop'))
    expect(L('backdrop')).toBeLessThan(L('card'))
  })

  it('최소 간격: 층이 뭉개지지 않는다', () => {
    // 간격 하한은 후보값 실측에서 왔다(잉크↔육지 121 · 육지↔배경 50 · 배경↔카드 15).
    // 서열만 잠그면 "전부 비슷한 회색"이 초록불을 받는다 — backdropPalette가 실측한 그 회귀다.
    expect(L('land') - L('ink')).toBeGreaterThanOrEqual(80)
    expect(L('backdrop') - L('land')).toBeGreaterThanOrEqual(35)
    expect(L('card') - L('backdrop')).toBeGreaterThanOrEqual(10)
  })

  it('텍스트 대비: 카드 위 잉크·보조 텍스트가 WCAG 4.5:1 이상', () => {
    expect(wcagContrast(LANDING.ink, LANDING.card)).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(LANDING.inkMuted, LANDING.card)).toBeGreaterThanOrEqual(4.5)
  })

  it('청록 대비: 버튼 글자는 WCAG 4.5:1, 육지 위 청록 점은 휘도 차 40 이상', () => {
    expect(wcagContrast(LANDING.onAccent, LANDING.accent)).toBeGreaterThanOrEqual(4.5)
    // 점은 텍스트가 아니라 면이라 WCAG 비율 대신 톤 휘도 차로 잰다.
    expect(L('land') - L('accent')).toBeGreaterThanOrEqual(40)
  })
})
