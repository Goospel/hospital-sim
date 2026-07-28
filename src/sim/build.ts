// 방 단위 건설 — 검증·비용·가구 자동 배치. 전부 순수 함수.
import {
  GRID_W, GRID_H, doorTile, wallTiles, tileIndex,
  type Room, type RoomType, type SimWorld, type Furniture,
} from './world'
import { DEFAULT_EXAM_DEPT } from './dept'

export const MIN_ROOM_W = 4
export const MIN_ROOM_H = 4
export const COST_PER_TILE_MANWON = 50

/** 격자 자동 배치(한 칸 걸러)로 채우는 방과 그 가구 — `autoFurniture`의 else 갈래가 읽는 표다.
 *  식당이 대기실과 **같은 CHAIR 격자**인 것이 계약이다: 좌석 수 = 의자 수라는 성질(furnitureSpots
 *  주석)이 식사 좌석 점유에도 그대로 성립해야 두 의사가 한 의자에 겹치지 않는다. */
export const FURNITURE_OF: Partial<Record<RoomType, 'CHAIR' | 'BED'>> = {
  WAITING: 'CHAIR', WARD: 'BED', CAFETERIA: 'CHAIR',
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
 *  WAITING·CAFETERIA: 내부를 한 칸 걸러 CHAIR / WARD: 한 칸 걸러 BED
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
  // 진료실은 **반드시 과를 갖는다** — 과 없는 EXAM이 남으면 라우팅(계획 Task 2)이 "아무 환자나
  // 받는 방"으로 새고, 그건 이 슬라이스의 논지(과가 없으면 그 환자를 놓친다)를 통째로 무력화한다.
  // 미지정은 내과로 접는다: **1주차 테스트·저장 세계용 마이그레이션 절단**이고, UI(Task 6)는 건설 시
  // 과를 반드시 고르게 하므로 플레이 중에는 도달하지 않는다.
  //
  // 반대로 **EXAM이 아닌 방은 과를 떨군다**(그대로 싣지 않는다). 대기실·병동에는 과 개념이 없어서,
  // 실려 온 dept는 읽는 쪽에서 뜻을 만들어낸다 — 예컨대 라우팅이 방 종류를 안 보고 dept만 보면
  // "순환기 대기실"이 진료실 행세를 한다. 무의미한 값을 보존하느니 없애는 편이 안전하다.
  const { dept: specDept, ...geometry } = spec
  const room: Room = {
    id: `room-${world.nextId}`,
    ...geometry,
    ...(spec.type === 'EXAM' ? { dept: specDept ?? DEFAULT_EXAM_DEPT } : {}),
  }
  // 어댑터 — 선언형 방을 **새 지형 모델(벽·문·용도앵커)로도** 옮겨 담는다.
  // 통행·영역은 이제 이쪽만 읽으므로(path.buildBlockedSet · regions.computeRegions), 두 표현이
  // 갈리면 화면의 방과 규칙의 방이 달라진다. 설계 PR 2에서 이 함수가 통째로 사라지면 남는 건 아래뿐.
  const door = doorTile(room)
  return {
    ok: true,
    world: {
      ...world,
      nextId: world.nextId + 1,
      treasuryManwon: world.treasuryManwon - cost,
      rooms: [...world.rooms, room],
      walls: new Set([...world.walls, ...wallTiles(room).map(t => tileIndex(t.x, t.y))]),
      doors: new Set([...world.doors, tileIndex(door.x, door.y)]),
      // 앵커는 **문 바로 안쪽** 타일 — 방 크기와 무관하게 내부이고(h≥4), autoFurniture가
      // 통로 확보를 위해 항상 비워 두는 자리라 가구에 덮이지 않는다.
      designations: [...world.designations, { at: { x: door.x, y: door.y - 1 }, type: room.type, ...(room.dept ? { dept: room.dept } : {}) }],
      furniture: [...world.furniture, ...autoFurniture(room)],
    },
  }
}
