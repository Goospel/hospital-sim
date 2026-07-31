---
tags:
  - type/plan
---

# HUD 밝은 전환 구현 계획 (아트 디렉션 ④)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 본편(`/`)의 HUD·패널·오버레이를 desk 토큰 스코프 재정의로 밝은 종이 톤으로 뒤집는다 — `/classic`은 어두운 채 유지.

**Architecture:** SimGame 루트 요소에서 desk 토큰 6종(`--desk`·`--desk-2`·`--frame`·`--on-desk`·`--on-desk-muted`·`--alarm`)을 `landingPalette.ts` 값으로 재정의한다. `globals.css`의 `@theme inline`이 유틸리티에 `var(--desk)` 참조를 직접 심으므로(빌드 시점 hex 아님 — 확인 완료) 하위 99곳이 클래스 무변으로 뒤집힌다. 알파 수식어는 `color-mix(… var(--desk) …)`로 런타임 해석되어 함께 뒤집힌다. 경고색은 밝은 판용 `alarmDeep`을 신설하고 대비를 테스트로 잠근다.

**Tech Stack:** Next.js + React + Tailwind v4(`@theme inline`) + vitest.

**스펙:** [2026-08-01-bright-hud-design.md](../specs/2026-08-01-bright-hud-design.md) · **브랜치:** `feat/bright-hud` (origin/main 기준, 생성 완료)

**공통 규약** (모든 태스크):
- 커밋 메시지는 한글 — `.commit-msg-tmp`(UTF-8, BOM 없음)에 쓰고 `git commit -F .commit-msg-tmp && rm .commit-msg-tmp`. 인라인 `-m` 한글 금지(훅이 차단).
- 트레일러(`Skills-used:`…`Co-Authored-By:`)는 빈 줄 없이 연속으로 메시지 맨 끝에.
- 한글 텍스트 검색은 Git Bash grep 금지(무성 실패) — Grep 도구(ripgrep) 사용.
- 돌연변이는 Edit 도구로만 심고 복원(T-139), hover 필터는 어둡게 하는 방향만(T-142).

---

### Task 1: alarmDeep 팔레트 확장 + 대비 계약

**Files:**
- Modify: `src/components/landingPalette.ts` (키 1개 추가)
- Test: `src/components/landingPalette.test.ts` (it 1개 추가)

배경: 기존 `--alarm` #e5484d는 밝은 카드(#edeae3) 위 WCAG 대비 3.26으로 텍스트 기준(4.5) 미달이다. 본편 HUD의 `text-alarm` 12곳이 카드·배경 양쪽에 얹히므로 **두 바탕 모두** 4.5 이상인 진한 빨강을 신설한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `landingPalette.test.ts`의 describe 안에 추가:

```ts
  it('경고 빨강: 카드·배경 위 모두 WCAG 4.5:1 이상 (본편 HUD의 --alarm 재정의 값)', () => {
    expect(wcagContrast(LANDING.alarmDeep, LANDING.card)).toBeGreaterThanOrEqual(4.5)
    expect(wcagContrast(LANDING.alarmDeep, LANDING.backdrop)).toBeGreaterThanOrEqual(4.5)
  })
```

- [ ] **Step 2: RED 확인**

Run: `npx vitest run src/components/landingPalette.test.ts`
Expected: FAIL — `LANDING.alarmDeep`이 없어 `wcagContrast(undefined …)` 경로에서 죽거나 tsc 수준에서 잡힌다(vitest는 타입을 벗기므로 런타임 실패로 나타난다).

- [ ] **Step 3: 값 추가** — `landingPalette.ts`의 `onAccent` 항목 뒤에:

```ts
  /** 경고 빨강(본편 HUD의 --alarm 재정의 값) — #e5484d는 밝은 카드 위 3.19로 미달이라
   *  색상은 유지하고 어두운 쪽으로 내렸다. 카드·배경 위 4.5:1은 테스트가 잠근다. */
  alarmDeep: "#b02a30",
```

- [ ] **Step 4: GREEN 확인** — 같은 명령, 전체 PASS. 후보값 실측: 카드 위 5.43 · 배경 위 4.71. 미달로 나오면 hex를 더 어둡게 조정(값은 후보, 테스트가 계약).

- [ ] **Step 5: 돌연변이 1건** — `alarmDeep`을 기존 알람값 `#e5484d`로 Edit → 새 테스트 FAIL 확인(두 단언 모두) → 원복 → `git status` 깨끗 확인.

- [ ] **Step 6: 커밋** — 제목: `feat: 경고 빨강 alarmDeep — 밝은 바탕 위 4.5:1을 테스트로 잠근다`

---

### Task 2: SimGame 루트 토큰 재정의 + 청록 확정 버튼 3곳

