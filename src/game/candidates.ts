import type { DeptKey } from './types'

// SETUP 채용 데스크의 지원자 풀 — 고정 결정론 데이터(RNG 0: 같은 게임은 항상 같은 지원자).
// 설계: docs/superpowers/specs/2026-07-24-hiring-desk-setup-design.md §2.
//
// ⚠️ setup.ts를 임포트하지 않는다 — setup → doctor → candidates 순환이 생긴다.
//    그래서 계약금은 「과 앵커 × 티어 배율」의 **하드코딩 결과값**이고, 앵커(DEPARTMENTS.hireCostManwon)와의
//    관계는 candidates.test.ts가 강제한다(앵커를 바꾸면 여기 안 고쳐도 테스트가 운다).
//
// resumeLine 금지선(스펙 §2): 기계적 사실만 — 성격·사연·감정·평가 어휘·대사 금지.
// 이름은 실존 인물·기관을 연상시키지 않는 가공 한글 이름.

export type CareerTier = 'ROOKIE' | 'STANDARD' | 'VETERAN'

/** 티어 → 계약금 배율. */
export const HIRE_COST_MULT: Record<CareerTier, number> = { ROOKIE: 0.7, STANDARD: 1.0, VETERAN: 1.3 }

/**
 * 티어 → 진료 소요 배율(작을수록 빠름). 베테랑이 비싼 값을 하는 유일한 축 — 돈이 아니라 시간.
 * 소비처: doctor.ts materializeRoster(→ Doctor.speedFactor) · daysim.ts occupiedUntilMin.
 */
export const SPEED_OF_TIER: Record<CareerTier, number> = { ROOKIE: 1.15, STANDARD: 1.0, VETERAN: 0.8 }

export interface Candidate {
  id: string // 'cand-<DEPT>-<n>' — 고유·안정(명단 파생·초상 변주 키)
  name: string
  dept: DeptKey
  tier: CareerTier
  careerYears: number // 표시용 연차 — 밴드: 신입 0~2 / 중견 5~9 / 베테랑 12~20
  resumeLine: string // 한 줄 경력 — 기계적 사실만
  hireCostManwon: number // 요구 계약금(만원) = 과 앵커 × 티어 배율(테스트 강제)
}

function dept4(dept: DeptKey, anchor: number, rows: [CareerTier, string, number, string][]): Candidate[] {
  return rows.map(([tier, name, careerYears, resumeLine], i) => ({
    id: `cand-${dept}-${i + 1}`,
    name,
    dept,
    tier,
    careerYears,
    resumeLine,
    hireCostManwon: Math.round(anchor * HIRE_COST_MULT[tier]),
  }))
}

