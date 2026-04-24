// MBsanma/js/cpai.js
// ========= cpai.js（CPU打牌判断） =========

function getCpuFixedMeldCountForDiscardChoice(seatIndex){
  if (typeof getCpuFixedMeldCountBySeat === "function"){
    return getCpuFixedMeldCountBySeat(seatIndex);
  }
  return 0;
}

function countCpuImproveTiles(seatIndex, handCounts13, visibleCounts, fixedMeldCount = 0){
  let total = 0;

  for (let i = 0; i < TILE_TYPES.length; i++){
    if (handCounts13[i] >= 4) continue;

    const remain = 4 - (visibleCounts[i] | 0);
    if (remain <= 0) continue;

    const next = handCounts13.slice();
    next[i]++;

    try{
      if (calcShanten(next, fixedMeldCount) < calcShanten(handCounts13, fixedMeldCount)){
        total += remain;
      }
    }catch(e){}
  }

  return total;
}

function buildCpuDiscardCandidateListLegacy(seatIndex, hand13Tiles, drawnTile){
  if (!Array.isArray(hand13Tiles)) return [];
  if (!drawnTile) return [];

  const tiles14 = hand13Tiles.slice();
  tiles14.push(drawnTile);

  const fixedMeldCount = getCpuFixedMeldCountForDiscardChoice(seatIndex);
  const out = [];

  for (let i = 0; i < tiles14.length; i++){
    const discardTile = tiles14[i];
    if (!discardTile || !discardTile.code) continue;

    const after13 = tiles14.slice();
    after13.splice(i, 1);

    const counts13 = countsFromTiles(after13);
    const shantenAfter = calcShanten(counts13, fixedMeldCount);
    const visibleCounts = countVisibleForCpuSeat(seatIndex, after13);
    const improveCount = countCpuImproveTiles(seatIndex, counts13, visibleCounts, fixedMeldCount);
    const isDrawnDiscard = !!drawnTile && discardTile.id === drawnTile.id;

    out.push({
      discardTile,
      discardIndex: i,
      after13,
      shantenAfter,
      improveCount,
      isDrawnDiscard,
      willRiichi: (fixedMeldCount === 0 && shantenAfter === 0)
    });
  }

  return out;
}

function compareCpuDiscardInfoLegacy(info, best){
  if (!best) return -1;
  if (!info) return 1;

  if (info.shantenAfter < best.shantenAfter) return -1;
  if (info.shantenAfter > best.shantenAfter) return 1;

  if (info.improveCount > best.improveCount) return -1;
  if (info.improveCount < best.improveCount) return 1;

  if (info.isDrawnDiscard && !best.isDrawnDiscard) return -1;
  if (!info.isDrawnDiscard && best.isDrawnDiscard) return 1;

  const bestCode = best.discardTile && best.discardTile.code ? best.discardTile.code : "";
  const thisCode = info.discardTile && info.discardTile.code ? info.discardTile.code : "";

  if (thisCode > bestCode) return -1;
  if (thisCode < bestCode) return 1;
  return 0;
}

function chooseCpuDiscardInfoLegacy(seatIndex, hand13Tiles, drawnTile){
  const candidates = buildCpuDiscardCandidateListLegacy(seatIndex, hand13Tiles, drawnTile);
  let best = null;

  for (const info of candidates){
    if (!best || compareCpuDiscardInfoLegacy(info, best) < 0){
      best = info;
    }
  }

  return best;
}


function buildDebugCpuPresetDiscardInfo(seatIndex, hand13Tiles, drawnTile){
  if (!Array.isArray(hand13Tiles) || hand13Tiles.length <= 0) return null;

  const discardTile = hand13Tiles[0];
  if (!discardTile || !discardTile.code) return null;

  const fixedMeldCount = getCpuFixedMeldCountForDiscardChoice(seatIndex);
  const after13 = hand13Tiles.slice(1);
  if (drawnTile) after13.push(drawnTile);

  const counts13 = countsFromTiles(after13);
  const shantenAfter = calcShanten(counts13, fixedMeldCount);
  const visibleCounts = countVisibleForCpuSeat(seatIndex, after13);
  const improveCount = countCpuImproveTiles(seatIndex, counts13, visibleCounts, fixedMeldCount);

  return {
    discardTile,
    discardIndex: 0,
    after13,
    shantenAfter,
    improveCount,
    isDrawnDiscard: false,
    willRiichi: false,
    preserveOrder: true,
    decisionSource: "debug_preset_order"
  };
}

