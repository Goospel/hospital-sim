import { describe, it, expect } from 'vitest'
import { placeRoom } from '../sim/testHelpers'
import {
  buildBlockReason, buildResultText, BUILD_TOOLS, busyDoctorIds, doctorActivityMark, doctorCountByDept,
  doctorRoomlessMark, fatigueTone, formatManwon, isDragTool, nextPriority, noRestSpotIdle, PRIORITY_LABEL,
  previewLabel, rectTiles, resigningNotices, roomLabel, saturationText, setupWarningText, statusLineText, TOOL_LABEL,
  toolCostText, traitBadges, turnAwayBatchText, turnAwayBreakdown, turnAwayBreakdownText, turnAwayText,
} from './simHud'
import { BUILD_COST, type BuildReason, type PlaceResult } from '../sim/build'
import { createWorld, type RoomType, type SimWorld } from '../sim/world'
import { simDept, type SimDeptKey } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway } from '../sim/emergency'
import { TRAITS } from '../sim/traits'
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

describe('resigningNotices — 결산 화면의 사직 통지(과 · 이름 · 편지)', () => {
  const leaver = (over: Partial<Pawn> = {}) =>
    doctor({ name: '김서준', saturatedDays: RESIGN_SATURATED_DAYS, ...over })

  it('과 이름은 카탈로그에서 온다 — 화면이 과 이름을 따로 적으면 두 벌이 된다', () => {
    expect(resigningNotices([leaver({ dept: 'CARDIOLOGY' })])[0].head)
      .toContain(simDept('CARDIOLOGY').label)
  })

  it('이름과 포화 일수가 실린다 — PR D에서 의사는 과가 아니라 **사람**으로 떠난다', () => {
    const n = resigningNotices([leaver({ dept: 'CARDIOLOGY', saturatedDays: 4 })])[0]
    expect(n.head).toContain('김서준')
    expect(n.body).toContain('4')
  })

  it('여러 명이면 여러 줄이고 순서가 보존된다 — 같은 과가 둘이면 두 줄이다(한 줄로 접지 않는다)', () => {
    const notices = resigningNotices([
      leaver({ id: 'a', dept: 'GENERAL_SURGERY', name: '박지우' }),
      leaver({ id: 'b', dept: 'CARDIOLOGY', name: '이도현' }),
      leaver({ id: 'c', dept: 'CARDIOLOGY', name: '최민서' }),
    ])
    expect(notices.map(n => n.key)).toEqual(['a', 'b', 'c'])
    expect(notices[1].head).toContain('이도현')
    expect(notices[2].head).toContain('최민서')
  })

  it('⚠️ 과 없는 폰은 **건너뛴다 — 던지지 않는다**', () => {
    // `doctorDeptOf`는 과 없는 폰에 던진다(채용을 안 거친 손세계 폰). 그 예외가 오버레이 렌더
    // 중에 나면 결산 화면이 **통째로** 죽어 플레이어는 사직 통지가 아니라 흰 화면을 본다.
    // 한 줄을 잃는 것과 화면을 잃는 것 중에서 고른 결과다.
    const noDept: Pawn = { id: 'ghost', kind: 'DOCTOR', x: 0, y: 0, path: [] }
    expect(() => resigningNotices([noDept])).not.toThrow()
    expect(resigningNotices([noDept, leaver({ dept: 'INTERNAL_MEDICINE' })]).map(n => n.key))
      .toEqual(['d1'])
  })

  it('이름 없는 폰도 문장이 선다 — undefined가 화면에 새지 않는다', () => {
    const notice = resigningNotices([leaver({ name: undefined })])[0]
    expect(`${notice.head} ${notice.body}`).not.toContain('undefined')
  })

  it('빈 명단은 빈 배열 — 아무도 안 떠나는 주엔 줄이 서지 않는다', () => {
    expect(resigningNotices([])).toEqual([])
  })
})

describe('traitBadges — 인사 패널의 특성 표시', () => {
  it('특성 두 개의 라벨과 사연을 카탈로그에서 읽는다 — 화면이 문구를 따로 적지 않는다', () => {
    const badges = traitBadges(doctor({ traits: ['WORKAHOLIC', 'IDEALIST'] }))
    expect(badges.map(b => b.label)).toEqual([TRAITS.WORKAHOLIC.label, TRAITS.IDEALIST.label])
    expect(badges[0].story).toBe(TRAITS.WORKAHOLIC.story)
  })

  it('특성이 없으면 빈 배열 — 손세계 폰·옛 세계에서 패널이 죽지 않는다', () => {
    expect(traitBadges(doctor())).toEqual([])
  })
})

