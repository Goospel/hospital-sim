# check-doc-tags.ps1
#
# ⚠️ 이 파일은 반드시 UTF-8 **BOM 포함**으로 저장해야 한다(T-026 계열). PowerShell 5.1은
#    BOM 없는 UTF-8을 CP949로 잘못 읽어 아래 한글 메시지가 깨진다.
#
# 인자로 받은 문서들이 옵시디언 frontmatter에 `type/*` 태그를 갖는지 검사한다.
# 하나라도 없으면 그 파일을 나열하고 exit 1(fail-close). pre-commit이 호출한다.
#
# 왜: 문서 종류 태그(type/*)는 옵시디언 그래프 색 그룹 + 인덱싱의 단일 출처인데,
# 소프트 규칙이라 새 문서에서 조용히 누락되면 그래프에만 색 없는 노드로 뜨고 아무도
# 모른다. 이 프로젝트가 이미 배운 것: "검사기 없는 규약은 죽는 게 아니라 썩는다"
# (CLAUDE.md). 그래서 규약에 검사기를 같이 붙인다(T-041 계열).
#
# 어떤 파일을 검사할지(= git 추적 md)는 호출자(pre-commit)가 `git ls-files`로 정해
# 인자로 넘긴다. 이 스크립트는 git을 모른다 — "받은 파일들이 태그를 갖는가"만 본다.
# 덕분에 테스트는 git 레포 없이 픽스처 경로만 넘기면 된다.
#
# ⚠️ 상태 마커(TAGS-CHECK: ...)는 ASCII다 — sh 훅이 읽는데 PS 5.1의 한글 콘솔 출력은
#    CP949라 bash에서 깨진다(글로벌 규칙 2의 출력판, T-045/T-046 계열).
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Files)

$ErrorActionPreference = 'Stop'

if (-not $Files -or $Files.Count -eq 0) {
    Write-Host 'TAGS-CHECK: OK (0 files)'
    exit 0
}

$missing = @()
foreach ($f in $Files) {
    if (-not (Test-Path $f)) {
        # 검사에 걸린 게 아니라 검사를 **못 한 것** — 조용히 지나가면 T-045 계열이 된다.
        Write-Host "TAGS-CHECK: INVALID (file not found: $f)"
        Write-Host "  검사할 파일이 없다: $f" -ForegroundColor Red
        exit 1
    }

    $lines = [System.IO.File]::ReadAllLines($f)

    # frontmatter 경계(첫 '---' ~ 두번째 '---') 안에서만 type/ 태그를 찾는다.
    $fmStart = -1; $fmEnd = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq '---') {
            if ($fmStart -lt 0) { $fmStart = $i } else { $fmEnd = $i; break }
        }
    }

    $hasTag = $false
    if ($fmStart -ge 0 -and $fmEnd -gt $fmStart) {
        for ($i = $fmStart + 1; $i -lt $fmEnd; $i++) {
            if ($lines[$i] -match 'type/\S') { $hasTag = $true; break }
        }
    }
    if (-not $hasTag) { $missing += $f }
}

if ($missing.Count -gt 0) {
    Write-Host "TAGS-CHECK: MISSING ($($missing.Count))"
    Write-Host "다음 문서의 frontmatter에 type 태그가 없다 — tags: 아래 '- type/<종류>'를 넣어라:" -ForegroundColor Red
    foreach ($m in $missing) { Write-Host "  ✗ $m" -ForegroundColor Red }
    exit 1
}

Write-Host "TAGS-CHECK: OK ($($Files.Count) files)"

# ── 규칙 2: 폴더를 가리키는 마크다운 링크 금지 (T-062) ─────────────────────
# 옵시디언은 해석 못 하는 링크를 클릭하면 그 이름으로 빈 노트를 만드는데, 폴더는
# 노트가 아니라 **영원히** 해석되지 않는다 — 클릭할 때마다 'research 1.md'·'2'로
# 증식한다. GitHub에서는 같은 링크가 정상 동작해 저장소만 봐서는 안 보인다.
# 코드 스팬·코드블록 안은 링크가 아니라 **인용**이다 — 안 걸러내면 이 규칙을
# 설명하는 문서(T-062)가 자기 자신에게 거부당한다.
$folderLinks = @()
foreach ($f in $Files) {
    $text = [System.IO.File]::ReadAllText($f)
    $text = [regex]::Replace($text, '(?s)```.*?```', '')   # 펜스 코드블록
    $text = [regex]::Replace($text, '`[^`]*`', '')          # 인라인 코드 스팬
    foreach ($m in [regex]::Matches($text, '\[[^\]]*\]\(([^)]*/)\)')) {
        $folderLinks += [pscustomobject]@{ File = $f; Link = $m.Groups[1].Value }
    }
}

if ($folderLinks.Count -gt 0) {
    Write-Host "LINKS-CHECK: FOLDER($($folderLinks.Count))"
    Write-Host '다음 링크가 폴더를 가리킨다 — 링크를 빼고 백틱 경로 표기로 내려라(T-062):' -ForegroundColor Red
    foreach ($l in $folderLinks) { Write-Host "  ✗ $($l.File) → $($l.Link)" -ForegroundColor Red }
    exit 1
}

Write-Host "LINKS-CHECK: OK ($($Files.Count) files)"
exit 0
