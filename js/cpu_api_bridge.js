// MBsanma/js/cpu_api_bridge.js
// ========= cpu_api_bridge.js（ブラウザ→ローカルAPI橋渡し） =========
// 役割：
// - CPU副露snapshot / CPU打牌snapshot をローカルAPIへPOSTする窓口
// - 外部AIを同期判定で差し込む hook を提供する
// - APIキーはここには置かない。ローカル橋渡しサーバー側だけに置く
//
// 注意：
// - このファイルはrenderを触らない
// - ローカルAPIが失敗したら既存の内蔵AIへフォールバックする

const DEFAULT_CPU_API_BRIDGE_CONFIG = {
  enabled: true,
  endpoint: "http://127.0.0.1:8787/cpu/open-call-decision",
  discardEndpoint: "http://127.0.0.1:8787/cpu/discard-decision",
  timeoutMs: 1200,
  log: false,
  autoInstallHook: true,
  useSyncDecision: true
};

let cpuApiBridgeConfig = { ...DEFAULT_CPU_API_BRIDGE_CONFIG };
let cpuApiBridgeInstalled = false;
let cpuApiBridgePrevCallHook = null;
let cpuApiBridgePrevDiscardHook = null;
let lastCpuApiBridgeRequest = null;
let lastCpuApiBridgeResponse = null;

function cloneCpuApiBridgeConfig(){
  return { ...cpuApiBridgeConfig };
}

function getCpuApiBridgeConfig(){
  return cloneCpuApiBridgeConfig();
}

function deriveDiscardEndpoint(endpoint){
  const base = String(endpoint || "").trim();
  if (!base) return "";
  if (base.includes("/cpu/open-call-decision")){
    return base.replace("/cpu/open-call-decision", "/cpu/discard-decision");
  }
  return base;
}

function setCpuApiBridgeConfig(nextConfig){
  if (!nextConfig || typeof nextConfig !== "object") return cloneCpuApiBridgeConfig();
  cpuApiBridgeConfig = {
    ...cpuApiBridgeConfig,
    ...nextConfig
  };

  if (!cpuApiBridgeConfig.discardEndpoint){
    cpuApiBridgeConfig.discardEndpoint = deriveDiscardEndpoint(cpuApiBridgeConfig.endpoint);
  }

  try{
    if (typeof window !== "undefined"){
      window.cpuApiBridgeConfig = cloneCpuApiBridgeConfig();
    }
  }catch(e){}
  return cloneCpuApiBridgeConfig();
}

function resetCpuApiBridgeConfig(){
  cpuApiBridgeConfig = { ...DEFAULT_CPU_API_BRIDGE_CONFIG };
  try{
    if (typeof window !== "undefined"){
      window.cpuApiBridgeConfig = cloneCpuApiBridgeConfig();
    }
  }catch(e){}
  return cloneCpuApiBridgeConfig();
}

function isCpuApiBridgeEnabled(){
  return !!cpuApiBridgeConfig.enabled;
}

function buildCpuApiBridgePayload(kind, snapshot){
  return {
    kind,
    sentAt: new Date().toISOString(),
    snapshot
  };
}

function normalizeCpuCallBridgeDecisionPayload(raw){
  if (raw == null) return null;

  let decision = raw;
  if (raw && typeof raw === "object" && raw.decision && typeof raw.decision === "object"){
    decision = raw.decision;
  }

  if (typeof decision === "string"){
    decision = { action: decision };
  }
  if (!decision || typeof decision !== "object") return null;

  const action = (typeof decision.action === "string") ? decision.action.trim().toLowerCase() : "";
  if (!action) return null;
  if (action !== "pass" && action !== "pon" && action !== "minkan" && action !== "auto") return null;

  const normalized = {
    action,
    note: (typeof decision.note === "string")
      ? decision.note
      : ((typeof decision.reason === "string") ? decision.reason : "")
  };

  if (typeof decision.reasonTag === "string" && decision.reasonTag.trim()){
    normalized.reasonTag = decision.reasonTag.trim();
  }
  if (Array.isArray(decision.reasonTags) && decision.reasonTags.length > 0){
    normalized.reasonTags = decision.reasonTags.filter((tag)=> typeof tag === "string" && tag.trim()).map((tag)=> tag.trim());
  }
  if (decision.meta && typeof decision.meta === "object"){
    normalized.meta = decision.meta;
  }

  return normalized;
}

