// 특성·사연·이름 — 의사를 **사람으로 부르기 위한 재료**다. leaf(아무것도 임포트하지 않는다).
//
// ⚠️ **수치 효과가 없다**(이번 슬라이스). 특성은 사직 편지·연출문의 재료이고 우선순위 패널에
// 표시될 뿐, 진료 속도·피로·사직 임계 어느 것도 건드리지 않는다. 효과를 붙이는 것은 개성
// 상호작용이 따라오는 본선 재료라 여기서 절단한다(PR C가 스트레스를 절단한 것과 같은 근거:
// 효과 없는 셋째 축은 새 결정을 안 낳는다). 그 절단이 **의도임을 여기 적어 두는 이유**는,
// 값이 없는 필드를 본 다음 사람이 "빠뜨렸구나" 하고 반쯤 붙이는 것을 막기 위해서다.
//
// 부여 경로는 둘이고 **RNG를 쓰지 않는 것이 공통 계약이다.** 시드를 소비하면 이름·특성이
// 도착·응급 스트림과 축을 나눠 갖게 되어, "몇 번째로 뽑았나"가 아니라 "그 주에 무슨 일이
// 있었나"가 사람을 바꾼다.
//
// ① **채용 경로가 정본이다** — `candidate.candidateOf`가 **(과, 슬롯)의 전역 분할**로 이름과
//    특성을 함께 정한다(전국 풀 합계 18을 DOCTOR_NAMES 18개에 1:1). 슬롯이 좌표라 과가 달라도
//    이름이 겹치지 않고, 카드에 미리 보인 사람과 뽑힌 폰이 같은 사람이다.
// ② **손세계 폴백** — 채용을 거치지 않는 `pawn.spawnDoctor` 직접 호출(테스트의 손세계 폰)만
//    아래 `doctorName(채용 서수)`·`pickTraits(nextId)`를 쓴다. 그쪽은 두 축의 인덱스가 다르고
//    유일성 보장도 없다 — 채용 경로가 아니므로 필요가 없다.

/** 특성 키 목록 — **배열이 단일 출처**다(유니온을 여기서 파생한다). 순서가 곧 인덱싱 순서라
 *  결정론의 일부다: 가운데에 키를 끼워 넣으면 이미 뽑힌 의사들의 특성이 소급해서 바뀐다. */
export const TRAIT_KEYS = [
  'WORKAHOLIC', 'SOFT_HEARTED', 'BLUNT', 'NIGHT_OWL',
  'PERFECTIONIST', 'FAMILY_FIRST', 'IDEALIST', 'BURNT_ONCE',
] as const

export type TraitKey = (typeof TRAIT_KEYS)[number]

export interface TraitSpec {
  /** 패널에 뜨는 짧은 이름. */
  label: string
  /** 한 줄 사연 — **보간 없이 그 자체로 완결된 문장**이다(T-094: 보간값 뒤에 조사를 두지 않는다).
   *  이름·과를 끼워 넣고 싶어지는 자리지만, 그러면 「김서준이/가」 분기가 여기에도 생긴다.
   *  템플릿은 Task 4(narrative.ts) 소관이고 이 카탈로그는 그 재료다. */
  story: string
}

/** 특성 카탈로그(각색 — 인물 묘사이지 임상·심리 주장이 아니다).
 *  `Record<TraitKey, …>`라 키를 하나라도 빠뜨리면 컴파일이 막는다. */
export const TRAITS: Record<TraitKey, TraitSpec> = {
  WORKAHOLIC: { label: '일중독', story: '쉬는 법을 배운 적이 없다.' },
  SOFT_HEARTED: { label: '인정 많음', story: '환자 이야기를 끝까지 듣는다.' },
  BLUNT: { label: '무뚝뚝', story: '설명은 짧고 손은 정확하다.' },
  NIGHT_OWL: { label: '야행성', story: '새벽 당직이 오히려 편하다고 말한다.' },
  PERFECTIONIST: { label: '완벽주의', story: '차트를 세 번 다시 읽는다.' },
  FAMILY_FIRST: { label: '가정적', story: '저녁 식탁에 늦지 않으려 애쓴다.' },
  IDEALIST: { label: '이상주의', story: '돈이 안 되는 과를 굳이 골라 왔다.' },
  BURNT_ONCE: { label: '한 번 그만둔 적 있음', story: '떠났다가 돌아온 이력이 있다.' },
}

/** 의사 이름 후보(각색 · 실존 인물과 무관) — 인덱스를 정하는 곳이 **둘**이다: 채용 경로는
 *  `candidate.candidateOf`의 (과, 슬롯) 전역 분할, 손세계 폴백·간호사는 아래 `doctorName`.
 *
 *  ⚠️ **길이가 전국 풀 합계(18) 이상이라야 한 판에서 동명이인이 없다.** 전역 분할이 이 목록을
 *  과별 구간으로 1:1로 나눠 쓰므로, 목록이 짧으면 구간이 겹치거나 `undefined` 이름이 폰에 실린다.
 *  풀을 튜닝해 늘리는 날 traits.test의 카탈로그 단언이 먼저 터져 여기를 함께 늘리게 한다 —
 *  숫자를 이 주석에만 적어 두면 그 도장이 조용히 낡는다. */
export const DOCTOR_NAMES: readonly string[] = [
  '김서준', '이도현', '박지우', '최민서', '정하은', '강태윤',
  '조예린', '윤시우', '장수아', '임건우', '한지호', '오채원',
  '신유진', '배준영', '문가온', '서다인', '곽재민', '노은결',
]

/**
 * nextId → 특성 두 개. **두 값은 항상 서로 다르다**.
 *
 * 산수: 첫 특성은 `nextId % n`, 둘째는 거기서 `1..n-1` 만큼 떨어진 자리다. 오프셋이 0이 될 수
 * 없으므로 같은 특성이 두 번 나오는 경우가 **구조적으로** 없다 — 뽑고 나서 같으면 다시 뽑는
 * 형태로 쓰지 않는 이유가 이것이다(그 형태는 "다시 뽑기"를 잊는 순간 조용히 깨진다).
 * 오프셋이 `nextId / n`을 따라 도는 덕에 조합이 n×(n−1)까지 돌아 초반 의사들이 겹치지 않는다.
 */
export function pickTraits(nextId: number): readonly [TraitKey, TraitKey] {
  const n = TRAIT_KEYS.length
  const first = nextId % n
  const second = (first + 1 + (Math.floor(nextId / n) % (n - 1))) % n
  return [TRAIT_KEYS[first], TRAIT_KEYS[second]]
}

/** 서수 → 이름. **의사 채용 경로는 이 함수를 쓰지 않는다** — 거기서는 (과, 슬롯) 전역 분할이
 *  이름을 정한다(candidate.candidateOf). 남은 사용처는 둘뿐이다: ① 채용을 거치지 않는
 *  `pawn.spawnDoctor` 직접 호출(테스트의 손세계 폰) ② **간호사 이름**(pawn.hireNurse — 간호사는
 *  카탈로그 밖이라 슬롯이 없고, 의사 목록을 나눠 쓴다).
 *
 *  ⚠️ 인자가 `nextId`가 **아닌 것이 계약이다**: nextId는 방·환자·응급까지 올리는 전역 카운터라
 *  채용과 무관하게 뛰고, 그러면 8명만 뽑아도 이름이 겹친다(실측). */
export function doctorName(hiredEver: number): string {
  return DOCTOR_NAMES[hiredEver % DOCTOR_NAMES.length]
}
