// MBsanma/js/turn.js
// ========= turn.js（ターン制：進行の司令塔） =========

// 0=自分(下) / 1=右CPU / 2=左CPU
let currentTurnSeatIndex = 0;

// "DISCARD" | "CALL_DISCARD"
let turnPhase = "DISCARD";

// ★ 通常速度の基準値（高速モードON時は main.js の速度設定を参照）
const CPU_TURN_DELAY_MS = 500;
const PLAYER_TURN_DRAW_DELAY_MS = 500;
const PLAYER_AUTO_DISCARD_DELAY_MS = 650;
const PLAYER_SPECIAL_ACTION_DELAY_MS = 520;

function getTurnSpeedMs(key, fallback){
  try{
    if (typeof getGameSpeedMs === "function"){
      return getGameSpeedMs(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getCpuTurnDelayMs(){
  return getTurnSpeedMs("cpuTurnDelayMs", CPU_TURN_DELAY_MS);
}

function getPlayerTurnDrawDelayMs(){
  return getTurnSpeedMs("playerTurnDrawDelayMs", PLAYER_TURN_DRAW_DELAY_MS);
}

function getPlayerAutoDiscardDelayMs(){
  return getTurnSpeedMs("playerAutoDiscardDelayMs", PLAYER_AUTO_DISCARD_DELAY_MS);
}

function getPlayerSpecialActionDelayMs(){
  return getTurnSpeedMs("playerSpecialActionDelayMs", PLAYER_SPECIAL_ACTION_DELAY_MS);
}

let playerDrawTimer = null;
let playerAutoDiscardTimer = null;
let playerSpecialActionTimer = null;
let cpuTurnLoopRunning = false;

function forceClearCpuTurnLoopGuard(){
  cpuTurnLoopRunning = false;
}

function clearPlayerAutoDiscardTimer(){
  if (playerAutoDiscardTimer){
    clearTimeout(playerAutoDiscardTimer);
    playerAutoDiscardTimer = null;
  }
}

function clearPlayerSpecialAiTimer(){
  if (playerSpecialActionTimer){
    clearTimeout(playerSpecialActionTimer);
    playerSpecialActionTimer = null;
  }
}


function getCpuRiichiWaitCodesForLog(concealedTiles, fixedMeldCount){
  if (!Array.isArray(concealedTiles)) return [];
  if (typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return [];
  if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function") return [];

  const out = [];
  const seen = new Set();
  for (const code of TILE_TYPES){
    if (!code || seen.has(code)) continue;
    seen.add(code);
    try{
      const tiles14 = concealedTiles.slice();
      tiles14.push({ code });
      if (calcShanten(countsFromTiles(tiles14), fixedMeldCount) === -1){
        out.push(code);
      }
    }catch(e){}
  }
  return out;
}

function getCpuPatternPairCodeForLog(pattern){
  const src = pattern && typeof pattern === "object" ? pattern : null;
  if (!src) return null;

  const candidates = [src.pair, src.pairCode, src.head, src.janto, src.toitsu, src.eyes];
  for (const candidate of candidates){
    if (!candidate) continue;
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object"){
      if (typeof candidate.code === "string") return candidate.code;
      if (Array.isArray(candidate.tiles) && candidate.tiles.length > 0){
        const tile0 = candidate.tiles[0];
        if (typeof tile0 === "string") return tile0;
        if (tile0 && typeof tile0.code === "string") return tile0.code;
      }
    }
    if (Array.isArray(candidate) && candidate.length > 0){
      const tile0 = candidate[0];
      if (typeof tile0 === "string") return tile0;
      if (tile0 && typeof tile0.code === "string") return tile0.code;
    }
  }

  return null;
}

function isCpuTripletMeldTypeForLog(type){
  const value = String(type || "").toLowerCase();
  return value === "koutsu" || value === "anko" || value === "pon" || value === "triplet";
}

function getCpuShuntsuSubtypeForLog(meldCode, waitCode){
  const meld = String(meldCode || "");
  const wait = String(waitCode || "");
  if (meld.length < 2 || wait.length < 2) return "";

  const suit = meld.slice(-1);
  const start = Number(meld.slice(0, -1));
  const waitNum = Number(wait.slice(0, -1));
  if (!Number.isInteger(start) || !Number.isInteger(waitNum)) return "";
  if (wait.slice(-1) !== suit) return "";

  if (waitNum === start + 1) return "kanchan";

  if (waitNum === start){
    if (start === 7) return "penchan";
    if (start >= 1 && start <= 6) return "ryanmen";
  }

  if (waitNum === start + 2){
    if (start === 1) return "penchan";
    if (start >= 2 && start <= 7) return "ryanmen";
  }

  return "";
}

function getCpuRepresentativeWaitTypeKeyForLog(rawKeys){
  const keys = rawKeys instanceof Set ? rawKeys : new Set(Array.isArray(rawKeys) ? rawKeys : []);
  if (keys.has("ryanmen")) return "ryanmen";
  if (keys.has("kanchan")) return "kanchan";
  if (keys.has("penchan")) return "penchan";
  if (keys.has("shabo")) return "shabo";
  if (keys.has("tanki")) return "tanki";
  return "";
}

function getCpuNonStandardWaitTypeKeyForLog(concealedTiles, waitCode, fixedMeldCount = 0){
  if (!waitCode) return "";
  if ((fixedMeldCount | 0) > 0) return "";
  if (typeof countsFromTiles !== "function") return "";

  try{
    const tiles14 = Array.isArray(concealedTiles) ? concealedTiles.slice() : [];
    tiles14.push({ code: waitCode });
    const counts14 = countsFromTiles(tiles14);

    const isChiitoiAgari = (typeof calcShantenChiitoi === "function")
      ? (calcShantenChiitoi(counts14) === -1)
      : false;
    const isKokushiAgari = (typeof calcShantenKokushi === "function")
      ? (calcShantenKokushi(counts14, fixedMeldCount) === -1)
      : false;

    if (!isChiitoiAgari && !isKokushiAgari) return "";

    const sameCodeCount = Array.isArray(concealedTiles)
      ? concealedTiles.reduce((sum, tile)=> sum + ((tile && tile.code === waitCode) ? 1 : 0), 0)
      : 0;

    if (sameCodeCount >= 1) return "tanki";
  }catch(e){}

  return "";
}

function getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode, fixedMeldCount = 0){
  const raw = new Set();
  if (!waitCode) return raw;
  if (typeof countsFromTiles !== "function") return raw;
  if (typeof findStandardAgariPatternsFromCounts !== "function") return raw;

  try{
    const tiles14 = Array.isArray(concealedTiles) ? concealedTiles.slice() : [];
    tiles14.push({ code: waitCode });
    const patterns = findStandardAgariPatternsFromCounts(countsFromTiles(tiles14));

    for (const pattern of (Array.isArray(patterns) ? patterns : [])){
      const pairCode = getCpuPatternPairCodeForLog(pattern);
      if (pairCode === waitCode) raw.add("tanki");

      const meldsInPattern = Array.isArray(pattern && pattern.melds) ? pattern.melds : [];
      for (const meld of meldsInPattern){
        if (!meld || !meld.code) continue;

        if (isCpuTripletMeldTypeForLog(meld.type) && meld.code === waitCode){
          raw.add("shabo");
          continue;
        }

        if (meld.type !== "shuntsu") continue;
        const subtype = getCpuShuntsuSubtypeForLog(meld.code, waitCode);
        if (subtype) raw.add(subtype);
      }
    }
  }catch(e){}

  const representative = getCpuRepresentativeWaitTypeKeyForLog(raw);
  if (representative){
    return new Set([representative]);
  }

  const fallback = getCpuNonStandardWaitTypeKeyForLog(concealedTiles, waitCode, fixedMeldCount);
  if (fallback){
    return new Set([fallback]);
  }

  return raw;
}

function getCpuRyanmenCapableWaitCodesForLog(concealedTiles, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes : [];
  if (!waits.length) return [];

  const out = [];
  const seen = new Set();

  for (const waitCode of waits){
    if (!waitCode || seen.has(waitCode)) continue;
    const keys = getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode);
    if (keys.has("ryanmen")){
      seen.add(waitCode);
      out.push(waitCode);
    }
  }

  return out;
}

function getCpuNMenchanKeyForWaitCountForLog(waitCount){
  const count = Number(waitCount) || 0;
  if (count <= 0) return "";
  if (count === 4) return "4menchan";
  if (count === 5) return "5menchan";
  if (count === 6) return "6menchan";
  if (count === 7) return "7menchan";
  if (count === 8) return "8menchan";
  if (count >= 9) return count + "menchan";
  return "";
}

function classifyCpuWaitTypeKeysForLog(concealedTiles, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes.filter(Boolean) : [];
  if (!waits.length) return [];

  if (waits.length >= 4){
    const nMenchanKey = getCpuNMenchanKeyForWaitCountForLog(waits.length);
    return nMenchanKey ? [nMenchanKey] : ["other"];
  }

  let ryanmenCount = 0;
  let hasOther = false;
  const gukeiKeys = new Set();

  for (const waitCode of waits){
    const keys = getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(concealedTiles, waitCode, fixedMeldCount);
    const representative = getCpuRepresentativeWaitTypeKeyForLog(keys);

    if (representative === "ryanmen"){
      ryanmenCount++;
      continue;
    }

    if (representative === "tanki" || representative === "shabo" || representative === "kanchan" || representative === "penchan"){
      gukeiKeys.add(representative);
      continue;
    }

    hasOther = true;
  }

  const out = [];
  const isTankiOnlyMultiWait = !hasOther && ryanmenCount === 0 && gukeiKeys.size === 1 && gukeiKeys.has("tanki") && waits.length >= 2;

  if (ryanmenCount >= 2){
    if (!hasOther && gukeiKeys.size === 0 && ryanmenCount === waits.length){
      if (waits.length === 2){
        out.push("ryanmen");
      } else if (waits.length === 3){
        out.push("sanmenchan");
      } else {
        out.push("multi_ryanmen");
      }
    } else {
      out.push("multi_ryanmen");
    }
  } else if (isTankiOnlyMultiWait){
    if (waits.length === 2){
      out.push("ryanmen");
    } else if (waits.length === 3){
      out.push("sanmenchan");
    } else {
      out.push("multi_ryanmen");
    }
  }

  ["tanki", "shabo", "kanchan", "penchan"].forEach((key)=> {
    if (gukeiKeys.has(key) && !(isTankiOnlyMultiWait && key === "tanki")){
      out.push(key);
    }
  });

  if (!out.length || hasOther){
    out.push("other");
  }

  return out;
}

function isCpuRiichiRyanmenWaitForLog(concealedTiles, fixedMeldCount, waitCodes){
  const keys = classifyCpuWaitTypeKeysForLog(concealedTiles, fixedMeldCount, waitCodes);
  return keys.includes("ryanmen") || keys.includes("sanmenchan") || keys.includes("multi_ryanmen") || keys.some((key)=> /^\d+menchan$/.test(String(key || "")));
}

function buildCpuRiichiTenpaiDetailForLog(seatIndex, concealedTiles, fixedMeldCount){
  const tiles13 = Array.isArray(concealedTiles) ? concealedTiles.slice() : [];
  const waitCodes = getCpuRiichiWaitCodesForLog(tiles13, fixedMeldCount);

  let waitTileCount = 0;
  try{
    if (typeof countVisibleForCpuSeat === "function" && typeof TYPE_TO_IDX === "object"){
      const visibleCounts = countVisibleForCpuSeat(seatIndex, tiles13);
      for (const code of waitCodes){
        const idx = TYPE_TO_IDX[code];
        if (idx === undefined) continue;
        waitTileCount += Math.max(0, 4 - (Number(visibleCounts[idx]) || 0));
      }
    }
  }catch(e){}

  if (!Number.isFinite(waitTileCount) || waitTileCount <= 0){
    waitTileCount = waitCodes.length;
  }

  const waitTypeKeys = classifyCpuWaitTypeKeysForLog(tiles13, fixedMeldCount, waitCodes);
  const isRyanmenWait = waitTypeKeys.includes("ryanmen") || waitTypeKeys.includes("sanmenchan") || waitTypeKeys.includes("multi_ryanmen") || waitTypeKeys.some((key)=> /^\d+menchan$/.test(String(key || "")));

  return {
    waitTileCount,
    waitTypeCount: Array.isArray(waitCodes) ? waitCodes.length : 0,
    isRyanmenWait,
    waitTypeKeys,
    waitCodes: waitCodes.slice()
  };
}

function pushCpuRiichiEventForLog(seatIndex, discardedTile, concealedTiles, fixedMeldCount, riverRef){
  try{
    if (typeof window === "undefined" || !window.MBSanmaMatchLog || typeof window.MBSanmaMatchLog.pushEvent !== "function") return;

    const tenpai = buildCpuRiichiTenpaiDetailForLog(seatIndex, concealedTiles, fixedMeldCount);
    const tileLike = discardedTile && discardedTile.code
      ? (window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedTile) : { code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code })
      : null;

    window.MBSanmaMatchLog.pushEvent("riichi", {
      seatIndex,
      junme: Array.isArray(riverRef) ? riverRef.length : 0,
      tile: tileLike,
      tenpai
    });
  }catch(e){}
}

function getPlayerDiscardAiProfileOverride(){
  try{
    if (typeof buildCpuDiscardInternalProfileFromExternalStyle === "function"){
      return buildCpuDiscardInternalProfileFromExternalStyle("balanced");
    }
  }catch(e){}
  return "balanced";
}

function recordPlayerDiscardAiDecisionMeta(decision, source){
  const meta = {
    source: String(source || ""),
    discardCode: decision && decision.discardCode ? String(decision.discardCode) : "",
    reasonTag: decision && decision.reasonTag ? String(decision.reasonTag) : "",
    reasonTags: Array.isArray(decision && decision.reasonTags) ? decision.reasonTags.slice() : [],
    engineMode: decision && decision.meta && decision.meta.engineMode ? String(decision.meta.engineMode) : "internal",
    at: Date.now()
  };

  try{
    if (typeof window !== "undefined"){
      window.__lastPlayerDiscardAiDecisionMeta = meta;
      if (typeof window.dispatchEvent === "function"){
        window.dispatchEvent(new CustomEvent("mbsanma:player-discard-ai-decision", {
          detail: meta
        }));
      }
    }
  }catch(e){}

  return meta;
}

function getPlayerAiRiichiSeatIndexes(){
  const out = [];
  try{ if (typeof isRiichi !== "undefined" && isRiichi) out.push(0); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(1)) out.push(1); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(2)) out.push(2); }catch(e){}
  return out;
}