function normalizeCpuDiscardBridgeDecisionPayload(raw){
  if (raw == null) return null;

  let decision = raw;
  if (raw && typeof raw === "object" && raw.decision && typeof raw.decision === "object"){
    decision = raw.decision;
  }

  if (typeof decision === "string"){
    const text = decision.trim().toLowerCase();
    if (!text) return null;
    if (text === "auto") decision = { action: "auto" };
    else decision = { action: "discard", discardCode: text };
  }
  if (!decision || typeof decision !== "object") return null;

  const action = (typeof decision.action === "string") ? decision.action.trim().toLowerCase() : "";
  if (!action) return null;
  if (action !== "discard" && action !== "auto") return null;

  const normalized = {
    action,
    note: (typeof decision.note === "string")
      ? decision.note
      : ((typeof decision.reason === "string") ? decision.reason : "")
  };

  if (Number.isInteger(decision.discardTileId)) normalized.discardTileId = decision.discardTileId;
  if (Number.isInteger(decision.discardIndex)) normalized.discardIndex = decision.discardIndex;
  if (typeof decision.discardCode === "string" && decision.discardCode.trim()) normalized.discardCode = decision.discardCode.trim();
  if (typeof decision.reasonTag === "string" && decision.reasonTag.trim()) normalized.reasonTag = decision.reasonTag.trim();
  if (Array.isArray(decision.reasonTags) && decision.reasonTags.length > 0){
    normalized.reasonTags = decision.reasonTags.filter((tag)=> typeof tag === "string" && tag.trim()).map((tag)=> tag.trim());
  }
  if (decision.meta && typeof decision.meta === "object"){
    normalized.meta = decision.meta;
  }

  return normalized;
}

async function postCpuSnapshotToApi(snapshot, endpoint, kind, normalizeFn){
  if (!snapshot || typeof snapshot !== "object"){
    return {
      ok: false,
      error: "invalid_snapshot"
    };
  }

  const finalEndpoint = String(endpoint || "").trim();
  if (!finalEndpoint){
    return {
      ok: false,
      error: "missing_endpoint"
    };
  }

  const timeoutMs = Number(cpuApiBridgeConfig.timeoutMs) || 1200;
  const controller = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const timer = controller ? setTimeout(()=>{
    try{ controller.abort(); }catch(e){}
  }, timeoutMs) : null;

  const payload = buildCpuApiBridgePayload(kind, snapshot);
  lastCpuApiBridgeRequest = {
    mode: "async",
    endpoint: finalEndpoint,
    kind,
    payload,
    requestedAt: Date.now()
  };

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeRequest === "function"){
      window.MBSanmaMatchLog.pushCpuApiBridgeRequest(lastCpuApiBridgeRequest);
    }
  }catch(e){}

  try{
    const response = await fetch(finalEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    });

    let data = null;
    try{
      data = await response.json();
    }catch(parseError){
      data = null;
    }

    const result = {
      ok: response.ok,
      status: response.status,
      data,
      decision: normalizeFn(data),
      receivedAt: Date.now()
    };

    lastCpuApiBridgeResponse = result;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeResponse === "function"){
        window.MBSanmaMatchLog.pushCpuApiBridgeResponse({ ...result, mode: "async", endpoint: finalEndpoint, kind });
      }
    }catch(e){}

    if (cpuApiBridgeConfig.log){
      try{
        console.log("[cpu_api_bridge] async response", kind, result);
      }catch(e){}
    }

    return result;
  }catch(error){
    const result = {
      ok: false,
      error: (error && error.name === "AbortError") ? "timeout" : String(error && error.message ? error.message : error),
      receivedAt: Date.now()
    };

    lastCpuApiBridgeResponse = result;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeResponse === "function"){
        window.MBSanmaMatchLog.pushCpuApiBridgeResponse({ ...result, mode: "async", endpoint: finalEndpoint, kind });
      }
    }catch(e){}

    if (cpuApiBridgeConfig.log){
      try{
        console.warn("[cpu_api_bridge] async request failed", kind, result);
      }catch(e){}
    }

    return result;
  }finally{
    if (timer) clearTimeout(timer);
  }
}

