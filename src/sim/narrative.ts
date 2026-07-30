// 서사 문장 카탈로그 — **LLM 없이도 이 게임은 말을 한다.**
//
// 스토리텔러(LLM)가 붙기 전에 폴백 문장이 먼저 완성되는 것이 이 슬라이스의 순서다(계획 §0-4).
// 무키·타임아웃·치역 밖 응답이면 여기 있는 문장이 그대로 화면에 서고, 판정·수치는 완전히 같다 —
// LLM은 **문장을 더 좋게 쓸 뿐 게임을 바꾸지 않는다**. 그 사실을 코드 배치로 보증하려면 폴백이
// "빈 문자열"이 아니라 **완성된 원고**라야 한다.
//
// **텍스트는 전부 여기 있다.** `events.ts`의 카탈로그에는 라벨만 남긴다 — 연출문 뭉치를 leaf에
// 두면 문구를 다듬을 때마다 도착·응급 판정이 딸린 파일이 흔들리고, 그 diff는 리뷰에서
// "문구 수정"으로 읽혀 코어 변경이 묻힌다.
//
// ⚠️ **T-094 — 보간값 바로 뒤에 조사를 두지 않는다.** 한국어 조사는 앞 글자의 받침에 따라
// 갈리는데(은/는·이/가·로/으로) 보간값은 카탈로그·플레이 결과에서 오므로 언제든 바뀐다. 값 뒤에는
// 항상 **고정 단어**를 한 칸 끼우고 조사는 그 뒤에 붙인다("○○ 의사가"·"○○ 일이"). 이 규칙은
// narrative.test.ts가 기계로 잰다(값을 바꿔 끼워도 문장이 바이트 동일한가).
import type { SimEventKind } from './events'
import { TRAITS, type TraitKey } from './traits'
import type { EndingKind } from './world'

/**
 * 이벤트 연출문 폴백 — 종류당 셋. **속보·공문의 질감**이고 각색이다(임상·법률 주장 아님).
 *
 * 종류당 하나면 12주 동안 같은 이벤트가 같은 말을 해서 두 번째부터는 아무도 안 읽는다.
 * 셋이면 한 판(주당 기대 1.75일)에 같은 문장을 다시 볼 때쯤엔 이미 몇 주가 지나 있다.
 *
 * 보간이 **하나도 없다** — 그래서 이 카탈로그는 조사 함정에 구조적으로 안 걸린다(위 T-094).
 * 수치를 넣고 싶어지는 자리지만(「응급 3배」), 그건 화면이 이미 숫자로 보여 준다.
 */
export const EVENT_NARRATIONS: Record<SimEventKind, readonly string[]> = {
  MASS_CASUALTY: [
    '시 외곽 고속도로에서 다중 추돌이 있었습니다. 구급차가 이쪽으로 옵니다.',
    '공사 현장이 무너졌습니다. 소방 당국이 다수 사상자 발생을 통보했습니다.',
    '지하철 역사에서 압사 사고가 났습니다. 오늘 응급은 평소 같지 않습니다.',
  ],
  EPIDEMIC: [
    '보건소가 독감 유행 주의보를 냈습니다. 내과 대기가 길어집니다.',
    '지역에 호흡기 감염이 번지고 있습니다. 외래가 한 과로 몰립니다.',
    '학교 두 곳이 단축 수업에 들어갔습니다. 오늘 오는 사람은 대부분 내과입니다.',
  ],
  NEARBY_CLOSURE: [
    '길 건너 병원이 어제 문을 닫았습니다. 그 환자들이 이쪽으로 옵니다.',
    '인근 의원 두 곳이 폐업했습니다. 오늘 외래가 늘어납니다.',
    '옆 동네 종합병원이 응급실 운영을 중단했습니다. 대기실이 평소보다 붐빕니다.',
  ],
  LAWSUIT: [
    '지난번 돌려보낸 응급 건으로 소장이 접수됐습니다.',
    '법무법인에서 손해배상 청구서가 왔습니다. 돌아간 환자의 가족입니다.',
    '전원 조치했던 환자 측이 소송을 제기했습니다. 합의금이 청구됐습니다.',
  ],
  // ⚠️ **톤 가드레일**(§톤 · chillNotice·resignationLetter와 같은 규칙): 온 사람을 평가하지
  // 않는다. "꾀병"·"몰상식" 같은 말이 한 줄이라도 붙으면 이 이벤트는 구조의 문제(경증이 갈 곳이
  // 여기뿐이다)를 환자 개인의 잘못으로 미끄러뜨린다 — 사실만 적고 판단은 화면 밖에 둔다.
  MILD_SURGE: [
    '가벼운 증상의 외래가 아침부터 밀려듭니다. 병상 절반이 관찰 대기로 찼습니다.',
    '연휴가 끝났습니다. 미뤄 둔 진료가 하루에 몰리고, 관찰 자리부터 차기 시작합니다.',
    '문 여는 의원이 오늘 이 근방에 몇 곳 없습니다. 대기실도 병동도 종일 붐빕니다.',
  ],
}