function addPlayerAiVisibleTileCounts(counts, tilesLike){
  if (!Array.isArray(counts) || !Array.isArray(tilesLike)) return;
  for (const tile of tilesLike){
    if (!tile || !tile.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[tile.code];
    if (idx === undefined) continue;
    counts[idx] += 1;
  }
}

function addPlayerAiVisibleMeldCounts(counts, meldList){
  if (!Array.isArray(counts) || !Array.isArray(meldList)) return;
  for (const meld of meldList){
    if (!meld || !meld.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[meld.code];
    if (idx === undefined) continue;
    const kind = meld.type || "pon";
    counts[idx] += (kind === "ankan" || kind === "minkan" || kind === "kakan") ? 4 : 3;
  }
}

function buildPlayerDiscardAiVisibleCounts(afterTiles){
  const counts = Array.isArray(TILE_TYPES) ? Array(TILE_TYPES.length).fill(0) : [];
  addPlayerAiVisibleTileCounts(counts, afterTiles);
  addPlayerAiVisibleTileCounts(counts, river);
  addPlayerAiVisibleTileCounts(counts, cpuRightRiver);
  addPlayerAiVisibleTileCounts(counts, cpuLeftRiver);
  addPlayerAiVisibleTileCounts(counts, peis);
  try{ if (Array.isArray(cpuRightPeis)) addPlayerAiVisibleTileCounts(counts, cpuRightPeis); }catch(e){}
  try{ if (Array.isArray(cpuLeftPeis)) addPlayerAiVisibleTileCounts(counts, cpuLeftPeis); }catch(e){}
  if (Array.isArray(doraIndicators)) addPlayerAiVisibleTileCounts(counts, doraIndicators);
  addPlayerAiVisibleMeldCounts(counts, melds);
  try{ if (Array.isArray(cpuRightMelds)) addPlayerAiVisibleMeldCounts(counts, cpuRightMelds); }catch(e){}
  try{ if (Array.isArray(cpuLeftMelds)) addPlayerAiVisibleMeldCounts(counts, cpuLeftMelds); }catch(e){}
  return counts;
}

function buildPlayerDiscardAiSnapshot(){
  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const candidates = [];
  const inCallDiscard = (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD");
  const forbiddenCode = (typeof getPlayerForbiddenCallDiscardCode === "function") ? getPlayerForbiddenCallDiscardCode() : null;

  if (inCallDiscard){
    const baseTiles = Array.isArray(hand13) ? hand13.slice() : [];
    for (let i = 0; i < baseTiles.length; i++){
      const discardTile = baseTiles[i];
      if (!discardTile || !discardTile.code) continue;
      if (forbiddenCode && discardTile.code === forbiddenCode) continue;

      const after13 = baseTiles.slice();
      after13.splice(i, 1);
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile,
        discardIndex: i,
        discardTileId: discardTile.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: false,
        willRiichi: false
      });
    }
  } else {
    const baseTiles = Array.isArray(hand13) ? hand13.slice() : [];
    for (let i = 0; i < baseTiles.length; i++){
      const discardTile = baseTiles[i];
      if (!discardTile || !discardTile.code) continue;

      const after13 = baseTiles.slice();
      after13.splice(i, 1);
      if (drawn) after13.push(drawn);
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile,
        discardIndex: i,
        discardTileId: discardTile.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: false,
        willRiichi: false
      });
    }

    if (drawn){
      const after13 = baseTiles.slice();
      const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
      const shantenAfter = counts13 && typeof calcShanten === "function" ? calcShanten(counts13, fixedMeldCount) : 99;
      const visibleCounts = buildPlayerDiscardAiVisibleCounts(after13);
      const improveCount = (counts13 && typeof countCpuImproveTiles === "function")
        ? countCpuImproveTiles(0, counts13, visibleCounts, fixedMeldCount)
        : 0;

      candidates.push({
        discardTile: drawn,
        discardIndex: baseTiles.length,
        discardTileId: drawn.id,
        after13,
        shantenAfter,
        improveCount,
        isDrawnDiscard: true,
        willRiichi: false
      });
    }
  }

  return {
    seatIndex: 0,
    candidates,
    round: {
      doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : []
    },
    table: {
      rivers: {
        0: Array.isArray(river) ? river.slice() : [],
        1: Array.isArray(cpuRightRiver) ? cpuRightRiver.slice() : [],
        2: Array.isArray(cpuLeftRiver) ? cpuLeftRiver.slice() : []
      },
      melds: {
        0: Array.isArray(melds) ? melds.slice() : [],
        1: (typeof cpuRightMelds !== "undefined" && Array.isArray(cpuRightMelds)) ? cpuRightMelds.slice() : [],
        2: (typeof cpuLeftMelds !== "undefined" && Array.isArray(cpuLeftMelds)) ? cpuLeftMelds.slice() : []
      },
      peis: {
        0: Array.isArray(peis) ? peis.slice() : [],
        1: (typeof cpuRightPeis !== "undefined" && Array.isArray(cpuRightPeis)) ? cpuRightPeis.slice() : [],
        2: (typeof cpuLeftPeis !== "undefined" && Array.isArray(cpuLeftPeis)) ? cpuLeftPeis.slice() : []
      },
      riichiSeatIndexes: getPlayerAiRiichiSeatIndexes()
    }
  };
}

