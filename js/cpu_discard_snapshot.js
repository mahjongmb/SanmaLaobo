// MBsanma/js/cpu_discard_snapshot.js
// ========= cpu_discard_snapshot.js（CPU打牌snapshot / decision log） =========
// 役割：
// - CPU打牌候補のsnapshotを作る
// - snapshotごとの decision を記録する
// - 外部AI / 内部AI / 旧来ロジックの比較ログ土台を作る
//
// 注意：
// - render を触らない
// - 状態変更はしない

let cpuDiscardSnapshotSeq = 1;
const cpuDiscardDecisionStore = new Map();
const cpuDiscardDecisionHistory = [];
const CPU_DISCARD_DECISION_HISTORY_LIMIT = 10000;

function getCpuDiscardSnapshotTileColorKey(tile){
  if (!tile || typeof tile !== "object") return "";
  if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
  const imgCode = String(tile.imgCode || tile.code || "");
  if (imgCode === "r4z") return "n";
  if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
  return tile.isRed ? "r" : "";
}

function cloneCpuDiscardTileLite(tile){
  if (!tile || !tile.code) return null;
  const imgCode = (tile.imgCode === "r4z") ? "n4z" : (tile.imgCode || tile.code);
  const colorKey = getCpuDiscardSnapshotTileColorKey({ ...tile, imgCode });
  return {
    id: tile.id,
    code: tile.code,
    imgCode,
    colorKey,
    isRed: !!tile.isRed || colorKey === "r",
    isNew: !!tile.isNew
  };
}

function cloneCpuDiscardMeldLite(meld){
  if (!meld || !meld.code) return null;
  return {
    type: meld.type || "pon",
    code: meld.code,
    from: meld.from || null,
    redCount: Number.isFinite(meld.redCount) ? (meld.redCount | 0) : 0
  };
}

function cloneCpuDiscardTileList(tiles){
  if (!Array.isArray(tiles)) return [];
  const out = [];
  for (const tile of tiles){
    const cloned = cloneCpuDiscardTileLite(tile);
    if (cloned) out.push(cloned);
  }
  return out;
}

function cloneCpuDiscardMeldList(meldsLike){
  if (!Array.isArray(meldsLike)) return [];
  const out = [];
  for (const meld of meldsLike){
    const cloned = cloneCpuDiscardMeldLite(meld);
    if (cloned) out.push(cloned);
  }
  return out;
}

function getCpuDiscardSnapshotSeatScore(seatIndex){
  if (!Array.isArray(scores)) return 0;
  return Number(scores[seatIndex]) || 0;
}

function getCpuDiscardSnapshotRiverBySeat(seatIndex){
  if (seatIndex === 0) return cloneCpuDiscardTileList(river);
  if (seatIndex === 1 && typeof getCpuRiverRefBySeat === "function") return cloneCpuDiscardTileList(getCpuRiverRefBySeat(1));
  if (seatIndex === 2 && typeof getCpuRiverRefBySeat === "function") return cloneCpuDiscardTileList(getCpuRiverRefBySeat(2));
  return [];
}

function getCpuDiscardSnapshotMeldsBySeat(seatIndex){
  if (seatIndex === 0) return cloneCpuDiscardMeldList(melds);
  if ((seatIndex === 1 || seatIndex === 2) && typeof getCpuMeldRefBySeat === "function") return cloneCpuDiscardMeldList(getCpuMeldRefBySeat(seatIndex));
  return [];
}

function getCpuDiscardSnapshotPeisBySeat(seatIndex){
  if (seatIndex === 0) return cloneCpuDiscardTileList(peis);
  if ((seatIndex === 1 || seatIndex === 2) && typeof getCpuPeiRefBySeat === "function") return cloneCpuDiscardTileList(getCpuPeiRefBySeat(seatIndex));
  return [];
}

