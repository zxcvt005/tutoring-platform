# Единый локальный запуск: Дирекция / Кафедра / Аудитория
# Один Next.js-сервер, порт 43127, hot reload через next dev.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$Port = 43127
$HostAddr = "0.0.0.0"
$Url = "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "=== Прототип: три кабинета на одном порту ===" -ForegroundColor Cyan
Write-Host "  $Url/"
Write-Host "  $Url/direkciya"
Write-Host "  $Url/kafedra"
Write-Host "  $Url/auditoria"
Write-Host ""

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js не найден. Установите LTS с https://nodejs.org/ и снова запустите start.ps1" -ForegroundColor Red
  exit 1
}

$nodeMajor = [int]((node -v) -replace '^v','' -replace '\..*','')
if ($nodeMajor -lt 18) {
  Write-Host "Нужен Node.js 18+ (лучше LTS 20/22). Сейчас: $(node -v)" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Устанавливаю зависимости (npm install)..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Запуск next dev на $HostAddr`:$Port (Ctrl+C — остановить)..." -ForegroundColor Green
npm run dev:local
