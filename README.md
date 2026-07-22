---
tags:
  - type/meta
---

# 병원 시뮬레이션 — 수화기 너머의 벽

> 지금 대한민국 의료 시스템의 **구조적 문제**를, 병원을 경영하는 입장에서 직접 겪어보는 시뮬레이션 게임.
> **병원을 세우고, 환자를 받고, 그 대가를 치른다.** 최선을 다해도 수용·거절 같은 결과는 **코드가 먼저 확정**한다 — 아무리 설득해도 구조의 벽(병상·당직·배후진료)은 뚫리지 않는다.

**NAN 2026 (NHN Game × AI 해커톤) 사전 과제 프로토타입.**

**▶ 지금 플레이: https://hospital-sim-ashy.vercel.app/** (설치·API 키 없이 브라우저에서 바로 · main 푸시 시 자동 재배포)

## 무엇을 겪나

한 주는 **7일의 진료**다. 병원을 세우고(채용), 매일 밀려드는 환자를 한정된 자리로 받는다 — 그중엔 분만·뇌출혈·중증외상·심근경색 같은 응급 콜이 예고 없이 섞여 온다. 한 주가 끝나면 세계가 바뀌고(법·수가·여론), 계속할지 끝낼지는 당신이 정한다.

- **응급실 뺑뺑이 — 당신이 그 벽이다** — 응급 환자를 실은 콜이 걸려온다. 우리 병원이 못 받으면 그 환자는 다른 곳을 전전한다(= 내가 그 벽). 병상이 있어도 그 응급을 감당할 **배후진료 과가 없으면** 못 받는다 — 한 병원이 5개 과를 다 갖추지 못하니, 어느 과의 응급이든 벽이 선다.
- **필수의료 붕괴** — 결말의 '병원 장부'가 왜 그 벽이 있었는지 보여준다: 병원은 미용·검진으로 흑자인데, 환자가 필요한 필수과(순환기·산부인과 등) 채용은 0.

게임은 결말에서 주제를 **설명하지 않는다**. 숫자(장부·신문)만 병치하고 플레이어가 스스로 잇는다. (사실 근거·각색 고지: [STEMI 팩트시트](docs/research/stemi-factsheet.md))

## 플레이 방법

1. **개원** — 미용·검진(돈 되는 과)과 필수과(순환기 등) 채용을 정해 병원을 연다.
2. **7일 진료** — 매일 밀려드는 환자를 한정된 자리로 받거나 돌려보낸다. 그중엔 분만·뇌출혈·중증외상·심근경색 **응급 콜**이 섞여 온다 — 받거나, 못 받으면 그 환자는 다른 벽으로 넘어간다. 못 받는 데는 사유 태그가 붙는다(병상 없음 / 응급실 당직 없음 / 과밀 / 배후진료 불가). 발신자가 아무리 **매달려도** 판정은 안 바뀐다 — 구조의 벽을 받는 쪽에서 겪는 부분. 하루 끝마다 손익이 쌓이고, 이튿날 아침 신문에 어제 돌려보낸 사람들이 실린다.
3. **주간 결산** — 이번 주·누적 손익과 그 주 받은/돌려보낸 응급 수를 보고 [다음 주] 또는 [종료]를 고른다. [다음 주]는 바뀐 세계 위에서 다시 시작된다.
4. **결말** — 종료하면 **누적 결산 장부 + 이번 주 신문**(명부)이 병치된다.

> 📸 스크린샷·GIF는 플레이 영상(P6) 제작 시 아이폰·데스크톱 캡처로 추가 예정.

## 📚 문서 내비게이터

