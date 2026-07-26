import type { DepartmentSpec, DeptKey, RegionKey, Specialty } from './types'
import { DEPARTMENTS, ROUND_THE_CLOCK_MIN_DOCTORS } from './setup'
import { callSeed, seededUnit } from './daysim'

// 외생 이벤트가 세계 파라미터를 재구성하는 순수 코어(spec: 2026-07-18-world-event-slice).
// 세계 = 채용 경제(departments) + 지역 3계층(regions). 확장점: week·appliedEvents.
//
// ⚠️ 헌법은 동일하다: 이벤트·드리프트는 **수치만** 만진다 — 채용 경제(fixedCost/hireCost)와
// 지역 수치(doctors/hospitals)뿐이고, 배후진료 매핑(providesBackup)과 전원 판정(adjudicate)은
// 한 줄도 안 건드린다. 세계는 바꾸되 개별 생사 판정은 코드가 잠근다.
// DeptEffect.field·RegionEffect.field 유니온이 만질 수 있는 필드를 열거하므로,
// providesBackup·adjudicate를 건드리는 건 애초에 **표현 자체가 불가능**하다.

/** 지역 하나 — 개체가 아니라 집계. doctors는 그 지역 병원들에서 일하는 필수과 의사 수. */
export interface RegionState {
  key: RegionKey
  doctors: Record<Specialty, number>
  hospitals: number // 응급 수용 병원 수 — 드리프트로는 안 변하고 이벤트로만 변동
}

/** 세계 상태 — 채용 경제(departments) + 지역 3계층(regions). */
export interface WorldState {
  departments: DepartmentSpec[]
  regions: RegionState[] // 항상 3개, CAPITAL·METRO·RURAL 순
}

/**
 * 한 과의 한 경제 값에 대한 델타(만원). 부호·방향만 근거, 금액은 각색.
 *
 * ⚠️ **부호 규약이 2026-07-23에 뒤집혔다.** 두 필드 다 이제 *비용*이라 **음수 델타가 '개선'**이다
 * (옛 `profitPerDoctorBillions`는 손익이라 양수가 개선이었다). `direction`과 델타 부호가 반대로
 * 읽히는 게 정상이다 — 그 어긋남을 "버그"로 보고 부호를 되돌리면 개선 이벤트가 병원을 망하게 한다.
 *
 * 왜 정책수가 이벤트가 *비용* 층에 붙는가: 수가 가산은 원래 진료 한 건(CALL_ECONOMICS)의 값이지만,
 * 콜 경제를 세계 상태로 실어 나르려면 `ReceivingState`까지 배선해야 해서 비용이 크다. 실제 정책 도구
 * 중에도 **과 단위로 들어오는 것**(응급의료 가산·당직 보조·시설 지원)이 있어, 그 층으로 표현해도
 * 부호·재정중립이 안 상한다. 콜 단위 효과가 필요해지면 그때 배선한다(YAGNI).
 */
export interface DeptEffect {
  dept: DeptKey
  field: 'fixedCostPerDoctorManwon' | 'hireCostManwon'
  delta: number
}

/**
 * 이벤트의 지역 델타 — field 유니온이 헌법이다: 이벤트는 지역의 '수치'만 만질 수 있고
 * providesBackup·판정 경로는 표현 자체가 불가능하다(DeptEffect와 같은 잠금 방식).
 *
 * 📌 **판별 유니온인 이유**(2026-07-26 구현 중 승격): 옛 형태는 `field: 'doctors'|'hospitals'` +
 * `dept?: Specialty`였다 — dept가 선택 필드라 `field:'doctors'`인데 dept를 빼먹어도 tsc가 통과하고,
 * applyEvent의 `else if (e.dept)` 가드에 걸려 **조용히 no-op**이 됐다(에러도 경고도 없음).
 * 판별 유니온이면 그 조합이 타입 수준에서 표현 불가라 무성 실패의 원천이 사라지고,
 * applyEvent에서 조건 가드 자체가 필요 없어진다.
 */
export type RegionEffect =
  | { region: RegionKey; field: 'doctors'; dept: Specialty; delta: number }
  | { region: RegionKey; field: 'hospitals'; delta: number }