**Files:**
- Modify: `src/components/SimGame.tsx` (루트 요소 style + import)
- Modify: `src/components/HirePanel.tsx` (「개원 준비 시작」 버튼)
- Modify: `src/components/DayEndOverlay.tsx` (「다음 날」 버튼)
- Modify: `src/components/WeekEndOverlay.tsx` (「다음 주」 버튼)

- [ ] **Step 1: SimGame 루트에서 토큰 재정의**

`SimGame.tsx`에 import 추가:

```tsx
import { LANDING } from "@/components/landingPalette";
```

`return (` 아래 최상위 컨테이너 요소(주석 "한 화면 = 부지 하나" 바로 다음 요소)에 style을 추가한다(기존 style prop이 있으면 **병합** — 절대 덮어쓰지 말 것):

```tsx
      /* 아트 디렉션 ④ — desk 토큰을 이 서브트리에서만 밝은 값으로 재정의한다.
         @theme inline이라 유틸리티가 var(--desk)를 직접 참조하므로 하위 99곳이
         클래스 무변으로 뒤집히고, /classic은 :root의 어두운 값 그대로다.
         hex는 landingPalette(TS)에만 있다 — globals.css 무변 계약. */
      style={
        {
          "--desk": LANDING.backdrop,
          "--desk-2": LANDING.card,
          "--frame": LANDING.edge,
          "--on-desk": LANDING.ink,
          "--on-desk-muted": LANDING.inkMuted,
          "--alarm": LANDING.alarmDeep,
        } as CSSProperties
      }
```

(`CSSProperties`는 `react`에서 type import — 파일에 이미 있으면 재사용.)

- [ ] **Step 2: 즉시 확인** — `npx tsc --noEmit` 통과. dev 서버 없이도 이 시점에 커밋 가능하나, Step 3까지 묶어서 한 커밋으로 간다.

- [ ] **Step 3: 청록 확정 버튼 3곳**

랜딩 「여기에 짓는다」와 같은 축. 각 버튼에서 **색 클래스만** 제거하고(레이아웃 클래스 유지) 다음을 적용한다. hover는 T-142 방향(어둡게):

공통 형태:
```tsx
className="… transition-[filter] hover:brightness-95"   // 기존 색 클래스(border-*·bg-*·text-* 색만) 제거
style={{ background: LANDING.accent, color: LANDING.onAccent }}
```

적용 지점 (라벨 원문으로 찾는다 — Grep 도구 사용):
1. `HirePanel.tsx` — `{starting ? "개원 준비 시작" : "닫기"}` 버튼. **`starting`일 때만 청록**, 「닫기」 상태는 기존 중립 유지:
```tsx
style={starting ? { background: LANDING.accent, color: LANDING.onAccent } : undefined}
```
   className의 색 클래스는 조건부로 유지해야 한다 — `starting`이 아닐 때의 기존 모습이 변하면 안 되므로, 삼항으로 색 클래스 문자열을 가른다(기존 클래스 문자열을 실측해 그대로 보존할 것).
2. `DayEndOverlay.tsx` — 「다음 날」 버튼.
3. `WeekEndOverlay.tsx` — 「다음 주」 버튼(폐업 화면은 버튼이 아예 없으므로 해당 없음 — 스펙 §8 셋째 항목은 이로써 해소).

각 파일에 `import { LANDING } from "./landingPalette";` 추가.

- [ ] **Step 4: 게이트** — `npx tsc --noEmit && npm run lint && npm test` 전부 통과 (lint 경고 1건 `src/game/dialogue.ts:172`는 선재).

- [ ] **Step 5: 커밋** — 제목: `feat: HUD를 밝은 종이 톤으로 — desk 토큰 스코프 반전 + 청록 확정 버튼`

---

### Task 3: 브라우저 전 화면 검수 + 보정 + 문서 스윕 + PR

**Files:**
- 보정: Task 2의 파일들(검수에서 걸린 자리만)
- Modify: `claude-docs/plan.md` · `claude-docs/changeLog.md`
- 확인만: `docs/concept/structural-problems-checklist.md`(표현 층이라 대체로 무변)

- [ ] **Step 1: dev 서버 전 화면 검수** (자동 반전이 계약을 못 지키는 자리를 눈으로)

`.claude/launch.json`의 dev 서버로 다음 시나리오를 돌며 스크린샷:
1. 랜딩 확정 → **채용 패널**: 밝은 카드인가, 「개원 준비 시작」(3명 채용 후)이 청록인가, 「닫기」 상태는 중립인가.
2. **HUD 상단바·사이드바**: 밝은 반투명(blur 유지)인가, 시계·금고 텍스트가 읽히는가.
3. **건설 도구·우선순위 패널**: 토글 상태 구분이 사는가.
4. 하루 진행 → **하루 정산 오버레이**: 「다음 날」 청록.
5. **이벤트 카드**(아침) · **경고 문구**(`text-alarm` — 개원 체크리스트 알림 등): alarmDeep이 읽히는가, `bg-alarm/10`·`border-alarm/60` 자리가 밝은 판에서 성립하는가.
6. 7일 진행 → **주간 결산**: 「다음 주」 청록. 적자 경고 줄 가독.
7. 알파 수식어 16곳 소속 화면(`bg-desk/85` 딤 5 · `bg-desk-2/80` 6 · 텍스트 /40~/70 5) 훑기 — 딤이 밝은 반투명으로 자연스러운가.
문제 자리는 그 자리만 보정(개별 값 또는 알파 조정)하고 보정마다 게이트 재실행.

