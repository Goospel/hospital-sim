import { describe, it, expect } from 'vitest'
import { fallbackLine, persuasionReply, receivingLine, callerPlea, callerPleaAt, CALLER_PLEA, RECEIVE_HARDLOCK } from './dialogue'
import type { RejectionReason, TransferVerdict } from './types'
import { createCallQueue } from './receiving'

const accepted: TransferVerdict = { accepted: true }
const reject = (reason: RejectionReason): TransferVerdict => ({ accepted: false, reason })

const ALL_REASONS: RejectionReason[] = [
  'NO_BED', 'NO_ER_ONCALL', 'ER_OVERCROWDED', 'NO_BACKUP_CARE', 'NO_NIGHT_BACKUP',
]

describe('fallbackLine — 결정론적 폴백 대사 (LLM 없이)', () => {
  it('수용 판정은 비어 있지 않은 대사를 준다', () => {
    expect(fallbackLine(accepted, 0).length).toBeGreaterThan(0)
  })

  it('네 거절 사유 모두 비어 있지 않은 대사를 준다', () => {
    for (const r of ALL_REASONS) {
      expect(fallbackLine(reject(r), 0).length).toBeGreaterThan(0)
    }
  })

  it('거절 사유가 다르면 서로 다른 대사가 나온다 (네 사유가 전부 구별됨)', () => {
    const lines = new Set(ALL_REASONS.map((r) => fallbackLine(reject(r), 0)))
    expect(lines.size).toBe(ALL_REASONS.length)
  })

  it('같은 입력은 항상 같은 대사(결정론)', () => {
    expect(fallbackLine(reject('NO_BACKUP_CARE'), 3)).toBe(fallbackLine(reject('NO_BACKUP_CARE'), 3))
  })

  it('seed에 따라 같은 사유 안에서도 대사가 변주된다', () => {
    const lines = new Set([0, 1, 2, 3].map((s) => fallbackLine(reject('NO_BACKUP_CARE'), s)))
    expect(lines.size).toBeGreaterThan(1)
  })

  it('[핵심] 배후진료 불가 대사는 "병상이 아니라 시술/처치를 못 한다"는 결을 담는다', () => {
    const line = fallbackLine(reject('NO_BACKUP_CARE'), 0)
    // 병상 탓으로 읽히면 안 된다 — 배후진료(시술/처치/전문의) 부재가 핵심.
    expect(line).not.toContain('병상')
  })
})

describe('persuasionReply — 매달릴수록 냉정해지되 판정은 안 바뀌는 응답', () => {
  it('매달린 횟수가 늘면 응답이 달라진다(에스컬레이션)', () => {
    expect(persuasionReply(reject('NO_BACKUP_CARE'), 0)).not.toBe(
      persuasionReply(reject('NO_BACKUP_CARE'), 2),
    )
  })

  it('사유가 다르면 다른 응답 (네 사유 전부 구별됨)', () => {
    const replies = new Set(ALL_REASONS.map((r) => persuasionReply(reject(r), 1)))
    expect(replies.size).toBe(ALL_REASONS.length)
  })

  it('같은 입력은 항상 같은 응답(결정론)', () => {
    expect(persuasionReply(reject('NO_BED'), 2)).toBe(persuasionReply(reject('NO_BED'), 2))
  })

  it('매달린 횟수가 아무리 커도 비어 있지 않은 응답을 준다(마지막 단계로 clamp)', () => {
    for (const r of ALL_REASONS) {
      expect(persuasionReply(reject(r), 99).length).toBeGreaterThan(0)
    }
  })
})

describe('receivingLine — 1막 받는 쪽 다크코미디 폴백', () => {
  const q = createCallQueue()
  const stemi = q.find((c) => c.kind === 'STEMI')!
  const walkin = q.find((c) => c.kind === 'COSMETIC_WALKIN')!

  it('모든 콜 종류에 호소 대사가 있다', () => {
    expect(CALLER_PLEA.STEMI.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.COSMETIC_WALKIN.length).toBeGreaterThan(0)
    expect(CALLER_PLEA.GENERAL_EMERGENCY.length).toBeGreaterThan(0)
  })

  it('워크인 수용 → 명랑한 확인 대사(🎉 포함)', () => {
    const line = receivingLine(walkin, 'CHOICE', true)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('🎉')
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

  it('자리 없음(NO_BED) 하드락은 "자리는 있는데"라고 말하지 않는다 — 사유별 정합', () => {
    // RECEIVE_HARDLOCK("자리는 있는데, 저희도 순환기 시술팀이 없습니다")을 자리 소진에 쓰면 정면으로 거짓말이 된다.
    const line = receivingLine(stemi, 'HARDLOCK_REJECT', false, 0, 'NO_BED')
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