/** 외생 이벤트 = 세계에 떨어지는 변경 1개. headline은 나중에 LLM이 대체할 서사 슬롯. */
export interface WorldEvent {
  id: string
  headline: string
  direction: 'improve' | 'worsen'
  effects: DeptEffect[]
  /** 병원장이 읽는 공문 2–3줄 — 실제 정책 도구(가산·정책수가·상대가치점수)만. 각색 억 손익 금지. */
  briefing: string[]
  /** 지역 수치 델타 — 없으면 지역 무변경. 드리프트(stepWorld)와 달리 총원 보존을 안 한다(유입/이탈). */
  regionEffects?: RegionEffect[]
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
    // 고정비 −350 = 개선(7의 배수 — setup.ts DEPARTMENTS 주석). 산부 1,050 → 700.
    // 🔴 **어떤 개선도 필수과를 수익과보다 가볍게 만들지 않는다**(D형 비대칭) — 700 > 미용 630.
    // 정책이 급여 안에서 아무리 재분배해도 비급여를 못 이긴다는 게 이 게임의 논지고, 그 부등호가
    // 여기서 깨지면 개선 이벤트 한 번에 논지가 뒤집힌다. world.test.ts가 그 가드다.
    effects: [{ dept: 'OBSTETRICS', field: 'fixedCostPerDoctorManwon', delta: -350 }],
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
    // 가산율 대소(흉부 100% > 외과 30%)가 델타 크기 대소로 보여야 한다 — 부호가 −라 '더 큰 개선'은 '더 작은 값'이다.
    effects: [
      { dept: 'THORACIC_SURGERY', field: 'fixedCostPerDoctorManwon', delta: -420 },
      { dept: 'GENERAL_SURGERY', field: 'fixedCostPerDoctorManwon', delta: -140 }, // 840 → 700 (> 미용 630)
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
    effects: [{ dept: 'CARDIOLOGY', field: 'hireCostManwon', delta: 3_000 }], // 15,000 → 18,000 (+20%)
    regionEffects: [{ region: 'RURAL', field: 'doctors', dept: 'OBSTETRICS', delta: -1 }], // 배상 공포 → 지방 산부 이탈
    briefing: [
      '고액 배상 판결 잇따라 — 필수과 전문의 채용 시장 경색',
      '배후진료 인력 확보 비용 상승',
    ],
  },
]

/**
 * 1주차 개원 전용 큐레이션 이벤트 — 순환 카탈로그(EVENT_CATALOG)와 별개.
 *
 * 재정중립 정책수가 패키지: 순환기 부담을 덜어준(−420) 만큼 검사(검진) 과보상에서 거둬들인다(+420) →
 * 델타 합=0 — 급여 안에서 재분배해도 비급여(미용)를 못 이긴다.
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
    { dept: 'CARDIOLOGY', field: 'fixedCostPerDoctorManwon', delta: -420 }, // 개혁 본체: 순환기 고정비 1,190 → 770
    { dept: 'CHECKUP', field: 'fixedCostPerDoctorManwon', delta: 420 }, // 재원: 검사 과보상 인하(검진 고정비 630 → 1,050)
  ],
  briefing: [
    '중증·응급 최종치료 가산 50% → 100% (심장중재술 등 배후진료 대상)',
    '재원: 검체검사 과보상 조정 (상대가치점수 190% → 150%)',
  ],
}

/**
 * 지역 초기값(각색) — 대소만 근거(수도권 집중, 흉부 희소).
 * 🔴 불변식(world.test.ts가 가드): ① 과별로 RURAL < CAPITAL ② RURAL 배후 ≥ 1
 * ③ METRO+RURAL 합 = 기존 POOL_INITIAL(2/4/3/3/5/6) — 채용 풀이 이 합의 파생이 되므로(Task 5)
 * 이 합이 틀어지면 기존 채용 밸런스가 통째로 흔들린다.
 */
