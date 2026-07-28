// 테스트 전용 헬퍼 — **프로덕션 코드에서 임포트하지 않는다**(`src/app`·`src/components`와
// `src/sim`의 구현 파일 어디에서도 이 파일을 부르지 않는다). 여기 있는 것은 게임 규칙이 아니라
// *테스트가 전제를 세우는 방식*이고, 화면이 그 방식을 물려받으면 실패 경로가 통째로 사라진다:
// 아래 `hire`는 채용 거부를 **던진다**. 화면이 이걸 쓰면 풀이 빈 과를 누르는 순간 앱이 죽는다
// (화면의 계약은 정반대다 — 거부를 토스트로 말하고 세계는 그대로 둔다: /sim page.tsx).
//
// 왜 모았나: 같은 언랩이 8개 테스트 파일에 **바이트 동일**로 복제돼 있었다. 복제 자체는 짧아
// 무해해 보이지만, `HireResult`의 모양이 바뀌는 날(거부 사유가 늘거나 ok의 페이로드가 갈리는 날)
// 고칠 자리가 여덟 곳이고 **한 곳만 잊어도 그 파일만 조용히 옛 계약으로 돈다**.
//
// ⚠️ 상대 경로 임포트 — vitest에 `@/` 별칭이 없다(simHud.ts 머리말과 같은 제약).
import { buildWalls, designateRegion, placeDoor, placeFurniture, type PlaceResult } from './build'
import { DEFAULT_EXAM_DEPT, type SimDeptKey } from './dept'
import { hireDoctor } from './pawn'
import type { Furniture, RoomType, SimWorld } from './world'

/**
 * 채용 성공을 **전제**로 세계만 꺼낸다 — 풀 고갈(NO_POOL)은 이 헬퍼를 쓰는 파일의 관심사가
 * 아니다(그 계약은 resignation.test.ts가 따로 잰다).
 *
 * 거부를 던지는 것이 핵심이다: 실패를 입력 세계로 접으면(`r.ok ? r.world : w`) 픽스처가
 * 의사 없이 세워지고, 그 뒤의 단언들은 **아무것도 관측하지 않은 채 통과**한다. 전국 풀은
 * 과마다 2~8명뿐이라(dept.ts nationalPool) 픽스처가 사람을 여럿 뽑기 시작하면 실제로 닿는
 * 경계다 — 조용히 통과하느니 터지는 편이 낫다.
 */
export function hire(w: SimWorld, dept: SimDeptKey): SimWorld {
  const r = hireDoctor(w, dept)
  if (!r.ok) throw new Error(`전제 실패 — 채용 거부(${r.reason})`)
  return r.world
}

/*
  ── 옛 사각 방 건설(placeRoom) — **테스트 픽스처 전용** ────────────────────────────
  프로덕션에서는 사라진 개념이다(설계 PR 2: 벽·문·가구·용도가 각각 별개 도구다). 그런데도
  여기 남기는 이유는 하나다: 수십 개 테스트 파일이 "대기실 하나 + 진료실 하나"를 **한 줄로**
  세워 놓고 그 위에서 규칙을 잰다 — 그 전제를 도구 네 번 호출로 풀어 쓰면 테스트가 재려는
  것(진료·이탈·피로)이 건설 절차에 파묻힌다.

  ⚠️ 이 함수는 **새 프리미티브만 조합한다**. 세계를 손으로 조립하면(walls Set을 직접 만드는 식)
  픽스처가 도구가 못 만드는 세계를 세울 수 있고, 그러면 테스트는 green인데 플레이는 깨진다.
  가구 격자는 옛 `autoFurniture`와 **좌표까지 동일**해야 한다(build.test.ts가 실측으로 잠근다):
  한 칸이라도 밀리면 좌석 수·문 앞 통로·스팟 선택이 통째로 달라진다.
*/

export interface RoomSpec { type: RoomType; dept?: SimDeptKey; x: number; y: number; w: number; h: number }
type Rect = { x: number; y: number; w: number; h: number }

/** 방의 문 자리 — 아래 벽 중앙(홀수 폭은 floor). 옛 `world.doorTile`의 자리다. */
export function doorTile(r: Rect): { x: number; y: number } {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + r.h - 1 }
}

/** 방 사각형이 낳는 벽 타일 — 테두리에서 문 하나를 뺀다. 옛 `world.wallTiles`의 자리다. */
export function wallTiles(r: Rect): Array<{ x: number; y: number }> {
  const door = doorTile(r)
  return borderTiles(r).filter(t => !(t.x === door.x && t.y === door.y))
}

