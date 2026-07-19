import { describe, it, expect } from 'vitest'
import { termsInText, GLOSSARY } from './glossary'

// 개원 이벤트 헤드라인 — 전문용어가 가장 촘촘한 실제 케이스.
const OPENING = '필수의료 정책수가 인상 의결 — 재정중립 원칙 따라 타 급여수가 동반 조정'

describe('termsInText — 헤드라인에서 아는 용어 감지', () => {
  it('개원 헤드라인의 용어를 읽는 순서대로 준다', () => {
    expect(termsInText(OPENING).map((e) => e.term)).toEqual([
      '필수의료',
      '수가',
      '재정중립',
      '급여 / 비급여',
    ])
  })

  it('아는 용어가 없으면 빈 배열', () => {
    expect(termsInText('오늘 날씨가 맑습니다')).toEqual([])
  })

  it('"비급여"에서 "급여"를 겹쳐 오탐하지 않는다 (긴 것 우선·비중복)', () => {
    expect(termsInText('비급여 진료 비중 상승').map((e) => e.term)).toEqual(['급여 / 비급여'])
  })

  it('"정책수가"에서 "수가"를 겹쳐 오탐하지 않는다', () => {
    expect(termsInText('정책수가 신설').map((e) => e.term)).toEqual(['수가'])
  })

  it('"급여수가"는 급여 + 수가 둘로 분해된다 (급여가 앞이라 급여 먼저)', () => {
    expect(termsInText('급여수가 동반 조정').map((e) => e.term)).toEqual(['급여 / 비급여', '수가'])
  })

  it('같은 용어가 여러 번 나와도 한 번만', () => {
    expect(termsInText('수가 논쟁, 또 수가 논쟁').filter((e) => e.term === '수가')).toHaveLength(1)
  })

  it('뒤에 오는 용어가 결과에서도 뒤에 온다', () => {
    expect(termsInText('재정중립 원칙에도 필수의료는').map((e) => e.term)).toEqual([
      '재정중립',
      '필수의료',
    ])
  })
})

describe('GLOSSARY — 콘텐츠 무결성', () => {
  it('모든 항목이 대표어·정의·감지문자열을 갖는다', () => {
    expect(GLOSSARY.length).toBeGreaterThan(0)
    for (const e of GLOSSARY) {
      expect(e.term).toBeTruthy()
      expect(e.def).toBeTruthy()
      expect(e.match.length).toBeGreaterThan(0)
    }
  })
})
