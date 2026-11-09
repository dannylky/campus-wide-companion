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

powershell -NoProfile -Command "if (Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'mirabox-knob-led' }) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo.
  echo The knob LED effect is already running.
  echo Use stop-knob-led.bat first.
  echo.
  pause
  exit /b 1
)

set "MODE=%~1"
if "%MODE%"=="" set "MODE=random"

if /i "%MODE%"=="demo" (
  echo Starting knob LEDs in demo mode: follow light/volume zones.
  echo Press Ctrl+C to stop.
  echo.
  node tools\mirabox-knob-led.mjs --demo --watch --interval 500 --brightness 100
) else (
  echo Starting knob LEDs in random mode: new palette on every knob press.
  echo Press Ctrl+C to stop.
  echo.
  node tools\mirabox-knob-led.mjs --random --watch --interval 250 --brightness 100
)

echo.
echo Knob LED effect stopped.
pause
