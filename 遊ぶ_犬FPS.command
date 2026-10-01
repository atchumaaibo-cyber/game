#!/bin/sh
cd "$(dirname "$0")"
echo "犬FPSを起動します。遊び終わったら、この画面を閉じてください。"
(sleep 1; open "http://localhost:8001/games/dog-fps/index.html" 2>/dev/null || xdg-open "http://localhost:8001/games/dog-fps/index.html") &
python3 -m http.server 8001
