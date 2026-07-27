// 과 카탈로그 — 새 시뮬(`src/sim`)의 과별 경제·강도. 순수 데이터 + 조회 함수.
//
// **부호 원칙**(기존 게임 §필수의료 경제 계승): 필수과(내과·외과·순환기)는 **수가가 낮고
// 주 고정비가 높아** 과별 순익이 적자로 기울고, 미용만 흑자 후보다. 이 게임의 논지가
// "옳은 의료를 할수록 장부가 나빠진다"이므로, 그 결과는 어딘가에 상수로 박히는 게 아니라
// 이 표(수가·고정비)와 플레이어의 채용·건설이 만나 **장부에서 창발**해야 한다.
// 그래서 여기에는 '흑자'라는 필드가 없다 — 옛 게임이 미용에 `profitPerDoctorBillions: +70`을
// 박아 진료를 한 건도 안 봐도 흑자가 나던 실패(T-069)를 되풀이하지 않는다.
//
// ⚠️ **금액·강도는 전부 각색·튜닝값이다**(임상·회계 주장 아님). 기존 `src/game`의 상수를
// 1:1 복사한 게 아니라 **대소·부호만 계승하고 새 시뮬 스케일로 다시 잡았다** — 옛 층은
// "하루 60여 통의 콜"을 세는 스케일이고, 여기는 "20분짜리 외래를 하루 몇 건 소화하는가"라
// 같은 숫자를 옮기면 부호가 뒤집힌다. 값을 조정할 땐 부호 불변식(계획 Task 5 I-B1)을 지킨다.
// 값의 단일 출처는 이 파일이고, 표는 계획 문서
// (`docs/superpowers/plans/2026-07-28-rimworld-week2-dept-economy.md`)와 짝을 이룬다.
import type { DeptKey } from '../game/types'

/** 이번 슬라이스에서 실제로 도는 과 4개.
 *  나머지 과(산부·신경외과·흉부외과·검진)는 **2주차 절단**이다 — 기존 게임의 `DeptKey`에는
 *  남아 있으므로 여기서 좁혀 뽑는다. 새 과를 열 때는 이 유니온에 키를 더하고 카탈로그에 줄을
 *  추가하면 채용 목록(HIRABLE_DEPTS)까지 함께 따라온다. */
export type SimDeptKey = Extract<
  DeptKey,
  'AESTHETICS' | 'INTERNAL_MEDICINE' | 'GENERAL_SURGERY' | 'CARDIOLOGY'
>

export interface SimDeptSpec {
  key: SimDeptKey
  label: string
  /** 외래 진료 한 건의 수익(만원). 원가는 따로 세지 않는다 — 이 시뮬의 비용은 주 고정비 한 층이다. */
  examRevenueManwon: number
  /** 의사 1명당 **주** 고정비(만원, 항상 양수). 진료를 한 건도 안 봐도 나간다. */
  weeklyCostManwon: number
  /** 피로 강도 계수 — 부하 = 진료 분 × 강도(계획 Task 4가 읽는다). 같은 시간을 일해도
   *  필수과가 더 갈린다는 비대칭이 여기서 온다. */
  intensity: number
}

/**
 * 과 카탈로그. 값마다 기존 근거의 출처와 **각색 방향**을 적는다 — 숫자만 남으면 나중에
 * 튜닝할 때 무엇을 지켜야 하는지(부호·대소)가 사라진다.
 *
 * ⚠️ 계획 표의 응급 열(외과 ACUTE_ABDOMEN·순환기 STEMI)은 여기 없다 — 응급은 도착·판정·
 * 처치 시간까지 한 덩어리라 `src/sim/emergency.ts`(계획 Task 3)가 그 단일 출처다.
 * 이 파일이 미리 절반만 들고 있으면 두 곳에 수가가 적힌다.
 */
