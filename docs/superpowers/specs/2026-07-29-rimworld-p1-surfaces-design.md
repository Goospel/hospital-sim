---
tags:
  - type/spec
---

# 림월드 P1 표면 3종 — 구현 스펙 (경고 스택 · 키보드 · 인스펙트)

> **출처**: [림월드 장르 해부](../../concept/rimworld-genre-extraction.md) §3의 P1 채택 3건을 구현 계약으로 내린 것 (사용자 승인 2026-07-29). 구현 순서 권고: **§1 경고 스택 → §2 키보드 → §3 인스펙트** (작은 것부터, 매 단계 커밋).

## 0. 공통 계약 — 시뮬 코어 무변

- **`src/sim/*`의 규칙·수치·상태 전이는 0건 변경.** 이 세 기능은 전부 표시층(simHud 순수 함수 + 컴포넌트)과 입력층이다. 300분 회귀 픽스처(`regression.test.ts`)가 한 글자도 안 바뀌는 것이 증거다.
- **판정·문구는 `simHud.ts` 순수 함수로** — JSX 안에 판정이 살면 겨눌 테스트가 없다(그 파일 머리말의 관통 규칙). TDD Red→Green.
- 카드·경고에는 **세계에 이미 있는 사실만** 노출한다 — "오늘 진료 N건" 같은 폰별 신규 집계 필드 추가 금지(그건 시뮬 변경이다).
- 색 단독 신호 금지(기존 관통 규칙) — 색이 갈리는 곳엔 반드시 텍스트가 함께 간다.

## 1. 경고 스택 — `alertsOf` (림월드 alerts의 이식)

### 1-1. 순수 함수 (simHud.ts)

```ts
export interface SimAlert {
  key: string                    // React key용 안정 식별자 (예: 'no-waiting', 'fatigue-risk')
  kind: 'setup' | 'ops'          // 배치 문제(아무 일도 안 일어나는 이유) vs 운영 경고
  severity: 'warn' | 'danger'
  text: string
}
export function alertsOf(w: SimWorld): SimAlert[]
```

- **`setup` 계열은 기존 `setupWarningText`의 체인을 그대로 분해해 옮긴다** — 문구·판정·순서(대기실 없음 → 문 없는 방 → 진료실 없는 의사 → 슬롯 부족/의자 없는 책상) 한 글자도 안 바꾼다. 전부 `severity: 'warn'`.
- **`ops` 계열 신설 3종** (전부 기존 판정식·상수의 재사용 — 새 규칙 금지):
  1. `no-bed` · **danger** — 병동 침대 자리 0 (`wardBeds(w).length === 0`) **이고 의사가 1명 이상**일 때: `병상이 없습니다 — 응급을 받을 수 없습니다`. (의사 0명 첫 판은 setup도 침묵하는 것과 같은 이유로 침묵.)
  2. `fatigue-risk` · **danger** — 피로 `FATIGUE_RED` 이상 의사 N ≥ 1: `피로 위험 의사 N명 — 쉬지 못하면 사직으로 이어집니다`. 판정은 `src/game/doctor.ts`의 `FATIGUE_RED`를 임포트(needs.ts가 쓰는 그 값 — 임계를 다시 적지 않는다).
  3. `starving` · **warn** — 굶은 의사(`needs`의 허기 판정 함수 재사용) N ≥ 1 **이고 식당 영역이 없을 때**: `식당이 없어 굶는 의사 N명 — 모든 일이 느려집니다`. (식당이 있으면 스스로 가므로 경고가 아니라 대기다.)
- **정렬**: danger 먼저, 같은 severity 안에서는 위 나열 순서(고정). setup은 기존 체인 순서 유지.
- **`setupWarningText`는 파생으로 재구현**: `alertsOf(w).find(a => a.kind === 'setup')?.text ?? null`. **기존 테스트가 무변으로 통과해야 한다** — 이것이 단일 출처 이관의 증거다. `statusLineText` 체인은 건드리지 않는다.

### 1-2. 표시 (SimGame.tsx)

