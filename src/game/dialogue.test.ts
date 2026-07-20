import { describe, it, expect } from 'vitest'
import { receivingLine, callerPlea, callerPleaAt, CALLER_PLEA, RECEIVE_HARDLOCK } from './dialogue'
import type { CallKind, IncomingCall, RejectionReason } from './types'
import { createCallQueue } from './receiving'

/** 한 주 큐 어디에든 있는 그 종류의 콜 한 통. */
function findCall(kind: CallKind): IncomingCall {
  for (let d = 1; d <= 7; d++) {
    const c = createCallQueue(d).find((x) => x.kind === kind)
    if (c) return c
  }
  throw new Error(`no ${kind} call in week`)
}

const ALL_REASONS: RejectionReason[] = [
  'NO_ER_ONCALL', 'ER_OVERCROWDED', 'NO_BACKUP_CARE', 'NO_NIGHT_BACKUP', 'NO_FREE_SPECIALIST',
]

describe('receivingLine — 1막 받는 쪽 다크코미디 폴백', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!

  it('모든 콜 종류에 호소 대사가 있다', () => {
    expect(CALLER_PLEA.STEMI.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.COSMETIC_WALKIN.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.GENERAL_EMERGENCY.length).toBeGreaterThan(0)
  })

  it('배후과 예약(SPECIALIST_ELECTIVE) 대사는 "심장" 같은 장기 특정 용어로 다른 과를 오표기하지 않는다', () => {
    for (const line of CALLER_PLEA.SPECIALIST_ELECTIVE) expect(line).not.toContain('심장')
  })

  it('워크인 수용 → 명랑한 확인 대사(이모지 없음)', () => {
    const line = receivingLine(walkin, 'CHOICE', true)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('접수')
    expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('STEMI 하드락(내 병원도 순환기 없음) → 벽을 안쪽에서 배우는 대사', () => {
    const disposition = 'HARDLOCK_REJECT' // 내 병원도 순환기 없음 → 하드락
    const line = receivingLine(stemi, disposition, false, 0, 'NO_BACKUP_CARE')
    expect(line).toBe(RECEIVE_HARDLOCK)
  })

  /**
   * 야간 공백 대사는 배후 부재 대사와 **달라야** 한다 — 순환기를 30억 주고 뽑은 플레이어에게
   * "저희도 순환기 시술팀이 없습니다"라고 하면 게임이 거짓말을 하는 것이다.
   */
  it('야간 당직 공백 → 배후 부재와 다른 대사, "없습니다"가 아니라 당직 얘기', () => {
    const line = receivingLine(stemi, 'HARDLOCK_REJECT', false, 0, 'NO_NIGHT_BACKUP')
    expect(line).not.toBe(RECEIVE_HARDLOCK)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('당직')
  })

  it('양심 병원의 STEMI 수용 → 명랑/확인 대사(비어있지 않음)', () => {
    const disposition = 'CHOICE' // 순환기 있는 양심 병원 → 선택
    const line = receivingLine(stemi, disposition, true)
    expect(line.length).toBeGreaterThan(0)
  })

  it('점유 벽(NO_FREE_SPECIALIST) 하드락은 "자리는 있는데"라고 말하지 않는다 — 사유별 정합', () => {
    // RECEIVE_HARDLOCK("자리는 있는데, 저희도 순환기 시술팀이 없습니다")을 점유 벽에 쓰면 정면으로 거짓말이 된다.
    const line = receivingLine(stemi, 'HARDLOCK_REJECT', false, 0, 'NO_FREE_SPECIALIST')
    expect(line).not.toBe(RECEIVE_HARDLOCK)
    expect(line).not.toContain('자리는 있는데')
    expect(line.length).toBeGreaterThan(0)
  })

  it('모든 하드락 사유에 대사가 있다(빈 문자열 없음)', () => {
    for (const reason of ALL_REASONS) {
      for (const call of [stemi, walkin]) {
        expect(receivingLine(call, 'HARDLOCK_REJECT', false, 0, reason).length).toBeGreaterThan(0)
      }
    }
  })

  it('사유를 안 넘겨도 기존 동작 유지(하위호환)', () => {
    expect(receivingLine(stemi, 'HARDLOCK_REJECT', false)).toBe(RECEIVE_HARDLOCK)
  })

  it('결정론 — 같은 인자·seed는 같은 대사', () => {
    expect(receivingLine(walkin, 'CHOICE', true, 1)).toBe(receivingLine(walkin, 'CHOICE', true, 1))
  })
})

/**
 * 응급 다양화 — 배후 부재/야간 공백 대사가 **그 응급의 배후과를 따라간다**(슬라이스 B).
 * "저희도 순환기 시술팀이 없습니다"를 산부 응급에 재사용하면 게임이 거짓말을 한다 — 과가 뒤바뀐다.
 * 사유별 대사가 과를 지목하지 않으면 T-042 계열(층이 다른 사실)을 반복한다.
 */
describe('receivingLine — 다양화된 응급의 배후 부재 대사가 과를 따라간다', () => {
  const CRITICAL = [
    { kind: 'STEMI', word: '순환기' },
    { kind: 'OBSTETRIC_EMERGENCY', word: '산부인과' },
    { kind: 'NEURO_EMERGENCY', word: '신경외과' },
    { kind: 'TRAUMA_EMERGENCY', word: '외과' },
  ] as const

  it('네 종류 모두 호소 대사가 있다', () => {
    for (const { kind } of CRITICAL) expect(CALLER_PLEA[kind as CallKind].length).toBeGreaterThan(0)
  })

  it('NO_BACKUP_CARE 대사가 그 응급의 배후과를 정확히 지목한다', () => {
    for (const { kind, word } of CRITICAL) {
      const line = receivingLine(findCall(kind as CallKind), 'HARDLOCK_REJECT', false, 0, 'NO_BACKUP_CARE')
      expect(line).toContain(word)
    }
  })

  it('산부 배후 부재 대사는 순환기를 말하지 않는다 — 과가 뒤바뀌면 거짓말', () => {
    const ob = receivingLine(findCall('OBSTETRIC_EMERGENCY'), 'HARDLOCK_REJECT', false, 0, 'NO_BACKUP_CARE')
    expect(ob).not.toContain('순환기')
  })

  it('야간 당직 공백 대사도 과를 따라간다 — "당직" + 그 과', () => {
    for (const { kind, word } of CRITICAL) {
      const line = receivingLine(findCall(kind as CallKind), 'HARDLOCK_REJECT', false, 0, 'NO_NIGHT_BACKUP')
      expect(line).toContain('당직')
      expect(line).toContain(word)
    }
  })
})

describe('callerPlea — 발신자 호소 대사 선택(순수·결정론·범위 방어)', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!

  it('비어 있지 않은 대사를 준다', () => {
    expect(callerPlea(stemi, 0).length).toBeGreaterThan(0)
  })

  it('같은 콜·seed는 항상 같은 대사(결정론)', () => {
    expect(callerPlea(stemi, 1)).toBe(callerPlea(stemi, 1))
  })

  it('seed로 같은 콜 종류 안에서 대사가 변주된다', () => {
    const lines = new Set([0, 1].map((s) => callerPlea(stemi, s)))
    expect(lines.size).toBeGreaterThan(1)
  })

  it('음수 seed에도 유효한 대사를 준다(범위 방어)', () => {
    expect(callerPlea(stemi, -1).length).toBeGreaterThan(0)
  })

  it('반환값은 항상 그 콜 종류의 CALLER_PLEA 풀 안의 대사다', () => {
    for (const s of [0, 1, 2, 7, -3]) {
      expect(CALLER_PLEA.STEMI).toContain(callerPlea(stemi, s))
    }
  })
})

