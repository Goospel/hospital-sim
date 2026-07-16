# 병원 시뮬레이션 — 수화기 너머의 벽

> 지금 대한민국 의료 시스템의 **구조적 문제**를, 의료진 입장에서 직접 겪어보는 시뮬레이션 게임.
> 응급환자 한 명을 살릴 병원을 찾아, **AI가 연기하는 전원 담당자에게 자유 텍스트로 매달리는 실시간 협상** — 골든타임이 끝나기 전에.

**NAN 2026 (NHN Game × AI 해커톤) 신청용 프로토타입.**

## 📚 문서 내비게이터

| 문서 | 역할 |
|---|---|
| [docs/game-concept.md](docs/game-concept.md) | 게임 컨셉 · AI 핵심 축 결정 · MVP 절단선 |
| [plan.md](plan.md) | 앞으로 할 일 (살아있는 계획) |
| [changeLog.md](changeLog.md) | 완료 기록 (역순) |
| [troubleshooting.md](troubleshooting.md) | 함정 + 승격 |
| [claude-docs/learning-notes.md](claude-docs/learning-notes.md) | 학습 노트 |

## 핵심 설계 원칙

**판정 = 결정론적 코드 / 대사 = LLM** (2콜 분리).
수용·거절 같은 게임 상태 전이는 절대 LLM이 정하지 않는다. 숨은 제약(병상·당직 전문의)을 읽는 코드가 결과를 먼저 확정하고, LLM은 그 결과를 인물 대사로 연기만 한다. → "설득으로 병상 0의 벽을 뚫는" 붕괴를 원천 차단.

## 개발

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # vitest (시뮬 코어 TDD)
```

기술 스택: Next.js 16 (App Router) · TypeScript · Tailwind CSS · vitest.

> ⚠️ Next.js 16은 breaking change가 있어, Next 관련 코드 작성 전 `node_modules/next/dist/docs/`의 해당 가이드를 확인한다. ([AGENTS.md](AGENTS.md))
