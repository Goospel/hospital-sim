---
tags:
  - type/spec
---

# 디자인 테마 — 설계: "의무기록·차트 도시에" (medical dossier) (2026-07-18)

> 게임 전체의 **시각 테마**를 확정하고 토큰화한다. 지금까지 11개 컴포넌트가 zinc/emerald/red Tailwind 유틸을 인라인으로 흩뿌려 써 단일 출처가 없었다. 이 스펙은 그걸 **의무기록·차트 물성**의 디자인 시스템(색·타이포·물성·모션 토큰 + 컴포넌트 규칙 + 전 화면 적용)으로 정리한다.
> 관련: [game-concept §6 톤](../../../docs/concept/game-concept.md) · [landing-title-card 설계](2026-07-17-landing-title-card-design.md) · [plan.md](../../plan.md)

---

## 0. 확정 결정 (이 세션에서 잠금)

- **테마 방향**: 5개 방향(관제 모니터 / 의무기록·차트 / 강철·형광등 / 고대비 잉크 / 소모 대시보드)을 생성·적대 심사한 뒤, 사용자가 ④ 고대비 잉크(DD 최근접)까지 렌더로 확인하고 **② 의무기록·차트 도시에**를 선택. DD(Darkest Dungeon)의 무게·소모의 가시화·손맛 판넬을 **실제 임상 서류의 물성**으로 번역하되, 내레이터(해석 카피)는 버린다.
- **작업 범위 = 시각 + "안전한" 카피만**. 시각 토큰·서체·물성·모션은 전부 포함. 카피는 **이모지 제거 · `다시 매달리기`→`다시 걸기` · 모션 접근성 수정**까지만. **서술 카피 재작성(랜딩 태그라인·에필로그 서술·placeholder·헤드라인 능동/피동·기관명 가공)은 이 작업 밖 → 별도 "카피/톤" 세션**으로 보존(§8-B).
- **1막 종이 강도 = 절제**. 종이는 "기록"의 은유 → 1막(콜 접수)은 desk 조작면 위주로 종이를 아끼고, **결말(영수증·장부)에 물성을 집중**. 명암 낙차의 임팩트를 결말에 몰아줌.
- **기본값으로 확정한 것**(이견 시 조정): 실서체는 전부 **self-host**(CSP·오프라인 확실) · `on-desk-muted` 소형 라벨 **최소 12px**(그 이하엔 미사용) · DayEnd 달력은 **종이**(1막의 유일한 종이 기록).

---

## 1. 테마 정체성 + 원칙

**한 줄 정체성:** 어두운 책상 위에 놓인 밝은 마닐라 차트 — "이미 판정·기록된 것"은 종이에 얹고, "지금 조작하는 손"은 어두운 데스크에 둔다.

**4대 원칙:**
1. **2-표면 구도.** `all-dark zinc` 단일 지면 → **desk(어두운 조작면) + paper(밝은 기록면)**. 토큰이 두 대비 세계로 갈린다 — 지면 위에서 읽는 색과 종이 위에서 읽는 색은 서로 다른 규칙을 따른다.
2. **물성 = 역할, 서류 감성 ≠ 목표.** 종이·도장·모노는 다큐 무게를 나르는 장치지 빈티지 소품이 아니다. 질감·회전·필터로 "낡은 종이 감성"에 미끄러지는 순간 무게가 증발한다(§8-A 키치 방어).
3. **show-don't-tell 정합.** 색·서체·숫자·도장은 사실을 *보여줄* 뿐, 해석·교훈·감정을 *말하지* 않는다.
4. **어두운 책상 + 밝은 종이.** 이 명암 낙차 자체가 정보다 — 종이가 뜨고, 도장이 찍히고, 결말 장부에서 처음 붉은 잉크가 터진다.

---

## 2. 색 토큰 (최종 확정 — 대비 통과값)