function summarizeCpuDiscardCandidate(candidate){
  if (!candidate || !candidate.discardTile) return null;
  return {
    discardTileId: candidate.discardTile.id,
    discardCode: candidate.discardTile.code,
    discardIndex: candidate.discardIndex,
    isDrawnDiscard: !!candidate.isDrawnDiscard,
    shantenAfter: Number(candidate.shantenAfter) || 0,
    improveCount: Number(candidate.improveCount) || 0,
    willRiichi: !!candidate.willRiichi
  };
}

function buildCpuDiscardSnapshotCandidates(seatIndex, hand13Tiles, drawnTile){
  if (typeof buildCpuDiscardCandidateListLegacy === "function"){
    return buildCpuDiscardCandidateListLegacy(seatIndex, hand13Tiles, drawnTile);
  }
  return [];
}

function getCpuDiscardSeatWindSafe(seatIndex){
  if (typeof getSeatWindBySeatIndexForCpu === "function"){
    return getSeatWindBySeatIndexForCpu(seatIndex);
  }
  return null;
}

function getCpuDiscardAnyRiichiSeatIndexes(){
  const out = [];

  try{
    if (isRiichi) out.push(0);
  }catch(e){}

  try{
    if (typeof isCpuRiichiSeat === "function"){
      if (isCpuRiichiSeat(1)) out.push(1);
      if (isCpuRiichiSeat(2)) out.push(2);
    }
  }catch(e){}

  return out;
}

function buildCpuDiscardTableSnapshot(){
  return {
    anyRiichi: getCpuDiscardAnyRiichiSeatIndexes().length > 0,
    riichiSeatIndexes: getCpuDiscardAnyRiichiSeatIndexes(),
    scores: Array.isArray(scores) ? scores.slice() : [35000, 35000, 35000],
    rivers: {
      0: getCpuDiscardSnapshotRiverBySeat(0),
      1: getCpuDiscardSnapshotRiverBySeat(1),
      2: getCpuDiscardSnapshotRiverBySeat(2)
    },
    melds: {
      0: getCpuDiscardSnapshotMeldsBySeat(0),
      1: getCpuDiscardSnapshotMeldsBySeat(1),
      2: getCpuDiscardSnapshotMeldsBySeat(2)
    },
    peis: {
      0: getCpuDiscardSnapshotPeisBySeat(0),
      1: getCpuDiscardSnapshotPeisBySeat(1),
      2: getCpuDiscardSnapshotPeisBySeat(2)
    }
  };
}


function cloneCpuDiscardExternalStyleSnapshot(style){
  if (!style || typeof style !== "object") return null;
  const out = { ...style };
  if (style.policyText && typeof style.policyText === "object"){
    out.policyText = { ...style.policyText };
  }
  return out;
}

function buildCpuDiscardExternalStyleSnapshot(seatIndex){
  if (typeof getCpuDiscardSeatExternalStyle === "function"){
    const style = getCpuDiscardSeatExternalStyle(seatIndex);
    if (style) return cloneCpuDiscardExternalStyleSnapshot(style);
  }

  return {
    key: "balanced",
    label: "Balanced",
    pushPullBias: 0,
    speedShapeBias: 0,
    meldRiichiBias: 0,
    winValueBias: 0,
    situationalFlexBias: 0
  };
}

function buildCpuDiscardRoundSnapshot(){
  return {
    roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
    roundNumber: (typeof roundNumber !== "undefined") ? roundNumber : null,
    honba: (typeof honba !== "undefined") ? honba : null,
    eastSeatIndex: (typeof eastSeatIndex !== "undefined") ? eastSeatIndex : null,
    doraIndicators: cloneCpuDiscardTileList(doraIndicators),
    uraDoraIndicators: cloneCpuDiscardTileList(uraDoraIndicators),
    kyotakuCount: (typeof kyotakuCount !== "undefined") ? (kyotakuCount | 0) : 0,
    tilesLeftInWall: Array.isArray(wall) ? wall.length : 0,
    tilesLeftInDeadWall: Array.isArray(deadWall) ? deadWall.length : 0
  };
}

