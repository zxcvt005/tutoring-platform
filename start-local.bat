@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "APP_PORT=43127"
set "APP_URL=http://127.0.0.1:%APP_PORT%/"
set "LAUNCHER=scripts\local-launch.mjs"
set "NOPAUSE=0"
if /I "%~1"=="--ci" set "NOPAUSE=1"
if /I "%NEODIN_LAUNCH_NOPAUSE%"=="1" set "NOPAUSE=1"

title Неодин — запуск
echo.
echo ============================================================
echo   Неодин: локальный запуск
echo   Сайт: %APP_URL%
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите LTS 20+ с https://nodejs.org/ и снова дважды щёлкните этот файл.
  goto :fail
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] npm не найден. Переустановите Node.js ^(вместе с npm^).
  goto :fail
)

for /f "tokens=1 delims=." %%a in ('node -v') do set "NODE_MAJOR=%%a"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 20 (
  echo [ОШИБКА] Нужен Node.js 20 или новее. Сейчас:
  node -v
  goto :fail
)

if not exist "package.json" (
  echo [ОШИБКА] Не найден package.json. Запускайте BAT из папки проекта tutoring-platform.
  goto :fail
)

if not exist "node_modules\" (
  echo Устанавливаю зависимости ^(npm install^). Это может занять несколько минут...
  call npm install
  if errorlevel 1 (
    echo [ОШИБКА] npm install не удался. Проверьте интернет и Node.js.
    goto :fail
  )
  echo.
)

if not exist "%LAUNCHER%" (
  echo [ОШИБКА] Не найден %LAUNCHER%.
  goto :fail
)

echo Проверяю порт %APP_PORT% и уже запущенный сайт...
set "LAUNCH_RESULT="
set "LAUNCH_HTTP="
for /f "usebackq tokens=1* delims==" %%A in (`node "%LAUNCHER%" status`) do (
  if /I "%%A"=="RESULT" set "LAUNCH_RESULT=%%B"
  if /I "%%A"=="HTTP" set "LAUNCH_HTTP=%%B"
  if /I "%%A"=="PID" echo   процесс PID=%%B
  if /I "%%A"=="CMD" echo   %%B
)

if /I "!LAUNCH_RESULT!"=="SITE_OK" (
  echo.
  echo Сайт уже работает. Открываю браузер, второй сервер не запускаю.
  start "" "%APP_URL%"
  echo Можно закрыть это окно. Сервер остаётся в своём окне.
  goto :ok
)

if /I "!LAUNCH_RESULT!"=="PORT_FOREIGN" (
  echo.
  echo [ОШИБКА] Порт %APP_PORT% занят чужой программой.
  echo Этот BAT не завершает чужие процессы. Закройте ту программу
  echo или освободите порт %APP_PORT% и запустите снова.
  goto :fail
)

if /I "!LAUNCH_RESULT!"=="PORT_MIXED" (
  echo.
  echo [ОШИБКА] Порт %APP_PORT% занят одновременно этим проектом и другой программой.
  echo Чужой процесс не трогаю. Освободите порт и запустите снова.
  goto :fail
)

if /I "!LAUNCH_RESULT!"=="SITE_HUNG" (
  echo Сервер этого проекта уже слушает порт, страница ещё не ответила.
  echo Жду до 20 секунд ^(обычная компиляция Next.js^)...
  node "%LAUNCHER%" wait 20
  if not errorlevel 1 (
    echo Сайт запустился. Открываю браузер, второй сервер не запускаю.
    start "" "%APP_URL%"
    echo Можно закрыть это окно. Сервер остаётся в своём окне.
    goto :ok
  )
  echo Не ответил — останавливаю только зависший процесс этого проекта...
  node "%LAUNCHER%" kill-ours >nul
  timeout /t 2 /nobreak >nul
)

echo.
echo Запускаю сервер в отдельном окне ^(логи PostgreSQL и Next.js^)...
start "Неодин — сервер" /D "%~dp0" cmd /k "title Неодин — сервер && npm run start:local:keep"

echo Жду, пока сайт начнёт отвечать ^(до 3 минут, первый запуск дольше^)...
node "%LAUNCHER%" wait 180
if errorlevel 1 (
  echo.
  echo [ОШИБКА] Сайт не ответил на %APP_URL%
  echo Посмотрите окно «Неодин — сервер»: там будет точная причина
  echo ^(база не отвечает, seed, ошибка Next.js^).
  echo Это окно не закрываю, чтобы вы успели прочитать.
  goto :fail
)

echo.
echo Сайт готов. Открываю браузер: %APP_URL%
start "" "%APP_URL%"
echo.
echo Это окно можно закрыть. Сервер работает в окне «Неодин — сервер».
echo Остановка сайта: Ctrl+C в окне сервера.
goto :ok

:ok
if "%NOPAUSE%"=="1" (
  endlocal
  exit /b 0
)
timeout /t 8 /nobreak >nul
endlocal
exit /b 0

:fail
echo.
if "%NOPAUSE%"=="1" (
  endlocal
  exit /b 1
)
pause
endlocal
exit /b 1
