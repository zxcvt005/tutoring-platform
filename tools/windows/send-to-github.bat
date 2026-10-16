@echo off
REM Обычный push текущей ветки. Без --force. Не путать Origin agent_temp с GitHub.
setlocal EnableExtensions
cd /d "%~dp0..\.."

echo.
echo === Отправить на remote (git push) ===
echo Каталог: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Git не найден.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "BRANCH=%%b"
echo Ветка: %BRANCH%

for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set "ORIGIN_URL=%%u"
if not defined ORIGIN_URL (
  echo.
  echo [ОШИБКА] Remote «origin» не настроен.
  echo.
  echo Remote origin не настроен.
  echo Целевой репозиторий: https://github.com/zxcvt005/tutoring-platform
  echo.
  echo Что сделать:
  echo   git remote add origin https://github.com/zxcvt005/tutoring-platform.git
  echo   ^(или: git remote set-url origin ... если remote уже есть^)
  echo Затем снова этот файл. Рабочая ветка: main.
  echo.
  pause
  exit /b 1
)

echo Remote origin: %ORIGIN_URL%
echo.

echo %ORIGIN_URL% | findstr /I "github.com" >nul
if errorlevel 1 (
  echo [ВНИМАНИЕ] origin сейчас НЕ похож на github.com
  echo Это может быть Cursor Origin ^(origin.cursor.com^) или другой хост.
  echo Push уйдёт туда, куда указывает URL выше — не путайте с «опубликовано на GitHub».
  echo.
  set /p "CONT=Продолжить обычный push на этот origin? (y/N): "
  if /I not "%CONT%"=="y" (
    echo Отменено.
    echo.
    pause
    exit /b 0
  )
)

echo Выполняю: git push -u origin HEAD
echo ^(без --force^)
git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo [ОШИБКА] push не удался.
  echo Частые причины: нет прав; репозиторий на GitHub ещё не создан;
  echo origin указывает на недоступный Cursor Origin ^(agent_temp^);
  echo нужна авторизация GitHub ^(токен / GitHub CLI / Credential Manager^).
  echo Force push не используем.
  echo.
  pause
  exit /b 1
)

echo.
echo Готово: ветка отправлена на origin.
echo Проверьте репозиторий в браузере, если origin = github.com.
echo.
pause
endlocal