function chooseCpuDiscardInfoByDebugPresetOrder(seatIndex, hand13Tiles, drawnTile){
  try{
    if (typeof isDebugCpuPresetDiscardOrderEnabledBySeat !== "function") return null;
    if (!isDebugCpuPresetDiscardOrderEnabledBySeat(seatIndex)) return null;
    return buildDebugCpuPresetDiscardInfo(seatIndex, hand13Tiles, drawnTile);
  }catch(e){
    return null;
  }
}

function getCpuDiscardSeatEngineModeSafe(seatIndex){
  if (typeof getCpuDiscardSeatEngineMode === "function"){
    return getCpuDiscardSeatEngineMode(seatIndex);
  }
  return "legacy";
}

function getExternalCpuDiscardDecisionFromSnapshot(snapshot){
  if (!snapshot || snapshot.snapshotId == null) return null;
  if (typeof consumeCpuDiscardDecisionForSnapshot !== "function") return null;
  const decision = consumeCpuDiscardDecisionForSnapshot(snapshot.snapshotId);
  if (!decision || !decision.action) return null;
  return decision;
}

function buildInternalCpuDiscardShadowDecision(snapshot, sourceLabel = "internal_shadow"){
  if (!snapshot) return null;
  if (typeof buildCpuDiscardShadowDecision !== "function") return null;

  const raw = buildCpuDiscardShadowDecision(snapshot);
  if (!raw || raw.action !== "discard") return null;

  raw.meta = {
    ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
    engineMode: getCpuDiscardSeatEngineModeSafe(snapshot.seatIndex),
    sourceLabel
  };

  return raw;
}

function buildCpuDiscardShadowComparePatch(preferredDecision, preferredExecutionSource, shadowDecision){
  const patch = {};

  if (preferredDecision && preferredDecision.action === "discard"){
    patch.selectedDiscardTileId = preferredDecision.discardTileId;
    patch.selectedDiscardIndex = preferredDecision.discardIndex;
    patch.selectedDiscardCode = preferredDecision.discardCode || "";
  }

  if (preferredExecutionSource === "external" && preferredDecision && preferredDecision.action === "discard"){
    patch.externalDiscardTileId = preferredDecision.discardTileId;
    patch.externalDiscardIndex = preferredDecision.discardIndex;
    patch.externalDiscardCode = preferredDecision.discardCode || "";
  }

  if (shadowDecision && shadowDecision.action === "discard"){
    patch.shadowInternalDiscardTileId = shadowDecision.discardTileId;
    patch.shadowInternalDiscardIndex = shadowDecision.discardIndex;
    patch.shadowInternalDiscardCode = shadowDecision.discardCode || "";
    patch.shadowInternalReasonTag = shadowDecision.reasonTag || "";
    patch.shadowInternalReasonTags = Array.isArray(shadowDecision.reasonTags)
      ? shadowDecision.reasonTags.slice()
      : [];
    patch.shadowInternalMeta = shadowDecision.meta && typeof shadowDecision.meta === "object"
      ? { ...shadowDecision.meta }
      : null;
  }

  patch.shadowAgree = !!(
    preferredDecision && preferredDecision.action === "discard" &&
    shadowDecision && shadowDecision.action === "discard" &&
    (
      (preferredDecision.discardTileId != null && shadowDecision.discardTileId != null && preferredDecision.discardTileId === shadowDecision.discardTileId) ||
      (preferredDecision.discardIndex != null && shadowDecision.discardIndex != null && preferredDecision.discardIndex === shadowDecision.discardIndex) ||
      (preferredDecision.discardCode && shadowDecision.discardCode && preferredDecision.discardCode === shadowDecision.discardCode)
    )
  );

  return patch;
}

