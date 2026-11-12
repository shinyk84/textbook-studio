@echo off
chcp 65001 > nul
rem 교과서 자료 전처리기 실행. 이 파일 위에 PDF·HWP·HWPX 파일이나 폴더를 끌어다 놓아도 됩니다.
where pythonw > nul 2> nul
if %errorlevel%==0 (
  start "" pythonw "%~dp0preprocessor\gui.py" %*
) else (
  python "%~dp0preprocessor\gui.py" %*
  if errorlevel 1 pause
)
