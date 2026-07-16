import type { TransferVerdict } from './types'

// 확정된 판정(코드)을 전원 담당자의 "대사"로 옮기는 결정론적 폴백.
// LLM이 붙기 전에도 게임이 돌아가고, 붙은 뒤에도 무키·실패 시 여기로 강등된다.
// 대사는 판정을 바꾸지 못한다 — 이미 정해진 결과를 연기할 뿐이다.

const ACCEPT_LINES = [
  '…네, 저희가 받겠습니다. 지금 바로 보내세요.',
  '자리 확인됐어요. 출발시키세요, 준비하고 있겠습니다.',
]

const NO_BED_LINES = [
  '지금 중환자실이 다 찼습니다. 받을 자리가 없어요.',
  '병상이 하나도 없습니다. 다른 데를 알아보셔야 해요.',
  '죄송한데 지금 자리가 안 나요. 대기도 어렵습니다.',
]

const NO_SPECIALIST_LINES = [
  '그 환자 볼 당직 전문의가 지금 없습니다. 못 받아요.',
  '담당 과 당직이 비어서요… 저희로는 무리입니다.',
  '전문의가 없어서 받아도 처치를 못 합니다. 죄송합니다.',
]

/** 판정 결과 → 폴백 대사. seed로 같은 사유 안에서 대사를 변주한다(결정론). */
export function fallbackLine(verdict: TransferVerdict, seed = 0): string {
  const pool = verdict.accepted
    ? ACCEPT_LINES
    : verdict.reason === 'NO_BED'
      ? NO_BED_LINES
      : NO_SPECIALIST_LINES
  const index = ((seed % pool.length) + pool.length) % pool.length
  return pool[index]
}
