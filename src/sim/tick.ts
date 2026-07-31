// 시뮬 심장 — tick(world, minutes). 1분 단위로 쪼개 처리해 시간 분할 불변식을 지킨다.
// 불변식: tick(w, n) === tick을 1분씩 n번. 배속(1x/4x/16x)이 게임 내용을 바꾸지 않으려면
// 이게 성립해야 한다 — 배속은 "한 프레임에 몇 분을 돌리나"만 바꾸기 때문이다.
import { type SimWorld } from './world'
import { computeRegions } from './regions'
import { stepMove, PAWN_TILES_PER_MIN, type Pawn } from './pawn'
import { buildBlockedSet, findPath, isBlockedTile } from './path'
import { stepPatients } from './patientFlow'
import { stepEmergencies } from './emergency'
import { stepDoctors } from './needs'
import { DAY_END_MIN, settleDay } from './day'

export function tick(world: SimWorld, minutes: number): SimWorld {
  let w = world
  for (let i = 0; i < minutes; i++) w = tickOneMinute(w)
  return w
}

function tickOneMinute(world: SimWorld): SimWorld {
  // 마감·결산 중인 세계는 흐르지 않는다 — 같은 세계를 그대로 돌려주므로 tick(w, n)이 통째로 동결된다.
  // 이 가드가 없으면 마감 화면 뒤에서 시계가 계속 돌아 플레이어가 읽는 숫자와 세계가 어긋나고,
  // 600분을 지나며 정산이 매 분 다시 걸린다.
  if (world.phase !== 'RUNNING') return world
  // 이동 단계의 통행 판정 집합은 폰 전체가 하나를 공유한다 — 폰마다 만들면 폰 수만큼 곱해진다.
  // (틱당 총 1회는 아니다: 뒤따르는 stepPatients가 배정·퇴장 경로용으로 자기 것을 더 만든다.)
  const blocked = buildBlockedSet(world)
  // 영역은 **이 분에 한 번**만 계산해 세 단계에 넘긴다(설계 §1-2). 영역이 파생되는 칠(zones)은
  // 틱 안에서 바뀌지 않으므로(건설·지정은 UI 경로다) 한 번 계산한 값이 그 분 내내 옳다. 각 단계가 자기 것을
  // 계산하게 두면 같은 flood fill이 분마다 여러 번 돈다 — `blocked`를 여기서 만드는 것과 같은 이유다.
  const regions = computeRegions(world)
  const moved = world.pawns.map(p => stepMove(revalidate(world, blocked, p), 1))
  // 응급은 환자 흐름 **뒤**다. 두 가지가 이 순서에 걸려 있다:
  //  ① **응급 우선순위** — 외래 진료가 끝나 의사가 풀리는 것은 stepPatients의 마지막
  //     단계(progressStages)인데, 대기 외래를 짝짓는 단계는 이미 그 앞에서 지나갔다. 그래서
  //     방금 풀린 의사를 그 분에 집는 것은 응급뿐이고, 줄 서 있던 외래는 다음 분에야 후보가
  //     된다("현재 외래는 마치고 오되, 대기 환자보다는 먼저").
  //  ② **결정론** — 두 단계 다 (판·주·날·분)의 순수 함수라 순서가 시드를 흔들지 않는다.
  //     응급 도착이 좌석을 쓰지 않고 외래 도착이 침대를 쓰지 않아, 자원 경합도 없다.
  // 욕구(휴식)는 응급 **뒤**다 — **응급이 먼저 의사를 집는다**. 순서를 뒤집으면 임계에 닿은
  // 의사가 그 분에 휴게실로 떠나 버려, 침대에서 기다리던 그 과 응급이 한 분씩 밀린다(그리고
  // 그 밀림은 응급이 몰릴수록 누적된다). 반대 방향의 인터럽트는 여전히 성립한다: 이미 쉬고
  // 있는 의사는 assignEmergencyDoctors가 그 자리에서 낚아챈다(휴식이 무효가 된다).
  const stepped = stepDoctors(
    stepEmergencies(
      stepPatients({ ...world, minute: world.minute + 1, pawns: moved }, regions), regions,
    ),
    regions,
  )
  // 운영 마감에 **도달하는 그 분**에 정산한다 — 그 분의 환자 흐름까지 끝난 뒤가 기준이다.
  return stepped.minute === DAY_END_MIN ? settleDay(stepped) : stepped
}

/** 낡은 경로를 걷기 직전에 검사한다 — 이번 분에 지나갈 타일이 하나라도 막혔으면 dest로 재탐색.
 *  막히지 않았으면 손대지 않는다(findPath는 최장 ~3ms라 매 틱 재탐색하면 프레임을 먹는다).
 *  검사 범위가 "다음 한 칸"이 아니라 **이번 분의 이동 구간 전체**인 이유: stepMove는 분당
 *  PAWN_TILES_PER_MIN 타일을 한 번에 건너뛰므로, 첫 칸만 보면 둘째 칸의 벽을 그대로 밟는다. */
function revalidate(world: SimWorld, blocked: Set<number>, p: Pawn): Pawn {
  if (p.path.length === 0) return p
  const span = p.path.slice(0, PAWN_TILES_PER_MIN)
  if (!span.some(t => isBlockedTile(blocked, t))) return p
  if (!p.dest) return { ...p, path: [] } // 갈 곳을 모르면 멈춘다 — 벽을 뚫느니 선다
  return { ...p, path: findPath(world, { x: p.x, y: p.y }, p.dest) ?? [] }
}