export const SIM_DEPTS: Record<SimDeptKey, SimDeptSpec> = {
  AESTHETICS: {
    key: 'AESTHETICS',
    label: '미용·피부',
    // 30 = `src/game/receiving.ts` CALL_ECONOMICS.COSMETIC_WALKIN.revenueManwon **그대로**.
    // **이 카탈로그 4과 중 유일하게** 비급여라 병원이 값을 정한다(옛 층엔 검진도 비급여로 있었지만
    // 2주차 절단이다) — 수가가 정책이 아니라 시장에서 오는 과라 옛 층과 스케일이 같다(보톡스 한 건 30만원).
    examRevenueManwon: 30,
    // 2,500 ← `src/game/types.ts` DEPARTMENTS.AESTHETICS.fixedCostPerDoctorManwon(560)에서 **대소만**
    // 계승했다(모든 과 중 가장 가볍다 — 24시간 대기가 없다). 절대액은 새 스케일로 재조정:
    // 이 시뮬은 하루 8시간·20분 진료라 의사 1인 주 처리량이 옛 층보다 훨씬 작다.
    weeklyCostManwon: 2_500,
    // 0.3 = `src/game/doctor.ts` FATIGUE_INTENSITY.COSMETIC_WALKIN **그대로**. 예약제 루틴 시술이라
    // 저강도라는 판단은 스케일과 무관해 그대로 옮긴다.
    intensity: 0.3,
  },
  INTERNAL_MEDICINE: {
    key: 'INTERNAL_MEDICINE',
    label: '내과',
    // 12 ← 급여 외래는 원가의 절반만 받는다(기본진료 50.5% 밴드 — CALL_ECONOMICS.MEDICAL_EMERGENCY
    // 190/380이 그 밴드의 실례). 미용(30)의 절반 이하로 잡아 **저수가 박리다매**를 수치로 만든다.
    examRevenueManwon: 12,
    // 3,000 ← DEPARTMENTS.INTERNAL_MEDICINE(700) — 필수과 중 가장 가볍되 미용보다는 무겁다는
    // 대소를 계승. 옛 주석대로 내과는 24h 대기 비용이 아니라 외래 볼륨 쪽이라 필수과 최저다.
    weeklyCostManwon: 3_000,
    // 1.0 = FATIGUE_INTENSITY.SPECIALIST_ELECTIVE(외래+검사 = 기준선) 그대로.
    intensity: 1.0,
  },
  GENERAL_SURGERY: {
    key: 'GENERAL_SURGERY',
    label: '외과',
    // 25 ← 외래 진찰+검사 밴드(CALL_ECONOMICS.SPECIALIST_ELECTIVE 26)에 맞춘 값. 내과보다는
    // 높되 미용(30)은 못 넘는다 — 급여과가 비급여를 이기지 못한다는 부호가 여기서 유지된다.
    examRevenueManwon: 25,
    // 4,000 ← DEPARTMENTS.GENERAL_SURGERY(840) — 수술·응급 대기가 붙어 내과보다 무겁다는 대소 계승.
    weeklyCostManwon: 4_000,
    // 1.2 ← FATIGUE_INTENSITY의 기준선(1.0, 외래)과 응급(1.5~2.0) 사이. 필수과 외래는 기준선보다
    // 무겁지만 응급 수술은 아니다 — 응급 강도(2.0)는 계획 Task 4가 따로 얹는다.
    intensity: 1.2,
  },
  CARDIOLOGY: {
    key: 'CARDIOLOGY',
    label: '순환기내과',
    // 25 ← 외과와 같은 급여 외래 밴드(SPECIALIST_ELECTIVE 26). 순환기의 흑자는 외래가 아니라
    // 시술에서 나오므로(옛 층의 검사 160.5% 논지) 외래 수가로 보상하지 않는다.
    examRevenueManwon: 25,
    // 5,000 ← DEPARTMENTS.CARDIOLOGY(1190) — 24시간 심장중재팀 대기가 붙어 무겁다.
    // ⚠️ 옛 층에서 순환기는 **필수과 6개 중 3위**다(흉부외과 1400·신경외과 1260이 위). 그 둘이
    // 2주차 절단이라 **이 4과 안에서만** 최고가인 것이지, "가장 무거운 과"가 아니다 — 값을 조정할 때
    // 이 자리를 옛 층의 천장으로 착각하면 표 밖으로 올라간다. 이 4과 안의 대소가
    // "순환기를 뽑을수록 장부가 나빠진다"의 근거다.
    weeklyCostManwon: 5_000,
    // 1.2 = 외과와 같은 근거(필수과 외래 — 기준선 1.0과 응급 1.5~2.0 사이). 두 과의 외래는
    // 의사에게 같은 무게라고 본다 — 갈리는 차이는 강도가 아니라 응급(Task 4의 ×2.0)에서 온다.
    intensity: 1.2,
  },
}

