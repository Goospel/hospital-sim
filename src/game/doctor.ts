import type { DepartmentSpec, DeptKey, Doctor, IncomingCall, SetupChoices } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음

// 표시 레이어 순수 모듈. 판정·경제에 절대 닿지 않는다. 런타임 임포트 0(전부 type-only).

const FAMILY_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오']
const GIVEN_NAMES = ['민준', '서연', '도윤', '하은', '지호', '수아', '예준', '지우', '준서', '서윤', '현우', '지민']

/**
 * 전역 의사 인덱스 k(0-based) → 결정론 한글 이름. RNG 0(게임 원칙).
 * 이름 인덱스를 성과 서로 다른 보폭(×5, 12와 서로소)으로 진행 + 성 랩(k/12) 오프셋 → 저충돌.
 */
function doctorName(k: number): string {
  const family = FAMILY_NAMES[k % FAMILY_NAMES.length]
  const given = GIVEN_NAMES[(k * 5 + Math.floor(k / FAMILY_NAMES.length)) % GIVEN_NAMES.length]
  return family + given
}

/**
 * 채용 선택 → 개인 유닛 명단. 결정론. `departments`를 인자로 받아 setup.ts를 임포트하지 않는다(순환 차단).
 * 전역 인덱스 k로 이름을 파생시켜 같은 선택은 항상 같은 명단이 된다.
 */
export function materializeRoster(choices: SetupChoices, departments: DepartmentSpec[]): Doctor[] {
  const roster: Doctor[] = []
  let k = 0
  for (const dept of departments) {
    const n = choices.doctors[dept.key] ?? 0
    for (let i = 1; i <= n; i++) {
      roster.push({ id: `doc-${dept.key}-${i}`, name: doctorName(k), dept: dept.key })
      k++
    }
  }
  return roster
}

// kind만으로 담당 과가 정해지는 5종. 워크인은 라벨이 필요해 handlingDept에서 분기한다.
const HANDLING_DEPT: Record<Exclude<IncomingCall['kind'], 'COSMETIC_WALKIN'>, DeptKey> = {
  STEMI: 'CARDIOLOGY',
  OBSTETRIC_EMERGENCY: 'OBSTETRICS',
  NEURO_EMERGENCY: 'NEUROSURGERY',
  TRAUMA_EMERGENCY: 'GENERAL_SURGERY',
  GENERAL_EMERGENCY: 'GENERAL_SURGERY', // 명목상 외과(외과 미채용 시 무배정)
}

/** 워크인 라벨로 미용/검진 판별. receiving.ts CALL_LABELS와 커플링(표시 전용). */
export function walkinDept(label: string): DeptKey {
  return label.includes('검진') ? 'CHECKUP' : 'AESTHETICS'
}

/** 받은 콜 한 통을 어느 과 의사가 짊어지나 — requiredSpecialty 명목값 함정을 피한 단일 출처. */
export function handlingDept(call: IncomingCall): DeptKey {
  return call.kind === 'COSMETIC_WALKIN' ? walkinDept(call.label) : HANDLING_DEPT[call.kind]
}

/**
 * 받은(accepted) 콜을 담당 과 유닛에 라운드로빈(가장 적게 받은 유닛부터)으로 분배.
 * total = 전체, night = 그중 야간 콜(피로 가중용, 일관된 부분집합). 담당 과 미채용 콜은 무배정.
 * 모든 유닛을 0으로 초기화해 표시가 안정적이다(콜 0인 유닛도 카드에 0으로 뜬다).
 */
export function doctorCaseloads(
  roster: Doctor[],
  receiving: ReceivingState,
): { total: Map<string, number>; night: Map<string, number> } {
  const total = new Map<string, number>()
  const night = new Map<string, number>()
  for (const doc of roster) {
    total.set(doc.id, 0)
    night.set(doc.id, 0)
  }
  receiving.log.forEach((entry, i) => {
    if (!entry.accepted) return
    const call = receiving.queue[i]
    const dept = handlingDept(call)
    const deptDocs = roster.filter((d) => d.dept === dept)
    if (deptDocs.length === 0) return // 담당 과 미채용 — 아무에게도 안 붙음
    const target = deptDocs.reduce((min, d) => (total.get(d.id)! < total.get(min.id)! ? d : min))
    total.set(target.id, total.get(target.id)! + 1)
    if (call.nightShift) night.set(target.id, night.get(target.id)! + 1)
  })
  return { total, night }
}

// 피로 상수 — 예시값(임상 주장 아님). 방향만 정직: 담당 많을수록·야간일수록 ↑, 무부하 회복 ↓.
export const FATIGUE_PER_CASE = 18
export const FATIGUE_NIGHT_EXTRA = 12
export const FATIGUE_REST = 20
export const FATIGUE_MAX = 100

/**
 * 하루 담당 → 유닛별 피로 갱신(0~FATIGUE_MAX 클램프). 이전 값에 누적한다(주 간 유지 — 리셋은 세션이 안 한다).
 * 야간 담당은 기본에 추가 가중이 붙는다(같은 건수라도 밤이 무겁다). 무부하 날은 회복(−FATIGUE_REST)으로 내려간다.
 */
export function stepFatigue(
  prev: Record<string, number>,
  caseloads: { total: Map<string, number>; night: Map<string, number> },
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, cases] of caseloads.total) {
    const nights = caseloads.night.get(id) ?? 0
    const delta = cases * FATIGUE_PER_CASE + nights * FATIGUE_NIGHT_EXTRA - FATIGUE_REST
    next[id] = Math.max(0, Math.min(FATIGUE_MAX, (prev[id] ?? 0) + delta))
  }
  return next
}
