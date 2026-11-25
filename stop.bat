@echo off
setlocal
chcp 65001 >nul
if "%PORT%"=="" set PORT=3000

rem Ferma solo il processo in ascolto sulla porta del blog (non tutti i node.exe).
set FOUND=
if not exist "%~dp0data" mkdir "%~dp0data"
echo stop> "%~dp0data\.stop"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set FOUND=1
  taskkill /PID %%p /F >nul 2>nul && echo Server fermato ^(PID %%p^).
)
if not defined FOUND (
  del "%~dp0data\.stop" >nul 2>nul
  echo Nessun server in ascolto sulla porta %PORT%.
)
ping -n 2 127.0.0.1 >nul