function getCpuDiscardDecisionRecordSourceByExecutionSource(executionSource){
  if (executionSource === "external") return "externalResolve";
  if (executionSource === "internal_eval") return "internalEval";
  if (executionSource === "internal_eval_fallback") return "internalEvalFallback";
  if (executionSource === "legacy") return "legacyEval";
  if (executionSource === "legacy_fallback") return "legacyEval";
  return "unknown";
}

function updateCpuDiscardDecisionLifecycle(snapshot, patch){
  if (!snapshot || snapshot.snapshotId == null) return null;
  if (typeof updateCpuDiscardDecisionForSnapshot !== "function") return null;
  return updateCpuDiscardDecisionForSnapshot(snapshot.snapshotId, patch || {});
}

function getCpuDiscardDecisionExecutionSourceLabel(decision){
  const source = decision && typeof decision.source === "string" ? decision.source : "";
  if (source === "hookReturn" || source === "externalResolve") return "external";
  if (source === "internalEval" || source === "internalShadow") return "internal_eval";
  if (source === "internalEvalFallback" || source === "internalShadowFallback") return "internal_eval_fallback";
  if (source === "legacyEval") return "legacy";
  return source || "unknown";
}

function recordInternalCpuDiscardDecisionFromSnapshot(snapshot, source = "internalEval"){
  if (!snapshot) return null;
  if (typeof buildCpuDiscardShadowDecision !== "function") return null;
  if (typeof recordCpuDiscardDecision !== "function") return null;

  const raw = buildCpuDiscardShadowDecision(snapshot);
  if (!raw || raw.action !== "discard") return null;

  raw.meta = {
    ...(raw.meta && typeof raw.meta === "object" ? raw.meta : {}),
    engineMode: getCpuDiscardSeatEngineModeSafe(snapshot.seatIndex)
  };

  return recordCpuDiscardDecision(snapshot, raw, source);
}

function getPreferredCpuDiscardDecisionFromSnapshot(snapshot, seatIndex, shadowDecision = null){
  if (!snapshot) return null;

  const engineMode = getCpuDiscardSeatEngineModeSafe(seatIndex);

  if (engineMode === "external"){
    const externalDecision = getExternalCpuDiscardDecisionFromSnapshot(snapshot);
    if (externalDecision && externalDecision.action === "discard") return externalDecision;

    const internalFallback = recordInternalCpuDiscardDecisionFromSnapshot(snapshot, "internalEvalFallback");
    if (internalFallback && internalFallback.action === "discard") return internalFallback;

    if (shadowDecision && shadowDecision.action === "discard"){
      return {
        ...shadowDecision,
        note: shadowDecision.note || "internal_shadow_fallback"
      };
    }
    return null;
  }

  if (engineMode === "internal"){
    const internalDecision = recordInternalCpuDiscardDecisionFromSnapshot(snapshot, "internalEval");
    if (internalDecision && internalDecision.action === "discard") return internalDecision;
    if (shadowDecision && shadowDecision.action === "discard") return shadowDecision;
    return null;
  }

  return null;
}

function recordLegacyCpuDiscardDecision(snapshot, best, source = "legacyEval"){
  if (!snapshot || !best || !best.discardTile) return null;
  if (typeof recordCpuDiscardDecision !== "function") return null;

  return recordCpuDiscardDecision(snapshot, {
    action: "discard",
    discardTileId: best.discardTile.id,
    discardIndex: best.discardIndex,
    discardCode: best.discardTile.code,
    note: "legacy_discard_eval"
  }, source);
}

