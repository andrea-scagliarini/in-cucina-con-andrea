@echo off
setlocal
chcp 65001 >nul
title In cucina con Andrea - server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRORE] Node.js non trovato. Installa Node 22.13 o successivo da https://nodejs.org
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=3000

rem Se il server e' gia' in esecuzione, apre solo il browser.
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/meta).StatusCode } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo Il server e' gia' attivo su http://127.0.0.1:%PORT%
  if not defined NO_BROWSER start "" http://127.0.0.1:%PORT%
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

echo.
echo  Avvio del blog su http://127.0.0.1:%PORT%   (chiudi questa finestra o premi Ctrl+C per fermarlo)
if exist "data\admin-credentials.txt" (
  echo.
  echo  Credenziali admin ^(/admin^):
  type "data\admin-credentials.txt"
)
echo.

rem Apre il browser dopo un attimo, in una finestra separata.
if not defined NO_BROWSER start "" /min cmd /c "ping -n 2 127.0.0.1 >nul & start http://127.0.0.1:%PORT%"

if exist "data\.stop" del "data\.stop" >nul 2>nul

:loop
node --disable-warning=ExperimentalWarning server\index.js
set CODE=%errorlevel%
if exist "data\.stop" goto stopped
if "%CODE%"=="0" goto end
echo.
echo [!] Il server si e' fermato con codice %CODE%. Riavvio tra 3 secondi... (Ctrl+C per annullare)
ping -n 3 127.0.0.1 >nul
goto loop

:end
echo Server fermato.
pause
exit /b 0

:stopped
del "data\.stop" >nul 2>nul
echo Server fermato.
exit /b 0