function getPlayerDiscardAiDecision(snapshot){
  if (!snapshot || !Array.isArray(snapshot.candidates) || snapshot.candidates.length <= 0) return null;

  try{
    if (typeof buildCpuDiscardShadowDecision === "function"){
      const decision = buildCpuDiscardShadowDecision(snapshot, getPlayerDiscardAiProfileOverride());
      if (decision && decision.action === "discard"){
        decision.executionSource = decision.executionSource || "internal_eval";
        decision.decisionSource = decision.decisionSource || "internal_eval";
        recordPlayerDiscardAiDecisionMeta(decision, "internal_eval");
        return decision;
      }
    }
  }catch(e){}

  if (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD"){
    try{
      if (typeof chooseCpuCallDiscardInfo === "function"){
        const info = chooseCpuCallDiscardInfo(0, hand13, Array.isArray(melds) ? melds.length : 0, {
          forbiddenDiscardCode: (typeof getPlayerForbiddenCallDiscardCode === "function") ? getPlayerForbiddenCallDiscardCode() : null
        });
        if (info && info.discardTile){
          const decision = {
            action: "discard",
            discardTileId: info.discardTile.id,
            discardIndex: info.discardIndex,
            discardCode: info.discardTile.code,
            executionSource: "call_discard_fallback",
            decisionSource: "call_discard_fallback"
          };
          recordPlayerDiscardAiDecisionMeta(decision, "call_discard_fallback");
          return decision;
        }
      }
    }catch(e){}
    return null;
  }

  try{
    if (typeof chooseCpuDiscardInfoLegacy === "function"){
      const info = chooseCpuDiscardInfoLegacy(0, hand13, drawn);
      if (info && info.discardTile){
        const decision = {
          action: "discard",
          discardTileId: info.discardTile.id,
          discardIndex: info.discardIndex,
          discardCode: info.discardTile.code,
          executionSource: "legacy",
          decisionSource: "legacy"
        };
        recordPlayerDiscardAiDecisionMeta(decision, "legacy");
        return decision;
      }
    }
  }catch(e){}

  return null;
}

