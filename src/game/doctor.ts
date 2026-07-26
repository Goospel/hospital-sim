import type { CallKind, DepartmentSpec, DeptKey, Doctor, IncomingCall, SetupChoices } from './types'
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
 * 하루 부하 파생 — **로그의 실제 배정(assigneeId)** 으로 접는다. 표시용 라운드로빈이던 옛 분배는
 * 승격과 함께 폐기됐다: 감속당하는 의사와 카드에 뜨는 의사가 달라지면 이 레이어가 거짓말을 한다(F-2).
 *
 * total = 담당 건수(명단 스트립 표시용) · loadMin = **시간 × 강도**의 합(피로 입력) ·
 * nightLoad = 야간 콜의 강도 합. 시간만 재면 "많이 보는 과가 갈린다"가 돼 미용이 포화하고
 * 필수과가 0이 된다(§FATIGUE_INTENSITY) — 그래서 두 부하 축 모두 강도를 곱한다.
 *
 * 모든 유닛을 0으로 초기화해 표시가 안정적이다(콜 0인 유닛도 카드에 0으로 뜬다).
 * 배정이 없는 수용 엔트리(합성 로그·명단 밖 id)는 아무에게도 안 붙는다.
 */
export function doctorCaseloads(
  roster: Doctor[],
  receiving: ReceivingState,
): { total: Map<string, number>; loadMin: Map<string, number>; nightLoad: Map<string, number> } {
  const total = new Map<string, number>()
  const loadMin = new Map<string, number>()
  const nightLoad = new Map<string, number>()
  for (const doc of roster) {
    total.set(doc.id, 0)
    loadMin.set(doc.id, 0)
    nightLoad.set(doc.id, 0)
  }
  receiving.log.forEach((entry, i) => {
    if (!entry.accepted) return
    const id = entry.assigneeId
    if (id === undefined || !total.has(id)) return // 무배정 — 아무에게도 안 붙음
    const call = receiving.queue[i]
    const intensity = call ? FATIGUE_INTENSITY[call.kind] : 1
    total.set(id, total.get(id)! + 1)
    if (call?.nightShift) nightLoad.set(id, nightLoad.get(id)! + intensity)
    if (entry.startMin !== undefined && entry.endMin !== undefined) {
      loadMin.set(id, loadMin.get(id)! + Math.max(0, entry.endMin - entry.startMin) * intensity)
    }
  })
  return { total, loadMin, nightLoad }
}

// 피로 상수 — 예시값(임상 주장 아님). 방향만 정직: 무거운 일을 오래 할수록·야간일수록 ↑, 한가한 날 회복 ↓.
// ⚠️ FATIGUE_PER_CASE(건수 기반, 18)는 은퇴했다 — 콜 제한 폐지로 하루가 62~142명이 되면서
// 건수 척도가 개원 첫날 포화를 만들었다(보톡스 30분과 뇌수술 180분에 같은 값을 매기던 게 근인).
//
// ⚠️ 단위 주의 — 부하는 이제 **분이 아니라 '표준강도분'**(분 × FATIGUE_INTENSITY)이다. 그래서
// FREE_MIN이 "하루 600분 중 6시간"이던 옛 해석은 더 이상 성립하지 않는다: 미용 의사가 600분을
// 꽉 채워도 강도 0.3이라 180이고, 응급 수술 두 건(각 75분)이면 300이다. 실측 튜닝값(2026-07-25,
// 순환기1+미용1 / 순환기2+미용1 / 미용3+검진3 / 1인 2주차 이월 — 네 시나리오)이지 임상 주장이 아니다.
//
// ⚠️ 재튜닝(2026-07-25, 300/35 → 160/15) — **문턱을 낮추고 기울기를 눕혔다.** 옛 값은 두 목표를
// 동시에 못 냈다: 1인 순환기는 D2에 포화(100)해 "주 후반에 갈려나간다"가 아니라 "이틀 만에 끝난다"였고,
// 2인이 나눠 받으면 각자 문턱 아래라 **주 내내 정확히 0** — 주 간 누적이라는 이 기능의 존재 이유가
// 사라졌다. 낮은 문턱 + 완만한 기울기면 1인은 주 내내 감속 지대에 눌러앉고(실측 W1 52 → 100 → 78,
// 2주차는 82~100으로 더 높게 머문다), 2인은 밤 몫만큼만 남되 감속 지대(34)에 못 미친다(실측 최대 20).
// 저강도 과는 여전히 무풍이다 — 미용·검진의 표준강도분은 하루 200 이하라 회복(FATIGUE_REST)이 이긴다.
export const FATIGUE_FREE_MIN = 160 // 이 부하까지는 정상 근무 — 델타 0(표준강도분 · 강도 1.0이면 2시간 40분)
export const FATIGUE_PER_OVER_HOUR = 15 // 초과 부하 1시간(표준강도)당 피로
export const FATIGUE_NIGHT_EXTRA = 12 // 야간 콜 강도 1.0당 추가 — 야간의 무게도 일의 강도에 비례한다
export const FATIGUE_REST = 20
export const FATIGUE_MAX = 100

