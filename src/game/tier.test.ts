import { describe, it, expect } from 'vitest'
import { hospitalTier, TIER_LABELS, TIER_ORDER } from './tier'

describe('hospitalTier — 필수 배후과 수 → 법적 등급', () => {
  it('배후과 수에 따라 등급이 오른다(서열)', () => {
    expect(hospitalTier(0)).toBe('UNDESIGNATED')
    expect(hospitalTier(1)).toBe('LOCAL_INSTITUTION')
    expect(hospitalTier(2)).toBe('LOCAL_CENTER')
    expect(hospitalTier(3)).toBe('REGIONAL_CENTER')
  })

  it('3 이상은 모두 권역(상한 없음)', () => {
    expect(hospitalTier(4)).toBe('REGIONAL_CENTER')
    expect(hospitalTier(9)).toBe('REGIONAL_CENTER')
  })
})

describe('TIER_LABELS / TIER_ORDER', () => {
  it('모든 등급에 한글 라벨이 있다', () => {
    expect(TIER_LABELS.UNDESIGNATED).toContain('미지정')
    expect(TIER_LABELS.LOCAL_INSTITUTION).toBe('지역응급의료기관')
    expect(TIER_LABELS.LOCAL_CENTER).toBe('지역응급의료센터')
    expect(TIER_LABELS.REGIONAL_CENTER).toBe('권역응급의료센터')
  })

  it('TIER_ORDER는 미지정→권역 오름차순 4단', () => {
    expect(TIER_ORDER).toEqual(['UNDESIGNATED', 'LOCAL_INSTITUTION', 'LOCAL_CENTER', 'REGIONAL_CENTER'])
  })
})
