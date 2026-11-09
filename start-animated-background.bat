@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this system.
  echo Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'mirabox-animated-background' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo.
  echo The animated background compositor is already running.
  echo Use stop-animated-background.bat first.
  echo.
  pause
  exit /b 1
)

echo Starting animated N4 Pro background compositor...
echo.
echo Keep this window open while you want the animation.
echo Press Ctrl+C to stop; Companion will repaint its buttons on the next update.
echo.

node tools\mirabox-animated-background.mjs --fps 5 --speed 4

echo.
echo Compositor stopped.
pause