export const REGION_INITIAL: RegionState[] = [
  { key: 'CAPITAL', hospitals: 8, doctors: {
    THORACIC_SURGERY: 3, CARDIOLOGY: 5, OBSTETRICS: 4,
    NEUROSURGERY: 4, GENERAL_SURGERY: 5, INTERNAL_MEDICINE: 6 } },
  { key: 'METRO', hospitals: 3, doctors: {
    THORACIC_SURGERY: 0, CARDIOLOGY: 2, OBSTETRICS: 1,
    NEUROSURGERY: 1, GENERAL_SURGERY: 3, INTERNAL_MEDICINE: 3 } },
  { key: 'RURAL', hospitals: 2, doctors: {
    THORACIC_SURGERY: 2, CARDIOLOGY: 2, OBSTETRICS: 2,
    NEUROSURGERY: 2, GENERAL_SURGERY: 2, INTERNAL_MEDICINE: 3 } },
]

/**
 * 지역 배열에서 키로 찾기 — 없으면 throw. **지역 조회의 단일 이디엄**이다.
 * `find(...)!`을 곳곳에 흩으면 non-null 단정이 늘어나 "없을 수 없다"는 근거가 호출부마다 흩어진다.
 * regions는 항상 3개 고정이라 못 찾는 건 프로그래밍 오류지, 런타임에 처리할 상태가 아니다.
 */
function findRegion(regions: RegionState[], key: RegionKey): RegionState {
  const found = regions.find((r) => r.key === key)
  if (!found) throw new Error(`region not found: ${key}`)
  return found
}

export function regionOf(world: WorldState, key: RegionKey): RegionState {
  return findRegion(world.regions, key)
}

/**
 * 그 지역에서 그 과의 배후진료가 서 있는 병원 수 — **저장하지 않는 파생값**.
 * 배후 병원 하나가 서려면 그 과 의사 2명(ROUND_THE_CLOCK_MIN_DOCTORS) — 플레이어 병원과 같은 규칙을
 * 세계에도 적용한다. 세계의 병원들도 우리처럼 "1명으론 당직이 안 돈다".
 */
export function backupHospitals(region: RegionState, s: Specialty): number {
  return Math.min(region.hospitals, Math.floor(region.doctors[s] / ROUND_THE_CLOCK_MIN_DOCTORS))
}

/** 기본 세계 — 손대지 않은 DEPARTMENTS·REGION_INITIAL 복제본. */
export function initWorld(): WorldState {
  return {
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    regions: REGION_INITIAL.map((r) => ({ ...r, doctors: { ...r.doctors } })),
  }
}

/** 이벤트를 세계에 적용 — 순수·불변. departments(비용)와 regions(수치)를 재구성한다. */
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
  const regions = world.regions.map((region) => {
    const effects = (event.regionEffects ?? []).filter((e) => e.region === region.key)
    if (effects.length === 0) return region
    const next = { ...region, doctors: { ...region.doctors } }
    for (const e of effects) {
      if (e.field === 'hospitals') next.hospitals = Math.max(0, next.hospitals + e.delta)
      else next.doctors[e.dept] = Math.max(0, next.doctors[e.dept] + e.delta)
    }
    return next
  })
  return { ...world, departments, regions }
}

/** 카탈로그에서 결정론적으로 이벤트를 고른다. */
export function selectEvent(index: number): WorldEvent {
  return EVENT_CATALOG[index]
}

/** lawsuitRisk 과가 추첨에서 갖는 가중 배수 — 고위험 필수과가 지방을 먼저 떠난다. */
const LAWSUIT_DRIFT_WEIGHT = 3
/** 한 주에 2명째가 떠날 시드 확률 — 이탈 페이스를 주당 1~2명으로 만드는 유일한 손잡이. */
const EXTRA_DRIFT_CHANCE = 0.3
/** 추첨 시드의 salt 축 — index 0=1차 추첨(11), 1=2차 추첨(12). daysim.ts callSeed의 salt 레지스트리 참조. */
const DRIFT_PICK_SALT = [11, 12] as const
/** "2명째가 떠나는가" 여부 롤의 salt — 추첨(11·12)과 다른 축이라야 aliasing이 없다. */
const EXTRA_DRIFT_SALT = 15

/**
 * 지역 간 1명 이동 — 불변 갱신. from에서 빼고 to에 더한다.
 *
 * ⚠️ 소스가 0이면 **아무것도 안 한다**(조기 반환). 옛 코드는 `Math.max(0, n-1)`로 깎았는데,
 * 그 클램프는 도달 불가 방어인 동시에 **도달했을 때 총원 보존 위반을 숨긴다** — from은 0에
 * 머물고 to만 +1 되어 전국 총원이 조용히 늘어난다. 조기 반환이면 보존이 구조적으로 성립한다.
 */
