param(
    [switch]$Remove
)

# 교과서 스튜디오 자동 실행 설치
#  - 시작프로그램: Windows에 로그인하면 서버를 화면 없이 켠다(브라우저는 열지 않음).
#  - 바탕화면 아이콘 "YBM 교과서 스튜디오": 누르면 서버가 꺼져 있으면 켜고 브라우저로 연다.
#  -Remove 를 붙이면 두 바로가기를 지운다.

$ErrorActionPreference = "Stop"
$studioRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startScript = Join-Path $studioRoot "start-studio.ps1"
$startup = [Environment]::GetFolderPath("Startup")
$desktop = [Environment]::GetFolderPath("Desktop")
$startupLink = Join-Path $startup "YBM 교과서 스튜디오 서버.lnk"
$desktopLink = Join-Path $desktop "YBM 교과서 스튜디오.lnk"

if ($Remove) {
    foreach ($link in @($startupLink, $desktopLink)) {
        if (Test-Path $link) { Remove-Item $link -Force }
    }
    Write-Host "자동 실행과 바탕화면 아이콘을 지웠습니다."
    exit 0
}

$powershell = (Get-Command powershell.exe).Source
$shell = New-Object -ComObject WScript.Shell

$link = $shell.CreateShortcut($startupLink)
$link.TargetPath = $powershell
$link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`" -NoBrowser"
$link.WorkingDirectory = $studioRoot
$link.WindowStyle = 7
$link.Description = "로그인할 때 교과서 스튜디오 서버를 켭니다."
$link.Save()

$link = $shell.CreateShortcut($desktopLink)
$link.TargetPath = $powershell
$link.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startScript`""
$link.WorkingDirectory = $studioRoot
$link.WindowStyle = 7
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$link.Description = "교과서 스튜디오를 브라우저로 엽니다(서버가 꺼져 있으면 켭니다)."
$link.Save()

Write-Host "설치했습니다."
Write-Host " - 시작프로그램: $startupLink"
Write-Host " - 바탕화면: $desktopLink"
Write-Host "이제 컴퓨터를 켜고 로그인하면 서버가 저절로 켜지고, 바탕화면의 'YBM 교과서 스튜디오'를 누르면 바로 열립니다."