describe('formatManwon — 금액 표기의 단일 함수(§0-8)', () => {
  // 접는 경계(1억)는 `game/labels.formatManwon`이 소유한다 — 여기서 다시 나누면 화면마다
  // 단위가 갈린다. 이 함수가 더하는 것은 **음수 부호**뿐이다(금고는 음수가 될 수 있다).
  it('1억 미만은 만원 + 천 단위 콤마', () => {
    expect(formatManwon(9_999)).toBe('9,999만원')
    expect(formatManwon(0)).toBe('0만원')
  })

  it('1억(=10,000만원)부터 억으로 접는다 — 경계는 `>=`다(10,000은 이미 억이다)', () => {
    // 돌연변이 ③(경계 뒤집기 `>=` → `>`)이 여기서 죽는다.
    expect(formatManwon(10_000)).toBe('1.0억')
  })

  it('억은 소수 한 자리 — 반올림이다(152,340만원 = 15.234억 → 15.2억). 표시용이라 합계와 어긋날 수 있다', () => {
    expect(formatManwon(152_340)).toBe('15.2억')
    expect(formatManwon(15_000)).toBe('1.5억')
  })

  it('음수는 유니코드 마이너스(−)를 유지한다 — 금고가 마이너스인 판이 이 게임의 절반이다', () => {
    expect(formatManwon(-9_999)).toBe('−9,999만원')
    expect(formatManwon(-10_000)).toBe('−1.0억')
    // ASCII 하이픈이 새면 폰트에 따라 부호가 안 보인다(game/labels의 관례 계승).
    expect(formatManwon(-24)).not.toContain('-')
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

/*
  ── 온보딩 판정 3종 ─────────────────────────────────────────────────────────
  이 게임의 첫 5분이 무너진 자리는 규칙이 아니라 **침묵**이었다: 과를 안 고른 채 부지를 끌면
  드래그가 열리지 않는데(ready=false) 화면에 아무 말도 안 떠서, 플레이어에게는 "판이 죽었다"로
  보인다(사용자 신고: 캐릭터가 안 움직이고 방이 안 지어진다 — 실제로는 건설 성공 0회였다).
  아래 셋은 그 침묵을 문장으로 바꾸는 판정이고, 문구와 **우선순위**가 곧 화면 계약이다.
*/
describe('buildBlockReason — 용도 지정의 침묵을 깬다', () => {
  it('용도 도구인데 무슨 방인지 안 골랐으면 말한다 — 클릭이 조용히 먹히면 판이 죽은 것으로 보인다', () => {
    const text = buildBlockReason('DESIGNATE', null, null)
    expect(text).not.toBeNull()
    expect(text).toContain('용도')
  })

  it('진료실인데 과를 안 골랐으면 **왜 안 되는지**를 말한다 — 과 없는 진료실은 코어가 던진다', () => {
    const text = buildBlockReason('DESIGNATE', 'EXAM', null)
    expect(text).not.toBeNull()
    expect(text).toContain('과')
  })

  it('과를 골랐으면 사유가 없다 — 지을 수 있는 상태에 경고를 켜 두지 않는다', () => {
    expect(buildBlockReason('DESIGNATE', 'EXAM', 'CARDIOLOGY')).toBeNull()
  })

  it('진료실이 아닌 용도는 과가 없어도 사유가 없다 — 과 개념 자체가 없는 방이다', () => {
    for (const t of ['WAITING', 'WARD', 'LOUNGE', 'RECEPTION', 'CAFETERIA'] as const) {
      expect(buildBlockReason('DESIGNATE', t, null), `${t}에 사유가 붙었다`).toBeNull()
    }
  })

  it('용도 말고 다른 도구는 방 종류를 안 본다 — 벽을 세우는 데 과가 필요할 리 없다', () => {
    for (const tool of ['WALL', 'DOOR', 'DESK', 'CHAIR', 'BED', 'COUNTER', 'DEMOLISH'] as const) {
      expect(buildBlockReason(tool, null, null), `${tool}에 사유가 붙었다`).toBeNull()
    }
  })

  it('아무 도구도 안 고른 맵 클릭은 **조용히** 지나간다 — 그건 탐색이지 실패가 아니다', () => {
    expect(buildBlockReason(null, null, null)).toBeNull()
    // 남아 있던 선택이 사유를 되살리면 맵을 누를 때마다 토스트가 뜬다.
    expect(buildBlockReason(null, 'EXAM', null)).toBeNull()
  })

  it('톤 가드레일 — 비난 카피 금지(사실과 다음 행동만)', () => {
    const text = buildBlockReason('DESIGNATE', 'EXAM', null)!
    for (const word of ['당신', '놓쳤', '실패', '했어야', '탓']) expect(text).not.toContain(word)
  })
})

/*
  ── 건설 도구 팔레트 ────────────────────────────────────────────────────────
  도구가 여덟이고 조작이 둘(드래그·클릭)이라, "무엇이 얼마이고 어떻게 쓰는가"가 화면 계약이다.
  값·라벨·문구를 JSX가 각자 적으면 팔레트의 가격표와 실제 차감이 갈려도 아무도 모른다.
*/
describe('건설 도구 — 라벨·비용·조작', () => {
  it('여덟 도구가 전부 이름을 갖는다 — 이름 없는 버튼이 팔레트에 서지 않는다', () => {
    expect(BUILD_TOOLS).toHaveLength(8)
    for (const t of BUILD_TOOLS) expect(TOOL_LABEL[t].length).toBeGreaterThan(0)
    expect(new Set(BUILD_TOOLS.map(t => TOOL_LABEL[t])).size).toBe(8) // 두 도구가 같은 이름을 쓰지 않는다
  })

  it('비용 문구는 **코어 표에서** 온다 — 팔레트 가격과 금고 차감이 갈리지 않는다', () => {
    expect(toolCostText('WALL')).toContain(String(BUILD_COST.WALL))
    expect(toolCostText('BED')).toContain(String(BUILD_COST.BED))
    expect(toolCostText('DESIGNATE')).toContain('무료') // 용도 지정은 공사가 아니다
    expect(toolCostText('DEMOLISH')).toContain('환불')
  })

  it('문·용도는 클릭 도구, 나머지는 드래그 도구다 — 조작이 갈리면 미리보기가 안 뜬다', () => {
    expect(isDragTool('DOOR')).toBe(false)
    expect(isDragTool('DESIGNATE')).toBe(false)
    for (const t of ['WALL', 'DESK', 'CHAIR', 'BED', 'COUNTER', 'DEMOLISH'] as const) {
      expect(isDragTool(t), `${t}`).toBe(true)
    }
  })
})

describe('rectTiles — 드래그 사각형이 낳는 타일', () => {
  it('채움은 사각형 전부다 — 가구·철거가 읽는다', () => {
    const tiles = rectTiles({ x: 2, y: 2 }, { x: 4, y: 3 }, 'FILL').map(t => `${t.x},${t.y}`)
    expect(tiles.sort()).toEqual(['2,2', '2,3', '3,2', '3,3', '4,2', '4,3'].sort())
  })

  it('테두리는 둘레만이다 — 벽 도구가 방을 두른다', () => {
    const tiles = rectTiles({ x: 2, y: 2 }, { x: 4, y: 4 }, 'BORDER').map(t => `${t.x},${t.y}`)
    expect(tiles).not.toContain('3,3') // 가운데는 비운다
    expect(tiles).toHaveLength(8)
  })

  it('한 줄 드래그는 테두리여도 **직선 벽**이다 — 폭 1짜리 사각형에 안쪽이 없다', () => {
    expect(rectTiles({ x: 2, y: 2 }, { x: 5, y: 2 }, 'BORDER')).toHaveLength(4)
    expect(rectTiles({ x: 2, y: 2 }, { x: 2, y: 2 }, 'BORDER')).toHaveLength(1)
  })

  it('어느 방향으로 끌든 같은 사각형이다 — 좌상단에서만 끌게 만들지 않는다', () => {
    const a = rectTiles({ x: 5, y: 5 }, { x: 3, y: 3 }, 'FILL').map(t => `${t.x},${t.y}`).sort()
    const b = rectTiles({ x: 3, y: 3 }, { x: 5, y: 5 }, 'FILL').map(t => `${t.x},${t.y}`).sort()
    expect(a).toEqual(b)
  })
})

describe('previewLabel — 나갈 돈과 들어올 돈', () => {
  const res = (over: Partial<PlaceResult & { ok: true }> = {}) =>
    ({ ok: true as const, world: createWorld(1), tiles: [1, 2, 3], skipped: 0, deltaManwon: -90, ...over })

  it('설치는 나갈 금액을, 철거는 **환불**을 말한다 — 부호가 접히면 두 문장이 같아진다', () => {
    expect(previewLabel('WALL', res())).toContain('3')
    expect(previewLabel('DEMOLISH', res({ deltaManwon: 45 }))).toContain('환불')
    expect(previewLabel('WALL', res())).not.toContain('환불')
  })

  it('금액은 화면 층의 단일 포맷을 지난다 — 헤더 금고와 단위가 갈리지 않는다', () => {
    expect(previewLabel('WALL', res({ deltaManwon: -90 }))).toContain(formatManwon(90))
  })
})

describe('buildResultText — 거부 사유와 건너뛴 칸을 말한다', () => {
  const fail = (reason: BuildReason) => ({ ok: false as const, reason, tiles: [], skipped: 0, deltaManwon: 0 })

  it('사유마다 **다른** 말을 한다 — 한 문구로 접히면 무엇을 고쳐야 할지가 사라진다', () => {
    const texts = (['NOTHING', 'NO_MONEY', 'NOT_WALL', 'OUTDOORS'] as const).map(r => buildResultText('WALL', fail(r)))
    expect(new Set(texts).size).toBe(4)
  })

  it('문은 벽 위에만 — 거부 문구가 **다음 행동**을 말한다', () => {
    expect(buildResultText('DOOR', fail('NOT_WALL'))).toContain('벽')
  })

  it('마당 클릭은 둘러싸라고 말한다 — "안 됩니다"만으로는 무엇이 문제인지 모른다', () => {
    const text = buildResultText('DESIGNATE', fail('OUTDOORS'))!
    expect(text).toContain('벽')
    expect(text).toContain('문')
  })

  it('철거가 아무것도 못 부수면 그렇게 말한다 — 설치의 "자리가 없다"와 다른 상황이다', () => {
    expect(buildResultText('DEMOLISH', fail('NOTHING'))).not.toBe(buildResultText('WALL', fail('NOTHING')))
  })

  it('성공했는데 건너뛴 칸이 있으면 **그 사실만** 말한다 — 부분 설치는 화면에 흔적이 없다', () => {
    const partial = { ok: true as const, world: createWorld(1), tiles: [1], skipped: 3, deltaManwon: -30 }
    expect(buildResultText('WALL', partial)).toContain('3')
  })

  it('말끔히 성공했으면 조용하다 — 잘된 일마다 토스트가 뜨면 진짜 사유가 묻힌다', () => {
    const clean = { ok: true as const, world: createWorld(1), tiles: [1], skipped: 0, deltaManwon: -30 }
    expect(buildResultText('WALL', clean)).toBeNull()
  })

  it('톤 가드레일 — 비난 카피 금지', () => {
    for (const r of ['NOTHING', 'NO_MONEY', 'NOT_WALL', 'OUTDOORS'] as const) {
      const text = buildResultText('WALL', fail(r))!
      for (const word of ['당신', '놓쳤', '실패', '했어야', '탓']) expect(text).not.toContain(word)
    }
  })
})

/**
 * 방 명세 한 줄 — 좌표가 없다. 이 판정이 읽는 것은 `type`·`dept`뿐이라 자리는 아무 데나 좋다.
 *
 * ⚠️ 그렇다고 **방 객체를 손으로 세울 수는 없다**: 경고는 이제 `w.rooms`가 아니라 **영역**을
 * 센다(벽·문·용도 앵커에서 파생). 지형 없이 `rooms` 배열만 채우면 영역이 0개라 경고가 늘
 * "대기실이 없습니다"로 나온다 — 그래서 여기서는 실제 건설(placeRoom)을 지나 지형을 만든다.
 * 부수 효과로 이 픽스처는 화면과 코어가 **같은 방**을 보는지까지 함께 잰다.
 */
const room = (type: RoomType, dept?: SimDeptKey) => ({ type, dept })

/** 명세를 왼쪽부터 한 칸씩 떼어 놓아 짓는다(겹치면 placeRoom이 거부한다). */
const worldOf = (pawns: Pawn[], rooms: Array<ReturnType<typeof room>>): SimWorld => {
  let w = createWorld(1)
  rooms.forEach((r, i) => {
    const res = placeRoom(w, { ...r, x: 1 + i * 7, y: 1, w: 6, h: 5 })
    if (!res.ok) throw new Error(`전제 실패 — 건설 거부(${res.reason})`)
    w = res.world
  })
  return { ...w, pawns }
}

describe('setupWarningText — 왜 아무 일도 안 일어나는가', () => {
  it('의사도 방도 없는 첫 판엔 경고가 없다 — 아직 아무것도 안 한 사람에게 경고부터 띄우지 않는다', () => {
    expect(setupWarningText(worldOf([], []))).toBeNull()
  })

  it('의사는 있는데 대기실이 없으면 **환자가 아예 안 온다** — 화면에 이유가 없으면 시뮬 고장으로 읽힌다', () => {
    const text = setupWarningText(worldOf([doctor()], [room('EXAM', 'CARDIOLOGY')]))
    expect(text).toContain('대기실')
  })

  it('대기실은 있는데 그 과 진료실이 없으면 그 의사는 영원히 서 있다 — 인원수까지 말한다', () => {
    const w = worldOf(
      [doctor({ id: 'd1' }), doctor({ id: 'd2', dept: 'INTERNAL_MEDICINE' })],
      [room('WAITING'), room('EXAM', 'CARDIOLOGY')],
    )
    const text = setupWarningText(w)!
    expect(text).toContain('진료실')
    expect(text).toContain('1') // 내과 의사 한 명만 방이 없다
  })

  it('과가 맞아야 방으로 친다 — 남의 과 진료실은 이 의사의 자리가 아니다(삼중 일치)', () => {
    const w = worldOf([doctor({ dept: 'INTERNAL_MEDICINE' })], [room('WAITING'), room('EXAM', 'CARDIOLOGY')])
    expect(setupWarningText(w)).not.toBeNull()
  })

  it('대기실 경고가 진료실 경고보다 **먼저**다 — 대기실이 없으면 진료실을 지어도 환자가 안 온다', () => {
    const w = worldOf([doctor()], []) // 대기실도 없고 진료실도 없다
    expect(setupWarningText(w)).toContain('대기실')
  })

  it('대기실 + 자기 과 진료실이 다 있으면 경고가 없다 — 정상 병원이 경고를 달고 있으면 경고가 죽는다', () => {
    const w = worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')])
    expect(setupWarningText(w)).toBeNull()
  })

  it('진료실은 있는데 책상이 모자라면 그렇게 말한다 — 방 크기가 아니라 **책상 수**가 정원이다', () => {
    // 설계 §4: 슬롯(책상+의자) 하나에 의사 한 명. 방은 자기 과인데 둘째 의사는 앉을 데가 없다.
    const w = worldOf(
      [doctor({ id: 'd1' }), doctor({ id: 'd2' })],
      [room('WAITING'), room('EXAM', 'CARDIOLOGY')],
    )
    const text = setupWarningText(w)!
    expect(text).toContain('책상')
    expect(text).toContain('1') // 한 명이 못 앉는다
  })

  it('의자 없는 책상만 늘렸으면 **의자를 붙이라고** 말한다 — 책상을 더 놓아도 안 풀린다', () => {
    const base = worldOf(
      [doctor({ id: 'd1' }), doctor({ id: 'd2' })],
      [room('WAITING'), room('EXAM', 'CARDIOLOGY')],
    )
    // 진료실(내부 9..12 × 2..4) 안에 의자를 안 붙인 책상 하나.
    const w = { ...base, furniture: [...base.furniture, { kind: 'DESK' as const, x: 9, y: 4 }] }
    expect(setupWarningText(w)).toContain('의자')
  })

  it('문 없는 밀실은 그 사실을 말한다 — 영역은 인식되는데 아무도 못 들어가는 방이다', () => {
    // 벽만 두르고 문을 안 내면 용도까지 지정돼도 통로가 없다. 규칙대로의 결과지만 화면에는
    // 멀쩡한 방으로 보여, 플레이어는 "왜 아무도 안 오지"를 영영 못 푼다(설계 §7).
    const w = worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')])
    // 문 자리를 **벽으로 메운다** — 그냥 지우면 구멍이 되어 방이 마당에 이어져 버린다.
    const sealed = { ...w, walls: new Set([...w.walls, ...w.doors]), doors: new Set<number>() }
    const text = setupWarningText(sealed)!
    expect(text).toContain('문')
  })
})

describe('doctorRoomlessMark — 서 있는 의사 머리 위의 이유', () => {
  it('방도 활동도 없는 의사에 물음표가 붙는다 — 아무 표시 없이 서 있으면 "고장"으로 보인다', () => {
    const mark = doctorRoomlessMark(doctor())
    expect(mark).not.toBeNull()
    expect(mark!.glyph.length).toBeGreaterThan(0)
    expect(mark!.label).toContain('책상')
  })

  it('방을 받았으면 표시가 없다 — 자리를 찾은 사람에게 경고를 달지 않는다', () => {
    expect(doctorRoomlessMark(doctor({ deskAt: { x: 9, y: 9 } }))).toBeNull()
  })

  it('쉬거나 먹으러 갔으면 표시가 없다 — 그건 자리 없음이 아니라 스스로 자리를 뜬 것이다', () => {
    expect(doctorRoomlessMark(doctor({ activity: 'TO_LOUNGE' }))).toBeNull()
  })

  it('환자에는 절대 안 붙는다 — 환자는 방을 받는 개체가 아니라 대기실이 통째로 물들어 버린다', () => {
    const patient: Pawn = { id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [], stage: 'WAITING' }
    expect(doctorRoomlessMark(patient)).toBeNull()
  })
})

describe('statusLineText — footer 상태줄의 우선순위 체인', () => {
  /** 아무 일도 없는 판(방 타입 미선택) — 각 테스트가 필요한 칸만 덮어 쓴다. */
  const line = (over: Partial<Parameters<typeof statusLineText>[0]> = {}) =>
    statusLineText({ toast: null, pause: null, idle: false, warning: null, tool: null, roomType: null, dept: null, ...over })

  it('토스트가 최우선 — 방금 일어난 일이 배경 안내에 묻히면 안 된다', () => {
    expect(line({ toast: '자금이 부족합니다', pause: 'BUILD', idle: true, warning: '대기실이 없습니다' }))
      .toBe('자금이 부족합니다')
  })

  it('정지 사유는 무엇이 세웠는지에 따라 다르다 — 넷이 한 문구로 접히면 왜 멈췄는지가 사라진다', () => {
    const texts = (['BUILD', 'HIRE', 'PRIORITY', 'EVENT'] as const).map(p => line({ pause: p }))
    expect(new Set(texts).size).toBe(4)
    for (const t of texts) expect(t).toContain('일시정지')
  })

  it('스스로 멈춰 둔 상태에는 **개원 방법**을 알려 준다 — 첫날은 일시정지로 시작한다', () => {
    const text = line({ idle: true })
    expect(text).toContain('일시정지')
    expect(text).toContain('1×')
  })

  it('정지 사유가 스스로 멈춤보다 먼저다 — 건설 중에 "1×를 누르세요"가 뜨면 지금 할 일이 뒤집힌다', () => {
    expect(line({ pause: 'BUILD', idle: true })).toContain('건설')
  })

  it('시계가 도는 판에서는 배치 경고가 선다 — 왜 아무 일도 안 일어나는지가 그 자리의 사실이다', () => {
    expect(line({ warning: '대기실이 없습니다 — 환자가 들어오지 못합니다' }))
      .toBe('대기실이 없습니다 — 환자가 들어오지 못합니다')
  })

  it('경고보다 스스로 멈춤이 먼저다 — 멈춰 있으면 무엇을 지어도 아무 일이 안 일어난다', () => {
    expect(line({ idle: true, warning: '대기실이 없습니다' })).toContain('1×')
  })

  it('아무 경고도 없으면 고른 도구 안내가 선다 — 도구마다 조작이 다르다(드래그 · 클릭)', () => {
    expect(line({ tool: 'WALL' })).toContain('드래그')
    expect(line({ tool: 'DOOR' })).toContain('클릭')
    // 용도는 무슨 방인지까지 골라야 뜻이 선다 — 진료실은 과 이름까지 달고 나온다.
    const text = line({ tool: 'DESIGNATE', roomType: 'EXAM', dept: 'CARDIOLOGY' })
    expect(text).toContain(simDept('CARDIOLOGY').label)
  })

  it('용도 도구인데 과가 없으면 그 사유가 안내를 대신한다 — buildBlockReason과 **같은 문장**이다', () => {
    expect(line({ tool: 'DESIGNATE', roomType: 'EXAM' })).toBe(buildBlockReason('DESIGNATE', 'EXAM', null))
  })

  it('아무것도 안 골랐으면 **건설 순서**를 알려 준다 — 벽부터라는 걸 모르면 첫 5분이 통째로 막힌다', () => {
    const text = line()
    for (const word of ['벽', '문', '용도', '가구']) expect(text).toContain(word)
  })
})
