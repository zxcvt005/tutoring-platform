@echo off
REM Переключиться на рабочую ветку и подтянуть обновления.
REM При незакоммиченных изменениях — ОТКАЗ (без stash/reset).
setlocal EnableExtensions
cd /d "%~dp0..\.."

set "TARGET=cursor/local-windows-dev-8154"

echo.
echo === Перейти на ветку %TARGET% ===
echo Каталог: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Git не найден.
  echo.
  pause
  exit /b 1
)

git status --porcelain > "%TEMP%\naemnye-dirty.txt" 2>nul
for %%A in ("%TEMP%\naemnye-dirty.txt") do set "SZ=%%~zA"
if not "%SZ%"=="0" (
  echo [ОТКАЗ] Есть незакоммиченные изменения. Переключение опасно.
  echo.
  git status --short
  echo.
  echo Сначала сохраните работу: save-my-work.bat
  echo ^(Мы специально НЕ делаем stash и НЕ делаем reset.^)
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
echo Текущая ветка: %BRANCH%

echo.
echo Выполняю: git fetch
git fetch
if errorlevel 1 (
  echo [ОШИБКА] git fetch не удался ^(сеть / remote^).
  echo.
  pause
  exit /b 1
)

echo Выполняю: git checkout %TARGET%
git checkout "%TARGET%"
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Не удалось переключиться на %TARGET%.
  echo Возможно, ветки ещё нет локально. Попробуйте:
  echo   git checkout -b %TARGET% origin/%TARGET%
  echo или клонируйте репозиторий заново с этой веткой.
  echo.
  pause
  exit /b 1
)

echo Выполняю: git pull
git pull
if errorlevel 1 (
  echo.
  echo [ОШИБКА] git pull не удался после checkout.
  echo.
  pause
  exit /b 1
)

echo.
echo Готово. Вы на:
git rev-parse --abbrev-ref HEAD
git log -1 --oneline
echo.
echo Дальше: start.bat
echo.
pause
endlocal