- 위치: **우측 상단, 헤더 아래** 세로 스택(`absolute right-2, top: insets.top + 8px` 상당, z-10). 줌 버튼(우측 중앙)과 겹치지 않는다.
- 항목당: 한 줄 텍스트 칩 — `danger`는 `border-alarm text-alarm`, `warn`은 기존 muted 계열. `font-mono text-[11px]` 관례.
- 클릭 동작 없음(카메라 점프는 P2) — `pointer-events-none`으로 맵 조작을 막지 않는다.
- 최대 표시 개수 제한 없음(현실적으로 ≤ 7종).

### 1-3. 테스트 겨냥점

- setup 4종이 기존 `setupWarningText` 테스트와 같은 픽스처에서 같은 문구로 나온다(이관 무변).
- `no-bed`: 침대 없는 병원 + 의사 1 → danger / 의사 0 → 없음 / 침대 있으면 없음.
- `fatigue-risk`: 피로 79 → 없음, `FATIGUE_RED` → 있음(경계 겨냥) · N 집계.
- 정렬: danger가 warn보다 앞.
- `setupWarningText === alertsOf 파생` 동치성.

## 2. 키보드 최소셋 — 스페이스·ESC

### 2-1. 계약

- **스페이스** = 일시정지 토글: `speed 0 ↔ 직전 0 아닌 배속`(기억, 초기값 1). 순수 함수로 뽑는다:
  ```ts
  export const toggledSpeed = (cur: SimSpeed, lastRun: SimSpeed): SimSpeed => (cur === 0 ? lastRun : 0)
  ```
  `lastRun`은 SimGame이 배속 변경 시 기억(0이 아닌 값만). `preventDefault` 필수 — 스페이스는 페이지를 스크롤한다.
- **ESC** = 한 겹씩 닫기. 우선순위를 순수 함수로 박는다:
  ```ts
  export type EscTarget = 'modal' | 'inspect' | 'tool' | null
  export function escTarget(s: { modalOpen: boolean; inspectOpen: boolean; tool: BuildTool | null }): EscTarget
  ```
  `modal`(채용·인사·이벤트 카드 중 열린 것) → `inspect`(§3 카드) → `tool`(도구+용도+과 해제 — `toggleSection`의 초기화 3종과 같은 세 줄) → `null`(아무것도 안 함). 결산 오버레이(DAY_END·WEEK_END)는 ESC로 닫지 **않는다** — 닫으면 다음 행동(다음 날 버튼)이 사라진다.
- 리스너는 SimGame의 `useEffect`로 `window`에 1개. `e.repeat` 무시. 드래그(건설) 중 스페이스는 그대로 동작해도 무해(시계는 drag로 이미 정지).
- **"마우스 클릭·드래그만으로 완주"는 제출 문서의 계약** — 키보드는 가속 수단일 뿐, 어떤 기능도 키보드 전용이 되면 안 된다.

### 2-2. 테스트 겨냥점

`toggledSpeed` 3케이스(0→last, 1→0, 3→0) · `escTarget` 우선순위 4케이스(모달>인스펙트>도구>null).

## 3. 인스펙트 — 폰 클릭 카드

### 3-1. 클릭 판정 (TileMap.tsx)

- **팬 경로에서 "클릭"을 분리한다**: `pointerdown`(팬 시작) 시 시작 좌표를 기억하고, `pointerup`에서 **총 이동 거리 < `CLICK_SLOP`(5px)**이면 팬이 아니라 클릭 — 새 prop `onTileClick(t)`를 부른다(그 뒤 팬 상태 해제는 기존 그대로).
- **주버튼(button 0)일 때만** 클릭으로 친다 — 중·우클릭은 순수 팬 유지.
- 건설 경로(주버튼 + `buildReady`)는 한 글자도 안 바뀐다 — 도구를 든 동안 클릭은 건설이다.
- 이동 거리는 pointerdown 시점 좌표와 pointerup 좌표의 차로 계산(팬 델타 누적이 아니라 시작·끝 비교 — 왕복 드래그가 클릭으로 오인되는 것은 무시할 코너다).

### 3-2. 선택 상태 (SimGame.tsx)

