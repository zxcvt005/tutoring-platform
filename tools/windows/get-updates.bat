@echo off
REM Получить обновления с remote: обычный git pull (без --force).
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo.
echo === Получить обновления (git pull) ===
echo Каталог: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Git не найден. Установите Git for Windows: https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
if not defined BRANCH (
  echo [ОШИБКА] Это не git-репозиторий или git недоступен.
  echo.
  pause
  exit /b 1
)

echo Текущая ветка: %BRANCH%
echo Ожидаемая рабочая ветка: cursor/local-windows-dev-8154
if /I not "%BRANCH%"=="cursor/local-windows-dev-8154" (
  echo.
  echo [ВНИМАНИЕ] Вы не на cursor/local-windows-dev-8154.
  echo Сначала запустите use-latest-branch.bat или: git checkout cursor/local-windows-dev-8154
  echo.
)

echo.
echo Выполняю: git pull
git pull
if errorlevel 1 (
  echo.
  echo [ОШИБКА] git pull не удался.
  echo Частые причины: нет интернета; remote недоступен; есть конфликты после правок.
  echo Не делайте force-push. При конфликте лучше спросить Cursor или сохранить работу через save-my-work.bat.
  echo.
  pause
  exit /b 1
)

echo.
echo Готово. Обновления подтянуты ^(если были^).
echo.
pause
endlocal
