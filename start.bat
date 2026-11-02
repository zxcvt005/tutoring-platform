@echo off
REM Старый ярлык: тот же однокнопочный запуск, что start-local.bat
cd /d "%~dp0"
call "%~dp0start-local.bat" %*
exit /b %ERRORLEVEL%