function executePlayerDiscardAiDecision(decision){
  if (!decision || decision.action !== "discard") return false;

  const tileId = decision.discardTileId;
  if (drawn && drawn.id === tileId){
    discardDrawn();
    return true;
  }

  if (Array.isArray(hand13)){
    const idxById = hand13.findIndex((tile)=> tile && tile.id === tileId);
    if (idxById >= 0){
      discardFromHand13(idxById);
      return true;
    }

    if (typeof decision.discardIndex === "number" && decision.discardIndex >= 0 && decision.discardIndex < hand13.length){
      discardFromHand13(decision.discardIndex);
      return true;
    }
  }

  return false;
}

function buildPlayerRiichiAiSnapshot(){
  if (typeof computeRiichiDiscardCandidates !== "function") return null;

  const allowed = computeRiichiDiscardCandidates();
  if (!(allowed instanceof Set) || allowed.size <= 0) return null;

  const snapshot = buildPlayerDiscardAiSnapshot();
  if (!snapshot || !Array.isArray(snapshot.candidates)) return null;

  snapshot.candidates = snapshot.candidates.filter((candidate)=>{
    if (!candidate || candidate.discardTileId == null) return false;
    const key = candidate.isDrawnDiscard ? `D:${candidate.discardTileId}` : `H:${candidate.discardTileId}`;
    return allowed.has(key);
  });

  return snapshot.candidates.length > 0 ? snapshot : null;
}

function getPlayerRiichiAiDecision(){
  const snapshot = buildPlayerRiichiAiSnapshot();
  if (!snapshot) return null;
  return getPlayerDiscardAiDecision(snapshot);
}

function getPlayerAiSeatWind(){
  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  if (dealer === 0) return "東";
  if (dealer === 1) return "西";
  return "南";
}

function getPlayerAiDoraCodeFromIndicator(code){
  try{
    if (typeof getDoraCodeFromIndicatorForYaku === "function"){
      return getDoraCodeFromIndicatorForYaku(code);
    }
  }catch(e){}
  return code;
}

function isPlayerAiYakuhaiLikeCode(code){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = getPlayerAiSeatWind();
  if (seatWind === "東" && code === "1z") return true;
  if (seatWind === "南" && code === "2z") return true;
  if (seatWind === "西" && code === "3z") return true;

  if (typeof roundWind !== "undefined"){
    if (roundWind === "東" && code === "1z") return true;
    if (roundWind === "南" && code === "2z") return true;
    if (roundWind === "西" && code === "3z") return true;
  }

  return false;
}

function estimatePlayerRiichiAiValueScore(candidate){
  const after13 = (candidate && Array.isArray(candidate.after13)) ? candidate.after13 : [];
  if (after13.length <= 0) return {
    doraCount: 0,
    peiCount: 0,
    yakuhaiPairCount: 0,
    score: 0
  };

  let doraCount = 0;
  const indicators = Array.isArray(doraIndicators) ? doraIndicators : [];
  for (const indicator of indicators){
    const indicatorCode = indicator && indicator.code ? indicator.code : null;
    if (!indicatorCode) continue;
    const doraCode = getPlayerAiDoraCodeFromIndicator(indicatorCode);
    for (const tile of after13){
      if (tile && tile.code === doraCode) doraCount++;
    }
  }

  const peiCount = Array.isArray(peis) ? peis.length : 0;

  const counts = (typeof countsFromTiles === "function") ? countsFromTiles(after13) : null;
  let yakuhaiPairCount = 0;
  if (Array.isArray(counts) && Array.isArray(TILE_TYPES)){
    for (let i = 0; i < TILE_TYPES.length; i++){
      const code = TILE_TYPES[i];
      if (!isPlayerAiYakuhaiLikeCode(code)) continue;
      if ((counts[i] | 0) >= 2) yakuhaiPairCount++;
    }
  }

  return {
    doraCount,
    peiCount,
    yakuhaiPairCount,
    score: doraCount + peiCount + yakuhaiPairCount
  };
}

function getPlayerRiichiAiDecisionDetail(){
  const snapshot = buildPlayerRiichiAiSnapshot();
  if (!snapshot) return null;

  const decision = getPlayerDiscardAiDecision(snapshot);
  if (!decision || decision.action !== "discard") return null;

  const candidate = snapshot.candidates.find((item)=>{
    if (!item) return false;
    if (decision.discardTileId != null && item.discardTileId === decision.discardTileId) return true;
    if (decision.discardIndex != null && item.discardIndex === decision.discardIndex) return true;
    return false;
  }) || null;

  return {
    snapshot,
    decision,
    candidate
  };
}

function shouldPlayerAiRiichiNow(detail){
  const info = detail && detail.candidate ? detail.candidate : null;
  if (!info) return true;

  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const waitTileCount = Number(info.improveCount) || 0;
  const waitTypeCount = (typeof countTenpaiWaitTypeCount === "function")
    ? countTenpaiWaitTypeCount(info.after13, fixedMeldCount)
    : 0;
  const valueInfo = estimatePlayerRiichiAiValueScore(info);

  const veryBadWait = waitTypeCount <= 1 && waitTileCount <= 3;
  const decentValue = (valueInfo.score >= 2);

  return !(veryBadWait && decentValue);
}

function canPlayerSpecialAiActNow(){
  return (typeof isPlayerSpecialAiEnabled === "function") && isPlayerSpecialAiEnabled();
}

function hasPendingPlayerSpecialAiAction(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if ((typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) || ((typeof isRiichiTypeSelectingActive === "function") && isRiichiTypeSelectingActive())) return false;

  try{
    if (typeof canUseTsumoButtonNow === "function" && canUseTsumoButtonNow() && typeof canTsumoAgariNow === "function" && canTsumoAgariNow()){
      return true;
    }
  }catch(e){}

  try{
    if (typeof canUsePeiButtonNow === "function" && canUsePeiButtonNow() && typeof hasNorthInHand === "function" && hasNorthInHand()){
      return true;
    }
  }catch(e){}

  try{
    if (
      !isRiichi &&
      !(Array.isArray(melds) && melds.length > 0) &&
      typeof canUseRiichiButtonNow === "function" &&
      canUseRiichiButtonNow() &&
      typeof hasRiichiDiscardCandidateNow === "function" &&
      hasRiichiDiscardCandidateNow()
    ){
      return true;
    }
  }catch(e){}

  return false;
}

