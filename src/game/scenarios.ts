import type { Hospital, Patient } from './types'

export interface Scenario {
  patient: Patient
  hospitals: Hospital[]
  goldenSeconds: number
}

// STEMI(급성 심근경색) 한 판.
// 숨은 제약(병상·당직)으로 두 거절 사유를 모두 드러내되, 반드시 풀 수 있게 설계.
// 병원명은 가상 — 실재 기관/집단을 지목하지 않는다(톤 가드레일).
export function createStemiScenario(): Scenario {
  const patient: Patient = {
    id: 'stemi-1',
    requiredSpecialty: 'CARDIOLOGY',
    severity: 5,
  }

  const hospitals: Hospital[] = [
    // 순환기내과는 있지만 병상이 없다 → NO_BED (하드락)
    { id: 'h1', name: '한바다대학병원', beds: 0, onCallSpecialties: ['CARDIOLOGY', 'THORACIC_SURGERY'] },
    // 병상은 있지만 순환기내과 당직이 없다 → NO_SPECIALIST
    { id: 'h2', name: '새빛종합병원', beds: 3, onCallSpecialties: ['GENERAL_SURGERY', 'OBSTETRICS'] },
    // 순환기내과는 있지만 역시 병상이 없다 → NO_BED
    { id: 'h3', name: '도청소재지의료원', beds: 0, onCallSpecialties: ['CARDIOLOGY'] },
    // 병상 + 순환기내과 당직 → 수용 가능 (풀리는 출구)
    { id: 'h4', name: '권역심혈관센터', beds: 1, onCallSpecialties: ['CARDIOLOGY'] },
  ]

  return { patient, hospitals, goldenSeconds: 180 }
}
