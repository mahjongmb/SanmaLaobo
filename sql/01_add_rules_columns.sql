-- =========================================================
-- 01_add_rules_columns.sql
-- 目的: mbsanma_accounts に「ルール設定 / プリセット / 採用ルール」の列を追加し、
--       アカウント別にクラウド同期できるよう、ルール専用の RPC を新設する。
--
-- 非破壊:
--   - 既存の history_json / tracker_json / RPC には手を触れない
--   - ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE なので何度流しても安全
--
-- 使い方:
--   1. Supabase ダッシュボード → SQL Editor → New query
--   2. このファイルの中身を全部コピペ
--   3. Run（Ctrl+Enter）
--   4. 画面下 "Success. No rows returned" などが出ればOK
-- =========================================================


-- ---------------------------------------------------------
-- 1) mbsanma_accounts に列を追加
-- ---------------------------------------------------------
-- rules_json           : 現在のルール設定全体 (mbsanma_rules_settings_v1 の中身)
-- presets_json         : プリセット1〜5 の slots / activePresetId など
--                        (mbsanma_rules_presets_v1 の中身)
-- active_rule_set_json : 採用ルールのメタ (mbsanma_rules_active_v1 の中身)
alter table public.mbsanma_accounts
  add column if not exists rules_json           jsonb not null default '{}'::jsonb,
  add column if not exists presets_json         jsonb not null default '{}'::jsonb,
  add column if not exists active_rule_set_json jsonb not null default '{}'::jsonb;


-- ---------------------------------------------------------
-- 2) ルール取得 RPC
-- ---------------------------------------------------------
-- 引数: p_account_id text
-- 戻り: jsonb
--   {
--     "account_id":           "MB64234122",
--     "rules_json":           { ... },
--     "presets_json":         { ... },
--     "active_rule_set_json": { ... },
--     "updated_at":           "2026-04-23T10:15:20Z"
--   }
-- アカウントが存在しないときは null ではなく空オブジェクト { "not_found": true } を返す。
create or replace function public.get_mbsanma_account_rules(p_account_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id text;
  v_row public.mbsanma_accounts%rowtype;
begin
  v_account_id := upper(regexp_replace(coalesce(p_account_id, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_account_id = '' then
    return jsonb_build_object('not_found', true, 'reason', 'empty_account_id');
  end if;

  select * into v_row
  from public.mbsanma_accounts
  where account_id = v_account_id;

  if not found then
    return jsonb_build_object('not_found', true, 'account_id', v_account_id);
  end if;

  return jsonb_build_object(
    'account_id',           v_row.account_id,
    'rules_json',           v_row.rules_json,
    'presets_json',         v_row.presets_json,
    'active_rule_set_json', v_row.active_rule_set_json,
    'updated_at',           v_row.updated_at
  );
end;
$$;


-- ---------------------------------------------------------
-- 3) ルール保存 RPC
-- ---------------------------------------------------------
-- 引数:
--   p_account_id           text
--   p_rules_json           jsonb   (null 許可 → 既存を残す)
--   p_presets_json         jsonb   (null 許可 → 既存を残す)
--   p_active_rule_set_json jsonb   (null 許可 → 既存を残す)
--
-- 戻り: jsonb (保存後の行をそのまま)
--
-- 仕様:
--   - アカウント行が無ければ insert
--   - 行があれば update。渡された列だけ差し替え、null が来た列は既存値を維持。
--   - updated_at は触らない (既存 trigger にまかせる)
create or replace function public.save_mbsanma_account_rules(
  p_account_id           text,
  p_rules_json           jsonb,
  p_presets_json         jsonb,
  p_active_rule_set_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id text;
  v_row public.mbsanma_accounts%rowtype;
begin
  v_account_id := upper(regexp_replace(coalesce(p_account_id, ''), '[^A-Za-z0-9]', '', 'g'));

  if v_account_id = '' then
    raise exception 'invalid_account_id';
  end if;

  -- 行が無ければ作成（他列は default 値のまま）
  insert into public.mbsanma_accounts(account_id)
    values (v_account_id)
  on conflict (account_id) do nothing;

  update public.mbsanma_accounts
    set
      rules_json           = coalesce(p_rules_json,           rules_json),
      presets_json         = coalesce(p_presets_json,         presets_json),
      active_rule_set_json = coalesce(p_active_rule_set_json, active_rule_set_json)
    where account_id = v_account_id
  returning * into v_row;

  return jsonb_build_object(
    'account_id',           v_row.account_id,
    'rules_json',           v_row.rules_json,
    'presets_json',         v_row.presets_json,
    'active_rule_set_json', v_row.active_rule_set_json,
    'updated_at',           v_row.updated_at
  );
end;
$$;


-- ---------------------------------------------------------
-- 4) 権限付与
--   anon ロール（クライアントが anon key で叩くときの実行ユーザー）に
--   新しい RPC の EXECUTE 権を付ける。既存 RPC と同じ思想。
-- ---------------------------------------------------------
grant execute on function public.get_mbsanma_account_rules(text) to anon;
grant execute on function public.save_mbsanma_account_rules(text, jsonb, jsonb, jsonb) to anon;

-- 認証ユーザーでも使えるように (Supabase は通常 authenticated ロールも用意)
grant execute on function public.get_mbsanma_account_rules(text) to authenticated;
grant execute on function public.save_mbsanma_account_rules(text, jsonb, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------
-- 5) 動作確認用 (任意。実行しなくてもOK)
-- ---------------------------------------------------------
-- 既存アカウント MB64234122 でテスト保存してみる例:
--
-- select public.save_mbsanma_account_rules(
--   'MB64234122',
--   '{"sample-key":"sample-value"}'::jsonb,
--   '{"slots":{"slot1":{"name":"テスト","rules":{}}}}'::jsonb,
--   '{"presetId":"slot1","displayName":"テスト"}'::jsonb
-- );
--
-- select public.get_mbsanma_account_rules('MB64234122');