function buildCpuDiscardSelfSnapshot(seatIndex, hand13Tiles, drawnTile, candidates){
  const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
    ? getCpuFixedMeldCountBySeat(seatIndex)
    : 0;

  const tiles14 = Array.isArray(hand13Tiles) ? hand13Tiles.slice() : [];
  if (drawnTile) tiles14.push(drawnTile);

  let currentShanten = null;
  try{
    currentShanten = calcShanten(countsFromTiles(tiles14), fixedMeldCount);
  }catch(e){
    currentShanten = null;
  }

  return {
    seatIndex,
    seatWind: getCpuDiscardSeatWindSafe(seatIndex),
    isDealer: seatIndex === ((typeof eastSeatIndex === "number") ? eastSeatIndex : 0),
    score: getCpuDiscardSnapshotSeatScore(seatIndex),
    riichi: (typeof isCpuRiichiSeat === "function") ? !!isCpuRiichiSeat(seatIndex) : false,
    hand13: cloneCpuDiscardTileList(hand13Tiles),
    drawnTile: cloneCpuDiscardTileLite(drawnTile),
    melds: getCpuDiscardSnapshotMeldsBySeat(seatIndex),
    peis: getCpuDiscardSnapshotPeisBySeat(seatIndex),
    river: getCpuDiscardSnapshotRiverBySeat(seatIndex),
    fixedMeldCount,
    currentShanten,
    candidateCount: Array.isArray(candidates) ? candidates.length : 0
  };
}

function normalizeCpuDiscardDecision(snapshot, rawDecision, source = "unknown"){
  if (!snapshot || snapshot.snapshotId == null) return null;
  if (rawDecision == null) return null;

  let decision = rawDecision;
  if (typeof decision === "string"){
    const text = decision.trim().toLowerCase();
    if (!text) return null;
    if (text === "auto") decision = { action: "auto" };
    else if (text === "discard") decision = { action: "discard" };
    else return null;
  }

  if (!decision || typeof decision !== "object") return null;

  const action = String(decision.action || "").trim().toLowerCase();
  if (action !== "discard" && action !== "auto") return null;

  const normalized = {
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.seatIndex,
    styleKey: snapshot && snapshot.externalStyle && snapshot.externalStyle.key ? String(snapshot.externalStyle.key) : "",
    externalStyle: cloneCpuDiscardExternalStyleSnapshot(snapshot && snapshot.externalStyle),
    action,
    source,
    note: (typeof decision.note === "string") ? decision.note : "",
    reasonTag: (typeof decision.reasonTag === "string") ? decision.reasonTag : "",
    reasonTags: Array.isArray(decision.reasonTags)
      ? decision.reasonTags.filter((tag)=> typeof tag === "string" && tag.trim()).map((tag)=> tag.trim())
      : [],
    meta: (decision.meta && typeof decision.meta === "object") ? { ...decision.meta } : {},
    status: "decided",
    createdAt: Date.now()
  };

  if (action === "auto") return normalized;

  const candidates = Array.isArray(snapshot.candidates) ? snapshot.candidates : [];
  let matched = null;

  if (Number.isInteger(decision.discardTileId)){
    matched = candidates.find((candidate)=> candidate && candidate.discardTile && candidate.discardTile.id === decision.discardTileId) || null;
  }

  if (!matched && Number.isInteger(decision.discardIndex)){
    matched = candidates.find((candidate)=> candidate && candidate.discardIndex === decision.discardIndex) || null;
  }

  if (!matched && typeof decision.discardCode === "string" && decision.discardCode){
    const sameCode = candidates.filter((candidate)=> candidate && candidate.discardTile && candidate.discardTile.code === decision.discardCode);
    if (sameCode.length === 1) matched = sameCode[0];
  }

  if (!matched && candidates.length === 1){
    matched = candidates[0];
  }

  if (!matched) return null;

  normalized.discardTileId = matched.discardTile.id;
  normalized.discardIndex = matched.discardIndex;
  normalized.discardCode = matched.discardTile.code;
  normalized.candidateSummary = summarizeCpuDiscardCandidate(matched);
  return normalized;
}

