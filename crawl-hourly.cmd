@echo off
set "PATH=C:\Users\aiac.lab\nodejs\node-v24.20.0-win-x64;%PATH%"
cd /d "%~dp0"
call npm run crawl >> "%~dp0data\crawl.log" 2>&1