**상충 해소:** 목업 원시 hex 중 4개를 WCAG 대비 감사 결과로 **하향 조정**(ink-2·go·ink-3 역할 축소·glow alpha). 나머지는 감사 통과라 목업값 유지.

### 2-A. 다크 지면군 (desk)

| 토큰 | 최종 hex | 용도 | 대비 판정 |
|---|---|---|---|
| `--desk` | `#101014` | 지면 바닥(`<main>`, 현 `bg-zinc-950` 대체) | 지면 자체 |
| `--desk-2` | `#17171c` | 지면 위 뜬 패널/로그 영역 | 지면 자체 |
| `--frame` | `#26262c` | 종이 바깥 프레임선·지면 구분선 | 장식 |
| `--on-desk` | `#d8cfaf` | 지면 위 주 텍스트·시계 평상값 | 밝은 회백 on 근흑(추정 통과) |
| `--on-desk-muted` | `#7a7460` | 지면 위 uppercase 보조 라벨 | **소형(<12px) 라벨엔 미사용** |
| `--alarm` | `#e5484d` | 골든타임 시계 경보·"응급 환자 도착" | **AA ✅** desk 4.85 / desk-2 4.56 — 소형 축소 렌더 금지 |

### 2-B. 라이트 종이군 (paper)

| 토큰 | 최종 hex | 용도 | 대비 판정 |
|---|---|---|---|
| `--paper` | `#e5dcc4` | 마닐라 표면(그라디언트 상단) | 종이 밝은쪽 |
| `--paper-2` | `#d3c6a3` | 그라디언트 하단 | 종이 어두운쪽 |
| `--paper-edge` | `#c4b58f` | 접힘·그늘 가장자리, 소구획 배경 | 장식 |
| `--border-paper` | `#a2966f` | 종이 테두리 | 비텍스트 2.16 ✗ → **음영으로 구분** |
| `--rule` | `#b0a37e` | 괘선·규칙선 | 비텍스트 1.83 ✗ → 순수 장식만 |
| `--ink` | `#26221a` | 본문 잉크(제목·병원명·본문) | **AAA ✅** 11.59 / 9.33 |
| `--ink-2` | **`#585039`** ⬅ 조정 | 보조 본문·설명·소형 본문 | **AA ✅** light 5.9 / dark 4.7 (원 `#5b5340`은 dark 4.49 경계미달) |
| `--ink-3` | `#7d7358` | **대형 장식 글자·×N 부기만** | 소형 본문 3.44/2.77 ✗ — **소형엔 ink-2** |
| `--stamp` | `#8f1a17` | 거절 도장 테두리 | 비텍스트 6.60 ✅ |
| `--stamp-ink` | `#7a1414` | 도장 글자·**종이 위 손실(적자)** | **AAA/AA ✅** 7.93 / 6.39 / field 7.84 |
| `--stamp-field` | `#e9d9c4` | 사유 배지 바탕 | 종이 위 필드 |
| `--go` | **`#1b5e3d`** ⬅ 조정 | 수용·흑자 초록잉크 | **AA ✅** light 5.7 / dark 4.55 (원 `#1f6b46`은 dark 3.81 소형미달) |

**조정 근거(대비감사 우선):** ink-2 `#5b5340→#585039`(어두운쪽 4.49→4.7) · go `#1f6b46→#1b5e3d`(3.81→4.55) · ink-3는 값 유지하되 **역할 축소**(소형 본문 금지, ink-2로 통합) · border/rule은 3:1 미달이나 마닐라 톤을 지키려 **색 대비 대신 데스크와의 명암차(그림자)로 경계**.

### 2-C. emerald/red 아크 매핑 (밝기 맥락으로 분리)

**규칙: 어두운 지면 위 붉은색 = `--alarm`(밝음) / 밝은 종이 위 붉은색 = `--stamp` 계열(어두움). 섞지 않는다.**

