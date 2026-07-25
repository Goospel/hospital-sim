import type { DepartmentSpec, DeptKey, Doctor, IncomingCall, SetupChoices } from './types'
import type { ReceivingState } from './receiving' // type-only — 런타임 순환 없음
import { CANDIDATES, SPEED_OF_TIER, type Candidate } from './candidates'

// 의사 개인 유닛 모듈 — 명단·담당 분배·**피로**의 단일 출처.
// 런타임 임포트는 candidates.ts 하나(setup.ts는 여전히 type-only 회피 — 순환 차단).
//
// ⚠️ 2026-07-25 승격: 피로는 더 이상 표시 전용이 아니다. fatigueSlowFactor가 daysim의
// occupiedUntilMin에 합류해 진료 소요를 늘린다(스펙 2026-07-25-fatigue-adjudication-design.md).
// 그 배율 하나를 빼면 이 모듈은 여전히 판정·경제에 닿지 않는다.

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
 * hiredIds의 지원자가 그 과 **앞 슬롯**부터 앉고(풀 순서 = 표시 순서), 초과분(성장 중도 채용)은
 * 기존 무명 생성(doctorName)으로 채운다. k는 슬롯마다 전진해 무명 이름도 결정론이다.
 */
export function materializeRoster(choices: SetupChoices, departments: DepartmentSpec[]): Doctor[] {
  const hiredSet = new Set(choices.hiredIds ?? [])
  const roster: Doctor[] = []
  let k = 0
  for (const dept of departments) {
    const n = choices.doctors[dept.key] ?? 0
    const hired: Candidate[] = CANDIDATES.filter((c) => c.dept === dept.key && hiredSet.has(c.id))
    for (let i = 1; i <= n; i++) {
      const cand = hired[i - 1]
      roster.push(
        cand
          ? { id: `doc-${dept.key}-${i}`, name: cand.name, dept: dept.key, speedFactor: SPEED_OF_TIER[cand.tier], candidateId: cand.id }
          : { id: `doc-${dept.key}-${i}`, name: doctorName(k), dept: dept.key },
      )
      k++
    }
  }
  return roster
}

/** 워크인 라벨로 미용/검진 판별. receiving.ts CALL_LABELS와 커플링(표시 전용). */
export function walkinDept(label: string): DeptKey {
  return label.includes('검진') ? 'CHECKUP' : 'AESTHETICS'
}

/**
 * 받은 콜 한 통을 어느 과 의사가 짊어지나. 비-워크인은 patient.requiredSpecialty가 곧 담당 과(권위 출처).
 * COSMETIC_WALKIN만 requiredSpecialty가 명목값('CARDIOLOGY', receiving.ts '판정 안 함')이라 라벨로 가른다.
 */
export function handlingDept(call: IncomingCall): DeptKey {
  return call.kind === 'COSMETIC_WALKIN' ? walkinDept(call.label) : call.patient.requiredSpecialty
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

// 피로 상수 — 예시값(임상 주장 아님). 방향만 정직: 오래 점유될수록·야간일수록 ↑, 한가한 날 회복 ↓.
/** @deprecated 건수 기반 유물 — 점유 시간 기반으로 교체되는 중이다(FATIGUE_FREE_MIN). 곧 제거. */
export const FATIGUE_PER_CASE = 18
export const FATIGUE_FREE_MIN = 360 // 이 점유까지는 정상 근무 — 부하 0(하루 600분 중 6시간)
export const FATIGUE_PER_OVER_HOUR = 15 // 초과 1시간당 피로
export const FATIGUE_NIGHT_EXTRA = 12
export const FATIGUE_REST = 20
export const FATIGUE_MAX = 100

/** 막대 '중' 경계 — 여기까지 배율 1.0(정상 근무 무영향). DoctorRoster의 색 단계와 같은 출처. */
export const FATIGUE_SLOW_FROM = 34
/** 막대 '고'(레드존) 경계 — 색과 감속 구간을 한 출처로 묶는다. */
export const FATIGUE_RED = 67
/** 포화(FATIGUE_MAX)에서의 추가 소요 비율 — +50%. */
export const FATIGUE_SLOW_MAX = 0.5

/**
 * 피로 → 진료 소요 배율. FATIGUE_SLOW_FROM 이하는 1.0, 거기서 FATIGUE_MAX까지 선형으로 오른다
 * (67 → ×1.25, 100 → ×1.5). **연속·단조**라 임계를 넘는 순간이 없다 — "레드존 직전까지 굴리기"
 * 같은 게이밍 표면을 만들지 않기 위한 형태 선택이다(스펙 §5 정답-퍼즐 방지).
 */
export function fatigueSlowFactor(fatigue: number): number {
  const over = Math.max(0, fatigue - FATIGUE_SLOW_FROM)
  return 1 + (FATIGUE_SLOW_MAX * over) / (FATIGUE_MAX - FATIGUE_SLOW_FROM)
}

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
