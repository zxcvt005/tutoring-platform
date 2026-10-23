@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo === Неодин: локальный запуск БЕЗ перезаписи seed ===
echo.

call npm run start:local:keep
if errorlevel 1 (
  echo.
  echo Ошибка запуска.
  pause
  exit /b 1
)

pause
