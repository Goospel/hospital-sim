---
tags:
  - type/meta
---

# troubleshooting — 함정 + 승격

> 1분+ 디버깅했으면 원인 잡힌 직후 한 항목(`T-###`, 글로벌 시퀀스를 이음).
> **항목 하나 = 파일 하나** — `claude-docs/troubleshooting/T-###.md`.
> 형식: 증상 / 원인 / 해결 / 재발방지. 같은 함정 다른 맥락 2회+ → 글로벌·훅으로 승격.
> 관련: [plan.md](plan.md) · [changeLog.md](changeLog.md)

## 새 항목을 쓰려면

`claude-docs/troubleshooting/T-###.md`를 만들고 아래 형식을 지킨다. **목차는 손대지 않는다** — 자동 생성이다.

```markdown
---
summary: 인덱스에 뜰 한 줄 요약(단일 출처 — 목차를 고치지 말고 여기를 고친다)
promoted: 훅 승격        # 선택 — 승격했으면
---

# T-### · 제목

- **증상**: ...
- **원인**: ...
- **해결**: ...
- **재발방지**: ...
```

네 필드는 **검사기가 강제한다**(`scripts/rebuild-troubleshooting-index.ps1`). 스키마가 없으면 항목이 자란다 — 실측상 4필드가 있는 이 문서는 항목당 9줄 근처로 잠겼는데, 스키마가 없는 `changeLog.md`는 항목당 **6.8배**(555 → 3,784바이트) 자랐다.

## 이 프로젝트에서 이미 알고 있는 전제(참고)

- **Next.js 16 breaking change**: 이 버전은 학습 데이터와 API/구조가 다를 수 있음. Next 관련 코드(App Router, route handler 등) 작성 전 `node_modules/next/dist/docs/` 의 해당 가이드를 먼저 볼 것. ([AGENTS.md](../AGENTS.md) 지침)
- **한글 커밋 메시지**: PowerShell 5.1 인라인 `-m`은 CP949로 깨짐 → `.commit-msg-tmp`(UTF-8) 파일 경유 `git commit -F` 사용(글로벌 T-026).

## 목차

<!-- INDEX:START -->
<!-- ⚙️ 자동 생성 — 직접 편집하지 마세요. scripts/rebuild-troubleshooting-index.ps1 이
     각 항목의 frontmatter(summary)에서 재생성합니다. 내용을 바꾸려면 그 항목의
     summary를 고치세요(단일 출처). 최신 항목이 위. -->

