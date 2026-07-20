// 세계 이벤트 헤드라인의 전문용어를 opt-in으로 풀어주는 용어집(순수 데이터 + 감지 셀렉터).
// 원칙: 단어 정의만 — 현실 맥락·문제·게임 효과는 넣지 않는다. 의료 시스템의 문제는 플레이하며 느끼게(show-don't-tell).
// 근거: docs/research/fee-schedule-and-subsidies.md · essential-care-economics.md.
// 정확도 주의(fee-schedule §1): 수가는 '과'가 아니라 '행위'에 붙는다 — "과별 수가 인상" 표현 금지.

export interface GlossaryEntry {
  /** 펼침 패널에 쓰는 대표 표기. */
  term: string
  /** 헤드라인에서 이 항목을 감지할 문자열들(대표어 + 별칭). 순서 무관 — 셀렉터가 길이순 처리. */
  match: string[]
  /** 한 줄 중립 정의. 문제·맥락은 넣지 않는다. */
  def: string
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: '수가',
    match: ['정책수가', '수가'],
    def: '건강보험이 진료 행위마다 정하는 공정 가격(상대가치점수 × 환산지수 × 종별가산율, 건강보험정책심의위원회 의결).',
  },
  {
    term: '재정중립',
    match: ['재정중립'],
    def: '건강보험 총지출을 그대로 두는 원칙 — 한 항목 수가를 올리면 재정을 지키려 다른 항목을 그만큼 내린다.',
  },
  {
    term: '급여 / 비급여',
    match: ['비급여', '급여'],
    def: '급여 = 건강보험이 값을 정하고 일부를 대주는 진료. 비급여 = 보험 밖이라 병원이 가격을 자율로 정하는 진료(미용 등).',
  },
  {
    term: '필수의료',
    match: ['필수의료'],
    def: '생명에 직결되지만 저수가·고위험이라 병원이 기피하기 쉬운 분야(응급·외상·심뇌혈관·분만·소아 등).',
  },
  {
    term: '배후진료',
    match: ['배후진료', '배후'],
    def: '응급 환자를 실제로 수술·시술할 전문과(순환기내과·흉부외과 등)가 병원 뒤에서 대기하는 것.',
  },
  {
    term: '가산',
    match: ['가산'],
    def: '기본 수가에 특정 조건(과목·시설·중증도)을 만족할 때 얹어 주는 추가 보상.',
  },
  {
    term: '상대가치점수',
    match: ['상대가치점수', '상대가치'],
    def: '의료 행위마다 매긴 상대적 가치 점수 — 수가 계산의 뼈대(점수 × 환산지수 × 가산율).',
  },
  {
    term: '과보상',
    match: ['과보상'],
    def: '원가 대비 수가가 높게 책정된 상태(검체·영상 등) — 재분배 개편의 인하 대상.',
  },
]

/**
 * 텍스트에 실제 등장하는 용어 항목만 읽는 순서대로 반환.
 * 긴 감지문자열 우선·비중복(masking) 매칭으로 `급여 ⊂ 비급여`, `수가 ⊂ 정책수가` 오탐을 막는다.
 * 한 항목이 여러 번/여러 별칭으로 걸려도 한 번만(가장 이른 위치 기준으로 정렬).
 */
export function termsInText(text: string): GlossaryEntry[] {
  // 긴 문자열이 먼저 구간을 claim하도록 길이 내림차순. (JS sort는 안정 정렬)
  const pairs = GLOSSARY.flatMap((entry) => entry.match.map((m) => ({ m, entry })))
  pairs.sort((a, b) => b.m.length - a.m.length)

  const claimed = new Array<boolean>(text.length).fill(false)
  const firstIndex = new Map<GlossaryEntry, number>()

  for (const { m, entry } of pairs) {
    for (let from = 0; ; ) {
      const idx = text.indexOf(m, from)
      if (idx === -1) break
      let overlaps = false
      for (let i = idx; i < idx + m.length; i++) {
        if (claimed[i]) {
          overlaps = true
          break
        }
      }
      if (!overlaps) {
        for (let i = idx; i < idx + m.length; i++) claimed[i] = true
        const prev = firstIndex.get(entry)
        if (prev === undefined || idx < prev) firstIndex.set(entry, idx)
      }
      from = idx + 1
    }
  }

  return [...firstIndex.entries()].sort((a, b) => a[1] - b[1]).map(([entry]) => entry)
}
