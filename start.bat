@echo off
REM Единый локальный запуск: Дирекция / Кафедра / Аудитория
REM Один Next.js-сервер, порт 43127. Окно не закрывается молча при ошибке.
setlocal EnableExtensions
cd /d "%~dp0"

set "PORT=43127"
set "HOST=0.0.0.0"
set "URL=http://127.0.0.1:%PORT%/"

echo.
echo ============================================================
echo   Прототип: три кабинета на одном порту %PORT%
echo ============================================================
echo   Старт:     %URL%
echo   Дирекция:  http://127.0.0.1:%PORT%/direkciya
echo   Кафедра:   http://127.0.0.1:%PORT%/kafedra
echo   Аудитория: http://127.0.0.1:%PORT%/auditoria
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ОШИБКА] Node.js не найден.
  echo Установите LTS с https://nodejs.org/ ^(версия 18+^),
  echo закройте это окно и снова запустите start.bat двойным щелчком.
  echo.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%a in ('node -v') do set "NODE_MAJOR=%%a"
set "NODE_MAJOR=%NODE_MAJOR:v=%"
if not defined NODE_MAJOR set "NODE_MAJOR=0"
if %NODE_MAJOR% LSS 18 (
  echo [ОШИБКА] Нужен Node.js 18 или новее ^(лучше LTS 20/22^).
  echo Сейчас установлено:
  node -v
  echo.
  pause
  exit /b 1
)

REM Порт занят? (LISTENING на :43127)
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [ОШИБКА] Порт %PORT% уже занят.
  echo Закройте другое окно start.bat / next dev ^(Ctrl+C^) и попробуйте снова.
  echo Если окна нет — в Диспетчере задач завершите процесс node.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Устанавливаю зависимости ^(npm install^)... Это может занять несколько минут.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ОШИБКА] npm install не удался. Проверьте интернет и Node.js, затем снова start.bat.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo Открою браузер через несколько секунд: %URL%
echo Если страница не открылась — скопируйте адрес вручную.
echo.
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start %URL%"

echo Запуск next dev на %HOST%:%PORT% ...
echo Остановка сервера: Ctrl+C в этом окне.
echo.
call npm run dev:local
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo [ОШИБКА] Сервер завершился с кодом %EXITCODE%.
  echo Если порт был занят — закройте другое окно start.bat.
  echo.
  pause
)
endlocal & exit /b %EXITCODE%
