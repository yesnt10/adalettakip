@echo off
setlocal
cd /d "%~dp0"
set "GITHUB_CLI=gh"
where gh >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "GITHUB_CLI=%ProgramFiles%\GitHub CLI\gh.exe"
  if exist "%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe" set "GITHUB_CLI=%LOCALAPPDATA%\Programs\GitHub CLI\gh.exe"
)
"%GITHUB_CLI%" workflow run telegram-pages.yml --ref main
if errorlevel 1 (
  echo Kontrol baslatilamadi. GitHub CLI kurulumunu ve oturumunu kontrol et.
  pause
  exit /b 1
)
echo Telegram kontrolu GitHub Actions'ta baslatildi.
echo Kontrolun sonucunu yukaridaki baglantidan gorebilirsin.
pause
