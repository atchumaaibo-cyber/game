# game

ユウマのブラウザ 3D ゲーム（Three.js）。

- **ユウマクエスト**: 王様から使命を受けた犬の勇者ユウマが、城を出た途端にオヤツを見つけて食べて、使命を忘れてエンディングになる 2 分ほどのゲーム
- **FPS**: 箱庭の中でキャラを選び、選ばれなかった犬とアッチが敵になる。オヤツをあげると敵は夢中になって動かなくなる

素材（3Dモデル・箱庭）は `assets/`、説明は [docs/assets.md](docs/assets.md)。

## アセット

- `assets/models/<キャラ>/` … ユウマ・プードル・ポメ・あっち・ぽんねこの GLB（骨・動き入り）と表情の画像
- `assets/stage/shizuoka_hakoniwa.glb` … 静岡の箱庭（ゲームの舞台）

## ゲーム

- [ユウマクエスト](games/yuma-quest/README.md)（`games/yuma-quest/index.html`）
