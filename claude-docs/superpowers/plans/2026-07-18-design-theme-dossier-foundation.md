# 디자인 테마 "의무기록·차트" — Plan A(기반 + 핵심 수직 슬라이스) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 확정 스펙([2026-07-18-design-theme-dossier-design.md](../specs/2026-07-18-design-theme-dossier-design.md))의 디자인 시스템을 토큰·폰트 기반부터 원형(TransferRound)·정점(Epilogue)까지 끝단으로 한 번 관통해, 테마가 실제로 성립함을 증명한다.

**Architecture:** globals.css를 색·물성·모션 토큰의 단일 출처로 재선언하고 Tailwind v4 `@theme inline`으로 유틸을 생성한다. 폰트는 3계층(명조=판정/고딕=UI/모노=기록)으로 자체 호스팅한다. 그 위에서 공유 컴포넌트(SegmentTree) → 원형 화면(TransferRound) → 정점(Epilogue/Receipt) 순으로 인라인 zinc 유틸을 토큰 유틸로 교체한다. 나머지 화면은 후속 Plan B.

**Tech Stack:** Next.js 16(App Router) · React 19 · Tailwind CSS v4(`@import "tailwindcss"` + `@theme inline`) · `next/font`(local+google) · vitest 4(로직 회귀 게이트) · 브라우저 프리뷰(시각 검증).

## Global Constraints

- **테스트 게이트(모든 태스크 공통):** `npx tsc --noEmit` 0 에러 **필수**(vitest는 esbuild라 타입체크 안 함 — 타입 회귀가 green으로 새어나감) + `npm test`(vitest) 전체 green(로직 무회귀).
- **React 테스트 인프라 없음:** 컴포넌트 시각 변경은 유닛테스트가 아니라 **브라우저 프리뷰 렌더**로 검증. 로직·순수함수(`src/game/*`)만 vitest 대상.
- **범위 = 시각 + 안전한 카피만:** 이모지 제거 · `다시 매달리기`→`다시 걸기` · 모션 접근성. **서술 카피 재작성은 금지**(랜딩 태그라인·Epilogue 헤드라인/부제 `살렸습니다`·`살았다`·`빠져나간 몫…`·placeholder = 별도 세션. 리스킨 시 그 문자열은 그대로 둔다).
- **토큰 단일 출처 = `src/app/globals.css`.** 컴포넌트는 인라인 hex/zinc 유틸 대신 토큰 유틸(`bg-desk`·`text-ink`·`text-go`·`text-alarm`·`bg-stamp-field`·`font-serif`/`mono` 등)만 참조.
- **3계층 서체 역할:** 명조(`font-serif`)=사람이 쓴 판정(진단명·병원명·헤드라인·담당자 대사) / 고딕(`font-sans`)=조작 UI(버튼·라벨·도움말) / 모노(`font-mono` + `tabular-nums`)=기계 기록(시계·금액·통화·로그·×N). 명조는 18px+ 판정문에만.
- **모션:** 맥동/글로우는 30초 임계 이하만(`LOW_TIME_THRESHOLD=30`) + `motion-reduce:*`로 정지. 붉은 글로우 alpha ≤ 0.35. 반복 모션은 시계 pulse 하나만.
- **접근성:** 판정(거절/수용/위급)은 색 단독 금지 — 텍스트·도장·숫자 동반. 흑백에서도 읽혀야.
- **키치 방어:** paper에 노이즈·세피아·커피링·빈티지 필터·회전·구겨짐 금지. 물성은 그라디언트·1px edge·미세 그림자까지만.
- **Git:** 브랜치 `worktree-design+theme`(main 아님). 한글 커밋은 T-026(`.commit-msg-tmp` UTF-8 + `git commit -F`), `Skills-used:` 트레일러(빈 줄 없이 `Co-Authored-By`까지 연속).

---

### Task 1: 3계층 폰트 자체 호스팅 + layout.tsx + Arial 버그 수정

