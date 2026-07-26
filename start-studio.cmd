@echo off
chcp 65001 > nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-studio.ps1"
if errorlevel 1 (
  echo.
  echo 실행하지 못했습니다. 위 오류 메시지를 확인해 주세요.
  pause
)
