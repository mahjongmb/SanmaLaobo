# クラウド同期ルール設定：適用手順 & 動作確認

このドキュメントは「アカウントごとのルール設定をクラウドへ同期する」機能を有効化するための手順と、動作確認チェックリストをまとめたもの。

---

## A. Supabase 側の適用手順（1回だけ）

1. Supabase ダッシュボードにログイン。
2. 対象プロジェクトを開く。
3. 左メニュー **SQL Editor** → **New query**。
4. ローカルの `sql/01_add_rules_columns.sql` の中身を **全部コピペ**。
5. 右上の **Run**（または Ctrl+Enter）。
6. 下ペインに `Success. No rows returned` が出ればOK。

### 適用されるもの
- `mbsanma_accounts` に新列：`rules_json` / `presets_json` / `active_rule_set_json`（いずれも jsonb、デフォルト `{}`）
- RPC 新設：`get_mbsanma_account_rules(p_account_id)`、`save_mbsanma_account_rules(p_account_id, p_rules_json, p_presets_json, p_active_rule_set_json)`
- anon / authenticated ロールへ EXECUTE 権限を付与
- 既存の `history_json` / `tracker_json` / 既存 RPC は **一切触っていない**

### SQL の流し直し
ファイルは `IF NOT EXISTS` / `CREATE OR REPLACE` 構成なので、何度流しても安全。列の追加は初回だけ走る。

### 動作テスト（任意）
SQL Editor で以下を流して、戻り値に `rules_json` などが入っていることを確認できる：

```sql
select public.save_mbsanma_account_rules(
  'MB64234122',
  '{"sample-key":"sample-value"}'::jsonb,
  '{"slots":{"slot1":{"name":"テスト","rules":{}}}}'::jsonb,
  '{"presetId":"slot1","displayName":"テスト"}'::jsonb
);

select public.get_mbsanma_account_rules('MB64234122');
```

確認後、テストデータをクリアしたい場合：

```sql
update public.mbsanma_accounts
   set rules_json = '{}'::jsonb,
       presets_json = '{}'::jsonb,
       active_rule_set_json = '{}'::jsonb
 where account_id = 'MB64234122';
```

---

## B. クライアント側（すでに入っている変更）

| 変更点 | ファイル |
| --- | --- |
| ルール用 API（`fetchAccountRules` / `saveAccountRules`）を追加 | `js/supabase_client.js` |
| ルール保存キーをアカウントスコープ化（ログイン中は `mbsanma_app_account_{ID}_rules_*`、ゲストは従来キー） | `html/app/rules_app.html`、`html/app/play_app.html` |
| ログイン時＆開局時にクラウドからルールを取得してローカルへ反映 | `html/app/index_app.html`（`loginWithAccount`、`startMode`） |
| ルール保存／プリセット保存／ルール適用でクラウドへ投げる（fire-and-forget） | `html/app/rules_app.html`（`saveCurrentStateToPreset`、`renameActivePreset`、`applyActivePresetAsRuleSet`） |

### 同期の挙動まとめ
- **ログイン時**：クラウド → ローカル（上書き）。クラウドが空（初回）ならローカルを残す。
- **開局ボタン（`startMode`）時**：クラウド → ローカル（再取得）。
- **保存ボタン（プリセット保存／名称変更／適用）時**：ローカル → クラウド（差分なし、全量投げる）。
- **設定値をいじっただけ**では同期しない（`saveState` にはフックしていない）。
- **ゲストモード**：クラウド呼び出しをしない。ローカルのみ。
- **ゲスト→ログインの引き継ぎ**：なし（設計どおり）。

---

## C. 動作確認チェックリスト

### C-1. ゲストモードでの非干渉
- [ ] トップ画面で **ログインしない** 状態で卓に入る。
- [ ] ルール画面でプリセット1を編集→保存→卓に戻る。
- [ ] Supabase の `mbsanma_accounts` テーブルに余計な行が増えていないこと（SQL Editor で `select count(*) from mbsanma_accounts` を事前／事後で比較）。

### C-2. ログイン時取り込み
- [ ] 既存アカウント（例 `MB64234122`）でログイン。
- [ ] DevTools → Application → Local Storage → ファイルオリジンを見る。
- [ ] 以下のキーが作られている／上書きされていること：
  - `mbsanma_app_account_MB64234122_rules_settings_v1`
  - `mbsanma_app_account_MB64234122_rules_presets_v1`
  - `mbsanma_app_account_MB64234122_rules_active_v1`
- [ ] クラウドが空のアカウント（新規発行直後）でログインしても、ローカル側のルールが変に消えていないこと。

### C-3. 保存ボタン同期（書き戻し）
- [ ] ログイン状態で `rules_app.html` を開く。
- [ ] プリセット1を選び、ルールを適当に変更し「保存」ボタン。
- [ ] SQL Editor で `select rules_json, presets_json, active_rule_set_json from mbsanma_accounts where account_id = 'MB...';` を流す。
- [ ] `presets_json` に該当プリセットが入っている。
- [ ] 「このプリセットを適用」ボタンを押した後、`active_rule_set_json` が更新されている。
- [ ] プリセット名変更（rename）後、`presets_json.slots.slotN.name` が更新されている。

### C-4. アカウント切り替え時の非混在
- [ ] アカウントA でプリセット1を「ルール1-A」に設定→保存。
- [ ] ログアウト → アカウントB でログイン。
- [ ] `rules_app.html` を開いてプリセット1が「ルール1-A」になっていない（＝混ざっていない）こと。
- [ ] B側で「ルール1-B」を保存。
- [ ] A に戻ったとき、プリセット1が「ルール1-A」に戻ること。

### C-5. オフライン耐性
- [ ] DevTools → Network → Offline にする。
- [ ] ログイン試行：通信エラーが出てログインは失敗する（ローカルは破壊されない）。
- [ ] ログイン済み状態でオフライン化 → 保存ボタン押下：UI は通常どおり進み、ローカル保存は効いている。
- [ ] オンラインに戻して再度保存すると、クラウドに反映される。

### C-6. 検証モード＋プリセットバグの退行確認（既知修正）
- [ ] プリセット1を適用した状態で **検証モード** を開始。
- [ ] 1半荘消化。
- [ ] 分析ページのフィルタで「プリセット1」を選ぶと結果が出ること（リセット直後の空マッチになっていないこと）。

### C-7. ログアウト動作の退行確認（既知修正）
- [ ] ログイン中→トップのログアウトボタン。
- [ ] バッジが「ゲストモード」に戻り、`sessionStorage.mbsanma_app_active_session_v1` の `mode` が `"local"` になること。

---

## D. 問題が出たときの戻し方

### Supabase 側だけ戻したい（列と RPC を外す）
```sql
drop function if exists public.save_mbsanma_account_rules(text, jsonb, jsonb, jsonb);
drop function if exists public.get_mbsanma_account_rules(text);
alter table public.mbsanma_accounts
  drop column if exists active_rule_set_json,
  drop column if exists presets_json,
  drop column if exists rules_json;
```
既存 `history_json` / `tracker_json` / 既存 RPC は残る。

### クライアント側だけ戻したい
以下のコミット（または `js/supabase_client.js`、`html/app/index_app.html`、`html/app/rules_app.html`、`html/app/play_app.html` のルール関連追加部分）を revert すれば、旧来の「ルールはブラウザローカル共通」の挙動に戻る。