/** 과별 4명(신입1·중견2·베테랑1) × 8과 = 32명. 배열 순서 = 화면 표시 순서(싼 쪽부터). */
export const CANDIDATES: Candidate[] = [
  ...dept4('AESTHETICS', 5_000, [
    ['ROOKIE', '한새봄', 1, '피부과 전공의 수료 직후'],
    ['STANDARD', '문가람', 7, '피부과 의원 7년'],
    ['STANDARD', '배윤슬', 8, '미용 클리닉 레이저 시술 8년'],
    ['VETERAN', '노석현', 14, '미용의원 시술 14년'],
  ]),
  ...dept4('CHECKUP', 6_000, [
    ['ROOKIE', '진하람', 2, '가정의학과 전공의 수료 직후'],
    ['STANDARD', '홍다예', 6, '검진센터 판독 6년'],
    ['STANDARD', '마동혁', 9, '종합병원 건강증진센터 9년'],
    ['VETERAN', '국선영', 15, '검진센터 내시경 전담 15년'],
  ]),
  ...dept4('CARDIOLOGY', 15_000, [
    ['ROOKIE', '백시온', 1, '심장내과 전임의 1년'],
    ['STANDARD', '서명준', 8, '2차병원 심혈관센터 8년'],
    ['STANDARD', '유채린', 7, '대학병원 심초음파실 7년'],
    ['VETERAN', '심재구', 18, '대학병원 심도자실 18년'],
  ]),
  ...dept4('THORACIC_SURGERY', 16_000, [
    ['ROOKIE', '남도영', 2, '흉부외과 전공의 수료 직후'],
    ['STANDARD', '표진솔', 9, '대학병원 폐수술팀 9년'],
    ['STANDARD', '탁준희', 7, '2차병원 흉부외과 7년'],
    ['VETERAN', '방혜정', 20, '대동맥 수술팀 20년'],
  ]),
  ...dept4('OBSTETRICS', 14_000, [
    ['ROOKIE', '원지수', 1, '산부인과 전임의 1년'],
    ['STANDARD', '석보라', 6, '분만병원 6년'],
    ['STANDARD', '길현서', 8, '대학병원 고위험 산모실 8년'],
    ['VETERAN', '추미람', 16, '분만실 당직 16년'],
  ]),
  ...dept4('NEUROSURGERY', 15_000, [
    ['ROOKIE', '함온유', 2, '신경외과 전공의 수료 직후'],
    ['STANDARD', '도현빈', 7, '뇌혈관센터 7년'],
    ['STANDARD', '반예솔', 9, '척추수술팀 9년'],
    ['VETERAN', '위정환', 17, '개두술 집도 17년'],
  ]),
  ...dept4('GENERAL_SURGERY', 11_000, [
    ['ROOKIE', '편도윤', 1, '외과 전공의 수료 직후'],
    ['STANDARD', '양주안', 8, '복강경 수술팀 8년'],
    ['STANDARD', '소민재', 6, '2차병원 외과 6년'],
    ['VETERAN', '좌현탁', 13, '외상외과 13년'],
  ]),
  ...dept4('INTERNAL_MEDICINE', 10_000, [
    ['ROOKIE', '육세인', 2, '내과 전공의 수료 직후'],
    ['STANDARD', '태윤겸', 7, '감염내과 7년'],
    ['STANDARD', '피재원', 9, '중환자실 파견 9년'],
    ['VETERAN', '하동률', 19, '내과 병동 당직 19년'],
  ]),
]

export function candidateById(id: string): Candidate | undefined {
  return CANDIDATES.find((c) => c.id === id)
}

/** 채용 목록의 총 계약금(만원). 모르는 id는 0으로 친다(방어 — adjustDoctors의 클램프와 같은 결). */
export function hiringCostOfCandidates(hiredIds: string[]): number {
  return hiredIds.reduce((sum, id) => sum + (candidateById(id)?.hireCostManwon ?? 0), 0)
}

/**
 * hiredIds → 과별 인원 파생. SetupChoices.doctors의 **단일 기록 지점**(위저드 onComplete)에서만 쓴다 —
 * doctors와 hiredIds를 각자 조작하는 경로를 만들지 않는다(drift 구조적 차단, 스펙 §3).
 */
export function doctorsCountsOf(hiredIds: string[]): Partial<Record<DeptKey, number>> {
  const counts: Partial<Record<DeptKey, number>> = {}
  for (const id of hiredIds) {
    const c = candidateById(id)
    if (!c) continue
    counts[c.dept] = (counts[c.dept] ?? 0) + 1
  }
  return counts
}

/** 도장 토글 — 이미 채용이면 반려(제거), 아니면 채용(추가). 그 과 cap 도달·모르는 id면 불변 반환. */
export function toggleHired(hired: string[], id: string, cap: number): string[] {
  if (hired.includes(id)) return hired.filter((h) => h !== id)
  const cand = candidateById(id)
  if (!cand) return hired
  const deptCount = hired.filter((h) => candidateById(h)?.dept === cand.dept).length
  if (deptCount >= cap) return hired
  return [...hired, id]
}