function tryExecutePlayerRiichiAiNow(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (isRiichi) return false;
  if (Array.isArray(melds) && melds.length > 0) return false;
  if (typeof canUseRiichiButtonNow !== "function" || !canUseRiichiButtonNow()) return false;
  if (typeof hasRiichiDiscardCandidateNow !== "function" || !hasRiichiDiscardCandidateNow()) return false;

  const detail = getPlayerRiichiAiDecisionDetail();
  if (!detail || !detail.decision){
    return false;
  }

  if (!shouldPlayerAiRiichiNow(detail)){
    return false;
  }

  if (typeof doRiichi === "function"){
    doRiichi("normal");
  }
  if (!(typeof isRiichiSelecting !== "undefined" && isRiichiSelecting)) return false;

  return executePlayerDiscardAiDecision(detail.decision);
}

function tryExecutePlayerSpecialAiNow(){
  if (!canPlayerSpecialAiActNow()) return false;
  if (isEnded) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if ((typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) || ((typeof isRiichiTypeSelectingActive === "function") && isRiichiTypeSelectingActive())) return false;

  try{
    if (typeof canUseTsumoButtonNow === "function" && canUseTsumoButtonNow() && typeof canTsumoAgariNow === "function" && canTsumoAgariNow()){
      if (typeof setPostAgariStageToOverlay === "function"){
        setPostAgariStageToOverlay();
      }
      if (typeof openTsumo === "function"){
        openTsumo();
        return true;
      }
    }
  }catch(e){}

  try{
    if (typeof canUsePeiButtonNow === "function" && canUsePeiButtonNow() && typeof hasNorthInHand === "function" && hasNorthInHand()){
      if (typeof doPei === "function"){
        doPei();
      }else if (typeof peiBtn !== "undefined" && peiBtn && typeof peiBtn.click === "function"){
        peiBtn.click();
      }else{
        return false;
      }

      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
      return true;
    }
  }catch(e){}

  const riichiActed = tryExecutePlayerRiichiAiNow();
  if (riichiActed) return true;

  return tryExecutePlayerDiscardAiNow();
}

function maybeSchedulePlayerSpecialAiAction(forceReschedule = false){
  if (forceReschedule) clearPlayerSpecialAiTimer();
  if (playerSpecialActionTimer) return;
  if (!hasPendingPlayerSpecialAiAction()) return;

  const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
  playerSpecialActionTimer = setTimeout(()=>{
    playerSpecialActionTimer = null;
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

    const acted = tryExecutePlayerSpecialAiNow();
    if (acted) return;

    if (typeof schedulePlayerAutoDiscardIfNeeded === "function"){
      schedulePlayerAutoDiscardIfNeeded(true);
    }
  }, getPlayerSpecialActionDelayMs());
}

function tryExecutePlayerDiscardAiNow(){
  if (isEnded) return false;
  if (typeof isPlayerDiscardAiEnabled === "function" && !isPlayerDiscardAiEnabled()) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if ((typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) || ((typeof isRiichiTypeSelectingActive === "function") && isRiichiTypeSelectingActive())) return false;
  if (typeof isRiichi !== "undefined" && isRiichi) return false;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
  if (typeof turnPhase !== "undefined" && turnPhase === "DISCARD" && !drawn) return false;

  const snapshot = buildPlayerDiscardAiSnapshot();
  const decision = getPlayerDiscardAiDecision(snapshot);
  return executePlayerDiscardAiDecision(decision);
}

function schedulePlayerAutoDiscardIfNeeded(forceReschedule = false){
  if (forceReschedule) clearPlayerAutoDiscardTimer();
  if (playerAutoDiscardTimer) return;
  if (isEnded) return;
  if (typeof pendingCall !== "undefined" && pendingCall) return;
  if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex !== 0) return;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return;
  if ((typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) || ((typeof isRiichiTypeSelectingActive === "function") && isRiichiTypeSelectingActive())) return;
  if (typeof turnPhase !== "undefined" && turnPhase === "DISCARD" && !drawn) return;

  if (typeof isRiichi !== "undefined" && isRiichi){
    if (typeof scheduleRiichiAuto === "function") scheduleRiichiAuto();
    return;
  }

  if (typeof hasPendingPlayerSpecialAiAction === "function" && hasPendingPlayerSpecialAiAction()){
    if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(forceReschedule);
    return;
  }

  if (typeof isPlayerDiscardAiEnabled === "function" && !isPlayerDiscardAiEnabled()) return;

  const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
  playerAutoDiscardTimer = setTimeout(()=>{
    playerAutoDiscardTimer = null;
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
    // ★ 検証モード一時停止中は実行しない。再開時に再スケジュール。
    if (typeof isVerifyRunPaused === "function" && isVerifyRunPaused()){
      if (typeof onVerifyRunResumed === "function"){
        onVerifyRunResumed(()=>{
          if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
          schedulePlayerAutoDiscardIfNeeded(true);
        });
      }
      return;
    }
    tryExecutePlayerDiscardAiNow();
  }, getPlayerAutoDiscardDelayMs());
}

function isPlayerSeat(seatIndex){
  return seatIndex === 0;
}
function isCpuRightSeat(seatIndex){
  return seatIndex === 1;
}
function isCpuLeftSeat(seatIndex){
  return seatIndex === 2;
}

function nextSeatIndexOf(seatIndex){
  return (seatIndex + 1) % 3;
}

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve, ms));
}

function endRyukyokuFromTurnIfPossible(){
  if (typeof endByExhaustionRyukyoku === "function"){
    endByExhaustionRyukyoku();
    return;
  }
  if (!isEnded){
    isEnded = true;
    hoveredTileId = null;
    render();
    if (typeof openRyukyoku === "function") openRyukyoku();
  }
}

function clearPlayerDrawTimer(){
  if (playerDrawTimer){
    clearTimeout(playerDrawTimer);
    playerDrawTimer = null;
  }
  clearPlayerAutoDiscardTimer();
  clearPlayerSpecialAiTimer();
}

// ★ call.js から呼ぶ：鳴き後の「ツモ無し打牌」へ強制切替
function forceEnterPlayerCallDiscardTurn(){
  clearPlayerDrawTimer();
  currentTurnSeatIndex = 0;
  turnPhase = "CALL_DISCARD";
  drawn = null; // 鳴き直後はツモ無し
  schedulePlayerAutoDiscardIfNeeded(true);
}

function initTurnForKyokuStart(){
  clearPlayerDrawTimer();

  if (typeof resetCpuExtraState === "function"){
    resetCpuExtraState();
  }

  currentTurnSeatIndex = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  turnPhase = "DISCARD";

  // CPU親開始のときはプレイヤーの drawn は必ず空に
  if (currentTurnSeatIndex !== 0){
    drawn = null;
  }

  hoveredTileId = null;
  render();

  if (currentTurnSeatIndex === 0){
    schedulePlayerAutoDiscardIfNeeded(true);
  }

  // ★ 局開始直後にCPU親なら、確実にCPUが捨てて始まるように回す（初手だけ即時）
  if (!(typeof __suspendCpuAutoKick !== "undefined" && __suspendCpuAutoKick)){
    kickCpuTurnsIfNeeded(true);
  }
}