/**
 * 오늘의 연출문 — `(주, 일)` 결정론 선택이고 **시드를 소비하지 않는다**.
 *
 * 시드를 안 쓰는 것이 계약이다: 문장 고르기가 시드를 밀면 "연출문이 몇 번 떴는가"가 도착·응급
 * 스트림을 옮겨, 텍스트를 한 줄 더 쓰는 것만으로 그 판의 환자 수가 바뀐다(계획 §0-3의 이름·특성과
 * 같은 근거).
 *
 * `week + day`인 이유: 둘 다 인덱스에 참여해야 한다. 주만 쓰면 한 주 내내 같은 말이고, 일만 쓰면
 * (돌연변이 ①) 12주 동안 화요일마다 똑같은 속보가 뜬다 — 둘 다 에러 없이 화면에서만 티가 난다.
 */
export function eventNarration(kind: SimEventKind, week: number, day: number): string {
  const lines = EVENT_NARRATIONS[kind]
  return lines[(week + day) % lines.length]
}

/**
 * 방어진료 위축 고지 — 의료소송이 **금고 밖에** 남긴 자국을 한 줄로 말한다.
 *
 * 연출문(`EVENT_NARRATIONS.LAWSUIT`)과 **별개의 줄**인 것이 계약이다: 저쪽은 LLM이 갈아 끼울 수
 * 있는 서사이고 이쪽은 **결정론 효과의 고지**라, AI가 붙든 안 붙든 반드시 화면에 서야 한다
 * (우선순위가 조용히 내려가면 플레이어는 그 과 응급이 왜 되돌아가는지 영영 모른다).
 *
 * 톤 가드레일(§톤 · resignationLetter와 같은 규칙): **사실만** 쓴다. "겁먹었다"·"회피" 같은
 * 평가어가 붙는 순간 구조가 사람을 물러서게 한 일이 그 사람의 성격 문제로 미끄러진다.
 * 보간값 뒤는 고정 단어다(T-094): `{이름} 의사가`.
 */
export function chillNotice(name: string): string {
  return `${name} 의사가 당분간 응급 호출을 줄이겠다고 했습니다.`
}

/** 사직 편지의 재료 — **폰이 아니라 값**을 받는다. 이 파일이 pawn·dept를 몰라야 문장을 고치는
 *  일이 시뮬 위상을 건드리지 않는다(과 이름 파생은 화면 층 simHud.resigningNotices 소관). */
export interface ResignationFields {
  name: string
  /** 과 이름 — 카탈로그(`dept.simDept`)에서 온 라벨이다. 여기서 과 이름을 다시 적지 않는다. */
  deptLabel: string
  /** 포화로 마감한 날 수 — 임계는 코어가 정한다(`RESIGN_SATURATED_DAYS`). */
  saturatedDays: number
  /** 없을 수 있다(손세계 폰·옛 세계) — 그러면 한 줄이 짧아질 뿐 편지는 선다. */
  traits?: readonly [TraitKey, TraitKey]
}

/** 사직 통지 한 건 — `head`는 **무슨 일이 일어났는가**, `body`는 **그 사람이 누구였는가**다.
 *  한 문단으로 합치지 않는 이유는 화면이 둘을 다른 무게로 놓기 때문이다(통지는 붉은 잉크,
 *  편지는 작은 글씨). 문장 자체는 여기서 끝나므로 화면은 조립만 한다. */
