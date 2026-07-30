@echo off
setlocal
cd /d "%~dp0"

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [오류] Git 저장소에서 실행해 주세요.
  pause
  exit /b 1
)

git config core.hooksPath .githooks
if errorlevel 1 (
  echo [오류] Git Hook 설정을 저장하지 못했습니다.
  pause
  exit /b 1
)

echo.
echo 작업 기록 확인 Hook이 활성화되었습니다.
echo 이제 코드 변경을 푸시할 때 WORKLOG.md 누락을 자동으로 확인합니다.
echo.
pause
endlocal