function moveDoctor(world: WorldState, s: Specialty, from: RegionKey, to: RegionKey): WorldState {
  if (regionOf(world, from).doctors[s] <= 0) return world
  const regions = world.regions.map((r) => {
    if (r.key === from) return { ...r, doctors: { ...r.doctors, [s]: r.doctors[s] - 1 } }
    if (r.key === to) return { ...r, doctors: { ...r.doctors, [s]: r.doctors[s] + 1 } }
    return r
  })
  return { ...world, regions }
}

/**
 * RURAL에 남은 과 중 하나를 LAWSUIT_DRIFT_WEIGHT 가중 시드 추첨으로 골라 CAPITAL로 옮긴다.
 * 남은 과가 없으면 null. attempt는 그 주의 몇 번째 이탈인가(0=1명째, 1=2명째) — 시드 축을 가른다.
 *
 * 가중을 **과 1개당** 밀어넣는다(의사 1명당이 아니다) — 그래서 가중 효과를 측정하는 척도도
 * 과당 손실률이다(world.test.ts의 그 테스트가 왜 정규화하는지의 근거).
 */
function driftOnce(world: WorldState, week: number, attempt: 0 | 1): WorldState | null {
  const rural = regionOf(world, 'RURAL')
  const weighted: Specialty[] = []
  for (const d of world.departments) {
    if (!d.providesBackup) continue // 수익과는 지역 시뮬 밖
    if (rural.doctors[d.providesBackup] <= 0) continue
    const w = d.lawsuitRisk ? LAWSUIT_DRIFT_WEIGHT : 1
    for (let i = 0; i < w; i++) weighted.push(d.providesBackup)
  }
  if (weighted.length === 0) return null
  const seed = callSeed(week, 0, 0, DRIFT_PICK_SALT[attempt])
  return moveDoctor(world, weighted[Math.floor(seededUnit(seed) * weighted.length)], 'RURAL', 'CAPITAL')
}

/**
 * 주간 드리프트 — 매주 지방 이탈 1명(+ EXTRA_DRIFT_CHANCE 롤이 통과하면 1명 추가),
 * lawsuitRisk 과 LAWSUIT_DRIFT_WEIGHT 가중.
 *
 * 핵심은 빼기만 있고 더하기가 없다는 것이다: 의사는 줄어도 환자 발생(응급 콜 수)은 안 준다 —
 * 격차가 개입 없이 스스로 벌어진다("필연"의 수학적 형태). hospitals는 여기서 안 변한다(이벤트 전용).
 *
 * 📌 **페이스는 의도된 값이다**(코디네이터 수용, 2026-07-26): RURAL 초기 13명이 **10주차에 소진**되고
 * 그 뒤 stepWorld는 no-op이 된다 = 압력 포화. 실측 발동 창(2..10주 = 9주)에서 주별 이탈은
 * 1,2,2,2,1,2,1,1,1 — 추가 이탈 롤이 **9주 중 4주** 통과한다. 롤 임계값이 EXTRA_DRIFT_CHANCE라고
 * 짧은 창의 빈도가 그 값인 건 아니다(해시 스트림 편차).
 *
 * ⚠️ 이 페이스는 시드 salt에 붙어 있다 — salt를 바꾸면 주차가 밀린다(실측: 추가 롤을 index축에서
 * EXTRA_DRIFT_SALT로 옮기자 소진이 9→10주차, 롤 통과가 5/8→4/9로 이동). 그래서 페이스는
 * world.test.ts의 특성화 테스트가 핀을 박는다 — 튜닝하려면 그 테스트부터 고쳐라.
 *
 * ⚠️ **호출은 주 경계에서 1회** — 같은 week로 두 번 부르면 두 번 빠진다(멱등 아님).
 * 순수·결정론(week 시드 파생).
 */
