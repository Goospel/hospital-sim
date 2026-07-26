// 시뮬 심장 — tick(world, minutes). 1분 단위로 쪼개 처리해 시간 분할 불변식을 지킨다.
// 불변식: tick(w, n) === tick을 1분씩 n번. 배속(1x/4x/16x)이 게임 내용을 바꾸지 않으려면
// 이게 성립해야 한다 — 배속은 "한 프레임에 몇 분을 돌리나"만 바꾸기 때문이다.
import { type SimWorld } from './world'
import { stepMove } from './pawn'

export function tick(world: SimWorld, minutes: number): SimWorld {
  let w = world
  for (let i = 0; i < minutes; i++) w = tickOneMinute(w)
  return w
}

function tickOneMinute(world: SimWorld): SimWorld {
  const moved = world.pawns.map(p => stepMove(p, 1))
  return { ...world, minute: world.minute + 1, pawns: moved }
}
