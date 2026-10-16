# Единый локальный запуск: Дирекция / Кафедра / Аудитория
# Один Next.js-сервер, порт 43127. При ошибке ждём Enter (удобно при двойном щелчке).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Wait-Exit([int]$Code = 1) {
  Write-Host ""
  Read-Host "Нажмите Enter, чтобы закрыть окно"
  exit $Code
}

$Port = 43127
$HostAddr = "0.0.0.0"
$Url = "http://127.0.0.1:$Port/"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Прототип: три кабинета на одном порту $Port"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Старт:     $Url"
Write-Host "  Дирекция:  http://127.0.0.1:$Port/direkciya"
Write-Host "  Кафедра:   http://127.0.0.1:$Port/kafedra"
Write-Host "  Аудитория: http://127.0.0.1:$Port/auditoria"
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "[ОШИБКА] Node.js не найден." -ForegroundColor Red
  Write-Host "Установите LTS с https://nodejs.org/ (версия 18+),"
  Write-Host "затем снова запустите start.ps1 или start.bat."
  Wait-Exit 1
}

try {
  $nodeMajor = [int](((node -v) -replace '^v', '') -split '\.')[0]
} catch {
  Write-Host "[ОШИБКА] Не удалось прочитать версию Node.js." -ForegroundColor Red
  Wait-Exit 1
}
if ($nodeMajor -lt 18) {
  Write-Host "[ОШИБКА] Нужен Node.js 18+ (лучше LTS 20/22). Сейчас: $(node -v)" -ForegroundColor Red
  Wait-Exit 1
}

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  # Fallback без админ-модуля NetTCPIP
  $listening = netstat -ano 2>$null | Select-String -Pattern ":$Port\s+.*LISTENING"
}
if ($listening) {
  Write-Host "[ОШИБКА] Порт $Port уже занят." -ForegroundColor Red
  Write-Host "Закройте другое окно start.bat / next dev (Ctrl+C) и попробуйте снова."
  Wait-Exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Устанавливаю зависимости (npm install)..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[ОШИБКА] npm install не удался. Проверьте интернет и Node.js." -ForegroundColor Red
    Wait-Exit $LASTEXITCODE
  }
  Write-Host ""
}

Write-Host "Через несколько секунд открою браузер: $Url" -ForegroundColor Green
Write-Host "Если не открылся — скопируйте адрес вручную."
Start-Job -ScriptBlock {
  param($U)
  Start-Sleep -Seconds 4
  Start-Process $U
} -ArgumentList $Url | Out-Null

Write-Host "Запуск next dev на ${HostAddr}:$Port (Ctrl+C — остановить)..." -ForegroundColor Green
Write-Host ""
try {
  npm run dev:local
  $code = $LASTEXITCODE
} catch {
  Write-Host "[ОШИБКА] $($_.Exception.Message)" -ForegroundColor Red
  Wait-Exit 1
}

if ($code -ne 0) {
  Write-Host ""
  Write-Host "[ОШИБКА] Сервер завершился с кодом $code." -ForegroundColor Red
  Wait-Exit $code
}
