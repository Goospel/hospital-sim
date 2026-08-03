---
tags:
  - type/meta
---

# 제출 영상 자동 제작 파이프라인 (2026-08-03)

제출물 ② 플레이 영상(59.4초)을 **사람 손 없이** 만든 파이프라인. AI가 게임을 플레이하고, 발생 시점을 역산하고, 컷을 골라 편집했다 — ④ AI 활용 문서의 실측 사례이자, 시드 고정 결정론 덕에 **언제든 같은 영상을 다시 만들 수 있는** 재현 가능한 기록이다.

## 구성

| 단계 | 도구 | 내용 |
|---|---|---|
| 좌표 역산 | `scripts/cut-*-probe.ts` (vitest) | 헤드리스 시뮬로 컷별 발생 시점 확정 — 첫 속보=1주 3일, 의료소송 추첨일=84일 중 12주 3일 단 하루, 첫 회차=1주 1일 09:37/09:38 |
| 자동 플레이·녹화 | [capture.mjs](capture.mjs) (Playwright) | 접근성 이름 셀렉터로 게임을 조작(지역 선택→채용→벽·문·가구 건설→개원), rAF 가상시계 빨리감기(하루≈13초)로 후반 주차 도달, 컷별 webm 녹화 + 키 순간 경과초 로그 |
| 편집 | ffmpeg (ffmpeg-static) | 로그 기준 트리밍 → concat → 자막 번인([subs.ass](subs.ass), 맑은 고딕) → BGM 합성 |
| BGM | 힉스필드 sonilo_music | 60초 절제된 피아노+앰비언트 생성 |

## 실행법

이 저장소 의존성이 아니라 **별도 작업장**에서 돈다 (Playwright·Chromium·ffmpeg가 무거워 repo에 넣지 않음):

```bash
mkdir video-work && cd video-work
npm init -y && npm i playwright ffmpeg-static && npx playwright install chromium
cp <repo>/scripts/video/capture.mjs .
# 게임 dev 서버를 먼저 띄운다: <repo>에서 npm run dev (포트 3000/3001)
node capture.mjs <컷이름>   # 컷 목록·시나리오는 파일 상단 주석
```

## 알아둘 것 (하네스에 코드 주석으로도 있음)

- **`Math.random` 전역 고정 금지** — react-dom 이벤트 키가 충돌해 모든 클릭이 죽는다([T-150](../../claude-docs/troubleshooting/T-150.md)). 배경 추첨 직전에만 국소 패치.
- **이벤트 측정 프로브는 `applyMorningEvent`를 UI와 똑같이 불러야** 한다([T-151](../../claude-docs/troubleshooting/T-151.md)) — `region-balance-probe.ts`를 그대로 복사하면 이벤트가 영영 안 붙는다.
- 방 건설 순서는 **벽 → 문 → 가구 → 용도 칠**이 계약이다 — 칠을 먼저 하면 테두리까지 칠해져 옆방과 영역이 이어진다. 문을 빼면 개원 체크리스트가 5/6에서 막히고 진료 0으로 굳는다(돌연변이 실측).
- 시드가 1로 하드코딩이라 같은 조작 = 같은 판. 배경 그림만 `Math.random`(3종).
- 컷4(「AI 서사」 배지)는 Vercel 배포(https://hospital-sim-ashy.vercel.app/)에서 실호출로 촬영 — 판당 LLM 상한(10회)이 초반 소진되므로 후반 컷은 로컬과 동일하다.