/**
 * 콜 종류별 **강도 계수** — 부하 분 = 점유 분 × 강도. 예시값(임상 주장 아님)이되 축의 근거는
 * 상대가치점수의 "업무량"(시간 × 강도: 정신적 노력·스트레스·기술)이다(fee-schedule 리서치).
 *
 * 시간만 재면 "많이 보는 과가 갈린다"는 엉뚱한 이야기가 나온다 — 실측(2026-07-25): 미용 1명이
 * 워크인으로 600분을 채워 D2에 포화하고, 응급 2~4통뿐인 순환기는 내내 0이었다. 보톡스 1분과
 * 응급 PCI 1분은 의사에게 같은 무게가 아니다: 미용은 예약제 루틴 시술이고(야간 당직도 없다),
 * 필수의료는 생사·집중·체력이다. 이 비대칭이 **같은 시간을 일해도 필수의료가 더 갈리는데
 * 흑자는 미용이 가져간다**는 이 게임의 논지를 피로 축에서 완성한다.
 */
export const FATIGUE_INTENSITY: Record<CallKind, number> = {
  COSMETIC_WALKIN: 0.3, // 예약제 루틴 — 저강도
  SPECIALIST_ELECTIVE: 1.0, // 외래+검사 — 기준선
  MEDICAL_EMERGENCY: 1.5, // 입원·수액 — 응급이되 수술 아님
  STEMI: 2.0, // 응급 수술·시술급 — 생사·집중
  OBSTETRIC_EMERGENCY: 2.0,
  NEURO_EMERGENCY: 2.0,
  TRAUMA_EMERGENCY: 2.0,
  ABDOMINAL_EMERGENCY: 2.0,
}

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
 * 포화 상태로 일한 날이 이만큼 누적되면 사직한다(예시값 — 튜닝 대상).
 * 실측 곡선(전부 수용·순환기 1인): 1주차 2일 + 2주차 3일 → 2주차 결산에서 이탈.
 * 응급을 더 거절하면 피로가 덜 올라 시점이 미뤄진다 — 플레이어 선택이 움직인다.
 */
export const RESIGN_SATURATED_DAYS = 4

/**
 * 하루 마감 피로 → 포화 일수 누적. **리셋이 없다.**
 *
 * 포화(FATIGUE_MAX)로 마감한 날만 센다. 회복해도 그 날들은 몸에 남는다는 뜻이고, 무엇보다
 * 완편 병원은 실측상 34조차 안 넘어 이 카운터가 **영원히 0**이다 — 구조적으로 망가진
 * 배치에서만 돌아간다. 리셋 규칙을 두면 "며칠 쉬게 해 되돌리는" 최적화 표면이 생기는데,
 * 대응 레버가 채용뿐이라(피로 승격 결정 B) 그 조작은 애초에 불가능하다.
 */
export function stepSaturatedDays(
  prev: Record<string, number>,
  fatigue: Record<string, number>,
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, f] of Object.entries(fatigue)) {
    if (f >= FATIGUE_MAX) next[id] = (next[id] ?? 0) + 1
  }
  return next
}

/**
 * 임계를 넘긴 유닛 — 이번 주에 떠나는 사람들. 명단 순서를 보존한다(표시 안정).
 * 명단에 없는 키는 무시한다(사직·재구성으로 생긴 구 상태 잔재).
 */
export function resigningDoctors(
  roster: Doctor[],
  saturatedDays: Record<string, number>,
): Doctor[] {
  return roster.filter((d) => (saturatedDays[d.id] ?? 0) >= RESIGN_SATURATED_DAYS)
}

