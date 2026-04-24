# AGENTS.md

このファイルは、Codex が **MBsanma** プロジェクトを触るときの作業ルールをまとめたものです。

## プロジェクト概要
- プロジェクト名: **MBsanma**
- 内容: 三麻のブラウザ麻雀ゲーム / 何切るメーカー
- 実行環境: **ローカル実行（`file://`）**
- 使用技術: **HTML / CSS / 素のJavaScript**
- フレームワーク: **なし**
- ビルドツール: **なし**
- モジュールバンドラ: **なし**
- 三麻ルール前提:
  - 萬子なし
  - 山108枚
  - 赤5p / 赤5s あり

## 最重要ルール

### 1. render系は描画専用
以下のファイルでは、**ゲーム状態を書き換えない**こと。
- `js/render.js`
- `js/render_center.js`
- `js/render_cpu.js`
- `js/render_right.js`
- `js/render_stats.js`
- `js/result.js`

render系の役割は、**表示更新だけ**です。
状態変更を入れないでください。

注意:
- 現状の `js/render.js` にはクリック導線や進行系関数呼び出しの入口が一部残っている
- ただし、新規修正で render 側に状態変更責務を追加しないこと
- 責務整理が必要でも、大規模な移設やリファクタは勝手に行わないこと

### 2. 状態変更してよい場所
ゲーム進行に関わる状態変更は、原則として以下で行うこと。
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
- 必要な後付けパッチ

### 3. 状態変更の対象
以下は代表的な**グローバル状態**であり、変更は慎重に扱うこと。
- `wall`
- `deadWall`
- `hand13`
- `drawn`
- `river`
- `cpuLeftRiver`
- `cpuRightRiver`
- `melds`
- `peis`
- `doraIndicators`
- `uraDoraIndicators`
- `isRiichi`
- `isRiichiSelecting`
- `isEnded`
- `scores`
- `roundWind`
- `roundNumber`
- `eastSeatIndex`
- `honba`
- `kyotakuCount`
- その他、局進行・終局・演出制御に関わるフラグ

### 4. 勝手な整理・削除をしない
- 既存コードを勝手に短縮しない
- 勝手に関数分割しない
- 勝手に共通化しない
- 勝手に命名変更しない
- 勝手にファイル名変更しない
- 勝手にフォルダ構成変更しない
- 勝手に ES Modules 化しない
- 勝手に `npm` / `package.json` / ビルド工程を導入しない

このプロジェクトでは、**軽量・安定・責務分離**を最優先にすること。

## 作業方針

### 1. 修正範囲は最小にする
- 依頼された問題に必要なファイルだけ触る
- 推測で複数ファイルへ広げない
- 大規模リファクタは禁止
- 関連影響が確実にあるときだけ周辺を直す

### 2. まず責務を確認する
修正前に、対象ファイルが何を担うかを確認すること。
ファイルの役割確認には、**`other/MBsanma_役割台帳_20260418更新_v10 (1).md`** を基準として使う。

### 3. 最新版を正本として扱う
- 古い説明や断片コードではなく、**現在ワークスペースにあるファイル**を正本として扱う
- 修正前に対象ファイルの実内容を読む
- 記憶で書き換えない
- 別ファイルの古い責務を流用しない

### 4. 仕様の正本
- 仕様は、まず現行実装と現行台帳を基準に確認する
- `SPEC.md` や `BUGS.md` が存在する場合はそれを参照する
- 仕様が曖昧なときは、既存実装と依頼内容の両方を確認して最小変更で合わせる

## 回答・提案のしかた
Codex が会話で説明するときは、以下を守ること。

### 1. どのファイルを触るかを明示する
最初に対象ファイル名をはっきり書くこと。

### 2. バグ修正時の説明順
簡潔に、以下の順で書くこと。
1. 原因
2. 修正箇所
3. 修正内容

### 3. 全文提示ルール
ユーザーが**全文提示**を求めた場合は、以下を守ること。
- ファイル内容を省略しない
- 変更部分だけにしない
- コメント・空行も含めて完全な内容を出す
- 「前回と同じ部分は省略」はしない

### 4. 差分提示ルール
差分でよいと明示された場合だけ、関数単位や差分単位で出してよい。
それ以外は勝手に差分形式へしないこと。

## UI修正ルール
- UIの見た目調整は、まず **CSS変数** や既存CSS責務で解決できるか確認する
- HTML構造の変更は最小限
- JSで見た目をごまかす前に、CSS側の責務で直せるかを考える

## このプロジェクト特有の重要注意

