# test-rebuild-troubleshooting-index.ps1
#
# ⚠️ 이 파일은 반드시 UTF-8 **BOM 포함**으로 저장해야 한다(T-026 계열).
#    PowerShell 5.1은 BOM 없는 UTF-8을 CP949로 잘못 읽어 아래 한글 리터럴이 깨진다.
#    픽스처가 한글이라 BOM이 떨어지면 이 테스트는 "한글이 안 맞는다"고 거짓 실패한다.
#
# rebuild-troubleshooting-index.ps1의 테스트.
#
# ⚠️ positive control (T-045): 이 스크립트는 **fail-close**다(문제가 있으면 exit 1).
#    그래서 "거부되어야 정상"인 케이스만으로는 스크립트가 아예 없어도 전부 초록이 된다
#    — 파일이 없으면 PowerShell이 exit 1을 내므로 deny 케이스가 그대로 통과한다.
#    따라서 **통과 케이스(exit 0 기대)가 나머지의 유효성 조건**이다. T-045의 fail-open
#    사례와 방향만 뒤집어 같은 규칙을 적용한다. 아래 SANITY + 케이스 1/7/8이 그 역할.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'rebuild-troubleshooting-index.ps1'

# ── SANITY ─────────────────────────────────────────────────────────────────
# 스크립트가 없으면 deny 케이스가 "통과"해 가짜 그린이 된다(T-045). 돌리지 않고 abort.
if (-not (Test-Path $scriptPath)) {
    Write-Host "SANITY FAIL: $scriptPath 가 없다." -ForegroundColor Red
    Write-Host "  스크립트가 없으면 'exit 1을 기대'하는 케이스들이 전부 거짓 통과한다." -ForegroundColor Red
    Write-Host "  가짜 그린을 만드느니 안 도는 게 낫다 — 테스트를 돌리지 않고 중단한다." -ForegroundColor Red
    exit 2
}

# 픽스처는 **짧은 경로**에 만든다 — T-045에서 스크래치패드(130자)가 MAX_PATH(260)를
# 넘겨 git이 조용히 죽었다. 여기선 git을 안 쓰지만 같은 규칙을 지킨다.
$fixtureRoot = Join-Path $env:TEMP 'tsi'

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

