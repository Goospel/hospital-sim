---
tags:
  - type/submission
---

# NAN 2026 사전 과제 — 제출 패키지

> **이 폴더가 제출 그 자체다.** 여기 있는 PDF를 그대로 제출 폼에 올린다.
> 마감: **2026-08-10** · 게임: 「수화기 너머의 벽」 · 개인 참여(솔로)

## 이 폴더에 있는 것

| 파일 | 제출물 | 상태 |
|---|---|---|
| [`03-게임소개-수화기너머의벽.pdf`](03-게임소개-수화기너머의벽.pdf) | ③ 게임 소개 및 설명 | 🟡 초안 (실플레이 스크린샷 포함) |
| [`04-AI활용기술문서-수화기너머의벽.pdf`](04-AI활용기술문서-수화기너머의벽.pdf) | ④ AI 활용 기술 문서 | 🟡 초안 (런타임 LLM 로그만 미착수) |

**제출물 5종의 정의와 전체 진행 상태는 [`../requirements.md`](../requirements.md)가 단일 출처다** — 여기 다시 적지 않는다(한쪽이 낡는다). ①빌드·소스는 URL, ②영상은 YouTube라 이 폴더에 파일로 들어오지 않는다. 공개 저장소라 심사계정 초대는 불필요.

## 이 PDF는 손으로 만들지 않는다

원본은 마크다운이고 **PDF는 매번 재생성물**이다. 원본을 고친 뒤 아래 한 줄이면 이 폴더가 갱신된다.

```bash
npm run pdf
```

| PDF | 원본(단일 출처) |
|---|---|
| `03-게임소개-…` | [`docs/submission/game-intro.md`](../game-intro.md) |
| `04-AI활용기술문서-…` | [`docs/submission/ai-usage-doc.md`](../ai-usage-doc.md) |

**PDF를 직접 편집하지 않는다** — 다음 빌드에 덮어써진다. 내용을 바꾸려면 원본 md를 고친다.

> 💡 빌드할 때마다 PDF 바이트가 바뀐다(생성 시각이 들어간다). **원본 md를 안 고쳤는데 PDF만 `M`으로 뜨면 내용 변화가 아니라 타임스탬프뿐**이니 `git checkout -- docs/submission/final/*.pdf`로 되돌린다 — 안 그러면 커밋마다 1.5MB짜리 무의미한 blob이 쌓인다.
파이프라인: md → HTML(marked) → Chrome headless `--print-to-pdf` ([`scripts/build-submission-pdfs.mjs`](../../../scripts/build-submission-pdfs.mjs)). 외부 서비스·유료 도구 없이 로컬에서 끝나고, 한글은 시스템 폰트로 렌더된다. Chrome 경로가 표준 위치가 아니면 `CHROME_PATH` 환경변수로 지정한다.

## 최종화 전 남은 일

`npm run pdf`를 돌리면 미완료 제출물과 **요강에서 확인 못 한 항목**이 콘솔에 찍힌다(출처: [`../requirements.md`](../requirements.md)). 이 폴더의 PDF에 한정된 손질은 둘이다.

- **③** 스크린샷을 **배포본** 기준으로 재캡처 (현재는 로컬 dev 빌드) · 저장소 URL 확정치 기입
- **④** §6-4 런타임 LLM 프롬프트↔응답·폴백 강등 로그 (실LLM 착수 후)
