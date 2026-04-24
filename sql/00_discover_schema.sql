-- =========================================================
-- 00_discover_schema.sql
-- 目的: 現在の Supabase に存在する MBsanma 関連テーブル / 関数 の形を把握する
-- 使い方:
--   1. Supabase ダッシュボードを開く ( https://supabase.com/dashboard )
--   2. 対象プロジェクトを選ぶ
--   3. 左メニューの "SQL editor" を開く
--   4. "New query" で新規クエリを作る
--   5. このファイルの中身を全部コピーして貼り付け、Run
--   6. 結果の 3 ブロック（tables / columns / functions）をコピーして yashio さんが Claude に共有する
-- 注意:
--   - 何も変更しない読み取り専用 SQL です（SELECT のみ）
--   - 実行しても既存データには触りません
-- =========================================================

-- ----- 1) MBsanma 関連のテーブル一覧 -----
SELECT
  table_schema,
  table_name
FROM information_schema.tables
WHERE table_name ILIKE '%mbsanma%'
   OR table_name ILIKE '%sanma%'
ORDER BY table_schema, table_name;

-- ----- 2) それらのテーブルの全カラム定義 -----
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    table_name ILIKE '%mbsanma%'
    OR table_name ILIKE '%sanma%'
  )
ORDER BY table_schema, table_name, ordinal_position;

-- ----- 3) 既存 RPC 関数の完全定義 -----
SELECT
  n.nspname AS schema,
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid)    AS return_type,
  pg_get_functiondef(p.oid)        AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('public', 'mbsanma')
  AND p.proname ILIKE '%mbsanma%'
ORDER BY n.nspname, p.proname;
