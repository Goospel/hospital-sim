# test-check-doc-tags.ps1
#
# ⚠️ 이 파일은 반드시 UTF-8 **BOM 포함**으로 저장해야 한다(T-026 계열).
#    PowerShell 5.1은 BOM 없는 UTF-8을 CP949로 잘못 읽어 아래 한글 리터럴이 깨진다.
#    픽스처가 한글이라 BOM이 떨어지면 이 테스트는 거짓 실패한다.
#
# check-doc-tags.ps1의 테스트.
#
# ⚠️ positive control (T-045): 이 검사기는 **fail-close**다(태그 누락이면 exit 1).
#    그래서 "거부되어야 정상"인 케이스만으로는 스크립트가 아예 없어도 전부 초록이 된다.
#    따라서 **통과 케이스(exit 0 기대)가 나머지의 유효성 조건**이다 — 케이스 1이 그 역할.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'check-doc-tags.ps1'

# ── SANITY ─────────────────────────────────────────────────────────────────
if (-not (Test-Path $scriptPath)) {
    Write-Host "SANITY FAIL: $scriptPath 가 없다." -ForegroundColor Red
    Write-Host "  fail-close라 스크립트가 없으면 'exit 1 기대' 케이스가 거짓 통과한다." -ForegroundColor Red
    exit 2
}

# 픽스처는 짧은 경로에(MAX_PATH 회피, T-045 규칙)
$fixtureRoot = Join-Path $env:TEMP 'cdt'

$script:passCount = 0
$script:failCount = 0
$script:positiveControlOk = $false

function Assert-That {
    param([bool]$Condition, [string]$Name, [string]$Detail = '')
    if ($Condition) {
        $script:passCount++
        Write-Host "  PASS  $Name" -ForegroundColor Green
    } else {
        $script:failCount++
        Write-Host "  FAIL  $Name" -ForegroundColor Red
        if ($Detail) { Write-Host "        $Detail" -ForegroundColor DarkGray }
    }
}

function New-Md {
    param([string]$Name, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $p = Join-Path $fixtureRoot $Name
    [System.IO.File]::WriteAllText($p, $Content, $utf8NoBom)
    return $p
}

function Invoke-Check {
    param([string[]]$Files)
    $a = @('-NoProfile', '-NonInteractive', '-File', $scriptPath) + $Files
    $out = & powershell.exe @a 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out | Out-String) }
}

if (Test-Path $fixtureRoot) { Remove-Item $fixtureRoot -Recurse -Force }
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null

$tagged1  = New-Md 'a.md' "---`ntags:`n  - type/meta`n---`n`n# 문서 A`n"
$tagged2  = New-Md 'b.md' "---`nsummary: 요약`ntags:`n  - type/research`n---`n`n# 문서 B`n"
$untagged = New-Md 'c.md' "---`nsummary: 태그 없음`n---`n`n# 문서 C`n"
$nofm     = New-Md 'd.md' "# 프론트매터 없는 문서`n"

Write-Host ''
Write-Host 'check-doc-tags — 테스트' -ForegroundColor Cyan
Write-Host ''

# ── 케이스 1: 태그 있는 파일들만 → exit 0 (POSITIVE CONTROL) ────────────────
Write-Host '케이스 1: 모든 파일에 type 태그가 있으면 exit 0 (positive control)'
$r = Invoke-Check @($tagged1, $tagged2)
Assert-That ($r.ExitCode -eq 0) '태그 있는 파일들만이면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
if ($r.ExitCode -eq 0) { $script:positiveControlOk = $true }

# ── 케이스 2: 태그 없는 파일 섞이면 → exit 1 + 그 파일명 ───────────────────
Write-Host '케이스 2: type 태그 없는 파일이 하나라도 있으면 거부하고 그 파일을 알려준다'
$r = Invoke-Check @($tagged1, $untagged)
Assert-That ($r.ExitCode -ne 0) '태그 없는 파일이 있으면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
Assert-That ($r.Output.Contains('c.md')) '어느 파일이 태그 없는지 알려준다' $r.Output

# ── 케이스 3: frontmatter 자체가 없는 파일 → 거부 ─────────────────────────
Write-Host '케이스 3: frontmatter가 없는 파일은 태그 없음으로 거부한다'
$r = Invoke-Check @($nofm)
Assert-That ($r.ExitCode -ne 0) 'frontmatter 없으면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 4: 기계가 읽을 ASCII 상태 마커 (sh 훅이 읽는다) ─────────────────
Write-Host '케이스 4: 종료 경로가 ASCII 상태 마커를 출력한다(sh 훅이 읽는다)'
$r = Invoke-Check @($tagged1)
Assert-That ($r.Output -match 'TAGS-CHECK:\s*OK') '전부 태그면 OK 마커' $r.Output
$r = Invoke-Check @($untagged)
Assert-That ($r.Output -match 'TAGS-CHECK:\s*MISSING') '누락 시 MISSING 마커' $r.Output
$markerLine = @($r.Output -split "`r?`n" | Where-Object { $_ -match 'TAGS-CHECK:' })[0]
$isAscii = $true
foreach ($ch in $markerLine.ToCharArray()) { if ([int]$ch -gt 127) { $isAscii = $false; break } }
Assert-That $isAscii '마커 줄이 순수 ASCII다' "실제: $markerLine"