function New-Fixture {
    <#
    깨끗한 픽스처를 만든다: <root>/claude-docs/troubleshooting.md (허브, 마커 포함)
                            <root>/claude-docs/troubleshooting/*.md (항목)
    반환: 허브 경로
    #>
    param([hashtable[]]$Entries)

    if (Test-Path $fixtureRoot) { Remove-Item $fixtureRoot -Recurse -Force }
    $docsDir = Join-Path $fixtureRoot 'claude-docs'
    $itemsDir = Join-Path $docsDir 'troubleshooting'
    New-Item -ItemType Directory -Path $itemsDir -Force | Out-Null

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)

    $hub = @"
# troubleshooting — 함정 + 승격

> 사람이 쓴 머리말. 이 줄은 스크립트가 건드리면 안 된다.

## 목차

<!-- INDEX:START -->
낡은 내용 — 재생성되면 사라져야 한다.
<!-- INDEX:END -->

## 사람이 쓴 꼬리말

이 줄도 보존되어야 한다.
"@
    $hubPath = Join-Path $docsDir 'troubleshooting.md'
    [System.IO.File]::WriteAllText($hubPath, $hub, $utf8NoBom)

    foreach ($e in $Entries) {
        $fm = "---`nsummary: $($e.Summary)`n"
        if ($e.ContainsKey('Promoted') -and $e.Promoted) { $fm += "promoted: $($e.Promoted)`n" }
        $fm += "---`n`n"

        $h1 = if ($e.ContainsKey('H1Id')) { $e.H1Id } else { $e.Id }
        $body = "# $h1 · $($e.Title)`n`n"
        if (-not ($e.ContainsKey('OmitFields') -and $e.OmitFields)) {
            $body += "- **증상**: 무언가 이상하다.`n"
            $body += "- **원인**: 이유가 있었다.`n"
            $body += "- **해결**: 이렇게 고쳤다.`n"
            $body += "- **재발방지**: 다시는 이러지 않는다.`n"
        } else {
            $body += "- **증상**: 무언가 이상하다.`n"
            $body += "- **원인**: 이유가 있었다.`n"
            $body += "- **해결**: 이렇게 고쳤다.`n"
        }

        $itemPath = Join-Path $itemsDir "$($e.Id).md"
        [System.IO.File]::WriteAllText($itemPath, ($fm + $body), $utf8NoBom)
    }

    return $hubPath
}

function Invoke-Rebuild {
    param([string]$HubPath, [switch]$Check)
    $args = @('-NoProfile', '-NonInteractive', '-File', $scriptPath, '-HubPath', $HubPath)
    if ($Check) { $args += '-Check' }
    $out = & powershell.exe @args 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out | Out-String) }
}

function Get-Hub { param([string]$Path) [System.IO.File]::ReadAllText($Path) }

Write-Host ''
Write-Host 'rebuild-troubleshooting-index — 테스트' -ForegroundColor Cyan
Write-Host ''

# ── 케이스 1: 정상 2건 → exit 0 + 인덱스 생성 (POSITIVE CONTROL) ───────────
Write-Host '케이스 1: 유효한 항목 2건이면 인덱스를 만들고 exit 0 (positive control)'
$hub = New-Fixture @(
    @{ Id = 'T-001'; Title = '첫 번째 함정'; Summary = '첫 번째 요약' },
    @{ Id = 'T-002'; Title = '두 번째 함정'; Summary = '두 번째 요약' }
)
$r = Invoke-Rebuild -HubPath $hub
Assert-That ($r.ExitCode -eq 0) '유효한 입력이면 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
$content = Get-Hub $hub
Assert-That ($content.Contains('[T-001](troubleshooting/T-001.md) · 첫 번째 요약')) 'T-001 항목이 인덱스에 있다'
Assert-That ($content.Contains('[T-002](troubleshooting/T-002.md) · 두 번째 요약')) 'T-002 항목이 인덱스에 있다'
if ($r.ExitCode -eq 0 -and $content.Contains('[T-001](troubleshooting/T-001.md)')) {
    $script:positiveControlOk = $true
}

# ── 케이스 2: 역순 정렬 (최신이 위) ────────────────────────────────────────
Write-Host '케이스 2: 인덱스는 최신 항목이 위로 오는 역순이다'
$hub = New-Fixture @(
    @{ Id = 'T-001'; Title = '오래된 것'; Summary = '오래된 요약' },
    @{ Id = 'T-003'; Title = '최신'; Summary = '최신 요약' },
    @{ Id = 'T-002'; Title = '중간'; Summary = '중간 요약' }
)
$r = Invoke-Rebuild -HubPath $hub
$content = Get-Hub $hub
$i3 = $content.IndexOf('T-003')
$i2 = $content.IndexOf('T-002')
$i1 = $content.IndexOf('T-001')
Assert-That ($i3 -ge 0 -and $i2 -gt $i3 -and $i1 -gt $i2) '역순(T-003 → T-002 → T-001)으로 나열된다' "위치: T-003=$i3 T-002=$i2 T-001=$i1"

# ── 케이스 3: 사람이 쓴 마커 밖 내용 보존 ──────────────────────────────────
Write-Host '케이스 3: 마커 밖의 사람이 쓴 내용은 보존된다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
$r = Invoke-Rebuild -HubPath $hub
$content = Get-Hub $hub
Assert-That ($content.Contains('사람이 쓴 머리말')) '머리말이 보존된다'
Assert-That ($content.Contains('이 줄도 보존되어야 한다')) '꼬리말이 보존된다'
Assert-That (-not $content.Contains('낡은 내용')) '마커 안의 낡은 내용은 교체된다'

# ── 케이스 4: promoted 표시 ────────────────────────────────────────────────
Write-Host '케이스 4: promoted가 있으면 인덱스에 표시된다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약'; Promoted = '훅 승격' })
$r = Invoke-Rebuild -HubPath $hub
$content = Get-Hub $hub
Assert-That ($content.Contains('**→ 훅 승격**')) 'promoted가 인덱스에 표시된다' $content

# ── 케이스 4b: 따옴표로 시작하는 summary 보존 ──────────────────────────────
# 실제 T-040의 요약이 `"관계로 잠근다"면서 …` 로 **따옴표로 시작**한다. YAML 인용부호를
# 벗기려고 Trim('"')를 쓰면 이 앞따옴표를 잘라먹는다 — 마이그레이션에서 실제로 났다.
Write-Host '케이스 4b: 따옴표로 시작하는 summary의 따옴표를 잘라먹지 않는다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '"관계로 잠근다"면서 자릿수를 씀' })
$r = Invoke-Rebuild -HubPath $hub
$content = Get-Hub $hub
Assert-That ($content.Contains('· "관계로 잠근다"면서 자릿수를 씀')) '앞뒤 따옴표가 보존된다' $content

# ── 케이스 4c: YAML 인용부호는 벗긴다 ──────────────────────────────────────
Write-Host '케이스 4c: 값 전체를 감싼 YAML 인용부호는 벗긴다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '"전체가 감싸진 값"' })
$r = Invoke-Rebuild -HubPath $hub
$content = Get-Hub $hub
Assert-That ($content.Contains('· 전체가 감싸진 값')) '감싼 인용부호는 제거된다' $content

# ── 케이스 5: H1 불일치 → 거부 ─────────────────────────────────────────────
Write-Host '케이스 5: 파일명과 H1의 T번호가 다르면 거부한다'
$hub = New-Fixture @(@{ Id = 'T-001'; H1Id = 'T-999'; Title = '함정'; Summary = '요약' })
$r = Invoke-Rebuild -HubPath $hub
Assert-That ($r.ExitCode -ne 0) 'H1 불일치면 exit != 0' "실제 exit=$($r.ExitCode)"
Assert-That ($r.Output.Contains('T-001')) '어느 파일이 문제인지 알려준다' $r.Output

# ── 케이스 6: summary 누락 → 거부 ──────────────────────────────────────────
Write-Host '케이스 6: frontmatter에 summary가 없으면 거부한다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
# summary 줄을 제거해 frontmatter를 비운다
$itemPath = Join-Path (Join-Path (Split-Path $hub) 'troubleshooting') 'T-001.md'
$txt = [System.IO.File]::ReadAllText($itemPath)
$txt = $txt.Replace("summary: 요약`n", '')
[System.IO.File]::WriteAllText($itemPath, $txt, (New-Object System.Text.UTF8Encoding($false)))
$r = Invoke-Rebuild -HubPath $hub
Assert-That ($r.ExitCode -ne 0) 'summary가 없으면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 7: 4필드 스키마 누락 → 거부 ─────────────────────────────────────
# 이게 '병 B'(항목당 길이 6.8배)에 대한 브레이크다. 스키마가 줄 수를 9로 잠갔다는
# 실측(T-027~T-046)이 근거 — 스키마 없는 changeLog는 무제한으로 자랐다.
Write-Host '케이스 7: 4필드(증상/원인/해결/재발방지) 중 하나라도 빠지면 거부한다'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약'; OmitFields = $true })
$r = Invoke-Rebuild -HubPath $hub
Assert-That ($r.ExitCode -ne 0) '재발방지가 없으면 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"
Assert-That ($r.Output.Contains('재발방지')) '어느 필드가 빠졌는지 알려준다' $r.Output

# ── 케이스 8: -Check 모드가 최신 인덱스를 통과시킨다 (POSITIVE CONTROL) ────
Write-Host '케이스 8: -Check는 인덱스가 최신이면 exit 0 (positive control)'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
$null = Invoke-Rebuild -HubPath $hub          # 먼저 최신화
$r = Invoke-Rebuild -HubPath $hub -Check      # 그다음 검사
Assert-That ($r.ExitCode -eq 0) '최신이면 -Check가 exit 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 9: -Check 모드가 stale 인덱스를 거부한다 ────────────────────────
Write-Host '케이스 9: -Check는 인덱스가 stale하면 exit 1 (목차 12 동결의 재발 차단)'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
$null = Invoke-Rebuild -HubPath $hub
# 항목을 하나 추가한다 = 인덱스가 stale해진다 (T-037~T-041에서 실제로 6번 일어난 일)
$itemsDir = Join-Path (Split-Path $hub) 'troubleshooting'
$new = "---`nsummary: 새 요약`n---`n`n# T-002 · 새 함정`n`n- **증상**: 무언가 이상하다.`n- **원인**: 이유가 있었다.`n- **해결**: 이렇게 고쳤다.`n- **재발방지**: 다시는 이러지 않는다.`n"
[System.IO.File]::WriteAllText((Join-Path $itemsDir 'T-002.md'), $new, (New-Object System.Text.UTF8Encoding($false)))
$r = Invoke-Rebuild -HubPath $hub -Check
Assert-That ($r.ExitCode -ne 0) 'stale하면 -Check가 exit != 0' "실제 exit=$($r.ExitCode)`n$($r.Output)"

# ── 케이스 10: -Check는 파일을 수정하지 않는다 ─────────────────────────────
Write-Host '케이스 10: -Check는 파일을 건드리지 않는다(읽기 전용)'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
$before = Get-Hub $hub
$null = Invoke-Rebuild -HubPath $hub -Check
$after = Get-Hub $hub
Assert-That ($before -eq $after) '-Check 후에도 허브 내용이 그대로다'

# ── 케이스 11: LF 파일의 EOL을 보존한다 ───────────────────────────────────
# 글로벌 규칙 3: "파일 재생성 시 BOM·EOL 바이트 보존 — 안 지키면 한 줄 고치려다 파일
# 전체가 phantom diff". StringBuilder.AppendLine()은 Windows에서 CRLF를 내므로, LF 파일에
# 쓰면 혼합 EOL이 된다(실제로 마이그레이션에서 CRLF 26줄 + LF 34줄이 나왔다).
function Set-Eol {
    param([string]$Path, [string]$Eol)
    $t = [System.IO.File]::ReadAllText($Path)
    $t = $t -replace "`r`n", "`n"
    if ($Eol -eq 'CRLF') { $t = $t -replace "`n", "`r`n" }
    [System.IO.File]::WriteAllText($Path, $t, (New-Object System.Text.UTF8Encoding($false)))
}
function Get-EolKind {
    param([string]$Path)
    $b = [System.IO.File]::ReadAllBytes($Path)
    $s = [System.Text.Encoding]::UTF8.GetString($b)
    $crlf = ([regex]::Matches($s, "`r`n")).Count
    $lf = ([regex]::Matches($s, "`n")).Count - $crlf
    if ($crlf -gt 0 -and $lf -gt 0) { return 'MIXED' }
    if ($crlf -gt 0) { return 'CRLF' }
    return 'LF'
}

Write-Host '케이스 11: LF 허브를 재생성해도 전부 LF로 남는다(EOL 보존)'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
Set-Eol -Path $hub -Eol 'LF'
$r = Invoke-Rebuild -HubPath $hub
$kind = Get-EolKind $hub
Assert-That ($kind -eq 'LF') 'LF 허브가 재생성 후에도 LF' "실제: $kind"

# ── 케이스 12: CRLF 파일의 EOL도 보존한다 ─────────────────────────────────
Write-Host '케이스 12: CRLF 허브를 재생성해도 전부 CRLF로 남는다(EOL 보존)'
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
Set-Eol -Path $hub -Eol 'CRLF'
$r = Invoke-Rebuild -HubPath $hub
$kind = Get-EolKind $hub
Assert-That ($kind -eq 'CRLF') 'CRLF 허브가 재생성 후에도 CRLF' "실제: $kind"

# ── 케이스 13: EOL이 달라도 -Check가 stale로 오판하지 않는다 ──────────────
# EOL을 안 맞추면 newHub != hubText 가 항상 참이 되어 -Check가 영구 stale을 뱉는다.
Write-Host '케이스 13: 재생성 직후 -Check가 최신으로 판정한다 (LF·CRLF 양쪽)'
foreach ($eol in @('LF', 'CRLF')) {
    $hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
    Set-Eol -Path $hub -Eol $eol
    $null = Invoke-Rebuild -HubPath $hub
    $r = Invoke-Rebuild -HubPath $hub -Check
    Assert-That ($r.ExitCode -eq 0) "$eol 허브: 재생성 직후 -Check가 exit 0" "실제 exit=$($r.ExitCode)`n$($r.Output)"
}

# ── 케이스 14: 기계가 읽을 ASCII 상태 마커 ────────────────────────────────
# 왜 ASCII인가: 이 스크립트의 출력을 Git Bash 훅(sh)이 읽어 판정한다. PowerShell 5.1이
# 콘솔로 내보내는 한글은 CP949라 bash에서 깨진다(`목차` → `������`) — 실제로 훅의 첫
# 실전에서 한글 매칭이 실패해 "검사가 안 돌았다"고 오판했다. 사람이 읽는 문장은 한글로
# 두되, **기계 판정은 ASCII 마커로** 한다. 글로벌 규칙 2(인라인 한글 CP949)의 출력판.
Write-Host '케이스 14: 모든 종료 경로가 ASCII 상태 마커를 출력한다(sh 훅이 읽는다)'

$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약' })
$r = Invoke-Rebuild -HubPath $hub
Assert-That ($r.Output -match 'INDEX-CHECK:\s*REBUILT') '재생성 성공 시 REBUILT 마커' $r.Output

$r = Invoke-Rebuild -HubPath $hub -Check
Assert-That ($r.Output -match 'INDEX-CHECK:\s*OK') '-Check 최신 시 OK 마커' $r.Output

# stale 만들기
$itemsDir = Join-Path (Split-Path $hub) 'troubleshooting'
$new = "---`nsummary: 새 요약`n---`n`n# T-002 · 새 함정`n`n- **증상**: a`n- **원인**: b`n- **해결**: c`n- **재발방지**: d`n"
[System.IO.File]::WriteAllText((Join-Path $itemsDir 'T-002.md'), $new, (New-Object System.Text.UTF8Encoding($false)))
$r = Invoke-Rebuild -HubPath $hub -Check
Assert-That ($r.Output -match 'INDEX-CHECK:\s*STALE') '-Check stale 시 STALE 마커' $r.Output

# 형식 위반
$hub = New-Fixture @(@{ Id = 'T-001'; Title = '함정'; Summary = '요약'; OmitFields = $true })
$r = Invoke-Rebuild -HubPath $hub -Check
Assert-That ($r.Output -match 'INDEX-CHECK:\s*INVALID') '형식 위반 시 INVALID 마커' $r.Output

# 마커는 ASCII여야 한다 — 한글이 섞이면 bash에서 깨져 판정이 무너진다
# @(...)로 배열 강제 — 결과가 1건이면 PowerShell이 문자열을 주고 [0]이 첫 '글자'가 된다.
$markerLine = @($r.Output -split "`r?`n" | Where-Object { $_ -match 'INDEX-CHECK:' })[0]
$isAscii = $true
foreach ($ch in $markerLine.ToCharArray()) { if ([int]$ch -gt 127) { $isAscii = $false; break } }
Assert-That $isAscii '마커 줄이 순수 ASCII다' "실제: $markerLine"

# ── 결과 ───────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host "결과: $($script:passCount) PASS / $($script:failCount) FAIL" -ForegroundColor Cyan

if (-not $script:positiveControlOk) {
    Write-Host ''
    Write-Host '⚠️  POSITIVE CONTROL 실패 — 유효한 입력에 대한 인덱스 생성이 확인되지 않았다.' -ForegroundColor Yellow
    Write-Host '    이 스크립트는 fail-close라, 스크립트가 깨져 있으면 "거부되어야 정상"인' -ForegroundColor Yellow
    Write-Host '    케이스들이 전부 거짓 통과한다. 위의 PASS 들을 그린으로 취급하지 마라.' -ForegroundColor Yellow
    Write-Host '    (T-045: 검증이 0이어도 전부 그린으로 보이는 계열)' -ForegroundColor Yellow
}

if (Test-Path $fixtureRoot) { Remove-Item $fixtureRoot -Recurse -Force }

if ($script:failCount -gt 0 -or -not $script:positiveControlOk) { exit 1 }
exit 0
