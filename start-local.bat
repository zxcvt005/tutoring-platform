@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo === Неодин: локальный запуск ===
echo База + миграции + тестовая школа + сайт на порту 43127
echo Остановка: Ctrl+C в этом окне
echo.

call npm run start:local
if errorlevel 1 (
  echo.
  echo Ошибка запуска. Если порт 43127 занят — закройте старый npm run dev:local.
  pause
  exit /b 1
)

pause