- `const [inspectId, setInspectId] = useState<string | null>(null)`.
- `onTileClick(t)`: `world.pawns`에서 `p.x === t.x && p.y === t.y`인 폰 중 **마지막**(배열 뒤 = 화면 위)을 찾아 `setInspectId(p.id)` — 없으면 `null`(빈 타일 클릭 = 닫기).
- **카드는 매 렌더 `world.pawns.find(id)`로 그린다** — 별도 스냅샷 금지: 폰이 움직이면 카드 수치가 따라 살고, 퇴장(배열에서 제거)하면 카드가 저절로 닫힌다(`find` 실패 → 렌더 안 함 — 상태 클리어는 불필요하되 남은 id는 무해).
- 선택 폰 표시: 그 폰 div에 선택 링(`boxShadow: inset 0 0 0 1px var(--on-desk)` 상당, 응급 링과 겹쳐도 읽히게 응급은 기존 유지). TileMap에 `selectedId?: string` prop 하나 추가.

### 3-3. 카드 내용 — 순수 함수 (simHud.ts)

```ts
export interface InspectCard { title: string; lines: string[] }
export function inspectCard(p: Pawn, w: SimWorld): InspectCard
```

- **의사**: 제목 `이름 · 과 라벨`. 줄: ① 특성 2종 — `TRAITS[k].label` 병기 + 사연 한 줄씩(`traits.ts`의 story — 노출이 이 카드의 존재 이유다) ② 상태 문장(**현재 작업 문장** — 림월드 이식): 우선순위 `진료 중`(busyDoctorIds 포함) → `휴식 중/식사 중/이동 중`(doctorActivityMark 계열 재사용) → `자리 없음`(doctorRoomlessMark) → `대기 중` ③ `피로 N`(fatigueTone별 색은 표시층) · `허기 N분` ④ 우선순위 요약 한 줄(`진료 2 · 응급 3 · 휴식 1` — priorityOf 폴백 포함).
- **환자**: 제목 `환자`(익명 — character-design.md: 환자에 개인 서사를 붙이지 않는다). 줄: ① `원하는 과: 라벨` ② stage 한국어(`입장 중/대기 중/진료실로 이동/진료 중/퇴장 중`) ③ 응급이면 `응급 — 종류 라벨`.
- 기존 헬퍼(simDept·TRAITS·fatigueTone·doctorActivityMark·busyDoctorIds) 재사용 — 같은 판정을 다시 적지 않는다.

### 3-4. 카드 표시 (SimGame.tsx)

- 위치: **좌하단, 팔레트 오른쪽**(`absolute bottom-2, left: 팔레트 폭 + 8px` — `insets.left` 재사용), 폭 `w-56` 내외, z-10. 기존 패널 관례(border-frame · bg-desk-2/80 · backdrop-blur).
- 닫기: ESC(§2) · 빈 타일 클릭 · 우상단 `×` 버튼(마우스 전용 완주 계약).
- 카드는 오버레이(채용·결산 등) **아래** 층 — 모달이 뜨면 가려지는 것이 옳다.

### 3-5. 테스트 겨냥점

- `inspectCard` — 의사: 특성 2줄 포함 · busy 의사는 `진료 중` · activity 의사는 그 상태 · 우선순위 폴백(필드 없음 → 전부 2). 환자: 과 라벨 · stage 문구 · 응급 표기. (클릭 슬롭·selectedId 렌더는 브라우저 실측 몫.)

## 4. 검증·완료 기준

- **vitest 전체 green**(기존 1198 + 신규) · `tsc` 0 · eslint 0 error. 기존 테스트 기대값 변경은 **`setupWarningText` 이관 관련 0건이어야 정상**이다 — 하나라도 바뀌면 이관이 아니라 개변이니 멈추고 원인을 본다.
- 브라우저 실측(구현 후): ① 경고 스택 — 빈 부지+의사 1명 상태에서 setup·no-bed 동시 표시 ② 스페이스 토글·ESC 체인 ③ 의사 클릭 → 카드(특성·사연 보임) → 걷는 동안 수치 갱신 → 빈 타일 클릭으로 닫힘 · 도구 든 상태의 클릭은 여전히 건설 ④ 콘솔 에러 0.
- 커밋은 기능당 1개(§1→§2→§3), 한글 메시지는 T-026(`.commit-msg-tmp` + `git commit -F`), AI 트레일러 규약 준수.
