@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 犬FPSを起動します。ブラウザが開かないときは http://localhost:8001/games/dog-fps/ を開いてください。
echo 遊び終わったら、この黒い画面を閉じてください。
start "" "http://localhost:8001/games/dog-fps/index.html"
python -m http.server 8001 || py -m http.server 8001
pause
