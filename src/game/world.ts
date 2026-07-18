import type { DepartmentSpec, DeptKey } from './types'
import { DEPARTMENTS } from './setup'

// 외생 이벤트가 세계 파라미터를 재구성하는 순수 코어(spec: 2026-07-18-world-event-slice).
// 이번 슬라이스의 세계 = 채용 경제(DEPARTMENTS)뿐. 확장점: hospitals·week·appliedEvents.
//
// ⚠️ 헌법: 이벤트는 채용 경제(profit/hireCost)만 바꾼다. 배후진료 매핑(providesBackup)과
// 전원 판정(adjudicate)은 한 줄도 안 건드린다 — 세계는 바꾸되 개별 생사 판정은 코드가 잠근다.
// DeptEffect.field 타입이 두 경제 필드로 제한돼 있어, providesBackup을 건드리는 건 애초에 표현 불가.

/** 세계 상태 — 이번 슬라이스의 유일 필드는 departments. */
export interface WorldState {
  departments: DepartmentSpec[]
}

/** 한 과의 한 경제 값에 대한 델타. 부호·방향만 근거, 금액은 각색. */
export interface DeptEffect {
  dept: DeptKey
  field: 'profitPerDoctorBillions' | 'hireCostBillions'
  delta: number
}

/** 외생 이벤트 = 세계에 떨어지는 변경 1개. headline은 나중에 LLM이 대체할 서사 슬롯. */
export interface WorldEvent {
  id: string
  headline: string
  direction: 'improve' | 'worsen'
  effects: DeptEffect[]
}

/**
 * 이벤트 카탈로그 — 결정론. 부호·방향만 근거를 지키고 금액은 각색.
 * 근거: docs/research/current-korea-change-events.md.
 * index 0 = 개선(§spec 5.3: selectEvent(0)이 이 슬라이스의 고정 선택).
 */
export const EVENT_CATALOG: WorldEvent[] = [
  {
    id: 'CARDIO_FEE_HIKE',
    headline: '보건당국, 필수의료 정책수가 인상 시행 — 순환기내과 등 배후진료 보상 상향',
    direction: 'improve',
    // 개선: 순환기 손익 완화(−12 → −6). 그래도 미용 +70이 압도 → D형 비대칭(spec §3).
    effects: [{ dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: 6 }],
  },
  {
    id: 'LITIGATION_CHILL',
    headline: '의료분쟁 배상 판결 잇따라 — 필수과 인력 확보 비용 상승',
    direction: 'worsen',
    // 악화: 순환기 채용비 상승(30 → 36). 소송 여파로 인력이 더 귀해진다.
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostBillions', delta: 6 }],
  },
]

/** 기본 세계 — 손대지 않은 DEPARTMENTS 복제본. */
export function initWorld(): WorldState {
  return { departments: DEPARTMENTS.map((d) => ({ ...d })) }
}

/** 이벤트를 세계에 적용 — 순수·불변. departments만 재구성한다. */
export function applyEvent(world: WorldState, event: WorldEvent): WorldState {
  const departments = world.departments.map((dept) => {
    const effects = event.effects.filter((e) => e.dept === dept.key)
    if (effects.length === 0) return dept
    const next = { ...dept }
    for (const e of effects) {
      next[e.field] = next[e.field] + e.delta
    }
    return next
  })
  return { ...world, departments }
}

/** 카탈로그에서 결정론적으로 이벤트를 고른다. */
export function selectEvent(index: number): WorldEvent {
  return EVENT_CATALOG[index]
}