**Files:**
- Create: `src/app/fonts/Pretendard-Variable.woff2`, `src/app/fonts/D2Coding.woff2` (자산 — 아래 Step 1에서 획득)
- Modify: `src/app/layout.tsx` (Geist 2종 제거 → 3계층 바인딩)
- Modify: `src/app/globals.css:32-34` (body `font-family: Arial` → `var(--font-sans)`)

**Interfaces:**
- Produces: `<html>`에 CSS 변수 `--font-pretendard`·`--font-noto-serif-kr`·`--font-d2coding` 바인딩. Task 2가 `@theme inline`에서 이를 `--font-sans/serif/mono`로 매핑.

- [ ] **Step 1: 폰트 자산 획득**

Noto Serif KR은 `next/font/google`이 빌드시 자체 호스팅(같은 오리진 제공 → CSP 안전)하므로 파일 불필요. Pretendard·D2Coding은 Google Fonts에 없어 woff2를 받는다:
- Pretendard: `PretendardVariable.woff2`(jsDelivr `pretendard` 배포 또는 GitHub `orioncactus/pretendard` release) → `src/app/fonts/Pretendard-Variable.woff2`
- D2Coding: GitHub `naver/d2codingfont` release의 `D2Coding.woff2`(없으면 ttf→woff2 변환) → `src/app/fonts/D2Coding.woff2`

- [ ] **Step 2: layout.tsx 폰트 3계층 교체**

`src/app/layout.tsx`를 아래로. (Geist·Geist_Mono import·인스턴스 삭제)

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import { Noto_Serif_KR } from "next/font/google";
import "./globals.css";

const pretendard = localFont({
  src: "./fonts/Pretendard-Variable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const d2coding = localFont({
  src: "./fonts/D2Coding.woff2",
  variable: "--font-d2coding",
  display: "swap",
});

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "수화기 너머의 벽",
  description:
    "골든타임 안에 응급환자를 받아줄 병원을 찾는 실시간 전원 협상 시뮬레이션 — 대한민국 의료 시스템의 구조적 벽을 의료진 시점에서 겪는다.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${notoSerifKr.variable} ${d2coding.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: globals.css body의 Arial 제거**

`src/app/globals.css`의 `body { font-family: Arial, Helvetica, sans-serif; }` →

```css
body {
  font-family: var(--font-sans);
}
```

(⚠️ `--font-sans`는 Task 2에서 `@theme inline`에 `var(--font-pretendard)`로 정의된다. 두 태스크를 연이어 실행하거나, 이 태스크에서 임시로 `var(--font-pretendard)`를 써도 된다.)

- [ ] **Step 4: 게이트 검증**

Run: `npx tsc --noEmit` → Expected: 0 에러
Run: `npm test` → Expected: 전체 green(로직 무변경)

- [ ] **Step 5: 프리뷰 렌더 확인**

`.claude/launch.json`에 dev 서버 항목 없으면 추가:
```json
{ "version": "0.0.1", "configurations": [ { "name": "dev", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev"], "port": 3000 } ] }
```
preview_start `{name:"dev"}` → 앱 로드 → 한글 본문이 Pretendard, 어떤 화면이든 깨지지 않음 확인. `javascript_tool`로 `getComputedStyle(document.body).fontFamily`가 Pretendard 포함인지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/app/fonts src/app/layout.tsx src/app/globals.css
git commit -F .commit-msg-tmp   # feat(design): 3계층 폰트 자체 호스팅 + Arial body 버그 수정
```

---

### Task 2: 색·물성·모션 토큰 + `.paper-card` 유틸 (globals.css)

**Files:**
- Modify: `src/app/globals.css` (`:root` 토큰 재선언 + `@theme inline` 등록 + `.paper-card` 유틸)

**Interfaces:**
- Produces: 유틸 `bg-desk`·`bg-desk-2`·`text-on-desk`·`text-on-desk-muted`·`text-alarm`·`bg-paper`·`bg-paper-2`·`bg-paper-edge`·`border-border-paper`·`text-ink`·`text-ink-2`·`text-ink-3`·`text-stamp-ink`·`bg-stamp-field`·`border-stamp`·`text-go`·`rounded-paper`·`font-serif`·`font-mono`, 그리고 클래스 `.paper-card`. Task 3~6이 소비.

- [ ] **Step 1: globals.css 토큰 블록 교체**

`src/app/globals.css` 전체를 아래로(기존 zinc 토큰 대체). ★=대비감사 조정값.

```css
@import "tailwindcss";