| 기존 유틸 | 역할 | 새 토큰 | 근거 |
|---|---|---|---|
| `text-emerald-*` | 흑자·수용(go) | `--go` `#1b5e3d` | 형광 초록 → 종이 위 손글씨 흑자잉크 |
| `text-red-500`(시계) | 골든타임 경보 | `--alarm` `#e5484d` | desk 위 유일한 붉은색, 밝아야 빛남 |
| `text-red-400`·`bg-red-950`(배지·손실) | 거절·적자 | `--stamp`/`--stamp-ink`/`--stamp-field` | 종이 위 어두운 고무도장 |

---

## 3. 타이포

### 3-A. 3계층 역할 (강제 — 글자마다)

| 토큰 | 프로덕션 서체 | 역할("누가 썼나") | 어디에 |
|---|---|---|---|
| `--font-serif` | **Noto Serif KR** | 사람이 쓴 **판정** | 환자 진단명·병원명·도장 글자·결말 헤드라인·담당자 대사 |
| `--font-sans` | **Pretendard** | 지금 조작하는 **UI** | 버튼·입력·헤더 라벨·도움말·사유 배지 라벨 |
| `--font-mono` | **D2Coding** | 기계가 찍은 **기록** | 시계·접수번호·금액·통화기록·거절로그·×N (전부 `tabular-nums`) |

### 3-B. 타입 스케일 (실사용처 기반, 과설계 금지)

| 스텝 | px/lh | weight | tracking | 계층 | 사용처 |
|---|---|---|---|---|---|
| `--text-clock` | 36/1.0 | 700 | tabular | mono | 골든타임 시계 |
| `--text-amount` | 30/1.1 | 600 | tabular | mono | DayEnd 손익 금액 |
| `--text-display` | 24/1.25 | 600 | -0.01em | serif | "어떤 병원을 세우시겠습니까" |
| `--text-title` | 18/1.4 | 600 | -0.005em | serif | 차트 제목·병원명 |
| `--text-body` | 14/1.55 | 400 | 0 | sans | 본문·설명 |
| `--text-aux` | 12/1.4 | 400/500 | 0 | sans/mono | 배지·부기·로그 |
| `--text-label` | 12/1.4 | 500 | 0.25em(caps) | sans | "골든타임"·"병원 설립" 라벨 |
| `--text-caption` | 10/1.3 | 600 | 0.05em | mono | 달력 요일·숫자 |

### 3-C. 로딩 전략 + 한글 소형 가독성 + Arial 버그

- **전부 self-host**(확정): Pretendard·D2Coding·Noto Serif KR을 `next/font/local`(variable/subset woff2, `display:swap`). CDN 금지(CSP·FOUT).
- **Noto Serif KR(명조)은 소형에서 획이 얇아 한글 가독 급락** → serif는 `--text-title`(18px) 이상 판정문에만. 이 하한이 역할 분리와 자연 일치.
- **D2Coding 하나**로 한글+latin+등폭+tabular 커버 — JetBrains Mono 불필요(통화기록·거절로그가 한글이라 latin 전용 mono로 못 덮음).
- 폴백: `--font-mono:"D2Coding",ui-monospace,monospace` / `--font-serif:"Noto Serif KR",serif` / `--font-sans:"Pretendard",system-ui,sans-serif`.
- **⚠️ Arial 버그(필수 수정):** 현 `body{font-family:Arial}`가 `@theme`의 `--font-sans`를 무력화 → 한글이 의도 서체 없이 시스템 폴백. **`Arial` 줄 삭제 → `var(--font-sans)`**. `layout.tsx`의 Geist 2종 제거하고 `next/font`로 3계층 변수를 `<html>`에 바인딩.

---

## 4. 간격·라운드·그림자·모션 토큰

종이와 지면의 **높이차**를 라운드·이너하이라이트·드롭섀도 3종으로 표현(빈티지 아니라 "책상에 놓인 실제 서류").

