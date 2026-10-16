@echo off
REM Единый локальный запуск: Дирекция / Кафедра / Аудитория
REM Один Next.js-сервер, порт 43127.
setlocal
cd /d "%~dp0"

set PORT=43127
set HOST=0.0.0.0

echo.
echo === Прототип: три кабинета на одном порту ===
echo   http://127.0.0.1:%PORT%/
echo   http://127.0.0.1:%PORT%/direkciya
echo   http://127.0.0.1:%PORT%/kafedra
echo   http://127.0.0.1:%PORT%/auditoria
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден. Установите LTS с https://nodejs.org/ и снова запустите start.bat
  exit /b 1
)

if not exist "node_modules\" (
  echo Устанавливаю зависимости ^(npm install^)...
  call npm install
  if errorlevel 1 exit /b 1
)

echo Запуск next dev на %HOST%:%PORT% ^(Ctrl+C — остановить^)...
call npm run dev:local
endlocal