/** 테두리 타일 전부(문 자리 포함) — 벽 도구에 그대로 넘기는 입력이다. */
function borderTiles(r: Rect): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y; y < r.y + r.h; y++) {
    if (x === r.x || x === r.x + r.w - 1 || y === r.y || y === r.y + r.h - 1) out.push({ x, y })
  }
  return out
}

/** 격자 자동 배치(한 칸 걸러)로 채우는 방과 그 가구 — 옛 `build.FURNITURE_OF` 그대로.
 *  식당이 대기실과 **같은 CHAIR 격자**인 것이 계약이다(좌석 수 = 의자 수). */
export const FURNITURE_OF: Partial<Record<RoomType, 'CHAIR' | 'BED'>> = {
  WAITING: 'CHAIR', WARD: 'BED', CAFETERIA: 'CHAIR',
}

/** 옛 `build.autoFurniture` — 바이트 그대로 옮겨 왔다(좌표가 계약이라 다시 유도하지 않는다). */
function autoFurniture(room: RoomSpec): Furniture[] {
  const ix = room.x + 1, iy = room.y + 1 // 내부 좌상단
  const iw = room.w - 2, ih = room.h - 2
  const out: Furniture[] = []
  if (room.type === 'EXAM') {
    out.push({ kind: 'DESK', x: ix, y: iy })
    out.push({ kind: 'CHAIR', x: ix + 1, y: iy })
  } else if (room.type === 'RECEPTION') {
    out.push({ kind: 'COUNTER', x: ix, y: iy })
  } else if (room.type === 'LOUNGE') {
    out.push({ kind: 'CHAIR', x: ix, y: iy })
    if (ix + 2 <= room.x + room.w - 2) out.push({ kind: 'CHAIR', x: ix + 2, y: iy })
  } else {
    // 오른쪽에 설 자리가 남는 열까지만(`dx + 1 < iw`) — 벽에 붙은 마지막 열의 의자는 앞 타일을
    // 아랫줄 의자와 나눠 가져 "의자 1개 = 좌석 1개"가 깨진다.
    const kind = FURNITURE_OF[room.type]!
    for (let dx = 0; dx + 1 < iw; dx += 2) for (let dy = 0; dy < ih; dy += 2) {
      out.push({ kind, x: ix + dx, y: iy + dy })
    }
  }
  // 문 바로 안쪽 칸은 비운다 — 유일 통로를 가구가 막으면 방이 통째로 고립된다.
  const door = doorTile(room)
  return out.filter(f => !(f.x === door.x && f.y === door.y - 1))
}

/**
 * 사각 방 하나 = 벽 테두리 + 문 1 + 용도 앵커 + 자동 가구. 도구 네 개를 순서대로 부른다.
 *
 * 옛 검증(최소 크기·겹침·부지 경계)은 **없다** — 그 규칙들은 프로덕션에서 사라졌고(자유 건설),
 * 픽스처는 유효한 좌표를 준다. 남은 실패는 도구가 내는 것뿐이다(자금 부족 등).
 *
 * EXAM에 과를 안 주면 내과로 접는 것도 옛 계약 그대로다(마이그레이션 절단 — 화면은 항상 지정한다).
 */
export function placeRoom(world: SimWorld, spec: RoomSpec): PlaceResult {
  const dept = spec.type === 'EXAM' ? (spec.dept ?? DEFAULT_EXAM_DEPT) : undefined
  const door = doorTile(spec)

  const walls = buildWalls(world, borderTiles(spec))
  if (!walls.ok) return walls
  const opened = placeDoor(walls.world, door)
  if (!opened.ok) return opened
  const named = designateRegion(opened.world, { x: door.x, y: door.y - 1 }, spec.type, dept)
  if (!named.ok) return named

  let w = named.world
  // 같은 종류가 이어지는 구간마다 한 번씩 — 가구 배열 순서가 옛 구현과 같아야 한다(EXAM: 책상→의자).
  for (const run of runsByKind(autoFurniture(spec))) {
    const r = placeFurniture(w, run.kind, run.tiles)
    if (!r.ok && r.reason !== 'NOTHING') return r
    if (r.ok) w = r.world
  }
  return { ok: true, world: w, tiles: [], skipped: 0, deltaManwon: w.treasuryManwon - world.treasuryManwon }
}

function runsByKind(list: readonly Furniture[]): Array<{ kind: Furniture['kind']; tiles: Array<{ x: number; y: number }> }> {
  const out: Array<{ kind: Furniture['kind']; tiles: Array<{ x: number; y: number }> }> = []
  for (const f of list) {
    const last = out[out.length - 1]
    if (last && last.kind === f.kind) last.tiles.push({ x: f.x, y: f.y })
    else out.push({ kind: f.kind, tiles: [{ x: f.x, y: f.y }] })
  }
  return out
}