/** 채용 패널에 뜨는 과 = 카탈로그 그대로. **파생이라 두 곳에 적히지 않는다** — 카탈로그에
 *  과를 더하면 채용 목록이 저절로 따라온다. (채용은 못 하는데 진료는 도는 과가 생기면 그때
 *  카탈로그에 플래그를 판다. 지금은 그런 과가 없어 미리 만들지 않는다.)
 *  순서는 객체 리터럴의 기재 순서 = 미용 → 내과 → 외과 → 순환기(고정비 오름차순)다. */
export const HIRABLE_DEPTS = Object.keys(SIM_DEPTS) as SimDeptKey[]

/** EXAM 방에 과가 지정되지 않았을 때의 기본값 — **마이그레이션 절단**이다.
 *  UI(계획 Task 6)는 건설 시 과를 반드시 고르게 하므로 플레이 중에는 도달할 수 없고,
 *  이 기본값은 과 개념이 없던 1주차 테스트·저장 세계가 그대로 도는 자리만 메운다. */
export const DEFAULT_EXAM_DEPT: SimDeptKey = 'INTERNAL_MEDICINE'

/** 과 조회 — 카탈로그의 유일한 진입점.
 *  없는 과에 `undefined`를 돌려주면 호출부에서 `undefined.examRevenueManwon`이 되어 수익이
 *  NaN으로 번지고, NaN은 금고를 통과해도 아무 예외를 안 낸다(무성 실패). 그래서 던진다. */
export function simDept(key: SimDeptKey): SimDeptSpec {
  const spec = SIM_DEPTS[key]
  if (!spec) throw new Error(`simDept: 카탈로그에 없는 과(${key}) — 2주차 절단 과이거나 오타다`)
  return spec
}

/** 과별 진료 스냅샷 — {환자 수, 수익(만원)}.
 *  기존 `src/game/deptLedger.ts`의 `DeptDayStats`와 **동형**(계승)이다: 저쪽은 수용된 콜을
 *  담당 과(handlingDept)로 접고, 여기는 완료된 외래를 환자의 희망 과로 접는다. 모양을 맞춰 둔
 *  이유는 결산 표(계획 Task 5·6)가 두 층에서 같은 읽기 코드를 쓸 수 있어야 하기 때문이다.
 *  다른 점은 키를 `SimDeptKey`로 좁힌 것뿐 — 이 층엔 2주차 절단 과가 아예 없다.
 *  **부분 기록(Partial)인 것도 계승이다**: 오늘 아무도 안 온 과는 0줄이 아니라 줄이 없다. */
export type SimDeptStats = Partial<Record<SimDeptKey, { patients: number; revenueManwon: number }>>

/** 과별 수익의 합 — 불변식 "Σ byDept.revenueManwon == 총수익"의 **단일 출처**다
 *  (기존 deptLedger 불변식 I-A 계승). 총액을 따로 누적해 두면 한쪽이 조용히 낡는다. */
export function deptRevenueSum(byDept: SimDeptStats): number {
  return Object.values(byDept).reduce((sum, s) => sum + (s?.revenueManwon ?? 0), 0)
}

/** 완료된 외래 한 건을 과별 집계에 더한 **새 객체**를 돌려준다(입력 불변 — tick의 순수성 계약).
 *  수가 조회를 여기 한 곳에 모아 둔다: 환자 수만 늘리고 수익을 안 더하거나 다른 과 수가를
 *  쓰는 어긋남이 호출부마다 따로 생길 수 없다. */
export function addExamToDeptStats(byDept: SimDeptStats, dept: SimDeptKey): SimDeptStats {
  const cur = byDept[dept] ?? { patients: 0, revenueManwon: 0 }
  return {
    ...byDept,
    [dept]: {
      patients: cur.patients + 1,
      revenueManwon: cur.revenueManwon + simDept(dept).examRevenueManwon,
    },
  }
}