- [T-058](troubleshooting/T-058.md) · 외부 요구사항(대회 요강)을 저장소 안의 요약 문서로 대리하면, 그 요약이 언제 원문에서 갈라졌는지 아무도 모른 채 몇 주를 진행한다 — 원문 전사본을 단일 출처로 두고 미확인 항목을 문서에 남겨라
- [T-057](troubleshooting/T-057.md) · dev 서버를 켜둔 채 npm install을 하면 Turbopack이 그 순간의 네이티브 모듈 해석 실패를 .next에 캐시해, 설치가 끝나고 서버를 재시작해도 빌드 에러가 남는다 — node_modules 손상으로 오진하지 말고 .next를 지워라
- [T-056](troubleshooting/T-056.md) · discriminated union에 값을 추가하는 태스크와 그 union을 never로 소진 검사하는 switch의 새 case를 배선하는 태스크를 나누면, 그 사이 모든 중간 커밋에서 프로젝트 tsc가 red가 돼 태스크당 tsc-clean 게이트가 무력화된다 — union 확장 태스크에서 최소 스텁 case를 같이 넣어라
- [T-055](troubleshooting/T-055.md) · 게이트 함수(받을 수 있나)와 실행 함수(실제 배정)가 같은 특수케이스를 비대칭 처리하면 판정과 자원 점유가 어긋난다 — hardlockReason은 일반응급을 점유 벽에서 제외했는데 decide는 자유 전문의를 점유해, 같은 날 뒤 콜이 엉뚱하게 벽에 막혔다
- [T-054](troubleshooting/T-054.md) · 워크트리에서 preview_start(및 next dev)는 여러 lockfile을 감지해 워크스페이스 루트를 메인 레포로 추론해 서빙 → 워크트리 변경이 프리뷰에 안 보인다. 워크트리 변경의 시각검증은 워크트리 cwd에서 직접 next dev를 다른 포트로 띄워라
- [T-053](troubleshooting/T-053.md) · 브라우저 pane 탭이 hidden이면 크롬 throttle로 React 하이드레이션 commit·effect가 멈춰 클릭·상태변경·useEffect·스크린샷이 다 죽는다 — 코드부터 의심 말고 visibilityState 먼저 확인, 우회는 SSR 강제 렌더로 마크업만
- [T-052](troubleshooting/T-052.md) · .git/info/exclude(로컬 전용)로 가린 폴더·파일은 clone에 안 실린다 — 기기 간 공유는 커밋되는 .gitignore로 옮기고 git add -f로 추적
- [T-051](troubleshooting/T-051.md) · 워크트리 시각검증 시 preview_start는 워크스페이스 루트 추론으로 메인 레포에서 dev 서버를 띄운다 — 워크트리 변경이 안 보이면 워크트리에서 직접 next dev
- [T-050](troubleshooting/T-050.md) · block-stale-base 훅은 편집을 막지 편집 전 읽기·분류를 안 막는다 — stale 기반 "쓰기"는 잡아도 stale 기반 "사고"는 통과시킨다
- [T-049](troubleshooting/T-049.md) · 기억을 "현실"이라 부르며 T-042를 그대로 반복 — 적대 검증의 **기각**도 확신에 차서 틀린다
- [T-048](troubleshooting/T-048.md) · sh 훅에서 PowerShell 검사기를 부르면 세 군데서 조용히 깨진다 — 워크트리 hooksPath·ExecutionPolicy·한글 출력. 셋 다 "훅을 직접 실행하는 테스트"는 통과한다
- [T-047](troubleshooting/T-047.md) · PowerShell로 파일을 재생성하면 `AppendLine`이 CRLF를 섞어 LF 파일이 혼합 EOL이 된다 — 규칙이 있는데도 밟았다
- [T-046](troubleshooting/T-046.md) · `.gitattributes` 없이 셸 훅을 커밋하면 clone 시 CRLF 로 풀려 훅이 통째로 죽음
- [T-045](troubleshooting/T-045.md) · fail-open 훅을 positive control 없이 테스트하면 검증이 0이어도 전부 그린
- [T-044](troubleshooting/T-044.md) · vitest 설정이 없어 버려진 워크트리 테스트까지 돌아 green이 2.3배 부풀려짐
- [T-043](troubleshooting/T-043.md) · 콜백에 인자를 추가해도 인자 적은 기존 호출부는 tsc가 통과 — 새 인자가 조용히 버려짐
- [T-042](troubleshooting/T-042.md) · 코드가 표현 못 하는 것을 "현실에 없는 것"으로 착각해, 게임을 코드의 한계에 맞출 뻔함
- [T-041](troubleshooting/T-041.md) · 트레일러 앞 **빈 줄** 하나로 `Skills-used`가 기계 집계에서 통째로 누락 **→ 검사기 승격**
- [T-040](troubleshooting/T-040.md) · "관계로 잠근다"면서 자릿수 표현을 써 자기 근거 사례를 통과시킴
- [T-039](troubleshooting/T-039.md) · 리서치 수치의 **단위**(과 단위 vs 행위 단위)를 섞으면 정반대 부호가 나온다
- [T-038](troubleshooting/T-038.md) · stale한 main에서 뗀 워크트리로 lint → 120에이전트가 낡은 코드를 읽고 폐기된 개념을 문서에 새로 써넣음 **→ 훅 승격**
- [T-037](troubleshooting/T-037.md) · 서브에이전트가 근거 문서 일부만 읽고 과잉주장 — 인용은 정확한데 결론이 틀림(문서 vs 코드, 어느 쪽이 낡았나부터)
- [T-036](troubleshooting/T-036.md) · in-app 브라우저 `computer left_click`이 Fast Refresh churn 중 React onClick에 안 잡힘(native `.click()`은 정상)
- [T-035](troubleshooting/T-035.md) · DarkReader 등 확장이 하이드레이션 전 `<html>` 속성 주입 → hydration mismatch(우리 코드 무관, `suppressHydrationWarning`)
- [T-034](troubleshooting/T-034.md) · in-app 브라우저 get_page_text가 전환 후 stale 화면 반환(read_page는 최신)
- [T-033](troubleshooting/T-033.md) · getComputedStyle은 compositor 애니메이션(opacity/filter/transform) 중간값을 못 읽음
- [T-032](troubleshooting/T-032.md) · dev 서버 켠 채 `next build` → `.next/dev` 손상(ISE, 코드는 멀쩡)
- [T-031](troubleshooting/T-031.md) · 브리프의 특정 플레이런 예시("확인됨")를 보편 불변식으로 오인할 뻔함
- [T-030](troubleshooting/T-030.md) · 워크트리엔 node_modules가 없어 `node_modules/...` 링크가 깨진 것처럼 오진됨
- [T-029](troubleshooting/T-029.md) · Windows `git mv`는 대상 디렉토리를 자동 생성 안 함 (mkdir -p 선행)
- [T-028](troubleshooting/T-028.md) · 워크트리에서 `gh pr merge --delete-branch` 로컬 후처리 실패(머지는 성공)
- [T-027](troubleshooting/T-027.md) · main 머지 후 배포 지연을 '배포 고장'으로 오진

<!-- INDEX:END -->