# ── 케이스 5: 폴더를 가리키는 링크 → 거부 (T-062) ──────────────────────────
# 옵시디언은 폴더 링크를 영원히 해석 못 해, 클릭할 때마다 빈 노트를 새로 만든다.
# GitHub에서는 멀쩡히 동작해서 저장소만 봐서는 안 보인다 — 그래서 검사기로 잠근다.
$bt = [char]96
$folderLink = New-Md 'e.md' "---`ntags:`n  - type/meta`n---`n`n| [docs/research/](docs/research/) | 사실 근거 |`n"
# 규칙 3(대상 존재)이 생겼으므로 오탐 방지 픽스처도 **실재하는** 대상을 가리켜야 한다.
$fileLink   = New-Md 'f.md' "---`ntags:`n  - type/meta`n---`n`n[A](a.md) 과 [B](b.md)`n"
$inCode     = New-Md 'g.md' "---`ntags:`n  - type/meta`n---`n`n전: $bt[docs/research/](docs/research/)$bt 를 백틱으로 내렸다`n"
$inFence    = New-Md 'h.md' "---`ntags:`n  - type/meta`n---`n`n$bt$bt$bt`n[x](docs/research/)`n$bt$bt$bt`n"

Write-Host '케이스 5: 폴더를 가리키는 마크다운 링크가 있으면 거부하고 그 파일을 알려준다'
$r = Invoke-Check @($folderLink)
Assert-That ($r.ExitCode -ne 0) '폴더 링크가 있으면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
Assert-That ($r.Output.Contains('e.md')) '어느 파일인지 알려준다' $r.Output
Assert-That ($r.Output -match 'LINKS-CHECK:\s*FOLDER') '폴더 링크 전용 ASCII 마커' $r.Output

Write-Host '케이스 6: 파일을 가리키는 링크는 통과한다(오탐 방지)'
$r = Invoke-Check @($fileLink)
Assert-That ($r.ExitCode -eq 0) '파일 링크만이면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

Write-Host '케이스 7: 코드 스팬·코드블록 안의 폴더 링크는 링크가 아니다(T-062 자기 오탐 방지)'
$r = Invoke-Check @($inCode)
Assert-That ($r.ExitCode -eq 0) '백틱 코드 스팬 안이면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
$r = Invoke-Check @($inFence)
Assert-That ($r.ExitCode -eq 0) '펜스 코드블록 안이면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 8: 대상이 없는 상대경로 링크 → 거부 (T-062 계열) ────────────────
# 폴더 이전(claude-docs/ → docs/) 때 링크가 안 따라가 7건이 조용히 깨져 있었다.
# 규칙 2(폴더 링크)로는 안 잡힌다 — 형태가 아니라 **대상 존재**의 문제다.
$brokenLink = New-Md 'i.md' "---`ntags:`n  - type/meta`n---`n`n[없는 문서](nope/gone.md)`n"
$anchorLink = New-Md 'j.md' "---`ntags:`n  - type/meta`n---`n`n[앵커](a.md#어떤-절)`n"
$extLink    = New-Md 'k.md' "---`ntags:`n  - type/meta`n---`n`n[웹](https://example.com) · [메일](mailto:x@y.z) · [본문](#절)`n"
$nmLink     = New-Md 'l.md' "---`ntags:`n  - type/meta`n---`n`n[넥스트 문서](node_modules/next/dist/docs/x.md)`n"

Write-Host '케이스 8: 대상이 없는 상대경로 링크는 거부한다'
$r = Invoke-Check @($brokenLink)
Assert-That ($r.ExitCode -ne 0) '대상 없는 링크면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
Assert-That ($r.Output.Contains('nope/gone.md')) '어느 링크가 깨졌는지 알려준다' $r.Output
Assert-That ($r.Output -match 'LINKS-CHECK:\s*MISSING') '대상 누락 전용 ASCII 마커' $r.Output

Write-Host '케이스 9: 앵커·외부·node_modules 는 대상 검사에서 제외한다(오탐 방지)'
$r = Invoke-Check @($anchorLink)
Assert-That ($r.ExitCode -eq 0) '#앵커가 붙어도 본체가 있으면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
$r = Invoke-Check @($extLink)
Assert-That ($r.ExitCode -eq 0) 'http·mailto·본문앵커는 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
$r = Invoke-Check @($nmLink)
Assert-That ($r.ExitCode -eq 0) 'node_modules 대상은 검사 제외라 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 10: 코드 스팬 제거가 **없던 링크를 만들면 안 된다** ─────────────
# `[계속]`onContinue()`(→ toEpilogue)` 는 ']' 뒤가 '(' 가 아니라 백틱이라 링크가
# 아니다. 코드 스팬을 빈 문자열로 지우면 둘이 붙어 가짜 링크가 만들어진다 —
# 실제 저장소 전수 검사에서 이 오탐 1건이 나왔다.
$spanGap = New-Md 'm.md' ("---`ntags:`n  - type/meta`n---`n`n- [계속]" + $bt + "onContinue()" + $bt + "(nope/gone.md) 설명`n")

Write-Host '케이스 10: 코드 스팬을 걷어내며 없던 링크를 만들어내지 않는다(오탐 방지)'
$r = Invoke-Check @($spanGap)
Assert-That ($r.ExitCode -eq 0) '] 뒤가 백틱이면 링크가 아니라 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 결과 ───────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "결과: $($script:passCount) PASS / $($script:failCount) FAIL" -ForegroundColor Cyan

if (-not $script:positiveControlOk) {
    Write-Host ''
    Write-Host '⚠️  POSITIVE CONTROL 실패 — 유효한 입력에 대한 통과가 확인되지 않았다.' -ForegroundColor Yellow
    Write-Host '    fail-close라 스크립트가 깨져 있으면 거부 케이스가 전부 거짓 통과한다.' -ForegroundColor Yellow
}

if (Test-Path $fixtureRoot) { Remove-Item $fixtureRoot -Recurse -Force }

if ($script:failCount -gt 0 -or -not $script:positiveControlOk) { exit 1 }
exit 0
