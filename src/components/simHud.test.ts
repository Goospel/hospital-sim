import { describe, it, expect } from 'vitest'
import { hire, placeRoom } from '../sim/testHelpers'
import {
  alertsOf, escTarget, inspectCard, regionOverlayOn, rosterFilters, toggledSpeed,
  buildBlockReason, buildResultText, BUILD_TOOLS, busyDoctorIds, doctorActivityMark, doctorCountByDept,
  doctorRoomlessMark, fatigueTone, formatManwon, isDragTool, nextPriority, noRestSpotIdle, PRIORITY_LABEL,
  previewLabel, rectTiles, resigningNotices, roomLabel, saturationText, setupSteps, setupWarningText, unpaidText,
  startingRosterMet, STARTING_ROSTER_MIN, statusLineText, TOOL_LABEL,
  toolCostText, traitBadges, tileFromPoint, turnAwayBatchText, turnAwayBreakdown, turnAwayBreakdownText, turnAwayText,
  clampCamera, pannedCamera, safeArea, zoomedCamera, ZOOM_MAX, ZOOM_MIN, type Camera,
} from './simHud'
import { BUILD_COST, type BuildReason, type PlaceResult } from '../sim/build'
import { createWorld, GRID_W, GRID_H, type RoomType, type SimWorld } from '../sim/world'
import { simDept, type SimDeptKey } from '../sim/dept'
import { emergencySpec, type EmergencyTurnAway } from '../sim/emergency'
import { HUNGRY_AFTER_MIN } from '../sim/needs'
import { TRAITS } from '../sim/traits'
import { DEFAULT_PRIORITY } from '../sim/pawn'
import { hasCashier } from '../sim/patientFlow'
import { NURSE_WEEKLY_COST_MANWON } from '../sim/week'
import type { Pawn, PatientStage, Priority } from '../sim/pawn'
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

describe('rosterFilters — 인사 명단 필터와 인원수', () => {
  const none = new Set<string>()
  /** 과·상태를 섞은 명단 — 필터마다 걸리는 사람이 다르게 잡히도록 짠 픽스처. */
  const roster = (): Pawn[] => [
    doctor({ id: 'd1', dept: 'CARDIOLOGY' }),
    doctor({ id: 'd2', dept: 'CARDIOLOGY', fatigue: FATIGUE_RED }),
    doctor({ id: 'd3', dept: 'INTERNAL_MEDICINE', priorities: { exam: 2, emergency: 0, rest: 2 } }),
    { id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [] },
  ]

  it('첫 칩은 **전체**이고 의사 전원을 담는다 — 환자는 세지 않는다', () => {
    const [all] = rosterFilters(roster(), none)
    expect(all.key).toBe('ALL')
    expect(all.doctors.map(p => p.id)).toEqual(['d1', 'd2', 'd3'])
  })

  it('**인원수와 목록이 같은 배열이다** — 칩의 숫자와 걸러진 명단이 갈릴 수가 없다', () => {
    // 이 계약이 이 함수가 `count`를 따로 안 들고 `doctors`만 주는 이유다: 두 필드를 두면
    // 한쪽만 고치는 날 "3명"이라 적힌 칩이 2명을 보여준다.
    for (const f of rosterFilters(roster(), none)) expect(f.doctors.length).toBeGreaterThan(0)
  })

  it('과 칩은 **인원이 있는 과만**, 카탈로그 순서로 선다', () => {
    const keys = rosterFilters(roster(), none).filter(f => f.key.startsWith('dept:')).map(f => f.key)
    // HIRABLE_DEPTS 순서 — 뽑지 않은 과(외과·미용)는 칩 자체가 없다.
    expect(keys).toEqual(['dept:INTERNAL_MEDICINE', 'dept:CARDIOLOGY'])
  })

  it('피로 위험은 **막대가 붉어지는 그 경계**를 쓴다 — 화면과 필터가 같은 판정을 본다', () => {
    const at = (fatigue: number) =>
      rosterFilters([doctor({ fatigue })], none).find(f => f.key === 'fatigue')
    expect(at(FATIGUE_RED - 1)).toBeUndefined()
    expect(at(FATIGUE_RED)?.doctors).toHaveLength(1)
  })

  it('떠남 칩은 코어 명단(resigningIds)을 그대로 읽는다 — 여기서 다시 세지 않는다', () => {
    const f = rosterFilters(roster(), new Set(['d2'])).find(f => f.key === 'leaving')
    expect(f?.doctors.map(p => p.id)).toEqual(['d2'])
  })

  it('응급 끔은 priorityOf 0이다 — 필드 없는 폰은 기본 2라 안 걸린다', () => {
    const f = rosterFilters(roster(), none).find(f => f.key === 'no-emergency')
    expect(f?.doctors.map(p => p.id)).toEqual(['d3'])
  })

  it('**인원 0인 칩은 아예 안 뜬다** — 「떠남 0」이 뜨면 아무 일도 없는데 사고처럼 읽힌다', () => {
    // 회차 내역 문구가 0줄을 빼는 것과 같은 규칙(turnAwayBreakdownText).
    const keys = rosterFilters([doctor()], none).map(f => f.key)
    expect(keys).toEqual(['ALL', 'dept:CARDIOLOGY'])
  })

  it('의사가 없으면 전체 칩 하나뿐이고 그 안도 비어 있다 — 패널이 죽지 않는다', () => {
    expect(rosterFilters([], none)).toEqual([{ key: 'ALL', label: '전체', doctors: [] }])
  })

  it('톤 — 응급 끔은 **경고가 아니다**. 플레이어의 선택을 화면이 판정하지 않는다', () => {
    const fs = rosterFilters(roster(), new Set(['d2']))
    expect(fs.find(f => f.key === 'no-emergency')?.alarm).toBeUndefined()
    expect(fs.find(f => f.key === 'fatigue')?.alarm).toBe(true)
    expect(fs.find(f => f.key === 'leaving')?.alarm).toBe(true)
  })
})

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

/** 픽스처 간호사 — 과도 피로도 없다(그게 계약이다 — pawn.PawnKind). */
const nurse = (over: Partial<Pawn> = {}): Pawn => ({ id: 'nur-1', kind: 'NURSE', x: 0, y: 0, path: [], ...over })

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

