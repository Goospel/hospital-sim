import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import HirePanel from './HirePanel'
import { candidateOf, remainingCandidates, type Candidate } from '@/sim/candidate'
import { freshHirePool, HIRABLE_DEPTS, simDept, type SimDeptKey } from '@/sim/dept'

/**
 * 채용 패널 — **자리 수와 빈 자리**를 잠근다(그래픽 재설계 스펙 §2).
 *
 * ⚠️ **DOM 없이 정적 마크업으로 잰다**: 이 저장소엔 DOM 테스트 인프라가 없고(jsdom·testing-library
 * 미설치 · 다른 테스트는 전부 순수 로직), 마감 앞에서 의존성을 늘리지 않는다. 이미 있는
 * `react-dom/server`로 렌더한 HTML을 읽는다 — 그래서 **클릭은 못 재고 「무엇이 그려지는가」만 잰다**.
 * 클릭 배선(`onHire(cand.dept, cand.slot)`)은 이 변경에서 한 글자도 안 건드린 줄이다.
 *
 * 자리 수가 계약인 이유: 열의 길이 = 그 지역 풀 총량이라, **뽑을수록 카드가 빈 프레임으로 바뀌되
 * 열은 짧아지지 않는다**. 열이 짧아지면 "인력이 소진됐다"가 화면에서 사라진다.
 */

/** 소비 슬롯 — 두 과에 구멍을 낸다(미용 0·2 / 내과 1). 나머지 두 과는 만석 대조군이다. */
const HIRED: Record<SimDeptKey, number[]> = {
  AESTHETICS: [0, 2],
  INTERNAL_MEDICINE: [1],
  GENERAL_SURGERY: [],
  CARDIOLOGY: [],
}

const candidates = remainingCandidates(freshHirePool(), HIRED)
const consumed = Object.fromEntries(
  HIRABLE_DEPTS.map(d => [d, HIRED[d].map(s => candidateOf(d, s))]),
) as Record<SimDeptKey, Candidate[]>

function render(over: Partial<Parameters<typeof HirePanel>[0]> = {}) {
  return renderToStaticMarkup(
    <HirePanel
      pawns={[]}
      candidates={candidates}
      consumed={consumed}
      nursing={{ count: 0, required: 0, grade: 'MET' }}
      treasuryManwon={5000}
      onHire={() => {}}
      onHireNurse={() => {}}
      onClose={() => {}}
      {...over}
    />,
  )
}

