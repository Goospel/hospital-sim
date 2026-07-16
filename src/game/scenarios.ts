import type { Hospital, Patient } from './types'

export interface Scenario {
  patient: Patient
  hospitals: Hospital[]
  goldenSeconds: number
}

// STEMI(급성 심근경색) 한 판.
//
// 리서치 반영(docs/research/stemi-factsheet.md): 실제 뺑뺑이의 지배 병목은 '병상 없음'이 아니라
// '배후진료 불가'(병상·응급실 당직은 있어도 순환기 중재시술팀·카테터실이 없어 못 받음)다.
// 그래서 최다 거절 사유를 NO_BACKUP_CARE 로 두고, 플레이어가 첫 병원부터 "병상은 있는데
// 시술팀이 없다"는 진짜 벽을 겪게 한다. 네 사유를 모두 드러내되 반드시 풀 수 있게 설계.
// 병원명은 가상 — 실재 기관/집단을 지목하지 않는다(톤 가드레일).
export function createStemiScenario(): Scenario {
  const patient: Patient = {
    id: 'stemi-1',
    requiredSpecialty: 'CARDIOLOGY', // = 심장 중재시술(PCI) 역량 필요
    severity: 5,
  }

  const hospitals: Hospital[] = [
    // 병상 있음 + 응급실 당직 있음 — 그러나 순환기 중재팀이 없다 → NO_BACKUP_CARE (지배 병목·첫 벽)
    { id: 'h1', name: '한바다대학병원', beds: 2, hasErOnCall: true, overcrowded: false, backupCare: ['THORACIC_SURGERY', 'NEUROSURGERY'] },
    // 병상 넉넉 + 응급실 당직 — 역시 순환기 시술 역량 없음 → NO_BACKUP_CARE (지배 병목 재확인)
    { id: 'h2', name: '새빛종합병원', beds: 4, hasErOnCall: true, overcrowded: false, backupCare: ['GENERAL_SURGERY', 'OBSTETRICS'] },
    // 시술 역량은 있으나 응급실이 꽉 차 자리가 안 빠진다 → ER_OVERCROWDED
    { id: 'h3', name: '도청소재지의료원', beds: 3, hasErOnCall: true, overcrowded: true, backupCare: ['CARDIOLOGY'] },
    // 순환기도 되지만 병상 자체가 없다 → NO_BED
    { id: 'h4', name: '시립응급의료원', beds: 0, hasErOnCall: true, overcrowded: false, backupCare: ['CARDIOLOGY'] },
    // 야간 응급실 당직 공백 → NO_ER_ONCALL (접수 자체 불가)
    { id: 'h5', name: '군지역의료원', beds: 1, hasErOnCall: false, overcrowded: false, backupCare: [] },
    // 병상 + 응급실 당직 + 순환기 중재팀 가동 → 수용 (풀리는 출구, PCI 가능 센터)
    { id: 'h6', name: '권역심혈관센터', beds: 1, hasErOnCall: true, overcrowded: false, backupCare: ['CARDIOLOGY'] },
  ]

  return { patient, hospitals, goldenSeconds: 180 }
}
