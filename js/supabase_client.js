// ========= supabase_client.js =========
// 役割：
// - Supabase RPC 呼び出しをまとめる
// - 体験版のアカウント発行 / 読み込み / 保存を行う
// - 未設定時は安全に無効化する

(function(global){
  "use strict";

  const DEFAULT_TIMEOUT_MS = 10000;

  function normalizeBaseUrl(url){
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function readConfig(){
    const src = global.MB_SANMA_SUPABASE_CONFIG || {};
    const url = normalizeBaseUrl(src.url);
    const anonKey = String(src.anonKey || src.publishableKey || "").trim();
    return { url, anonKey };
  }

  function isConfigured(){
    const cfg = readConfig();
    return !!(cfg.url && cfg.anonKey);
  }

  async function rpc(functionName, args){
    const cfg = readConfig();
    if (!cfg.url || !cfg.anonKey){
      return { data: null, error: new Error("supabase_not_configured") };
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timeoutId = 0;

    try{
      if (controller){
        timeoutId = global.setTimeout(()=>{
          try{ controller.abort(); }catch(e){}
        }, DEFAULT_TIMEOUT_MS);
      }

      const response = await fetch(`${cfg.url}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "apikey": cfg.anonKey,
          "Authorization": `Bearer ${cfg.anonKey}`
        },
        body: JSON.stringify(args || {}),
        signal: controller ? controller.signal : undefined
      });

      let payload = null;
      const text = await response.text();
      if (text){
        try{
          payload = JSON.parse(text);
        }catch(e){
          payload = text;
        }
      }

      if (!response.ok){
        const message = payload && typeof payload === "object"
          ? (payload.message || payload.error || payload.hint || `rpc_failed_${response.status}`)
          : `rpc_failed_${response.status}`;
        return { data: null, error: new Error(String(message)) };
      }

      return { data: payload, error: null };
    }catch(error){
      if (error && error.name === "AbortError"){
        return { data: null, error: new Error("rpc_timeout") };
      }
      return { data: null, error: error instanceof Error ? error : new Error(String(error || "rpc_failed")) };
    }finally{
      if (timeoutId) global.clearTimeout(timeoutId);
    }
  }

  async function issueAccount(accountId){
    return rpc("issue_mbsanma_account", {
      p_account_id: String(accountId || "")
    });
  }

  async function fetchAccountSnapshot(accountId){
    return rpc("get_mbsanma_account_snapshot", {
      p_account_id: String(accountId || "")
    });
  }

  async function saveAccountSnapshot(accountId, history, tracker){
    return rpc("save_mbsanma_account_snapshot", {
      p_account_id: String(accountId || ""),
      p_history_json: Array.isArray(history) ? history : [],
      p_tracker_json: tracker && typeof tracker === "object" ? tracker : {}
    });
  }

  async function fetchAccountRules(accountId){
    return rpc("get_mbsanma_account_rules", {
      p_account_id: String(accountId || "")
    });
  }

  // 渡された payload のうち、rules / presets / activeRuleSet のいずれか
  // 更新したい項目だけを含めて呼ぶ。省略された項目は null 送信で
  // サーバ側 COALESCE により既存値が維持される。
  async function saveAccountRules(accountId, payload){
    const src = payload && typeof payload === "object" ? payload : {};
    return rpc("save_mbsanma_account_rules", {
      p_account_id: String(accountId || ""),
      p_rules_json:           (src.rules           && typeof src.rules           === "object") ? src.rules           : null,
      p_presets_json:         (src.presets         && typeof src.presets         === "object") ? src.presets         : null,
      p_active_rule_set_json: (src.activeRuleSet   && typeof src.activeRuleSet   === "object") ? src.activeRuleSet   : null
    });
  }

  global.MBSanmaSupabase = {
    isConfigured,
    readConfig,
    issueAccount,
    fetchAccountSnapshot,
    saveAccountSnapshot,
    fetchAccountRules,
    saveAccountRules
  };
})(window);