function requestCpuDecisionSync(snapshot, endpoint, kind, normalizeFn){
  if (!snapshot || typeof snapshot !== "object") return null;
  if (!isCpuApiBridgeEnabled()) return null;

  const finalEndpoint = String(endpoint || "").trim();
  if (!finalEndpoint) return null;
  if (typeof XMLHttpRequest === "undefined") return null;

  const payload = buildCpuApiBridgePayload(kind, snapshot);
  lastCpuApiBridgeRequest = {
    mode: "sync",
    endpoint: finalEndpoint,
    kind,
    payload,
    requestedAt: Date.now()
  };

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeRequest === "function"){
      window.MBSanmaMatchLog.pushCpuApiBridgeRequest(lastCpuApiBridgeRequest);
    }
  }catch(e){}

  let xhr = null;
  try{
    xhr = new XMLHttpRequest();
    xhr.open("POST", finalEndpoint, false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(payload));

    let data = null;
    try{
      data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    }catch(parseError){
      data = null;
    }

    const result = {
      ok: xhr.status >= 200 && xhr.status < 300,
      status: xhr.status,
      data,
      decision: normalizeFn(data),
      receivedAt: Date.now()
    };

    lastCpuApiBridgeResponse = result;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeResponse === "function"){
        window.MBSanmaMatchLog.pushCpuApiBridgeResponse({ ...result, mode: "sync", endpoint: finalEndpoint, kind });
      }
    }catch(e){}

    if (cpuApiBridgeConfig.log){
      try{
        console.log("[cpu_api_bridge] sync response", kind, result);
      }catch(e){}
    }

    if (result.ok && result.decision != null){
      return result.decision;
    }
    return null;
  }catch(error){
    const result = {
      ok: false,
      error: String(error && error.message ? error.message : error),
      receivedAt: Date.now()
    };

    lastCpuApiBridgeResponse = result;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuApiBridgeResponse === "function"){
        window.MBSanmaMatchLog.pushCpuApiBridgeResponse({ ...result, mode: "sync", endpoint: finalEndpoint, kind });
      }
    }catch(e){}

    if (cpuApiBridgeConfig.log){
      try{
        console.warn("[cpu_api_bridge] sync request failed", kind, result);
      }catch(e){}
    }

    return null;
  }
}

function postCpuCallSnapshotToApi(snapshot){
  const endpoint = String(cpuApiBridgeConfig.endpoint || "").trim();
  return postCpuSnapshotToApi(snapshot, endpoint, "cpuOpenCallCandidate", normalizeCpuCallBridgeDecisionPayload);
}

function sendCpuCallSnapshotToApi(snapshot){
  if (!isCpuApiBridgeEnabled()) return null;
  const promise = postCpuCallSnapshotToApi(snapshot);
  promise.catch(()=>{});
  return promise;
}

function requestCpuCallDecisionSync(snapshot){
  const endpoint = String(cpuApiBridgeConfig.endpoint || "").trim();
  return requestCpuDecisionSync(snapshot, endpoint, "cpuOpenCallCandidate", normalizeCpuCallBridgeDecisionPayload);
}

function postCpuDiscardSnapshotToApi(snapshot){
  const endpoint = String(cpuApiBridgeConfig.discardEndpoint || deriveDiscardEndpoint(cpuApiBridgeConfig.endpoint) || "").trim();
  return postCpuSnapshotToApi(snapshot, endpoint, "cpuDiscardCandidate", normalizeCpuDiscardBridgeDecisionPayload);
}

function sendCpuDiscardSnapshotToApi(snapshot){
  if (!isCpuApiBridgeEnabled()) return null;
  const promise = postCpuDiscardSnapshotToApi(snapshot);
  promise.catch(()=>{});
  return promise;
}

function requestCpuDiscardDecisionSync(snapshot){
  const endpoint = String(cpuApiBridgeConfig.discardEndpoint || deriveDiscardEndpoint(cpuApiBridgeConfig.endpoint) || "").trim();
  return requestCpuDecisionSync(snapshot, endpoint, "cpuDiscardCandidate", normalizeCpuDiscardBridgeDecisionPayload);
}

