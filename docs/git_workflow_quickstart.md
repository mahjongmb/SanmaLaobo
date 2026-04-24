# MBsanma Git運用クイックメモ

## 基本ルール
- GitHubを正本にする
- 作業開始前に `git pull`
- 作業終了後に `git push`
- PCを移る前にも `git push`
- Codex と Cowork を切り替える前後も `pull / push` を意識する

## 店PC・家PC・Cowork 共通
### 作業を始める前
```powershell
git status
git pull
```

確認ポイント
- `nothing to commit` なら作業開始してOK
- `Already up to date.` なら最新状態

### 作業が終わった後
```powershell
git status
git add .
git commit -m "内容を短く書く"
git push
```

## こんな時は止まる
### `git status` で変更が残っている
- まだコミットしていない変更がある
- そのまま別PCへ移らず、必要なら commit / push する

### `git pull` で競合っぽい表示が出た
- 家PCと店PCで同じファイルを別々に触った可能性がある
- 無理に進めず、その時点で Codex に画面を見せる

### Cowork を使う時
- Cowork を使う前に `git pull`
- Cowork の作業後に `git status`
- 問題なければ `commit / push`
- その後で Codex 側でも `git pull`

## このリポジトリの現在情報
```powershell
git remote -v
```

期待する表示
```text
origin  https://github.com/mahjongmb/SanmaLaobo.git (fetch)
origin  https://github.com/mahjongmb/SanmaLaobo.git (push)
```

## ひとことで言うと
- 始める前に `pull`
- 終わったら `push`
- 移る前にも `push`