export function stepWorld(world: WorldState, week: number): WorldState {
  const first = driftOnce(world, week, 0)
  if (!first) return world // RURAL 고갈 — 더 빠질 사람이 없다
  if (seededUnit(callSeed(week, 0, 0, EXTRA_DRIFT_SALT)) >= EXTRA_DRIFT_CHANCE) return first
  return driftOnce(first, week, 1) ?? first
}

/** RURAL 배후 총량(필수과별 배후 병원 수의 합) — transferPressure의 분모·분자. */
function ruralBackupTotal(regions: RegionState[]): number {
  const rural = findRegion(regions, 'RURAL')
  return (Object.keys(rural.doctors) as Specialty[])
    .reduce((n, s) => n + backupHospitals(rural, s), 0)
}

/**
 * transferPressure의 분모 — 초기 RURAL 배후 총량. **모듈 상수다**(REGION_INITIAL이 상수라 불변).
 * 상수로 뽑으면 매 호출 재계산이 사라지고, "분모는 세션 상태가 아니다"라는 전제가 코드에 드러난다.
 * 덤으로 `initial <= 0` 같은 0 나눗셈 가드가 불필요해진다 — 값이 컴파일 시점에 고정된 6이고,
 * REGION_INITIAL의 불변식 ②(RURAL 배후 ≥ 1, world.test.ts가 가드)가 0을 이미 막는다.
 */
const RURAL_BACKUP_INITIAL = ruralBackupTotal(REGION_INITIAL)

/**
 * 전원 압력 0..1 — 지방 배후가 초기 대비 얼마나 무너졌나.
 * 0 = 온전(초기), 1 = 전멸. receiving.createCallQueue의 3번째 인자로 들어가(Task 7)
 * 원거리(RURAL발) 응급 전원 비중을 끌어올린다. 판정에는 안 들어간다.
 *
 * 단조성은 우연이 아니다: stepWorld는 RURAL에서 빼기만 하고 backupHospitals는
 * doctors에 대해 단조 증가라 — 드리프트가 도는 동안 이 값은 절대 안 내려간다.
 * (이벤트 쇼크는 유입도 표현할 수 있어 그때는 내려갈 수 있다 — 의도된 비대칭.)
 *
 * ⚠️ **전제**: 분모는 세션 상태가 아니라 `REGION_INITIAL`이다 — 초기 세계가 이 상수 하나뿐이라는
 * 전제에 의존한다. 난이도·시나리오로 초기 세계가 달라지면 재검토해야 한다(분모를 인자로 받거나
 * 세션이 자기 초기 스냅샷을 들고 있어야 한다).
 */
export function transferPressure(world: WorldState): number {
  const now = ruralBackupTotal(world.regions)
  // 유입 쇼크로 초기보다 나아질 수 있어 하한이 필요하다(상한은 now ≥ 0이라 수학적으로 불필요).
  return Math.max(0, 1 - now / RURAL_BACKUP_INITIAL)
}

/**
 * 발신 지역 표시용 가공 지명 — 실존 지명·실사건 토큰 금지.
 * ⚠️ news.ts의 FICTIONAL_REGIONS(한내시·서림시·금하시·백천시)와 **이름을 겹치지 않는다** —
 * 겹치면 같은 가공 도시가 두 상수에 살아 이중 기재가 된다(용도가 다르다: 저긴 신문, 여긴 콜 발신지).
 *
 * 📌 계획서 초안(서흥구·남정구 / 한내시·금하시 / 먼내군·두밀군·자운군)에서 이름을 바꾼 사유는 둘이다:
 *   ① **서흥구는 실존 행정구역명**이다(황해북도 서흥군) — 가공 지명 원칙 위반.
 *   ② **한내시·금하시는 news.ts FICTIONAL_REGIONS와 완전 동일명**이다 — 바로 위 비중복 요구 위반.
 * 그래서 순우리말 조어로 통일했다(가온·누리·늘목·벼리·먼내·두메·새벌). 이 비중복은
 * world.test.ts의 검사기 테스트가 강제한다 — 규약만 적어두면 다음 지명 추가에서 조용히 썩는다.
 */
export const REGION_LABELS: Record<RegionKey, readonly string[]> = {
  CAPITAL: ['가온구', '누리구'],
  METRO: ['늘목시', '벼리시'],
  RURAL: ['먼내군', '두메군', '새벌군'],
}
