#!/bin/sh
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8000/games/yuma-quest/index.html" 2>/dev/null || xdg-open "http://localhost:8000/games/yuma-quest/index.html") &
python3 -m http.server 8000
