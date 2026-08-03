---
tags:
  - type/plan
---

# 채용 패널 그래픽 재설계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development로 태스크별 실행.
> 스펙: [2026-08-03-hire-panel-graphics-design.md](../specs/2026-08-03-hire-panel-graphics-design.md) (사용자 승인 2026-08-03)

**Goal:** 채용 패널을 "종이 명부 + 빈 자리" 콘셉트로 재설계하고 초상 변주를 12→36조합으로 늘린다. 시뮬 무변.

**Architecture:** 표시 층 2파일이 중심 — `PixelSprite.tsx`(머리 모양 축 추가) · `HirePanel.tsx`(종이 카드·잔상 프레임) + 호출부 `SimGame.tsx`(consumed prop) + 규약 문서 개정.

**Tech Stack:** React 19 · Tailwind 4(기존 paper/ink 토큰) · vitest.

---

### Task 1: PixelSprite — 머리 모양 변주 + 규약 개정

**Files:**
- Modify: `src/components/PixelSprite.tsx` (`spriteVariant`, `Figure` 머리카락 렌더)
- Test: `src/components/pixelSprite.test.ts` (기존 파일에 추가)
- Modify: `docs/concept/character-design.md` §1 (규약 개정 한 줄 + 사유)

- [ ] **1-1 실패 테스트 먼저**: `spriteVariant` 반환에 `hairStyle`이 있고 `{0,1,2}` 범위·결정론(같은 키 → 같은 값)·축 독립(`u%4`·`(u/7)%3`·`(u/29)%3` — 스타일이 다른데 hair가 같은 실례 키 2개를 픽스처로). Red 확인.
- [ ] **1-2 구현**: `spriteVariant` → `{ hair, skin, hairStyle }` (`hairStyle = Math.floor(u / 29) % 3`). `Figure`에 `hairStyle` prop — 머리카락 path 3종: ⓪ 현행 아치 그대로 ① 가르마(호 좌우 비대칭 분할) ② 짧은 올림(호 높이 축소·이마 라인 상향). **얼굴 특징 금지·몸 실루엣 무변·그라디언트 금지.** 끝점은 머리 타원(cx8 cy4 rx2.9 ry3.1) 위 좌표로 계산해 정수리 잉크가 깎이지 않게(현행 주석 계약).
- [ ] **1-3 Green + 전체 테스트**: `npm run test` 전원 통과(기존 `DoctorSprite`/`NurseSprite` 호출부는 시그니처 무변이라 안 깨져야 정상).
- [ ] **1-4 시각 검증**: 3 스타일 × 몇 조합을 실제 렌더해 스크린샷·판독 — 스타일이 서로 구분되는지, 우연한 눈/표정으로 읽히는 픽셀이 없는지(160px 확대 실측 — character-design.md가 실측을 요구하는 이유).
- [ ] **1-5 규약 개정**: character-design.md §1 "팔레트만 다르다" 항목을 "몸 실루엣 공유(주제 근거 무변) · 변주 = 팔레트 + 머리카락 형태 3종"으로 + 사유(18명 명부 대형 초상에서 12조합 반복 실측 · 2026-08-03 사용자 결정).
- [ ] **1-6 커밋** (T-026 절차).

### Task 2: HirePanel — 종이 카드 + 빈 자리 + 호출부

**Files:**
- Modify: `src/components/HirePanel.tsx`
- Modify: `src/components/SimGame.tsx` (`consumed` prop 전달 — `hiredSlots`를 `candidateOf`로 매핑)
- Test: HirePanel 기존 테스트 파일에 추가

- [ ] **2-1 실패 테스트 먼저**: ① 열 렌더 자리 수 = `candidates[d].length + consumed[d].length` ② 빈 프레임(소비 슬롯)에 채용 버튼 없음 + 그 후보 이름 표시 ③ 기존 테스트(슬롯 채용 클릭·게이트·빈 과 문구·「이게 전부입니다」) 무변. Red 확인.
- [ ] **2-2 구현**: 스펙 §1·§2 그대로 —
  - props에 `consumed: Record<SimDeptKey, Candidate[]>` 추가, SimGame이 `world.hiredSlots`→`candidateOf` 매핑으로 내려줌(화면이 세지 않는다).
  - 후보 카드 = `.paper-card` + 초상 스테이지(과 색 워시 12~18% 알파 + `DoctorSprite` 64~72px) + ink 계열 텍스트 + 종이 위 채용 버튼(hover 어둡게만 — T-142).
  - 빈 프레임 = dashed `border-border-paper` + 잉크 단색 실루엣 초상(opacity ≈0.25) + `text-ink-3` 이름. 문구·버튼 없음.
  - 열 헤더 과 색 언더라인 2px. 간호사 줄·하단 바·개원 버튼 desk 톤 무변.
- [ ] **2-3 Green + 전체 테스트** + 대비 확인: ink/paper 4.5:1을 기존 팔레트 테스트가 잠그는지 확인, 없으면 한 줄 추가.
- [ ] **2-4 브라우저 실측**: dev 서버에서 스타팅 게이트(만석)·중반 판(빈 자리 누적: 채용 몇 명 후 재오픈) 두 상태 스크린샷 판독 — 종이 질감·워시·잔상이 스펙대로인지, 2열/1열 반응형이 안 깨지는지.
- [ ] **2-5 커밋**.

### Task 3: 문서 세트 + 최종 리뷰 + PR

- [ ] plan.md 해당 항목 ✅ / changeLog 항목 신설 / 구조적 문제 분류표 확인(해당 없음이면 통과) / 1분+ 디버깅 트랩 있으면 T-### 신설
- [ ] reviewer 서브에이전트 최종 리뷰(스펙 준수 + 품질 — 보고 불신·코드 실측)
- [ ] PR 생성 → 사용자 머지 결정 대기

## Self-review

- 스펙 전 절 커버: §1→2-2, §2→2-1·2-2, §3→1-*, §4→1-1·2-1·2-3, §5(범위 밖) 침범 없음 ✓
- 타입 일관: `consumed`는 `candidates`와 같은 `Record<SimDeptKey, Candidate[]>` ✓
- 머리카락 path 좌표는 예술 판단이라 코드로 선기술하지 않는다 — 1-4 시각 검증이 그 자리를 잠근다(의도적 결정).