| 문서 | 역할 |
|---|---|
| [docs/concept/game-concept.md](docs/concept/game-concept.md) | 게임 컨셉 · AI 핵심 축 결정 · MVP 절단선 |
| **[docs/submission/requirements.md](docs/submission/requirements.md)** | **제출물 정의 — 요강 5종 표·진행 상태·미확인 항목 (단일 출처)** |
| **[docs/submission/final/](docs/submission/final/)** | **제출 패키지 — 그대로 내는 PDF** (`npm run pdf`로 재생성) |
| [docs/submission/submission-plan.md](docs/submission/submission-plan.md) | 사전 과제 제출 로드맵 · 리스크 · 영상 샷 · PDF 목차 |
| [docs/submission/game-intro.md](docs/submission/game-intro.md) | 게임 소개 및 설명 — 실플레이 기록·스크린샷(제출물 ③ 원본) |
| [docs/submission/ai-usage-doc.md](docs/submission/ai-usage-doc.md) | AI 활용 기술 문서 — 'AI 디렉팅'으로 게임을 만든 과정(제출물 ④ 원본) |
| [claude-docs/plan.md](claude-docs/plan.md) | 앞으로 할 일 (살아있는 계획) |
| [claude-docs/changeLog.md](claude-docs/changeLog.md) | 완료 기록 (역순) |
| [claude-docs/troubleshooting.md](claude-docs/troubleshooting.md) | 함정 + 승격 |
| [docs/research/](docs/research/) | 사실 근거 — STEMI 팩트시트·필수의료 경제 (출처 + 각색 고지) |

## 핵심 설계 원칙

**판정 = 결정론적 코드 / 대사 = LLM** (2콜 분리).
수용·거절 같은 게임 상태 전이는 절대 LLM이 정하지 않는다. 숨은 제약(병상·당직 전문의)을 읽는 코드가 결과를 먼저 확정하고, LLM은 그 결과를 인물 대사로 연기만 한다. → "설득으로 병상 0의 벽을 뚫는" 붕괴를 원천 차단.

> **현재 배포본**: 대사는 **결정론 폴백**(코드가 쓴 담당자 응답)으로, 매주 세계를 바꾸는 이벤트도 **결정론 카탈로그**(개선1·악화1)로 돈다 — API 키 없이 완주 가능. 두 축의 LLM화(대사 생성 · 세계 파라미터 생성)는 아키텍처가 잡혀 있고, 기존 게임을 깨지 않는 **가산 레이어**로 얹을 예정이다(무키·타임아웃 시 자동으로 이 폴백으로 강등). 판정(코드)은 어느 경우든 동일하다.

## 개발

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest (시뮬 코어 TDD)
```

기술 스택: Next.js 16 (App Router) · TypeScript · Tailwind CSS · vitest.

> ⚠️ Next.js 16은 breaking change가 있어, Next 관련 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 확인한다. ([AGENTS.md](AGENTS.md))

## 환경 변수 (env) — 여러 기기에서 이어 작업하기

**원칙: 실제 값은 git에 넣지 않는다. git에는 "필요한 변수 목록"만 둔다.**
데스크톱·랩탑 어디서든, 커밋된 템플릿을 복사해 값만 채우면 바로 이어서 작업할 수 있다.

| 파일 | 커밋 여부 | 역할 |
|---|---|---|
| `.env.example` | ✅ 커밋 | 필요한 변수 **목록·설명**(값 없음). 기기 간 "무엇이 필요한지"의 단일 계약. |
| `.env.local` | ❌ gitignore | 이 기기의 **실제 값**(시크릿 포함). Next.js가 자동 로드. |
| `.env` | (선택) 커밋 가능 | **비밀 아닌** 공통 기본값만(예: 모델 id). 시크릿은 금지. |

### 새 기기(랩탑)에서 시작
```bash
cp .env.example .env.local     # Windows PowerShell도 cp 별칭 동작
# .env.local 을 열어 실제 값(예: ANTHROPIC_API_KEY) 채우기
npm install
npm run dev
```

### 시크릿(API 키) 규칙
- **서버 전용**: 시크릿에는 `NEXT_PUBLIC_`을 붙이지 않는다. 붙이면 빌드 시 브라우저 번들에 인라인되어 노출된다. (LLM 키는 서버 API 라우트에서만 사용.)
- **기기 간 값 이동**: git이 아니라 **비밀번호 관리자** 또는 **발급처에서 재복사**(Anthropic Console). 배포 후에는 Vercel에 값을 한 번 등록하고 각 기기에서 `vercel env pull .env.local`로 당겨오면 단일 소스로 동기화된다.
- **테스트 격리**: Next.js는 `test` 환경에서 `.env.local`을 로드하지 않는다 → vitest는 로컬 값에 영향받지 않고 결정론을 유지한다.

> 로드 우선순위: `process.env` → `.env.local` → `.env`. 자세한 규약은 [Next.js env 가이드](https://nextjs.org/docs/app/guides/environment-variables) (설치본·버전 정확: `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`).