function pushCpuDiscardDecisionHistory(entry){
  cpuDiscardDecisionHistory.push(entry);
  if (cpuDiscardDecisionHistory.length > CPU_DISCARD_DECISION_HISTORY_LIMIT){
    cpuDiscardDecisionHistory.splice(0, cpuDiscardDecisionHistory.length - CPU_DISCARD_DECISION_HISTORY_LIMIT);
  }
}

function recordCpuDiscardDecision(snapshot, rawDecision, source = "unknown"){
  const normalized = normalizeCpuDiscardDecision(snapshot, rawDecision, source);
  if (!normalized) return null;

  cpuDiscardDecisionStore.set(snapshot.snapshotId, normalized);
  pushCpuDiscardDecisionHistory({ ...normalized });

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuDiscardDecision === "function"){
      window.MBSanmaMatchLog.pushCpuDiscardDecision(normalized);
    }
  }catch(e){}

  return normalized;
}

function updateCpuDiscardDecisionForSnapshot(snapshotId, patch){
  if (snapshotId == null || !cpuDiscardDecisionStore.has(snapshotId)) return null;
  const prev = cpuDiscardDecisionStore.get(snapshotId);
  const next = {
    ...prev,
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: Date.now()
  };
  cpuDiscardDecisionStore.set(snapshotId, next);
  pushCpuDiscardDecisionHistory({ ...next });

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuDiscardDecision === "function"){
      window.MBSanmaMatchLog.pushCpuDiscardDecision(next);
    }
  }catch(e){}

  return next;
}

function consumeCpuDiscardDecisionForSnapshot(snapshotId){
  if (snapshotId == null || !cpuDiscardDecisionStore.has(snapshotId)) return null;
  const value = cpuDiscardDecisionStore.get(snapshotId);
  cpuDiscardDecisionStore.delete(snapshotId);
  return value ? { ...value } : null;
}

function getCpuDiscardDecisionBySnapshotId(snapshotId){
  if (snapshotId == null || !cpuDiscardDecisionStore.has(snapshotId)) return null;
  const value = cpuDiscardDecisionStore.get(snapshotId);
  return value ? { ...value } : null;
}

function getCpuDiscardDecisionHistory(){
  return cpuDiscardDecisionHistory.map((entry)=> ({ ...entry }));
}

function getCpuDiscardDecisionHistoryTail(limit = 20){
  const n = Math.max(1, Number(limit) || 20);
  return cpuDiscardDecisionHistory.slice(-n).map((entry)=> ({ ...entry }));
}


function getCpuDiscardCompareHistoryTail(limit = 20){
  const n = Math.max(1, Number(limit) || 20);
  return cpuDiscardDecisionHistory
    .filter((entry)=> entry && (entry.status === "selected" || entry.status === "executed"))
    .slice(-n)
    .map((entry)=>(
      {
        snapshotId: entry.snapshotId,
        seatIndex: entry.seatIndex,
        status: entry.status,
        styleKey: entry.styleKey || (entry.externalStyle && entry.externalStyle.key) || "",
        selected: entry.selectedDiscardCode || entry.discardCode || "",
        final: entry.finalDiscardCode || "",
        external: entry.externalDiscardCode || "",
        shadowInternal: entry.shadowInternalDiscardCode || "",
        shadowAgree: !!entry.shadowAgree,
        source: entry.executionSource || entry.source || "",
        note: entry.note || ""
      }
    ));
}

