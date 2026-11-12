@echo off
chcp 65001 > nul
rem 로그인하면 교과서 스튜디오 서버가 저절로 켜지게 하고, 바탕화면에 "YBM 교과서 스튜디오" 아이콘을 만듭니다.
rem 지우려면: powershell -ExecutionPolicy Bypass -File install-autostart.ps1 -Remove
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"
echo.
pause