function chooseCpuDiscardInfo(seatIndex, hand13Tiles, drawnTile){
  if (!Array.isArray(hand13Tiles)) return null;
  if (!drawnTile) return null;

  const debugPresetInfo = chooseCpuDiscardInfoByDebugPresetOrder(seatIndex, hand13Tiles, drawnTile);
  if (debugPresetInfo && debugPresetInfo.discardTile){
    return debugPresetInfo;
  }

  const engineMode = getCpuDiscardSeatEngineModeSafe(seatIndex);
  if (engineMode === "legacy"){
    return chooseCpuDiscardInfoLegacy(seatIndex, hand13Tiles, drawnTile);
  }

  const snapshot = (typeof captureCpuDiscardSnapshot === "function")
    ? captureCpuDiscardSnapshot(seatIndex, hand13Tiles, drawnTile, "turnDiscard")
    : null;

  if (snapshot && engineMode !== "external" && typeof consumeCpuDiscardDecisionForSnapshot === "function"){
    try{ consumeCpuDiscardDecisionForSnapshot(snapshot.snapshotId); }catch(e){}
  }

  const shadowDecision = buildInternalCpuDiscardShadowDecision(snapshot, "internal_shadow_eval");
  const preferredDecision = getPreferredCpuDiscardDecisionFromSnapshot(snapshot, seatIndex, shadowDecision);
  const preferredExecutionSource = getCpuDiscardDecisionExecutionSourceLabel(preferredDecision);
  const comparePatch = buildCpuDiscardShadowComparePatch(preferredDecision, preferredExecutionSource, shadowDecision);

  if (snapshot && preferredDecision && preferredDecision.action === "discard" && typeof recordCpuDiscardDecision === "function"){
    recordCpuDiscardDecision(
      snapshot,
      preferredDecision,
      getCpuDiscardDecisionRecordSourceByExecutionSource(preferredExecutionSource)
    );
  }

  if (snapshot && preferredDecision && typeof pickCpuDiscardCandidateFromSnapshotDecision === "function"){
    const picked = pickCpuDiscardCandidateFromSnapshotDecision(snapshot, preferredDecision);
    if (picked && picked.discardTile){
      updateCpuDiscardDecisionLifecycle(snapshot, {
        ...comparePatch,
        status: "selected",
        finalAction: "discard",
        executionSource: preferredExecutionSource,
        selectedByEngineMode: engineMode
      });
      picked.snapshotId = snapshot.snapshotId;
      picked.decisionSource = preferredExecutionSource;
      if (preferredDecision && typeof preferredDecision.willRiichi !== "undefined"){
        picked.willRiichi = !!preferredDecision.willRiichi;
      }
      picked.shadowDiscardCode = shadowDecision && shadowDecision.discardCode ? shadowDecision.discardCode : "";
      picked.externalDiscardCode = preferredExecutionSource === "external" ? (preferredDecision.discardCode || "") : "";
      picked.shadowAgree = !!comparePatch.shadowAgree;
      return picked;
    }

    updateCpuDiscardDecisionLifecycle(snapshot, {
      ...comparePatch,
      status: "decision_rejected",
      executionSource: preferredExecutionSource,
      note: "candidate_not_found",
      selectedByEngineMode: engineMode
    });
  }

  const legacyBest = chooseCpuDiscardInfoLegacy(seatIndex, hand13Tiles, drawnTile);
  if (!legacyBest || !legacyBest.discardTile) return legacyBest;

  if (snapshot){
    const recorded = recordLegacyCpuDiscardDecision(snapshot, legacyBest, "legacyEval");
    updateCpuDiscardDecisionLifecycle(snapshot, {
      ...buildCpuDiscardShadowComparePatch({
        action: "discard",
        discardTileId: legacyBest.discardTile.id,
        discardIndex: legacyBest.discardIndex,
        discardCode: legacyBest.discardTile.code
      }, preferredDecision ? "legacy_fallback" : "legacy", shadowDecision),
      status: "selected",
      finalAction: "discard",
      executionSource: preferredDecision ? "legacy_fallback" : "legacy",
      selectedByEngineMode: engineMode
    });
    legacyBest.snapshotId = snapshot.snapshotId;
    legacyBest.decisionSource = preferredDecision ? "legacy_fallback" : "legacy";
    legacyBest.shadowDiscardCode = shadowDecision && shadowDecision.discardCode ? shadowDecision.discardCode : "";
    legacyBest.externalDiscardCode = preferredExecutionSource === "external" ? (preferredDecision.discardCode || "") : "";
    if (recorded && Array.isArray(recorded.reasonTags) && recorded.reasonTags.length > 0){
      legacyBest.reasonTags = recorded.reasonTags.slice();
    }
  }

  return legacyBest;
}