export interface ResignationLetter {
  head: string
  body: string
}

/**
 * 사직 편지 — 이 게임에서 **장부가 아닌 대가**가 청구되는 자리의 문장.
 *
 * 톤 가드레일(§톤 · turnAwayText와 같은 규칙): 사실만 쓴다. "갈아 넣었습니다"·"관리 실패" 같은
 * 말이 붙는 순간 구조의 결과가 플레이어의 실수로 미끄러진다. 특성 사연을 붙이는 이유도 같다 —
 * 떠나는 것이 「내과 1명」이 아니라 **쉬는 법을 배운 적 없는 사람 하나**임을 사실로만 말한다.
 */
export function resignationLetter(f: ResignationFields): ResignationLetter {
  // 보간값 뒤는 전부 고정 단어다: `{과} {이름} 의사가` · `{일수} 일이`(T-094).
  const head = `${f.deptLabel} ${f.name} 의사가 병원을 떠납니다`
  const traitLine = f.traits
    ? ` ${TRAITS[f.traits[0]].label} · ${TRAITS[f.traits[1]].label} — ${TRAITS[f.traits[0]].story}`
    : ''
  return { head, body: `포화로 마감한 날이 ${f.saturatedDays}일이 되었습니다.${traitLine}` }
}

/** 에필로그가 읽는 판의 지표 — 셋 다 **끝난 세계에서 파생**된다(따로 저장하지 않는다). */
export interface EpilogueStats {
  week: number
  /** 이 주에 대기하다 떠난 사람 수(Σ `days[].leftCount` = `weekSummary.leftCount`).
   *  ⚠️ **판 전체 누계가 아니다** — 세계가 주마다 `days`를 비워 판 누적 축이 없다
   *  (`turnedAwayTotal`처럼 코어에 카운터를 새로 다는 것은 이 슬라이스 밖이다). */
  leftCount: number
  /** 마지막 주말에 떠나는 사람들의 이름 — 빈 배열이면 그 줄 자체가 없다. */
  resignedNames: readonly string[]
  /** **이미 포맷된** 금액 문자열 — 접는 정책(억/만원)은 화면 층의 단일 함수가 소유한다
   *  (`components/simHud.formatManwon`). 여기서 다시 나누면 단위가 두 벌이 되고, 이 파일이
   *  화면 층을 임포트하면 위상이 뒤집힌다. */
  treasuryText: string
}

/**
 * 판이 **왜** 끝났는가 — 엔딩 3종의 결말문.
 *
 * `phase: 'CLOSED'` 하나로는 세 결말이 한 화면으로 뭉개진다(world.EndingKind 주석). 특히
 * `NO_PEOPLE`이 이 게임 메시지의 담지자다: 돈이 아니라 **사람이 바닥나서** 끝난다.
 *
 * `Record<EndingKind, …>`라 엔딩이 늘면 여기서 컴파일이 막힌다 — 기본 문구로 접으면 새 엔딩이
 * 조용히 남의 결말문을 입는다(돌연변이 ②가 겨누는 자리다).
 */
export function epilogueText(ending: EndingKind, s: EpilogueStats): string {
  const HEADLINE: Record<EndingKind, string> = {
    INSOLVENCY: `${s.week}주차, 금고가 두 주 연속 바닥을 쳤습니다. 병원은 문을 닫습니다.`,
    NO_PEOPLE: `${s.week}주차, 마지막 의사가 가운을 벗었습니다. 전국에 더 부를 사람이 없습니다.`,
    CAMPAIGN_END: `${s.week}주차, 병원은 아직 열려 있습니다. 기록은 여기서 멈춥니다.`,
  }
  // 보간값 뒤는 전부 고정 단어이거나 문장부호다(T-094): `{주}주차,` · `{수}명` · `{금액} 입니다`.
  const parts = [
    HEADLINE[ending],
    `이 주에 기다리다 돌아간 사람 ${s.leftCount}명.`,
    s.resignedNames.length > 0 ? `떠난 사람: ${s.resignedNames.join(' · ')}.` : '',
    `마지막 금고는 ${s.treasuryText} 입니다.`,
  ]
  return parts.filter(p => p.length > 0).join(' ')
}