:root {
  /* 지면(desk) */
  --desk: #101014; --desk-2: #17171c; --frame: #26262c;
  --on-desk: #d8cfaf; --on-desk-muted: #7a7460; --alarm: #e5484d;
  /* 종이(paper) */
  --paper: #e5dcc4; --paper-2: #d3c6a3; --paper-edge: #c4b58f;
  --border-paper: #a2966f; --rule: #b0a37e;
  --ink: #26221a; --ink-2: #585039; /*★*/ --ink-3: #7d7358;
  --stamp: #8f1a17; --stamp-ink: #7a1414; --stamp-field: #e9d9c4;
  --go: #1b5e3d; /*★*/
  /* 전역 = 지면 */
  --background: var(--desk); --foreground: var(--on-desk);
  /* 물성 */
  --radius-paper: 2px; --radius-stamp: 1px;
  --shadow-paper: 0 1px 1px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.45);
  --paper-highlight: inset 0 1px 0 rgba(255,255,255,.35);
  --shadow-alarm: inset 0 0 120px rgba(143,26,23,.35); /*★ 0.4→0.35*/
}

@theme inline {
  --color-background: var(--desk);
  --color-foreground: var(--on-desk);
  --color-desk: var(--desk);
  --color-desk-2: var(--desk-2);
  --color-frame: var(--frame);
  --color-on-desk: var(--on-desk);
  --color-on-desk-muted: var(--on-desk-muted);
  --color-alarm: var(--alarm);
  --color-paper: var(--paper);
  --color-paper-2: var(--paper-2);
  --color-paper-edge: var(--paper-edge);
  --color-border-paper: var(--border-paper);
  --color-rule: var(--rule);
  --color-ink: var(--ink);
  --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-stamp: var(--stamp);
  --color-stamp-ink: var(--stamp-ink);
  --color-stamp-field: var(--stamp-field);
  --color-go: var(--go);
  --font-sans: var(--font-pretendard);
  --font-serif: var(--font-noto-serif-kr);
  --font-mono: var(--font-d2coding);
  --radius-paper: var(--radius-paper);
}

html { color-scheme: dark; }
html, body { background: var(--desk); color: var(--on-desk); }
body { font-family: var(--font-sans); }

/* 종이 한 장 = 그라디언트 + 이너하이라이트 + 드롭섀도 (단일 출처) */
.paper-card {
  background: linear-gradient(180deg, var(--paper), var(--paper-2));
  color: var(--ink);
  border: 1px solid var(--border-paper);
  border-radius: var(--radius-paper);
  box-shadow: var(--paper-highlight), var(--shadow-paper);
}
```

- [ ] **Step 2: 게이트 검증**

Run: `npx tsc --noEmit` → 0 에러
Run: `npm test` → 전체 green

- [ ] **Step 3: 프리뷰 — 비회귀 + 새 유틸 확인**

preview_start `{name:"dev"}` → 기존 화면들이 여전히 렌더됨(기존 컴포넌트는 아직 zinc 유틸 사용 — 깨지지 않음). `javascript_tool`로 임시 요소에 `class="bg-paper text-ink"` 넣어 색이 마닐라/잉크로 나오는지 확인(또는 다음 태스크에서 실사용으로 확인).

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css
git commit -F .commit-msg-tmp   # feat(design): 의무기록 테마 색·물성 토큰 + .paper-card 유틸
```

---

### Task 3: dialogue.ts 이모지 제거 + 테스트 갱신 (TDD)

**Files:**
- Modify: `src/game/dialogue.ts:144` (COSMETIC_WALKIN 🎉 제거)
- Modify: `src/game/dialogue.test.ts:79-83` (🎉 assert → 이모지 없음 assert)

**Interfaces:** 없음(순수 상수/테스트).

- [ ] **Step 1: 실패하는 테스트로 갱신 (Red)**

