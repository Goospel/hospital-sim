import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import PaletteRoster from './PaletteRoster'
import { FATIGUE_MAX } from '@/game/doctor'
import { simDept } from '@/sim/dept'
import type { Pawn } from '@/sim/pawn'

/**
 * 팔레트 상주 로스터 — **인사 패널을 열지 않아도 사람의 상태가 메인 화면에 서 있는가**.
 *
 * ⚠️ **DOM 없이 정적 마크업으로 잰다**(hirePanel.test.tsx 머리말과 같은 이유): 이 저장소엔
 * jsdom·testing-library가 없고 마감 앞에서 의존성을 늘리지 않는다. 그래서 클릭은 못 재고
 * **무엇이 그려지는가**만 잰다 — `onOpen` 배선은 SimGame의 `setPriorityOpen(true)` 한 줄이다.
 *
 * 이 파일이 잠그는 계약 넷: **줄 수**(의사마다 한 줄) · **막대 폭**(피로 정규화 + 클램프) ·
 * **떠남 표지**(색 단독 신호 금지 — 글자가 함께 진다) · **간호 줄**(SHORT일 때만 alarm).
 */

const doctor = (over: Partial<Pawn> & { id: string }): Pawn =>
  ({ kind: 'DOCTOR', x: 0, y: 0, dept: 'INTERNAL_MEDICINE', name: `의사${over.id}`, fatigue: 0, ...over }) as Pawn

const MET = { count: 2, required: 2, grade: 'MET' } as const
const NONE: ReadonlySet<string> = new Set()

function render(over: Partial<Parameters<typeof PaletteRoster>[0]> = {}) {
  return renderToStaticMarkup(
    <PaletteRoster doctors={[doctor({ id: 'd1' })]} resigningIds={NONE} nursing={MET} onOpen={() => {}} {...over} />,
  )
}

/** 의사 줄 하나씩 — 버튼 안쪽만 잘라 낸다(마지막 조각이 간호 줄까지 삼키지 않게). */
function rows(markup: string): string[] {
  return markup
    .split('<button')
    .slice(1)
    .map(p => p.slice(0, p.indexOf('</button>')))
}

describe('팔레트 로스터 — 의사 줄', () => {
  it('의사 수만큼 줄이 서고 각 줄에 이름과 과가 있다', () => {
    const doctors = [
      doctor({ id: 'd1', name: '김내과' }),
      doctor({ id: 'd2', name: '박외과', dept: 'GENERAL_SURGERY' }),
      doctor({ id: 'd3', name: '이미용', dept: 'AESTHETICS' }),
    ]
    const list = rows(render({ doctors }))
    expect(list, '줄 수').toHaveLength(3)
    for (const [i, p] of doctors.entries()) {
      expect(list[i], `${p.name} 이름`).toContain(p.name!)
      expect(list[i], `${p.name} 과`).toContain(simDept(p.dept!).label)
      expect(list[i], `${p.name} aria`).toContain(`aria-label="`)
    }
  })

  it('받은 순서 그대로 선다 — 피로순으로 다시 세우지 않는다', () => {
    // 값이 변할 때마다 줄이 튀면 손이 기억하는 자리가 없어져 오히려 안 읽힌다.
    const doctors = [
      doctor({ id: 'd1', name: '가나다', fatigue: 90 }),
      doctor({ id: 'd2', name: '라마바', fatigue: 10 }),
      doctor({ id: 'd3', name: '사아자', fatigue: 50 }),
    ]
    expect(rows(render({ doctors })).map(r => r.match(/[가-힣]{3}/)![0])).toEqual(['가나다', '라마바', '사아자'])
  })

  it('피로 막대 폭 = fatigue/FATIGUE_MAX — 0 미만·MAX 초과는 클램프된다', () => {
    // 이진수 잔차를 피해 100의 약수만 쓴다(0.3*100 = 30.000000000000004).
    const cases: Array<[number, number]> = [
      [-10, 0], [0, 0], [25, 25], [50, 50], [FATIGUE_MAX, 100], [FATIGUE_MAX * 2, 100],
    ]
    const list = rows(render({ doctors: cases.map(([f], i) => doctor({ id: `d${i}`, fatigue: f })) }))
    for (const [i, [fatigue, pct]] of cases.entries()) {
      expect(list[i], `피로 ${fatigue} → ${pct}%`).toContain(`width:${pct}%`)
      // 수치도 함께 실린다 — 막대 길이만으로는 스크린리더에 아무것도 안 남는다.
      expect(list[i], `피로 ${fatigue} aria 수치`).toContain(`피로 ${Math.round(Math.max(0, Math.min(FATIGUE_MAX, fatigue)))}`)
    }
  })

  it('사직 예고자에게만 텍스트 표지 「떠남」과 alarm 톤이 붙는다', () => {
    // 색 단독 신호 금지(관통 규칙) — 색과 글자가 **같이** 진다.
    const doctors = [doctor({ id: 'stay', name: '남는이' }), doctor({ id: 'go', name: '떠나리' })]
    const [stay, go] = rows(render({ doctors, resigningIds: new Set(['go']) }))
    expect(go, '떠남 표지').toContain('떠남')
    expect(go, '떠남 톤').toContain('text-alarm')
    expect(stay, '비예고자 표지 없음').not.toContain('떠남')
    expect(stay, '비예고자 톤 없음').not.toContain('text-alarm')
  })
})

describe('팔레트 로스터 — 간호 줄', () => {
  it('인원과 기준을 수치로 적는다', () => {
    expect(render({ nursing: { count: 1, required: 3, grade: 'SHORT' } })).toContain('간호 1명 · 기준 3명')
  })

  it('SHORT일 때만 alarm 톤 — 채용·인사 화면과 같은 판정을 읽는다', () => {
    // 톤 클래스는 텍스트 **앞**(여는 태그)에 있으므로 「간호」가 아니라 그 단락에서 자른다 —
    // 문구에서 자르면 SHORT여도 클래스를 못 보고 초록불이 뜬다(실측으로 한 번 밟았다).
    const nurseLine = (markup: string) => {
      const at = markup.lastIndexOf('<p')
      expect(at, '간호 단락').toBeGreaterThan(-1)
      const line = markup.slice(at)
      expect(line, '간호 단락 내용').toContain('간호 ')
      return line
    }
    for (const grade of ['MET', 'BONUS'] as const) {
      expect(nurseLine(render({ nursing: { count: 2, required: 2, grade } })), grade).not.toContain('text-alarm')
    }
    expect(
      nurseLine(render({ nursing: { count: 1, required: 3, grade: 'SHORT' } })),
      'SHORT',
    ).toContain('text-alarm')
  })
})

describe('팔레트 로스터 — 빈 병원', () => {
  it('의사 0명이면 아무것도 안 그린다 — 빈 제목·빈 간호 줄이 서 있지 않게', () => {
    expect(render({ doctors: [], nursing: { count: 0, required: 0, grade: 'MET' } })).toBe('')
  })
})