function isPlayerTurn(){
  if (isEnded) return false;
  return currentTurnSeatIndex === 0 && (turnPhase === "DISCARD" || turnPhase === "CALL_DISCARD");
}

// ★ ポン後の「ツモ無し打牌」か？
function isPlayerCallDiscardTurn(){
  if (isEnded) return false;
  return currentTurnSeatIndex === 0 && turnPhase === "CALL_DISCARD";
}

function ensurePlayerHasDrawnOnTurnStart(){
  // ★ 鳴き直後（ツモ無し打牌）はツモらない
  if (!isPlayerTurn()) return;
  if (isPlayerCallDiscardTurn()) return;

  const wallExhausted = (typeof isWallExhaustedForDraw === "function")
    ? isWallExhaustedForDraw()
    : ((Array.isArray(wall) ? wall.length : 0) === 0);
  if (wallExhausted){
    endRyukyokuFromTurnIfPossible();
    return;
  }

  if (!drawn){
    drawn = drawOne();
    try{
      if (drawn && typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("draw", {
          seatIndex: 0,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawn) : { code: drawn.code, imgCode: drawn.imgCode || drawn.code },
          source: "wall"
        });
      }
    }catch(e){}
    hoveredTileId = null;
    render();
  }

  if (!isEnded && isRiichi && typeof scheduleRiichiAuto === "function"){
    scheduleRiichiAuto();
  }

  schedulePlayerAutoDiscardIfNeeded(true);
}

function schedulePlayerDrawOnTurnStart(){
  clearPlayerDrawTimer();

  // ★ 鳴き直後（ツモ無し打牌）はツモタイマー不要
  if (isPlayerCallDiscardTurn()){
    schedulePlayerAutoDiscardIfNeeded(true);
    return;
  }

  if (drawn) return;

  playerDrawTimer = setTimeout(()=>{
    playerDrawTimer = null;

    if (isEnded) return;
    if (!isPlayerTurn()) return;

    ensurePlayerHasDrawnOnTurnStart();
  }, getPlayerTurnDrawDelayMs());
}

function getDangerousOpenRiichiSeatIndexesForCpuDiscard(seatIndex){
  if (typeof getDangerousOpenRiichiSeatIndexes !== "function") return [];
  const list = getDangerousOpenRiichiSeatIndexes(seatIndex);
  return Array.isArray(list) ? list.filter((targetSeat)=> targetSeat !== seatIndex) : [];
}

function isCpuDiscardUnsafeAgainstDangerousOpenRiichi(tile, seatIndex){
  if (!tile || !tile.code) return false;

  const targetSeats = getDangerousOpenRiichiSeatIndexesForCpuDiscard(seatIndex);
  for (const targetSeat of targetSeats){
    try{
      if (typeof window !== "undefined" && typeof window.isTileCodeActuallyDealingIntoSeatOpenRiichi === "function"){
        if (window.isTileCodeActuallyDealingIntoSeatOpenRiichi(tile.code, targetSeat)) return true;
        continue;
      }
    }catch(e){}

    try{
      if (typeof isTileCodeDealingIntoSeatOpenRiichi === "function" && isTileCodeDealingIntoSeatOpenRiichi(tile.code, targetSeat)){
        return true;
      }
    }catch(e){}
  }
  return false;
}

function buildCpuSafeDiscardCandidateAgainstDangerousOpenRiichi(seatIndex, hand13, drawnTile){
  const targetSeats = getDangerousOpenRiichiSeatIndexesForCpuDiscard(seatIndex);
  if (targetSeats.length <= 0) return null;
  if (!Array.isArray(hand13) || !drawnTile || !drawnTile.code) return null;

  const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
    ? getCpuFixedMeldCountBySeat(seatIndex)
    : 0;

  const candidates = [];

  for (let i = 0; i < hand13.length; i++){
    const discardTile = hand13[i];
    if (!discardTile || !discardTile.code) continue;
    if (isCpuDiscardUnsafeAgainstDangerousOpenRiichi(discardTile, seatIndex)) continue;

    const after13 = hand13.slice();
    after13.splice(i, 1);
    after13.push(drawnTile);

    let shantenAfter = 99;
    let improveCount = 0;
    try{
      const counts = countsFromTiles(after13);
      shantenAfter = calcShanten(counts, fixedMeldCount);
      if (typeof countVisibleForCpuSeat === "function" && typeof countCpuImproveTiles === "function") {
        const visibleCounts = countVisibleForCpuSeat(seatIndex, after13);
        improveCount = countCpuImproveTiles(seatIndex, counts, visibleCounts, fixedMeldCount);
      }
    }catch(e){}

    candidates.push({
      discardTile,
      after13,
      shantenAfter,
      improveCount,
      preserveOrder: false,
      willRiichi: false,
      decisionSource: "open_riichi_guard"
    });
  }

  if (!isCpuDiscardUnsafeAgainstDangerousOpenRiichi(drawnTile, seatIndex)){
    const after13 = hand13.slice();
    let shantenAfter = 99;
    let improveCount = 0;
    try{
      const counts = countsFromTiles(after13);
      shantenAfter = calcShanten(counts, fixedMeldCount);
      if (typeof countVisibleForCpuSeat === "function" && typeof countCpuImproveTiles === "function") {
        const visibleCounts = countVisibleForCpuSeat(seatIndex, after13);
        improveCount = countCpuImproveTiles(seatIndex, counts, visibleCounts, fixedMeldCount);
      }
    }catch(e){}

    candidates.push({
      discardTile: drawnTile,
      after13,
      shantenAfter,
      improveCount,
      preserveOrder: false,
      willRiichi: false,
      decisionSource: "open_riichi_guard"
    });
  }

  if (candidates.length <= 0) return null;

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++){
    const cur = candidates[i];
    if ((cur.shantenAfter | 0) < (best.shantenAfter | 0)){
      best = cur;
      continue;
    }
    if ((cur.shantenAfter | 0) > (best.shantenAfter | 0)) continue;

    if ((cur.improveCount | 0) > (best.improveCount | 0)){
      best = cur;
      continue;
    }
    if ((cur.improveCount | 0) < (best.improveCount | 0)) continue;

    const bestCode = best.discardTile && best.discardTile.code ? best.discardTile.code : "";
    const curCode = cur.discardTile && cur.discardTile.code ? cur.discardTile.code : "";
    if (curCode > bestCode){
      best = cur;
    }
  }

  return best;
}

function isCpuOpenRiichiRuleEnabledForTurn(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return String(window.MBSanmaRulesConfig.getValue("extra-open-riichi", "off") || "").toLowerCase() === "on";
    }
  }catch(e){}
  return false;
}

