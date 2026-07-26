// 방 단위 건설 — 검증·비용·가구 자동 배치. 전부 순수 함수.
import { GRID_W, GRID_H, doorTile, type Room, type RoomType, type SimWorld, type Furniture } from './world'

export const MIN_ROOM_W = 4
export const MIN_ROOM_H = 4
export const COST_PER_TILE_MANWON = 50

export const FURNITURE_OF: Partial<Record<RoomType, 'CHAIR' | 'BED'>> = {
  WAITING: 'CHAIR', WARD: 'BED',
}

export function roomCostManwon(w: number, h: number): number {
  return w * h * COST_PER_TILE_MANWON
}

export type PlaceResult =
  | { ok: true; world: SimWorld }
  | { ok: false; reason: 'TOO_SMALL' | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'NO_MONEY' }

function overlaps(a: Room, b: Omit<Room, 'id'>): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** 내부 타일에 가구를 자동 배치한다.
 *  EXAM: 좌상단 내부에 DESK+CHAIR / RECEPTION: COUNTER 1
 *  WAITING: 내부를 한 칸 걸러 CHAIR / WARD: 한 칸 걸러 BED
 *  LOUNGE: CHAIR 2 (휴게) */
function autoFurniture(room: Room): Furniture[] {
  const ix = room.x + 1, iy = room.y + 1 // 내부 좌상단
  const iw = room.w - 2, ih = room.h - 2
  const out: Furniture[] = []
  if (room.type === 'EXAM') {
    out.push({ kind: 'DESK', x: ix, y: iy, roomId: room.id })
    out.push({ kind: 'CHAIR', x: ix + 1, y: iy, roomId: room.id })
  } else if (room.type === 'RECEPTION') {
    out.push({ kind: 'COUNTER', x: ix, y: iy, roomId: room.id })
  } else if (room.type === 'LOUNGE') {
    out.push({ kind: 'CHAIR', x: ix, y: iy, roomId: room.id })
    // 둘째 의자는 한 칸 띄워 놓을 자리가 있을 때만 — 좁은 휴게실이면 하나로 끝낸다.
    // (자리가 없을 때 첫 의자 위에 겹쳐 놓으면 한 타일에 두 좌석이 생겨 뒤 태스크의 좌석 점유가 어긋난다)
    if (ix + 2 <= room.x + room.w - 2) out.push({ kind: 'CHAIR', x: ix + 2, y: iy, roomId: room.id })
  } else {
    // 오른쪽에 설 자리가 남는 열까지만 놓는다(`dx + 1 < iw`) — 벽에 딱 붙은 마지막 열은
    // 앞 타일이 "오른쪽"이 아니라 "아래"로 떨어지는데, 그 타일은 한 줄 아래 의자가 "위"로
    // 쓰는 자리라 둘이 좌석 하나를 나눠 갖는다. 그러면 **화면에 그려진 의자 수와 실제 수용
    // 용량이 어긋난다**(11×7 대기실: 의자 14개인데 앉을 수 있는 자리는 13개).
    // 한 칸 비우면 모든 의자가 자기 오른쪽/위 타일을 독점해 "의자 1개 = 좌석 1개"가 성립한다.
    const kind = FURNITURE_OF[room.type]!
    for (let dx = 0; dx + 1 < iw; dx += 2) for (let dy = 0; dy < ih; dy += 2) {
      out.push({ kind, x: ix + dx, y: iy + dy, roomId: room.id })
    }
  }
  // 문 앞 타일을 가구가 막지 않게 — 문 바로 안쪽 칸은 비운다.
  // 문 위치는 doorTile이 단일 출처다 — 여기서 공식을 다시 유도하면 홀수 폭 방에서
  // 둘이 갈려(floor vs ceil) 유일 통로에 가구가 남고 방이 통째로 고립된다.
  const door = doorTile(room)
  return out.filter(f => !(f.x === door.x && f.y === door.y - 1))
}

export function placeRoom(world: SimWorld, spec: { type: RoomType; dept?: Room['dept']; x: number; y: number; w: number; h: number }): PlaceResult {
  if (spec.w < MIN_ROOM_W || spec.h < MIN_ROOM_H) return { ok: false, reason: 'TOO_SMALL' }
  if (spec.x < 1 || spec.y < 1 || spec.x + spec.w > GRID_W - 1 || spec.y + spec.h > GRID_H - 1)
    return { ok: false, reason: 'OUT_OF_BOUNDS' }
  if (world.rooms.some(r => overlaps(r, spec))) return { ok: false, reason: 'OVERLAP' }
  const cost = roomCostManwon(spec.w, spec.h)
  if (cost > world.treasuryManwon) return { ok: false, reason: 'NO_MONEY' }
  const room: Room = { id: `room-${world.nextId}`, ...spec }
  return {
    ok: true,
    world: {
      ...world,
      nextId: world.nextId + 1,
      treasuryManwon: world.treasuryManwon - cost,
      rooms: [...world.rooms, room],
      furniture: [...world.furniture, ...autoFurniture(room)],
    },
  }
}
