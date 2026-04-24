MBsanma CPU打牌 external連携基盤パッチ（cpu_snapshot.js あり版）

同梱ファイル
- index.html
- server.js
- js/cpai.js
- js/turn.js
- js/cpu_api_bridge.js
- js/cpu_discard_profiles.js
- js/cpu_discard_eval.js
- js/cpu_discard_snapshot.js
- js/cpu_snapshot.js

概要
- CPU打牌を snapshot → external hook → internal shadow eval → legacy fallback に統一
- discard 用 endpoint を /cpu/discard-decision で追加
- open-call 用基盤は維持しつつ、discard にも同期判定を追加
- cpu_snapshot.js は現行版を同梱（前回の不足分対策）
