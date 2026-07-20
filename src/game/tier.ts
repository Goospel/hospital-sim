import type { HospitalTier } from './types'

// 병원 등급 = 획득한 법적 자격(파생 라벨). backupCare 수만 읽는 순수 파생이라
// 판정·경제 불변식을 건드리지 않는다(설계: docs/superpowers/specs/2026-07-20-hospital-tier-credential-design.md).
// "권역응급의료센터" 등은 자칭 불가한 지정 명칭이라 요건(필수 배후과)을 채워야 열린다
// (근거: docs/research/emergency-tier-designation-law.md).

/** 등급 한글 명칭 — 위저드·결말 표시용. */
export const TIER_LABELS: Record<HospitalTier, string> = {
  UNDESIGNATED: '미지정 (일반 병원)',
  LOCAL_INSTITUTION: '지역응급의료기관',
  LOCAL_CENTER: '지역응급의료센터',
  REGIONAL_CENTER: '권역응급의료센터',
}

/** 등급 오름차순(미지정→권역) — 위저드 사다리 표시가 소비한다. */
export const TIER_ORDER: HospitalTier[] = ['UNDESIGNATED', 'LOCAL_INSTITUTION', 'LOCAL_CENTER', 'REGIONAL_CENTER']

/**
 * 필수 배후과 수 → 법적 등급. 서열(더 많은 배후 = 상위)만 근거, 임계는 각색이다.
 * 미용·검진은 응급 배후 역량이 아니라 등급과 무관하다 — 입력은 backupCare 수뿐.
 */
export function hospitalTier(backupCareCount: number): HospitalTier {
  if (backupCareCount >= 3) return 'REGIONAL_CENTER'
  if (backupCareCount === 2) return 'LOCAL_CENTER'
  if (backupCareCount === 1) return 'LOCAL_INSTITUTION'
  return 'UNDESIGNATED'
}