- [ ] **Step 2: 스크린샷 사용자 전달** (채용 패널 전후 대비가 갈리는 1~2장)

- [ ] **Step 3: 문서 스윕**
- `claude-docs/plan.md`: 아트 디렉션 항목의 ⏸「어두운 HUD 충돌」을 ✅로 갱신 + 완료 항목 한 줄.
- `claude-docs/changeLog.md` 맨 위 항목(PR 번호 없이).
- 트랩 스윕: 1분+ 근인 디버깅(서브에이전트·리뷰어 포함) 있으면 `T-###` 신설(T-142 다음 번호) + 허브 재생성(`scripts/rebuild-troubleshooting-index.ps1 -HubPath claude-docs/troubleshooting.md`).
- 스펙 §8 미해결 중 해소된 것(폐업 버튼 없음, alarmDeep 확정값) 스펙에 반영.

- [ ] **Step 4: 커밋 + PR** — push 후 `gh pr create`(본문 한글, `--body-file` UTF-8). **머지는 사용자에게 물은 뒤에만.**

---

## 실행 기록 (SDD · 2026-08-01)

- **Task 1** — 계획서 후보 hex `#b02a30` 그대로 GREEN(조정 0). 리뷰가 **분리 돌연변이**로 두 단언의 독립성을 실측했다: `#b52c32`는 카드 5.19로 통과하고 backdrop 4.4997로만 실패 — 즉 backdrop 단언이 실제 구속선이고 두 줄이 중복이 아니다. 계획서·주석의 「#e5484d는 카드 위 3.19」는 실측 **3.26**의 오기(아래 문서 스윕에서 정정).
- **Task 2** — 리뷰가 설계의 유일한 위험(`@theme inline`이 hex를 굽는가)을 **산출 CSS로 실증**: desk 계열 유틸리티 전수가 `var(--*)` 참조이고 알파는 `color-mix(in oklab, var(--desk-2) 80%, transparent)`로 런타임 해석된다. `createPortal` 0건이라 오버레이 3종도 서브트리 안. 계획 밖 추가 1건 — 인라인 `color`가 `disabled:text-*`를 이겨 잠긴 「개원 준비 시작」이 활성처럼 보이던 것을 `disabled:opacity-50`으로(리뷰가 대비 2.11:1을 계산해 수용 판정).
- **Task 3** — 브라우저 실측에서 defect 1건: 전역 `color-scheme: dark`가 남아 밝은 패널의 UA 스크롤바가 어두웠다(`getComputedStyle(main).colorScheme === "dark"`로 확인) → 루트 style 한 줄로 해소하고 HMR 후 `"light"` 재확인. 나머지 검수 항목(상단바·사이드바·체크리스트·경고 칩·건설 팔레트·하루 정산 카드·청록 버튼 3곳)은 보정 없이 통과.
- **부수 함정**: superpowers 문서에서 `claude-docs/`를 `../../`로 링크해 pre-commit LINKS-CHECK에 두 번 걸렸다(랜딩 계획 + 이 스펙) → [T-143](../../../claude-docs/troubleshooting/T-143.md).

## 계획 자기 검토 (writing-plans self-review)

- **스펙 커버리지**: §1(본편만) → Task 2 스코프 재정의(서브트리 한정이 곧 구현) · §2(방식) → Task 2 Step 1 · §3(토큰 대응·alarmDeep) → Task 1 + Task 2 · §4(위계·blur 유지) → 변경 없음이 곧 구현, Task 3 검수로 확인 · §5(청록 3곳·T-142 방향) → Task 2 Step 3 · §6(계약·검수) → Task 1 테스트 + Task 3 Step 1 · §7(YAGNI) → 어느 태스크도 classic·globals.css를 안 만진다 · §8(미해결) → alarmDeep 후보값·검수 보정·폐업 버튼 해소를 Task 1·3에 배치. 공백 없음.
- **플레이스홀더**: 없음 — 코드 스텝 전부에 실제 코드 수록. Task 2 Step 3-1의 "기존 클래스 문자열 실측 보존"은 구현 시점 파일 상태에 의존하는 의도된 지시(전문 복붙이 오히려 낡을 자리).
- **타입 일관성**: `LANDING.alarmDeep`(Task 1 정의)를 Task 2가 사용 · `CSSProperties` react type import · import 경로 `@/components/landingPalette`(SimGame)와 `./landingPalette`(components 내 형제) 구분 명시.
