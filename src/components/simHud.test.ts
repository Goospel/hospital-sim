import { describe, it, expect } from 'vitest'
import {
  doctorCountByDept, fatigueTone, roomLabel, turnAwayBatchText, turnAwayBreakdown, turnAwayBreakdownText,
  turnAwayText,
} from './simHud'
import { simDept } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway } from '../sim/emergency'
import type { Pawn } from '../sim/pawn'

/** 회차 사유 한 건을 짧게 쓰는 헬퍼 — 테스트가 읽히게. */
const away = (kind: EmergencyTurnAway['kind'], reason: EmergencyTurnAway['reason']): EmergencyTurnAway =>
  ({ kind, reason })

describe('turnAwayText — 회차 토스트 문구', () => {
  it('NO_SPECIALIST: 그 응급의 **배후과 이름**이 들어간다(카탈로그에서 파생 — 문구에 과 이름을 박지 않는다)', () => {
    const text = turnAwayText(away('STEMI', 'NO_SPECIALIST'))
    expect(text).toContain(simDept(emergencySpec('STEMI').dept).label)
    expect(text).toContain('의사가 없습니다')
  })

  it('NO_SPECIALIST: 응급 종류가 다르면 과도 다르다 — 급성복증은 외과다', () => {
    const text = turnAwayText(away('ACUTE_ABDOMEN', 'NO_SPECIALIST'))
    expect(text).toContain(simDept(emergencySpec('ACUTE_ABDOMEN').dept).label)
    // 순환기 문구가 새어 나오면 플레이어가 엉뚱한 과를 뽑는다 — 사유 토스트의 존재 이유가 뒤집힌다.
    expect(text).not.toContain(simDept(emergencySpec('STEMI').dept).label)
  })

  it('NO_BED: 병상 문제라고만 말한다 — 과 이름은 붙지 않는다(할 일이 채용이 아니라 건설이다)', () => {
    const text = turnAwayText(away('STEMI', 'NO_BED'))
    expect(text).toContain('병상이 없습니다')
    expect(text).not.toContain(simDept(emergencySpec('STEMI').dept).label)
  })

  it('어떤 사유든 응급 **종류**는 들어간다 — 무엇이 되돌아갔는지가 사실의 절반이다', () => {
    for (const t of [away('STEMI', 'NO_BED'), away('ACUTE_ABDOMEN', 'NO_SPECIALIST')]) {
      expect(turnAwayText(t)).toContain(emergencySpec(t.kind).label)
    }
  })

  it('톤 가드레일 — 비난·명령 카피 금지(사실만)', () => {
    // 스펙 §톤: 플레이어를 탓하는 말이 붙는 순간 "시스템이 문제"가 "네가 못했다"로 미끄러진다.
    const banned = ['당신', '놓쳤', '실패', '했어야', '탓', '죽었']
    for (const kind of ['STEMI', 'ACUTE_ABDOMEN'] as const) {
      for (const reason of ['NO_SPECIALIST', 'NO_BED'] as const) {
        const text = turnAwayText(away(kind, reason))
        for (const word of banned) expect(text).not.toContain(word)
      }
    }
  })
})

describe('turnAwayBatchText — 한 프레임에 여러 건이 몰릴 때', () => {
  // 3배속 한 프레임은 최대 15게임분이라 그 사이 회차가 둘 이상 붙을 수 있다.
  // 마지막 한 건만 띄우면 나머지는 **화면에 흔적 없이** 사라진다(폰이 안 만들어지는 사건이라
  // 다른 단서가 없다) — 건수는 HUD에서 늘지만 왜 늘었는지는 영영 안 보인다.
  it('한 건이면 그 건의 문구 그대로 — 흔한 경우에 요약 껍데기를 씌우지 않는다', () => {
    expect(turnAwayBatchText([away('STEMI', 'NO_BED')])).toBe(turnAwayText(away('STEMI', 'NO_BED')))
  })

  it('두 건 이상이면 건수 요약 + **마지막** 건의 문구', () => {
    const text = turnAwayBatchText([
      away('STEMI', 'NO_SPECIALIST'),
      away('ACUTE_ABDOMEN', 'NO_SPECIALIST'),
    ])
    expect(text).toContain('2건')
    expect(text).toContain(turnAwayText(away('ACUTE_ABDOMEN', 'NO_SPECIALIST')))
    // 첫 건의 과가 요약에 남으면 마지막 건과 섞여 어느 과를 뽑아야 하는지가 흐려진다.
    expect(text).not.toContain(simDept(emergencySpec('STEMI').dept).label)
  })

  it('건수는 실제 개수를 센다 — 3건이면 3건', () => {
    const text = turnAwayBatchText([
      away('STEMI', 'NO_BED'), away('STEMI', 'NO_BED'), away('STEMI', 'NO_BED'),
    ])
    expect(text).toContain('3건')
  })

  it('빈 배치는 문구가 없다(토스트를 띄우지 않는다는 신호)', () => {
    expect(turnAwayBatchText([])).toBe('')
  })

  it('톤 가드레일 — 요약에도 비난 카피가 없다', () => {
    const text = turnAwayBatchText([away('STEMI', 'NO_BED'), away('ACUTE_ABDOMEN', 'NO_SPECIALIST')])
    for (const word of ['당신', '놓쳤', '실패', '했어야', '탓', '죽었']) expect(text).not.toContain(word)
  })
})

