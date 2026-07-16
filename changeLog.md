# changeLog — 완료 기록 (역순)

> 매 작업(대체로 PR) 완료 시 맨 위에 한 항목. 코드 세부는 PR·커밋에, 여기선 **왜/무엇을**만.
> 날짜는 KST 절대일자. 관련: [plan.md](plan.md) · [troubleshooting.md](troubleshooting.md)

## 2026-07-16 · 프로젝트 부트스트랩 & 컨셉 확정

- **무엇을**: 병원 시뮬 게임 저장소 초기 셋업 — Next.js + TS + Tailwind 스캐폴딩, 작업추적 3종·learning-notes 생성, 게임 컨셉 문서([docs/game-concept.md](docs/game-concept.md)) 작성.
- **왜**: NAN 2026 (NHN Game × AI 해커톤) 신청용 프로토타입을 만들기 위한 출발점. 브레인스토밍으로 방향(의료진 시점 · 응급실 뺑뺑이/필수의료/지방격차 3축) 확정.
- **결정**: AI 핵심 축 = **실시간 전원 협상 + 인과 디브리핑**(6개 설계안 4렌즈 교차채점으로 선정). 아키텍처 원칙 = **판정=코드 / 대사=LLM** 2콜 분리.