/*
  ── 개원 준비 체크리스트 ─────────────────────────────────────────────────────
  사용자 결정: *"튜토리얼을 필요로 하는 사용자에게는 건설도 안내해 줘야 한다고 생각해.
  림월드가 한국에서는 그렇게 일반적인 장르는 아니거든."*

  **순서는 이미 `setupAlert` 체인에 있었다**(대기실 → 문 → 진료실 → 책상). 없던 것은 그
  순서를 **한눈에 보여주는 형태**뿐이다. 그래서 체크리스트를 새 판정으로 만들지 않고,
  경고가 그 체크리스트의 **첫 미완 단계**가 되도록 뒤집었다 — 두 곳이 각자 판정하면
  "경고는 진료실을 말하는데 체크리스트는 대기실에 체크가 없는" 화면이 나온다.
*/
describe('setupSteps — 개원 준비 단계', () => {
  const keysOf = (w: SimWorld) => setupSteps(w).map(s => s.key)

  it('순서가 곧 **인과**다 — 대기실이 없으면 진료실을 아무리 지어도 환자가 안 온다', () => {
    expect(keysOf(worldOf([], []))).toEqual(
      ['no-doctor', 'no-waiting', 'sealed-rooms', 'no-exam-room', 'no-desk', 'no-cashier'],
    )
  })

  it('세계가 바뀌면 done이 따라온다 — 빈 판은 전부 미완, 갖춰진 병원은 전부 완료', () => {
    expect(setupSteps(worldOf([], [])).every(s => !s.done)).toBe(true)
    const ready = worldOf(
      [doctor(), nurse()], [room('WAITING'), room('EXAM', 'CARDIOLOGY'), room('RECEPTION')],
    )
    expect(setupSteps(ready).every(s => s.done)).toBe(true)
  })

  it('**경고는 첫 미완 단계다** — 단일 출처라 체크리스트와 경고가 갈릴 자리가 없다', () => {
    for (const w of [
      worldOf([doctor()], []),
      worldOf([doctor()], [room('WAITING')]),
      worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')]),
    ]) {
      const first = setupSteps(w).find(s => !s.done)
      expect(alertsOf(w).find(a => a.kind === 'setup')?.key ?? null).toBe(first?.key ?? null)
    }
  })

  it('각 단계는 **어떻게 하는지**를 든다 — 조작을 모르면 할 일을 알아도 못 한다', () => {
    for (const s of setupSteps(worldOf([], []))) {
      expect(s.hint.length).toBeGreaterThan(0)
      expect(s.label.length).toBeGreaterThan(0)
    }
  })

  /*
    수납 창구는 **체인의 맨 뒤**다(설계 2026-07-29 §4): 진료가 돌기 전에 창구부터 지으라고
    말하면 순서가 곧 인과라는 이 목록의 전제가 뒤집힌다. 뒤에 있어도 경고는 제때 뜬다 —
    앞 단계를 다 마친 병원에서 첫 미완 단계가 이것이 되기 때문이다.
  */
  it('수납 창구가 마지막 단계다 — 진료가 돌기 시작해야 "돈을 못 받는다"가 뜻을 갖는다', () => {
    const steps = setupSteps(worldOf([], []))
    expect(steps[steps.length - 1].key).toBe('no-cashier')
  })

  it('창구 판정은 코어(hasCashier)와 **같은 답**이다 — 화면이 따로 세지 않는다', () => {
    const rooms = [room('WAITING'), room('EXAM', 'CARDIOLOGY')]
    const cashierStep = (w: SimWorld) => setupSteps(w).find(s => s.key === 'no-cashier')!
    // 셋 다 창구가 아니다 — 사람만 · 카운터만 · 둘 다 없음.
    expect(cashierStep(worldOf([doctor(), nurse()], rooms)).done).toBe(false)
    expect(cashierStep(worldOf([doctor()], [...rooms, room('RECEPTION')])).done).toBe(false)
    expect(cashierStep(worldOf([doctor()], rooms)).done).toBe(false)
    // 둘이 만나야 열린다.
    const met = worldOf([doctor(), nurse()], [...rooms, room('RECEPTION')])
    expect(cashierStep(met).done).toBe(true)
    expect(hasCashier(met)).toBe(true)
  })

  it('톤 가드레일 — 체크리스트도 비난하지 않는다', () => {
    for (const s of setupSteps(worldOf([], []))) {
      for (const word of ['당신', '실패', '했어야', '탓']) {
        expect(`${s.label} ${s.hint}`).not.toContain(word)
      }
    }
  })
})