| 토큰 | 값 | 용도 |
|---|---|---|
| `--radius-paper` | `2px` | 종이 카드·배지(현 `rounded-lg` 8px 대체 — 서류는 거의 직각) |
| `--radius-stamp` | `1px` | 도장 배지 |
| `--shadow-paper` | `0 1px 1px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.45)` | 종이가 desk에서 뜨는 드롭섀도 |
| `--paper-highlight` | `inset 0 1px 0 rgba(255,255,255,.35)` | 종이 윗변 이너하이라이트(물성 핵심) |
| `--shadow-alarm` | `inset 0 0 120px rgba(143,26,23,.35)` ⬅ 조정 | 저시간 지면 글로우(alpha 0.4→**0.35 상한**) |

- 카드 = `linear-gradient(--paper,--paper-2)` + `--paper-highlight` + `--shadow-paper` 3종 세트 = "마닐라 한 장".
- **간격 스케일은 Tailwind 기본(0.25rem step) 재사용** — 새로 만들지 않음.

**모션 규칙(톤가드 확정):**
1. 맥동/글로우는 **30초 임계 이하에서만**(현 `LOW_TIME_THRESHOLD=30` 준수) + **반드시 `motion-reduce`로 정지**.
2. 어두운 지면 위 붉은 글로우 **alpha ≤ 0.35** 단일 상한.
3. 무한 반복은 시계 pulse **하나만**. 도장 찍힘·카드 등장에 반복 모션 금지.
4. 시계 pulse는 opacity(밝기)만 — 붉은 채도까지 깜빡이게 하지 말 것(발작 회피). **단 카운트다운 숫자 갱신은 정보이므로 유지**, 시각 진동만 끔.

---

## 5. 컴포넌트 규칙 (재사용)

- **`.paper-card`** (유틸 클래스 1개): `bg` 그라디언트 + `--paper-highlight` + `--shadow-paper` + `rounded-paper` + `border-border-paper`. 모든 종이 표면의 단일 출처.
- **도장 배지**: `bg-stamp-field text-stamp-ink border-stamp` + `rounded-stamp`, 회전 **±3° 이내**, 잉크 alpha ≤ 0.9. **반드시 사유 텍스트 포함**(색맹 대응). 화면당 0~1종, 불가역 판정에만.
- **모노 로그**: 종이 위 `font-mono tabular-nums` 목록. 통화기록 마커는 이모지(🗣️/📞) 금지 → 활자 기호(`발신 >`/`수신 <` 또는 접수번호).
- **버튼**: desk 위 `font-sans`. 수용/개원 CTA = `bg-go`. 종이에 넣지 않음(조작 UI).
- **입력**: desk 위 `font-sans`. 입력된 병원명은 즉시 `font-serif` 렌더("사람이 쓴 판정").
- **SegmentTree**(공유): ├/└ = mono, 라벨 = sans caps, 금액 = mono tabular, 부호색 = `--go`/`--stamp-ink`. **이 하나만 종이 팔레트로 바꾸면 1막·결말 장부가 동시 정합 — DRY 지점.**

**인라인 → 토큰 교체(단일 출처 증명):**

| 현재 | 교체 |
|---|---|
| `bg-zinc-950` | `bg-desk` |
| 카드 `border-zinc-800 bg-zinc-900/60` | `.paper-card` |
| 시계 `text-zinc-100`/`text-red-500` | `text-on-desk`/`text-alarm` |
| 배지 `bg-red-950/60 text-red-400` | `bg-stamp-field text-stamp-ink` |
| 로그 `text-emerald-400`/`text-red-400` | `text-go`/`text-stamp-ink` |
| DayEnd 흑자/적자 | `text-go`/`text-stamp-ink` |
| `bg-emerald-600`(개원) | `bg-go` |
| `text-zinc-500` caps 라벨 | `text-on-desk-muted` + `--text-label` |

---