### 1. `renderHand` 周辺は危険区域
以下は仕様の核として扱うこと。
- **13枚中心固定**（`drawn` を中央計算に入れない）
- `isNew` → `newTile` / `blink` 付与必須
- hover契約（`hoveredTileId` と `updateStats` 系）維持

リファクタや整理目的で壊してはいけない。

### 2. ルール・点数・精算を触るとき
以下への影響も必ず意識すること。
- 卓上挙動
- 結果表示
- ログ保存
- 牌譜再生
- 分析集計

特に以下は横断影響が出やすい。
- `js/core.js`
- `js/yaku.js`
- `js/yakuman.js`
- `js/fu.js`
- `js/tensukeisan.js`
- `js/seisan.js`
- `js/main.js`
- `js/match_log.js`
- `js/log_normalizer.js`
- `js/log_metrics.js`

### 3. アプリ版と体験版を混同しない
このプロジェクトには系統がある。

#### アプリ版
主な入口:
- `index_app.html`
- `play_app.html`
- `rules_app.html`
- `settings_app.html`
- `analysis_app.html`
- `records_app.html`
- `replay_app.html`
- `replay_view_app.html`
- `index_internal.html`

主な関連JS:
- `js/app_play_ui.js`
- `js/analysis_ui.js`
- `js/match_log.js`
- `js/log_normalizer.js`
- `js/log_metrics.js`
- `js/replay_app_ui.js`
- `js/replay_view_app_ui.js`

#### 店外向け体験版
主な入口:
- `index.html`
- `index_mbtrial.html`
- `play_mbtrial.html`
- `coupon_admin.html`

主な関連JS:
- `js/mbtrial_ui.js`
- `js/mbtrial_coupon_client.js`
- `js/mbtrial_coupon_admin.js`

片方だけ触るつもりの修正で、もう片方を巻き込まないこと。

### 4. 入口HTMLの役割を意識する
- `index.html` は現状、`index_mbtrial.html` へのリダイレクト入口
- `play_app.html` はルール設定読込や各種JS束ねを持つアプリ版の結節点
- `play_mbtrial.html` は trial セッション確認付きの体験版プレイ本体
- `index_internal.html` はセッションガードなしの内部起動用
- `rules_app.html` はアプリ版ルール変更ページの正本UI

## 主要ファイル責務メモ
- `js/core.js`: 牌定義、山構築、共通グローバル状態、三麻ルール基礎
- `js/main.js`: 局開始、次局進行、半荘進行、終局後フロー、設定UI反映
- `js/turn.js`: 通常ターン進行の司令塔
- `js/actions.js`: ツモ、ロン、流局、捨て牌、卓上から結果画面への橋渡し
- `js/call.js`: ロン、ポン、明槓、スキップなどの副露応答
- `js/kan.js`: 暗槓、加槓
- `js/pei.js`: 北抜き
- `js/riichi.js`: リーチ選択、成立、関連停止制御
- `js/seisan.js`: 点数移動、供託、本場、飛び、終局判定
- `js/result.js`: 結果確認画面の表示専用
- `js/render.js`: 手牌、河、アクションバー描画の司令塔
- `js/render_center.js`: 中央UI描画
- `js/render_cpu.js`: CPU描画
- `js/render_right.js`: 自席右エリア描画
- `js/render_stats.js`: 受け入れ、待ち、シャンテン表示描画
- `js/yaku.js`: 役判定
- `js/fu.js`: 符計算
- `js/tensukeisan.js`: 点数計算

## 推奨確認手順
作業時は、基本的に以下の順で考えること。

1. 依頼内容から対象責務を特定する
2. 台帳で対象ファイルの役割を確認する
3. 実ファイルを読む
4. 状態変更か描画変更かを切り分ける
5. app版かmbtrial版かを確認する
6. 影響範囲を最小にして修正する
7. 必要ならログ・結果表示・分析への影響を確認する

## 禁止事項
- 既存コードの省略
- 既存コードの勝手な削除
- 推測で複数ファイルを書き換えること
- 仕様を勝手に変更すること
- 大規模リファクタ
- render系で状態変更
- 会話で求められていない build tool / framework 導入
- ローカル `file://` 前提を崩す変更

## このプロジェクトで優先する価値
1. 安定
2. 責務分離
3. 既存仕様維持
4. 影響範囲最小
5. 軽量

## 一言でまとめると
**「renderは描画専用、状態変更は進行系で、台帳v10と最新版ファイルを読んでから、最小差分で直す」**