describe('startingRosterMet — 개원 전 최소 인원', () => {
  const docs = (n: number) => Array.from({ length: n }, (_, i) => doctor({ id: `d${i}` }))

  it(`빈 판은 못 넘어간다 — 의사 0명이면 이제 환자가 **한 명도** 안 들어온다(접수처 반려)`, () => {
    expect(startingRosterMet(worldOf([], []).pawns)).toBe(false)
  })

  it(`${STARTING_ROSTER_MIN}명을 채우면 열린다`, () => {
    expect(startingRosterMet(docs(STARTING_ROSTER_MIN - 1))).toBe(false)
    expect(startingRosterMet(docs(STARTING_ROSTER_MIN))).toBe(true)
  })

  it('**하한이지 상한이 아니다** — 더 뽑아도 열린 채로 남는다', () => {
    expect(startingRosterMet(docs(STARTING_ROSTER_MIN + 3))).toBe(true)
  })

  it('환자는 안 센다 — 이 게이트가 세는 것은 의사다', () => {
    const patients: Pawn[] = Array.from({ length: 9 }, (_, i) =>
      ({ id: `p${i}`, kind: 'PATIENT', x: 0, y: 0, path: [], stage: 'WAITING', wantsDept: 'CARDIOLOGY' }))
    expect(startingRosterMet([...docs(1), ...patients])).toBe(false)
  })
})

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

  it('대기실 + 자기 과 진료실 + 수납 창구가 다 있으면 경고가 없다 — 정상 병원이 경고를 달고 있으면 경고가 죽는다', () => {
    // 수납이 생긴 뒤로 **창구까지가 "다 있다"**이다(setupSteps의 마지막 단계) — 창구 없이
    // 조용하면 진료비가 새는 병원을 화면이 정상이라고 말하는 셈이다.
    const w = worldOf([doctor(), nurse()], [room('WAITING'), room('EXAM', 'CARDIOLOGY'), room('RECEPTION')])
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

/*
  ── 경고 스택 ───────────────────────────────────────────────────────────────
  배치 경고(setup)는 상태줄 한 줄에서 **스택**으로 옮겨 왔고, 그 옆에 운영 경고(ops) 셋이
  섰다. 두 계열을 한 함수가 내는 이유는 화면이 **한 자리**에 쌓기 때문이고, 판정이 여기
  있는 이유는 이 파일 머리말 그대로다 — JSX 안에 있으면 순서도 문구도 겨눌 수 없다.
*/
describe('alertsOf — 경고 스택(배치 문제 + 운영 경고)', () => {
  /** 침대까지 갖춘 병원 — ops 경고 하나만 겨누기 위한 바닥 상태(setup은 조용하다). */
  // 접수처(+자동 카운터)와 간호사까지 갖춘다 — 수납이 생긴 뒤로 창구 없는 병원은 **배치가
  // 덜 끝난** 상태라(setupSteps의 마지막 단계) setup 경고가 계속 서서 ops 하나만 겨눌 수 없다.
  const healthy = (pawns: Pawn[]) =>
    worldOf([...pawns, nurse()], [room('WAITING'), room('EXAM', 'CARDIOLOGY'), room('WARD'), room('RECEPTION')])
  const keysOf = (w: SimWorld) => alertsOf(w).map(a => a.key)

  it('setupWarningText가 alertsOf의 **파생**이다 — 같은 세계에서 같은 문구가 나온다(이관 무변)', () => {
    // 이 등식이 깨지면 이관이 아니라 개변이다 — 상태줄과 스택이 서로 다른 배치 문제를 말한다.
    const sealedBase = worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')])
    const worlds: SimWorld[] = [
      worldOf([], []),                                                   // 첫 판 — 침묵
      worldOf([doctor()], [room('EXAM', 'CARDIOLOGY')]),                 // 대기실 없음
      { ...sealedBase, walls: new Set([...sealedBase.walls, ...sealedBase.doors]), doors: new Set<number>() },
      worldOf([doctor(), doctor({ id: 'd2', dept: 'INTERNAL_MEDICINE' })], [room('WAITING'), room('EXAM', 'CARDIOLOGY')]),
      worldOf([doctor({ id: 'd1' }), doctor({ id: 'd2' })], [room('WAITING'), room('EXAM', 'CARDIOLOGY')]),
      worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')]),
    ]
    for (const w of worlds) {
      expect(setupWarningText(w)).toBe(alertsOf(w).find(a => a.kind === 'setup')?.text ?? null)
    }
  })

  it('배치 경고는 **한 번에 하나**다 — 체인의 앞선 문제를 먼저 풀어야 뒤가 뜻을 갖는다', () => {
    // 대기실이 없으면 진료실을 아무리 지어도 환자가 안 오므로, 둘을 같이 띄우면 무엇부터
    // 지어야 하는지가 사라진다(옛 setupWarningText 체인이 조기 반환이던 그 이유).
    const w = worldOf([doctor({ dept: 'INTERNAL_MEDICINE' })], [room('EXAM', 'CARDIOLOGY')])
    expect(alertsOf(w).filter(a => a.kind === 'setup')).toHaveLength(1)
  })

  it('배치 경고는 전부 warn이다 — 아직 고칠 수 있는 상태이지 지금 일어나는 사고가 아니다', () => {
    const w = worldOf([doctor()], [room('EXAM', 'CARDIOLOGY')])
    for (const a of alertsOf(w).filter(x => x.kind === 'setup')) expect(a.severity).toBe('warn')
  })

  it('멀쩡한 병원엔 경고가 하나도 없다 — 늘 켜져 있는 경고는 경고가 아니다', () => {
    expect(alertsOf(healthy([doctor()]))).toEqual([])
  })

  /*
    미수 경고 — **실제로 샌 뒤에만** 뜬다(`unpaidManwon > 0`). 상태만 보면 창구를 짓기도 전에
    경고가 서서, 아직 아무 일도 안 일어난 화면이 사고 난 것처럼 읽힌다(no-dept와 같은 규칙).
  */
  it('unpaid — 창구가 없어도 **한 푼도 안 샜으면** 조용하다', () => {
    const w = worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY'), room('WARD')])
    expect(w.stats.unpaidManwon).toBe(0) // 전제: 아직 아무것도 안 샜다
    expect(keysOf(w)).not.toContain('unpaid')
  })

  it('unpaid — 진료비가 실제로 샌 뒤에 뜨고, 얼마인지를 말한다', () => {
    const base = healthy([doctor()])
    const leaked = { ...base, stats: { ...base.stats, unpaidManwon: 84 } }
    const a = alertsOf(leaked).find(x => x.key === 'unpaid')
    expect(a).toBeDefined()
    // warn이지 danger가 아니다 — 안 지은 것은 사고가 아니라 플레이어의 선택이다(no-dept와 같은 톤).
    expect(a!.severity).toBe('warn')
    expect(a!.kind).toBe('ops')
    expect(a!.text).toContain('84')
  })

  it('unpaid — 카피는 **상태 서술만** 한다(톤 가드레일)', () => {
    const base = healthy([doctor()])
    const a = alertsOf({ ...base, stats: { ...base.stats, unpaidManwon: 84 } })
      .find(x => x.key === 'unpaid')!
    for (const word of ['당신', '놓쳤', '실패', '했어야', '탓']) expect(a.text).not.toContain(word)
  })

  it('no-bed — 침대 자리가 0이고 의사가 있으면 danger다(오는 응급이 전부 되돌아간다)', () => {
    const w = worldOf([doctor()], [room('WAITING'), room('EXAM', 'CARDIOLOGY')])
    const bed = alertsOf(w).find(a => a.key === 'no-bed')
    expect(bed).toBeDefined()
    expect(bed!.severity).toBe('danger')
    expect(bed!.text).toContain('병상')
  })

  it('no-bed — 의사가 0명이면 침묵한다(setup이 침묵하는 것과 같은 이유: 아직 아무것도 안 한 판이다)', () => {
    expect(keysOf(worldOf([], [room('WAITING')]))).not.toContain('no-bed')
  })

  it('no-bed — 병동을 지으면 사라진다. 판정은 코어의 침대 **자리**(wardBeds)다', () => {
    expect(keysOf(healthy([doctor()]))).not.toContain('no-bed')
  })

  it('fatigue-risk — 레드존 한 칸 아래는 조용하다(경계가 밀리면 멀쩡한 병원이 붉어진다)', () => {
    expect(keysOf(healthy([doctor({ fatigue: FATIGUE_RED - 1 })]))).not.toContain('fatigue-risk')
  })

  it('fatigue-risk — 레드존에 닿으면 danger다. 경계는 `>=`이고 값은 코어 상수에서 온다', () => {
    const a = alertsOf(healthy([doctor({ fatigue: FATIGUE_RED })])).find(x => x.key === 'fatigue-risk')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('danger')
  })

  it('fatigue-risk — 인원수를 센다(몇 명이 위험한지가 곧 대응 규모다)', () => {
    const w = healthy([
      doctor({ id: 'd1', fatigue: FATIGUE_RED }),
      doctor({ id: 'd2', fatigue: FATIGUE_RED }),
      doctor({ id: 'd3', fatigue: 0 }),
    ])
    expect(alertsOf(w).find(a => a.key === 'fatigue-risk')!.text).toContain('2')
  })

  it('starving — 식당이 없고 굶은 의사가 있으면 warn이다(스스로 갈 데가 없다)', () => {
    const a = alertsOf(healthy([doctor({ hungerMin: HUNGRY_AFTER_MIN })])).find(x => x.key === 'starving')
    expect(a).toBeDefined()
    expect(a!.severity).toBe('warn')
    expect(a!.text).toContain('식당')
  })

  it('starving — 식당이 있으면 경고가 아니라 **대기**다(밥때가 되면 스스로 간다)', () => {
    const w = worldOf(
      [doctor({ hungerMin: HUNGRY_AFTER_MIN })],
      [room('WAITING'), room('EXAM', 'CARDIOLOGY'), room('WARD'), room('CAFETERIA')],
    )
    expect(keysOf(w)).not.toContain('starving')
  })

  it('starving — 허기 임계 아래면 없다. 판정은 코어(needs)의 술어를 그대로 쓴다', () => {
    expect(keysOf(healthy([doctor({ hungerMin: HUNGRY_AFTER_MIN - 1 })]))).not.toContain('starving')
  })

  it('danger가 warn보다 **앞**에 선다 — 먼저 읽히는 자리가 더 급한 것이어야 한다', () => {
    // 대기실 없음(warn·setup) + 침대 없음·피로 위험(danger·ops)이 한 화면에 겹치는 판.
    const w = worldOf([doctor({ fatigue: FATIGUE_RED })], [room('EXAM', 'CARDIOLOGY')])
    const severities = alertsOf(w).map(a => a.severity)
    expect(severities).toContain('danger')
    expect(severities).toContain('warn')
    expect(severities.lastIndexOf('danger')).toBeLessThan(severities.indexOf('warn'))
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

/*
  ── 키보드 최소셋 ───────────────────────────────────────────────────────────
  스페이스·ESC 둘뿐이고, 둘 다 **가속 수단**이다(마우스만으로 완주할 수 있다는 계약은 그대로).
  판정이 여기 있는 이유는 이 파일 머리말 그대로다 — 리스너 안에 있으면 "무엇을 먼저 닫는가"를
  겨눌 수 있는 테스트가 하나도 없다.
*/
describe('toggledSpeed — 스페이스 한 번', () => {
  it('돌고 있으면 멈춘다 — 배속이 얼마든 0이다', () => {
    expect(toggledSpeed(1, 1)).toBe(0)
    expect(toggledSpeed(3, 1)).toBe(0)
  })

  it('멈춰 있으면 **직전 배속**으로 돌아간다 — 3배속으로 보던 사람이 1배속으로 떨어지지 않는다', () => {
    expect(toggledSpeed(0, 3)).toBe(3)
  })

  it('직전 배속의 초기값은 1이다 — 첫 스페이스가 곧 개원이 된다(판은 일시정지로 시작한다)', () => {
    expect(toggledSpeed(0, 1)).toBe(1)
  })
})

describe('escTarget — ESC가 닫는 한 겹', () => {
  const target = (over: Partial<Parameters<typeof escTarget>[0]> = {}) =>
    escTarget({ modalOpen: false, inspectOpen: false, tool: null, ...over })

  it('모달이 최우선이다 — 화면을 덮고 있는 것을 두고 뒤엣것을 닫으면 조작이 사라진 것처럼 보인다', () => {
    expect(target({ modalOpen: true, inspectOpen: true, tool: 'WALL' })).toBe('modal')
  })

  it('모달이 없으면 인스펙트 카드', () => {
    expect(target({ inspectOpen: true, tool: 'WALL' })).toBe('inspect')
  })

  it('둘 다 없으면 손에 든 도구를 놓는다 — 무장 해제가 ESC의 마지막 겹이다', () => {
    expect(target({ tool: 'WALL' })).toBe('tool')
  })

  it('아무것도 안 열려 있으면 **아무 일도 안 한다** — 결산 오버레이는 ESC로 닫히지 않는다', () => {
    // 닫으면 다음 행동(다음 날 버튼)이 화면에서 사라진다 — 그래서 결산은 이 판정의 입력에 없다.
    expect(target()).toBeNull()
  })
})

describe('alertsOf — 접수처 반려 경고', () => {
  /** 대기실 + 진료실(내과) + 내과 의사 — 배치 경고가 안 뜨는 최소 병원(운영 경고만 남긴다). */
  const clinic = (): SimWorld => {
    let w = createWorld(3)
    for (const spec of [
      { type: 'WAITING' as const, x: 18, y: 24, w: 8, h: 6 },
      { type: 'EXAM' as const, dept: 'INTERNAL_MEDICINE' as const, x: 18, y: 14, w: 8, h: 6 },
      { type: 'WARD' as const, x: 28, y: 14, w: 8, h: 6 },
    ]) {
      const r = placeRoom(w, spec)
      if (!r.ok) throw new Error(`전제 실패 — 건설 거부(${r.reason})`)
      w = r.world
    }
    return hire(w, 'INTERNAL_MEDICINE')
  }
  const turnAway = (w: SimWorld, n: number): SimWorld =>
    ({ ...w, stats: { ...w.stats, leftCount: w.stats.leftCount + n, leftNoDept: w.stats.leftNoDept + n } })
  const alertKeys = (w: SimWorld) => alertsOf(w).map(a => a.key)

  it('아직 아무도 안 돌려보냈으면 안 뜬다 — 개원 직후 4과 경고가 한꺼번에 서면 잡음이다', () => {
    expect(alertKeys(clinic())).not.toContain('no-dept')
  })

  it('돌려보낸 뒤에 뜨고, **어느 과인지** 말한다 — 그 이름이 곧 할 일(채용)이다', () => {
    const a = alertsOf(turnAway(clinic(), 5)).find(x => x.key === 'no-dept')
    expect(a).toBeDefined()
    // ⚠️ **부분문자열로 재지 않는다** — 「내과」는 「순환기내과」 안에 들어 있어, `not.toContain`이
    //    보고 있는 과를 안 적었는데도 걸린다(실제로 걸렸다). 목록 전체를 통째로 대조한다:
    //    보는 과가 빠지고 안 보는 과 셋이 **카탈로그 순서로** 선다는 계약을 한 줄이 다 잠근다.
    const names = ['GENERAL_SURGERY', 'CARDIOLOGY', 'AESTHETICS'].map(d => simDept(d as SimDeptKey).label)
    expect(a!.text).toContain(names.join('·'))
  })

  it('네 과를 다 뽑으면 사라진다 — 과거의 손실이 현재의 경고로 남지 않는다', () => {
    let w = turnAway(clinic(), 5)
    for (const dept of ['GENERAL_SURGERY', 'CARDIOLOGY', 'AESTHETICS'] as const) w = hire(w, dept)
    expect(alertKeys(w)).not.toContain('no-dept')
  })

  it('경고이지 위험이 아니다 — 안 뽑은 것은 플레이어의 선택이라 붉게 칠하지 않는다', () => {
    const a = alertsOf(turnAway(clinic(), 5)).find(x => x.key === 'no-dept')
    expect(a!.severity).toBe('warn')
  })
})

describe('regionOverlayOn — 영역 오버레이를 지금 그리는가', () => {
  const on = (over: Partial<Parameters<typeof regionOverlayOn>[0]> = {}) =>
    regionOverlayOn({ toggled: false, tool: null, ...over })

  it('기본은 꺼짐이다 — 부지 위에 늘 색과 이름표가 깔려 있으면 사람과 가구가 그 밑에 묻힌다', () => {
    expect(on()).toBe(false)
  })

  it('토글을 켜면 켜진다', () => {
    expect(on({ toggled: true })).toBe(true)
  })

  it('**용도 도구를 들면 꺼져 있어도 켜진다** — 이미 지정된 곳이 안 보이면 어디를 지정할지 알 수 없다', () => {
    expect(on({ tool: 'DESIGNATE' })).toBe(true)
  })

  it('다른 도구는 켜지 않는다 — 벽·철거는 영역이 아니라 타일을 겨눈다', () => {
    for (const t of ['WALL', 'DOOR', 'DESK', 'DEMOLISH'] as const) expect(on({ tool: t })).toBe(false)
  })

  it('용도 도구를 놓아도 **토글이 켜져 있으면 남는다** — 도구가 토글을 되돌리지 않는다', () => {
    expect(on({ toggled: true, tool: null })).toBe(true)
  })
})

/*
  ── 인스펙트 카드 ───────────────────────────────────────────────────────────
  폰을 클릭하면 뜨는 카드. 이 카드가 존재하는 이유는 **특성과 사연이 지금까지 사직 편지에서만
  보였다**는 것이다 — 판이 끝나야 사람이 보이면 그 사람을 지킬 방법이 없다. 내용은 전부
  세계에 이미 있는 사실이고(새 집계 필드 금지), 판정은 기존 헬퍼를 그대로 지난다.
*/
describe('unpaidText — 하루 결산의 미수 한 조각', () => {
  it('샌 돈이 있으면 얼마인지 말한다 — 금액 표기는 formatManwon 하나가 진다', () => {
    expect(unpaidText(84)).toContain(formatManwon(84))
  })

  it('0이면 **빈 문자열**이다 — 아무 일도 없던 날에 "못 받은 진료비 0"이 뜨면 사고처럼 읽힌다', () => {
    expect(unpaidText(0)).toBe('')
  })

  it('톤 가드레일 — 상태 서술만 한다', () => {
    for (const word of ['당신', '놓쳤', '실패', '했어야', '탓']) {
      expect(unpaidText(84)).not.toContain(word)
    }
  })
})

describe('inspectCard — 폰 클릭 카드', () => {
  /** 카드가 읽는 세계 — 판정에 필요한 것은 폰 목록뿐이다(바쁨은 환자의 doctorId에서 나온다). */
  const world = (pawns: Pawn[] = []): SimWorld => ({ ...createWorld(1), pawns })
  const patient = (over: Partial<Pawn> = {}): Pawn =>
    ({ id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [], stage: 'WAITING', wantsDept: 'INTERNAL_MEDICINE', ...over })

  it('간호사는 **역할이 곧 신원**이다 — 과가 없고, 대신 하는 일과 주급이 실린다', () => {
    const n = nurse({ name: '김서준' })
    const card = inspectCard(n, world([n]))
    expect(card.title).toContain('간호사')
    expect(card.title).toContain('김서준')
    expect(card.lines).toContain('수납 담당')
    // 주급은 **코어 상수**에서 온다 — 화면이 숫자를 다시 적으면 결산에서 빠지는 액수와 갈린다.
    expect(card.lines.some(l => l.includes(formatManwon(NURSE_WEEKLY_COST_MANWON)))).toBe(true)
  })

  it('간호사 카드엔 피로·우선순위 줄이 없다 — 그 기계 밖의 사람이다(pawn.PawnKind 계약)', () => {
    const n = nurse()
    const lines = inspectCard(n, world([n])).lines.join(' ')
    for (const word of ['피로', '허기', '진료 ', '응급 ']) expect(lines).not.toContain(word)
  })

  it('의사 제목은 **이름 · 과**다 — 이 카드가 붙는 대상이 사람임을 첫 줄이 말한다', () => {
    const d = doctor({ name: '김서준' })
    expect(inspectCard(d, world([d])).title).toBe(`김서준 · ${simDept('CARDIOLOGY').label}`)
  })

  it('특성 두 개가 **사연과 함께** 실린다 — 이 노출이 카드의 존재 이유다', () => {
    const d = doctor({ traits: ['WORKAHOLIC', 'IDEALIST'] })
    const lines = inspectCard(d, world([d])).lines
    for (const k of ['WORKAHOLIC', 'IDEALIST'] as const) {
      expect(
        lines.some(l => l.includes(TRAITS[k].label) && l.includes(TRAITS[k].story)),
        `${k}의 사연이 없다`,
      ).toBe(true)
    }
  })

  it('상태 — 진료 중이 최우선이다. 판정은 busyDoctorIds(환자의 doctorId)가 진다', () => {
    const d = doctor({ activity: 'RESTING' }) // 활동이 붙어 있어도 진료가 이긴다
    const p: Pawn = { id: 'p1', kind: 'PATIENT', x: 0, y: 0, path: [], doctorId: 'd1' }
    expect(inspectCard(d, world([d, p])).lines).toContain('진료 중')
  })

  it('상태 — 휴식·식사는 아바타 글리프와 **같은 라벨**을 쓴다(같은 상태를 두 벌로 적지 않는다)', () => {
    const d = doctor({ activity: 'TO_MEAL' })
    expect(inspectCard(d, world([d])).lines).toContain(doctorActivityMark(d)!.label)
  })

  it('상태 — 앉을 책상이 없으면 그 사실이 상태 줄이다(머리 위 물음표와 같은 문장)', () => {
    const d = doctor()
    expect(inspectCard(d, world([d])).lines).toContain(doctorRoomlessMark(d)!.label)
  })

  it('상태 — 아무것도 아니면 대기 중이다', () => {
    const d = doctor({ deskAt: { x: 9, y: 9 } })
    expect(inspectCard(d, world([d])).lines).toContain('대기 중')
  })

  it('피로·허기가 수치로 실린다 — 막대와 달리 카드는 정확한 값을 말한다', () => {
    const d = doctor({ deskAt: { x: 9, y: 9 }, fatigue: 42, hungerMin: 130 })
    const line = inspectCard(d, world([d])).lines.find(l => l.includes('피로'))!
    expect(line).toContain('42')
    expect(line).toContain('130')
  })

  it('우선순위 세 축이 실리고, 필드가 없으면 **전부 보통**으로 읽힌다 — 코어 폴백(priorityOf) 그대로', () => {
    // 화면이 `?? 2`를 따로 적으면 손세계 폰이 카드에서만 「금지」로 보인다.
    const d = doctor({ deskAt: { x: 9, y: 9 } })
    expect(inspectCard(d, world([d])).lines)
      .toContain(`진료 ${DEFAULT_PRIORITY} · 응급 ${DEFAULT_PRIORITY} · 휴식 ${DEFAULT_PRIORITY}`)
  })

  it('매긴 값이 있으면 그 값이 실린다 — 0(금지)도 그대로 보인다', () => {
    const d = doctor({ deskAt: { x: 9, y: 9 }, priorities: { exam: 1, emergency: 3, rest: 0 } })
    expect(inspectCard(d, world([d])).lines).toContain('진료 1 · 응급 3 · 휴식 0')
  })

  it('이름·과가 없는 폰에도 카드가 선다 — 던지면 클릭 한 번에 화면이 통째로 죽는다', () => {
    const ghost: Pawn = { id: 'ghost', kind: 'DOCTOR', x: 0, y: 0, path: [] }
    expect(() => inspectCard(ghost, world([ghost]))).not.toThrow()
    expect(inspectCard(ghost, world([ghost])).title).not.toContain('undefined')
  })

  it('환자는 **익명**이다 — 제목에 이름이 붙지 않는다(환자에 개인 서사를 붙이지 않는다)', () => {
    expect(inspectCard(patient(), world()).title).toBe('환자')
  })

  it('원하는 과가 실린다 — 그 과가 없으면 이 환자는 기다리다 떠난다', () => {
    const lines = inspectCard(patient(), world()).lines
    expect(lines.some(l => l.includes(simDept('INTERNAL_MEDICINE').label))).toBe(true)
  })

  it('stage마다 **다른** 한국어 문장이다 — 접히면 흐름의 어디쯤인지가 사라진다', () => {
    const texts = (['ENTERING', 'WAITING', 'TO_EXAM', 'IN_EXAM', 'LEAVING'] as const)
      .map(stage => inspectCard(patient({ stage }), world()).lines.join('\n'))
    expect(new Set(texts).size).toBe(5)
  })

  it('모든 stage에 문구가 있다 — 한 칸이 비면 그 환자만 조용히 말을 잃는다', () => {
    const stages: PatientStage[] = [
      'ENTERING', 'WAITING', 'TO_EXAM', 'IN_EXAM', 'PAYING', 'LEAVING', 'GONE', 'LEFT_WAITING',
      'TO_BED', 'IN_BED', 'IN_TREATMENT',
    ]
    for (const stage of stages) {
      const lines = inspectCard(patient({ stage }), world()).lines
      expect(lines.join(''), `${stage}에 문구가 없다`).not.toContain('undefined')
      expect(lines.length, `${stage}에 줄이 없다`).toBeGreaterThan(1)
    }
  })

  it('응급은 **종류까지** 말한다 — 붉은 링만으로는 무슨 응급인지 모른다', () => {
    const lines = inspectCard(patient({ emergency: 'STEMI', stage: 'IN_BED' }), world()).lines
    expect(lines.some(l => l.includes('응급') && l.includes(emergencySpec('STEMI').label))).toBe(true)
  })

  it('외래 환자엔 응급 줄이 없다 — 늘 켜진 표시는 표시가 아니다', () => {
    expect(inspectCard(patient(), world()).lines.some(l => l.includes('응급'))).toBe(false)
  })
})

describe('tileFromPoint — 포인터 위치 → 타일 좌표', () => {
  /** 화면에 그려진 맵의 사각형. 배율이 곧 rect의 크기다 — 함수는 TILE 상수를 모른다. */
  const rectAt = (scale: number) => ({
    left: 100,
    top: 50,
    width: GRID_W * 16 * scale,
    height: GRID_H * 16 * scale,
  })

  it('1배 — 타일 16px 격자로 나눈다', () => {
    const r = rectAt(1)
    expect(tileFromPoint({ x: 100, y: 50 }, r)).toEqual({ x: 0, y: 0 })
    expect(tileFromPoint({ x: 100 + 17, y: 50 + 33 }, r)).toEqual({ x: 1, y: 2 })
  })

  /* 확대의 핵심 계약 — **rect에서 타일 크기를 파생**하므로 배율이 자동 반영된다.
     TILE 상수로 나누면 2배 확대 화면에서 좌표가 정확히 두 배로 어긋난다(7×6을 그렸는데
     7×4가 지어지던 그 계열의 결함 — SimGame 헤더 주석). */
  it('2배 확대 — 같은 픽셀이 절반 타일을 가리킨다', () => {
    const r = rectAt(2)
    expect(tileFromPoint({ x: 100 + 17, y: 50 + 33 }, r)).toEqual({ x: 0, y: 1 })
    expect(tileFromPoint({ x: 100 + 64, y: 50 + 96 }, r)).toEqual({ x: 2, y: 3 })
  })

  it('축소 — 0.5배에서도 같은 식이 성립한다', () => {
    expect(tileFromPoint({ x: 100 + 17, y: 50 + 33 }, rectAt(0.5))).toEqual({ x: 2, y: 4 })
  })

  it('격자 밖으로 나가도 부지 안으로 물린다 — 드래그가 맵 밖에서 끝나도 사각형이 성립해야 한다', () => {
    const r = rectAt(2)
    expect(tileFromPoint({ x: -500, y: -500 }, r)).toEqual({ x: 0, y: 0 })
    expect(tileFromPoint({ x: 99_999, y: 99_999 }, r)).toEqual({ x: GRID_W - 1, y: GRID_H - 1 })
  })

  it('오른쪽·아래 끝 픽셀이 마지막 타일이다 — 경계에서 한 칸 넘어가지 않는다', () => {
    const r = rectAt(2)
    expect(tileFromPoint({ x: 100 + r.width - 1, y: 50 + r.height - 1 }, r)).toEqual({
      x: GRID_W - 1,
      y: GRID_H - 1,
    })
  })
})

describe('부지 카메라 — clampCamera · zoomedCamera · pannedCamera', () => {
  /** 부지 원본 크기(타일 16px) — TileMap의 TILE을 임포트하면 React가 딸려 온다(위 rectAt와 같은 관례). */
  const BASE = { w: GRID_W * 16, h: GRID_H * 16 }
  /** 뷰포트. 부지보다 가로가 살짝 넓어 fit이 가로에 안 걸리게 잡았다(세로가 짧은 쪽). */
  const VIEW = { w: 800, h: 600 }
  /** **인셋 0**의 안전 영역 = 뷰포트 전체. 아래 8개는 옛 계약을 그대로 겨누는 회귀 가드다 —
   *  바가 없으면(HUD를 걷어내면) 카메라는 예전과 한 픽셀도 다르게 굴면 안 된다. */
  const SAFE = { x: 0, y: 0, w: VIEW.w, h: VIEW.h }
  const FIT = Math.min(VIEW.w / BASE.w, VIEW.h / BASE.h)
  /** 그 배율에서 화면에 그려지는 맵 크기 — 클램프의 경계는 전부 이 값에서 나온다. */
  const content = (zoom: number) => ({ w: BASE.w * FIT * zoom, h: BASE.h * FIT * zoom })
  /** 앵커 아래에 있는 **맵 좌표** — 줌의 유일한 계약이 이 값의 불변성이다. */
  const under = (cam: Camera, anchor: { x: number; y: number }) => ({
    x: (anchor.x - cam.x) / (FIT * cam.zoom),
    y: (anchor.y - cam.y) / (FIT * cam.zoom),
  })

  it('콘텐츠가 뷰포트보다 작으면 **중앙 정렬**이다 — 팬 입력은 무시된다', () => {
    // zoom 1 = 부지 전체가 들어오는 배율이라 짧은 쪽엔 늘 여백이 남는다. 그 축을 밀 수 있으면
    // 부지가 뷰포트 밖으로 흘러가고 화면 절반이 빈 배경이 된다.
    const c = clampCamera({ zoom: 1, x: -400, y: 250 }, SAFE, content(1))
    expect(c.x).toBeCloseTo((VIEW.w - content(1).w) / 2)
    expect(c.y).toBeCloseTo((VIEW.h - content(1).h) / 2)
  })

  it('줌 상태에서는 [view − content, 0]으로 잘린다 — 맵 가장자리가 뷰포트 안으로 못 들어온다', () => {
    const big = content(2)
    // 오른쪽·아래로 아무리 끌어도 맵 좌상단은 뷰포트 좌상단을 못 넘어선다(넘으면 왼쪽에 빈틈).
    expect(clampCamera({ zoom: 2, x: 999, y: 999 }, SAFE, big)).toMatchObject({ x: 0, y: 0 })
    // 반대쪽도 같다 — 맵 우하단이 뷰포트 우하단 안쪽으로 들어오면 그쪽에 빈틈이 생긴다.
    const c = clampCamera({ zoom: 2, x: -99_999, y: -99_999 }, SAFE, big)
    expect(c.x).toBeCloseTo(VIEW.w - big.w)
    expect(c.y).toBeCloseTo(VIEW.h - big.h)
  })

  it('zoom은 [ZOOM_MIN, ZOOM_MAX] 밖으로 못 나간다', () => {
    const at = (cam: Camera, factor: number) =>
      zoomedCamera(cam, { x: 400, y: 300 }, factor, SAFE, BASE, FIT).zoom
    expect(at({ zoom: 1, x: 0, y: 0 }, 0.1)).toBe(ZOOM_MIN)
    expect(at({ zoom: 2, x: -200, y: -200 }, 100)).toBe(ZOOM_MAX)
  })

  it('**fit보다 더 축소된다** — 시작 화면(zoom 1)에서 [−]가 죽은 버튼이면 안 된다', () => {
    // 신고된 결함: zoom 1이 곧 하한이라 처음 화면에서 축소가 아무 일도 하지 않았다.
    // 부지 전체가 이미 보이는 배율이라도 더 당겨 둘레 여백까지 보는 것이 축소의 모습이다.
    const out = zoomedCamera({ zoom: 1, x: 0, y: 0 }, { x: 400, y: 300 }, 1 / 1.4, SAFE, BASE, FIT)
    expect(out.zoom).toBeCloseTo(1 / 1.4)
    // 그 배율에선 콘텐츠가 안전 영역보다 작으므로 중앙 정렬이다(clampAxis의 계약).
    expect(out.x).toBeCloseTo((VIEW.w - content(out.zoom).w) / 2)
    expect(out.y).toBeCloseTo((VIEW.h - content(out.zoom).h) / 2)
  })

  it('ZOOM_MIN에서 더 축소하면 카메라가 통째로 그대로다 — 바닥에서 화면이 안 흔들린다', () => {
    const floor: Camera = zoomedCamera({ zoom: 1, x: 0, y: 0 }, { x: 400, y: 300 }, 0.01, SAFE, BASE, FIT)
    expect(floor.zoom).toBe(ZOOM_MIN)
    expect(zoomedCamera(floor, { x: 10, y: 590 }, 0.5, SAFE, BASE, FIT)).toEqual(floor)
  })

  it('**앵커 불변식** — 줌 전후로 커서 아래 맵 좌표가 그대로다(클램프에 안 걸리는 중간 줌)', () => {
    const anchor = { x: 400, y: 300 }
    const before: Camera = { zoom: 1.5, x: -200, y: -100 }
    const after = zoomedCamera(before, anchor, 1.2, SAFE, BASE, FIT)
    expect(after.zoom).toBeCloseTo(1.8)
    expect(under(after, anchor).x).toBeCloseTo(under(before, anchor).x)
    expect(under(after, anchor).y).toBeCloseTo(under(before, anchor).y)
    // 클램프에 걸리면 위 단언이 우연히 통과할 수 없으므로, 경계 안임을 함께 못박는다.
    expect(after.x).toBeGreaterThan(VIEW.w - content(1.8).w)
    expect(after.x).toBeLessThan(0)
  })

  it('앵커 산술의 기준은 저장값이 아니라 **클램프된 유효 팬**이다 — zoom 1에서 첫 줌인이 튀지 않는다', () => {
    const anchor = { x: 100, y: 500 }
    // 같은 화면(zoom 1은 언제나 중앙 정렬)인데 저장된 팬만 다른 두 카메라.
    const a = zoomedCamera({ zoom: 1, x: 0, y: 0 }, anchor, 1.5, SAFE, BASE, FIT)
    const b = zoomedCamera({ zoom: 1, x: -777, y: 555 }, anchor, 1.5, SAFE, BASE, FIT)
    expect(b).toEqual(a)
    // 그리고 그 화면의 앵커 아래 지점이 유지된다.
    const shown = clampCamera({ zoom: 1, x: 0, y: 0 }, SAFE, content(1))
    expect(under(a, anchor).x).toBeCloseTo(under(shown, anchor).x)
    expect(under(a, anchor).y).toBeCloseTo(under(shown, anchor).y)
  })

  it('ZOOM_MAX에서 더 줌인하면 카메라가 통째로 그대로다 — 앵커만 옮겨도 화면이 안 흔들린다', () => {
    const at: Camera = zoomedCamera({ zoom: ZOOM_MAX, x: -300, y: -200 }, { x: 400, y: 300 }, 1, SAFE, BASE, FIT)
    expect(zoomedCamera(at, { x: 10, y: 590 }, 1.4, SAFE, BASE, FIT)).toEqual(at)
  })

  it('pannedCamera — 델타를 그대로 더하고 가장자리에서 잘린다', () => {
    const cam: Camera = { zoom: 2, x: -300, y: -200 }
    expect(pannedCamera(cam, 40, -25, SAFE, BASE, FIT)).toMatchObject({ zoom: 2, x: -260, y: -225 })
    // 위·왼쪽으로 끝까지 밀면 맵 우하단이 뷰포트 우하단에 붙는다.
    const edge = pannedCamera(cam, -9999, -9999, SAFE, BASE, FIT)
    expect(edge.x).toBeCloseTo(VIEW.w - content(2).w)
    expect(edge.y).toBeCloseTo(VIEW.h - content(2).h)
  })

  it('줌아웃으로 zoom 1로 돌아오면 중앙 정렬로 수렴한다 — [⌂]가 없어도 화면이 복구된다', () => {
    const zoomed: Camera = { zoom: 2.5, x: -900, y: -600 }
    const home = zoomedCamera(zoomed, { x: 0, y: 0 }, 1 / 2.5, SAFE, BASE, FIT)
    expect(home.zoom).toBeCloseTo(1)
    expect(home.x).toBeCloseTo((VIEW.w - content(1).w) / 2)
    expect(home.y).toBeCloseTo((VIEW.h - content(1).h) / 2)
  })

  /*
    ── 안전 영역(HUD 바가 덮지 않는 구간) ───────────────────────────────────
    header·footer는 맵 **위에 뜬 오버레이**라 뷰포트를 줄이지 않는다. 그래서 클램프가 뷰포트
    전체를 기준으로 잡으면 zoom 1에서 아래쪽 타일 줄이 **영구히** footer 밑에 깔린다 — 그 배율에선
    콘텐츠가 기준과 같은 크기라 팬 슬랙이 0이어서 꺼낼 수도 없다([T-102](../../claude-docs/troubleshooting/T-102.md)).
    아래 셋은 기준이 뷰포트가 아니라 **안전 영역**임을 겨눈다(세로만 — 두 바 모두 가로 전폭이다).
  */
  /** header 56 · footer 90이 덮은 화면. 좌우 인셋은 없다. */
  const INSET = { top: 56, bottom: 90 }
  const SAFE_I = { x: 0, y: INSET.top, w: VIEW.w, h: VIEW.h - INSET.top - INSET.bottom }

  it('인셋이 있으면 중앙은 **안전 영역의 중앙**이다 — 뷰포트 중앙이 아니다', () => {
    const small = { w: 400, h: 300 }
    const c = clampCamera({ zoom: 1, x: -400, y: 250 }, SAFE_I, small)
    expect(c.y).toBeCloseTo(SAFE_I.y + (SAFE_I.h - small.h) / 2) // 133
    // 뷰포트 중앙(150)이면 맵이 아래로 17px 내려가 footer 밑에 파묻힌다.
    expect(c.y).not.toBeCloseTo((VIEW.h - small.h) / 2)
    expect(c.x).toBeCloseTo((VIEW.w - small.w) / 2) // 가로는 인셋 0이라 그대로
  })

  it('인셋이 있으면 클램프 경계는 [top + safeH − content, top]이다 — 맵은 바 밑으로만 나간다', () => {
    const big = { w: 1600, h: 900 }
    // 아래·오른쪽으로 아무리 끌어도 맵 위 가장자리는 **안전 영역 위 끝**을 못 넘어선다.
    // (뷰포트 기준이면 0까지 갔고, 그 56px이 header 밑 빈틈으로 남는다.)
    expect(clampCamera({ zoom: 1, x: 9999, y: 9999 }, SAFE_I, big)).toMatchObject({ x: 0, y: INSET.top })
    const c = clampCamera({ zoom: 1, x: -99_999, y: -99_999 }, SAFE_I, big)
    expect(c.y).toBeCloseTo(SAFE_I.y + SAFE_I.h - big.h)
    expect(c.x).toBeCloseTo(VIEW.w - big.w)
  })

  /*
    ── 좌측 인셋 ────────────────────────────────────────────────────────────
    도구 팔레트가 하단 전폭 바에서 **좌측 세로 패널**로 옮겨 가면서(SimGame) 인셋의 축이 갈렸다:
    덮이는 곳이 아래가 아니라 왼쪽이다. clampAxis는 원래부터 `start`를 받아 두 축을 대칭으로
    다뤘으므로 산술은 그대로고, 아래 둘은 그 대칭이 **실제로 쓰이는 축**에서도 성립함을 못박는다
    (세로만 겨눈 위 셋의 가로판 — 회귀하면 부지 왼쪽 줄이 팔레트 밑에 영구히 깔린다 · T-102).
  */
  const SAFE_L = { x: 160, y: INSET.top, w: VIEW.w - 160, h: VIEW.h - INSET.top }

  it('좌측 인셋 — 중앙은 **패널 오른쪽 구간**의 중앙이다(뷰포트 중앙이면 팔레트 밑에 깔린다)', () => {
    const small = { w: 400, h: 300 }
    const c = clampCamera({ zoom: 1, x: -400, y: 250 }, SAFE_L, small)
    expect(c.x).toBeCloseTo(SAFE_L.x + (SAFE_L.w - small.w) / 2) // 280
    expect(c.x).not.toBeCloseTo((VIEW.w - small.w) / 2) // 뷰포트 중앙(200)이면 왼쪽 80px이 패널 밑
  })

  it('좌측 인셋 — 가로 클램프 경계는 [left + safeW − content, left]다', () => {
    const big = { w: 1600, h: 900 }
    expect(clampCamera({ zoom: 1, x: 9999, y: 9999 }, SAFE_L, big).x).toBeCloseTo(SAFE_L.x)
    expect(clampCamera({ zoom: 1, x: -99_999, y: -99_999 }, SAFE_L, big).x).toBeCloseTo(SAFE_L.x + SAFE_L.w - big.w)
  })

  /*
    안전 영역을 **재는** 쪽(TileMap.useCamera)이 쓰는 산술. 한 줄짜리 뺄셈이지만 순수 함수인
    이유는 이 파일 머리말 그대로다 — 훅 안에 있으면 "좌측 인셋이 폭에서 빠지는가"를 겨눌 수
    있는 테스트가 하나도 없고, 그게 빠지지 않으면 맵이 팔레트 밑으로 밀린다(T-102의 가로판).
  */
  it('safeArea — 인셋이 0이면 안전 영역은 뷰포트 전체다(바 없는 옛 계약)', () => {
    expect(safeArea(VIEW, { top: 0, left: 0 })).toEqual({ x: 0, y: 0, w: VIEW.w, h: VIEW.h })
  })

  it('safeArea — 상단 바는 y를, 좌측 패널은 x를 밀고 **그만큼 높이·폭을 깎는다**', () => {
    expect(safeArea(VIEW, { top: 56, left: 160 })).toEqual({
      x: 160,
      y: 56,
      w: VIEW.w - 160,
      h: VIEW.h - 56,
    })
  })

  it('safeArea — 바가 화면을 다 먹으면 폭·높이가 0 이하로 나온다(접는 판정은 호출부 몫)', () => {
    const s = safeArea({ w: 100, h: 40 }, { top: 60, left: 160 })
    expect(s.w).toBeLessThanOrEqual(0)
    expect(s.h).toBeLessThanOrEqual(0)
  })

  it('zoom 1 + 인셋 — 부지가 안전 영역에 꼭 맞아 세로 팬 슬랙이 0이다(y가 top에 고정)', () => {
    // 호출부(TileMap)가 재는 fit — 세로는 **안전 영역**으로 나눈다. 이 화면에선 세로가 짧은 쪽이라
    // 콘텐츠 높이가 safeH와 정확히 같아진다: 부지 전체가 어느 바에도 안 가리고 다 보인다.
    const fitI = Math.min(VIEW.w / BASE.w, SAFE_I.h / BASE.h)
    expect(BASE.h * fitI).toBeCloseTo(SAFE_I.h)
    const cam: Camera = { zoom: 1, x: 0, y: INSET.top }
    for (const dy of [300, -300]) {
      expect(pannedCamera(cam, 0, dy, SAFE_I, BASE, fitI).y).toBeCloseTo(INSET.top)
    }
  })
})