## 6. 전 화면 적용 매핑 (1막 절제 · 결말 집중)

**관통 규칙:** 종이 = "이미 기록된 것"에만. **조작 UI(버튼·입력·스텝퍼)는 전 화면 desk 위 고딕.** 도장 = 화면당 0~1종, 불가역 판정에만. **1막은 종이를 아끼고 결말에 물성을 몰아준다.**

| 화면 | 종이(기록) | 책상+고딕(조작) | 도장 | 명조=판정 |
|---|---|---|---|---|
| **랜딩** | 표지 1장(접수번호 모노로 물성) | 시작 CTA(`bg-go`) | 없음 | 제목만 |
| **위저드** | 예산 장부 1장만(채용비 합계=중립 사실, **부호 숨김**) | 과 카드·+/−스텝퍼·개원 | 예산초과 1 | 병원명 |
| **콜 접수** | **최소 — desk 위주.** 종이는 그날의 기록물(간단 전표) 1장까지 | 콜 결정·3버튼 | 하드락 1 | 진단명·병원명 |
| **하루 마감** | 달력 그리드 장부(1막의 핵심 종이 — 칸 색=종이 위 잉크) | 계속 버튼 | (주 마감만 극절제) | 요일 헤더 |
| **막간** | 종이 없음(연출에 자리) | 붕괴 연출이 주역 | 없음 | 응급 경보 |
| **원내 응급** | 처치 기록 1장 | 계속 버튼 | 생존=초록 사인 | 진단명·결과 |
| **전원 협상**(원형) | 차트·통화기록·거절로그 | 시계·입력·병원리스트 | 거절 사유(정본) | 진단명·병원명·대사 |
| **결말/영수증**【정점】 | 영수증(좁은 용지·절취선)·장부(적자 첫 실현) — **물성 최대 투자** | 헤드라인·재시작 | 사망 1(정점) | 헤드라인·병원명 |

**핵심 경계:** 콜 접수의 종이 도배 위험을 결정 영역 desk로 비워 회피. 막간은 종이를 빼 연출에 자리. **결말 영수증에 물성 최대 투자**(첫 붉은 잉크가 여기서 터짐).

---

## 7. 접근성

| 상태 | 항목 |
|---|---|
| **AAA ✅** | ink/paper(11.59·9.33), stamp-ink(7.93·6.39·7.84) |
| **AA ✅** | ink-2 조정후(5.9·4.7), go 조정후(5.7·4.55), alarm(4.85·4.56), stamp-border(6.60) |
| **수정 반영** | ink-3 소형 본문 금지→ink-2 통합, ink-2·go 하향, glow 0.4→0.35 |
| **음영 대체** | rule(1.83)·border(2.16) 비텍스트 3:1 미달 → 색 대신 데스크 명암차 |

**색-단독 신호 회피(코드 강제):**
- 거절: 도장 형태 + 사유 텍스트 + ×N — 도장은 반드시 글자 포함.
- 수용: go 단독 위험(초록↔stamp-red 색맹서 명도 수렴) → **체크/사인 + 텍스트 라벨** 병기.
- 위급: alarm 색 + 모노 카운트다운("00:14") — 색 없이도 읽혀야.
- **원칙: 색은 강조, 판정은 텍스트/도장/숫자. 흑백 스크린샷에서도 판정이 읽히는지가 최종 검증.**

**reduced-motion:** 시계 pulse `motion-reduce:animate-none`(현 미준수 1건 필수 추가), 도장·카드 슬라이드 정지. 카운트다운 숫자 갱신은 유지.

---

## 8. 카피 교정

### 8-A. 이 작업에 포함 (안전한 카피 + 톤가드)

