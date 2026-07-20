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
  /** 병원장이 읽는 공문 2–3줄 — 실제 정책 도구(가산·정책수가·상대가치점수)만. 각색 억 손익 금지. */
  briefing: string[]
}

/**
 * 이벤트 카탈로그 — 결정론. 부호·방향만 근거를 지키고 금액은 각색.
 * 근거: docs/research/current-korea-change-events.md.
 * index 0 = 개선(§spec 5.3: selectEvent(0)이 이 슬라이스의 고정 선택).
 */
export const EVENT_CATALOG: WorldEvent[] = [
  {
    id: 'OB_PEDS_POLICY_FEE',
    headline: '보건당국, 분만·소아 정책수가 신설 — 고위험 분만 보상 대폭 확대',
    direction: 'improve',
    effects: [{ dept: 'OBSTETRICS', field: 'profitPerDoctorBillions', delta: 6 }],
    briefing: [
      '분만 안전정책수가 신설 (분만 건당 정액 가산)',
      '고위험 분만 가산 30% → 최대 200%',
      '신규 재정 투입 — 타 항목 조정 없음',
    ],
  },
  {
    id: 'SURGERY_ADD_ON',
    headline: '보건당국, 흉부외과·외과 수술 가산 확대 시행',
    direction: 'improve',
    effects: [
      { dept: 'THORACIC_SURGERY', field: 'profitPerDoctorBillions', delta: 6 },
      { dept: 'GENERAL_SURGERY', field: 'profitPerDoctorBillions', delta: 3 },
    ],
    briefing: [
      '흉부외과 처치·수술 가산 100% (201개 행위)',
      '외과 처치·수술 가산 30% (322개 행위)',
      '전공의 수련보조수당 병행 (흉부외과 월 150만원 등)',
    ],
  },
  {
    id: 'LITIGATION_CHILL',
    headline: '의료분쟁 고액 배상 판결 잇따라 — 필수과 인력 확보 비용 상승',
    direction: 'worsen',
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostBillions', delta: 6 }],
    briefing: [
      '고액 배상 판결 잇따라 — 필수과 전문의 채용 시장 경색',
      '배후진료 인력 확보 비용 상승',
    ],
  },
]

/**
 * 1주차 개원 전용 큐레이션 이벤트 — 순환 카탈로그(EVENT_CATALOG)와 별개.
 *
 * 재정중립 정책수가 패키지: 순환기 수가를 올린(+6) 만큼 검사(검진) 과보상에서 상쇄한다(−6) →
 * profit 합=0 — 급여 안에서 재분배해도 비급여(미용)를 못 이긴다.
 * 미용(비급여)은 이 풀 밖이라 손 안 댄다 — 그 사실이 개원 위저드 숫자에서 드러난다.
 *
 * ⚠️ 왜 하필 개원 이벤트인가: 월드 이벤트가 병원 경제에 물리는 유일 지점이 1주차 completeSetup뿐이다
 * (session.ts — 2주차+는 beginWeek이 기존 병원을 재사용해 헤드라인만 뜬다). 그래서 재정중립을 장부에서
 * 겪게 하려면 개원 이벤트여야 한다. 근거: docs/superpowers/specs/2026-07-19-fiscal-neutral-opening-event-design.md.
 */
export const OPENING_EVENT: WorldEvent = {
  id: 'FEE_REFORM_PACKAGE',
  headline: '보건당국, 필수의료 정책수가 개편 의결 — 중증·응급 최종치료 보상 상향',
  direction: 'improve', // 명목상 개선으로 고지 — 아이러니는 플레이어가 숫자에서 발견(show-don't-tell)
  effects: [
    { dept: 'CARDIOLOGY', field: 'profitPerDoctorBillions', delta: 6 }, // 개혁 본체: 순환기 −12 → −6
    { dept: 'CHECKUP', field: 'profitPerDoctorBillions', delta: -6 }, // 재원: 검사 과보상 인하(검진 +40 → +34)
  ],
  briefing: [
    '중증·응급 최종치료 가산 50% → 100% (심장중재술 등 배후진료 대상)',
    '재원: 검체검사 과보상 조정 (상대가치점수 190% → 150%)',
  ],
}

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