`src/game/dialogue.test.ts:79-83`을 아래로. 제목·assert를 "이모지 없음"으로 뒤집는다.

```ts
  it('워크인 수용 → 명랑한 확인 대사(이모지 없음)', () => {
    const line = receivingLine(walkin, 'CHOICE', true)
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('접수')
    expect(line).not.toMatch(/\p{Extended_Pictographic}/u)
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/game/dialogue.test.ts -t '워크인 수용'`
Expected: FAIL — 현재 `dialogue.ts:144`가 `🎉`를 포함해 `not.toMatch` 실패.

- [ ] **Step 3: 코드에서 이모지 제거 (Green)**

`src/game/dialogue.ts:144`:
```ts
  COSMETIC_WALKIN: '물론이죠! 바로 접수해 드릴게요',
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/game/dialogue.test.ts`
Expected: PASS (해당 파일 전체 green)
Run: `npx tsc --noEmit` → 0 에러

- [ ] **Step 5: 커밋**

```bash
git add src/game/dialogue.ts src/game/dialogue.test.ts
git commit -F .commit-msg-tmp   # fix(copy): 워크인 수용 대사 이모지 제거 + 테스트 갱신
```

---

### Task 4: SegmentTree 토큰화 (공유 — 장부 정합)

**Files:**
- Modify: `src/components/SegmentTree.tsx`

**Interfaces:**
- Consumes: Task 2 유틸(`text-on-desk-muted`·`text-ink-2`·`text-stamp-ink`·`font-mono`).
- Produces: 장부 트리의 종이 팔레트. LedgerPanel(결말)·ReceivingPhase(명랑 장부)가 이 컴포넌트를 공유하므로 두 곳 동시 정합.

- [ ] **Step 1: 클래스 교체**

`SegmentTree.tsx`의 zinc/red 유틸을 토큰 유틸로. 트리는 종이 위 기록이므로 잉크 팔레트 + 금액은 mono tabular.

| 현재(줄) | 교체 |
|---|---|
| `text-zinc-600`(11) | `text-ink-2` (종이 위 라벨) |
| `text-zinc-500`(13) | `text-ink-2` |
| 금액 span(17-19) `text-red-400`/`text-zinc-300` | `text-stamp-ink`(적자)/`text-ink`(흑자·비적자), 그리고 span에 `font-mono` 추가 |

교체 후 17-21행:
```tsx
          <span
            className={`font-mono tabular-nums ${s.profitBillions < 0 ? "text-stamp-ink" : "text-ink"}`}
          >
            {formatSignedBillions(s.profitBillions)}
          </span>
```
(11행 "부문 손익" 라벨: `className="text-xs uppercase tracking-widest text-ink-2"`. 13행 컨테이너: `text-ink-2`.)

- [ ] **Step 2: 게이트**

Run: `npx tsc --noEmit` → 0 · `npm test` → green

- [ ] **Step 3: 프리뷰**

preview_start → 결말(Epilogue)까지 진행하거나 LedgerPanel이 뜨는 지점에서 부문 손익 트리가 종이 잉크(적자=stamp-ink)로 렌더되는지 확인. (SegmentTree 자체는 종이 카드 안에 들어가므로 Task 6에서 완성 맥락.)

- [ ] **Step 4: 커밋**

```bash
git add src/components/SegmentTree.tsx
git commit -F .commit-msg-tmp   # feat(design): SegmentTree 장부 트리 종이 토큰화
```

---

### Task 5: TransferRound 리스킨 + 카피 3건 (테마 원형)

**Files:**
- Modify: `src/components/TransferRound.tsx` (지면=desk / 카드=paper-card / 시계=mono alarm + motion-reduce / 통화·로그=mono 잉크 / 거절 배지=도장 / 병원명=serif / 카피: 이모지 제거·`다시 걸기`)

**Interfaces:**
- Consumes: Task 2 유틸 + `.paper-card`, Task 1 폰트.

- [ ] **Step 1: 지면·글로우 (83-89행)**

