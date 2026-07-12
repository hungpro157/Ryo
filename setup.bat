@echo off
cd /d "%~dp0"
where node >nul 2>nul || (
  echo Node.js was not found. Install Node.js 22 LTS first.
  pause
  exit /b 1
)
where ollama >nul 2>nul || (
  echo Ollama was not found. Install Ollama for Windows first.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
call npm.cmd install
ollama pull qwen3:4b-instruct
ollama pull qwen3-embedding:0.6b
echo.
echo Setup complete. Edit .env and add DISCORD_TOKEN, then run start.bat.
pause
