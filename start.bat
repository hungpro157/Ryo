@echo off
cd /d "%~dp0"
if not exist .env (
  echo Missing .env. Copy .env.example to .env and add DISCORD_TOKEN.
  pause
  exit /b 1
)
npm.cmd start
pause
