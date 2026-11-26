@echo off
setlocal
cd /d "%~dp0"
set "GITHUB_CLI=gh"
where gh >nul 2>&1
if errorlevel 1 (
  for /d %%G in ("%TEMP%\adalettakip-gh-cli\gh_*") do if exist "%%~fG\bin\gh.exe" set "GITHUB_CLI=%%~fG\bin\gh.exe"
)
"%GITHUB_CLI%" workflow run telegram-pages.yml --ref main
if errorlevel 1 (
  echo Kontrol baslatilamadi. GitHub CLI kurulumunu ve oturumunu kontrol et.
  pause
  exit /b 1
)
echo Telegram kontrolu GitHub Actions'ta baslatildi.
"%GITHUB_CLI%" workflow view telegram-pages.yml --web
pause
