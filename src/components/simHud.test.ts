import { describe, it, expect } from 'vitest'
import {
  busyDoctorIds, doctorActivityMark, doctorCountByDept, fatigueTone, nextPriority, noRestSpotIdle,
  PRIORITY_LABEL, resigningDeptLabels, roomLabel, saturationText, turnAwayBatchText,
  turnAwayBreakdown, turnAwayBreakdownText, turnAwayText,
} from './simHud'
import { simDept } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway } from '../sim/emergency'
import type { Pawn, Priority } from '../sim/pawn'
import { FATIGUE_RED, RESIGN_SATURATED_DAYS } from '../game/doctor'

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

/** 우선순위 패널이 쓰는 의사 한 명 — 필요한 필드만 얹어 쓴다. */
const doctor = (over: Partial<Pawn> = {}): Pawn =>
  ({ id: 'd1', kind: 'DOCTOR', x: 0, y: 0, path: [], dept: 'CARDIOLOGY', ...over })

describe('nextPriority — 우선순위 칸의 클릭 순환(2→3→1→0→2)', () => {
  it('기본값 2에서 첫 클릭은 **올림**(3) — 손잡이를 처음 만지는 사람이 "높음"부터 본다', () => {
    expect(nextPriority(2)).toBe(3)
  })

  it('순환은 2→3→1→0→2 — 내림이 두 칸(1·0) 연속이라 "끄기"까지 세 번이면 닿는다', () => {
    expect(nextPriority(3)).toBe(1)
    expect(nextPriority(1)).toBe(0)
    expect(nextPriority(0)).toBe(2)
  })

  it('네 값을 전부 지나 네 번 만에 제자리 — 도달 못 하는 값이 생기면 그 눈금은 죽은 칸이다', () => {
    const visited: Priority[] = []
    let cur: Priority = 2
    for (let i = 0; i < 4; i++) {
      cur = nextPriority(cur)
      visited.push(cur)
    }
    expect(cur).toBe(2)
    expect([...visited].sort()).toEqual([0, 1, 2, 3])
  })

  it('어떤 값에서도 0~3 안에 머문다 — 이 순환이 `setDoctorPriority`의 throw 경로를 도달 불가로 만든다', () => {
    // 코어는 범위 밖 값에 **던진다**(pawn.setDoctorPriority). 화면이 그 인자를 만드는 유일한
    // 자리가 이 함수라, 여기가 범위를 지키는 한 그 예외는 UI에서 도달할 수 없다.
    for (const start of [0, 1, 2, 3] as Priority[]) {
      const next = nextPriority(start)
      expect(Number.isInteger(next)).toBe(true)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThanOrEqual(3)
    }
  })
})

describe('PRIORITY_LABEL — 눈금의 이름', () => {
  it('0은 「낮음」이 아니라 **「금지」**다 — 이 눈금에서 실제로 게임을 바꾸는 유일한 값이다', () => {
    expect(PRIORITY_LABEL[0]).toBe('금지')
    expect(PRIORITY_LABEL[0]).not.toBe(PRIORITY_LABEL[1])
  })

  it('네 값 모두 이름이 있다 — 빈 칸이 있으면 그 값에서 버튼이 말을 잃는다', () => {
    for (const v of [0, 1, 2, 3] as Priority[]) expect(PRIORITY_LABEL[v].length).toBeGreaterThan(0)
  })
})

describe('doctorActivityMark — 휴식·식사가 아바타에서 읽힌다', () => {
  it('쉬는 중은 zZ — 잠 표시가 곧 "이 사람은 지금 진료를 안 한다"의 설명이다', () => {
    expect(doctorActivityMark(doctor({ activity: 'RESTING' }))?.glyph).toBe('zZ')
  })

  it('식사와 휴식은 **다른 글리프**다 — 같으면 식당을 지었는지가 화면에서 안 갈린다', () => {
    const rest = doctorActivityMark(doctor({ activity: 'RESTING' }))!
    const meal = doctorActivityMark(doctor({ activity: 'EATING' }))!
    expect(meal.glyph).not.toBe(rest.glyph)
  })

  it('걸어가는 중도 같은 갈래의 글리프를 단다 — 라벨만 다르다(글리프는 갈래를, 라벨은 단계를 나른다)', () => {
    // 책상을 비운 의사가 아무 표시 없이 걸어가면 플레이어는 그가 **왜** 자리를 떴는지 모른다.
    const going = doctorActivityMark(doctor({ activity: 'TO_LOUNGE' }))!
    const sitting = doctorActivityMark(doctor({ activity: 'RESTING' }))!
    expect(going.glyph).toBe(sitting.glyph)
    expect(going.label).not.toBe(sitting.label)
  })

  it('네 상태가 **전부** 매핑돼 있다 — 한 줄이 빠지면 그 상태의 의사만 조용히 표시를 잃는다', () => {
    for (const activity of ['TO_LOUNGE', 'RESTING', 'TO_MEAL', 'EATING'] as const) {
      const mark = doctorActivityMark(doctor({ activity }))
      expect(mark, `${activity}에 표시가 없다`).not.toBeNull()
      expect(mark!.glyph.length).toBeGreaterThan(0)
      expect(mark!.label.length).toBeGreaterThan(0)
    }
  })

  it('근무 중(활동 없음)은 표시가 없다 — 평상이 시끄러우면 이상이 안 보인다', () => {
    expect(doctorActivityMark(doctor())).toBeNull()
  })
})