`<main>` 클래스에서 `text-zinc-100`→`text-on-desk`, 위급 배경을 `--shadow-alarm` 토큰으로:
```tsx
    <main
      className={`mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 bg-desk px-5 py-8 text-on-desk transition-shadow duration-500 ${
        alarming ? "shadow-[inset_0_0_120px_rgba(143,26,23,0.35)]" : ""
      }`}
    >
```

- [ ] **Step 2: 골든타임 헤더 + motion-reduce (91-100행)**

라벨 `text-zinc-500`→`text-on-desk-muted`; 시계 `font-mono` 유지, `text-red-500`→`text-alarm`, `animate-pulse`에 `motion-reduce:animate-none` 병기, 평상값 `text-zinc-100`→`text-on-desk`:
```tsx
      <header className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-[0.25em] text-on-desk-muted">골든타임</span>
        <span
          className={`font-mono text-4xl font-bold tabular-nums ${
            lowTime ? "animate-pulse motion-reduce:animate-none text-alarm" : "text-on-desk"
          }`}
        >
          {formatClock(timer.remainingSeconds)}
        </span>
      </header>
```

- [ ] **Step 3: 환자 카드 → 종이 (102-111행)**

`rounded-lg border border-zinc-800 bg-zinc-900/60` → `.paper-card p-4`; 아이브로우 `text-red-400`→`text-stamp-ink`; 제목에 `font-serif`(판정); 본문 `text-zinc-400`→`text-ink-2`, 강조 `text-zinc-200`→`text-ink`:
```tsx
      <section className="paper-card p-4">
        <p className="text-xs uppercase tracking-widest text-stamp-ink">응급 환자 도착</p>
        <h1 className="mt-1 font-serif text-lg font-semibold text-ink">
          급성 심근경색(STEMI) 의심 · 중증도 {patient.severity}/5
        </h1>
        <p className="mt-1 text-sm text-ink-2">
          필요 진료과: <span className="text-ink">{SPECIALTY_LABEL[patient.requiredSpecialty]}</span> · 즉시 전원 필요
        </p>
      </section>
```

- [ ] **Step 4: 통화 내용 → 종이 위 모노 기록 + 이모지 제거 (113-121행)**

박스를 `.paper-card`로, 텍스트를 `font-mono` 잉크로, 이모지(🗣️/📞)를 활자 마커(`발신`/`수신`)로. 담당자 대사는 명조 판정이 아니라 기록이므로 mono 유지(대사 자체는 사람 말이나, 이 화면에선 "통화 기록"이라 기계 로그 레지스터로 통일):
```tsx
      <div className="paper-card min-h-[4.5rem] p-4 font-mono text-sm leading-6">
        {lastPlea && <p className="text-ink-2">발신 &gt; 나: “{lastPlea}”</p>}
        {lastLine ? (
          <p className={lastPlea ? "mt-1 text-ink" : "text-ink"}>수신 &lt; 담당자: “{lastLine}”</p>
        ) : (
          !lastPlea && <span className="text-ink-3">병원에 전화를 돌려 전원을 요청하세요.</span>
        )}
      </div>
```

- [ ] **Step 5: 설득 입력 (123-132행)**

desk 위 조작 UI(고딕 유지). `border-zinc-700 bg-zinc-900 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus-visible:ring-zinc-400` → `border-frame bg-desk-2 text-on-desk placeholder:text-on-desk-muted focus:border-border-paper focus-visible:ring-border-paper`. 도움말 `text-zinc-600`→`text-on-desk-muted`. **placeholder 문자열은 그대로**(§8-B).

- [ ] **Step 6: 병원 리스트 + 도장 배지 + `다시 걸기` (134-160행)**

