@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ユウマクエストを起動します。このウィンドウは遊んでいる間、閉じないでください。
start "" "http://localhost:8000/games/yuma-quest/index.html"
python -m http.server 8000 || py -m http.server 8000
pause