describe('turnAwayBreakdown — 사유별 집계', () => {
  it('사유별로 센다', () => {
    expect(
      turnAwayBreakdown([
        away('STEMI', 'NO_SPECIALIST'),
        away('ACUTE_ABDOMEN', 'NO_SPECIALIST'),
        away('STEMI', 'NO_BED'),
      ]),
    ).toEqual({ NO_SPECIALIST: 2, NO_BED: 1 })
  })

  it('빈 내역은 0/0', () => {
    expect(turnAwayBreakdown([])).toEqual({ NO_SPECIALIST: 0, NO_BED: 0 })
  })

  it('문구는 **있는 사유만** 쓴다 — 0줄을 채우면 회차 0건인 주말에도 사유가 보인다', () => {
    expect(turnAwayBreakdownText([away('STEMI', 'NO_SPECIALIST'), away('STEMI', 'NO_SPECIALIST')]))
      .toBe('의사 없음 2')
    expect(turnAwayBreakdownText([away('STEMI', 'NO_BED')])).toBe('병상 없음 1')
    expect(turnAwayBreakdownText([away('STEMI', 'NO_SPECIALIST'), away('STEMI', 'NO_BED')]))
      .toBe('의사 없음 1 · 병상 없음 1')
    expect(turnAwayBreakdownText([])).toBe('')
  })
})

describe('fatigueTone — 피로 막대 3단(기존 게임 표현 계승)', () => {
  it('34 미만은 평상', () => {
    expect(fatigueTone(0)).toBe('CALM')
    expect(fatigueTone(33)).toBe('CALM')
  })

  it('34부터 감속 구간 — 경계가 곧 감속 시작(FATIGUE_SLOW_FROM)이다', () => {
    expect(fatigueTone(34)).toBe('SLOW')
    expect(fatigueTone(66)).toBe('SLOW')
  })

  it('67부터 레드존(FATIGUE_RED)', () => {
    expect(fatigueTone(67)).toBe('RED')
    expect(fatigueTone(100)).toBe('RED')
  })
})

describe('roomLabel — 방 이름(진료실만 과가 붙는다)', () => {
  it('EXAM은 과 이름을 달고 선다 — 어느 방이 무슨 과인지가 화면에서 읽혀야 라우팅이 이해된다', () => {
    expect(roomLabel({ type: 'EXAM', dept: 'AESTHETICS' })).toBe(`진료실 · ${simDept('AESTHETICS').label}`)
    expect(roomLabel({ type: 'EXAM', dept: 'CARDIOLOGY' })).toBe(`진료실 · ${simDept('CARDIOLOGY').label}`)
  })

  it('EXAM이 아닌 방엔 과가 없다(placeRoom이 떨군다) — 이름도 그대로다', () => {
    expect(roomLabel({ type: 'WARD' })).toBe('병동')
    expect(roomLabel({ type: 'WAITING' })).toBe('대기실')
  })
})

describe('doctorCountByDept — 채용 패널의 현재 인원', () => {
  const doc = (id: string, dept: Pawn['dept']): Pawn => ({ id, kind: 'DOCTOR', x: 0, y: 0, path: [], dept })

  it('의사를 과별로 센다', () => {
    const counts = doctorCountByDept([
      doc('d1', 'CARDIOLOGY'), doc('d2', 'CARDIOLOGY'), doc('d3', 'AESTHETICS'),
    ])
    expect(counts.CARDIOLOGY).toBe(2)
    expect(counts.AESTHETICS).toBe(1)
    expect(counts.INTERNAL_MEDICINE).toBe(0)
  })

  it('환자는 세지 않는다 — 판별은 **kind**다(과 필드가 있다고 직원이 되지는 않는다)', () => {
    // ⚠️ 이 환자는 `dept`를 들고 있다. 정상 흐름에서 환자가 그 필드를 갖는 일은 없지만
    // (환자의 과는 `wantsDept`다), 여기서 굳이 들려 보내는 이유는 이 함수가 세는 기준이
    // "과 필드가 있는가"가 아니라 "**주급을 받는 사람인가**"임을 잠그기 위해서다. 기준이
    // 필드 유무로 미끄러지면 채용 패널의 현재 인원과 결산 고정비가 서로 다른 수를 센다.
    const patient: Pawn = {
      id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [], stage: 'WAITING',
      wantsDept: 'CARDIOLOGY', dept: 'CARDIOLOGY',
    }
    expect(doctorCountByDept([patient]).CARDIOLOGY).toBe(0)
  })

  it('아무도 없으면 전 과가 0 — 채용 패널은 첫 판에도 4줄이 선다', () => {
    const counts = doctorCountByDept([])
    expect(Object.values(counts)).toEqual([0, 0, 0, 0])
  })
})
