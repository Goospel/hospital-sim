# 랜딩 타이틀 카드 — 설계 (2026-07-17)

> 게임의 **첫 화면**. 지금은 URL 진입 시 위저드(채용)가 바로 뜬다. 그 앞에 다크 지면 타이틀 카드를
> 세워, 사용자가 처음 보는 화면이 되게 한다. 원본 `97a012c`("수화기 너머의 벽" 랜딩)의 느낌을
> 되살리되, 그 사이 게임이 전원 협상 → **병원 경영 전체 아크**로 커진 걸 반영해 카피를 재프레이밍한다.

## 결정 사항

- **카피 방향**: 현재 게임에 맞춰 재프레이밍(제목·다크 톤·"구조" 논지는 원본 유지). — 사용자 확정.
- **구조상 위치**: `LANDING`을 세션 페이즈로 **승격**(UI 전용 boolean 아님). 이 레포는 모든 상태
  전이를 결정론 순수 함수로 TDD하는 코드베이스라, 랜딩만 페이즈 밖 예외로 두는 건 결이 어긋난다.

## 카피 (확정)

```
[EYEBROW]  대한민국 의료 시스템 시뮬레이션
[제목]      수화기 너머의 벽
[태그라인]  병원을 세우고, 환자를 받고, 그 대가를 치른다.
           최선을 다해도 결과를 정하는 건, 당신이 아니라 구조다.
[CTA]       시작
[FOOTER]    NAN 2026 · 프로토타입
```

- 원본 척추 "당신의 실력이 아니라 구조다" → "당신이 아니라 **구조**다"로 유지(강조 span).
- 태그라인이 전체 아크를 예고: **세우고**=채용, **받고**=콜큐/응급, **대가를 치른다**=영수증 결말.

## 아키텍처 — `session.ts` (순수 · TDD)

- `SessionPhase`에 `'LANDING'` 추가(유니온 맨 앞).
- `startSession()` → `{ phase: 'LANDING' }` (기존 `{ phase: 'SETUP' }`에서 변경).
- 신규 전이 `beginSetup(state)`: 가드 `phase==='LANDING'`(아니면 throw) → `{ phase: 'SETUP' }`.
- **재시작**: Epilogue "다시"는 `startSession()`을 그대로 호출하므로 자동으로 랜딩으로 리셋된다
  (단일 진입점 = `startSession`).

## 컴포넌트 — `Landing.tsx` (`"use client"`)

- props: `{ onStart: () => void }`.
- 원본과 동일한 다크 지면·중앙 정렬(`bg-zinc-950`, flex center). 통일 시각 지면과 일치.
- **CTA는 emerald**(`bg-emerald-600`) — 확립된 초록(1막 유혹)→빨강(응급) 아크의 시작점, 위저드 CTA와 동색.
- 마운트 시 은은한 fade-in 1회, `prefers-reduced-motion: reduce` 존중(Interstitial `motion-reduce:` 패턴 재사용).

## 배선 — `SessionClient.tsx`

- `switch(session.phase)`에 `case "LANDING"` 추가 → `<Landing onStart={() => setSession(beginSetup(session))} />`.
- exhaustive `never` 스위치가 누락을 `tsc`에서 잡는다(타입 게이트).

## 테스트

- **로직(TDD, session.test.ts)**: `startSession().phase==='LANDING'` / `beginSetup` LANDING→SETUP /
  가드(비-LANDING 입력 throw). RED→GREEN.
- **컴포넌트**: React 테스트 인프라 없음 → 브라우저 프리뷰로 렌더 + "시작"→위저드 진입 확인.
- **게이트**: `tsc --noEmit` 0 · 전체 vitest green.
