# ユウマムシの大冒険

イモムシになったユウマが前に進むとヒヨコがいて、ぶつかると「ユウマ もう羽化したほうがいいよ（ティロリロリン）」。さなぎになって、犬に戻る。約1分、スマホ向けのブラウザ3Dゲーム。

## あそぶ

GitHub Pages: `https://atchumaaibo-cyber.github.io/game/games/yumamushi/`

手元で動かすなら、リポジトリのルートで `python3 -m http.server 8000` → `http://localhost:8000/games/yumamushi/`

- 操作: 画面を指でさわって**よこに動かす**とイモムシが曲がる（パソコンは ← → / A D）。前には自動で這う
- `?autostart` でタイトルを飛ばす / `?near` でヒヨコが近くに出る（動作確認用）

## 中身

- `models/imomushi.glb` … ユウマイモムシ v1（`ユウマ_まとめ/イモムシ/ユウマイモムシ_v1.glb` のコピー）。GLB に動きは入っていないので、`main.js` の `animateCat` が節（head, seg1〜seg6）の回転を波で動かす（元の README の見本と同じ：後ろから前へ進む波、隣と0.9rad ずれ。振れは見本の0.11より大きめ）
- `models/yuma.glb` … 犬のユウマ（`games/dog-fps/lite/yuma.glb` と同じ）。最後に出てきて手をふる
- ヒヨコ・さなぎ・背景は、モデルがないのでコードで作った仮の姿
- 蛹→犬に戻る「動画」は素材がなかったので、3D演出（糸のきらめき・ぶるぶる・発光・フラッシュ・紙吹雪・ティロリロリン）で代用
- 音は音源ファイルなし。Web Audio の自作シンセ
- Three.js r170 を `lib/` に同梱（CDN 不要）
