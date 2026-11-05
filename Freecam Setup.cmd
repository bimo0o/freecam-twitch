@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then run Freecam Setup again.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\vite.cmd" (
  call npm ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm run setup:ui
if errorlevel 1 pause