/**
 * 사직으로 id가 밀렸을 때 유닛별 상태(fatigue·saturatedDays)를 **사람을 따라** 옮긴다.
 *
 * ⚠️ 이게 없으면 조용한 데이터 오염이 난다: `Doctor.id`는 `doc-<dept>-<i>` 인덱스 기반이라
 * 1번이 사직하면 옛 2번이 그 번호를 물려받고, id로 키를 잡은 상태가 **사직자의 포화를
 * 생존자에게 상속**시킨다(방금 남은 사람이 즉시 사직 임계에 걸린다).
 *
 * 대응은 **과별 위치**로 한다: `materializeRoster`는 그 과의 hiredIds 지원자를 CANDIDATES
 * 순서로 앞 슬롯부터 앉히고 나머지를 무명으로 채우므로, **사직자를 뺀 옛 명단**과 새 명단은
 * 과별로 같은 순서다. 그래서 zip 한 번이 정확하고, 이름·후보 id 매칭보다 단순하며
 * 무명 유닛 엣지케이스가 함께 사라진다.
 *
 * `survivorsInOldOrder`는 옛 명단에서 **사직자만 제거**한 것이어야 한다(순서 보존).
 * 교차 주 상태는 fatigue·saturatedDays 둘뿐이다 — busyUntil·busyWith는 하루마다 리셋된다.
 */
export function remapDoctorState<T>(
  survivorsInOldOrder: Doctor[],
  newRoster: Doctor[],
  state: Record<string, T>,
): Record<string, T> {
  const byDept = (roster: Doctor[]) => {
    const m = new Map<DeptKey, Doctor[]>()
    for (const d of roster) {
      const list = m.get(d.dept) ?? []
      list.push(d)
      m.set(d.dept, list)
    }
    return m
  }
  const oldByDept = byDept(survivorsInOldOrder)
  const out: Record<string, T> = {}
  for (const [dept, newDocs] of byDept(newRoster)) {
    const oldDocs = oldByDept.get(dept) ?? []
    newDocs.forEach((nd, i) => {
      const od = oldDocs[i]
      if (od && state[od.id] !== undefined) out[nd.id] = state[od.id]
    })
  }
  return out
}

/**
 * 하루 부하 → 유닛별 피로 갱신(0~FATIGUE_MAX 클램프). 이전 값에 누적한다(주 간 유지 — 리셋은 세션이 안 한다).
 *
 * 입력이 **시간 × 강도**인 게 핵심이다. 건수는 부하의 대리물일 뿐이라 보톡스 30분과 뇌수술 180분에
 * 같은 값을 매겼고(콜 제한 폐지 뒤 개원 첫날 포화), 시간만 재면 이번엔 반대로 **많이 보는 과**가
 * 갈려 미용이 이틀 만에 포화하고 응급 2~4통뿐인 필수과는 내내 0이었다(실측 2026-07-25).
 * 강도를 곱하면 축이 "몇 분 일했나"가 아니라 "얼마나 무거운 일을 했나"가 된다(FATIGUE_INTENSITY).
 *
 * FATIGUE_FREE_MIN(표준강도분)까지는 부하 0이고 그 초과분만 시간당 쌓인다 — 완편 수익과가 저지대를
 * 유지하고 1인 필수과만 레드존으로 가는 대조가 여기서 나온다(채용이 곧 회복). 단 나눠 받는다고 0이
 * 되지는 않는다: 야간 가중은 문턱과 무관해 **당직을 나눠도 밤은 밤**이다(session.test.ts의 duo 계약).
 * 야간은 강도에 비례해 가중되고(밤의 STEMI와 저녁의 보톡스가 같을 리 없다), 한가한 날은 회복으로 내려간다.
 */
export function stepFatigue(
  prev: Record<string, number>,
  load: { loadMin: Map<string, number>; nightLoad: Map<string, number> },
): Record<string, number> {
  const next: Record<string, number> = { ...prev }
  for (const [id, mins] of load.loadMin) {
    const nights = load.nightLoad.get(id) ?? 0
    const overHours = Math.max(0, mins - FATIGUE_FREE_MIN) / 60
    const delta =
      Math.round(overHours * FATIGUE_PER_OVER_HOUR + nights * FATIGUE_NIGHT_EXTRA) - FATIGUE_REST
    next[id] = Math.max(0, Math.min(FATIGUE_MAX, (prev[id] ?? 0) + delta))
  }
  return next
}