버튼은 desk 조작면(`border-frame bg-desk-2`, hover `hover:border-alarm/60 hover:bg-desk` , ring `focus-visible:ring-border-paper`). 병원명 `font-serif`. 거절 사유 배지를 **도장**으로(`bg-stamp-field text-stamp-ink border border-stamp rounded-stamp`). 액션 라벨 `다시 매달리기`→`다시 걸기`(155):
```tsx
              className="flex items-center justify-between rounded-paper border border-frame bg-desk-2 px-4 py-3 text-left transition-colors hover:border-alarm/60 hover:bg-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-paper"
```
```tsx
              <span className="font-serif font-medium text-on-desk">
                {h.name}
                {last && !last.accepted && last.reason && (
                  <span className="ml-2 rounded-stamp border border-stamp bg-stamp-field px-1.5 py-0.5 text-xs text-stamp-ink">
                    {REJECTION_LABEL[last.reason]}
                    {count > 1 && ` ×${count}`}
                  </span>
                )}
              </span>
              <span className="text-xs text-on-desk-muted">
                {count === 0 ? "전원 콜" : "다시 걸기"}
              </span>
```
(주석 133-134행의 "다시 매달릴 수 있다"도 "다시 걸 수 있다"로 정리.)

- [ ] **Step 7: 거절 로그 → 모노 기록 (162-181행)**

`text-zinc-500`→`text-on-desk-muted`; 판정색 `text-emerald-400`/`text-red-400`→`text-go`/`text-alarm`(desk 위이므로 밝은 alarm). 로그 목록에 `font-mono tabular-nums` 추가:
```tsx
        <section className="font-mono text-xs text-on-desk-muted">
          <p className="mb-1 uppercase tracking-widest">전원 시도 {state.attempts.length}회</p>
          <ul className="flex flex-col gap-1 tabular-nums">
            {state.attempts.map((a, i) => (
              <li key={i} className="flex justify-between">
                <span>{nameById.get(a.hospitalId)}</span>
                <span className={a.verdict.accepted ? "text-go" : "text-alarm"}>
                  {a.verdict.accepted ? "수용" : a.verdict.reason ? REJECTION_LABEL[a.verdict.reason] : "거절"}
                </span>
              </li>
            ))}
          </ul>
        </section>
```

- [ ] **Step 8: 게이트 + 프리뷰**

Run: `npx tsc --noEmit` → 0 · `npm test` → green
preview_start → 전원 협상 화면 진입 → 확인: 어두운 desk 지면, 종이 환자/통화 카드, mono alarm 시계(30초↓ 맥동, `resize_window`로 reduced-motion에선 정지), 거절 도장 배지, `다시 걸기` 라벨, 이모지 없음. `computer` 스크린샷으로 증거 첨부.

- [ ] **Step 9: 커밋**

```bash
git add src/components/TransferRound.tsx
git commit -F .commit-msg-tmp   # feat(design): TransferRound 의무기록 테마 리스킨 + 카피 3건
```

---

### Task 6: Epilogue + Receipt 물성 (정점 — 결말 영수증/장부)

**Files:**
- Modify: `src/components/Receipt.tsx` (영수증 → 종이 물성 최대)
- Modify: `src/components/Epilogue.tsx` (지면·헤드라인·버튼 토큰화 — **서술 카피 문자열은 불변**)
- (LedgerPanel은 Plan B. Epilogue는 LedgerPanel을 소비만.)

**Interfaces:**
- Consumes: Task 2 유틸·`.paper-card`, Task 4 SegmentTree(장부).

- [ ] **Step 1: Receipt → 종이 영수증 (Receipt.tsx 전체)**

머리말 `text-zinc-600`→`text-ink-2`; 본체 `rounded-lg border border-zinc-800 bg-black/40`→`.paper-card`; 라벨 `text-zinc-400`→`text-ink-2`, 값 `text-zinc-100`→`text-ink`(mono 유지); 소계 트리 `text-zinc-500`→`text-ink-2`; 절취선 `border-zinc-800/80`→`border-rule border-dashed`. 예:
```tsx
      <div className="flex flex-col gap-2 paper-card px-5 py-4 font-mono text-sm">
```
값 span들: `text-zinc-100`→`text-ink`, 라벨 span들: `text-zinc-400`→`text-ink-2`, 브레이크다운 컨테이너 `text-zinc-500`→`text-ink-2`, 구분선 `<div className="my-1 border-t border-dashed border-rule" />`.

- [ ] **Step 2: Epilogue 지면·헤드라인·버튼 (Epilogue.tsx 시각만)**