function getCpuSeatScoreForOpenRiichiDecision(seatIndex){
  if (!Array.isArray(scores)) return 0;
  return Number(scores[seatIndex]) || 0;
}

function countCpuProspectiveRiichiWaitTileCount(seatIndex, concealedTiles13, declareDiscardTile){
  const waitCodes = getCpuRiichiWaitCodesForLog(concealedTiles13, (typeof getCpuFixedMeldCountBySeat === "function") ? getCpuFixedMeldCountBySeat(seatIndex) : 0);
  if (!Array.isArray(waitCodes) || waitCodes.length <= 0) return { waitCodes: [], waitTileCount: 0 };
  if (typeof countVisibleForCpuSeat !== "function" || typeof TYPE_TO_IDX === "undefined"){
    return { waitCodes: waitCodes.slice(), waitTileCount: waitCodes.length };
  }

  const visibleCounts = countVisibleForCpuSeat(seatIndex, concealedTiles13);
  let waitTileCount = 0;
  for (const code of waitCodes){
    const idx = TYPE_TO_IDX[code];
    if (idx === undefined) continue;
    let visible = Number(visibleCounts[idx]) || 0;
    if (declareDiscardTile && declareDiscardTile.code === code) visible += 1;
    waitTileCount += Math.max(0, 4 - visible);
  }

  return { waitCodes: waitCodes.slice(), waitTileCount };
}

function isCpuProspectiveRiverFuritenForRiichi(seatIndex, waitCodes, declareDiscardTile){
  if (!Array.isArray(waitCodes) || waitCodes.length <= 0) return false;
  const riverRef = (typeof getCpuRiverRefBySeat === "function") ? getCpuRiverRefBySeat(seatIndex) : null;
  const waitSet = new Set(waitCodes);

  if (Array.isArray(riverRef)){
    for (const tile of riverRef){
      if (tile && tile.code && waitSet.has(tile.code)) return true;
    }
  }

  return !!(declareDiscardTile && declareDiscardTile.code && waitSet.has(declareDiscardTile.code));
}

function shouldCpuDeclareOpenRiichi(seatIndex, concealedTiles13, declareDiscardTile){
  if (!isCpuOpenRiichiRuleEnabledForTurn()) return false;
  if (seatIndex !== 1 && seatIndex !== 2) return false;
  if (!Array.isArray(concealedTiles13) || concealedTiles13.length <= 0) return false;
  if (!declareDiscardTile || !declareDiscardTile.code) return false;
  if (getCpuSeatScoreForOpenRiichiDecision(seatIndex) > 30000) return false;

  const info = countCpuProspectiveRiichiWaitTileCount(seatIndex, concealedTiles13, declareDiscardTile);
  const waitCodes = Array.isArray(info.waitCodes) ? info.waitCodes : [];
  const waitTileCount = Number(info.waitTileCount) || 0;
  if (waitCodes.length <= 0 || waitTileCount <= 0) return false;

  const isFuriten = isCpuProspectiveRiverFuritenForRiichi(seatIndex, waitCodes, declareDiscardTile);
  const threshold = isFuriten ? 6 : 8;
  return waitTileCount >= threshold;
}

