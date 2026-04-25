// ========= match_log.js（半荘/局ログ基盤） =========
// 役割：
// - アプリ版の半荘ログを局単位で残す
// - 後から牌譜解析・データ分析へつなげる最小ログを保持する
// - render系は触らず、状態変更後の事実だけを記録する

(function(global){
  "use strict";

  const STORAGE_VERSION = 1;
  const ACTIVE_SESSION_STORAGE_KEY = "mbsanma_app_active_session_v1";
  const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "mbsanma_visitor_active_session_v1";
  const CURRENT_LOGIN_ACCOUNT_STORAGE_KEY = "mbsanma_app_current_login_account_v1";
  const MATCH_LOG_KEY_PREFIX = "mbsanma_app_match_logs_";
  const MATCH_LOG_IDB_NAME = "mbsanma_app_logs_db";
  const MATCH_LOG_IDB_STORE = "completed_match_logs";
  const MATCH_LOG_IDB_VERSION = 1;
  const LEGACY_MIGRATION_KEY_PREFIX = "mbsanma_app_match_logs_migrated_";
  const BENCHMARK_SCOPE_SUFFIX = "__batch_benchmark_v1";
  const MAX_STORED_MATCHES = 300;
  const MAX_STORED_BATCH_MATCHES = 10000;

  let currentLog = null;
  let dbPromise = null;
  const scopeCacheMap = new Map();
  const migrationPromiseMap = new Map();

  function safeNowIso(){
    try{ return new Date().toISOString(); }catch(e){ return ""; }
  }

  function normalizeAccountId(value){
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function normalizeTileImgCode(imgCode, code = ""){
    const raw = String(imgCode || code || "");
    if (!raw) return String(code || "");
    return raw;
  }

  function getTileColorKeyFromImgCode(imgCode, code = ""){
    const normalized = normalizeTileImgCode(imgCode, code);
    if (normalized.length < 3) return "";
    const prefix = normalized[0];
    if (!["r", "b", "g", "n"].includes(prefix)) return "";
    const body = normalized.slice(1);
    const baseCode = String(code || body || "");
    if (!body || body === baseCode) return prefix;
    return "";
  }

  function normalizeTileLike(value){
    if (!value || typeof value !== "object") return value;
    if (!value.code) return value;

    const code = String(value.code || "");
    const imgCode = normalizeTileImgCode(value.imgCode || code, code);
    const colorKey = getTileColorKeyFromImgCode(imgCode, code);

    return {
      ...value,
      code,
      imgCode,
      colorKey,
      isRed: !!value.isRed || colorKey === "r"
    };
  }

  function normalizeStoredLogPayload(value){
    if (Array.isArray(value)) return value.map(normalizeStoredLogPayload);
    if (!value || typeof value !== "object") return value;

    const out = {};
    Object.keys(value).forEach((key)=> {
      out[key] = normalizeStoredLogPayload(value[key]);
    });

    if (out.code) return normalizeTileLike(out);
    return out;
  }

  function hasIndexedDb(){
    try{
      return !!global.indexedDB;
    }catch(e){
      return false;
    }
  }

  function readCurrentLoginAccount(){
    try{
      return normalizeAccountId(localStorage.getItem(CURRENT_LOGIN_ACCOUNT_STORAGE_KEY) || "");
    }catch(e){
      return "";
    }
  }

  function writeActiveSessionSnapshot(mode, accountId){
    const payload = {
      mode: mode === "account" ? "account" : "local",
      accountId: mode === "account" ? normalizeAccountId(accountId) : ""
    };
    try{
      const serialized = JSON.stringify(payload);
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, serialized);
      sessionStorage.setItem(LEGACY_ACTIVE_SESSION_STORAGE_KEY, serialized);
    }catch(e){}
    return payload;
  }

  function readActiveSession(){
    const loginAccountId = readCurrentLoginAccount();
    if (loginAccountId){
      return writeActiveSessionSnapshot("account", loginAccountId);
    }

    const keys = [ACTIVE_SESSION_STORAGE_KEY, LEGACY_ACTIVE_SESSION_STORAGE_KEY];
    for (const key of keys){
      try{
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const mode = parsed && parsed.mode === "account" ? "account" : (parsed && parsed.mode === "local" ? "local" : "");
        if (!mode) continue;
        return writeActiveSessionSnapshot(mode, mode === "account" ? normalizeAccountId(parsed && parsed.accountId) : "");
      }catch(e){}
    }

    return writeActiveSessionSnapshot("local", "");
  }

  function getScopeKeyBySession(session){
    const src = session && typeof session === "object" ? session : readActiveSession();
    if (src.mode === "account" && src.accountId){
      return `${MATCH_LOG_KEY_PREFIX}account_${normalizeAccountId(src.accountId)}_v${STORAGE_VERSION}`;
    }
    return `${MATCH_LOG_KEY_PREFIX}local_v${STORAGE_VERSION}`;
  }

  function getScopedStorageKey(){
    return getScopeKeyBySession(readActiveSession());
  }

  function cloneTile(tile){
    if (!tile || !tile.code) return null;
    const code = String(tile.code || "");
    const imgCode = normalizeTileImgCode(tile.imgCode || code, code);
    const colorKey = tile.colorKey || getTileColorKeyFromImgCode(imgCode, code);
    return {
      id: Number.isFinite(tile.id) ? tile.id : null,
      code,
      imgCode,
      colorKey,
      isRed: !!tile.isRed || colorKey === "r",
      isRiichiDeclare: !!tile.isRiichiDeclare
    };
  }

  function cloneTileArray(list){
    return Array.isArray(list) ? list.map(cloneTile).filter(Boolean) : [];
  }

  function cloneMeld(meld){
    if (!meld || typeof meld !== "object") return null;
    return {
      type: meld.type || "",
      code: meld.code || "",
      from: meld.from || "",
      calledIndex: Number.isInteger(meld.calledIndex) ? meld.calledIndex : null,
      tiles: cloneTileArray(meld.tiles),
      addedTile: cloneTile(meld.addedTile)
    };
  }

  function cloneMeldArray(list){
    return Array.isArray(list) ? list.map(cloneMeld).filter(Boolean) : [];
  }

  function cloneScores(list){
    return Array.isArray(list) ? list.slice(0, 3).map((v)=> Number(v) || 0) : [0, 0, 0];
  }

  function clonePlainData(value){
    try{
      if (value == null) return value;
      return JSON.parse(JSON.stringify(value));
    }catch(e){
      return null;
    }
  }

  function cloneSettlement(settlement){
    if (!settlement || typeof settlement !== "object") return null;

    function cloneOptionalAgariDetail(src){
      if (!src || typeof src !== "object") return null;
      const out = {
        scoreInfo: clonePlainData(src.scoreInfo),
        pointText: typeof src.pointText === "string" ? src.pointText : "",
        pointValue: Number.isFinite(Number(src.pointValue)) ? Number(src.pointValue) : null,
        han: Number.isFinite(Number(src.han)) ? Number(src.han) : null,
        fu: Number.isFinite(Number(src.fu)) ? Number(src.fu) : null,
        totalHan: Number.isFinite(Number(src.totalHan)) ? Number(src.totalHan) : null,
        yakuman: Number.isFinite(Number(src.yakuman)) ? Number(src.yakuman) : null,
        yaku: clonePlainData(src.yaku),
        bonus: clonePlainData(src.bonus),
        yakuInfo: clonePlainData(src.yakuInfo),
        chipInfo: clonePlainData(src.chipInfo),
        resultMeta: clonePlainData(src.resultMeta)
      };

      if (
        out.scoreInfo == null &&
        !out.pointText &&
        out.pointValue == null &&
        out.han == null &&
        out.fu == null &&
        out.totalHan == null &&
        out.yakuman == null &&
        out.yaku == null &&
        out.bonus == null &&
        out.yakuInfo == null &&
        out.chipInfo == null &&
        out.resultMeta == null
      ){
        return null;
      }

      return out;
    }

    function cloneAgariEntry(entry){
      if (!entry || typeof entry !== "object") return null;
      const out = {
        winType: entry.winType || "",
        winnerSeatIndex: Number.isInteger(entry.winnerSeatIndex) ? entry.winnerSeatIndex : null,
        discarderSeatIndex: Number.isInteger(entry.discarderSeatIndex) ? entry.discarderSeatIndex : null,
        ronTile: cloneTile(entry.ronTile),
        headWinner: !!entry.headWinner
      };
      const detail = cloneOptionalAgariDetail(entry);
      if (detail) Object.assign(out, detail);
      return out;
    }

    const out = {
      type: settlement.type || "",
      winType: settlement.winType || "",
      winnerSeatIndex: Number.isInteger(settlement.winnerSeatIndex) ? settlement.winnerSeatIndex : null,
      discarderSeatIndex: Number.isInteger(settlement.discarderSeatIndex) ? settlement.discarderSeatIndex : null,
      beforeScores: cloneScores(settlement.beforeScores),
      afterScores: cloneScores(settlement.afterScores),
      delta: cloneScores(settlement.delta),
      previousKyotakuCount: Number(settlement.previousKyotakuCount) || 0,
      currentHandKyotakuCount: Number(settlement.currentHandKyotakuCount) || 0,
      nextKyotakuCount: Number(settlement.nextKyotakuCount) || 0,
      tenpaiSeats: Array.isArray(settlement.tenpaiSeats) ? settlement.tenpaiSeats.slice() : [],
      riichiSeats: Array.isArray(settlement.riichiSeats) ? settlement.riichiSeats.slice() : []
    };

    const settlementDetail = cloneOptionalAgariDetail(settlement);
    if (settlementDetail) Object.assign(out, settlementDetail);

    if (Array.isArray(settlement.agariEntries)){
      out.agariEntries = settlement.agariEntries.map(cloneAgariEntry).filter(Boolean);
    }

    if (settlement.headEntry){
      out.headEntry = cloneAgariEntry(settlement.headEntry);
    }

    return out;
  }

  function cloneKyokuSnapshot(input){
    const src = input && typeof input === "object" ? input : {};
    return {
      roundWind: src.roundWind || "",
      roundNumber: Number(src.roundNumber) || 0,
      honba: Number(src.honba) || 0,
      eastSeatIndex: Number.isInteger(src.eastSeatIndex) ? src.eastSeatIndex : 0,
      kyotakuCount: Number(src.kyotakuCount) || 0,
      scores: cloneScores(src.scores),
      doraIndicators: cloneTileArray(src.doraIndicators),
      uraDoraIndicators: cloneTileArray(src.uraDoraIndicators),
      wall: cloneTileArray(src.wall),
      deadWall: cloneTileArray(src.deadWall),
      hand13: cloneTileArray(src.hand13),
      drawn: cloneTile(src.drawn),
      cpuRightHand13: cloneTileArray(src.cpuRightHand13),
      cpuLeftHand13: cloneTileArray(src.cpuLeftHand13),
      river: cloneTileArray(src.river),
      cpuRightRiver: cloneTileArray(src.cpuRightRiver),
      cpuLeftRiver: cloneTileArray(src.cpuLeftRiver),
      melds: cloneMeldArray(src.melds),
      cpuRightMelds: cloneMeldArray(src.cpuRightMelds),
      cpuLeftMelds: cloneMeldArray(src.cpuLeftMelds),
      peis: cloneTileArray(src.peis),
      cpuRightPeis: cloneTileArray(src.cpuRightPeis),
      cpuLeftPeis: cloneTileArray(src.cpuLeftPeis)
    };
  }

  function stripHeavyStartSnapshotForStorage(snapshot){
    const src = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      roundWind: src.roundWind || "",
      roundNumber: Number(src.roundNumber) || 0,
      honba: Number(src.honba) || 0,
      eastSeatIndex: Number.isInteger(src.eastSeatIndex) ? src.eastSeatIndex : 0,
      kyotakuCount: Number(src.kyotakuCount) || 0,
      scores: cloneScores(src.scores),
      doraIndicators: cloneTileArray(src.doraIndicators),
      uraDoraIndicators: cloneTileArray(src.uraDoraIndicators),
      wall: cloneTileArray(src.wall),
      deadWall: cloneTileArray(src.deadWall),
      hand13: cloneTileArray(src.hand13),
      drawn: cloneTile(src.drawn),
      cpuRightHand13: cloneTileArray(src.cpuRightHand13),
      cpuLeftHand13: cloneTileArray(src.cpuLeftHand13),
      river: cloneTileArray(src.river),
      cpuRightRiver: cloneTileArray(src.cpuRightRiver),
      cpuLeftRiver: cloneTileArray(src.cpuLeftRiver),
      melds: cloneMeldArray(src.melds),
      cpuRightMelds: cloneMeldArray(src.cpuRightMelds),
      cpuLeftMelds: cloneMeldArray(src.cpuLeftMelds),
      peis: cloneTileArray(src.peis),
      cpuRightPeis: cloneTileArray(src.cpuRightPeis),
      cpuLeftPeis: cloneTileArray(src.cpuLeftPeis)
    };
  }

  function stripAnalysisStartSnapshotForStorage(snapshot){
    const src = snapshot && typeof snapshot === "object" ? snapshot : {};
    return {
      roundWind: src.roundWind || "",
      roundNumber: Number(src.roundNumber) || 0,
      honba: Number(src.honba) || 0,
      eastSeatIndex: Number.isInteger(src.eastSeatIndex) ? src.eastSeatIndex : 0,
      kyotakuCount: Number(src.kyotakuCount) || 0,
      scores: cloneScores(src.scores),
      doraIndicators: cloneTileArray(src.doraIndicators),
      uraDoraIndicators: cloneTileArray(src.uraDoraIndicators)
    };
  }

  function stripExternalDataFromCpuSeatMeta(cpuSeats){
    const src = cpuSeats && typeof cpuSeats === "object" ? cpuSeats : {};
    const out = {};
    Object.keys(src).forEach((seatKey)=> {
      const seat = src[seatKey] && typeof src[seatKey] === "object" ? src[seatKey] : {};
      out[seatKey] = {
        openProfileKey: typeof seat.openProfileKey === "string" ? seat.openProfileKey : "",
        discardStyleKey: typeof seat.discardStyleKey === "string" ? seat.discardStyleKey : ""
      };
    });
    return out;
  }

  function stripMetaForStorage(meta){
    const src = meta && typeof meta === "object" ? meta : {};
    const out = {};

    if (typeof src.appMode === "string") out.appMode = src.appMode;
    if (typeof src.appTitle === "string") out.appTitle = src.appTitle;
    if (typeof src.startedFrom === "string") out.startedFrom = src.startedFrom;
    if (typeof src.ruleSetId === "string") out.ruleSetId = src.ruleSetId;
    if (src.ruleSnapshot && typeof src.ruleSnapshot === "object") out.ruleSnapshot = clonePlainData(src.ruleSnapshot);
    if (typeof src.cpuProfileSetId === "string") out.cpuProfileSetId = src.cpuProfileSetId;
    if (typeof src.matchMode === "string") out.matchMode = src.matchMode;
    if (typeof src.launchMode === "string") out.launchMode = src.launchMode;
    if (typeof src.playerMode === "string") out.playerMode = src.playerMode;

    if (src.playerControl && typeof src.playerControl === "object"){
      out.playerControl = {
        discardMode: typeof src.playerControl.discardMode === "string" ? src.playerControl.discardMode : "",
        openMode: typeof src.playerControl.openMode === "string" ? src.playerControl.openMode : "",
        specialMode: typeof src.playerControl.specialMode === "string" ? src.playerControl.specialMode : ""
      };
    }

    if (src.batchRun && typeof src.batchRun === "object"){
      out.batchRun = {
        id: typeof src.batchRun.id === "string" ? src.batchRun.id : "",
        profileKey: typeof src.batchRun.profileKey === "string" ? src.batchRun.profileKey : "",
        currentIndex: Number(src.batchRun.currentIndex) || 0,
        totalCount: Number(src.batchRun.totalCount) || 0
      };
    }

    if (src.cpuSeats && typeof src.cpuSeats === "object"){
      out.cpuSeats = stripExternalDataFromCpuSeatMeta(src.cpuSeats);
    }

    return out;
  }

  function stripEventPayloadForStorage(type, payload){
    const src = payload && typeof payload === "object" ? payload : {};
    const eventType = String(type || "");

    if (eventType === "cpu_open_decision"){
      return {
        decisionId: Number(src.decisionId) || null,
        snapshotId: Number(src.snapshotId) || null,
        seatIndex: Number.isInteger(src.seatIndex) ? src.seatIndex : null,
        action: src.action || "",
        createdAt: Number(src.createdAt) || 0,
        note: src.note || "",
        reasonTag: src.reasonTag || "",
        reasonTags: Array.isArray(src.reasonTags) ? src.reasonTags.slice() : [],
        status: src.status || "",
        consumed: !!src.consumed,
        finalAction: src.finalAction || "",
        resolvedAt: Number(src.resolvedAt) || 0
      };
    }

    if (eventType === "cpu_discard_decision"){
      return {
        snapshotId: Number(src.snapshotId) || null,
        seatIndex: Number.isInteger(src.seatIndex) ? src.seatIndex : null,
        action: src.action || "",
        note: src.note || "",
        reasonTag: src.reasonTag || "",
        reasonTags: Array.isArray(src.reasonTags) ? src.reasonTags.slice() : [],
        status: src.status || "",
        createdAt: Number(src.createdAt) || 0,
        updatedAt: Number(src.updatedAt) || 0,
        discardTileId: Number.isInteger(src.discardTileId) ? src.discardTileId : null,
        discardIndex: Number.isInteger(src.discardIndex) ? src.discardIndex : null,
        discardCode: src.discardCode || "",
        candidateSummary: clonePlainData(src.candidateSummary) || null,
        selectedDiscardTileId: Number.isInteger(src.selectedDiscardTileId) ? src.selectedDiscardTileId : null,
        selectedDiscardIndex: Number.isInteger(src.selectedDiscardIndex) ? src.selectedDiscardIndex : null,
        selectedDiscardCode: src.selectedDiscardCode || "",
        finalAction: src.finalAction || "",
        finalDiscardTileId: Number.isInteger(src.finalDiscardTileId) ? src.finalDiscardTileId : null,
        finalDiscardCode: src.finalDiscardCode || "",
        willRiichi: !!src.willRiichi
      };
    }

    return clonePlainData(src);
  }

  function isHeavyEventTypeForStorage(type){
    return type === "cpu_open_snapshot" ||
      type === "cpu_discard_snapshot" ||
      type === "cpu_api_bridge_request" ||
      type === "cpu_api_bridge_response";
  }

  function getNormalizedMatchModeForStorage(meta){
    const raw = String(meta && meta.matchMode || "").toLowerCase();
    if (raw === "cpu_batch" || raw === "batch") return "batch";
    if (raw === "app_play" || raw === "normal" || raw === "play" || raw === "manual") return "normal";
    return raw || "unknown";
  }

  function shouldUseAnalysisStorageShape(meta){
    return getNormalizedMatchModeForStorage(meta) === "batch";
  }

  function isAnalysisEventTypeForStorage(type){
    return type === "draw" ||
      type === "discard" ||
      type === "riichi" ||
      type === "pon" ||
      type === "minkan" ||
      type === "kakan";
  }

  function stripAnalysisEventPayloadForStorage(type, payload){
    const src = payload && typeof payload === "object" ? payload : {};
    const eventType = String(type || "");

    if (eventType === "draw" || eventType === "discard" || eventType === "pon" || eventType === "minkan" || eventType === "kakan"){
      return {
        seatIndex: Number.isInteger(src.seatIndex) ? src.seatIndex : null
      };
    }

    if (eventType === "riichi"){
      const tenpai = src.tenpai && typeof src.tenpai === "object" ? src.tenpai : {};
      return {
        seatIndex: Number.isInteger(src.seatIndex) ? src.seatIndex : null,
        junme: Number(src.junme) || 0,
        tenpai: {
          waitTileCount: Number(tenpai.waitTileCount) || 0,
          waitTypeCount: Number(tenpai.waitTypeCount) || 0,
          waitTypeKeys: Array.isArray(tenpai.waitTypeKeys) ? tenpai.waitTypeKeys.slice() : [],
          waitCodes: Array.isArray(tenpai.waitCodes) ? tenpai.waitCodes.slice() : [],
          isRyanmenWait: typeof tenpai.isRyanmenWait === "boolean" ? tenpai.isRyanmenWait : null
        }
      };
    }

    return null;
  }

  function buildStoredKyokuEvents(src, useAnalysisShape){
    if (!Array.isArray(src && src.events)) return [];
    return src.events
      .filter((event)=> {
        const type = String(event && event.type || "");
        if (isHeavyEventTypeForStorage(type)) return false;
        if (!useAnalysisShape) return true;
        return isAnalysisEventTypeForStorage(type);
      })
      .map((event)=> {
        const type = String(event && event.type || "event");
        const payload = useAnalysisShape
          ? stripAnalysisEventPayloadForStorage(type, event && event.payload)
          : stripEventPayloadForStorage(type, event && event.payload);
        return {
          seq: Number(event && event.seq) || 0,
          at: event && typeof event.at === "string" ? event.at : "",
          type,
          payload
        };
      })
      .filter((event)=> event && (!useAnalysisShape || event.payload));
  }

  function getStoredMatchLimitForLog(log){
    const mode = getNormalizedMatchModeForStorage(log && log.meta);
    if (mode === "batch") return MAX_STORED_BATCH_MATCHES;
    return MAX_STORED_MATCHES;
  }

  function trimStoredLogsForLimits(list){
    const keptByMode = Object.create(null);
    return sortStoredLogs(list).filter((item)=> {
      if (!item || typeof item !== "object" || !item.matchId) return false;
      const mode = getNormalizedMatchModeForStorage(item.meta);
      const limit = mode === "batch" ? MAX_STORED_BATCH_MATCHES : MAX_STORED_MATCHES;
      const count = keptByMode[mode] || 0;
      if (count >= limit) return false;
      keptByMode[mode] = count + 1;
      return true;
    });
  }

  function buildStorageOptimizedLog(log){
    if (!log || typeof log !== "object") return null;
    const useAnalysisShape = shouldUseAnalysisStorageShape(log.meta);

    const kyokus = Array.isArray(log.kyokus) ? log.kyokus.map((kyoku)=> {
      const src = kyoku && typeof kyoku === "object" ? kyoku : {};
      const events = buildStoredKyokuEvents(src, useAnalysisShape);

      return {
        kyokuId: src.kyokuId || "",
        kyokuIndex: Number(src.kyokuIndex) || 0,
        startedAt: src.startedAt || "",
        endedAt: src.endedAt || "",
        start: useAnalysisShape ? stripAnalysisStartSnapshotForStorage(src.start) : stripHeavyStartSnapshotForStorage(src.start),
        events,
        settlement: cloneSettlement(src.settlement),
        summary: clonePlainData(src.summary)
      };
    }) : [];

    return {
      storageVersion: Number(log.storageVersion) || STORAGE_VERSION,
      schemaVersion: Number(log.schemaVersion) || 1,
      matchId: log.matchId || `match_${Date.now()}`,
      startedAt: log.startedAt || "",
      endedAt: log.endedAt || "",
      session: clonePlainData(log.session) || readActiveSession(),
      meta: stripMetaForStorage(log.meta),
      kyokus,
      summary: clonePlainData(log.summary),
      updatedAt: safeNowIso()
    };
  }

  function sortStoredLogs(list){
    return safeArray(list).slice().sort((a, b)=> {
      const aTime = String((a && a.endedAt) || (a && a.updatedAt) || (a && a.startedAt) || "");
      const bTime = String((b && b.endedAt) || (b && b.updatedAt) || (b && b.startedAt) || "");
      if (aTime === bTime){
        const aId = String(a && a.matchId || "");
        const bId = String(b && b.matchId || "");
        return aId < bId ? 1 : (aId > bId ? -1 : 0);
      }
      return aTime < bTime ? 1 : -1;
    });
  }

  function getMigrationMarkerKey(scopeKey){
    return `${LEGACY_MIGRATION_KEY_PREFIX}${scopeKey}`;
  }

  function readLegacyStoredList(scopeKey){
    try{
      const raw = localStorage.getItem(scopeKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((item)=> item && typeof item === "object").map((item)=> normalizeStoredLogPayload(item))
        : [];
    }catch(e){
      return [];
    }
  }

  function readStoredListFromLocalStorage(scopeKey){
    return sortStoredLogs(readLegacyStoredList(scopeKey || getScopedStorageKey()));
  }

  function persistCompletedLogToLocalStorage(log, scopeKey){
    if (!log || typeof log !== "object") return false;
    const optimizedLog = buildStorageOptimizedLog(log);
    const storageKey = String(scopeKey || getScopedStorageKey());

    try{
      const list = readStoredListFromLocalStorage(storageKey);
      const next = trimStoredLogsForLimits([optimizedLog, ...list.filter((item)=> item && item.matchId !== optimizedLog.matchId)]);
      localStorage.setItem(storageKey, JSON.stringify(next));
      scopeCacheMap.set(storageKey, next);
      return true;
    }catch(e){
      try{
        console.warn("[match_log] persistCompletedLog localStorage failed", {
          storageKey,
          matchId: optimizedLog && optimizedLog.matchId ? optimizedLog.matchId : "",
          kyokuCount: optimizedLog && Array.isArray(optimizedLog.kyokus) ? optimizedLog.kyokus.length : 0,
          error: e && e.message ? e.message : e
        });
      }catch(_e){}
      return false;
    }
  }

  function openDatabase(){
    if (!hasIndexedDb()){
      return Promise.resolve(null);
    }
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve)=> {
      try{
        const request = global.indexedDB.open(MATCH_LOG_IDB_NAME, MATCH_LOG_IDB_VERSION);

        request.onupgradeneeded = ()=> {
          const db = request.result;
          let store = null;
          if (db.objectStoreNames.contains(MATCH_LOG_IDB_STORE)){
            store = request.transaction.objectStore(MATCH_LOG_IDB_STORE);
          }else{
            store = db.createObjectStore(MATCH_LOG_IDB_STORE, { keyPath: "storageId" });
          }

          if (!store.indexNames.contains("scopeKey")){
            store.createIndex("scopeKey", "scopeKey", { unique: false });
          }
          if (!store.indexNames.contains("scopeKey_updatedAt")){
            store.createIndex("scopeKey_updatedAt", ["scopeKey", "updatedAt"], { unique: false });
          }
        };

        request.onsuccess = ()=> resolve(request.result || null);
        request.onerror = ()=> {
          try{
            console.warn("[match_log] IndexedDB open failed", request.error || request.errorCode || "unknown");
          }catch(e){}
          resolve(null);
        };
      }catch(e){
        try{
          console.warn("[match_log] IndexedDB unavailable", e && e.message ? e.message : e);
        }catch(_e){}
        resolve(null);
      }
    });

    return dbPromise;
  }

  function buildStorageRecord(scopeKey, optimizedLog){
    return {
      storageId: `${scopeKey}::${optimizedLog.matchId}`,
      scopeKey,
      matchId: optimizedLog.matchId,
      endedAt: optimizedLog.endedAt || "",
      updatedAt: optimizedLog.updatedAt || "",
      payload: optimizedLog
    };
  }

  async function readStoredListFromIndexedDb(scopeKey){
    const key = String(scopeKey || getScopedStorageKey());
    const db = await openDatabase();
    if (!db) return readStoredListFromLocalStorage(key);

    return await new Promise((resolve)=> {
      try{
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readonly");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        const index = store.index("scopeKey");
        const request = index.getAll(IDBKeyRange.only(key));
        request.onsuccess = ()=> {
          const rows = Array.isArray(request.result) ? request.result : [];
          const list = sortStoredLogs(rows.map((row)=> row && row.payload).filter((item)=> item && typeof item === "object").map((item)=> normalizeStoredLogPayload(item)));
          scopeCacheMap.set(key, list);
          resolve(list);
        };
        request.onerror = ()=> resolve(readStoredListFromLocalStorage(key));
      }catch(e){
        resolve(readStoredListFromLocalStorage(key));
      }
    });
  }

  function migrateLegacyLocalStorageIfNeeded(scopeKey){
    const key = String(scopeKey || getScopedStorageKey());
    if (!hasIndexedDb()){
      scopeCacheMap.set(key, readStoredListFromLocalStorage(key));
      return Promise.resolve(scopeCacheMap.get(key) || []);
    }
    if (migrationPromiseMap.has(key)) return migrationPromiseMap.get(key);

    const promise = (async ()=> {
      const markerKey = getMigrationMarkerKey(key);
      let alreadyMigrated = false;
      try{
        alreadyMigrated = localStorage.getItem(markerKey) === "1";
      }catch(e){
        alreadyMigrated = false;
      }

      const db = await openDatabase();
      if (!db){
        const legacyList = readStoredListFromLocalStorage(key);
        scopeCacheMap.set(key, legacyList);
        return legacyList;
      }

      if (!alreadyMigrated){
        const legacyList = readStoredListFromLocalStorage(key);
        if (legacyList.length){
          await new Promise((resolve)=> {
            try{
              const tx = db.transaction(MATCH_LOG_IDB_STORE, "readwrite");
              const store = tx.objectStore(MATCH_LOG_IDB_STORE);
              legacyList.forEach((log)=> {
                const optimizedLog = buildStorageOptimizedLog(log);
                if (!optimizedLog) return;
                store.put(buildStorageRecord(key, optimizedLog));
              });
              tx.oncomplete = ()=> resolve();
              tx.onerror = ()=> resolve();
              tx.onabort = ()=> resolve();
            }catch(e){
              resolve();
            }
          });
        }
        try{ localStorage.removeItem(key); }catch(e){}
        try{ localStorage.setItem(markerKey, "1"); }catch(e){}
      }

      const list = await readStoredListFromIndexedDb(key);
      scopeCacheMap.set(key, list);
      return list;
    })();

    migrationPromiseMap.set(key, promise);
    return promise;
  }

  async function readStoredListAsync(scopeKey){
    const key = String(scopeKey || getScopedStorageKey());

    if (!hasIndexedDb()){
      const list = readStoredListFromLocalStorage(key);
      scopeCacheMap.set(key, list);
      return list;
    }

    await migrateLegacyLocalStorageIfNeeded(key);
    const db = await openDatabase();
    if (!db){
      const list = readStoredListFromLocalStorage(key);
      scopeCacheMap.set(key, list);
      return list;
    }

    return await readStoredListFromIndexedDb(key);
  }

  function getBenchmarkScopeKey(session){
    return `${getScopeKeyBySession(session || readActiveSession())}${BENCHMARK_SCOPE_SUFFIX}`;
  }

  async function clearStoredScopeAsync(scopeKey){
    const key = String(scopeKey || "");
    if (!key) return 0;

    scopeCacheMap.delete(key);
    migrationPromiseMap.delete(key);

    if (!hasIndexedDb()){
      let removedCount = 0;
      try{
        const existing = readStoredListFromLocalStorage(key);
        removedCount = existing.length;
      }catch(e){}
      try{ localStorage.removeItem(key); }catch(e){}
      return removedCount;
    }

    const db = await openDatabase();
    if (!db){
      let removedCount = 0;
      try{
        const existing = readStoredListFromLocalStorage(key);
        removedCount = existing.length;
      }catch(e){}
      try{ localStorage.removeItem(key); }catch(e){}
      return removedCount;
    }

    const rows = await new Promise((resolve)=> {
      try{
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readonly");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        const index = store.index("scopeKey");
        const request = index.getAll(IDBKeyRange.only(key));
        request.onsuccess = ()=> resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = ()=> resolve([]);
      }catch(e){
        resolve([]);
      }
    });

    if (!rows.length) return 0;

    await new Promise((resolve)=> {
      try{
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readwrite");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        rows.forEach((row)=> {
          if (!row || !row.storageId) return;
          store.delete(row.storageId);
        });
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> resolve();
        tx.onabort = ()=> resolve();
      }catch(e){
        resolve();
      }
    });

    return rows.length;
  }

  function buildBenchmarkIso(baseTime, offsetMs){
    return new Date(baseTime + offsetMs).toISOString();
  }

  function buildBenchmarkYakuList(riichi, hasOpen, kyokuIndex){
    const list = [];
    if (riichi) list.push({ key: "riichi", label: "立直" });
    if (!hasOpen && kyokuIndex % 2 === 0) list.push({ key: "menzentsumo", label: "門前ツモ" });
    if (hasOpen) list.push({ key: "tanyao", label: "断么九" });
    if (kyokuIndex % 3 === 0) list.push({ key: "honitsu", label: "混一色" });
    if (kyokuIndex % 5 === 0) list.push({ key: "toitoi", label: "対々和" });
    if (!list.length) list.push({ key: "pinfu", label: "平和" });
    return list;
  }

  function buildSyntheticBatchBenchmarkLog(matchIndex, session, kyokuPerMatch, baseTime){
    const startedBase = baseTime + (matchIndex * 180000);
    const log = {
      storageVersion: STORAGE_VERSION,
      schemaVersion: 1,
      matchId: `bench_match_${matchIndex + 1}`,
      startedAt: buildBenchmarkIso(startedBase, 0),
      endedAt: "",
      session: clonePlainData(session) || readActiveSession(),
      meta: {
        appMode: "app",
        appTitle: "SANMA LAB",
        startedFrom: "analysis_benchmark",
        ruleSetId: "standard",
        cpuProfileSetId: "current",
        matchMode: "batch",
        benchmark: true
      },
      kyokus: [],
      summary: null,
      updatedAt: ""
    };

    let scores = [35000, 35000, 35000];
    let lastSettlement = null;

    for (let kyokuIndex = 0; kyokuIndex < kyokuPerMatch; kyokuIndex++){
      const eastSeatIndex = (matchIndex + kyokuIndex) % 3;
      const winnerSeatIndex = (matchIndex + kyokuIndex + 1) % 3;
      const discarderSeatIndex = (winnerSeatIndex + 1) % 3;
      const isTsumo = ((matchIndex + kyokuIndex) % 2) === 0;
      const riichiSeatIndex = kyokuIndex % 3 === 0 ? winnerSeatIndex : null;
      const hasOpen = kyokuIndex % 4 === 1;
      const pointValue = 3900 + ((kyokuIndex % 5) * 2000);
      const chipDelta = [0, 0, 0];
      const delta = [0, 0, 0];

      if (isTsumo){
        delta[winnerSeatIndex] = pointValue;
        delta[(winnerSeatIndex + 1) % 3] = -Math.floor(pointValue / 2);
        delta[(winnerSeatIndex + 2) % 3] = -(pointValue - Math.floor(pointValue / 2));
      }else{
        delta[winnerSeatIndex] = pointValue;
        delta[discarderSeatIndex] = -pointValue;
      }

      chipDelta[winnerSeatIndex] = 1;
      if (!isTsumo) chipDelta[discarderSeatIndex] = -1;

      const afterScores = [
        scores[0] + delta[0],
        scores[1] + delta[1],
        scores[2] + delta[2]
      ];

      const events = [
        { seq: 1, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 300), type: "draw", payload: { seatIndex: 0 } },
        { seq: 2, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 600), type: "discard", payload: { seatIndex: 0 } },
        { seq: 3, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 900), type: "draw", payload: { seatIndex: 1 } },
        { seq: 4, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 1200), type: "discard", payload: { seatIndex: 1 } },
        { seq: 5, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 1500), type: "draw", payload: { seatIndex: 2 } },
        { seq: 6, at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 1800), type: "discard", payload: { seatIndex: 2 } }
      ];

      if (riichiSeatIndex !== null){
        events.push({
          seq: 7,
          at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 2100),
          type: "riichi",
          payload: {
            seatIndex: riichiSeatIndex,
            junme: 6 + (kyokuIndex % 5),
            tenpai: {
              waitTileCount: 4 + (kyokuIndex % 3),
              waitTypeCount: 1,
              waitTypeKeys: [kyokuIndex % 2 === 0 ? "ryanmen" : "kanchan"],
              waitCodes: [kyokuIndex % 2 === 0 ? "5p" : "7s"],
              isRyanmenWait: kyokuIndex % 2 === 0
            }
          }
        });
      }

      if (hasOpen){
        events.push({
          seq: 8,
          at: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 2400),
          type: kyokuIndex % 2 === 0 ? "pon" : "minkan",
          payload: { seatIndex: (winnerSeatIndex + 2) % 3 }
        });
      }

      const settlement = kyokuIndex % 6 === 5
        ? {
            type: "ryukyoku",
            winType: "",
            beforeScores: scores.slice(),
            afterScores,
            delta: delta.slice(),
            previousKyotakuCount: 0,
            currentHandKyotakuCount: 0,
            nextKyotakuCount: 0,
            tenpaiSeats: [winnerSeatIndex],
            riichiSeats: riichiSeatIndex !== null ? [riichiSeatIndex] : []
          }
        : {
            type: "agari",
            winType: isTsumo ? "tsumo" : "ron",
            winnerSeatIndex,
            discarderSeatIndex: isTsumo ? null : discarderSeatIndex,
            beforeScores: scores.slice(),
            afterScores,
            delta: delta.slice(),
            previousKyotakuCount: 0,
            currentHandKyotakuCount: 0,
            nextKyotakuCount: 0,
            tenpaiSeats: [winnerSeatIndex],
            riichiSeats: riichiSeatIndex !== null ? [riichiSeatIndex] : [],
            chipInfo: { seatDeltas: chipDelta.slice() },
            agariEntries: [{
              winType: isTsumo ? "tsumo" : "ron",
              winnerSeatIndex,
              discarderSeatIndex: isTsumo ? null : discarderSeatIndex,
              pointValue,
              han: 3 + (kyokuIndex % 3),
              fu: 30,
              totalHan: 3 + (kyokuIndex % 3),
              yakuman: 0,
              yaku: buildBenchmarkYakuList(riichiSeatIndex === winnerSeatIndex, hasOpen, kyokuIndex),
              bonus: {
                dora: 1 + (kyokuIndex % 2),
                uraDora: riichiSeatIndex === winnerSeatIndex ? 1 : 0,
                akaDora: kyokuIndex % 2,
                nukiDora: kyokuIndex % 3
              },
              yakuInfo: {
                isMenzen: !hasOpen,
                yaku: buildBenchmarkYakuList(riichiSeatIndex === winnerSeatIndex, hasOpen, kyokuIndex)
              },
              chipInfo: { seatDeltas: chipDelta.slice() },
              resultMeta: {
                isMenzen: !hasOpen,
                chipInfo: { seatDeltas: chipDelta.slice() }
              }
            }]
          };

      lastSettlement = settlement;
      log.kyokus.push({
        kyokuId: `${log.matchId}_kyoku_${kyokuIndex + 1}`,
        kyokuIndex,
        startedAt: buildBenchmarkIso(startedBase, kyokuIndex * 7000),
        endedAt: buildBenchmarkIso(startedBase, (kyokuIndex * 7000) + 3000),
        start: {
          roundWind: kyokuIndex < 3 ? "東" : "南",
          roundNumber: (kyokuIndex % 3) + 1,
          honba: kyokuIndex % 2,
          eastSeatIndex,
          kyotakuCount: 0,
          scores: scores.slice(),
          doraIndicators: [],
          uraDoraIndicators: []
        },
        events,
        settlement,
        summary: {
          type: settlement.type || "",
          winType: settlement.winType || "",
          winnerSeatIndex: settlement.winnerSeatIndex == null ? null : settlement.winnerSeatIndex,
          discarderSeatIndex: settlement.discarderSeatIndex == null ? null : settlement.discarderSeatIndex,
          afterScores: afterScores.slice()
        }
      });

      scores = afterScores.slice();
    }

    log.endedAt = buildBenchmarkIso(startedBase, (kyokuPerMatch * 7000) + 5000);
    log.updatedAt = log.endedAt;
    log.summary = {
      endInfo: {
        reason: "benchmark_complete",
        source: "analysis_batch_benchmark"
      },
      settlement: cloneSettlement(lastSettlement)
    };
    return buildStorageOptimizedLog(log);
  }

  async function writeStoredLogsBulkAsync(scopeKey, logs){
    const key = String(scopeKey || "");
    const list = trimStoredLogsForLimits(Array.isArray(logs) ? logs : []);
    if (!hasIndexedDb()){
      localStorage.setItem(key, JSON.stringify(list));
      scopeCacheMap.set(key, list);
      return list.length;
    }

    const db = await openDatabase();
    if (!db){
      localStorage.setItem(key, JSON.stringify(list));
      scopeCacheMap.set(key, list);
      return list.length;
    }

    await new Promise((resolve, reject)=> {
      try{
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readwrite");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        list.forEach((log)=> {
          if (!log || !log.matchId) return;
          store.put(buildStorageRecord(key, log));
        });
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> reject(tx.error || new Error("IndexedDB bulk write failed"));
        tx.onabort = ()=> reject(tx.error || new Error("IndexedDB bulk write aborted"));
      }catch(e){
        reject(e);
      }
    });

    scopeCacheMap.set(key, list);
    return list.length;
  }

  function estimateBenchmarkBytes(logs){
    const list = Array.isArray(logs) ? logs : [];
    if (!list.length) return 0;
    const sampleSize = Math.min(12, list.length);
    let total = 0;
    for (let i = 0; i < sampleSize; i++){
      try{
        total += JSON.stringify(list[i]).length;
      }catch(e){}
    }
    if (sampleSize <= 0) return 0;
    return Math.round((total / sampleSize) * list.length);
  }

  async function runBatchBenchmarkAsync(options){
    const opts = options && typeof options === "object" ? options : {};
    const matchCount = Math.max(1, Math.min(MAX_STORED_BATCH_MATCHES, Number(opts.matchCount) || MAX_STORED_BATCH_MATCHES));
    const kyokuPerMatch = Math.max(1, Math.min(24, Number(opts.kyokuPerMatch) || 8));
    const scopeKey = getBenchmarkScopeKey(readActiveSession());
    const baseTime = Date.UTC(2026, 0, 1, 0, 0, 0);

    const buildStarted = Date.now();
    const syntheticLogs = [];
    for (let i = 0; i < matchCount; i++){
      syntheticLogs.push(buildSyntheticBatchBenchmarkLog(i, readActiveSession(), kyokuPerMatch, baseTime));
    }
    const buildMs = Date.now() - buildStarted;

    const estimatedBytes = estimateBenchmarkBytes(syntheticLogs);

    const clearStarted = Date.now();
    const removedBeforeWrite = await clearStoredScopeAsync(scopeKey);
    const clearMs = Date.now() - clearStarted;

    const writeStarted = Date.now();
    const writtenCount = await writeStoredLogsBulkAsync(scopeKey, syntheticLogs);
    const writeMs = Date.now() - writeStarted;

    const readStarted = Date.now();
    const storedLogs = await readStoredListAsync(scopeKey);
    const readMs = Date.now() - readStarted;

    let summaryMs = null;
    let summaryKyokuCount = null;
    let summarySnapshot = null;
    if (global.MBSanmaLogMetrics && typeof global.MBSanmaLogMetrics.buildAnalysisSummary === "function"){
      const summaryStarted = Date.now();
      const summary = global.MBSanmaLogMetrics.buildAnalysisSummary(storedLogs, {
        limit: "all",
        matchMode: "batch",
        sessionMode: "all",
        dealer: "all",
        ruleSetId: "all"
      });
      summaryMs = Date.now() - summaryStarted;
      summaryKyokuCount = summary && summary.overall ? Number(summary.overall.kyokuCount) || 0 : 0;
      summarySnapshot = summary ? {
        riichiRate: Number(summary.riichi && summary.riichi.rate),
        openRate: Number(summary.open && summary.open.rate),
        agariRate: Number(summary.agari && summary.agari.rate),
        hojuRate: Number(summary.hoju && summary.hoju.rate),
        hitByTsumoRate: Number(summary.hitByTsumo && summary.hitByTsumo.rate),
        ryukyokuRate: Number(summary.ryukyoku && summary.ryukyoku.rate),
        averagePoint: Number(summary.overall && summary.overall.averagePoint),
        averageJunmePerKyoku: Number(summary.overall && summary.overall.averageJunmePerKyoku),
        averageDoraCount: Number(summary.overall && summary.overall.averageDoraCount),
        riichiAverageJunme: Number(summary.riichi && summary.riichi.averageJunme),
        riichiAveragePoint: Number(summary.riichi && summary.riichi.averagePoint),
        openAgariRate: Number(summary.agari && summary.agari.openAgariRate),
        riichiAgariRate: Number(summary.agari && summary.agari.riichiAgariRate)
      } : null;
    }

    return {
      scopeKey,
      storageBackend: hasIndexedDb() ? "indexeddb" : "localStorage",
      removedBeforeWrite,
      requestedMatchCount: matchCount,
      writtenMatchCount: writtenCount,
      storedMatchCount: storedLogs.length,
      kyokuPerMatch,
      estimatedBytes,
      buildMs,
      clearMs,
      writeMs,
      readMs,
      summaryMs,
      summaryKyokuCount,
      summarySnapshot
    };
  }

  async function clearBatchBenchmarkAsync(){
    const scopeKey = getBenchmarkScopeKey(readActiveSession());
    const removedCount = await clearStoredScopeAsync(scopeKey);
    return {
      scopeKey,
      removedCount
    };
  }

  async function trimStoredMatchesAsync(scopeKey){
    const key = String(scopeKey || getScopedStorageKey());
    if (!hasIndexedDb()) return;
    const db = await openDatabase();
    if (!db) return;

    const list = await readStoredListAsync(key);
    const keptIds = new Set(trimStoredLogsForLimits(list).map((item)=> item && item.matchId).filter(Boolean));
    const overflow = list.filter((item)=> item && item.matchId && !keptIds.has(item.matchId));
    if (!overflow.length) return;

    await new Promise((resolve)=> {
      try{
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readwrite");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        overflow.forEach((log)=> {
          if (!log || !log.matchId) return;
          store.delete(`${key}::${log.matchId}`);
        });
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> resolve();
        tx.onabort = ()=> resolve();
      }catch(e){
        resolve();
      }
    });
  }

  async function persistCompletedLogAsync(log, scopeKey){
    if (!log || typeof log !== "object") return false;

    const key = String(scopeKey || getScopedStorageKey());
    const optimizedLog = buildStorageOptimizedLog(log);

    if (!hasIndexedDb()){
      return persistCompletedLogToLocalStorage(log, key);
    }

    const db = await openDatabase();
    if (!db){
      return persistCompletedLogToLocalStorage(log, key);
    }

    try{
      await migrateLegacyLocalStorageIfNeeded(key);
      await new Promise((resolve, reject)=> {
        const tx = db.transaction(MATCH_LOG_IDB_STORE, "readwrite");
        const store = tx.objectStore(MATCH_LOG_IDB_STORE);
        store.put(buildStorageRecord(key, optimizedLog));
        tx.oncomplete = ()=> resolve();
        tx.onerror = ()=> reject(tx.error || new Error("IndexedDB transaction failed"));
        tx.onabort = ()=> reject(tx.error || new Error("IndexedDB transaction aborted"));
      });

      const existing = scopeCacheMap.get(key) || [];
      const next = trimStoredLogsForLimits([optimizedLog, ...existing.filter((item)=> item && item.matchId !== optimizedLog.matchId)]);
      scopeCacheMap.set(key, next);
      trimStoredMatchesAsync(key).catch(()=>{});
      return true;
    }catch(e){
      try{
        console.warn("[match_log] persistCompletedLog IndexedDB failed", {
          storageKey: key,
          matchId: optimizedLog && optimizedLog.matchId ? optimizedLog.matchId : "",
          kyokuCount: optimizedLog && Array.isArray(optimizedLog.kyokus) ? optimizedLog.kyokus.length : 0,
          error: e && e.message ? e.message : e
        });
      }catch(_e){}
      return persistCompletedLogToLocalStorage(log, key);
    }
  }

  function ensureCurrentLog(){
    if (currentLog) return currentLog;
    currentLog = {
      storageVersion: STORAGE_VERSION,
      schemaVersion: 1,
      matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: safeNowIso(),
      endedAt: "",
      session: readActiveSession(),
      meta: {},
      kyokus: [],
      summary: null,
      updatedAt: safeNowIso(),
      persisted: false
    };
    return currentLog;
  }

  function getCurrentKyoku(){
    const log = ensureCurrentLog();
    if (!Array.isArray(log.kyokus) || log.kyokus.length <= 0) return null;
    return log.kyokus[log.kyokus.length - 1] || null;
  }

  function startMatch(meta){
    currentLog = {
      storageVersion: STORAGE_VERSION,
      schemaVersion: 1,
      matchId: `match_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startedAt: safeNowIso(),
      endedAt: "",
      session: readActiveSession(),
      meta: {
        appMode: "app",
        ruleSetId: "standard",
        ruleSnapshot: null,
        cpuProfileSetId: "current",
        ...(meta && typeof meta === "object" ? meta : {})
      },
      kyokus: [],
      summary: null,
      updatedAt: safeNowIso(),
      persisted: false
    };
    return currentLog;
  }

  function startKyoku(snapshot){
    const log = ensureCurrentLog();
    const kyokuIndex = log.kyokus.length;
    const kyoku = {
      kyokuId: `${log.matchId}_kyoku_${kyokuIndex + 1}`,
      kyokuIndex,
      startedAt: safeNowIso(),
      endedAt: "",
      start: cloneKyokuSnapshot(snapshot),
      events: [],
      settlement: null,
      summary: null
    };
    log.kyokus.push(kyoku);
    log.updatedAt = safeNowIso();
    return kyoku;
  }

  function pushEvent(type, payload){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    const event = {
      seq: kyoku.events.length + 1,
      at: safeNowIso(),
      type: String(type || "event"),
      payload: (payload && typeof payload === "object") ? (clonePlainData(payload) || {}) : {}
    };
    kyoku.events.push(event);
    if (currentLog) currentLog.updatedAt = safeNowIso();
    return event;
  }

  function compactCpuOpenSnapshot(snapshot){
    if (!snapshot || typeof snapshot !== "object") return null;
    return {
      snapshotId: Number(snapshot.snapshotId) || null,
      kind: snapshot.kind || "cpuOpenCallCandidate",
      sourceType: snapshot.sourceType || "",
      phase: snapshot.phase || "",
      createdAt: Number(snapshot.createdAt) || 0,
      turnSeatIndex: Number.isInteger(snapshot.turnSeatIndex) ? snapshot.turnSeatIndex : null,
      round: clonePlainData(snapshot.round) || null,
      candidateSeatIndex: Number.isInteger(snapshot.candidateSeatIndex) ? snapshot.candidateSeatIndex : null,
      candidateSeatLabel: snapshot.candidateSeatLabel || "",
      discarderSeatIndex: Number.isInteger(snapshot.discarderSeatIndex) ? snapshot.discarderSeatIndex : null,
      discarderSeatLabel: snapshot.discarderSeatLabel || "",
      discardedTile: cloneTile(snapshot.discardedTile),
      scores: cloneScores(snapshot.scores),
      self: clonePlainData(snapshot.self) || null,
      callAnalysis: clonePlainData(snapshot.callAnalysis) || null,
      table: clonePlainData(snapshot.table) || null,
      legalActions: clonePlainData(snapshot.legalActions) || null,
      currentPolicyDecision: clonePlainData(snapshot.currentPolicyDecision) || null,
      internalOpenEval: clonePlainData(snapshot.internalOpenEval) || null
    };
  }

  function compactCpuOpenDecision(decision){
    if (!decision || typeof decision !== "object") return null;
    return {
      decisionId: Number(decision.decisionId) || null,
      snapshotId: Number(decision.snapshotId) || null,
      seatIndex: Number.isInteger(decision.seatIndex) ? decision.seatIndex : null,
      action: decision.action || "",
      source: decision.source || "",
      createdAt: Number(decision.createdAt) || 0,
      note: decision.note || "",
      reasonTag: decision.reasonTag || "",
      reasonTags: Array.isArray(decision.reasonTags) ? decision.reasonTags.slice() : [],
      status: decision.status || "",
      consumed: !!decision.consumed,
      finalAction: decision.finalAction || "",
      executionSource: decision.executionSource || "",
      resolvedAt: Number(decision.resolvedAt) || 0,
      shadowAction: decision.shadowAction || "",
      shadowReasonTag: decision.shadowReasonTag || "",
      shadowReasonTags: Array.isArray(decision.shadowReasonTags) ? decision.shadowReasonTags.slice() : [],
      shadowProfileKey: decision.shadowProfileKey || "",
      shadowScores: clonePlainData(decision.shadowScores) || null,
      meta: clonePlainData(decision.meta) || null
    };
  }

  function compactCpuDiscardSnapshot(snapshot){
    if (!snapshot || typeof snapshot !== "object") return null;
    return {
      snapshotId: Number(snapshot.snapshotId) || null,
      kind: snapshot.kind || "cpuDiscardChoice",
      sourceType: snapshot.sourceType || "",
      createdAt: Number(snapshot.createdAt) || 0,
      seatIndex: Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : null,
      round: clonePlainData(snapshot.round) || null,
      self: clonePlainData(snapshot.self) || null,
      externalStyle: clonePlainData(snapshot.externalStyle) || null,
      table: clonePlainData(snapshot.table) || null,
      visibleCounts: clonePlainData(snapshot.visibleCounts) || null,
      candidateSummaries: clonePlainData(snapshot.candidateSummaries) || [],
      candidateCount: Array.isArray(snapshot.candidates) ? snapshot.candidates.length : (Array.isArray(snapshot.candidateSummaries) ? snapshot.candidateSummaries.length : 0)
    };
  }

  function compactCpuDiscardDecision(decision){
    if (!decision || typeof decision !== "object") return null;
    return {
      snapshotId: Number(decision.snapshotId) || null,
      seatIndex: Number.isInteger(decision.seatIndex) ? decision.seatIndex : null,
      styleKey: decision.styleKey || "",
      externalStyle: clonePlainData(decision.externalStyle) || null,
      action: decision.action || "",
      source: decision.source || "",
      note: decision.note || "",
      reasonTag: decision.reasonTag || "",
      reasonTags: Array.isArray(decision.reasonTags) ? decision.reasonTags.slice() : [],
      status: decision.status || "",
      createdAt: Number(decision.createdAt) || 0,
      updatedAt: Number(decision.updatedAt) || 0,
      discardTileId: Number.isInteger(decision.discardTileId) ? decision.discardTileId : null,
      discardIndex: Number.isInteger(decision.discardIndex) ? decision.discardIndex : null,
      discardCode: decision.discardCode || "",
      candidateSummary: clonePlainData(decision.candidateSummary) || null,
      selectedDiscardTileId: Number.isInteger(decision.selectedDiscardTileId) ? decision.selectedDiscardTileId : null,
      selectedDiscardIndex: Number.isInteger(decision.selectedDiscardIndex) ? decision.selectedDiscardIndex : null,
      selectedDiscardCode: decision.selectedDiscardCode || "",
      externalDiscardTileId: Number.isInteger(decision.externalDiscardTileId) ? decision.externalDiscardTileId : null,
      externalDiscardIndex: Number.isInteger(decision.externalDiscardIndex) ? decision.externalDiscardIndex : null,
      externalDiscardCode: decision.externalDiscardCode || "",
      shadowInternalDiscardTileId: Number.isInteger(decision.shadowInternalDiscardTileId) ? decision.shadowInternalDiscardTileId : null,
      shadowInternalDiscardIndex: Number.isInteger(decision.shadowInternalDiscardIndex) ? decision.shadowInternalDiscardIndex : null,
      shadowInternalDiscardCode: decision.shadowInternalDiscardCode || "",
      shadowInternalReasonTag: decision.shadowInternalReasonTag || "",
      shadowInternalReasonTags: Array.isArray(decision.shadowInternalReasonTags) ? decision.shadowInternalReasonTags.slice() : [],
      shadowInternalMeta: clonePlainData(decision.shadowInternalMeta) || null,
      shadowAgree: !!decision.shadowAgree,
      finalAction: decision.finalAction || "",
      finalDiscardTileId: Number.isInteger(decision.finalDiscardTileId) ? decision.finalDiscardTileId : null,
      finalDiscardCode: decision.finalDiscardCode || "",
      executionSource: decision.executionSource || "",
      selectedByEngineMode: decision.selectedByEngineMode || "",
      willRiichi: !!decision.willRiichi,
      meta: clonePlainData(decision.meta) || null
    };
  }

  function compactCpuApiBridgeRequest(info){
    if (!info || typeof info !== "object") return null;
    const payload = info.payload && typeof info.payload === "object" ? info.payload : null;
    const snapshot = payload && payload.snapshot && typeof payload.snapshot === "object" ? payload.snapshot : null;
    return {
      mode: info.mode || "",
      endpoint: info.endpoint || "",
      kind: info.kind || (payload ? payload.kind || "" : ""),
      requestedAt: Number(info.requestedAt) || 0,
      sentAt: payload ? payload.sentAt || "" : "",
      snapshotId: snapshot && Number.isFinite(snapshot.snapshotId) ? snapshot.snapshotId : null,
      seatIndex: snapshot && (Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : (Number.isInteger(snapshot.candidateSeatIndex) ? snapshot.candidateSeatIndex : null)),
      sourceType: snapshot && snapshot.sourceType ? snapshot.sourceType : "",
      actionCandidates: snapshot && snapshot.legalActions ? clonePlainData(snapshot.legalActions) : null,
      externalStyleKey: snapshot && snapshot.externalStyle && snapshot.externalStyle.key ? snapshot.externalStyle.key : ""
    };
  }

  function compactCpuApiBridgeResponse(info){
    if (!info || typeof info !== "object") return null;
    return {
      mode: info.mode || "",
      endpoint: info.endpoint || "",
      kind: info.kind || "",
      ok: !!info.ok,
      status: Number(info.status) || 0,
      error: info.error || "",
      receivedAt: Number(info.receivedAt) || 0,
      decision: clonePlainData(info.decision) || null,
      data: clonePlainData(info.data) || null
    };
  }

  function pushCpuOpenSnapshot(snapshot){
    const compact = compactCpuOpenSnapshot(snapshot);
    if (!compact) return null;
    return pushEvent("cpu_open_snapshot", compact);
  }

  function pushCpuOpenDecision(decision){
    const compact = compactCpuOpenDecision(decision);
    if (!compact) return null;
    return pushEvent("cpu_open_decision", compact);
  }

  function pushCpuDiscardSnapshot(snapshot){
    const compact = compactCpuDiscardSnapshot(snapshot);
    if (!compact) return null;
    return pushEvent("cpu_discard_snapshot", compact);
  }

  function pushCpuDiscardDecision(decision){
    const compact = compactCpuDiscardDecision(decision);
    if (!compact) return null;
    return pushEvent("cpu_discard_decision", compact);
  }

  function pushCpuApiBridgeRequest(info){
    const compact = compactCpuApiBridgeRequest(info);
    if (!compact) return null;
    return pushEvent("cpu_api_bridge_request", compact);
  }

  function pushCpuApiBridgeResponse(info){
    const compact = compactCpuApiBridgeResponse(info);
    if (!compact) return null;
    return pushEvent("cpu_api_bridge_response", compact);
  }

  function finishKyoku(summary){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    kyoku.endedAt = safeNowIso();
    kyoku.summary = summary && typeof summary === "object" ? { ...summary } : null;
    if (currentLog) currentLog.updatedAt = safeNowIso();
    return kyoku;
  }

  function prepareSettlementForStorage(settlement){
    try{
      if (typeof global.mbSanmaPrepareSettlementForLog === "function"){
        const prepared = global.mbSanmaPrepareSettlementForLog(settlement);
        if (prepared && typeof prepared === "object") return prepared;
      }
    }catch(e){}
    return settlement;
  }

  function recordSettlement(settlement){
    const kyoku = getCurrentKyoku();
    if (!kyoku) return null;
    const preparedSettlement = prepareSettlementForStorage(settlement);
    const cloned = cloneSettlement(preparedSettlement);
    kyoku.settlement = cloned;
    pushEvent("settlement", { settlement: cloned });
    finishKyoku({
      type: cloned ? cloned.type : "",
      winType: cloned ? cloned.winType : "",
      winnerSeatIndex: cloned ? cloned.winnerSeatIndex : null,
      discarderSeatIndex: cloned ? cloned.discarderSeatIndex : null,
      afterScores: cloned ? cloneScores(cloned.afterScores) : [0, 0, 0]
    });
    return cloned;
  }

  function finishMatch(endInfo, settlement){
    const log = ensureCurrentLog();
    const preparedSettlement = prepareSettlementForStorage(settlement);
    log.endedAt = safeNowIso();
    log.summary = {
      endInfo: endInfo && typeof endInfo === "object" ? { ...endInfo } : null,
      settlement: cloneSettlement(preparedSettlement)
    };
    log.updatedAt = safeNowIso();
    const scopeKey = getScopeKeyBySession(log.session);
    persistCompletedLogAsync(log, scopeKey).then((ok)=> {
      if (currentLog && currentLog.matchId === log.matchId){
        currentLog.persisted = !!ok;
      }
    }).catch(()=> {
      if (currentLog && currentLog.matchId === log.matchId){
        currentLog.persisted = false;
      }
    });
    log.persisted = false;
    return log;
  }

  function getCurrentLog(){
    return currentLog;
  }

  function getStoredLogsForScopeSync(scopeKey){
    const key = String(scopeKey || getScopedStorageKey());
    if (!scopeCacheMap.has(key)){
      if (hasIndexedDb()){
        readStoredListAsync(key).catch(()=>{});
      }else{
        scopeCacheMap.set(key, readStoredListFromLocalStorage(key));
      }
    }
    const list = scopeCacheMap.get(key) || [];
    return sortStoredLogs(list);
  }

  function getStoredLogs(){
    const key = getScopedStorageKey();
    const list = getStoredLogsForScopeSync(key);
    if (!currentLog || !currentLog.matchId) return list;

    const currentScopeKey = getScopeKeyBySession(currentLog.session);
    if (currentScopeKey !== key) return list;

    return sortStoredLogs([currentLog, ...list.filter((item)=> item && item.matchId !== currentLog.matchId)]);
  }

  async function getStoredLogsAsync(){
    const key = getScopedStorageKey();
    const list = await readStoredListAsync(key);
    if (!currentLog || !currentLog.matchId) return list;

    const currentScopeKey = getScopeKeyBySession(currentLog.session);
    if (currentScopeKey !== key) return list;

    return sortStoredLogs([currentLog, ...list.filter((item)=> item && item.matchId !== currentLog.matchId)]);
  }

  async function refreshStoredLogsAsync(){
    const key = getScopedStorageKey();
    return await readStoredListAsync(key);
  }

  if (hasIndexedDb()){
    refreshStoredLogsAsync().catch(()=>{});
  }

  global.MBSanmaMatchLog = {
    startMatch,
    startKyoku,
    pushEvent,
    recordSettlement,
    finishMatch,
    getCurrentLog,
    getStoredLogs,
    getStoredLogsAsync,
    refreshStoredLogsAsync,
    runBatchBenchmarkAsync,
    clearBatchBenchmarkAsync,
    cloneTile,
    cloneTileArray,
    cloneMeldArray,
    cloneScores,
    clonePlainData,
    pushCpuOpenSnapshot,
    pushCpuOpenDecision,
    pushCpuDiscardSnapshot,
    pushCpuDiscardDecision,
    pushCpuApiBridgeRequest,
    pushCpuApiBridgeResponse
  };
})(window);
