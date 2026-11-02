@echo off
REM Совместимость: keep теперь режим по умолчанию у start-local.bat
cd /d "%~dp0"
call "%~dp0start-local.bat" %*
exit /b %ERRORLEVEL%
