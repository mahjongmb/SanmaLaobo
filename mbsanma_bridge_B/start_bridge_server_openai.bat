@echo off
setlocal

cd /d "%~dp0"

echo [bridge:D2] checking environment...

if "%OPENAI_API_KEY%"=="" (
  echo [bridge:D2] OPENAI_API_KEY is not set.
  echo.
  echo Run this in cmd first:
  echo setx OPENAI_API_KEY "your_api_key"
  echo.
  pause
  exit /b 1
)

node -v >nul 2>&1
if errorlevel 1 (
  echo [bridge:D2] node was not found.
  echo Please install Node.js and try again.
  echo.
  pause
  exit /b 1
)

echo [bridge:D2] starting OpenAI bridge server...
node server.js

echo.
echo [bridge:D2] server stopped.
pause
