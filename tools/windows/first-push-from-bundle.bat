@echo off
REM Одноразовый перенос: залить актуальный код из .bundle в пустой GitHub-репо.
REM 1) Положите tutoring-platform.bundle рядом с этим репозиторием или укажите путь.
REM 2) origin должен указывать на https://github.com/zxcvt005/tutoring-platform.git
REM Не делает force push.
setlocal EnableExtensions
cd /d "%~dp0..\.."

set "BUNDLE=%~1"
if "%BUNDLE%"=="" set "BUNDLE=%~dp0..\..\tutoring-platform.bundle"
if not exist "%BUNDLE%" set "BUNDLE=%USERPROFILE%\Downloads\tutoring-platform.bundle"

echo.
echo === Первый push из bundle на GitHub ===
echo Каталог: %CD%
echo Bundle:  %BUNDLE%
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Git не найден.
  pause
  exit /b 1
)

if not exist "%BUNDLE%" (
  echo [ОШИБКА] Файл bundle не найден.
  echo Скачайте tutoring-platform.bundle из Project Context
  echo ^(media/github-transfer^) в Downloads или передайте путь:
  echo   first-push-from-bundle.bat C:\path\tutoring-platform.bundle
  pause
  exit /b 1
)

git remote -v
echo.
echo Тяну историю из bundle...
git fetch "%BUNDLE%" cursor/local-windows-dev-8154:refs/remotes/bundle/win
if errorlevel 1 (
  echo [ОШИБКА] git fetch из bundle не удался.
  pause
  exit /b 1
)

git checkout -B main refs/remotes/bundle/win
if errorlevel 1 (
  echo [ОШИБКА] checkout main не удался.
  pause
  exit /b 1
)

echo.
echo Публикую main на origin ^(без --force^)...
git push -u origin main
if errorlevel 1 (
  echo.
  echo [ОШИБКА] push не удался. Войдите в GitHub ^(Credential Manager / gh auth login^)
  echo и повторите. Репозиторий должен быть пустым или main должен принимать этот push.
  pause
  exit /b 1
)

echo.
echo Готово. На GitHub ветка main. Дальше: start.bat
git log -1 --oneline
pause
endlocal