function installCpuApiBridgeSnapshotHook(){
  try{
    if (typeof window === "undefined") return false;
    if (cpuApiBridgeInstalled) return true;

    cpuApiBridgePrevCallHook = (typeof window.onCpuCallSnapshot === "function")
      ? window.onCpuCallSnapshot
      : null;

    cpuApiBridgePrevDiscardHook = (typeof window.onCpuDiscardSnapshot === "function")
      ? window.onCpuDiscardSnapshot
      : null;

    window.onCpuCallSnapshot = function(snapshot){
      let prevDecision = null;

      if (typeof cpuApiBridgePrevCallHook === "function"){
        try{
          prevDecision = cpuApiBridgePrevCallHook(snapshot);
        }catch(e){
          prevDecision = null;
        }
      }

      if (prevDecision != null){
        return prevDecision;
      }

      if (!isCpuApiBridgeEnabled()){
        return null;
      }

      if (cpuApiBridgeConfig.useSyncDecision){
        const bridgeDecision = requestCpuCallDecisionSync(snapshot);
        if (bridgeDecision != null){
          return bridgeDecision;
        }
        return null;
      }

      sendCpuCallSnapshotToApi(snapshot);
      return null;
    };

    window.onCpuDiscardSnapshot = function(snapshot){
      let prevDecision = null;

      if (typeof cpuApiBridgePrevDiscardHook === "function"){
        try{
          prevDecision = cpuApiBridgePrevDiscardHook(snapshot);
        }catch(e){
          prevDecision = null;
        }
      }

      if (prevDecision != null){
        return prevDecision;
      }

      if (!isCpuApiBridgeEnabled()){
        return null;
      }

      if (cpuApiBridgeConfig.useSyncDecision){
        const bridgeDecision = requestCpuDiscardDecisionSync(snapshot);
        if (bridgeDecision != null){
          return bridgeDecision;
        }
        return null;
      }

      sendCpuDiscardSnapshotToApi(snapshot);
      return null;
    };

    cpuApiBridgeInstalled = true;
    return true;
  }catch(e){
    return false;
  }
}

function uninstallCpuApiBridgeSnapshotHook(){
  try{
    if (typeof window === "undefined") return false;
    if (!cpuApiBridgeInstalled) return true;

    window.onCpuCallSnapshot = cpuApiBridgePrevCallHook;
    window.onCpuDiscardSnapshot = cpuApiBridgePrevDiscardHook;
    cpuApiBridgePrevCallHook = null;
    cpuApiBridgePrevDiscardHook = null;
    cpuApiBridgeInstalled = false;
    return true;
  }catch(e){
    return false;
  }
}

function getLastCpuApiBridgeRequest(){
  return lastCpuApiBridgeRequest ? { ...lastCpuApiBridgeRequest } : null;
}

function getLastCpuApiBridgeResponse(){
  return lastCpuApiBridgeResponse ? { ...lastCpuApiBridgeResponse } : null;
}

try{
  if (typeof window !== "undefined"){
    window.cpuApiBridgeConfig = cloneCpuApiBridgeConfig();
    window.getCpuApiBridgeConfig = getCpuApiBridgeConfig;
    window.setCpuApiBridgeConfig = setCpuApiBridgeConfig;
    window.resetCpuApiBridgeConfig = resetCpuApiBridgeConfig;
    window.isCpuApiBridgeEnabled = isCpuApiBridgeEnabled;
    window.buildCpuApiBridgePayload = buildCpuApiBridgePayload;
    window.normalizeCpuCallBridgeDecisionPayload = normalizeCpuCallBridgeDecisionPayload;
    window.normalizeCpuDiscardBridgeDecisionPayload = normalizeCpuDiscardBridgeDecisionPayload;
    window.postCpuCallSnapshotToApi = postCpuCallSnapshotToApi;
    window.sendCpuCallSnapshotToApi = sendCpuCallSnapshotToApi;
    window.requestCpuCallDecisionSync = requestCpuCallDecisionSync;
    window.postCpuDiscardSnapshotToApi = postCpuDiscardSnapshotToApi;
    window.sendCpuDiscardSnapshotToApi = sendCpuDiscardSnapshotToApi;
    window.requestCpuDiscardDecisionSync = requestCpuDiscardDecisionSync;
    window.installCpuApiBridgeSnapshotHook = installCpuApiBridgeSnapshotHook;
    window.uninstallCpuApiBridgeSnapshotHook = uninstallCpuApiBridgeSnapshotHook;
    window.getLastCpuApiBridgeRequest = getLastCpuApiBridgeRequest;
    window.getLastCpuApiBridgeResponse = getLastCpuApiBridgeResponse;

    if (cpuApiBridgeConfig.autoInstallHook){
      installCpuApiBridgeSnapshotHook();
    }
  }
}catch(e){}