`<main>` `text-zinc-100 bg-zinc-950`→`text-on-desk bg-desk`. 결말 배지 `text-zinc-500`/`text-red-500/80`→`text-on-desk-muted`/`text-alarm`. 헤드라인 `text-zinc-100`/`text-red-500`→`font-serif` + `text-on-desk`/`text-alarm`(헤드라인=판정이므로 명조). 부제 `text-zinc-400`→`text-ink-2`? — 부제는 desk 위이므로 `text-on-desk-muted`. 버튼 `border-zinc-700 text-zinc-100 hover:bg-zinc-800 focus-visible:ring-zinc-400`→`border-frame text-on-desk hover:bg-desk-2 focus-visible:ring-border-paper`. 고지문 `text-zinc-600`→`text-on-desk-muted`.

⚠️ **`title`·`subtitle` 문자열(24-33행)은 절대 수정 금지** — 시각 클래스만. 예:
```tsx
        <p className={`font-serif text-2xl font-bold ${survived ? "text-on-desk" : "text-alarm"}`}>
          {title}
        </p>
        <p className="text-sm text-on-desk-muted">{subtitle}</p>
```

- [ ] **Step 3: 게이트 + 프리뷰**

Run: `npx tsc --noEmit` → 0 · `npm test` → green
preview_start → 한 판 완주해 결말 도달(시드 고정 폴백) → 영수증이 종이 물성으로, 장부 트리(Task 4) 정합, 첫 붉은 잉크(적자=stamp-ink)가 여기서 터지는지 확인. 스크린샷 증거.

- [ ] **Step 4: 커밋**

```bash
git add src/components/Receipt.tsx src/components/Epilogue.tsx
git commit -F .commit-msg-tmp   # feat(design): 결말 영수증·장부 종이 물성 (정점)
```

---

## Plan A 완료 후

- **작업추적 3종 갱신**: `plan.md`에 "디자인 테마 롤아웃(Plan A)" 항목 ✅ + `changeLog.md` 한 줄(날짜·PR#) + (1분+ 디버깅 시) `troubleshooting/`.
- **PR 올리고 머지 여부 질의**(글로벌 워크플로우).
- **후속 Plan B**: 나머지 화면(Landing·SetupWizard·ReceivingPhase[콜접수 종이 절제]·DayEnd[달력=종이]·Interstitial[종이 0·이모지 제거]·InHouseEmergency·LedgerPanel) 기계적 토큰 교체 — 별도 계획으로 작성. Interstitial·ReceivingPhase의 🎉 제거는 Plan B에 포함.

---

## Self-Review (스펙 대비)

- **§2 색 토큰** → Task 2 전량 반영(★조정값 포함). ✅
- **§3 타이포/Arial** → Task 1. ✅
- **§4 물성·모션** → Task 2(.paper-card·shadow) + Task 5 Step 2(motion-reduce·glow 0.35). ✅
- **§5 컴포넌트 규칙(paper-card·도장·모노 로그·serif 병원명)** → Task 4·5·6. ✅
- **§6 전 화면 매핑** → 원형(TransferRound)·정점(Epilogue) = Plan A / 나머지 = Plan B(명시). ✅
- **§7 접근성(색-단독 회피·reduced-motion)** → Task 5(도장+텍스트, motion-reduce). 흑백 판정 가독은 프리뷰 검증. ✅
- **§8-A 카피** → 이모지(dialogue=Task 3 / 컴포넌트=Task 5 부분·나머지 Plan B) · `다시 걸기`(Task 5) · motion-reduce(Task 5). ✅
- **§8-B 서술 카피** → Task 6에서 명시적 불변(Epilogue 문자열 보존). ✅
- **§10 게이트(tsc+vitest+preview)** → 모든 태스크 검증 단계에 포함. ✅
- **Placeholder 스캔**: TBD/TODO 없음. 각 리스킨 스텝에 실제 클래스 문자열 명시. ✅
- **타입 정합**: 새 함수·시그니처 신설 없음(순수 클래스/토큰 교체 + dialogue 상수). ✅