| 위치 | 현재 → 교정 |
|---|---|
| `dialogue.ts:144`·`ReceivingPhase.tsx:96`·`Interstitial.tsx:82` (🎉), `TransferRound.tsx:115,117` (🗣️📞) | **이모지 전면 삭제.** 명랑은 go 초록+"흑자"가, 통화는 모노 마커가 대신 |
| `TransferRound.tsx:155` (+주석 :134) | `다시 매달리기` → **`다시 걸기`** (감정 대리서술 제거, 소모는 ×N·로그가 이미 보여줌) |
| `TransferRound.tsx:95` | 시계 pulse에 `motion-reduce:animate-none` 추가 |

> ⚠️ **테스트 결합(TDD 순서 주의):** `dialogue.test.ts:79,82`가 `COSMETIC_WALKIN` 대사에 `🎉` 포함을 **assert**한다 — `dialogue.ts:144`에서 이모지를 지우면 이 테스트가 red가 된다. 이모지 삭제 커밋에 **테스트 갱신을 같이** 넣어야 vitest green을 유지한다(§10 게이트). 다른 이모지 3곳(컴포넌트)은 React 테스트가 없어 프리뷰 검증.

**키치 방어 규칙(테마 규율):**
- **질감 상한:** paper 그라디언트에 노이즈·얼룩·커피링·세피아·빈티지 필터 **금지**. 물성은 색·1px edge·미세 그림자까지만.
- **회전/구겨짐 금지:** 스크랩북 연출 금지. 접수 서류는 반듯하다.
- **도장 남용 금지:** 판정 1건당 최대 1개. 접수번호·×N·시각은 모노 잉크(도장 아님). 수용을 초록 도장으로 축하하지 말 것.
- **명조 감성화 금지:** 판정·병원명·차트 제목에만. 도움말·버튼·카운트다운에 명조 쓰면 소설조.

### 8-B. 이 작업 밖 — 별도 "카피/톤" 세션으로 보존 (손대지 않음)

> 사용자 결정: 서술 카피 재작성은 게임 '내용' 변경이라 이 디자인 작업과 분리. **목록만 보존**해 잃어버리지 않게 한다.

- `Landing.tsx:32–34` 태그라인 둘째 문장 `최선을 다해도 결과를 정하는 건, 당신이 아니라 구조다.` — 게임 결론을 첫 화면이 대신 말하는 최대 누수 후보(삭제 검토).
- `Epilogue.tsx:31–33` `빠져나간 몫의 대가는…`/`그 대가도 내 몫이다` — 판정을 장부로 넘기는 사실 서술 검토.
- `Epilogue.tsx:24–28` 헤드라인 `환자를 살렸습니다`↔`환자는 살았다` 능동/피동 도덕 낙차 → `환자는 생존했다` 통일 검토.
- `TransferRound.tsx:128` placeholder `제발요…죽습니다…` → 플레이어 입에 감정 선점, 사실 안내로 검토.
- 기관명 `권역심혈관센터`류 실제 지정명칭 근접 → `광역순환기센터` 등 한 단계 더 가공 검토.

---

## 9. globals.css / layout.tsx 반영 개략 + 구현 순서