function cpuDoOneDiscard(seatIndex){
  if (isEnded) return null;
  if (typeof isCpuSeat === "function" && !isCpuSeat(seatIndex)) return null;

  const hand13 = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
  const riverRef = (typeof getCpuRiverRefBySeat === "function") ? getCpuRiverRefBySeat(seatIndex) : null;

  if (!Array.isArray(hand13) || !Array.isArray(riverRef)) return null;

  let drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;

  if (!drawnTile){
    drawnTile = drawOne();
    if (!drawnTile) return null;

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("draw", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "wall"
        });
      }
    }catch(e){}

    if (typeof setCpuDrawnTileBySeat === "function"){
      setCpuDrawnTileBySeat(seatIndex, drawnTile);
    }
  }

  if (typeof tryCpuPeiSequence === "function"){
    tryCpuPeiSequence(seatIndex);
  }

  if (typeof tryCpuAnkanSequence === "function"){
    const ankanResult = tryCpuAnkanSequence(seatIndex);
    if (isEnded) return null;
    // "prompted" = チャンカンロン確認中（プレイヤーが判断後にkickCpuTurnsIfNeededを呼ぶ）
    // true = アンカン完了・嶺上牌セット済み → そのまま落下して打牌処理へ
    if (ankanResult === "prompted") return null;
  }

  drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : drawnTile;
  if (!drawnTile) return null;

  const tiles14 = hand13.slice();
  tiles14.push(drawnTile);
  const cpuRiichiOnlyMode = (typeof isDebugCpuRiichiOnlyMode === "function") ? isDebugCpuRiichiOnlyMode() : false;

  // ★ CPUはリーチ中かどうかに関係なく、ツモ牌を持った時点で先にツモ和了判定する
  // - これで副露後ダマツモ / 明槓後の嶺上ツモ も拾える
  // - seatIndex を渡して役判定まで行う
  if (!cpuRiichiOnlyMode && typeof canCpuTsumoWithTiles === "function" && canCpuTsumoWithTiles(seatIndex, tiles14)){
    if (typeof finishCpuTsumo === "function"){
      finishCpuTsumo(seatIndex);
    }
    return null;
  }

  if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)){
    drawnTile.isNew = false;
    if (typeof maybeAdoptCpuRiichiDisplayTileBySeat === "function"){
      maybeAdoptCpuRiichiDisplayTileBySeat(seatIndex, drawnTile);
    }
    riverRef.push(drawnTile);

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("discard", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "drawn",
          isTsumogiri: true,
          isRiichiDeclare: false,
          turnPhase: "DISCARD"
        });
      }
    }catch(e){}

    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, false); }catch(e){}

    if (typeof clearCpuDrawnTileBySeat === "function"){
      clearCpuDrawnTileBySeat(seatIndex);
    }

    return drawnTile;
  }

  let best = (typeof chooseCpuDiscardInfo === "function")
    ? chooseCpuDiscardInfo(seatIndex, hand13, drawnTile)
    : null;

  if (!best) {
    const safeBest = buildCpuSafeDiscardCandidateAgainstDangerousOpenRiichi(seatIndex, hand13, drawnTile);
    if (safeBest) best = safeBest;
  } else if (isCpuDiscardUnsafeAgainstDangerousOpenRiichi(best.discardTile, seatIndex)) {
    const safeBest = buildCpuSafeDiscardCandidateAgainstDangerousOpenRiichi(seatIndex, hand13, drawnTile);
    if (safeBest) best = safeBest;
  }

  if (!best || !best.discardTile){
    drawnTile.isNew = false;
    riverRef.push(drawnTile);

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("discard", {
          seatIndex,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawnTile) : { code: drawnTile.code, imgCode: drawnTile.imgCode || drawnTile.code },
          source: "drawn",
          isTsumogiri: true,
          isRiichiDeclare: false,
          turnPhase: "DISCARD"
        });
      }
    }catch(e){}

    if (typeof clearCpuDrawnTileBySeat === "function"){
      clearCpuDrawnTileBySeat(seatIndex);
    }

    return drawnTile;
  }

  const discardedTile = best.discardTile;
  discardedTile.isNew = false;

  const shouldPreserveOrder = !!(
    best.preserveOrder ||
    (typeof isDebugCpuPresetDiscardOrderEnabledBySeat === "function" && isDebugCpuPresetDiscardOrderEnabledBySeat(seatIndex))
  );

  const nextHand13 = shouldPreserveOrder
    ? best.after13.slice()
    : sortHand(best.after13.slice());

  for (const t of nextHand13){
    if (t) t.isNew = false;
  }

  if (typeof setCpuHand13BySeat === "function"){
    setCpuHand13BySeat(seatIndex, nextHand13);
  }

  const shouldUseOpenRiichi = !!(
    best.willRiichi &&
    typeof shouldCpuDeclareOpenRiichi === "function" &&
    shouldCpuDeclareOpenRiichi(seatIndex, nextHand13, discardedTile)
  );

  if (best.willRiichi && typeof setCpuRiichiBySeat === "function"){
    setCpuRiichiBySeat(seatIndex, true);
    if (typeof setCpuOpenRiichiBySeat === "function"){
      setCpuOpenRiichiBySeat(seatIndex, shouldUseOpenRiichi);
    }
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(seatIndex, canDeclareDoubleRiichiNow(seatIndex)); }catch(e){}

    if (typeof setCpuRiichiDeclareTileIdBySeat === "function"){
      setCpuRiichiDeclareTileIdBySeat(seatIndex, discardedTile.id);
    }

    if (typeof openRiichiEffect === "function"){
      try{ openRiichiEffect(seatIndex); }catch(e){}
    }
  }

  if (typeof clearCpuDrawnTileBySeat === "function"){
    clearCpuDrawnTileBySeat(seatIndex);
  }

  if (!best.willRiichi && typeof maybeAdoptCpuRiichiDisplayTileBySeat === "function"){
    maybeAdoptCpuRiichiDisplayTileBySeat(seatIndex, discardedTile);
  }

  riverRef.push(discardedTile);

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedTile) : { code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code },
        source: (drawnTile && discardedTile && drawnTile.id === discardedTile.id) ? "drawn" : "hand",
        isTsumogiri: !!(drawnTile && discardedTile && drawnTile.id === discardedTile.id),
        isRiichiDeclare: !!best.willRiichi,
        turnPhase: "DISCARD"
      });
    }
  }catch(e){}


  if (best.willRiichi){
    pushCpuRiichiEventForLog(seatIndex, discardedTile, nextHand13, (typeof getCpuFixedMeldCountBySeat === "function") ? getCpuFixedMeldCountBySeat(seatIndex) : 0, riverRef);
  }

  try{
    if (best && best.snapshotId != null && typeof updateCpuDiscardDecisionForSnapshot === "function"){
      updateCpuDiscardDecisionForSnapshot(best.snapshotId, {
        status: "executed",
        finalAction: "discard",
        finalDiscardTileId: discardedTile.id,
        finalDiscardCode: discardedTile.code,
        executionSource: best.decisionSource || "unknown",
        willRiichi: !!best.willRiichi
      });
    }
  }catch(e){}

  if (!best.willRiichi && typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(seatIndex, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  return discardedTile;
}

function advanceTurnAfterDiscard(discardSeatIndex){
  if (isEnded) return;

  clearPlayerDrawTimer();

  currentTurnSeatIndex = nextSeatIndexOf(discardSeatIndex);
  turnPhase = "DISCARD";

  if (currentTurnSeatIndex === 0){
    schedulePlayerDrawOnTurnStart();
  }
}

// ★ 引数 immediateFirst = true のとき「最初のCPU捨て」だけ即時にする
async function kickCpuTurnsIfNeeded(immediateFirst = false){
  if (isEnded) return;
  if (cpuTurnLoopRunning) return;

  cpuTurnLoopRunning = true;

  try{
    const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
    let firstStep = true;

    while (!isEnded && currentTurnSeatIndex !== 0 && turnPhase === "DISCARD"){
    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

    // ★ 検証モード一時停止ゲート（verify_run_control.js）
    if (typeof waitWhileVerifyRunPaused === "function"){
      await waitWhileVerifyRunPaused();
      if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
      if (isEnded) return;
    }

    const seat = currentTurnSeatIndex;

    // ★ 局開始の最初の1手目だけ待たない
    if (!(immediateFirst && firstStep)){
      await sleep(getCpuTurnDelayMs());
    }
    firstStep = false;

    if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
    if (isEnded) return;

    const wallExhaustedBeforeDraw = (typeof isWallExhaustedForDraw === "function")
      ? isWallExhaustedForDraw()
      : ((Array.isArray(wall) ? wall.length : 0) === 0);
    if (wallExhaustedBeforeDraw){
      endRyukyokuFromTurnIfPossible();
      return;
    }

    // ===== CPUのツモ牌を一度表示してから捨てる =====
    let cpuDrawnTile =
      (typeof getCpuDrawnTileBySeat === "function")
        ? getCpuDrawnTileBySeat(seat)
        : null;

    if (!cpuDrawnTile){
      cpuDrawnTile = drawOne();
      if (!cpuDrawnTile){
        endRyukyokuFromTurnIfPossible();
        return;
      }

      try{
        if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("draw", {
            seatIndex: seat,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(cpuDrawnTile) : { code: cpuDrawnTile.code, imgCode: cpuDrawnTile.imgCode || cpuDrawnTile.code },
            source: "wall"
          });
        }
      }catch(e){}

      if (typeof setCpuDrawnTileBySeat === "function"){
        setCpuDrawnTileBySeat(seat, cpuDrawnTile);
      }

      hoveredTileId = null;
      render();

      await sleep(getCpuTurnDelayMs());

      if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
      if (isEnded) return;
    }

    // ===== CPUが1枚捨てる =====
    const discardedTile = cpuDoOneDiscard(seat);

    hoveredTileId = null;
    render();

    if (!discardedTile) return;

    // ===== CPU捨て直後に「ロン/ポン」判定 =====
    if (typeof maybePromptCallOnDiscard === "function"){
      const from = isCpuRightSeat(seat) ? "R" : "L";
      const action = await maybePromptCallOnDiscard(from, discardedTile);

      if (action === "ron"){
        // ★ ロンで局終了
        return;
      }

      if (action === "pon"){
        // ★ ここでは「call.js 側で強制切替」される想定だが、
        //    念のため保険でも自分番へ寄せる
        forceEnterPlayerCallDiscardTurn();
        render();
        return;
      }
    }

    const wallExhaustedAfterDiscard = (typeof isWallExhaustedForDraw === "function")
      ? isWallExhaustedForDraw()
      : ((Array.isArray(wall) ? wall.length : 0) === 0);
    if (wallExhaustedAfterDiscard){
      endRyukyokuFromTurnIfPossible();
      return;
    }

      advanceTurnAfterDiscard(seat);

      if (currentTurnSeatIndex === 0) return;
    }
  }finally{
    cpuTurnLoopRunning = false;
  }
}