/** 과별 열 마크업 — `<section>` 순서가 곧 HIRABLE_DEPTS 순서다. */
function columns(markup: string): Record<SimDeptKey, string> {
  const parts = markup.split('<section').slice(1)
  expect(parts, '열 수').toHaveLength(HIRABLE_DEPTS.length)
  return Object.fromEntries(HIRABLE_DEPTS.map((d, i) => [d, parts[i]])) as Record<SimDeptKey, string>
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1

describe('채용 패널 — 자리 수는 지역 풀 총량이다', () => {
  it('열의 자리 수 = 남은 후보 + 소비된 슬롯', () => {
    const col = columns(render())
    for (const d of HIRABLE_DEPTS) {
      const seats = candidates[d].length + consumed[d].length
      expect(count(col[d], '<article'), `${d} 자리 ${seats}개`).toBe(seats)
      // 그 합은 곧 전국 풀이다 — 열이 짧아지지 않는다는 계약의 다른 표현.
      expect(seats, `${d} 풀`).toBe(simDept(d).nationalPool)
    }
  })

  it('소비된 슬롯은 채용 버튼 없이 이름만 남는다 — 그 사람이 그 자리였다는 사실만 그린다', () => {
    const markup = render()
    for (const d of HIRABLE_DEPTS) {
      for (const gone of consumed[d]) {
        expect(markup, `${gone.name}(소비) 이름`).toContain(gone.name)
        expect(markup, `${gone.name}(소비) 버튼`).not.toContain(`aria-label="${gone.name} 채용"`)
      }
      for (const left of candidates[d]) {
        expect(markup, `${left.name}(남음) 버튼`).toContain(`aria-label="${left.name} 채용"`)
      }
    }
    // 버튼 총수 = 남은 후보 총수. 빈 프레임 하나에라도 버튼이 붙으면 여기서 갈린다.
    // (패널 자신의 aria-label은 「채용 — 전국 인력 시장」이라 이 꼬리와 안 겹친다.)
    const remaining = HIRABLE_DEPTS.reduce((n, d) => n + candidates[d].length, 0)
    expect(count(markup, ' 채용"'), '채용 버튼 수').toBe(remaining)
  })

  it('스타팅 게이트 시점(소비 0)엔 전 열이 만석이다', () => {
    // `[] as T[]` — 그냥 `[]`면 TS가 never[]로 좁혀 캐스트가 막힌다(candidate.freshHiredSlots와 같은 이유).
    const noSlots = Object.fromEntries(HIRABLE_DEPTS.map(d => [d, [] as number[]])) as Record<SimDeptKey, number[]>
    const noCands = Object.fromEntries(HIRABLE_DEPTS.map(d => [d, [] as Candidate[]])) as Record<SimDeptKey, Candidate[]>
    const col = columns(render({ candidates: remainingCandidates(freshHirePool(), noSlots), consumed: noCands }))
    for (const d of HIRABLE_DEPTS) {
      expect(count(col[d], '<article'), d).toBe(simDept(d).nationalPool)
    }
  })
})

describe('채용 패널 — 기존 계약 무변', () => {
  it('모달 계약: role=dialog · aria-modal · my-auto(T-088)', () => {
    const markup = render()
    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toContain('my-auto')
  })

  it('빈 과 사유 문구와 「이게 전부입니다」가 그대로 선다', () => {
    // 미용을 전부 소비한 판 — 남은 후보 0, 자리 8은 그대로.
    const all = { ...HIRED, AESTHETICS: [0, 1, 2, 3, 4, 5, 6, 7] }
    const markup = render({
      candidates: remainingCandidates(freshHirePool(), all),
      consumed: Object.fromEntries(
        HIRABLE_DEPTS.map(d => [d, all[d].map(s => candidateOf(d, s))]),
      ) as Record<SimDeptKey, Candidate[]>,
    })
    expect(markup).toContain(`전국에 남은 ${simDept('AESTHETICS').label} 의사가 없습니다.`)
    // 순환기내과는 전국 풀이 2명뿐이라 늘 바닥 신호가 뜬다.
    expect(markup).toContain('이게 전부입니다')
  })

  it('스타팅 모드: 남은 인원 안내와 잠긴 개원 버튼', () => {
    const markup = render({ starting: true })
    expect(markup).toContain('개원 준비 시작')
    expect(markup).toContain('3명 더 뽑으면 시작합니다')
    expect(markup).toContain('disabled=""')
  })
})

/**
 * 종이 위 본문 대비(스펙 §4-4) — 값은 globals.css **원본을 읽어** 잰다. 여기 hex를 다시 적으면
 * 토큰을 옮기는 날 테스트만 옛 색을 지키며 통과한다(이중 기재).
 *
 * **잉크는 2단뿐이다**(2026-08-03 정정 — 스펙 말미 「§6 정정」). 3단 `--ink-3`은 paper-2 위
 * 4.5:1을 지키면서 ink-2와 육안으로 갈리는 값이 없어(1.047:1까지 붙었다) 토큰째 삭제했다 —
 * 사연은 ink-2다. 흐림은 톤이 아니라 크기가 낸다(11px).
 */
describe('종이 카드 본문 대비 — ink/paper 4.5:1', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')
  const token = (name: string) => {
    const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    if (!m) throw new Error(`globals.css에 --${name}이 없다`)
    return m[1]
  }
  const wcag = (a: string, b: string) => {
    const lin = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      const ch = (v: number) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255)
    }
    const [hi, lo] = [lin(a), lin(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  it('ink·ink-2가 종이 그라디언트 양 끝에서 4.5:1 이상', () => {
    expect(wcag('#000000', '#ffffff')).toBeCloseTo(21, 4) // 식의 고정점
    for (const ink of ['ink', 'ink-2']) {
      for (const bg of ['paper', 'paper-2']) {
        const r = wcag(token(ink), token(bg))
        expect(r, `${ink}(${token(ink)}) on ${bg}(${token(bg)}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('잉크 2단의 서열: ink < ink-2 (대비를 올리다 흐린 단을 본문에 붙여버리지 않는다)', () => {
    // 대비 하한만 잠그면 ink-2를 ink까지 어둡게 하는 것이 초록불을 받는다 — 그러면 칩·사연이
    // 본문과 같은 톤이 된다. 서열은 종이가 밝으니 「대비가 작을수록 흐린 단」으로 뒤집어 읽는다.
    const onPaper2 = (t: string) => wcag(token(t), token('paper-2'))
    expect(onPaper2('ink-2')).toBeLessThan(onPaper2('ink'))
  })

  /**
   * 잔상 프레임의 이름 — **이 카드만 종이가 아니다**. 뒤가 어두운 모달(desk-2)이라 배경에 알파를
   * 주면 합성 결과가 종이도 desk도 아닌 중간색이 되고, 그 위의 흐린 잉크는 1.19:1까지 내려간다
   * (리뷰 2026-08-03 실측). 그래서 배경은 **불투명 paper-edge**, 글자는 **ink**다 — 토큰 대비와
   * 마크업을 **같이** 재야 한다: 수치만 잠그면 컴포넌트가 다른 조합을 써도 초록불이 뜬다.
   */
  it('잔상 이름: 불투명 paper-edge 위 ink — 수치 4.5:1이고 마크업도 그 조합이다', () => {
    const r = wcag(token('ink'), token('paper-edge'))
    expect(r, `ink(${token('ink')}) on paper-edge(${token('paper-edge')}) = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)

    const gone = consumed.AESTHETICS[0]
    const frame = render().split('<article').find(p => p.includes(gone.name))
    expect(frame, `${gone.name}(소비) 프레임`).toBeDefined()
    // 알파(`bg-paper-edge/45`)면 뒤의 모달이 비쳐 위 수치가 뜻을 잃는다 — 공백까지 봐야 갈린다.
    expect(frame, '불투명 배경').toContain('bg-paper-edge ')
    // `text-ink-3`·`text-ink-2`는 따옴표 앞에서 갈린다(클래스 끝).
    expect(frame, '이름 잉크').toContain('text-ink"')
  })
})
