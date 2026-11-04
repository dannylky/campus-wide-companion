@echo off
setlocal
cd /d "%~dp0"

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8090"
set "HOST=127.0.0.1"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js was not found on this system.
  echo Install it from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo No .env file found. Starting with the synthetic campus and offline AI fallback.
  echo To connect a live Companion host, copy .env.example to .env and edit COMPANION_HOSTS.
  echo.
)

echo Starting Campus Wide Companion on http://%HOST%:%PORT%
echo Press Ctrl+C in this window to stop the server.
echo.

if /i "%NO_BROWSER%"=="1" goto run
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" http://%HOST%:%PORT%"

:run
set "PORT=%PORT%"
set "HOST=%HOST%"
node server.js

echo.
echo Server stopped.
pause