describe('saturationText — 사직 카운트다운', () => {
  it('포화한 날이 없으면 표시가 없다 — 멀쩡한 병원에 경고를 켜 두지 않는다', () => {
    expect(saturationText(doctor())).toBeNull()
    expect(saturationText(doctor({ saturatedDays: 0 }))).toBeNull()
  })

  it('하루라도 포화하면 곧바로 뜬다 — 대응 창이 짧아서(임계 며칠) 첫날이 알림의 전부다', () => {
    const text = saturationText(doctor({ saturatedDays: 1 }))
    expect(text).toContain('1')
  })

  it('분모는 **코어 임계**에서 온다 — 여기 숫자를 박으면 임계를 튜닝해도 화면이 안 따라온다', () => {
    expect(saturationText(doctor({ saturatedDays: 2 }))).toContain(`/${RESIGN_SATURATED_DAYS}`)
  })

  it('임계에 닿아도 계속 뜬다 — 떠나는 주의 화면에서 카운터가 사라지면 설명이 끊긴다', () => {
    expect(saturationText(doctor({ saturatedDays: RESIGN_SATURATED_DAYS }))).not.toBeNull()
  })

  it('톤 가드레일 — 비난 카피 금지(사실만)', () => {
    const text = saturationText(doctor({ saturatedDays: 3 }))!
    for (const word of ['당신', '놓쳤', '실패', '했어야', '탓', '죽었']) expect(text).not.toContain(word)
  })
})

describe('resigningDeptLabels — 결산 화면의 사직 통지 줄', () => {
  it('과 이름은 카탈로그에서 온다 — 화면이 과 이름을 따로 적으면 두 벌이 된다', () => {
    expect(resigningDeptLabels([doctor({ dept: 'CARDIOLOGY' })])).toEqual([simDept('CARDIOLOGY').label])
  })

  it('여러 명이면 여러 줄이고 순서가 보존된다 — 같은 과가 둘이면 두 줄이다(한 줄로 접지 않는다)', () => {
    expect(
      resigningDeptLabels([
        doctor({ id: 'a', dept: 'GENERAL_SURGERY' }),
        doctor({ id: 'b', dept: 'CARDIOLOGY' }),
        doctor({ id: 'c', dept: 'CARDIOLOGY' }),
      ]),
    ).toEqual([
      simDept('GENERAL_SURGERY').label, simDept('CARDIOLOGY').label, simDept('CARDIOLOGY').label,
    ])
  })

  it('⚠️ 과 없는 폰은 **건너뛴다 — 던지지 않는다**', () => {
    // `doctorDeptOf`는 과 없는 폰에 던진다(채용을 안 거친 손세계 폰). 그 예외가 오버레이 렌더
    // 중에 나면 결산 화면이 **통째로** 죽어 플레이어는 사직 통지가 아니라 흰 화면을 본다.
    // 한 줄을 잃는 것과 화면을 잃는 것 중에서 고른 결과다.
    const noDept: Pawn = { id: 'ghost', kind: 'DOCTOR', x: 0, y: 0, path: [] }
    expect(() => resigningDeptLabels([noDept])).not.toThrow()
    expect(resigningDeptLabels([noDept, doctor({ dept: 'INTERNAL_MEDICINE' })]))
      .toEqual([simDept('INTERNAL_MEDICINE').label])
  })

  it('빈 명단은 빈 배열 — 아무도 안 떠나는 주엔 줄이 서지 않는다', () => {
    expect(resigningDeptLabels([])).toEqual([])
  })
})

describe('busyDoctorIds — 지금 누군가를 보고 있는 의사', () => {
  it('환자의 doctorId가 곧 바쁨이다(외래·응급이 쓰는 그 출처)', () => {
    const patient: Pawn = { id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [], doctorId: 'd1' }
    expect(busyDoctorIds([doctor(), patient]).has('d1')).toBe(true)
  })

  it('아무도 안 물려 있으면 빈 집합', () => {
    expect(busyDoctorIds([doctor()]).size).toBe(0)
  })
})

describe('noRestSpotIdle — 태업 힌트(쉬라고 했는데 쉴 자리가 없다)', () => {
  const NOBODY_BUSY = new Set<string>()
  /** 쉬라고 지시받고 임계까지 닿은 의사 — 이 상태에서 자리만 없으면 그는 아무것도 안 한다. */
  const wantsRest = (over: Partial<Pawn> = {}) =>
    doctor({ fatigue: FATIGUE_RED, priorities: { exam: 2, emergency: 2, rest: 3 }, ...over })

  it('쉬라 했고 지쳤는데 활동이 안 붙었으면 태업이다 — 자리를 찾았다면 그 분에 이미 붙었을 것이다', () => {
    expect(noRestSpotIdle(wantsRest(), NOBODY_BUSY)).toBe(true)
  })

  it('쉬러 가는 중이면 아니다 — 자리를 찾았다는 뜻이다', () => {
    expect(noRestSpotIdle(wantsRest({ activity: 'TO_LOUNGE' }), NOBODY_BUSY)).toBe(false)
  })

  it('응급에 물려 있으면 아니다 — 노는 게 아니라 처치 중이다', () => {
    expect(noRestSpotIdle(wantsRest(), new Set(['d1']))).toBe(false)
  })

  it('아무것도 안 건드린 병원엔 안 뜬다 — 기본값(rest = exam = 2)에서는 유휴일 때만 쉰다', () => {
    // 판정을 `>=`로 넓히면 손잡이를 만진 적 없는 병원이 통째로 "태업"으로 물든다(needs.prefersRestOverExam).
    expect(noRestSpotIdle(doctor({ fatigue: FATIGUE_RED }), NOBODY_BUSY)).toBe(false)
  })

  it('임계 아래면 안 뜬다 — 쉬라고 매겨 뒀어도 아직 쉴 때가 아니다', () => {
    expect(noRestSpotIdle(wantsRest({ fatigue: FATIGUE_RED - 1 }), NOBODY_BUSY)).toBe(false)
  })
})