describe('callerPleaAt — 큐 위치의 호소 대사(같은 kind 등장 순번으로 변주 → 라벨↔대사 정합)', () => {
  const queue = createCallQueue()
  const cosmeticIdxs = queue.map((c, i) => (c.kind === 'COSMETIC_WALKIN' ? i : -1)).filter((i) => i >= 0)

  it('전제 — 큐에 COSMETIC_WALKIN 콜이 2통 이상 있다(변주가 관찰 가능한 픽스처)', () => {
    expect(cosmeticIdxs.length).toBeGreaterThanOrEqual(2)
  })

  it('[회귀] 같은 kind는 등장 순번대로 풀에서 서로 다른 대사를 집는다 — 1번째→풀[0], 2번째→풀[1]', () => {
    // 버그: 전역 큐 index(0,2,…)를 seed로 넘기면 두 COSMETIC_WALKIN 콜 모두 index%2==0→풀[0](보톡스)이라
    // "검진 패키지 문의" 라벨에 보톡스 대사가 붙었다. 등장 순번(0,1)을 seed로 넘겨야 풀[1](검진)이 나온다.
    expect(callerPleaAt(queue, cosmeticIdxs[0])).toBe(CALLER_PLEA.COSMETIC_WALKIN[0])
    expect(callerPleaAt(queue, cosmeticIdxs[1])).toBe(CALLER_PLEA.COSMETIC_WALKIN[1])
  })

  it('같은 kind 두 콜은 서로 다른 대사를 집는다(변주가 실제로 일어남)', () => {
    expect(callerPleaAt(queue, cosmeticIdxs[0])).not.toBe(callerPleaAt(queue, cosmeticIdxs[1]))
  })

  it('결정론 — 같은 (큐, index)는 항상 같은 대사', () => {
    expect(callerPleaAt(queue, cosmeticIdxs[1])).toBe(callerPleaAt(queue, cosmeticIdxs[1]))
  })

  it('반환값은 항상 그 콜 종류의 CALLER_PLEA 풀 안의 대사다(모든 큐 위치)', () => {
    queue.forEach((c, i) => {
      expect(CALLER_PLEA[c.kind]).toContain(callerPleaAt(queue, i))
    })
  })
})