function pickCpuDiscardCandidateFromSnapshotDecision(snapshot, decision){
  if (!snapshot || !decision || decision.action !== "discard") return null;
  const candidates = Array.isArray(snapshot.candidates) ? snapshot.candidates : [];

  if (Number.isInteger(decision.discardTileId)){
    const found = candidates.find((candidate)=> candidate && candidate.discardTile && candidate.discardTile.id === decision.discardTileId);
    if (found) return found;
  }

  if (Number.isInteger(decision.discardIndex)){
    const found = candidates.find((candidate)=> candidate && candidate.discardIndex === decision.discardIndex);
    if (found) return found;
  }

  if (typeof decision.discardCode === "string" && decision.discardCode){
    const sameCode = candidates.filter((candidate)=> candidate && candidate.discardTile && candidate.discardTile.code === decision.discardCode);
    if (sameCode.length === 1) return sameCode[0];
  }

  return null;
}

function captureCpuDiscardSnapshot(seatIndex, hand13Tiles, drawnTile, sourceType = "turnDiscard"){
  try{
    const candidates = buildCpuDiscardSnapshotCandidates(seatIndex, hand13Tiles, drawnTile);
    if (!Array.isArray(candidates) || candidates.length <= 0) return null;

    const snapshot = {
      kind: "cpuDiscardChoice",
      snapshotId: cpuDiscardSnapshotSeq++,
      sourceType,
      seatIndex,
      round: buildCpuDiscardRoundSnapshot(),
      self: buildCpuDiscardSelfSnapshot(seatIndex, hand13Tiles, drawnTile, candidates),
      externalStyle: buildCpuDiscardExternalStyleSnapshot(seatIndex),
      table: buildCpuDiscardTableSnapshot(),
      visibleCounts: (typeof countVisibleForCpuSeat === "function")
        ? countVisibleForCpuSeat(seatIndex, Array.isArray(hand13Tiles) ? hand13Tiles.slice() : [])
        : null,
      candidates,
      candidateSummaries: candidates.map((candidate)=> summarizeCpuDiscardCandidate(candidate)).filter(Boolean),
      createdAt: Date.now()
    };

    const shouldCallExternalHook = (typeof doesCpuDiscardSeatUseExternalDecision === "function")
      ? doesCpuDiscardSeatUseExternalDecision(seatIndex)
      : true;

    let hookDecision = null;
    if (shouldCallExternalHook){
      try{
        if (typeof window !== "undefined" && typeof window.onCpuDiscardSnapshot === "function"){
          hookDecision = window.onCpuDiscardSnapshot(snapshot);
        }
      }catch(e){
        hookDecision = null;
      }
    }

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuDiscardSnapshot === "function"){
        window.MBSanmaMatchLog.pushCpuDiscardSnapshot(snapshot);
      }
    }catch(e){}

    if (hookDecision != null){
      recordCpuDiscardDecision(snapshot, hookDecision, "hookReturn");
    }

    return snapshot;
  }catch(e){
    return null;
  }
}

try{
  if (typeof window !== "undefined"){
    window.captureCpuDiscardSnapshot = captureCpuDiscardSnapshot;
    window.recordCpuDiscardDecision = recordCpuDiscardDecision;
    window.updateCpuDiscardDecisionForSnapshot = updateCpuDiscardDecisionForSnapshot;
    window.consumeCpuDiscardDecisionForSnapshot = consumeCpuDiscardDecisionForSnapshot;
    window.getCpuDiscardDecisionBySnapshotId = getCpuDiscardDecisionBySnapshotId;
    window.getCpuDiscardDecisionHistory = getCpuDiscardDecisionHistory;
    window.getCpuDiscardDecisionHistoryTail = getCpuDiscardDecisionHistoryTail;
    window.getCpuDiscardCompareHistoryTail = getCpuDiscardCompareHistoryTail;
    window.pickCpuDiscardCandidateFromSnapshotDecision = pickCpuDiscardCandidateFromSnapshotDecision;
    window.normalizeCpuDiscardDecision = normalizeCpuDiscardDecision;
  }
}catch(e){}