```css
@import "tailwindcss";

:root {
  /* 지면 */ --desk:#101014; --desk-2:#17171c; --frame:#26262c;
  --on-desk:#d8cfaf; --on-desk-muted:#7a7460; --alarm:#e5484d;
  /* 종이 (★=대비감사 조정값) */
  --paper:#e5dcc4; --paper-2:#d3c6a3; --paper-edge:#c4b58f;
  --border-paper:#a2966f; --rule:#b0a37e;
  --ink:#26221a; --ink-2:#585039; /*★*/ --ink-3:#7d7358;
  --stamp:#8f1a17; --stamp-ink:#7a1414; --stamp-field:#e9d9c4;
  --go:#1b5e3d; /*★*/
  /* 전역 = 지면 */ --background:var(--desk); --foreground:var(--on-desk);
  /* 물성 */ --radius-paper:2px; --radius-stamp:1px;
  --shadow-paper:0 1px 1px rgba(0,0,0,.5),0 6px 16px rgba(0,0,0,.45);
  --paper-highlight:inset 0 1px 0 rgba(255,255,255,.35);
  --shadow-alarm:inset 0 0 120px rgba(143,26,23,.35); /*★ 0.4→0.35*/
}

@theme inline {
  --color-background:var(--desk); --color-foreground:var(--on-desk);
  --color-desk:var(--desk); --color-desk-2:var(--desk-2); --color-frame:var(--frame);
  --color-on-desk:var(--on-desk); --color-on-desk-muted:var(--on-desk-muted);
  --color-alarm:var(--alarm);
  --color-paper:var(--paper); --color-paper-2:var(--paper-2); --color-paper-edge:var(--paper-edge);
  --color-border-paper:var(--border-paper); --color-rule:var(--rule);
  --color-ink:var(--ink); --color-ink-2:var(--ink-2); --color-ink-3:var(--ink-3);
  --color-stamp:var(--stamp); --color-stamp-ink:var(--stamp-ink); --color-stamp-field:var(--stamp-field);
  --color-go:var(--go);
  --font-serif:var(--font-noto-serif-kr);
  --font-sans:var(--font-pretendard);
  --font-mono:var(--font-d2coding);
  --radius-paper:var(--radius-paper);
}

html { color-scheme: dark; }            /* 지면은 여전히 어둡다 — 유지 */
html, body { background:var(--desk); color:var(--on-desk); }
body { font-family: var(--font-sans); }  /* ★ Arial 줄 삭제 → Pretendard */
```

`@theme inline` 등록으로 `bg-paper`·`text-ink`·`border-border-paper`·`bg-stamp-field`·`text-go`·`text-alarm`·`bg-desk-2`·`font-serif`/`mono`·`rounded-paper` 유틸 자동 생성. `--shadow-*`/`--paper-highlight`는 `.paper-card` 유틸 1개로 참조.

**구현 순서(토큰 먼저, 원형부터):**
1. **토큰 선결** — globals.css 재선언 + Arial 삭제 + layout.tsx 폰트 3계층 self-host 교체. (전 화면 공통 전제)
2. **SegmentTree** — 공유 컴포넌트 1개 토큰화 → 1막·결말 장부 동시 정합.
3. **TransferRound**(테마 원형) — 카드·통화기록·거절도장·시계 + 카피 3건(§8-A).
4. **Epilogue/Receipt**(정점) — 영수증 물성 최대 투자.
5. 나머지(랜딩→위저드→콜접수(종이 절제)→마감(달력=종이)→막간(종이 0)→원내응급) — 원형에서 파생, 인라인 유틸 교체.
6. 이모지·모션 가드 sweep(§8-A).

---

## 10. 남은 결정 / 전제

- **해소됨**: 실서체 로딩(self-host 확정) · 1막 종이 강도(절제) · DayEnd 달력(종이) · on-desk-muted(소형<12px 미사용).
- **이 작업 밖으로 이관**(§8-B): 서술 카피·기관명 가공 — 별도 세션.
- **⚠️ 전제(테스트 게이트)**: 이 프로젝트 TDD 게이트는 `tsc --noEmit` 필수(vitest esbuild는 타입체크 안 함). 토큰/유틸 교체 후 전체 vitest green + tsc 0 확인. 시각 변경은 브라우저 프리뷰로 렌더 검증(React 테스트 인프라 없음).

---

**합성 시 해소한 모순:** ① ink-2·go hex 토큰값 vs 감사 하향값 → **감사 우선**. ② ink-3 "약한 잉크 본문" vs 감사 소형 실패 → **역할 축소**. ③ rule/border 색 대비 vs 마닐라 톤 → **음영 대체**. ④ glow alpha 0.4 vs 톤가드 0.35 → **0.35**. ⑤ 통화기록 이모지(현행) vs 톤가드 제거 → **활자 마커**.
