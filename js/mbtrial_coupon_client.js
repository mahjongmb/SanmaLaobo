// ========= mbtrial_coupon_client.js =========
// 役割：
// - MB体験版クーポンの Supabase RPC 呼び出しをまとめる
// - クーポン発行 / device_id取得 / code取得 / 使用済み更新 / 一覧取得を行う
// - 未設定時は安全に無効化する

(function(global){
  "use strict";

  const DEFAULT_TIMEOUT_MS = 10000;

  function normalizeBaseUrl(url){
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function readConfig(){
    const src = global.MB_SANMA_MBTRIAL_SUPABASE_CONFIG || global.MB_SANMA_SUPABASE_CONFIG || {};
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

  function normalizeCouponRecord(src){
    if (!src || typeof src !== "object") return null;
    return {
      id: Number.isFinite(Number(src.id)) ? Number(src.id) : null,
      deviceId: String(src.deviceId || src.device_id || ""),
      code: String(src.code || src.coupon_code || ""),
      rankIndex: Number.isFinite(Number(src.rankIndex ?? src.rank_index)) ? Number(src.rankIndex ?? src.rank_index) : 0,
      rankLabel: String(src.rankLabel || src.rank_label || ""),
      rewardText: String(src.rewardText || src.reward_text || ""),
      point: Number.isFinite(Number(src.point)) ? Number(src.point) : null,
      finalScoreValue: Number.isFinite(Number(src.finalScoreValue ?? src.final_score_value)) ? Number(src.finalScoreValue ?? src.final_score_value) : null,
      chipCount: Number.isFinite(Number(src.chipCount ?? src.chip_count)) ? Number(src.chipCount ?? src.chip_count) : 0,
      reason: String(src.reason || ""),
      issuedAt: String(src.issuedAt || src.issued_at || ""),
      expiresAt: String(src.expiresAt || src.expires_at || ""),
      status: String(src.status || "unused"),
      usedAt: String(src.usedAt || src.used_at || ""),
      updatedAt: String(src.updatedAt || src.updated_at || "")
    };
  }

  function normalizeCouponList(data){
    if (!Array.isArray(data)) return [];
    return data.map(normalizeCouponRecord).filter(Boolean);
  }

  function unpackCouponResult(data){
    if (!data) return { coupon: null, newlyIssued: false };
    if (data.coupon){
      return {
        coupon: normalizeCouponRecord(data.coupon),
        newlyIssued: !!(data.newlyIssued || data.newly_issued)
      };
    }
    return {
      coupon: normalizeCouponRecord(data),
      newlyIssued: false
    };
  }

  async function issueCoupon(coupon){
    const payload = coupon && typeof coupon === "object" ? coupon : {};
    const result = await rpc("issue_mbsanma_mbtrial_coupon", {
      p_device_id: String(payload.deviceId || payload.device_id || ""),
      p_coupon_code: String(payload.code || payload.coupon_code || ""),
      p_rank_index: Number.isFinite(Number(payload.rankIndex)) ? Number(payload.rankIndex) : 0,
      p_rank_label: String(payload.rankLabel || ""),
      p_reward_text: String(payload.rewardText || ""),
      p_point: Number.isFinite(Number(payload.point)) ? Math.round(Number(payload.point)) : null,
      p_final_score_value: Number.isFinite(Number(payload.finalScoreValue)) ? Number(payload.finalScoreValue) : null,
      p_chip_count: Number.isFinite(Number(payload.chipCount)) ? Math.round(Number(payload.chipCount)) : 0,
      p_reason: String(payload.reason || "半荘終了"),
      p_issued_at: String(payload.issuedAt || ""),
      p_expires_at: String(payload.expiresAt || "")
    });

    if (result.error) return { coupon: null, newlyIssued: false, error: result.error };
    const unpacked = unpackCouponResult(result.data);
    return { ...unpacked, error: null };
  }

  async function fetchCouponByDevice(deviceId){
    const result = await rpc("get_mbsanma_mbtrial_coupon_by_device", {
      p_device_id: String(deviceId || "")
    });
    if (result.error) return { coupon: null, error: result.error };
    return { coupon: normalizeCouponRecord(result.data), error: null };
  }

  async function fetchCouponByCode(code){
    const result = await rpc("get_mbsanma_mbtrial_coupon_by_code", {
      p_coupon_code: String(code || "")
    });
    if (result.error) return { coupon: null, error: result.error };
    return { coupon: normalizeCouponRecord(result.data), error: null };
  }

  async function markCouponUsed(code){
    const result = await rpc("use_mbsanma_mbtrial_coupon", {
      p_coupon_code: String(code || "")
    });
    if (result.error) return { coupon: null, error: result.error };
    return { coupon: normalizeCouponRecord(result.data), error: null };
  }

  async function fetchCouponList(options){
    const opts = (options && typeof options === "object") ? options : {};
    const result = await rpc("list_mbsanma_mbtrial_coupons", {
      p_only_unused: !!opts.onlyUnused,
      p_limit: Number.isFinite(Number(opts.limit)) ? Math.max(1, Math.min(200, Number(opts.limit) | 0)) : 50
    });
    if (result.error) return { coupons: [], error: result.error };
    return { coupons: normalizeCouponList(result.data), error: null };
  }

  global.MBTrialCouponApi = {
    isConfigured,
    readConfig,
    issueCoupon,
    fetchCouponByDevice,
    fetchCouponByCode,
    markCouponUsed,
    fetchCouponList
  };
})(window);
