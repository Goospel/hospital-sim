// 시뮬 심장 — tick(world, minutes). 1분 단위로 쪼개 처리해 시간 분할 불변식을 지킨다.
// 불변식: tick(w, n) === tick을 1분씩 n번. 배속(1x/4x/16x)이 게임 내용을 바꾸지 않으려면
// 이게 성립해야 한다 — 배속은 "한 프레임에 몇 분을 돌리나"만 바꾸기 때문이다.
import { type SimWorld } from './world'
import { stepMove, PAWN_TILES_PER_MIN, type Pawn } from './pawn'
import { buildBlockedSet, findPath, isBlockedTile } from './path'
import { stepPatients } from './patientFlow'

export function tick(world: SimWorld, minutes: number): SimWorld {
  let w = world
  for (let i = 0; i < minutes; i++) w = tickOneMinute(w)
  return w
}

function tickOneMinute(world: SimWorld): SimWorld {
  // 통행 판정 집합은 틱당 1회(실측 ~5μs) — 폰마다 만들면 폰 수만큼 곱해진다.
  const blocked = buildBlockedSet(world)
  const moved = world.pawns.map(p => stepMove(revalidate(world, blocked, p), 1))
  return stepPatients({ ...world, minute: world.minute + 1, pawns: moved })
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
