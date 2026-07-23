import type { Specialty } from './types'

// 화면 표시용 한국어 라벨(순수 데이터).
export const SPECIALTY_LABEL: Record<Specialty, string> = {
  THORACIC_SURGERY: '흉부외과',
  GENERAL_SURGERY: '외과',
  OBSTETRICS: '산부인과',
  NEUROSURGERY: '신경외과',
  CARDIOLOGY: '순환기내과',
  INTERNAL_MEDICINE: '내과',
}

/**
 * 부호 인지 금액 포맷 — 음수는 유니코드 마이너스(−) + 절대값, 0·양수는 +.
 * 장부·명랑장부·막간 순이익 등 손익을 렌더하는 모든 지점의 단일 소스.
 * (Task 7 롤업: LedgerPanel 순이익 총계가 부호를 하드코딩해 적자에서 "+-24억"으로 렌더되던
 * 결함을 이 헬퍼로 단일화해 재발을 막는다.)
 *
 * 게임 내부 단위는 **만원**이다. 그런데 한 화면 안에서 하루 부문 손익(수백만원)과 개원 예산(5억)이
 * 같이 뜨므로 만원으로만 찍으면 자릿수가 폭발한다 — 1억(=10,000만원)을 넘으면 억으로 접는다.
 * 접는 경계를 여기 한 곳에만 두는 게 요점이다: 호출부가 각자 나누기 시작하면 화면마다 단위가 갈린다.
 */
export function formatSignedManwon(manwon: number): string {
  return `${manwon < 0 ? '−' : '+'}${formatManwon(Math.abs(manwon))}`
}

/** 절대값 금액 표기(만원 단위 입력) — 1억 미만은 "N만원", 이상은 "N.N억". 부호는 붙이지 않는다. */
export function formatManwon(manwon: number): string {
  const abs = Math.abs(manwon)
  if (abs < 10_000) return `${abs.toLocaleString('ko-KR')}만원`
  return `${(abs / 10_000).toFixed(1)}억`
}
