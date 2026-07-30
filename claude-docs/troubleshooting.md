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

- [T-137](troubleshooting/T-137.md) · 돌연변이 확인 중 `git checkout -- <file>`로 변조를 되돌리면 미커밋 구현까지 통째로 날아간다 — 복원 기준이 HEAD라 "방금 넣은 변조"와 "아직 커밋 안 한 작업"을 구별하지 않는다. 돌연변이 실험은 반드시 커밋 후에 시작한다(커밋이 곧 복원 지점)
- [T-136](troubleshooting/T-136.md) · .mjs/.js의 블록 주석 안에 glob 패턴 `**/`를 쓰면 별 두 개+슬래시가 주석 종료 토큰이라 주석이 거기서 끝난다 — eslint가 설정 파일 파싱 단계에서 죽고 에러 메시지는 원인(주석)과 무관해 보인다. glob을 언급하는 주석은 줄 주석(//)으로 쓴다
- [T-115](troubleshooting/T-115.md) · 어두운 팔레트를 밝은 대역으로 옮길 때 채도를 함께 밀면 파랑 쪽으로 기운 색이 보라로 폭주한다 — 파랑의 휘도 가중치가 0.0722뿐이라 목표 휘도를 B 채널이 혼자 부담한다. 색조 보존은 「채널 비율을 그대로 곱하기」이고, 채도 상한은 밝은 면일수록 낮아야 한다
- [T-114](troubleshooting/T-114.md) · Browser pane이 숨겨져 있으면 document.timeline이 멈춰 CSS 트랜지션이 시작색에 고정된다 — 계산색이 「클래스가 안 먹었다」와 똑같이 보이므로, 색을 재기 전에 getAnimations().finish()로 끝까지 민다
- [T-113](troubleshooting/T-113.md) · 배율 훅에 심은 「시드에 곱하기」 돌연변이가 살아남았는데, 그건 테스트의 구멍이 아니라 그 돌연변이가 원본과 대수적으로 동일했기 때문이다 — 생존한 돌연변이는 먼저 등가성을 의심한다
- [T-112](troubleshooting/T-112.md) · 돌연변이 원복을 `git checkout -- <file>`로 했더니 아직 커밋 안 한 구현까지 HEAD로 되돌아가 통째로 사라졌다 — 원복 기준은 HEAD가 아니라 「돌연변이 직전의 워킹 트리」다
- [T-111](troubleshooting/T-111.md) · 회귀 밴드의 기대값을 카탈로그에서 파생했더니 기대값과 실측이 같은 표를 보게 되어 튜닝 돌연변이가 통째로 살아남았다 — 값을 잠그는 테스트만은 그 값을 두 번째로 적어야 한다
- [T-110](troubleshooting/T-110.md) · 워크트리에서 `gh pr merge --delete-branch` 가 로컬 checkout 단계에서 죽는다 — 머지는 이미 성공했는데 에러만 보여 실패로 오독하고, 원격 브랜치는 조용히 남는다
- [T-109](troubleshooting/T-109.md) · transform div에 얹은 자식 캔버스가 부모 div의 background(부지 바닥·격자)를 통째로 가림 — 에러 0의 무성 실패
- [T-108](troubleshooting/T-108.md) · 돌연변이 확인 스크립트가 vitest 출력을 파싱하려다 CP949 디코딩으로 죽었는데, 그 예외가 원복 줄보다 앞이라 소스가 부서진 채 남았다 — 판정은 종료 코드로, 원복은 try/finally로
- [T-107](troubleshooting/T-107.md) · HMR이 남긴 useEffect deps 경고가 하드 리로드 뒤에도 콘솔에 남아 새 로드의 결함처럼 보였다 — 브라우저 콘솔 버퍼는 리로드를 건너 살아남는다
- [T-106](troubleshooting/T-106.md) · 「내과」가 「순환기내과」의 부분문자열이라 toContain 계열 단언이 헛걸리고 반대 방향으로는 조용히 통과한다 — 한글 과 이름은 부분문자열로 재면 안 된다
- [T-105](troubleshooting/T-105.md) · 도착에 필터를 얹자 옛 테스트가 "규칙 위반"의 얼굴로 깨졌는데 실제 원인은 표본 고갈이었다 — 유입을 줄이는 변경은 짧은 창을 쓰는 계측기를 통계적으로 굶긴다
- [T-104](troubleshooting/T-104.md) · 가구 한 종류를 통행 가능으로 바꾸자 "설 자리"를 뽑는 함수가 그 가구를 고르기 시작해 진료실 슬롯이 통째로 안 열렸다 — 막힘을 푸는 변경은 그 막힘에 얹혀 있던 파생식을 전부 흔든다
- [T-103](troubleshooting/T-103.md) · 브라우저 pane이 표시되지 않으면 페이지가 프레임을 안 그려 ResizeObserver 콜백이 아예 안 온다 — 리사이즈 실측이 "코드가 반영을 안 한다"는 거짓 신호로 보이고, HMR 중간 상태의 인라인 스타일도 같은 얼굴로 섞인다
- [T-102](troubleshooting/T-102.md) · 오버레이 HUD 밑으로 캔버스를 깔면서 fit·클램프 기준을 뷰포트 전체로 잡으면, 최소 줌에서 바에 덮인 줄이 영구히 가린다 — 그 배율은 콘텐츠 = 기준이라 팬 슬랙이 0이어서 꺼낼 수단조차 없다
- [T-101](troubleshooting/T-101.md) · 남은 공간에 맞춰 확대되는 캔버스 옆에 가변 높이 UI를 두면 버튼 한 번에 화면 전체 배율이 바뀐다 — 조건부 렌더가 곧 레이아웃 변동이라, 접힘/펼침이 "메뉴가 열림"이 아니라 "해상도가 바뀜"으로 보인다
- [T-100](troubleshooting/T-100.md) · 파생값을 "싸니까 캐시하지 말자"고 매 틱 다시 계산했더니 주 종주가 103ms → 3.0초가 되고 테스트 3건이 타임아웃 — 답이 4,200틱 내내 한 번도 안 바뀌는데 4,200번 계산했다. 미세 최적화는 40%만 깎았고 입력 identity 한 칸 memo가 20배를 되돌렸다
- [T-099](troubleshooting/T-099.md) · 드래그를 시작하는 순간 헤더에 '건설 중 — 일시정지' 문구가 끼며 헤더가 줄바꿈돼 맵이 32px 내려갔고, 그래서 드래그 좌표가 두 타일 어긋났다(7×6을 그렸는데 7×4가 지어짐). 맵 위쪽 요소의 높이는 드래그 중에 변하면 안 된다 — 상태 문구는 맵 아래 예약된 줄로
- [T-098](troubleshooting/T-098.md) · 숨긴 탭·화면에 안 보이는 브라우저 패널에서는 requestAnimationFrame이 통째로 멈춘다 — rAF로 구동되는 시뮬(useSimClock)은 시계가 0회 돌아 '폰이 안 움직인다'로 관측되고, 그 화면에서 재현을 시도하면 멀쩡한 코드를 계속 의심하게 된다. 시뮬 검증은 반드시 화면에 보이는 활성 창에서
- [T-097](troubleshooting/T-097.md) · @anthropic-ai/sdk의 timeout은 요청 1회당 상한이고 기본 maxRetries가 2라 9초로 설정한 타임아웃이 실제로는 28.45초가 됐다 — 클라이언트가 10초에 이미 끊은 뒤 18초간 돈만 나갔다. maxRetries를 정하지 않으면 실효 상한이 암묵값이 된다
- [T-096](troubleshooting/T-096.md) · ESLint no-restricted-imports의 group은 glob이 아니라 gitignore 문법이라 부모를 제외한 뒤 자식을 `!`로 되살릴 수 없다 — "전부 금지 + 예외 몇 개"라는 허용 목록은 표현 자체가 불가능해(5개 변형 전수 실측) 금지 목록으로 뒤집고 승격 경로를 함께 적었다
- [T-095](troubleshooting/T-095.md) · 숨은 Browser pane에서 rAF가 0프레임이라 게임 시계가 09:00에 얼어 실측이 「미실측」으로 남았다 — 세계를 콘솔로 세팅하면 검증이 사라지므로, 프레임 공급원만 프로브로 갈아 끼워(게임 규칙·tick·시드 무접촉) 자연 발동을 그대로 관측한다
- [T-094](troubleshooting/T-094.md) · 보간값 바로 뒤에 한국어 조사를 붙이면 앞 글자의 받침에 따라 "금지은"처럼 깨진다 — 괄호로 감싸는 1차 수정도 "「금지」으로"로 다시 깨졌고, 조사를 고정 단어 뒤로 옮겨야 끝난다
- [T-093](troubleshooting/T-093.md) · 두 모듈이 서로를 값으로 임포트하는 순환은 함수 호이스팅 덕에 당장은 돌지만, 한쪽이 최상위에서 표를 평가하는 순간 TDZ로 즉사한다 — 진입 순서에 따라 vitest/dev/export가 다르게 터지므로 순수 파생을 leaf 모듈로 내려 순환 자체를 없앴다
- [T-092](troubleshooting/T-092.md) · 실측 없이 쓴 인과 주장("휴게실이 멀수록 덜 쉰다")이 주석 3곳과 커밋 본문에 함께 실렸고 프로브가 반증했다 — 주석은 정정됐지만 커밋 메시지는 불변이라 옛 주장이 역사에 영구히 남았다
- [T-091](troubleshooting/T-091.md) · 같은 임계를 성능 가드와 판정이 각자 적고 있어, 판정 쪽을 지운 돌연변이가 869건 전부 통과했다 — 실행 코드의 이중 기재는 기능이 아니라 계측 자체를 무력화하고 그 무력화는 green으로 안 잡힌다
- [T-090](troubleshooting/T-090.md) · 돌연변이 여러 개를 동시에 적용해 얻은 사살 수("3곳 5건")는 개별 사살의 증거가 아니다 — 실제로는 3곳 중 1곳이 단독 생존 중이었고, 리뷰가 단독 적용으로 반증하기 전까지 안전 주장으로 통용됐다
- [T-089](troubleshooting/T-089.md) · 주석이 "계약"을 선언하는데 그 계약을 잠그는 테스트가 없는 패턴이 한 재설계에서 3회 반복됐다 — 주석이 정확할수록 다음 사람이 검증된 것으로 읽어 더 위험하며, 리뷰가 프로브로 등가 아님을 확정해야만 드러났다
- [T-088](troubleshooting/T-088.md) · 스크롤 컨테이너(overflow-y-auto)에 flex items-center로 자식을 세로 중앙 정렬하면, 자식이 뷰포트보다 길 때 위쪽이 음수 top으로 밀려 스크롤로도 영영 닿을 수 없다 — 해법은 items-start + 자식 my-auto
- [T-087](troubleshooting/T-087.md) · 검증된 시드 폴딩(callSeed)을 재사용하며 index 슬롯 폭(97)을 넣는 인자 범위(minute 0..479)와 대조하지 않아, 매일의 도착 스트림이 전날의 97분 시프트(하루의 80%가 재방송)가 됐다 — 독스트링 경고를 밟았고 그 사실을 경계하는 주석을 단 커밋에서 밟았다
- [T-086](troubleshooting/T-086.md) · Browser pane이 화면에 표시되지 않으면 페이지가 컴포지팅을 멈춰 requestAnimationFrame이 0프레임이 된다 — rAF 기반 게임 시계가 통째로 정지해 실시간 동작 검증·스크린샷이 에러 없이 전부 불가(추가 실측: 대체 처방이던 setTimeout도 1분 1회로 조여지고, ResizeObserver 콜백도 같은 뿌리로 발화하지 않는다)
- [T-085](troubleshooting/T-085.md) · 경계 오프바이원 돌연변이(`>=`→`>`)가 두 번 살아남았다 — 시드가 경계 분에 이벤트를 안 만들거나, 기준값을 경계 뒤에서 캡처하면 경계 분 발생분이 기준값에 섞여 테스트가 green인 채 계측력 0이 된다
- [T-084](troubleshooting/T-084.md) · 1회 관측으로 "~할 방법이 없다"는 부정 결론을 내려 한 세션에서 3번 틀렸고 그중 하나는 CLAUDE.md에 박혀 다음 세션의 탐색을 차단할 뻔했다 — 부정 결론은 관측 부재이지 부재의 관측이 아니다
- [T-083](troubleshooting/T-083.md) · PowerShell 함수가 요소 1개짜리 배열을 언랩해 반환하는 탓에 .Count가 사라져 "로그 0줄"로 보였고, 구현 결함으로 오인할 뻔했다 — 반환값을 @()로 감싸야 1건과 0건이 구분된다
- [T-082](troubleshooting/T-082.md) · 조인 로직을 꺼도 테스트가 통과했다 — 픽스처가 두 출처에 같은 값을 넣어 "어느 쪽을 읽었는지"를 구분할 수 없었기 때문이며, 단정이 아니라 테스트 데이터 설계가 판별력을 죽인 경우다
- [T-081](troubleshooting/T-081.md) · whitelist를 .gitignore와 CI 정규식 두 곳에 이중 기재해 한쪽만 갱신되자 CI가 정상 파일을 오탐했고, 고칠 게 없는 빨간불이 5커밋 연속 이어져 게이트가 사실상 죽었다 — 목록을 베끼는 대신 git check-ignore로 .gitignore에서 파생해 해결
- [T-080](troubleshooting/T-080.md) · 속성 단정(부등호·존재성)만으로 쓴 테스트가 규칙을 구현에서 지워도 통과했다 — 대조군 없는 단정은 "규칙의 결과"가 아니라 "데이터의 초기 분포"를 재기 때문이며, 한 슬라이스에서 3회 반복해 돌연변이 확인(규칙 임시 제거)으로만 잡혔다
- [T-079](troubleshooting/T-079.md) · 파생값의 단위를 바꾸는 변경(점유 분 → 강도 가중 표준강도분)이 그 단위를 소비하는 상수(FATIGUE_FREE_MIN=360)를 조용히 사문화시켰다 — 상수 상대값 테스트는 전부 green이라 못 잡고, 결정론 프로브(7일 시뮬 계측)만이 "피로가 영원히 0"을 드러냈다
- [T-078](troubleshooting/T-078.md) · block-fable-implement 훅이 Opus 서브에이전트의 코드 편집을 전부 오탐 차단했다 — 서브에이전트 턴이 부모 트랜스크립트에 기록되지 않아 훅이 항상 부모 모델(fable)을 읽기 때문이며, PreToolUse 입력의 agent_id로 판별하도록 고쳐 해결했다
- [T-077](troubleshooting/T-077.md) · 66커밋 pull 후 npm ci가 ENOTEMPTY(rmdir node_modules/caniuse-lite/...)로 실패했다 — npm ci가 node_modules를 통째로 지우는 첫 단계에서 Windows 파일 잠금과 경합하기 때문이고, 디렉터리를 직접 지운 뒤 재실행하면 통과한다
- [T-076](troubleshooting/T-076.md) · 옵시디언이 설정 JSON을 LF로 되쓰는데 core.autocrlf=true는 CRLF로 체크아웃해, 내용이 한 글자도 안 바뀐 .obsidian/app.json이 git status에 유령 M으로 상주했다 — 인덱스 blob과 worktree 해시가 동일한데도
- [T-075](troubleshooting/T-075.md) · 맵 전체를 덮는 아바타 레이어(absolute inset-0)에 pointer-events-none이 빠져 아래 방 버튼의 실제 클릭을 삼켰고, 검증을 JS .click()으로 해서 히트테스트를 우회해 버그를 놓친 채 배포됐다
- [T-074](troubleshooting/T-074.md) · SDD 세션 중 워크트리가 이전 세션의 정리 실패로 .git을 잃고 메인 저장소의 하위 디렉토리로 편입돼, .gitignore 패턴에 걸려 파일이 조용히 무시되고 커밋이 거부됐다
- [T-073](troubleshooting/T-073.md) · SDD 브라우저 검증 중 클릭이 전달 안 되고 15초 카운트다운이 멈춘 것처럼 보였다 — 코드 결함이 아니라 브라우저 페인이 표시되지 않는 환경(document.hidden)의 아티팩트였다
- [T-072](troubleshooting/T-072.md) · globals.css에 새 규칙을 넣었는데 dev 서버가 계속 옛 CSS를 내줬다 — Turbopack 청크 파일명이 내용이 바뀌어도 그대로라, 서버 재시작으로도 안 풀리고 .next를 지워야 했다
- [T-071](troubleshooting/T-071.md) · 부문 손익을 '그 과가 버는 돈'으로 두면 진료를 한 건도 안 봐도 흑자가 난다 — 수익을 두 층에서 세던 이중 계상은 한쪽을 0으로 눌러선 안 풀리고, 수익원을 한 층으로 몰아야 과별 흑자·적자가 입력이 아니라 계산에서 창발한다
- [T-070](troubleshooting/T-070.md) · decide는 대기까지 감안해 받을 수 있는데 CallCard는 도착 시각의 자유 의사만 보고 「받기」를 비활성화해, 예약 카드에서 아무 버튼도 안 먹는 진행 불가 상태가 됐다 — 판정을 두 곳에 각각 적으면 화면이 거짓말을 한다
- [T-069](troubleshooting/T-069.md) · 같은 진료를 부문 손익과 콜 델타 두 층에서 세는 이중 계상이 콜 5통 시절엔 오차라 숨어 있다가, 하루 60통이 되자 순이익을 707억으로 부풀려 불변식 I8을 깼다 — 집계 층이 둘이면 규모가 커질 때만 드러난다
- [T-068](troubleshooting/T-068.md) · 훅에 막혀 실패한 편집을 나중에 그대로 재적용했더니, 그 편집에 딸린 검증 계획만 재적용되지 않아 문법 오류가 브라우저까지 나갔다 — 중단된 편집은 재개되지만 검증은 재개되지 않는다
- [T-067](troubleshooting/T-067.md) · 대비 감사 스크립트가 세 번 연속으로 "정직해 보이는 오답"을 냈다 — oklab을 RGB로 파싱, 그라디언트 배경을 투명으로 오인, oklab의 슬래시 알파를 불투명으로 오인. 매번 그럴듯한 실패 목록이 나왔고 그 안에 진짜 한 건이 섞여 있었다
- [T-066](troubleshooting/T-066.md) · 스펙이 패널의 유일한 내용물을 조건부 문구 하나로 정하면서 그 조건이 거짓인 경로를 안 적어, 대부분의 시간 동안 빈 304px 상자가 나갔다 — 실측이 그 빈 상자를 76px로 정확히 재서 min-h 계산의 입력으로 썼고, 아무도 "왜 76px인가"를 묻지 않았다
- [T-065](troubleshooting/T-065.md) · 스크린샷 compositing이 막힌 브라우저 탭은 document.hidden=true라 CSS 애니메이션·트랜지션의 document timeline이 아예 0에 고정돼, getBoundingClientRect()로 움직임을 재려던 실측이 전부 "안 움직인다"는 거짓 결과를 냈다 — el.style 직접 읽기와 animation-delay 스크럽으로 우회했다
- [T-064](troubleshooting/T-064.md) · 스크린샷이 막힌 환경에서 DOM 수치로 UI를 실측했는데 "좌표가 공식과 일치하나"만 보고 "그 공식이 대상 위인가"를 안 봐서, 환자가 침대에서 65px 떨어진 채 9개 항목 전부 통과가 났다 — 검증이 코드가 코드대로 도는 것만 확인하고 설계가 원한 것은 확인하지 않았다
- [T-063](troubleshooting/T-063.md) · 검사기가 "파일이 디스크에 있나"를 봤지만 진짜 불변식은 "옵시디언 볼트에서 해석되나"였다 — 점(.) 경로는 볼트에서 제외돼 파일이 멀쩡히 있어도 유령 노드가 되고, 상대경로 형태가 다르면 같은 파일이 여러 노드로 갈린다. 검사기가 초록인데 증상은 그대로였다
- [T-062](troubleshooting/T-062.md) · 옵시디언은 해석 못 하는 링크를 클릭하면 그 자리에 빈 노트를 만든다 — 폴더를 가리키는 마크다운 링크는 영원히 해석되지 않아 클릭할 때마다 `research 1.md`·`2`·`3`으로 무한 증식하고, 세션 복원이 지운 파일을 되살려 "삭제가 안 먹는" 것처럼 보인다
- [T-061](troubleshooting/T-061.md) · 명령을 재작성하는 PreToolUse 훅(rtk)을 깔면 권한 심사는 원본이 아니라 재작성된 명령을 본다 — `git status`가 `rtk git status`로 바뀌어 허용 규칙에 없는 미지 명령이 되고, auto 모드에서 전부 하드 거부된다. 훅 설치와 허용 규칙은 한 세트다
- [T-060](troubleshooting/T-060.md) · GitHub Pages 배포 워크플로는 Pages 사이트가 이미 존재해야 돌아간다 — `configure-pages`의 `enablement: true`로 자동 생성하려 해도 GITHUB_TOKEN 권한 밖이라 실패한다. 소유자가 1회 켜야 하는 부트스트랩 단계다
- [T-059](troubleshooting/T-059.md) · Git Bash에서 슬래시로 시작하는 env 값(`PAGES_BASE_PATH=/hospital-sim`)이 MSYS 경로 변환에 걸려 Windows 절대경로로 바뀐다 — 값이 조용히 안 바뀌고 엉뚱한 에러 메시지로 나온다
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