
// ========= log_metrics.js（ログ集計） =========
// 役割：
// - 正規化ログから最低限の件数集計を返す
// - 保存済み半荘ログから、分析ページ向けの集計を返す
// - 保存済み半荘ログから、成績管理ページ向けの自分成績集計を返す
// - 分析ページでは「自分固定」ではなく、全席を均等サンプルとして扱う
// - 成績管理ページでは seat0（あなた）固定で扱う
// - 将来の役/打点系分析を増やしやすい土台を用意する

(function(global){
  "use strict";

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function safeNumber(value, fallback = 0){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function cloneObject(value){
    try{
      return JSON.parse(JSON.stringify(value));
    }catch(e){
      return null;
    }
  }

  function getRuleSnapshotForMetrics(source){
    const meta = source && source.meta && typeof source.meta === "object" ? source.meta : null;
    const snapshot = meta && meta.ruleSnapshot && typeof meta.ruleSnapshot === "object"
      ? meta.ruleSnapshot
      : null;
    return snapshot;
  }

  function getRuleValueForMetrics(key, fallback, source = null){
    const snapshot = getRuleSnapshotForMetrics(source);
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)){
      return snapshot[key];
    }

    try{
      if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
        return window.MBSanmaRulesConfig.getValue(key, fallback);
      }
    }catch(e){}
    return fallback;
  }

  function getRuleNumberForMetrics(key, fallback, source = null){
    try{
      if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getNumber === "function"){
        const snapshot = getRuleSnapshotForMetrics(source);
        if (!snapshot){
          const value = window.MBSanmaRulesConfig.getNumber(key, fallback);
          return Number.isFinite(value) ? value : fallback;
        }
      }
    }catch(e){}
    const raw = Number(getRuleValueForMetrics(key, fallback, source));
    return Number.isFinite(raw) ? raw : fallback;
  }

  function getConfiguredReturnScoreForMetrics(source = null){
    return Math.max(0, Math.round(getRuleNumberForMetrics("overview-return-score", 40000, source)));
  }

  function isHakoshitaEnabledForMetrics(source = null){
    const raw = String(getRuleValueForMetrics("score-hakoshita-type", "off", source) || "").toLowerCase();
    return raw === "on";
  }

  function getConfiguredRateMultiplierForMetrics(source = null){
    const raw = String(getRuleValueForMetrics("overview-rate", "100p", source) || "").toLowerCase();
    const match = raw.match(/(\d+(?:\.\d+)?)\s*p/);
    const value = match ? Number(match[1]) : Number(raw);
    const safeValue = (Number.isFinite(value) && value > 0) ? value : 100;
    return safeValue / 100;
  }

  function getConfiguredChipUnitForMetrics(source = null){
    const raw = Number(getRuleNumberForMetrics("overview-chip-unit", 100, source));
    if (!Number.isFinite(raw) || raw < 0) return 1;
    return raw / 100;
  }

  function averageFrom(list){
    const arr = safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value));
    if (!arr.length) return null;
    return arr.reduce((sum, value)=> sum + value, 0) / arr.length;
  }

  function sumFrom(list){
    return safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value)).reduce((sum, value)=> sum + value, 0);
  }

  function rate(count, total){
    const den = safeNumber(total, 0);
    if (den <= 0) return null;
    return safeNumber(count, 0) / den;
  }

  function summarizeLogs(normalizedLogs){
    const logs = Array.isArray(normalizedLogs) ? normalizedLogs : [];
    const out = {
      matchCount: logs.length,
      kyokuCount: 0,
      rowCount: 0,
      rawEventCount: 0,
      cpuDiscardCount: 0,
      cpuOpenCount: 0,
      playerDiscardCount: 0,
      peiCount: 0,
      drawCount: 0,
      settlementCount: 0
    };

    logs.forEach((log)=> {
      const kyokus = Array.isArray(log && log.kyokus) ? log.kyokus : [];
      out.kyokuCount += kyokus.length;
      kyokus.forEach((kyoku)=> {
        out.rowCount += Number(kyoku && kyoku.rowCount) || 0;
        out.rawEventCount += Number(kyoku && kyoku.rawEventCount) || 0;
        const rows = Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
        rows.forEach((row)=> {
          const kind = row && row.kind ? row.kind : "";
          if (kind === "cpu_discard") out.cpuDiscardCount += 1;
          else if (kind === "cpu_open") out.cpuOpenCount += 1;
          else if (kind === "default"){
            const title = String(row && row.title || "");
            if (title.includes("あなた 打牌")) out.playerDiscardCount += 1;
            if (title.includes("北抜き")) out.peiCount += 1;
            if (title.includes("ツモ ")) out.drawCount += 1;
            if (title.startsWith("精算")) out.settlementCount += 1;
          }
        });
      });
    });

    return out;
  }

  function normalizeAnalysisFilters(src){
    const raw = src && typeof src === "object" ? src : {};
    const limit = String(raw.limit || "50");
    const matchMode = String(raw.matchMode || "batch");
    const sessionMode = String(raw.sessionMode || "all");
    const dealer = String(raw.dealer || "all");
    const ruleSetId = String(raw.ruleSetId || "all");
    return {
      limit: ["20", "50", "100", "200", "all"].includes(limit) ? limit : "50",
      matchMode: ["all", "normal", "batch", "unknown"].includes(matchMode) ? matchMode : "batch",
      sessionMode: ["all", "local", "account"].includes(sessionMode) ? sessionMode : "all",
      dealer: ["all", "dealer", "nondealer"].includes(dealer) ? dealer : "all",
      ruleSetId: ruleSetId || "all"
    };
  }

  function normalizeRecordsFilters(src){
    const raw = src && typeof src === "object" ? src : {};
    const limit = String(raw.limit || "50");
    const sessionMode = String(raw.sessionMode || "all");
    return {
      limit: ["20", "50", "100", "200", "all"].includes(limit) ? limit : "50",
      sessionMode: ["all", "local", "account"].includes(sessionMode) ? sessionMode : "all",
      matchMode: "normal"
    };
  }

  function getCompletedLogs(storedLogs){
    return safeArray(storedLogs).filter((log)=> log && typeof log === "object" && log.endedAt);
  }

  function getLimitedLogs(logs, limit){
    if (limit === "all") return logs.slice();
    const n = Math.max(1, parseInt(limit, 10) || 0);
    return logs.slice(0, n);
  }

  function getMatchMode(log){
    const meta = log && log.meta && typeof log.meta === "object" ? log.meta : {};
    const raw = String(meta.matchMode || "").toLowerCase();
    if (raw === "cpu_batch" || raw === "batch") return "batch";
    if (raw === "app_play" || raw === "normal" || raw === "play" || raw === "manual") return "normal";
    return raw ? raw : "unknown";
  }

  function getSessionMode(log){
    const session = log && log.session && typeof log.session === "object" ? log.session : {};
    return session.mode === "account" ? "account" : "local";
  }

  function getRuleSetId(log){
    const meta = log && log.meta && typeof log.meta === "object" ? log.meta : {};
    const raw = String(meta.ruleSetId || "").trim();
    return raw || "unknown";
  }

  function getRuleSetLabel(ruleSetId){
    const raw = String(ruleSetId || "").trim();
    if (!raw || raw === "all") return "すべて";
    if (raw === "standard") return "標準ルール";
    const slotMatch = raw.match(/^slot([1-5])$/);
    if (slotMatch) return `プリセット${slotMatch[1]}`;
    if (raw === "unknown") return "不明";
    return raw;
  }

  function listAnalysisRuleSetOptions(storedLogs){
    const seen = Object.create(null);
    const ordered = [];
    getCompletedLogs(storedLogs).forEach((log)=> {
      const ruleSetId = getRuleSetId(log);
      if (seen[ruleSetId]) return;
      seen[ruleSetId] = true;
      ordered.push(ruleSetId);
    });
    ordered.sort((a, b)=> {
      const rank = (value)=> {
        if (value === "standard") return 0;
        const slotMatch = String(value || "").match(/^slot([1-5])$/);
        if (slotMatch) return Number(slotMatch[1]);
        if (value === "unknown") return 98;
        return 50;
      };
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return String(a).localeCompare(String(b), "ja");
    });
    return [{ value: "all", label: "すべて" }].concat(ordered.map((ruleSetId)=> ({
      value: ruleSetId,
      label: getRuleSetLabel(ruleSetId)
    })));
  }

  function getSettlement(kyoku){
    if (kyoku && kyoku.settlement && typeof kyoku.settlement === "object") return kyoku.settlement;
    const summary = kyoku && kyoku.summary && typeof kyoku.summary === "object" ? kyoku.summary : null;
    if (summary && summary.settlement && typeof summary.settlement === "object") return summary.settlement;
    return null;
  }

  function getKyokuEvents(kyoku){
    return safeArray(kyoku && kyoku.events);
  }

  function getEastSeatIndex(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    return safeNumber(start.eastSeatIndex, 0);
  }

  function isDealerSeat(kyoku, seatIndex){
    return getEastSeatIndex(kyoku) === seatIndex;
  }

  function getIncludedSeats(kyoku, dealerFilter){
    const eastSeatIndex = getEastSeatIndex(kyoku);
    if (dealerFilter === "dealer") return [eastSeatIndex];
    if (dealerFilter === "nondealer") return [0, 1, 2].filter((seat)=> seat !== eastSeatIndex);
    return [0, 1, 2];
  }

  function findRiichiEventBySeat(kyoku, seatIndex){
    return getKyokuEvents(kyoku).find((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : null;
      return event && event.type === "riichi" && payload && Number(payload.seatIndex) === seatIndex;
    }) || null;
  }

  function getOpenEventCountBySeat(kyoku, seatIndex){
    let count = 0;
    getKyokuEvents(kyoku).forEach((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : null;
      if (!payload || Number(payload.seatIndex) !== seatIndex) return;
      if (event.type === "pon" || event.type === "minkan" || event.type === "kakan") count += 1;
    });
    return count;
  }

  function normalizeWaitTypeKeys(waitTypeKeys){
    return Array.from(new Set(
      safeArray(waitTypeKeys)
        .map((value)=> String(value || "").trim().toLowerCase())
        .filter(Boolean)
    ));
  }

  function isRyanmenLikeWaitTypeKey(key){
    const value = String(key || "").trim().toLowerCase();
    if (!value) return false;
    if (value === "ryanmen") return true;
    if (value === "sanmenchan") return true;
    if (value === "multi_ryanmen") return true;
    if (/^\d+menchan$/.test(value)) return true;
    if (value.includes("ryanmen")) return true;
    if (value.includes("two_sided")) return true;
    if (value.includes("two-sided")) return true;
    if (value.includes("両面")) return true;
    if (value.includes("sanmen")) return true;
    if (value.includes("three_sided")) return true;
    if (value.includes("three-sided")) return true;
    if (value.includes("三面")) return true;
    if (value.includes("multi")) return true;
    if (value.includes("多面")) return true;
    if (value.includes("nobetan")) return true;
    return false;
  }

  function isGukeiWaitTypeKey(key){
    const value = String(key || "").trim().toLowerCase();
    if (!value) return false;
    if (value === "kanchan") return true;
    if (value === "penchan") return true;
    if (value === "shanpon") return true;
    if (value === "shabo") return true;
    if (value === "tanki") return true;
    if (value.includes("kanchan")) return true;
    if (value.includes("shabo")) return true;
    if (value.includes("closed_wait")) return true;
    if (value.includes("closed-wait")) return true;
    if (value.includes("edge_wait")) return true;
    if (value.includes("edge-wait")) return true;
    if (value.includes("pair_wait")) return true;
    if (value.includes("pair-wait")) return true;
    if (value.includes("single_wait")) return true;
    if (value.includes("single-wait")) return true;
    if (value.includes("middle_wait")) return true;
    if (value.includes("middle-wait")) return true;
    if (value.includes("嵌張")) return true;
    if (value.includes("カンチャン")) return true;
    if (value.includes("カンちゃん")) return true;
    if (value.includes("辺張")) return true;
    if (value.includes("ペンチャン")) return true;
    if (value.includes("ペンちゃん")) return true;
    if (value.includes("双碰")) return true;
    if (value.includes("シャンポン")) return true;
    if (value.includes("しゃぼ")) return true;
    if (value.includes("単騎")) return true;
    if (value.includes("タンキ")) return true;
    return false;
  }

  function hasRyanmenOrBetterWait(tenpai, waitTypeKeys){
    const src = tenpai && typeof tenpai === "object" ? tenpai : {};
    if (src.isRyanmenWait === true) return true;
    return normalizeWaitTypeKeys(waitTypeKeys).some(isRyanmenLikeWaitTypeKey);
  }

  function hasGukeiWait(tenpai, waitTypeKeys){
    const src = tenpai && typeof tenpai === "object" ? tenpai : {};
    if (src.isRyanmenWait === true) return false;
    const keys = normalizeWaitTypeKeys(waitTypeKeys);
    if (!keys.length) return false;
    return keys.some(isGukeiWaitTypeKey);
  }

  function getRiichiInfoBySeat(kyoku, seatIndex){
    const event = findRiichiEventBySeat(kyoku, seatIndex);
    const payload = event && event.payload && typeof event.payload === "object" ? event.payload : {};
    const tenpai = payload.tenpai && typeof payload.tenpai === "object" ? payload.tenpai : {};
    const waitTypeKeys = normalizeWaitTypeKeys(tenpai.waitTypeKeys);
    const waitCodes = safeArray(tenpai.waitCodes);
    let waitTypeCount = safeNumber(tenpai.waitTypeCount, 0);
    if (waitTypeCount <= 0 && waitCodes.length > 0) waitTypeCount = waitCodes.length;
    if (waitTypeCount <= 0 && waitTypeKeys.length > 0) waitTypeCount = waitTypeKeys.length;
    const hasKnownWaitShape = waitTypeKeys.length > 0 || typeof tenpai.isRyanmenWait === "boolean";
    return {
      hasRiichi: !!event,
      junme: safeNumber(payload.junme, 0),
      waitTileCount: safeNumber(tenpai.waitTileCount, 0),
      waitTypeCount,
      waitTypeKeys,
      isRyanmenWait: hasRyanmenOrBetterWait(tenpai, waitTypeKeys),
      isGukeiWait: hasGukeiWait(tenpai, waitTypeKeys),
      hasKnownWaitShape
    };
  }

  function hasRiichiDeclaredBySeat(kyoku, settlement, seatIndex){
    const riichiSeats = safeArray(settlement && settlement.riichiSeats).filter((seat)=> seat === 0 || seat === 1 || seat === 2);
    if (riichiSeats.includes(seatIndex)) return true;
    return !!findRiichiEventBySeat(kyoku, seatIndex);
  }

  function hasOpenBySeat(kyoku, seatIndex){
    return getOpenEventCountBySeat(kyoku, seatIndex) > 0;
  }

  function isHojuToRiichiWinner(kyoku, settlement, hojuEntries){
    return safeArray(hojuEntries).some((entry)=> {
      const winnerSeatIndex = Number(entry && entry.winnerSeatIndex);
      if (winnerSeatIndex === 0 || winnerSeatIndex === 1 || winnerSeatIndex === 2){
        return hasRiichiDeclaredBySeat(kyoku, settlement, winnerSeatIndex);
      }
      return isRiichiAgariDetail(entry);
    });
  }

  function isHojuToOpenWinner(kyoku, hojuEntries){
    return safeArray(hojuEntries).some((entry)=> {
      const winnerSeatIndex = Number(entry && entry.winnerSeatIndex);
      if (winnerSeatIndex === 0 || winnerSeatIndex === 1 || winnerSeatIndex === 2){
        return hasOpenBySeat(kyoku, winnerSeatIndex);
      }
      return isOpenAgariDetail(entry);
    });
  }

  function getAgariEntries(settlement){
    if (!settlement || settlement.type !== "agari") return [];

    const entries = [];

    safeArray(settlement.agariEntries).forEach((entry)=> {
      if (entry && typeof entry === "object") entries.push(entry);
    });

    if (!entries.length && Number.isInteger(settlement.winnerSeatIndex)){
      entries.push(settlement);
    }

    const headEntry = settlement.headEntry && typeof settlement.headEntry === "object" ? settlement.headEntry : null;
    if (headEntry){
      const exists = entries.some((entry)=> {
        return Number(entry && entry.winnerSeatIndex) === Number(headEntry.winnerSeatIndex)
          && Number(entry && entry.discarderSeatIndex) === Number(headEntry.discarderSeatIndex)
          && String(entry && entry.winType || "") === String(headEntry.winType || "");
      });
      if (!exists) entries.push(headEntry);
    }

    return entries;
  }

  function getAgariEntriesForSeat(settlement, seatIndex){
    return getAgariEntries(settlement).filter((entry)=> Number(entry && entry.winnerSeatIndex) === seatIndex);
  }

  function isSeatAgariSettlement(settlement, seatIndex){
    return getAgariEntriesForSeat(settlement, seatIndex).length > 0;
  }

  function getHojuEntriesForSeat(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return [];
    if (settlement.winType !== "ron" && !safeArray(settlement.agariEntries).length) return [];
    return getAgariEntries(settlement).filter((entry)=> {
      const entryWinType = String(entry && entry.winType || settlement.winType || "");
      return entryWinType === "ron" && Number(entry && entry.discarderSeatIndex) === seatIndex;
    });
  }

  function isSeatHojuSettlement(settlement, seatIndex){
    return getHojuEntriesForSeat(settlement, seatIndex).length > 0;
  }

  function isSeatHitByTsumo(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return false;
    const agariEntries = getAgariEntries(settlement);
    const hasSeatTsumoAgari = agariEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === seatIndex && String(entry && entry.winType || settlement.winType || "") === "tsumo");
    if (hasSeatTsumoAgari) return false;
    if (String(settlement.winType || "") !== "tsumo" && !agariEntries.some((entry)=> String(entry && entry.winType || "") === "tsumo")) return false;
    return safeNumber(safeArray(settlement.delta)[seatIndex], 0) < 0;
  }

  function isSeatHorizontalMoveSettlement(settlement, seatIndex){
    if (!settlement || settlement.type !== "agari") return false;
    const hasRon = String(settlement.winType || "") === "ron" || getAgariEntries(settlement).some((entry)=> String(entry && entry.winType || "") === "ron");
    if (!hasRon) return false;
    return safeNumber(safeArray(settlement.delta)[seatIndex], 0) === 0;
  }

  function scoreInfoToPoint(scoreInfo, winType){
    if (!scoreInfo || typeof scoreInfo !== "object") return null;

    const normalizedWinType = String(winType || "").toLowerCase();

    if (normalizedWinType === "ron"){
      const ronPoint = Number(scoreInfo.ronPoint);
      if (Number.isFinite(ronPoint) && ronPoint > 0) return ronPoint;
    }

    if (normalizedWinType === "tsumo" || normalizedWinType === "nagashi"){
      const payAll = Number(scoreInfo.payAll);
      if (Number.isFinite(payAll) && payAll > 0){
        return payAll * 2;
      }

      const payChild = Number(scoreInfo.payChild);
      const payDealer = Number(scoreInfo.payDealer);
      if (Number.isFinite(payChild) || Number.isFinite(payDealer)){
        return (Number.isFinite(payChild) ? payChild : 0) + (Number.isFinite(payDealer) ? payDealer : 0);
      }
    }

    const point = Number(scoreInfo.point);
    if (Number.isFinite(point) && point > 0) return point;

    const tsumoPointKo = Number(scoreInfo.tsumoPointKo);
    const tsumoPointOya = Number(scoreInfo.tsumoPointOya);
    if (Number.isFinite(tsumoPointKo) || Number.isFinite(tsumoPointOya)){
      return (Number.isFinite(tsumoPointKo) ? tsumoPointKo * 2 : 0) + (Number.isFinite(tsumoPointOya) ? tsumoPointOya : 0);
    }

    return null;
  }

  function getPointFromAgariEntry(entry){
    if (!entry || typeof entry !== "object") return null;

    const scoreInfoPoint = scoreInfoToPoint(entry.scoreInfo, entry.winType);
    if (Number.isFinite(scoreInfoPoint) && scoreInfoPoint > 0) return scoreInfoPoint;

    const directPoint = Number(entry.pointValue);
    if (Number.isFinite(directPoint) && directPoint > 0) return directPoint;

    return null;
  }

  function getSeatAgariPoint(settlement, seatIndex){
    const entries = getAgariEntriesForSeat(settlement, seatIndex);
    for (const entry of entries){
      const point = getPointFromAgariEntry(entry);
      if (Number.isFinite(point) && point > 0) return point;
    }
    if (Number(settlement && settlement.winnerSeatIndex) === seatIndex){
      const point = getPointFromAgariEntry(settlement);
      if (Number.isFinite(point) && point > 0) return point;
    }
    return null;
  }

  function getSeatHojuPoint(settlement, seatIndex){
    const entries = getHojuEntriesForSeat(settlement, seatIndex);
    let total = 0;
    let found = false;
    entries.forEach((entry)=> {
      const point = getPointFromAgariEntry(entry);
      if (Number.isFinite(point) && point > 0){
        total += point;
        found = true;
      }
    });
    if (found) return total;
    if (Number(settlement && settlement.discarderSeatIndex) === seatIndex){
      const point = getPointFromAgariEntry(settlement);
      if (Number.isFinite(point) && point > 0) return point;
    }
    return null;
  }

  function getSeatHitByTsumoPoint(settlement, seatIndex){
    if (!isSeatHitByTsumo(settlement, seatIndex)) return null;
    const delta = safeNumber(safeArray(settlement && settlement.delta)[seatIndex], null);
    if (Number.isFinite(delta) && delta < 0) return Math.abs(delta);
    return null;
  }

  function listYakuKeys(detail){
    const src = detail && typeof detail === "object" ? detail : {};
    const yaku = safeArray(src.yakuInfo && src.yakuInfo.yaku ? src.yakuInfo.yaku : src.yaku);
    const keys = [];
    yaku.forEach((item)=> {
      const rawKey = String(item && (item.key || item.name || item.label) || "").trim().toLowerCase();
      if (rawKey) keys.push(rawKey);
    });
    return keys;
  }

  function hasAnyYakuKey(keys, candidates){
    const set = new Set(safeArray(keys));
    return safeArray(candidates).some((candidate)=> set.has(String(candidate || "").toLowerCase()));
  }

  function getObjectByPath(obj, path){
    const parts = String(path || "").split(".");
    let current = obj;
    for (const part of parts){
      if (!current || typeof current !== "object") return undefined;
      current = current[part];
    }
    return current;
  }

  function findNumericArrayFromValue(value){
    if (!Array.isArray(value)) return null;
    if (!value.length) return null;
    const arr = value.map((item)=> Number(item));
    if (arr.every((num)=> Number.isFinite(num))) return arr;
    return null;
  }

  function findArrayByCandidateKeys(obj, keys){
    const src = obj && typeof obj === "object" ? obj : null;
    if (!src) return null;
    for (const key of safeArray(keys)){
      const value = getObjectByPath(src, key);
      const arr = findNumericArrayFromValue(value);
      if (arr) return arr;
    }
    return null;
  }

  function findNumberByCandidateKeys(obj, keys){
    const src = obj && typeof obj === "object" ? obj : null;
    if (!src) return null;
    for (const key of safeArray(keys)){
      const value = getObjectByPath(src, key);
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return null;
  }

  function normalizeSeatValueKey(seatIndex){
    if (seatIndex === 0) return ["0", "seat0", "player0", "self", "bottom"];
    if (seatIndex === 1) return ["1", "seat1", "player1", "right", "cpuRight"];
    if (seatIndex === 2) return ["2", "seat2", "player2", "left", "cpuLeft"];
    return [String(seatIndex)];
  }

  function findSeatDeltaFromObject(obj, seatIndex, depth){
    const src = obj && typeof obj === "object" ? obj : null;
    const level = Number(depth) || 0;
    if (!src || level > 4) return null;

    if (Array.isArray(src)){
      const arr = findNumericArrayFromValue(src);
      if (arr && seatIndex >= 0 && seatIndex < arr.length) return arr[seatIndex];
      for (const item of src){
        const nested = findSeatDeltaFromObject(item, seatIndex, level + 1);
        if (Number.isFinite(nested)) return nested;
      }
      return null;
    }

    const directSeatKeys = normalizeSeatValueKey(seatIndex);
    for (const key of directSeatKeys){
      const direct = src[key];
      const num = Number(direct);
      if (Number.isFinite(num)) return num;
      if (direct && typeof direct === "object"){
        const nestedDirect = findNumberByCandidateKeys(direct, ["delta", "chipDelta", "value", "chips", "total"]);
        if (Number.isFinite(nestedDirect)) return nestedDirect;
      }
    }

    const arrayCandidateKeys = [
      "delta",
      "deltas",
      "chipDelta",
      "chipDeltas",
      "seatDelta",
      "seatDeltas",
      "results",
      "changes",
      "change",
      "perSeat",
      "bySeat",
      "seatResults"
    ];
    const arr = findArrayByCandidateKeys(src, arrayCandidateKeys);
    if (arr && seatIndex >= 0 && seatIndex < arr.length) return arr[seatIndex];

    const nestedKeys = [
      "chipInfo",
      "resultMeta",
      "summary",
      "settlement",
      "detail",
      "payload"
    ];
    for (const key of nestedKeys){
      if (src[key] && typeof src[key] === "object"){
        const nested = findSeatDeltaFromObject(src[key], seatIndex, level + 1);
        if (Number.isFinite(nested)) return nested;
      }
    }

    for (const key of Object.keys(src)){
      const value = src[key];
      if (!value || typeof value !== "object") continue;
      const nested = findSeatDeltaFromObject(value, seatIndex, level + 1);
      if (Number.isFinite(nested)) return nested;
    }

    return null;
  }

  function getChipDeltaFromEntryHeuristic(entry, context){
    const src = entry && typeof entry === "object" ? entry : null;
    if (!src) return null;

    const objectCandidates = [
      src.chipInfo,
      src.resultMeta && src.resultMeta.chipInfo
    ].filter((value)=> value && typeof value === "object");

    for (const item of objectCandidates){
      const seatSpecific = findSeatDeltaFromObject(item, 0, 0);
      if (Number.isFinite(seatSpecific)) return seatSpecific;
    }

    const positiveKeys = [
      "total",
      "totalChips",
      "chipTotal",
      "chipDelta",
      "chipGain",
      "net",
      "gain",
      "chips",
      "value"
    ];

    const negativeKeys = [
      "loss",
      "paid",
      "dealInLoss",
      "chipLoss",
      "chipDelta",
      "chipPaid",
      "chips",
      "value"
    ];

    if (context === "winner"){
      for (const item of objectCandidates){
        const num = findNumberByCandidateKeys(item, positiveKeys);
        if (Number.isFinite(num)) return Math.abs(num);
      }
    }

    if (context === "loser"){
      for (const item of objectCandidates){
        const num = findNumberByCandidateKeys(item, negativeKeys);
        if (Number.isFinite(num)) return -Math.abs(num);
      }
    }

    return null;
  }

  function getSeatChipDelta(settlement, seatIndex){
    if (!settlement || typeof settlement !== "object") return null;

    const chipInfoSeatDelta = findSeatDeltaFromObject(settlement.chipInfo, seatIndex, 0);
    if (Number.isFinite(chipInfoSeatDelta)) return chipInfoSeatDelta;

    const settlementResultMetaChipDelta = findSeatDeltaFromObject(settlement.resultMeta && settlement.resultMeta.chipInfo, seatIndex, 0);
    if (Number.isFinite(settlementResultMetaChipDelta)) return settlementResultMetaChipDelta;

    if (isSeatAgariSettlement(settlement, seatIndex)){
      const entries = getAgariEntriesForSeat(settlement, seatIndex);
      let total = 0;
      let found = false;
      entries.forEach((entry)=> {
        const value = getChipDeltaFromEntryHeuristic(entry, "winner");
        if (Number.isFinite(value)){
          total += Math.abs(value);
          found = true;
        }
      });
      if (found) return total;
      if (Number(settlement.winnerSeatIndex) === seatIndex){
        const value = getChipDeltaFromEntryHeuristic(settlement, "winner");
        if (Number.isFinite(value)) return Math.abs(value);
      }
    }

    if (isSeatHojuSettlement(settlement, seatIndex)){
      const entries = getHojuEntriesForSeat(settlement, seatIndex);
      let total = 0;
      let found = false;
      entries.forEach((entry)=> {
        const value = getChipDeltaFromEntryHeuristic(entry, "loser");
        if (Number.isFinite(value)){
          total += -Math.abs(value);
          found = true;
        }
      });
      if (found) return total;
      if (Number(settlement.discarderSeatIndex) === seatIndex){
        const value = getChipDeltaFromEntryHeuristic(settlement, "loser");
        if (Number.isFinite(value)) return -Math.abs(value);
      }
    }

    return null;
  }

  function getRoundNumberLabel(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    const wind = String(start.roundWind || "");
    const round = safeNumber(start.roundNumber, 0);
    const honba = safeNumber(start.honba, 0);
    const base = wind && round ? `${wind}${round}局` : "—";
    return honba > 0 ? `${base} ${honba}本場` : base;
  }

  function getLastSettlement(log){
    const kyokus = safeArray(log && log.kyokus);
    for (let i = kyokus.length - 1; i >= 0; i--){
      const settlement = getSettlement(kyokus[i]);
      if (settlement) return settlement;
    }
    return null;
  }

  function cloneScoreTriplet(src){
    if (!Array.isArray(src)) return [0, 0, 0];
    return [
      Number.isFinite(Number(src[0])) ? (Number(src[0]) | 0) : 0,
      Number.isFinite(Number(src[1])) ? (Number(src[1]) | 0) : 0,
      Number.isFinite(Number(src[2])) ? (Number(src[2]) | 0) : 0
    ];
  }

  function getPreviousSeatIndexForMetrics(seatIndex){
    if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return null;
    return (seatIndex + 2) % 3;
  }

  function getTobiBustSeatIndexesForMetrics(scoreList){
    const list = [];
    const scores = Array.isArray(scoreList) ? scoreList : [];
    for (let seat = 0; seat < 3; seat++){
      const value = Number(scores[seat]) || 0;
      if (value <= 0) list.push(seat);
    }
    return list;
  }

  function getRonTobiRecipientSeatFromSettlementForMetrics(settlement, bustSeat){
    if (!settlement) return null;

    if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
      const winnerSeats = settlement.agariEntries
        .map((entry)=> entry && entry.winnerSeatIndex)
        .filter((seat)=> seat === 0 || seat === 1 || seat === 2);

      if (winnerSeats.length <= 0) return null;
      if (winnerSeats.length === 1) return winnerSeats[0];

      const kamichaSeat = getPreviousSeatIndexForMetrics(bustSeat);
      if (kamichaSeat === 0 || kamichaSeat === 1 || kamichaSeat === 2){
        if (winnerSeats.includes(kamichaSeat)) return kamichaSeat;
      }

      const headSeat = settlement.headEntry && (settlement.headEntry.winnerSeatIndex === 0 || settlement.headEntry.winnerSeatIndex === 1 || settlement.headEntry.winnerSeatIndex === 2)
        ? settlement.headEntry.winnerSeatIndex
        : null;
      if (headSeat != null && winnerSeats.includes(headSeat)) return headSeat;

      return winnerSeats[0];
    }

    if (settlement.winnerSeatIndex === 0 || settlement.winnerSeatIndex === 1 || settlement.winnerSeatIndex === 2){
      return settlement.winnerSeatIndex;
    }

    return null;
  }

  function getRyukyokuTobiRecipientSeatFromSettlementForMetrics(settlement, bustSeat){
    if (!settlement || !Array.isArray(settlement.tenpaiSeats)) return null;

    const tenpaiSeats = settlement.tenpaiSeats.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
    if (tenpaiSeats.length <= 0) return null;
    if (tenpaiSeats.length === 1) return tenpaiSeats[0];

    const kamichaSeat = getPreviousSeatIndexForMetrics(bustSeat);
    if (kamichaSeat === 0 || kamichaSeat === 1 || kamichaSeat === 2){
      if (tenpaiSeats.includes(kamichaSeat)) return kamichaSeat;
    }

    return tenpaiSeats[0];
  }

  function getTobiChipRecipientSeatFromSettlementForMetrics(settlement, bustSeat){
    if (!settlement) return null;
    if (bustSeat !== 0 && bustSeat !== 1 && bustSeat !== 2) return null;

    if (settlement.type === "agari"){
      if (settlement.winType === "tsumo"){
        return (settlement.winnerSeatIndex === 0 || settlement.winnerSeatIndex === 1 || settlement.winnerSeatIndex === 2)
          ? settlement.winnerSeatIndex
          : null;
      }

      if (settlement.winType === "ron"){
        return getRonTobiRecipientSeatFromSettlementForMetrics(settlement, bustSeat);
      }
    }

    if (settlement.type === "ryukyoku"){
      return getRyukyokuTobiRecipientSeatFromSettlementForMetrics(settlement, bustSeat);
    }

    return null;
  }

  function getHighestScoreSeatForMetrics(scoreList, bustSeat){
    if (!Array.isArray(scoreList)) return null;

    let bestSeat = null;
    let bestScore = -Infinity;

    for (let seat = 0; seat < 3; seat++){
      if (seat === bustSeat) continue;
      const value = Number(scoreList[seat]) || 0;
      if (value > bestScore){
        bestScore = value;
        bestSeat = seat;
      }
    }

    return bestSeat;
  }

  function getNoBustAdjustedScoresForMetrics(scoreList, settlement){
    const adjusted = cloneScoreTriplet(scoreList);
    const bustSeats = getTobiBustSeatIndexesForMetrics(adjusted);
    if (bustSeats.length <= 0) return adjusted;

    for (const bustSeat of bustSeats){
      const rawScore = Number(adjusted[bustSeat]) || 0;
      if (rawScore >= 0) continue;

      const deficit = -rawScore;
      adjusted[bustSeat] = 0;

      let recipientSeat = getTobiChipRecipientSeatFromSettlementForMetrics(settlement, bustSeat);
      if (recipientSeat !== 0 && recipientSeat !== 1 && recipientSeat !== 2){
        recipientSeat = getHighestScoreSeatForMetrics(adjusted, bustSeat);
      }

      if (recipientSeat !== 0 && recipientSeat !== 1 && recipientSeat !== 2) continue;
      if (recipientSeat === bustSeat) continue;

      adjusted[recipientSeat] = (Number(adjusted[recipientSeat]) || 0) - deficit;
    }

    return adjusted;
  }

  function getHanchanUmaByRankForMetrics(rows, source = null){
    const secondScore = rows && rows[1] ? (Number(rows[1].score) || 0) : 0;
    const normalUma2 = Math.round(getRuleNumberForMetrics("score-uma-2", -5, source));
    const normalUma3 = Math.round(getRuleNumberForMetrics("score-uma-3", -10, source));
    const kubiEnabled = String(getRuleValueForMetrics("score-kubi-enabled", "off", source) || "").toLowerCase() === "on";
    const kubiPoint = Math.round(getRuleNumberForMetrics("score-kubi-point", 40000, source));
    const kubiUma2 = Math.round(getRuleNumberForMetrics("score-kubi-uma-2", 5, source));
    const kubiUma3 = Math.round(getRuleNumberForMetrics("score-kubi-uma-3", -15, source));

    const useKubi = kubiEnabled && secondScore >= kubiPoint;
    const uma2 = useKubi ? kubiUma2 : normalUma2;
    const uma3 = useKubi ? kubiUma3 : normalUma3;
    const oka = ((getConfiguredReturnScoreForMetrics(source) - Math.max(0, Math.round(getRuleNumberForMetrics("overview-start-score", 35000, source)))) / 1000) * 3;
    const topUma = oka - uma2 - uma3;

    return [topUma, uma2, uma3];
  }

  function calcHanchanFinalScoreValueForMetrics(point, rankIndex, rows, source = null){
    const rawPoint = Number(point) || 0;
    const scorePoint = isHakoshitaEnabledForMetrics(source) ? rawPoint : Math.max(0, rawPoint);
    const base = (scorePoint - getConfiguredReturnScoreForMetrics(source)) / 1000;
    const scaledBase = base * getConfiguredRateMultiplierForMetrics(source);
    const umaByRank = getHanchanUmaByRankForMetrics(rows, source);
    return scaledBase + (Number(umaByRank[rankIndex]) || 0);
  }

  function calcHanchanTotalScoreValueForMetrics(point, rankIndex, rows, chipCount, source = null){
    const baseScore = calcHanchanFinalScoreValueForMetrics(point, rankIndex, rows, source);
    const chipScore = (Number(chipCount) || 0) * getConfiguredChipUnitForMetrics(source);
    return baseScore + chipScore;
  }

  function computeFallbackFinalPoints(log){
    const summary = log && log.summary && typeof log.summary === "object" ? log.summary : {};
    const endInfo = summary.endInfo && typeof summary.endInfo === "object" ? summary.endInfo : {};
    const endPointArray = extractFinalPointArray(endInfo);
    if (endPointArray && endPointArray.length >= 3){
      return endPointArray.slice(0, 3).map((value)=> safeNumber(value, 0));
    }

    const settlement = getLastSettlement(log);
    if (settlement && safeArray(settlement.afterScores).length >= 3){
      return getNoBustAdjustedScoresForMetrics(safeArray(settlement.afterScores).slice(0, 3), settlement);
    }
    return null;
  }

  function computeFallbackRankFromPoints(finalPoints, seatIndex){
    const points = safeArray(finalPoints);
    if (points.length < 3) return null;
    const selfPoint = safeNumber(points[seatIndex], null);
    if (!Number.isFinite(selfPoint)) return null;
    const higherCount = points.filter((value)=> safeNumber(value, -Infinity) > selfPoint).length;
    return higherCount + 1;
  }

  function extractSeatArrayFromUnknown(value){
    const direct = findNumericArrayFromValue(value);
    if (direct) return direct;
    if (value && typeof value === "object"){
      const arr = findArrayByCandidateKeys(value, [
        "values",
        "array",
        "list",
        "bySeat",
        "perSeat",
        "seatValues",
        "seatResult",
        "seatResults"
      ]);
      if (arr) return arr;
    }
    return null;
  }

  function extractRankArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalRanks",
      "ranks",
      "rankings",
      "placements",
      "placement",
      "rank",
      "resultRanks",
      "resultRankings"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function extractScoreArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalScores",
      "scores",
      "scoreDiffs",
      "scoreDeltas",
      "scoreDelta",
      "resultScores",
      "finalScoreList"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function extractFinalPointArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalPoints",
      "points",
      "pointTotals",
      "resultPoints",
      "finalPointList",
      "pointList"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function extractChipArray(endInfo){
    const src = endInfo && typeof endInfo === "object" ? endInfo : null;
    if (!src) return null;
    const candidates = [
      "finalChips",
      "chips",
      "chipTotals",
      "chipDeltas",
      "chipDelta",
      "resultChips"
    ];
    for (const key of candidates){
      const value = getObjectByPath(src, key);
      const arr = extractSeatArrayFromUnknown(value);
      if (arr && arr.length >= 3) return arr;
    }
    return null;
  }

  function computeChipIncludedScore(score, chips, source = null){
    const scoreValue = Number(score);
    if (!Number.isFinite(scoreValue)) return null;
    const chipValue = Number(chips);
    return scoreValue + (Number.isFinite(chipValue) ? chipValue * getConfiguredChipUnitForMetrics(source) : 0);
  }

  function buildMatchChipArray(log, endInfo){
    const chipArray = extractChipArray(endInfo);
    if (chipArray && chipArray.length >= 3){
      return chipArray.slice(0, 3).map((value)=> safeNumber(value, 0));
    }

    const totals = [0, 0, 0];
    safeArray(log && log.kyokus).forEach((kyoku)=> {
      const settlement = getSettlement(kyoku);
      if (!settlement) return;
      for (let seat = 0; seat < 3; seat++){
        const chipDelta = getSeatChipDelta(settlement, seat);
        if (Number.isFinite(chipDelta)) totals[seat] += chipDelta;
      }
    });
    return totals;
  }

  function buildFinalRankedRowsFromLog(log, endInfo){
    const finalPoints = computeFallbackFinalPoints(log);
    if (!finalPoints || finalPoints.length < 3) return null;

    const chipTotals = buildMatchChipArray(log, endInfo);
    const rows = [];
    for (let seat = 0; seat < 3; seat++){
      rows.push({
        seat,
        score: safeNumber(finalPoints[seat], 0),
        chipCount: safeNumber(chipTotals[seat], 0)
      });
    }

    rows.sort((a, b)=> {
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });

    for (let i = 0; i < rows.length; i++){
      rows[i].rankIndex = i;
      rows[i].rank = i + 1;
      rows[i].finalScoreValue = calcHanchanFinalScoreValueForMetrics(rows[i].score, i, rows, log);
      rows[i].totalScoreValue = calcHanchanTotalScoreValueForMetrics(rows[i].score, i, rows, rows[i].chipCount, log);
    }

    return {
      rows,
      finalPoints: rows.map((row)=> row.score)
    };
  }

  function getMatchSummaryInfo(log, seatIndex){
    const summary = log && log.summary && typeof log.summary === "object" ? log.summary : {};
    const endInfo = summary.endInfo && typeof summary.endInfo === "object" ? summary.endInfo : {};
    const rankArray = extractRankArray(endInfo);
    const scoreArray = extractScoreArray(endInfo);
    const chipArray = extractChipArray(endInfo);
    const finalRowsInfo = buildFinalRankedRowsFromLog(log, endInfo);
    const finalRow = finalRowsInfo && Array.isArray(finalRowsInfo.rows)
      ? finalRowsInfo.rows.find((row)=> row && row.seat === seatIndex) || null
      : null;
    const finalPoints = finalRowsInfo && Array.isArray(finalRowsInfo.finalPoints)
      ? finalRowsInfo.finalPoints.slice(0, 3)
      : computeFallbackFinalPoints(log);

    const matchChipDeltas = [];
    safeArray(log && log.kyokus).forEach((kyoku)=> {
      const settlement = getSettlement(kyoku);
      if (!settlement) return;
      const chipDelta = getSeatChipDelta(settlement, seatIndex);
      if (Number.isFinite(chipDelta)) matchChipDeltas.push(chipDelta);
    });

    const extractedRank = rankArray && Number.isFinite(Number(rankArray[seatIndex]))
      ? Number(rankArray[seatIndex])
      : computeFallbackRankFromPoints(finalPoints, seatIndex);

    const extractedScore = scoreArray && Number.isFinite(Number(scoreArray[seatIndex]))
      ? Number(scoreArray[seatIndex])
      : findNumberByCandidateKeys(endInfo, [
          `score.${seatIndex}`,
          `finalScore.${seatIndex}`,
          `seat${seatIndex}.score`,
          `player${seatIndex}.score`
        ]);

    const chips = finalRow && Number.isFinite(Number(finalRow.chipCount))
      ? Number(finalRow.chipCount)
      : (chipArray && Number.isFinite(Number(chipArray[seatIndex]))
          ? Number(chipArray[seatIndex])
          : sumFrom(matchChipDeltas));

    const finalPoint = finalRow && Number.isFinite(Number(finalRow.score))
      ? Number(finalRow.score)
      : (finalPoints && Number.isFinite(Number(finalPoints[seatIndex]))
          ? Number(finalPoints[seatIndex])
          : null);

    const finalScoreValue = finalRow && Number.isFinite(Number(finalRow.finalScoreValue))
      ? Number(finalRow.finalScoreValue)
      : (Number.isFinite(extractedScore) ? Number(extractedScore) : null);

    const totalScoreValue = finalRow && Number.isFinite(Number(finalRow.totalScoreValue))
      ? Number(finalRow.totalScoreValue)
      : computeChipIncludedScore(finalScoreValue, chips, log);

    const rank = finalRow && Number.isFinite(Number(finalRow.rank))
      ? Number(finalRow.rank)
      : extractedRank;

    return {
      rank: Number.isFinite(rank) ? rank : null,
      score: Number.isFinite(finalScoreValue) ? finalScoreValue : null,
      totalScore: Number.isFinite(totalScoreValue) ? totalScoreValue : null,
      chips: Number.isFinite(chips) ? chips : null,
      finalPoint: Number.isFinite(finalPoint) ? finalPoint : null,
      finalPoints
    };
  }

  function getRiichiEvents(kyoku){
    return getKyokuEvents(kyoku).filter((event)=> event && event.type === "riichi");
  }

  function getKyokuReachedJunme(kyoku){
    const drawCounts = [0, 0, 0];

    getKyokuEvents(kyoku).forEach((event)=> {
      if (!event || event.type !== "draw") return;
      const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
      const seatIndex = Number(payload.seatIndex);
      if (seatIndex === 0 || seatIndex === 1 || seatIndex === 2){
        drawCounts[seatIndex] += 1;
      }
    });

    const maxDrawCount = Math.max(drawCounts[0], drawCounts[1], drawCounts[2]);
    if (maxDrawCount > 0) return maxDrawCount;

    const discardCounts = [0, 0, 0];
    getKyokuEvents(kyoku).forEach((event)=> {
      if (!event || event.type !== "discard") return;
      const payload = event.payload && typeof event.payload === "object" ? event.payload : {};
      const seatIndex = Number(payload.seatIndex);
      if (seatIndex === 0 || seatIndex === 1 || seatIndex === 2){
        discardCounts[seatIndex] += 1;
      }
    });

    return Math.max(discardCounts[0], discardCounts[1], discardCounts[2], 0);
  }

  function getFirstRiichiCategoryForSeat(kyoku, seatIndex){
    const myRiichiEvent = findRiichiEventBySeat(kyoku, seatIndex);
    if (!myRiichiEvent) return "";
    const mySeq = safeNumber(myRiichiEvent.seq, 0);
    const earlierOther = getRiichiEvents(kyoku).some((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : {};
      return safeNumber(event.seq, 0) < mySeq && safeNumber(payload.seatIndex, -1) !== seatIndex;
    });
    if (earlierOther) return "";
    const info = getRiichiInfoBySeat(kyoku, seatIndex);
    if (!info.hasKnownWaitShape) return "";
    if (info.isRyanmenWait) return "first_ryanmen_riichi";
    if (info.isGukeiWait) return "first_gukei_riichi";
    return "";
  }

  function buildOutcomeBucket(){
    return {
      count: 0,
      agariCount: 0,
      hojuCount: 0,
      hitByTsumoCount: 0,
      horizontalCount: 0,
      ryukyokuCount: 0,
      deltaList: [],
      agariPointList: []
    };
  }

  function pushOutcomeToBucket(bucket, settlement, seatIndex, delta, agariPoint){
    if (!bucket) return;
    bucket.count += 1;
    if (Number.isFinite(delta)) bucket.deltaList.push(delta);
    if (settlement && settlement.type === "agari"){
      if (isSeatAgariSettlement(settlement, seatIndex)){
        bucket.agariCount += 1;
        if (Number.isFinite(agariPoint)) bucket.agariPointList.push(agariPoint);
      } else if (isSeatHojuSettlement(settlement, seatIndex)){
        bucket.hojuCount += 1;
      } else if (isSeatHitByTsumo(settlement, seatIndex)){
        bucket.hitByTsumoCount += 1;
      } else if (isSeatHorizontalMoveSettlement(settlement, seatIndex)){
        bucket.horizontalCount += 1;
      }
    } else if (settlement && settlement.type === "ryukyoku"){
      bucket.ryukyokuCount += 1;
    }
  }

  function finalizeOutcomeBucket(bucket){
    if (!bucket) return null;
    return {
      count: bucket.count,
      averageDelta: averageFrom(bucket.deltaList),
      agariRate: rate(bucket.agariCount, bucket.count),
      hojuRate: rate(bucket.hojuCount, bucket.count),
      hitByTsumoRate: rate(bucket.hitByTsumoCount, bucket.count),
      horizontalRate: rate(bucket.horizontalCount, bucket.count),
      ryukyokuRate: rate(bucket.ryukyokuCount, bucket.count),
      averageAgariPoint: averageFrom(bucket.agariPointList)
    };
  }

  function getRoundWindCodeForAnalysis(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    const wind = String(start.roundWind || "");
    if (wind === "東") return "1z";
    if (wind === "南") return "2z";
    if (wind === "西") return "3z";
    return null;
  }

  function getSeatWindCodeForAnalysis(kyoku, seatIndex){
    const east = getEastSeatIndex(kyoku);
    if (east === 0){
      if (seatIndex === 0) return "1z";
      if (seatIndex === 1) return "2z";
      if (seatIndex === 2) return "3z";
    }
    if (east === 1){
      if (seatIndex === 1) return "1z";
      if (seatIndex === 2) return "2z";
      if (seatIndex === 0) return "3z";
    }
    if (east === 2){
      if (seatIndex === 2) return "1z";
      if (seatIndex === 0) return "2z";
      if (seatIndex === 1) return "3z";
    }
    return null;
  }

  function getYakuhaiCandidatesForCode(code){
    if (code === "1z") return ["yakuhaiton", "yakuhai_ton", "東", "役牌 東", "役牌(東)"];
    if (code === "2z") return ["yakuhainan", "yakuhai_nan", "南", "役牌 南", "役牌(南)"];
    if (code === "3z") return ["yakuhaisha", "yakuhai_sha", "西", "役牌 西", "役牌(西)"];
    if (code === "5z") return ["yakuhaihaku", "yakuhai_haku", "白", "役牌 白", "役牌(白)"];
    if (code === "6z") return ["yakuhaihatsu", "yakuhai_hatsu", "發", "発", "役牌 發", "役牌 発", "役牌(發)", "役牌(発)"];
    if (code === "7z") return ["yakuhaichun", "yakuhai_chun", "中", "役牌 中", "役牌(中)"];
    return [];
  }

  function hasYakuhaiYakuForCode(yakuKeys, code){
    return hasAnyYakuKey(yakuKeys, getYakuhaiCandidatesForCode(code));
  }

  function hasRoundWindYakuhai(yakuKeys, roundWindCode){
    return hasAnyYakuKey(yakuKeys, ["yakuhairound", "yakuhai_round", "場風", "場風（東）", "場風（南）", "場風（西）"])
      || hasYakuhaiYakuForCode(yakuKeys, roundWindCode);
  }

  function hasSeatWindYakuhai(yakuKeys, seatWindCode){
    return hasAnyYakuKey(yakuKeys, ["yakuhaiseat", "yakuhai_seat", "自風", "自風（東）", "自風（南）", "自風（西）"])
      || hasYakuhaiYakuForCode(yakuKeys, seatWindCode);
  }

  function hasMenzenTsumoYaku(yakuKeys){
    return hasAnyYakuKey(yakuKeys, ["menzentsumo", "menzen_tsumo", "門前ツモ", "門前清自摸和", "面前清自摸和"]);
  }

  function hasDoubleRiichiYaku(yakuKeys){
    return hasAnyYakuKey(yakuKeys, ["doubleriichi", "double_riichi", "double-riichi", "ダブル立直", "ダブリー"]);
  }

  function isMenzenAgariDetail(detail){
    if (!detail || typeof detail !== "object") return null;
    if (detail.resultMeta && typeof detail.resultMeta === "object" && typeof detail.resultMeta.isMenzen === "boolean") return detail.resultMeta.isMenzen;
    if (detail.yakuInfo && typeof detail.yakuInfo === "object" && typeof detail.yakuInfo.isMenzen === "boolean") return detail.yakuInfo.isMenzen;
    return null;
  }

  function isRiichiAgariDetail(detail){
    const yakuKeys = listYakuKeys(detail);
    return hasAnyYakuKey(yakuKeys, ["riichi", "reach", "立直", "doubleriichi", "double_riichi", "daburii", "ダブル立直", "ダブリー"]);
  }

  function isOpenAgariDetail(detail){
    const menzen = isMenzenAgariDetail(detail);
    return menzen === false;
  }

  function isDamaAgariDetail(detail){
    const menzen = isMenzenAgariDetail(detail);
    if (menzen !== true) return false;
    return !isRiichiAgariDetail(detail);
  }

  function isDamaAgariByContext(detail, riichiInfo, hasOpen){
    if (isDamaAgariDetail(detail)) return true;

    const menzen = isMenzenAgariDetail(detail);
    if (menzen === false) return false;
    if (hasOpen) return false;
    return !(riichiInfo && riichiInfo.hasRiichi);
  }

  function isFinalTenpaiSeatForAnalysis(settlement, seatIndex){
    if (!settlement || typeof settlement !== "object") return false;

    const tenpaiSeats = safeArray(settlement.tenpaiSeats);
    if (tenpaiSeats.includes(seatIndex)) return true;

    if (settlement.type === "agari" && isSeatAgariSettlement(settlement, seatIndex)) return true;
    return false;
  }

  function isFinalDamaTenpaiSeatForAnalysis(settlement, seatIndex, riichiInfo, hasOpen){
    if (hasOpen) return false;
    if (riichiInfo && riichiInfo.hasRiichi) return false;
    return isFinalTenpaiSeatForAnalysis(settlement, seatIndex);
  }

  function getBonusColorDoraCount(bonus){
    const src = bonus && typeof bonus === "object" ? bonus : null;
    if (!src) return 0;
    return Number.isFinite(Number(src.colorDora)) ? (Number(src.colorDora) | 0) : 0;
  }

  function getBonusNukiDoraCount(bonus){
    const src = bonus && typeof bonus === "object" ? bonus : null;
    if (!src) return 0;
    return Number.isFinite(Number(src.nukiDora)) ? (Number(src.nukiDora) | 0) : 0;
  }

  function countDoraFromDetail(detail){
    const bonus = detail && detail.bonus && typeof detail.bonus === "object" ? detail.bonus : null;
    if (!bonus) return null;
    return safeNumber(bonus.dora, 0) + safeNumber(bonus.uraDora, 0) + getBonusColorDoraCount(bonus) + getBonusNukiDoraCount(bonus);
  }

  function isYakumanAgariDetail(detail){
    if (!detail || typeof detail !== "object") return false;
    if (safeNumber(detail.yakuman, 0) > 0) return true;
    if (detail.yakuInfo && safeNumber(detail.yakuInfo.yakuman, 0) > 0) return true;
    return false;
  }

  function buildAnalysisSummary(storedLogs, filters){
    const normalizedFilters = normalizeAnalysisFilters(filters);
    const completedLogs = getCompletedLogs(storedLogs);
    const limitedLogs = getLimitedLogs(completedLogs, normalizedFilters.limit);

    const summary = {
      filters: cloneObject(normalizedFilters),
      scope: {
        completedMatchCount: completedLogs.length,
        limitedMatchCount: limitedLogs.length,
        includedMatchCount: 0
      },
      matchCounts: {
        all: completedLogs.length,
        included: 0,
        normal: 0,
        batch: 0,
        unknown: 0,
        local: 0,
        account: 0
      },
      overall: {
        kyokuCount: 0,
        sampleKyokuCount: 0,
        dealerSampleCount: 0,
        nondealerSampleCount: 0,
        averageKyokuCountPerMatch: null,
        averageJunmePerKyoku: null,
        horizontalRate: null,
        averagePoint: null,
        averageAgariChipCount: null,
        averageRank1Score: null,
        averageRank2Score: null,
        averageRank3Score: null,
        averageHojuPoint: null,
        averageHitByTsumoPoint: null,
        averageDoraCount: null
      },
      riichi: {
        count: 0,
        rate: null,
        averageJunme: null,
        averagePoint: null,
        averageWaitTypeCount: null,
        averageWaitTileCount: null,
        waitShapeKnownCount: 0,
        ryanmenCount: 0,
        ryanmenRate: null,
        ryanmenAgariCount: 0,
        ryanmenTsumoAgariCount: 0,
        ryanmenAgariRate: null,
        ryanmenTsumoAgariRate: null,
        gukeiCount: 0,
        gukeiRate: null,
        gukeiAgariCount: 0,
        gukeiTsumoAgariCount: 0,
        gukeiAgariRate: null,
        gukeiTsumoAgariRate: null,
        averageCountPerMatch: null
      },
      open: {
        count: 0,
        rate: null,
        averageOpenCountWhenOpened: null
      },
      agari: {
        count: 0,
        rate: null,
        tsumoCount: 0,
        tsumoRate: null,
        ronCount: 0,
        ronRate: null,
        dealerCount: 0,
        dealerRate: null,
        riichiCount: 0,
        riichiRate: null,
        openCount: 0,
        openRate: null,
        damaCount: 0,
        damaRate: null,
        riichiAgariRate: null,
        openAgariRate: null,
        damaAgariRate: null,
        averagePoint: null,
        averagePointRiichi: null,
        averagePointOpen: null,
        averagePointDama: null,
        averagePointTsumo: null,
        averagePointRon: null,
        manganOrMoreCount: 0,
        manganOrMoreRate: null,
        averageDoraCount: null,
        yakuCompositeRates: {
          menzenTsumo: null,
          doubleRiichi: null,
          tanyao: null,
          pinfu: null,
          chiitoi: null,
          toitoi: null,
          honitsuOrChinitsu: null,
          roundWind: null,
          seatWind: null,
          dragons: null,
          iipeiko: null,
          chanta: null,
          ittsu: null,
          yakuman: null
        }
      },
      hoju: {
        count: 0,
        rate: null,
        dealerWinnerCount: 0,
        dealerWinnerRate: null,
        riichiCount: 0,
        riichiRate: null,
        openCount: 0,
        openRate: null,
        averagePoint: null,
        tenpaiCount: 0,
        tenpaiRate: null
      },
      hitByTsumo: {
        count: 0,
        rate: null,
        averagePoint: null
      },
      horizontal: {
        count: 0,
        rate: null
      },
      ryukyoku: {
        count: 0,
        rate: null,
        tenpaiCount: 0,
        tenpaiRate: null
      },
      nagashi: {
        count: 0,
        rate: null
      },
      availability: {
        pointDataCount: 0,
        yakuDataCount: 0,
        doraDataCount: 0,
        hojuPointDataCount: 0,
        hojuTenpaiDataCount: 0
      }
    };

    const riichiJunmes = [];
    const riichiWaitTypeCounts = [];
    const riichiWaitTileCounts = [];
    const kyokuReachedJunmes = [];
    const openCountInOpenSamples = [];
    const agariPointList = [];
    const agariPointRiichiList = [];
    const agariPointOpenList = [];
    const agariPointDamaList = [];
    const agariPointTsumoList = [];
    const agariPointRonList = [];
    const agariDoraCounts = [];
    const agariChipCountList = [];
    const hojuPointList = [];
    const hitByTsumoPointList = [];
    const rank1ScoreList = [];
    const rank2ScoreList = [];
    const rank3ScoreList = [];

    const agariYakuCompositeCounts = {
      menzenTsumo: 0,
      doubleRiichi: 0,
      tanyao: 0,
      pinfu: 0,
      chiitoi: 0,
      toitoi: 0,
      honitsuOrChinitsu: 0,
      roundWind: 0,
      seatWind: 0,
      dragons: 0,
      iipeiko: 0,
      chanta: 0,
      ittsu: 0,
      yakuman: 0
    };

    let finalDamaTenpaiCount = 0;

    limitedLogs.forEach((log)=> {
      const matchMode = getMatchMode(log);
      const sessionMode = getSessionMode(log);
      const ruleSetId = getRuleSetId(log);
      if (normalizedFilters.matchMode !== "all" && matchMode !== normalizedFilters.matchMode) return;
      if (normalizedFilters.sessionMode !== "all" && sessionMode !== normalizedFilters.sessionMode) return;
      if (normalizedFilters.ruleSetId !== "all" && ruleSetId !== normalizedFilters.ruleSetId) return;

      summary.scope.includedMatchCount += 1;
      summary.matchCounts.included += 1;
      summary.matchCounts[matchMode] = (summary.matchCounts[matchMode] || 0) + 1;
      summary.matchCounts[sessionMode] = (summary.matchCounts[sessionMode] || 0) + 1;

      [0, 1, 2].forEach((seatIndex)=> {
        const matchInfo = getMatchSummaryInfo(log, seatIndex);
        const chipIncludedScore = Number.isFinite(Number(matchInfo.totalScore))
          ? Number(matchInfo.totalScore)
          : computeChipIncludedScore(matchInfo.score, matchInfo.chips, log);
        if (!Number.isFinite(chipIncludedScore)) return;
        if (matchInfo.rank === 1) rank1ScoreList.push(chipIncludedScore);
        else if (matchInfo.rank === 2) rank2ScoreList.push(chipIncludedScore);
        else if (matchInfo.rank === 3) rank3ScoreList.push(chipIncludedScore);
      });

      safeArray(log && log.kyokus).forEach((kyoku)=> {
        const includedSeats = getIncludedSeats(kyoku, normalizedFilters.dealer);
        if (!includedSeats.length) return;

        const settlement = getSettlement(kyoku);
        const eastSeatIndex = getEastSeatIndex(kyoku);
        summary.overall.kyokuCount += 1;
        const reachedJunme = getKyokuReachedJunme(kyoku);
        if (reachedJunme > 0) kyokuReachedJunmes.push(reachedJunme);

        const hasNagashi = !!(settlement && settlement.type === "agari" && (
          String(settlement.winType || "") === "nagashi"
          || getAgariEntries(settlement).some((entry)=> String(entry && entry.winType || "") === "nagashi")
        ));
        if (hasNagashi) summary.nagashi.count += 1;

        includedSeats.forEach((seatIndex)=> {
          const isDealer = seatIndex === eastSeatIndex;
          const riichiInfo = getRiichiInfoBySeat(kyoku, seatIndex);
          const openCount = getOpenEventCountBySeat(kyoku, seatIndex);
          const hasOpen = openCount > 0;

          summary.overall.sampleKyokuCount += 1;
          if (isDealer) summary.overall.dealerSampleCount += 1;
          else summary.overall.nondealerSampleCount += 1;
          if (isFinalDamaTenpaiSeatForAnalysis(settlement, seatIndex, riichiInfo, hasOpen)){
            finalDamaTenpaiCount += 1;
          }

          if (riichiInfo.hasRiichi){
            summary.riichi.count += 1;
            if (riichiInfo.junme > 0) riichiJunmes.push(riichiInfo.junme);
            if (riichiInfo.waitTypeCount > 0){
              riichiWaitTypeCounts.push(riichiInfo.waitTypeCount);
              summary.riichi.waitShapeKnownCount += 1;
            }
            if (riichiInfo.waitTileCount > 0) riichiWaitTileCounts.push(riichiInfo.waitTileCount);
            if (riichiInfo.hasKnownWaitShape && riichiInfo.isRyanmenWait) summary.riichi.ryanmenCount += 1;
            if (riichiInfo.hasKnownWaitShape && riichiInfo.isGukeiWait) summary.riichi.gukeiCount += 1;
          }

          if (hasOpen){
            summary.open.count += 1;
            openCountInOpenSamples.push(openCount);
          }

          if (settlement && settlement.type === "agari"){
            if (isSeatAgariSettlement(settlement, seatIndex)){
              const entry = getAgariEntriesForSeat(settlement, seatIndex)[0] || settlement;
              const winType = String(entry && entry.winType || settlement.winType || "");
              if (winType === "nagashi") return;

              summary.agari.count += 1;
              if (winType === "tsumo") summary.agari.tsumoCount += 1;
              if (winType === "ron") summary.agari.ronCount += 1;
              if (isDealer) summary.agari.dealerCount += 1;
              if (riichiInfo.hasRiichi) summary.agari.riichiCount += 1;
              if (hasOpen) summary.agari.openCount += 1;
              if (riichiInfo.hasRiichi && riichiInfo.hasKnownWaitShape && riichiInfo.isRyanmenWait){
                summary.riichi.ryanmenAgariCount += 1;
                if (winType === "tsumo") summary.riichi.ryanmenTsumoAgariCount += 1;
              }
              if (riichiInfo.hasRiichi && riichiInfo.hasKnownWaitShape && riichiInfo.isGukeiWait){
                summary.riichi.gukeiAgariCount += 1;
                if (winType === "tsumo") summary.riichi.gukeiTsumoAgariCount += 1;
              }

              const detailSource = entry || settlement;
              const isDamaAgari = isDamaAgariByContext(detailSource, riichiInfo, hasOpen);
              if (isDamaAgari) summary.agari.damaCount += 1;

              const point = getSeatAgariPoint(settlement, seatIndex);
              if (Number.isFinite(point) && point > 0){
                agariPointList.push(point);
                summary.availability.pointDataCount += 1;
                if (riichiInfo.hasRiichi) agariPointRiichiList.push(point);
                if (hasOpen) agariPointOpenList.push(point);
                if (isDamaAgari) agariPointDamaList.push(point);
                if (winType === "tsumo") agariPointTsumoList.push(point);
                if (winType === "ron") agariPointRonList.push(point);
                if (point >= 8000) summary.agari.manganOrMoreCount += 1;
              }

              const agariChipDelta = getSeatChipDelta(settlement, seatIndex);
              if (Number.isFinite(agariChipDelta)){
                agariChipCountList.push(Math.abs(agariChipDelta));
              }

              const yakuKeys = listYakuKeys(detailSource);
              const seatWindCode = getSeatWindCodeForAnalysis(kyoku, seatIndex);
              const roundWindCode = getRoundWindCodeForAnalysis(kyoku);
              const hasYakuData = yakuKeys.length > 0 || isYakumanAgariDetail(detailSource);
              if (hasYakuData){
                summary.availability.yakuDataCount += 1;
                if (hasMenzenTsumoYaku(yakuKeys)) agariYakuCompositeCounts.menzenTsumo += 1;
                if (hasDoubleRiichiYaku(yakuKeys)) agariYakuCompositeCounts.doubleRiichi += 1;
                if (hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) agariYakuCompositeCounts.tanyao += 1;
                if (hasAnyYakuKey(yakuKeys, ["pinfu", "平和"])) agariYakuCompositeCounts.pinfu += 1;
                if (hasAnyYakuKey(yakuKeys, ["chiitoitsu", "chiitoi", "七対子"])) agariYakuCompositeCounts.chiitoi += 1;
                if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) agariYakuCompositeCounts.toitoi += 1;
                if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])) agariYakuCompositeCounts.honitsuOrChinitsu += 1;
                if (roundWindCode && hasRoundWindYakuhai(yakuKeys, roundWindCode)) agariYakuCompositeCounts.roundWind += 1;
                if (seatWindCode && hasSeatWindYakuhai(yakuKeys, seatWindCode)) agariYakuCompositeCounts.seatWind += 1;
                if (
                  hasYakuhaiYakuForCode(yakuKeys, "5z")
                  || hasYakuhaiYakuForCode(yakuKeys, "6z")
                  || hasYakuhaiYakuForCode(yakuKeys, "7z")
                ) agariYakuCompositeCounts.dragons += 1;
                if (hasAnyYakuKey(yakuKeys, ["iipeikou", "iipeiko", "一盃口"])) agariYakuCompositeCounts.iipeiko += 1;
                if (hasAnyYakuKey(yakuKeys, ["chanta", "junchan", "混全帯么九", "純全帯么九"])) agariYakuCompositeCounts.chanta += 1;
                if (hasAnyYakuKey(yakuKeys, ["ittsuu", "ittsu", "ikkitsuukan", "一気通貫"])) agariYakuCompositeCounts.ittsu += 1;
                if (isYakumanAgariDetail(detailSource)) agariYakuCompositeCounts.yakuman += 1;
              }

              const doraCount = countDoraFromDetail(detailSource);
              if (Number.isFinite(doraCount)){
                agariDoraCounts.push(doraCount);
                summary.availability.doraDataCount += 1;
              }
            } else if (isSeatHojuSettlement(settlement, seatIndex)){
              summary.hoju.count += 1;

              const hojuEntries = getHojuEntriesForSeat(settlement, seatIndex);
              if (hojuEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === eastSeatIndex)) summary.hoju.dealerWinnerCount += 1;
              if (isHojuToRiichiWinner(kyoku, settlement, hojuEntries)) summary.hoju.riichiCount += 1;
              if (isHojuToOpenWinner(kyoku, hojuEntries)) summary.hoju.openCount += 1;

              const hojuPoint = getSeatHojuPoint(settlement, seatIndex);
              if (Number.isFinite(hojuPoint) && hojuPoint > 0){
                hojuPointList.push(hojuPoint);
                summary.availability.hojuPointDataCount += 1;
              }

              const tenpaiSeats = safeArray(settlement.tenpaiSeats);
              if (tenpaiSeats.length){
                summary.availability.hojuTenpaiDataCount += 1;
                if (tenpaiSeats.includes(seatIndex)) summary.hoju.tenpaiCount += 1;
              }
            } else if (isSeatHitByTsumo(settlement, seatIndex)){
              summary.hitByTsumo.count += 1;
              const point = getSeatHitByTsumoPoint(settlement, seatIndex);
              if (Number.isFinite(point) && point > 0) hitByTsumoPointList.push(point);
            } else if (isSeatHorizontalMoveSettlement(settlement, seatIndex)){
              summary.horizontal.count += 1;
            }
          }

          if (settlement && settlement.type === "ryukyoku"){
            summary.ryukyoku.count += 1;
            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            if (tenpaiSeats.includes(seatIndex)) summary.ryukyoku.tenpaiCount += 1;
          }
        });
      });
    });

    const sampleKyokuCount = summary.overall.sampleKyokuCount;
    summary.riichi.rate = rate(summary.riichi.count, sampleKyokuCount);
    summary.riichi.averageJunme = averageFrom(riichiJunmes);
    summary.riichi.averagePoint = averageFrom(agariPointRiichiList);
    summary.riichi.averageWaitTypeCount = averageFrom(riichiWaitTypeCounts);
    summary.riichi.averageWaitTileCount = averageFrom(riichiWaitTileCounts);
    summary.riichi.ryanmenRate = rate(summary.riichi.ryanmenCount, summary.riichi.waitShapeKnownCount);
    summary.riichi.ryanmenAgariRate = rate(summary.riichi.ryanmenAgariCount, summary.riichi.ryanmenCount);
    summary.riichi.ryanmenTsumoAgariRate = rate(summary.riichi.ryanmenTsumoAgariCount, summary.riichi.ryanmenCount);
    summary.riichi.gukeiRate = rate(summary.riichi.gukeiCount, summary.riichi.waitShapeKnownCount);
    summary.riichi.gukeiAgariRate = rate(summary.riichi.gukeiAgariCount, summary.riichi.gukeiCount);
    summary.riichi.gukeiTsumoAgariRate = rate(summary.riichi.gukeiTsumoAgariCount, summary.riichi.gukeiCount);
    summary.riichi.averageCountPerMatch = summary.scope.includedMatchCount > 0 ? (summary.riichi.count / summary.scope.includedMatchCount) : null;

    summary.open.rate = rate(summary.open.count, sampleKyokuCount);
    summary.open.averageOpenCountWhenOpened = averageFrom(openCountInOpenSamples);

    summary.agari.rate = rate(summary.agari.count, sampleKyokuCount);
    summary.agari.tsumoRate = rate(summary.agari.tsumoCount, summary.agari.count);
    summary.agari.ronRate = rate(summary.agari.ronCount, summary.agari.count);
    summary.agari.dealerRate = rate(summary.agari.dealerCount, summary.agari.count);
    summary.agari.riichiRate = rate(summary.agari.riichiCount, summary.agari.count);
    summary.agari.openRate = rate(summary.agari.openCount, summary.agari.count);
    summary.agari.damaRate = rate(summary.agari.damaCount, summary.agari.count);
    summary.agari.riichiAgariRate = rate(summary.agari.riichiCount, summary.riichi.count);
    summary.agari.openAgariRate = rate(summary.agari.openCount, summary.open.count);
    summary.agari.damaAgariRate = rate(summary.agari.damaCount, finalDamaTenpaiCount);
    summary.agari.averagePoint = averageFrom(agariPointList);
    summary.agari.averagePointRiichi = averageFrom(agariPointRiichiList);
    summary.agari.averagePointOpen = averageFrom(agariPointOpenList);
    summary.agari.averagePointDama = averageFrom(agariPointDamaList);
    summary.agari.averagePointTsumo = averageFrom(agariPointTsumoList);
    summary.agari.averagePointRon = averageFrom(agariPointRonList);
    summary.agari.manganOrMoreRate = rate(summary.agari.manganOrMoreCount, agariPointList.length);
    summary.agari.averageDoraCount = averageFrom(agariDoraCounts);
    Object.keys(summary.agari.yakuCompositeRates).forEach((key)=> {
      summary.agari.yakuCompositeRates[key] = rate(agariYakuCompositeCounts[key], summary.availability.yakuDataCount);
    });

    summary.hoju.rate = rate(summary.hoju.count, sampleKyokuCount);
    summary.hoju.dealerWinnerRate = rate(summary.hoju.dealerWinnerCount, summary.hoju.count);
    summary.hoju.riichiRate = rate(summary.hoju.riichiCount, summary.hoju.count);
    summary.hoju.openRate = rate(summary.hoju.openCount, summary.hoju.count);
    summary.hoju.averagePoint = averageFrom(hojuPointList);
    summary.hoju.tenpaiRate = rate(summary.hoju.tenpaiCount, summary.availability.hojuTenpaiDataCount);

    summary.hitByTsumo.rate = rate(summary.hitByTsumo.count, sampleKyokuCount);
    summary.hitByTsumo.averagePoint = averageFrom(hitByTsumoPointList);

    summary.horizontal.rate = rate(summary.horizontal.count, sampleKyokuCount);

    summary.ryukyoku.rate = rate(summary.ryukyoku.count, sampleKyokuCount);
    summary.ryukyoku.tenpaiRate = rate(summary.ryukyoku.tenpaiCount, summary.ryukyoku.count);

    summary.nagashi.rate = rate(summary.nagashi.count, summary.overall.kyokuCount);

    summary.overall.averageKyokuCountPerMatch = summary.scope.includedMatchCount > 0 ? (summary.overall.kyokuCount / summary.scope.includedMatchCount) : null;
    summary.overall.averageJunmePerKyoku = averageFrom(kyokuReachedJunmes);
    summary.overall.horizontalRate = summary.horizontal.rate;
    summary.overall.averagePoint = summary.agari.averagePoint;
    summary.overall.averageAgariChipCount = averageFrom(agariChipCountList);
    summary.overall.averageRank1Score = averageFrom(rank1ScoreList);
    summary.overall.averageRank2Score = averageFrom(rank2ScoreList);
    summary.overall.averageRank3Score = averageFrom(rank3ScoreList);
    summary.overall.averageHojuPoint = summary.hoju.averagePoint;
    summary.overall.averageHitByTsumoPoint = summary.hitByTsumo.averagePoint;
    summary.overall.averageDoraCount = summary.agari.averageDoraCount;

    return summary;
  }

  function buildRecordsSummary(storedLogs, filters){
    const normalizedFilters = normalizeRecordsFilters(filters);
    const completedLogs = getCompletedLogs(storedLogs);
    const limitedLogs = getLimitedLogs(completedLogs, normalizedFilters.limit);
    const seatIndex = 0;

    const summary = {
      filters: cloneObject(normalizedFilters),
      scope: {
        completedMatchCount: completedLogs.length,
        limitedMatchCount: limitedLogs.length,
        includedMatchCount: 0,
        kyokuCount: 0
      },
      matchCounts: {
        included: 0,
        normal: 0,
        batch: 0,
        unknown: 0,
        local: 0,
        account: 0
      },
      overview: {
        totalScore: null,
        averageScore: null,
        totalChip: null,
        averageChip: null,
        averageRank: null,
        rank1Rate: null,
        rank2Rate: null,
        rank3Rate: null,
        totalKyokuDelta: null,
        averageKyokuDelta: null,
        totalFinalPoint: null,
        averageFinalPoint: null
      },
      rates: {
        riichi: null,
        open: null,
        agari: null,
        hoju: null,
        hitByTsumo: null,
        horizontal: null,
        ryukyoku: null
      },
      agari: {
        count: 0,
        tsumoCount: 0,
        dealerCount: 0,
        riichiCount: 0,
        openCount: 0,
        damaCount: 0,
        averageIncome: null,
        averagePoint: null,
        averagePointTsumo: null,
        averagePointRon: null,
        manganOrMoreRate: null,
        averageDoraCount: null,
        averageChipGainPerAgari: null,
        yakuCompositeRates: {
          tanyao: null,
          pinfu: null,
          chiitoi: null,
          toitoi: null,
          honitsuOrChinitsu: null,
          yakuhaiTon: null,
          yakuhaiNan: null,
          yakuhaiSha: null,
          yakuhaiHaku: null,
          yakuhaiHatsu: null,
          yakuhaiChun: null
        }
      },
      hoju: {
        count: 0,
        dealerWinnerRate: null,
        riichiRate: null,
        openRate: null,
        averageLoss: null,
        averagePoint: null,
        averagePointWhenRiichi: null,
        tenpaiRate: null
      },
      hitByTsumo: {
        count: 0,
        averageLoss: null,
        averagePoint: null
      },
      horizontal: {
        count: 0
      },
      ryukyoku: {
        count: 0,
        tenpaiRate: null
      },
      chip: {
        total: null,
        average: null,
        averageGainPerAgari: null,
        averageLossPerNonAgari: null
      },
      firstRiichiStats: {
        ryanmen: finalizeOutcomeBucket(buildOutcomeBucket()),
        gukei: finalizeOutcomeBucket(buildOutcomeBucket())
      },
      conditions: {
        agariPointByNukiDora: {
          "0": null,
          "1": null,
          "2+": null
        },
        agariPointByRiichi: {
          riichi: null,
          nonRiichi: null
        },
        agariPointBySome: {
          honitsuMenzen: null,
          honitsuOpen: null
        },
        agariPointByKuitan: {
          kuitan: null
        },
        agariPointByToitoi: {
          toitoi: null
        }
      },
      graphs: {
        scoreTrend: [],
        cumulativeScoreTrend: [],
        chipTrend: [],
        rankDistribution: [
          { label: "1着", value: 0 },
          { label: "2着", value: 0 },
          { label: "3着", value: 0 }
        ],
        kyokuDeltaTrend: [],
        kyokuDeltaHistogram: []
      },
      latestMatch: null,
      matches: [],
      availability: {
        matchScoreCount: 0,
        matchChipCount: 0,
        matchRankCount: 0,
        pointDataCount: 0,
        yakuDataCount: 0,
        doraDataCount: 0,
        chipDeltaDataCount: 0,
        riichiPointDataCount: 0,
        openJunmeTenpaiRate: null
      },
      notes: {
        openJunmeTenpaiRate: "巡目別副露時テンパイ率は、現行ログに副露巡目の保存が足りないため未対応です。"
      }
    };

    const matchScoreList = [];
    const matchChipList = [];
    const matchRankList = [];
    const finalPointList = [];
    const kyokuDeltaList = [];

    const agariIncomeList = [];
    const agariPointList = [];
    const agariPointTsumoList = [];
    const agariPointRonList = [];
    const agariDoraList = [];
    const agariChipGainList = [];
    const nonAgariChipLossPerKyoku = [];
    const hojuLossList = [];
    const hojuPointList = [];
    const hojuPointRiichiList = [];
    const hitByTsumoLossList = [];
    const hitByTsumoPointList = [];
    const ryukyokuTenpaiFlags = [];
    const hojuTenpaiFlags = [];

    const yakuCompositeCounts = {
      tanyao: 0,
      pinfu: 0,
      chiitoi: 0,
      toitoi: 0,
      honitsuOrChinitsu: 0,
      yakuhaiTon: 0,
      yakuhaiNan: 0,
      yakuhaiSha: 0,
      yakuhaiHaku: 0,
      yakuhaiHatsu: 0,
      yakuhaiChun: 0
    };

    const firstRyanmenBucket = buildOutcomeBucket();
    const firstGukeiBucket = buildOutcomeBucket();

    const conditionAgariPointMap = {
      pei0: [],
      pei1: [],
      pei2Plus: [],
      riichi: [],
      nonRiichi: [],
      honitsuMenzen: [],
      honitsuOpen: [],
      kuitan: [],
      toitoi: []
    };

    limitedLogs.forEach((log)=> {
      const matchMode = getMatchMode(log);
      const sessionMode = getSessionMode(log);
      if (matchMode !== "normal") return;
      if (normalizedFilters.sessionMode !== "all" && sessionMode !== normalizedFilters.sessionMode) return;

      summary.scope.includedMatchCount += 1;
      summary.matchCounts.included += 1;
      summary.matchCounts[matchMode] = (summary.matchCounts[matchMode] || 0) + 1;
      summary.matchCounts[sessionMode] = (summary.matchCounts[sessionMode] || 0) + 1;

      const matchInfo = getMatchSummaryInfo(log, seatIndex);
      const matchKyokuCount = safeArray(log && log.kyokus).length;
      const matchKyokuDeltas = [];

      if (Number.isFinite(matchInfo.score)){
        matchScoreList.push(matchInfo.score);
        summary.availability.matchScoreCount += 1;
      }
      if (Number.isFinite(matchInfo.chips)){
        matchChipList.push(matchInfo.chips);
        summary.availability.matchChipCount += 1;
      }
      if (Number.isFinite(matchInfo.rank)){
        matchRankList.push(matchInfo.rank);
        summary.availability.matchRankCount += 1;
        const idx = Math.max(0, Math.min(2, matchInfo.rank - 1));
        summary.graphs.rankDistribution[idx].value += 1;
      }
      if (Number.isFinite(matchInfo.finalPoint)){
        finalPointList.push(matchInfo.finalPoint);
      }

      safeArray(log && log.kyokus).forEach((kyoku)=> {
        const settlement = getSettlement(kyoku);
        if (!settlement) return;

        const delta = safeNumber(safeArray(settlement.delta)[seatIndex], 0);
        const riichiInfo = getRiichiInfoBySeat(kyoku, seatIndex);
        const openCount = getOpenEventCountBySeat(kyoku, seatIndex);
        const hasOpen = openCount > 0;
        const isAgari = isSeatAgariSettlement(settlement, seatIndex);
        const isHoju = isSeatHojuSettlement(settlement, seatIndex);
        const isHitByTsumo = isSeatHitByTsumo(settlement, seatIndex);
        const isHorizontal = isSeatHorizontalMoveSettlement(settlement, seatIndex);
        const chipDelta = getSeatChipDelta(settlement, seatIndex);

        summary.scope.kyokuCount += 1;
        kyokuDeltaList.push(delta);
        matchKyokuDeltas.push(delta);
        summary.graphs.kyokuDeltaTrend.push({
          label: getRoundNumberLabel(kyoku),
          value: delta
        });

        if (riichiInfo.hasRiichi) summary.rates.riichi = null;
        if (hasOpen) summary.rates.open = null;

        const firstRiichiCategory = getFirstRiichiCategoryForSeat(kyoku, seatIndex);
        const agariPoint = getSeatAgariPoint(settlement, seatIndex);
        if (firstRiichiCategory === "first_ryanmen_riichi"){
          pushOutcomeToBucket(firstRyanmenBucket, settlement, seatIndex, delta, agariPoint);
        } else if (firstRiichiCategory === "first_gukei_riichi"){
          pushOutcomeToBucket(firstGukeiBucket, settlement, seatIndex, delta, agariPoint);
        }

        if (riichiInfo.hasRiichi){
          summary.matchCounts.riichiCount = safeNumber(summary.matchCounts.riichiCount, 0) + 1;
        }
        if (hasOpen){
          summary.matchCounts.openCount = safeNumber(summary.matchCounts.openCount, 0) + 1;
        }

        if (isAgari){
          summary.agari.count += 1;
          if (delta > 0) agariIncomeList.push(delta);
          if (Number.isFinite(chipDelta)){
            agariChipGainList.push(Math.max(0, chipDelta));
            summary.availability.chipDeltaDataCount += 1;
          }

          const entry = getAgariEntriesForSeat(settlement, seatIndex)[0] || settlement;
          const winType = String(entry && entry.winType || settlement.winType || "");
          if (winType === "tsumo") summary.agari.tsumoCount += 1;
          if (isDealerSeat(kyoku, seatIndex)) summary.agari.dealerCount += 1;
          if (riichiInfo.hasRiichi) summary.agari.riichiCount += 1;
          if (hasOpen) summary.agari.openCount += 1;
          if (!riichiInfo.hasRiichi && !hasOpen) summary.agari.damaCount += 1;

          if (Number.isFinite(agariPoint) && agariPoint > 0){
            agariPointList.push(agariPoint);
            summary.availability.pointDataCount += 1;
            if (winType === "tsumo") agariPointTsumoList.push(agariPoint);
            if (winType === "ron") agariPointRonList.push(agariPoint);
            if (agariPoint >= 8000) summary.agari.manganOrMoreCount = safeNumber(summary.agari.manganOrMoreCount, 0) + 1;
          }

          const detailSource = entry || settlement;
          const yakuKeys = listYakuKeys(detailSource);
          const bonus = detailSource && detailSource.bonus && typeof detailSource.bonus === "object" ? detailSource.bonus : null;
          const nukiDora = getBonusNukiDoraCount(bonus);
          const totalDora = bonus ? (
            safeNumber(bonus.dora, 0)
            + safeNumber(bonus.uraDora, 0)
            + getBonusColorDoraCount(bonus)
            + getBonusNukiDoraCount(bonus)
          ) : null;

          if (Number.isFinite(totalDora)){
            agariDoraList.push(totalDora);
            summary.availability.doraDataCount += 1;
          }

          if (yakuKeys.length){
            summary.availability.yakuDataCount += 1;
            if (hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) yakuCompositeCounts.tanyao += 1;
            if (hasAnyYakuKey(yakuKeys, ["pinfu", "平和"])) yakuCompositeCounts.pinfu += 1;
            if (hasAnyYakuKey(yakuKeys, ["chiitoitsu", "chiitoi", "七対子"])) yakuCompositeCounts.chiitoi += 1;
            if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) yakuCompositeCounts.toitoi += 1;
            if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])) yakuCompositeCounts.honitsuOrChinitsu += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_ton", "東", "役牌 東", "役牌(東)"])) yakuCompositeCounts.yakuhaiTon += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_nan", "南", "役牌 南", "役牌(南)"])) yakuCompositeCounts.yakuhaiNan += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_sha", "西", "役牌 西", "役牌(西)"])) yakuCompositeCounts.yakuhaiSha += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_haku", "白", "役牌 白", "役牌(白)"])) yakuCompositeCounts.yakuhaiHaku += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_hatsu", "發", "発", "役牌 發", "役牌 発", "役牌(發)", "役牌(発)"])) yakuCompositeCounts.yakuhaiHatsu += 1;
            if (hasAnyYakuKey(yakuKeys, ["yakuhai_chun", "中", "役牌 中", "役牌(中)"])) yakuCompositeCounts.yakuhaiChun += 1;
          }

          if (Number.isFinite(agariPoint) && agariPoint > 0){
            if (nukiDora <= 0) conditionAgariPointMap.pei0.push(agariPoint);
            else if (nukiDora === 1) conditionAgariPointMap.pei1.push(agariPoint);
            else conditionAgariPointMap.pei2Plus.push(agariPoint);

            if (riichiInfo.hasRiichi) conditionAgariPointMap.riichi.push(agariPoint);
            else conditionAgariPointMap.nonRiichi.push(agariPoint);

            if (hasAnyYakuKey(yakuKeys, ["honitsu", "chinitsu", "混一色", "清一色"])){
              if (hasOpen) conditionAgariPointMap.honitsuOpen.push(agariPoint);
              else conditionAgariPointMap.honitsuMenzen.push(agariPoint);
            }

            if (hasOpen && hasAnyYakuKey(yakuKeys, ["tanyao", "断么九"])) conditionAgariPointMap.kuitan.push(agariPoint);
            if (hasAnyYakuKey(yakuKeys, ["toitoi", "対々和"])) conditionAgariPointMap.toitoi.push(agariPoint);
          }
        } else {
          if (Number.isFinite(chipDelta)){
            nonAgariChipLossPerKyoku.push(Math.max(0, -chipDelta));
            summary.availability.chipDeltaDataCount += 1;
          } else {
            nonAgariChipLossPerKyoku.push(0);
          }

          if (isHoju){
            summary.hoju.count += 1;
            hojuLossList.push(Math.abs(delta));
            const hojuPoint = getSeatHojuPoint(settlement, seatIndex);
            if (Number.isFinite(hojuPoint) && hojuPoint > 0) hojuPointList.push(hojuPoint);
            if (riichiInfo.hasRiichi){
              summary.hoju.riichiCount = safeNumber(summary.hoju.riichiCount, 0) + 1;
              if (Number.isFinite(hojuPoint) && hojuPoint > 0){
                hojuPointRiichiList.push(hojuPoint);
                summary.availability.riichiPointDataCount += 1;
              }
            }
            if (hasOpen) summary.hoju.openCount = safeNumber(summary.hoju.openCount, 0) + 1;

            const hojuEntries = getHojuEntriesForSeat(settlement, seatIndex);
            if (hojuEntries.some((entry)=> Number(entry && entry.winnerSeatIndex) === getEastSeatIndex(kyoku))){
              summary.hoju.dealerWinnerCount = safeNumber(summary.hoju.dealerWinnerCount, 0) + 1;
            }

            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            if (tenpaiSeats.length) hojuTenpaiFlags.push(tenpaiSeats.includes(seatIndex) ? 1 : 0);
          } else if (isHitByTsumo){
            summary.hitByTsumo.count += 1;
            hitByTsumoLossList.push(Math.abs(delta));
            const point = getSeatHitByTsumoPoint(settlement, seatIndex);
            if (Number.isFinite(point) && point > 0) hitByTsumoPointList.push(point);
          } else if (isHorizontal){
            summary.horizontal.count += 1;
          } else if (settlement.type === "ryukyoku"){
            summary.ryukyoku.count += 1;
            const tenpaiSeats = safeArray(settlement.tenpaiSeats);
            ryukyokuTenpaiFlags.push(tenpaiSeats.includes(seatIndex) ? 1 : 0);
          }
        }
      });

      const avgKyokuDelta = averageFrom(matchKyokuDeltas);
      const matchRow = {
        matchId: String(log && log.matchId || ""),
        endedAt: String(log && log.endedAt || ""),
        kyokuCount: matchKyokuCount,
        rank: matchInfo.rank,
        score: matchInfo.score,
        chips: matchInfo.chips,
        finalPoint: matchInfo.finalPoint,
        averageKyokuDelta: avgKyokuDelta
      };
      summary.matches.push(matchRow);

      if (summary.matches.length === 1){
        summary.latestMatch = cloneObject(matchRow);
      }

      summary.graphs.scoreTrend.push({
        label: matchRow.endedAt,
        value: Number.isFinite(matchRow.score) ? matchRow.score : null
      });

      summary.graphs.chipTrend.push({
        label: matchRow.endedAt,
        value: Number.isFinite(matchRow.chips) ? matchRow.chips : null
      });
    });

    let runningScore = 0;
    summary.graphs.scoreTrend.forEach((item)=> {
      if (!Number.isFinite(item.value)) return;
      runningScore += item.value;
      summary.graphs.cumulativeScoreTrend.push({
        label: item.label,
        value: runningScore
      });
    });

    const histogramBuckets = [
      { min: -Infinity, max: -4000, label: "-4000以下", count: 0 },
      { min: -4000, max: -2000, label: "-4000〜-2001", count: 0 },
      { min: -2000, max: -1000, label: "-2000〜-1001", count: 0 },
      { min: -1000, max: 0, label: "-1000〜-1", count: 0 },
      { min: 0, max: 1000, label: "0〜999", count: 0 },
      { min: 1000, max: 2000, label: "1000〜1999", count: 0 },
      { min: 2000, max: 4000, label: "2000〜3999", count: 0 },
      { min: 4000, max: Infinity, label: "4000以上", count: 0 }
    ];

    kyokuDeltaList.forEach((value)=> {
      histogramBuckets.forEach((bucket)=> {
        if (value >= bucket.min && value < bucket.max){
          bucket.count += 1;
        }
      });
    });

    summary.graphs.kyokuDeltaHistogram = histogramBuckets.map((bucket)=> ({
      label: bucket.label,
      value: bucket.count
    }));

    summary.overview.totalScore = matchScoreList.length ? sumFrom(matchScoreList) : null;
    summary.overview.averageScore = averageFrom(matchScoreList);
    summary.overview.totalChip = matchChipList.length ? sumFrom(matchChipList) : null;
    summary.overview.averageChip = averageFrom(matchChipList);
    summary.overview.averageRank = averageFrom(matchRankList);
    summary.overview.rank1Rate = rate(matchRankList.filter((value)=> value === 1).length, matchRankList.length);
    summary.overview.rank2Rate = rate(matchRankList.filter((value)=> value === 2).length, matchRankList.length);
    summary.overview.rank3Rate = rate(matchRankList.filter((value)=> value === 3).length, matchRankList.length);
    summary.overview.totalKyokuDelta = kyokuDeltaList.length ? sumFrom(kyokuDeltaList) : null;
    summary.overview.averageKyokuDelta = averageFrom(kyokuDeltaList);
    summary.overview.totalFinalPoint = finalPointList.length ? sumFrom(finalPointList) : null;
    summary.overview.averageFinalPoint = averageFrom(finalPointList);

    const kyokuCount = summary.scope.kyokuCount;
    const riichiCount = safeNumber(summary.matchCounts.riichiCount, 0);
    const openCount = safeNumber(summary.matchCounts.openCount, 0);
    summary.rates.riichi = rate(riichiCount, kyokuCount);
    summary.rates.open = rate(openCount, kyokuCount);
    summary.rates.agari = rate(summary.agari.count, kyokuCount);
    summary.rates.hoju = rate(summary.hoju.count, kyokuCount);
    summary.rates.hitByTsumo = rate(summary.hitByTsumo.count, kyokuCount);
    summary.rates.horizontal = rate(summary.horizontal.count, kyokuCount);
    summary.rates.ryukyoku = rate(summary.ryukyoku.count, kyokuCount);

    summary.agari.tsumoRate = rate(summary.agari.tsumoCount, summary.agari.count);
    summary.agari.dealerRate = rate(summary.agari.dealerCount, summary.agari.count);
    summary.agari.riichiRate = rate(summary.agari.riichiCount, summary.agari.count);
    summary.agari.openRate = rate(summary.agari.openCount, summary.agari.count);
    summary.agari.damaRate = rate(summary.agari.damaCount, summary.agari.count);
    summary.agari.averageIncome = averageFrom(agariIncomeList);
    summary.agari.averagePoint = averageFrom(agariPointList);
    summary.agari.averagePointTsumo = averageFrom(agariPointTsumoList);
    summary.agari.averagePointRon = averageFrom(agariPointRonList);
    summary.agari.manganOrMoreRate = rate(safeNumber(summary.agari.manganOrMoreCount, 0), agariPointList.length);
    summary.agari.averageDoraCount = averageFrom(agariDoraList);
    summary.agari.averageChipGainPerAgari = averageFrom(agariChipGainList);
    Object.keys(summary.agari.yakuCompositeRates).forEach((key)=> {
      summary.agari.yakuCompositeRates[key] = rate(yakuCompositeCounts[key], summary.availability.yakuDataCount);
    });

    summary.hoju.dealerWinnerRate = rate(safeNumber(summary.hoju.dealerWinnerCount, 0), summary.hoju.count);
    summary.hoju.riichiRate = rate(safeNumber(summary.hoju.riichiCount, 0), summary.hoju.count);
    summary.hoju.openRate = rate(safeNumber(summary.hoju.openCount, 0), summary.hoju.count);
    summary.hoju.averageLoss = averageFrom(hojuLossList);
    summary.hoju.averagePoint = averageFrom(hojuPointList);
    summary.hoju.averagePointWhenRiichi = averageFrom(hojuPointRiichiList);
    summary.hoju.tenpaiRate = rate(sumFrom(hojuTenpaiFlags), hojuTenpaiFlags.length);

    summary.hitByTsumo.averageLoss = averageFrom(hitByTsumoLossList);
    summary.hitByTsumo.averagePoint = averageFrom(hitByTsumoPointList);

    summary.ryukyoku.tenpaiRate = rate(sumFrom(ryukyokuTenpaiFlags), ryukyokuTenpaiFlags.length);

    summary.chip.total = summary.overview.totalChip;
    summary.chip.average = summary.overview.averageChip;
    summary.chip.averageGainPerAgari = averageFrom(agariChipGainList);
    summary.chip.averageLossPerNonAgari = averageFrom(nonAgariChipLossPerKyoku);

    summary.firstRiichiStats.ryanmen = finalizeOutcomeBucket(firstRyanmenBucket);
    summary.firstRiichiStats.gukei = finalizeOutcomeBucket(firstGukeiBucket);

    summary.conditions.agariPointByNukiDora["0"] = averageFrom(conditionAgariPointMap.pei0);
    summary.conditions.agariPointByNukiDora["1"] = averageFrom(conditionAgariPointMap.pei1);
    summary.conditions.agariPointByNukiDora["2+"] = averageFrom(conditionAgariPointMap.pei2Plus);
    summary.conditions.agariPointByRiichi.riichi = averageFrom(conditionAgariPointMap.riichi);
    summary.conditions.agariPointByRiichi.nonRiichi = averageFrom(conditionAgariPointMap.nonRiichi);
    summary.conditions.agariPointBySome.honitsuMenzen = averageFrom(conditionAgariPointMap.honitsuMenzen);
    summary.conditions.agariPointBySome.honitsuOpen = averageFrom(conditionAgariPointMap.honitsuOpen);
    summary.conditions.agariPointByKuitan.kuitan = averageFrom(conditionAgariPointMap.kuitan);
    summary.conditions.agariPointByToitoi.toitoi = averageFrom(conditionAgariPointMap.toitoi);

    return summary;
  }

  global.MBSanmaLogMetrics = {
    summarizeLogs,
    normalizeAnalysisFilters,
    normalizeRecordsFilters,
    buildAnalysisSummary,
    buildRecordsSummary,
    listAnalysisRuleSetOptions
  };
})(window);
