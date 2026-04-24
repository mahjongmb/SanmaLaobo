# MBsanma GitHub運用メモ

## 方針
- このリポジトリは **モノレポ運用** とする
- trial版とapp版を同居させる
- ただし、修正時は **共有コア / app専用 / trial専用** を意識して最小差分で扱う

## 共有コアとして扱う主な対象
- `js/core.js`
- `js/core2.js`
- `js/main.js`
- `js/turn.js`
- `js/turn2.js`
- `js/actions.js`
- `js/call.js`
- `js/kan.js`
- `js/pei.js`
- `js/riichi.js`
- `js/seisan.js`
- `js/furiten.js`
- `js/tensukeisan.js`
- `js/fu.js`
- `js/yaku.js`
- `js/yakuman.js`
- `js/render.js`
- `js/render_center.js`
- `js/render_cpu.js`
- `js/render_right.js`
- `js/render_stats.js`
- `js/result.js`
- `js/cpu_*.js`
- `style/` の共通CSS
- `img/` の共通画像

## app専用として扱う主な対象
- `html/app/`
- `js/app_play_ui.js`
- `js/analysis_ui.js`
- `js/match_log.js`
- `js/log_normalizer.js`
- `js/log_metrics.js`
- `js/replay_app_ui.js`
- `js/replay_view_app_ui.js`
- `js/supabase_client.js`

## trial専用として扱う主な対象
- `html/trial/`
- `html/public/index_mbtrial.html`
- `js/mbtrial_ui.js`
- `js/mbtrial_coupon_client.js`
- `js/mbtrial_coupon_admin.js`

## 修正判断の基本
1. CPU挙動や卓上進行の修正は、まず共有コアかを確認する
2. appだけの画面導線、記録、分析、リプレイは app専用側で直す
3. trialだけのクーポン、trial導線、trialセッションは trial専用側で直す
4. 共有コアを直したら、app版とtrial版の両方への影響を意識する

## 推奨ブランチ運用
- `main`: 安定版
- `app-dev`: app版改良の作業ベース
- 必要に応じて `fix/...` や `feature/...` を切る

例
- `feature/app-settings-ui`
- `fix/shared-cpu-discard`
- `fix/trial-coupon-flow`

## 初期運用メモ
- 初回は `main` に現状一式を保存する
- app改良は基本的に `app-dev` から行う
- 共有コアの変更は「trialにも反映される前提」で扱う
- trial専用修正は shared に混ぜない

## やらないこと
- app用に共有コアを複製しない
- trial用に共有コアを複製しない
- render系に状態変更責務を増やさない
- 分離作業と大規模リファクタを同時にしない
