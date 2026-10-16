@echo off
REM Сохранить работу локально: status → add → commit. БЕЗ push.
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo.
echo === Сохранить работу локально (без отправки) ===
echo Каталог: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Git не найден. Установите Git for Windows.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
echo Ветка: %BRANCH%
echo.
echo --- git status ---
git status
echo.

git status --porcelain > "%TEMP%\naemnye-git-status.txt" 2>nul
for %%A in ("%TEMP%\naemnye-git-status.txt") do set "SZ=%%~zA"
if "%SZ%"=="0" (
  echo Нечего коммитить — изменений нет.
  echo.
  pause
  exit /b 0
)

REM Безопасное сообщение без символов даты Windows (слэши ломают -m)
set "MSG=Local Windows save"
echo Сообщение коммита по умолчанию: %MSG%
echo.
set /p "CUSTOM=Другое сообщение (Enter = оставить как есть): "
if not "%CUSTOM%"=="" set "MSG=%CUSTOM%"

echo.
echo Выполняю: git add -A
git add -A
if errorlevel 1 (
  echo [ОШИБКА] git add не удался.
  echo.
  pause
  exit /b 1
)

echo Выполняю: git commit
git commit -m "%MSG%"
if errorlevel 1 (
  echo.
  echo [ОШИБКА] commit не создан (возможно, не настроены user.name / user.email).
  echo Один раз выполните:
  echo   git config --global user.name "Ваше Имя"
  echo   git config --global user.email "you@example.com"
  echo.
  pause
  exit /b 1
)

echo.
echo Готово: изменения сохранены ЛОКАЛЬНО.
echo На GitHub / remote они ещё НЕ отправлены.
echo Чтобы отправить: send-to-github.bat ^(когда remote = github.com^).
echo.
git log -1 --oneline
echo.
pause
endlocal
