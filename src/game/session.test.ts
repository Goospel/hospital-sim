import { describe, it, expect } from 'vitest'
import {
  startSession, beginSetup, completeSetup, completeReceiving, beginEmergency, toEpilogue, buildEpilogue,
} from './session'
import { decide } from './receiving'
import { attemptTransfer } from './round'
import type { SetupChoices } from './types'

const collaborator: SetupChoices = { hospitalName: '흑자메디컬', doctors: { AESTHETICS: 3, CHECKUP: 2 } }
const conscientious: SetupChoices = { hospitalName: '양심병원', doctors: { AESTHETICS: 1, CARDIOLOGY: 2 } }

/** RECEIVING을 끝까지 흘린다. accept=false면 전부 거절, true면 전부 수용 시도(하드락은 자동 거절). */
function runReceiving(choices: SetupChoices, accept = false) {
  let s = completeSetup(choices)
  while (!s.receiving!.done) {
    s = { ...s, receiving: decide(s.receiving!, accept) }
  }
  return s
}

describe('세션 페이즈 전이', () => {
  it('startSession → LANDING(첫 화면 = 타이틀 카드)', () => {
    expect(startSession().phase).toBe('LANDING')
  })

  it('beginSetup → SETUP(랜딩에서 시작 → 위저드)', () => {
    expect(beginSetup(startSession()).phase).toBe('SETUP')
  })

  it('LANDING이 아니면 beginSetup 에러(가드)', () => {
    expect(() => beginSetup(completeSetup(collaborator))).toThrow()
  })

  it('completeSetup → RECEIVING(플레이어 병원·콜 큐 준비)', () => {
    const s = completeSetup(collaborator)
    expect(s.phase).toBe('RECEIVING')
    expect(s.hospital!.name).toBe('흑자메디컬')
    expect(s.receiving!.queue.length).toBe(5)
  })

  it('receiving 미완이면 completeReceiving 에러', () => {
    const s = completeSetup(collaborator)
    expect(() => completeReceiving(s)).toThrow()
  })

  it('receiving 완료 → completeReceiving → INTERSTITIAL', () => {
    const s = completeReceiving(runReceiving(collaborator))
    expect(s.phase).toBe('INTERSTITIAL')
  })
})

describe('beginEmergency 분기 — backupCare가 가른다', () => {
  it('공범(순환기 없음) → TRANSFER(기존 STEMI 뺑뺑이)', () => {
    const s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('TRANSFER')
    const em = s.emergency!
    if (em.mode === 'TRANSFER') {
      expect(em.game.status).toBe('IN_PROGRESS')
      expect(em.game.hospitals.length).toBeGreaterThan(1) // 외부 풀
    }
  })

  it('양심(순환기 있음) → IN_HOUSE(직접 PCI)', () => {
    const s = beginEmergency(completeReceiving(runReceiving(conscientious)))
    expect(s.phase).toBe('EMERGENCY')
    expect(s.emergency!.mode).toBe('IN_HOUSE')
  })
})

describe('toEpilogue 가드 + buildEpilogue', () => {
  it('TRANSFER가 진행중이면 toEpilogue 에러', () => {
    const s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    expect(() => toEpilogue(s)).toThrow()
  })

  it('양심 경로: IN_HOUSE → 즉시 EPILOGUE, 생존·적자·소송비용·순환기 채용 N', () => {
    // 양심 빌드는 순환기 미용 함께라 기저는 흑자일 수 있다 — 적자·소송은 1막에서 필수 케이스를
    // '수용'할 때 성립한다(비용은 짓기가 아니라 진료함에서 온다). 그래서 accept=true로 흘린다.
    let s = beginEmergency(completeReceiving(runReceiving(conscientious, true)))
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).toBeNull() // 전원 미니게임 없음
    expect(epi.ledger!.essentialHires).toBe(2)
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(true)
    expect(epi.ledger!.netProfitBillions).toBeLessThan(0) // 적자 + 소송 비용
  })

  it('공범 경로: TRANSFER 끝(권역심혈관센터 h6 수용) → 생존, 장부는 흑자·채용 0·소송비용 없음', () => {
    let s = beginEmergency(completeReceiving(runReceiving(collaborator)))
    // 외부 풀의 출구 h6(권역심혈관센터)에 전원 성공
    const em = s.emergency!
    const game = attemptTransfer(em.mode === 'TRANSFER' ? em.game : (() => { throw new Error() })(), 'h6', 12)
    s = { ...s, emergency: { mode: 'TRANSFER', game } }
    s = toEpilogue(s)
    const epi = buildEpilogue(s)
    expect(epi.survived).toBe(true)
    expect(epi.debrief).not.toBeNull()
    expect(epi.ledger!.essentialHires).toBe(0)
    expect(epi.ledger!.netProfitBillions).toBeGreaterThan(0) // 흑자
    expect(epi.ledger!.segments.some((seg) => seg.label === '소송 비용')).toBe(false)
  })
})

describe('통합 불변식', () => {
  it('공범 병원은 STEMI를 받는 쪽에서도 하드락(1막), 2막에선 전원으로 던져짐', () => {
    const s = completeSetup(collaborator)
    // 1막: 첫 STEMI 콜(c2)까지 진행해 하드락 확인
    let r = s.receiving!
    r = decide(r, false) // c1 워크인
    const afterStemi = decide(r, true) // c2 STEMI accept 시도
    expect(afterStemi.log[1].disposition).toBe('HARDLOCK_REJECT')
    // 2막: 전원 분기
    expect(beginEmergency(completeReceiving(runReceiving(collaborator))).emergency!.mode).toBe('TRANSFER')
  })
})
