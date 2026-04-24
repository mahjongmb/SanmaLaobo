// MBsanma/js/cpu_snapshot.js
// ========= cpu_snapshot.js（CPU判断用snapshot土台） =========
// 役割：
// - CPU副露候補が発生した瞬間の局面を、外部判断しやすい形で切り出す
// - 今は「副露候補snapshot」専用
// - 将来的に「ツモ後の打牌判断snapshot」にも流用できるよう、記録APIを共通化しておく
//
// 注意：
// - ここでは状態変更をしない
// - render系には依存しない

let cpuDecisionSnapshotSeq = 1;
let lastCpuCallSnapshot = null;
let cpuCallSnapshotHistory = [];
const CPU_CALL_SNAPSHOT_HISTORY_MAX = 60;

let cpuCallDecisionSeq = 1;
let lastCpuCallDecision = null;
let cpuCallDecisionHistory = [];
let cpuCallDecisionMap = Object.create(null);
const CPU_CALL_DECISION_HISTORY_MAX = 120;

function getDecisionSnapshotTileColorKey(tile){
  if (!tile || typeof tile !== "object") return "";
  if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
  const imgCode = String(tile.imgCode || tile.code || "");
  if (imgCode === "r4z") return "n";
  if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
  return tile.isRed ? "r" : "";
}

function cloneTileForDecisionSnapshot(tile){
  if (!tile || !tile.code) return null;
  const imgCode = tile.imgCode ? (tile.imgCode === "r4z" ? "n4z" : tile.imgCode) : null;
  const colorKey = getDecisionSnapshotTileColorKey({ ...tile, imgCode: imgCode || tile.code });
  const out = { code: tile.code };
  if (imgCode) out.imgCode = imgCode;
  if (colorKey) out.colorKey = colorKey;
  if (tile.id != null) out.id = tile.id;
  if (tile.isRed || colorKey === "r") out.isRed = true;
  if (tile.isRiichiDeclare) out.isRiichiDeclare = true;
  return out;
}

function cloneTileArrayForDecisionSnapshot(arr){
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const tile of arr){
    const cloned = cloneTileForDecisionSnapshot(tile);
    if (cloned) out.push(cloned);
  }
  return out;
}

function cloneMeldForDecisionSnapshot(meld){
  if (!meld || !meld.type || !meld.code) return null;
  const out = {
    type: meld.type,
    code: meld.code
  };
  if (meld.from) out.from = meld.from;
  if (meld.added) out.added = true;
  return out;
}

function cloneMeldArrayForDecisionSnapshot(arr){
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const meld of arr){
    const cloned = cloneMeldForDecisionSnapshot(meld);
    if (cloned) out.push(cloned);
  }
  return out;
}

function countsArrayToCodeMapForDecisionSnapshot(counts){
  const out = {};
  if (!Array.isArray(counts) || !Array.isArray(TILE_TYPES)) return out;

  for (let i = 0; i < TILE_TYPES.length; i++){
    const code = TILE_TYPES[i];
    const n = counts[i] | 0;
    if (n > 0) out[code] = n;
  }
  return out;
}

function getSeatLabelForDecisionSnapshot(seatIndex){
  if (seatIndex === 0) return "player";
  if (seatIndex === 1) return "cpuRight";
  if (seatIndex === 2) return "cpuLeft";
  return "unknown";
}

function getTileSuitForDecisionSnapshot(code){
  if (!code || typeof code !== "string") return null;
  return code.slice(-1);
}

function getDecisionSnapshotNumberSuitKeys(){
  return ["m", "p", "s"];
}

function getDecisionSnapshotDominantSuitSummary(suitCounts){
  const counts = (suitCounts && typeof suitCounts === "object") ? suitCounts : { m: 0, p: 0, s: 0, z: 0 };
  const ordered = getDecisionSnapshotNumberSuitKeys()
    .map((suit)=> [suit, counts[suit] | 0])
    .sort((a, b)=> b[1] - a[1]);
  return {
    maxSuitCount: ordered[0] ? ordered[0][1] : 0,
    secondSuitCount: ordered[1] ? ordered[1][1] : 0
  };
}

function isHonorCodeForDecisionSnapshot(code){
  return getTileSuitForDecisionSnapshot(code) === "z";
}

function isTerminalCodeForDecisionSnapshot(code){
  if (!code || typeof code !== "string") return false;
  const suit = getTileSuitForDecisionSnapshot(code);
  if (suit === "z") return false;
  const n = code[0];
  return n === "1" || n === "9";
}

function isYakuhaiCodeForDecisionSnapshot(code, seatIndex){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = (typeof getSeatWindBySeatIndexForCpu === "function") ? getSeatWindBySeatIndexForCpu(seatIndex) : null;
  if (seatWind === "東" && code === "1z") return true;
  if (seatWind === "南" && code === "2z") return true;
  if (seatWind === "西" && code === "3z") return true;

  if (typeof roundWind !== "undefined") {
    if (roundWind === "東" && code === "1z") return true;
    if (roundWind === "南" && code === "2z") return true;
    if (roundWind === "西" && code === "3z") return true;
  }

  return false;
}

function getMeldTileCountForDecisionSnapshot(meld){
  if (!meld || !meld.type) return 0;
  if (meld.type === "pon") return 3;
  if (meld.type === "minkan") return 4;
  if (meld.type === "ankan") return 4;
  if (meld.type === "kakan") return 4;
  return 0;
}

function buildTileCountMapForDecisionSnapshot(tiles, meldsArr = [], extraCodes = []){
  const out = Object.create(null);

  const addCode = (code, n = 1)=>{
    if (!code) return;
    out[code] = (out[code] | 0) + (n | 0);
  };

  if (Array.isArray(tiles)){
    for (const tile of tiles){
      if (tile && tile.code) addCode(tile.code, 1);
    }
  }

  if (Array.isArray(meldsArr)){
    for (const meld of meldsArr){
      if (!meld || !meld.code) continue;
      addCode(meld.code, getMeldTileCountForDecisionSnapshot(meld));
    }
  }

  if (Array.isArray(extraCodes)){
    for (const code of extraCodes){
      addCode(code, 1);
    }
  }

  return out;
}

function inferValuePlanHintsForDecisionSnapshot(seatIndex, tiles, meldsArr = [], extraCodes = []){
  const hints = [];
  const countMap = buildTileCountMapForDecisionSnapshot(tiles, meldsArr, extraCodes);

  const suitCounts = { m: 0, p: 0, s: 0, z: 0 };
  let pairLikeCount = 0;
  let tripletLikeCount = 0;
  let terminalOrHonorCount = 0;
  let simpleCount = 0;

  for (const [code, rawCount] of Object.entries(countMap)){
    const n = rawCount | 0;
    const suit = getTileSuitForDecisionSnapshot(code);
    if (suitCounts[suit] != null) suitCounts[suit] += n;
    if (n >= 2) pairLikeCount++;
    if (n >= 3) tripletLikeCount++;

    if (isHonorCodeForDecisionSnapshot(code) || isTerminalCodeForDecisionSnapshot(code)) terminalOrHonorCount += n;
    else simpleCount += n;

    if (isYakuhaiCodeForDecisionSnapshot(code, seatIndex) && !hints.includes("yakuhai_like")){
      hints.push("yakuhai_like");
    }
  }

  const suitSummary = getDecisionSnapshotDominantSuitSummary(suitCounts);
  const maxSuitCount = suitSummary.maxSuitCount;
  const secondSuitCount = suitSummary.secondSuitCount;
  const honorCount = suitCounts.z | 0;

  if (maxSuitCount >= 6 && secondSuitCount <= 2){
    if (honorCount >= 1) hints.push("honitsu_like");
    else if (maxSuitCount >= 9) hints.push("chinitsu_like");
  }

  if (pairLikeCount >= 4 && tripletLikeCount >= 2){
    hints.push("toitoi_like");
  }

  if (simpleCount >= 6 && terminalOrHonorCount <= 1){
    hints.push("tanyao_like");
  }

  if (Array.isArray(meldsArr) && meldsArr.length > 0){
    hints.push("already_open");
  }

  return hints;
}

function removeTilesByCodeForDecisionSnapshot(tiles, code, removeCount){
  if (!Array.isArray(tiles)) return null;
  const out = [];
  let need = removeCount | 0;

  for (const tile of tiles){
    if (need > 0 && tile && tile.code === code){
      need--;
      continue;
    }
    out.push(tile);
  }

  if (need > 0) return null;
  return out;
}

function buildCallActionAnalysisForDecisionSnapshot(seatIndex, action, handRef, meldRef, discardedTile, fixedMeldCount, currentShanten){
  try{
    if (!discardedTile || !discardedTile.code) return null;
    const need = (action === "pon") ? 2 : (action === "minkan") ? 3 : 0;
    if (need <= 0) return null;

    const concealedAfter = removeTilesByCodeForDecisionSnapshot(handRef, discardedTile.code, need);
    if (!Array.isArray(concealedAfter)) return null;

    const nextFixedMeldCount = (fixedMeldCount | 0) + 1;
    const countsAfter = (typeof countsFromTiles === "function") ? countsFromTiles(concealedAfter) : [];
    const shantenAfter = (typeof calcShanten === "function") ? calcShanten(countsAfter, nextFixedMeldCount) : null;
    const visibleAfter = (typeof countVisibleForCpuSeat === "function") ? countVisibleForCpuSeat(seatIndex, concealedAfter) : [];
    const improveCountAfter = (typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, countsAfter, visibleAfter, nextFixedMeldCount)
      : 0;
    const waitTypeCountAfter = (typeof countTenpaiWaitTypeCount === "function")
      ? countTenpaiWaitTypeCount(concealedAfter, nextFixedMeldCount)
      : 0;

    const unrestrictedBestDiscard = (action === "pon" && typeof chooseCpuCallDiscardInfo === "function")
      ? chooseCpuCallDiscardInfo(seatIndex, concealedAfter, nextFixedMeldCount)
      : null;
    const restrictedBestDiscard = (action === "pon" && typeof chooseCpuCallDiscardInfo === "function")
      ? chooseCpuCallDiscardInfo(seatIndex, concealedAfter, nextFixedMeldCount, { forbiddenDiscardCode: discardedTile.code })
      : null;
    const sameTileDiscardWouldBeBest = !!(
      unrestrictedBestDiscard && unrestrictedBestDiscard.discardTile &&
      unrestrictedBestDiscard.discardTile.code === discardedTile.code
    );

    const currentImproveCount = (typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, (typeof countsFromTiles === "function") ? countsFromTiles(handRef) : [], (typeof countVisibleForCpuSeat === "function") ? countVisibleForCpuSeat(seatIndex, handRef) : [], fixedMeldCount)
      : 0;
    const restrictedImproveCountAfterDiscard = restrictedBestDiscard && Number.isFinite(restrictedBestDiscard.improveCount)
      ? restrictedBestDiscard.improveCount
      : 0;
    const improveDropAfterBestDiscard = Math.max(0, (Number(currentImproveCount) || 0) - (Number(restrictedImproveCountAfterDiscard) || 0));
    const improveKeepRateAfterBestDiscard = (Number(currentImproveCount) || 0) > 0
      ? Math.round((restrictedImproveCountAfterDiscard / currentImproveCount) * 1000) / 1000
      : null;

    const hypotheticalMelds = Array.isArray(meldRef) ? meldRef.slice() : [];
    hypotheticalMelds.push({ type: action, code: discardedTile.code });
    const valuePlanHintsAfterCall = inferValuePlanHintsForDecisionSnapshot(seatIndex, concealedAfter, hypotheticalMelds, [discardedTile.code]);

    return {
      action,
      discardedTileIsYakuhaiForSelf: isYakuhaiCodeForDecisionSnapshot(discardedTile.code, seatIndex),
      concealedTileCountAfter: concealedAfter.length,
      fixedMeldCountAfter: nextFixedMeldCount,
      handCountsAfter: countsArrayToCodeMapForDecisionSnapshot(countsAfter),
      visibleCountsAfter: countsArrayToCodeMapForDecisionSnapshot(visibleAfter),
      currentShantenBefore: currentShanten,
      shantenAfter,
      advancesShanten: (Number.isFinite(currentShanten) && Number.isFinite(shantenAfter)) ? (shantenAfter < currentShanten) : false,
      keepsTenpai: (currentShanten === 0 && shantenAfter === 0),
      worsensShanten: (Number.isFinite(currentShanten) && Number.isFinite(shantenAfter)) ? (shantenAfter > currentShanten) : false,
      improveCountAfter,
      tenpaiWaitTypeCountAfter: waitTypeCountAfter,
      sameTileDiscardWouldBeBest,
      improveDropAfterBestDiscard,
      improveKeepRateAfterBestDiscard,
      bestDiscardAfterCall: restrictedBestDiscard
        ? {
            code: restrictedBestDiscard.discardTile && restrictedBestDiscard.discardTile.code ? restrictedBestDiscard.discardTile.code : null,
            shantenAfterDiscard: Number.isFinite(restrictedBestDiscard.shantenAfter) ? restrictedBestDiscard.shantenAfter : null,
            improveCountAfterDiscard: Number.isFinite(restrictedBestDiscard.improveCount) ? restrictedBestDiscard.improveCount : 0
          }
        : null,
      valuePlanHintsAfterCall
    };
  }catch(e){
    return null;
  }
}

function buildPublicSeatStateForDecisionSnapshot(seatIndex){
  const riverRef = (seatIndex === 0)
    ? (Array.isArray(river) ? river : [])
    : ((typeof getCpuRiverRefBySeat === "function" && Array.isArray(getCpuRiverRefBySeat(seatIndex)))
        ? getCpuRiverRefBySeat(seatIndex)
        : []);

  const meldRef = (seatIndex === 0)
    ? (Array.isArray(melds) ? melds : [])
    : ((typeof getCpuMeldRefBySeat === "function" && Array.isArray(getCpuMeldRefBySeat(seatIndex)))
        ? getCpuMeldRefBySeat(seatIndex)
        : []);

  const peiRef = (seatIndex === 0)
    ? (Array.isArray(peis) ? peis : [])
    : ((typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(seatIndex)))
        ? getCpuPeiRefBySeat(seatIndex)
        : []);

  return {
    seatIndex,
    label: getSeatLabelForDecisionSnapshot(seatIndex),
    seatWind: (typeof getSeatWindBySeatIndexForCpu === "function") ? getSeatWindBySeatIndexForCpu(seatIndex) : null,
    score: (Array.isArray(scores) && Number.isFinite(scores[seatIndex])) ? (scores[seatIndex] | 0) : 0,
    riichi: (seatIndex === 0) ? !!isRiichi : ((typeof isCpuRiichiSeat === "function") ? !!isCpuRiichiSeat(seatIndex) : false),
    river: cloneTileArrayForDecisionSnapshot(riverRef),
    melds: cloneMeldArrayForDecisionSnapshot(meldRef),
    peis: cloneTileArrayForDecisionSnapshot(peiRef)
  };
}

function buildCpuCallSnapshot(seatIndex, discardedTile, discarderSeatIndex, sourceType = "discard"){
  try{
    if (seatIndex !== 1 && seatIndex !== 2) return null;
    if (!discardedTile || !discardedTile.code) return null;
    if (discarderSeatIndex !== 0 && discarderSeatIndex !== 1 && discarderSeatIndex !== 2) return null;

    const handRef = (typeof getCpuHand13RefBySeat === "function") ? getCpuHand13RefBySeat(seatIndex) : null;
    if (!Array.isArray(handRef)) return null;

    const drawnTile = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(seatIndex) : null;
    const meldRef = (typeof getCpuMeldRefBySeat === "function") ? getCpuMeldRefBySeat(seatIndex) : [];
    const peiRef = (typeof getCpuPeiRefBySeat === "function") ? getCpuPeiRefBySeat(seatIndex) : [];
    const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function") ? getCpuFixedMeldCountBySeat(seatIndex) : 0;

    const sameTileCount = handRef.filter((t)=> t && t.code === discardedTile.code).length;
    const ponBlockedByTriplet = (typeof hasCpuPonBlockedByConcealedTriplet === "function")
      ? hasCpuPonBlockedByConcealedTriplet(handRef, discardedTile)
      : (sameTileCount >= 3);
    const legalPon = !isEnded && !(typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) && sameTileCount >= 2 && !ponBlockedByTriplet;
    const legalMinkan = !isEnded && !(typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(seatIndex)) && sameTileCount >= 3;
    if (!legalPon && !legalMinkan) return null;

    const counts13 = (typeof countsFromTiles === "function") ? countsFromTiles(handRef) : [];
    const currentShanten = (typeof calcShanten === "function") ? calcShanten(counts13, fixedMeldCount) : null;
    const visibleCounts = (typeof countVisibleForCpuSeat === "function") ? countVisibleForCpuSeat(seatIndex, handRef) : [];
    const improveCount = (typeof countCpuImproveTiles === "function")
      ? countCpuImproveTiles(seatIndex, counts13, visibleCounts, fixedMeldCount)
      : 0;
    const waitTypeCount = (typeof countTenpaiWaitTypeCount === "function")
      ? countTenpaiWaitTypeCount(handRef, fixedMeldCount)
      : 0;

    const selfValuePlanHints = inferValuePlanHintsForDecisionSnapshot(seatIndex, handRef, meldRef);
    const ponAnalysis = legalPon
      ? buildCallActionAnalysisForDecisionSnapshot(seatIndex, "pon", handRef, meldRef, discardedTile, fixedMeldCount, currentShanten)
      : null;
    const minkanAnalysis = legalMinkan
      ? buildCallActionAnalysisForDecisionSnapshot(seatIndex, "minkan", handRef, meldRef, discardedTile, fixedMeldCount, currentShanten)
      : null;

    const riichiSeatIndexes = [];
    for (let i = 0; i < 3; i++){
      const riichi = (i === 0)
        ? !!isRiichi
        : ((typeof isCpuRiichiSeat === "function") ? !!isCpuRiichiSeat(i) : false);
      if (riichi) riichiSeatIndexes.push(i);
    }

    const snapshot = {
      snapshotId: cpuDecisionSnapshotSeq++,
      kind: "cpuOpenCallCandidate",
      sourceType,
      phase: (typeof turnPhase !== "undefined") ? turnPhase : null,
      createdAt: Date.now(),
      turnSeatIndex: (typeof currentTurnSeatIndex === "number") ? currentTurnSeatIndex : null,
      round: {
        roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
        roundNumber: (typeof roundNumber !== "undefined") ? (roundNumber | 0) : null,
        honba: (typeof honba !== "undefined") ? (honba | 0) : 0,
        eastSeatIndex: (typeof eastSeatIndex !== "undefined") ? eastSeatIndex : null,
        doraIndicators: cloneTileArrayForDecisionSnapshot(Array.isArray(doraIndicators) ? doraIndicators : []),
        tilesLeftInWall: Array.isArray(wall) ? wall.length : null,
        tilesLeftInDeadWall: Array.isArray(deadWall) ? deadWall.length : null
      },
      candidateSeatIndex: seatIndex,
      candidateSeatLabel: getSeatLabelForDecisionSnapshot(seatIndex),
      discarderSeatIndex,
      discarderSeatLabel: getSeatLabelForDecisionSnapshot(discarderSeatIndex),
      discardedTile: cloneTileForDecisionSnapshot(discardedTile),
      scores: Array.isArray(scores) ? scores.map((v)=> Number(v) || 0) : [],
      self: {
        seatIndex,
        label: getSeatLabelForDecisionSnapshot(seatIndex),
        score: (Array.isArray(scores) && Number.isFinite(scores[seatIndex])) ? (scores[seatIndex] | 0) : 0,
        seatWind: (typeof getSeatWindBySeatIndexForCpu === "function") ? getSeatWindBySeatIndexForCpu(seatIndex) : null,
        isDealer: (typeof eastSeatIndex !== "undefined") ? (eastSeatIndex === seatIndex) : false,
        riichi: (typeof isCpuRiichiSeat === "function") ? !!isCpuRiichiSeat(seatIndex) : false,
        hand13: cloneTileArrayForDecisionSnapshot(handRef),
        drawnTile: cloneTileForDecisionSnapshot(drawnTile),
        melds: cloneMeldArrayForDecisionSnapshot(meldRef),
        peis: cloneTileArrayForDecisionSnapshot(peiRef),
        river: cloneTileArrayForDecisionSnapshot((typeof getCpuRiverRefBySeat === "function" && Array.isArray(getCpuRiverRefBySeat(seatIndex))) ? getCpuRiverRefBySeat(seatIndex) : []),
        fixedMeldCount,
        handCounts: countsArrayToCodeMapForDecisionSnapshot(counts13),
        visibleCounts: countsArrayToCodeMapForDecisionSnapshot(visibleCounts),
        currentShanten,
        improveCount,
        tenpaiWaitTypeCount: waitTypeCount,
        valuePlanHints: selfValuePlanHints
      },
      callAnalysis: {
        pon: ponAnalysis,
        minkan: minkanAnalysis
      },
      table: {
        anyRiichi: riichiSeatIndexes.length > 0,
        riichiSeatIndexes,
        seats: [
          buildPublicSeatStateForDecisionSnapshot(0),
          buildPublicSeatStateForDecisionSnapshot(1),
          buildPublicSeatStateForDecisionSnapshot(2)
        ]
      },
      legalActions: {
        pon: legalPon,
        minkan: legalMinkan
      },
      currentPolicyDecision: {
        pon: (typeof canCpuPonOnDiscard === "function") ? !!canCpuPonOnDiscard(seatIndex, discardedTile, discarderSeatIndex) : false,
        minkan: (typeof canCpuMinkanOnDiscard === "function") ? !!canCpuMinkanOnDiscard(seatIndex, discardedTile, discarderSeatIndex) : false
      }
    };

    return snapshot;
  }catch(e){
    return null;
  }
}


function getSnapshotById(snapshotId){
  if (!Number.isFinite(snapshotId)) return null;
  if (lastCpuCallSnapshot && lastCpuCallSnapshot.snapshotId === snapshotId){
    return lastCpuCallSnapshot;
  }
  if (!Array.isArray(cpuCallSnapshotHistory)) return null;
  for (let i = cpuCallSnapshotHistory.length - 1; i >= 0; i--){
    const snapshot = cpuCallSnapshotHistory[i];
    if (snapshot && snapshot.snapshotId === snapshotId){
      return snapshot;
    }
  }
  return null;
}

function isLegalCpuCallDecisionAction(snapshot, action){
  if (!snapshot || !action) return false;
  if (action === "pass" || action === "auto") return true;
  if (action === "pon") return !!(snapshot.legalActions && snapshot.legalActions.pon);
  if (action === "minkan") return !!(snapshot.legalActions && snapshot.legalActions.minkan);
  return false;
}

function normalizeCpuCallDecisionReasonTag(tag){
  if (typeof tag !== "string") return "";
  return tag.trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/^_+|_+$/g, "");
}

function pushCpuCallDecisionReasonTag(out, tag){
  const normalized = normalizeCpuCallDecisionReasonTag(tag);
  if (!normalized) return;
  if (!out.includes(normalized)) out.push(normalized);
}

function getCpuCallAnalysisForDecision(snapshot, action){
  if (!snapshot || !snapshot.callAnalysis || typeof snapshot.callAnalysis !== "object") return null;
  if (action === "pon") return snapshot.callAnalysis.pon || null;
  if (action === "minkan") return snapshot.callAnalysis.minkan || null;
  return null;
}

function inferCpuCallDecisionReasonTags(snapshot, action, raw){
  const out = [];

  if (raw && typeof raw.reasonTag === "string"){
    pushCpuCallDecisionReasonTag(out, raw.reasonTag);
  }
  if (raw && Array.isArray(raw.reasonTags)){
    for (const tag of raw.reasonTags){
      pushCpuCallDecisionReasonTag(out, tag);
    }
  }
  if (out.length > 0) return out;

  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const analysis = getCpuCallAnalysisForDecision(snapshot, action);
  const afterHints = (analysis && Array.isArray(analysis.valuePlanHintsAfterCall)) ? analysis.valuePlanHintsAfterCall : [];
  const selfHints = Array.isArray(selfInfo.valuePlanHints) ? selfInfo.valuePlanHints : [];
  const hasHint = (name)=> afterHints.includes(name) || selfHints.includes(name);
  const hasSpeed = !!(analysis && (analysis.keepsTenpai || analysis.advancesShanten));

  if (action === "pass"){
    if (tableInfo.anyRiichi && !selfInfo.riichi){
      pushCpuCallDecisionReasonTag(out, "riichi_danger_pass");
    }
    if (analysis && analysis.discardedTileIsYakuhaiForSelf && !hasSpeed){
      pushCpuCallDecisionReasonTag(out, "yakuhai_slow_pass");
    }
    if (!analysis || (!analysis.discardedTileIsYakuhaiForSelf && !hasHint("honitsu_like") && !hasHint("toitoi_like") && !hasHint("tanyao_like") && !hasSpeed)){
      pushCpuCallDecisionReasonTag(out, "no_value_pass");
    }
    if (out.length <= 0 && hasSpeed){
      pushCpuCallDecisionReasonTag(out, "close_call_pass");
    }
    if (out.length <= 0){
      pushCpuCallDecisionReasonTag(out, "unclear_pass");
    }
    return out;
  }

  if (action === "pon"){
    if (analysis && analysis.discardedTileIsYakuhaiForSelf){
      pushCpuCallDecisionReasonTag(out, analysis.keepsTenpai ? "yakuhai_tenpai" : "yakuhai_speed");
    }
    if (hasHint("honitsu_like")) pushCpuCallDecisionReasonTag(out, "honitsu_speed");
    if (hasHint("toitoi_like")) pushCpuCallDecisionReasonTag(out, "toitoi_speed");
    if (hasHint("tanyao_like")) pushCpuCallDecisionReasonTag(out, "tanyao_speed");
    if (analysis && analysis.keepsTenpai) pushCpuCallDecisionReasonTag(out, "tenpai_keep");
    if (analysis && analysis.advancesShanten) pushCpuCallDecisionReasonTag(out, "shanten_up_value");
    if (out.length <= 0) pushCpuCallDecisionReasonTag(out, "call_push");
    return out;
  }

  if (action === "minkan"){
    if (analysis && analysis.keepsTenpai) pushCpuCallDecisionReasonTag(out, "minkan_tenpai");
    if (hasHint("yakuhai_like") || hasHint("honitsu_like") || hasHint("toitoi_like")) pushCpuCallDecisionReasonTag(out, "minkan_value");
    if (out.length <= 0) pushCpuCallDecisionReasonTag(out, "minkan_push");
    return out;
  }

  pushCpuCallDecisionReasonTag(out, "decision_recorded");
  return out;
}

function getCpuOpenShadowEvalSummaryFromSnapshot(snapshot){
  if (!snapshot || !snapshot.internalOpenEval || typeof snapshot.internalOpenEval !== "object") return null;
  if (typeof summarizeCpuOpenEvalForMeta === "function"){
    return summarizeCpuOpenEvalForMeta(snapshot.internalOpenEval);
  }

  const evalResult = snapshot.internalOpenEval;
  return {
    engine: evalResult.engine || "cpu_open_eval_v1",
    profileKey: evalResult.profileKey || "balanced",
    action: evalResult.action || "pass",
    reasonTag: evalResult.reasonTag || "",
    reasonTags: Array.isArray(evalResult.reasonTags) ? evalResult.reasonTags.slice() : [],
    scores: evalResult.scores ? { ...evalResult.scores } : null
  };
}

function normalizeCpuCallDecision(snapshot, decision, source = "external"){
  if (!snapshot || decision == null) return null;

  let raw = decision;
  if (typeof raw === "string"){
    raw = { action: raw };
  }
  if (!raw || typeof raw !== "object") return null;

  const action = (typeof raw.action === "string") ? raw.action.trim().toLowerCase() : "";
  if (!isLegalCpuCallDecisionAction(snapshot, action)) return null;

  const reasonTags = inferCpuCallDecisionReasonTags(snapshot, action, raw);
  const shadowSummary = getCpuOpenShadowEvalSummaryFromSnapshot(snapshot);
  const baseMeta = (raw.meta && typeof raw.meta === "object") ? raw.meta : null;
  const mergedMeta = shadowSummary
    ? {
        ...(baseMeta || {}),
        internalOpenEval: shadowSummary
      }
    : baseMeta;

  return {
    decisionId: cpuCallDecisionSeq++,
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.candidateSeatIndex,
    action,
    source,
    createdAt: Date.now(),
    note: (typeof raw.note === "string") ? raw.note : "",
    reasonTag: reasonTags[0] || "",
    reasonTags,
    status: "decided",
    consumed: false,
    finalAction: "",
    executionSource: "",
    resolvedAt: null,
    shadowAction: shadowSummary ? (shadowSummary.action || "") : "",
    shadowReasonTag: shadowSummary ? (shadowSummary.reasonTag || "") : "",
    shadowReasonTags: shadowSummary ? (Array.isArray(shadowSummary.reasonTags) ? shadowSummary.reasonTags.slice() : []) : [],
    shadowProfileKey: shadowSummary ? (shadowSummary.profileKey || "") : "",
    shadowScores: shadowSummary && shadowSummary.scores ? { ...shadowSummary.scores } : null,
    meta: mergedMeta
  };
}

function recordCpuCallDecision(snapshot, decision, source = "external"){
  const normalized = normalizeCpuCallDecision(snapshot, decision, source);
  if (!normalized) return null;

  lastCpuCallDecision = normalized;
  cpuCallDecisionHistory.push(normalized);
  cpuCallDecisionMap[String(normalized.snapshotId)] = normalized;

  if (cpuCallDecisionHistory.length > CPU_CALL_DECISION_HISTORY_MAX){
    const overflow = cpuCallDecisionHistory.length - CPU_CALL_DECISION_HISTORY_MAX;
    const removed = cpuCallDecisionHistory.splice(0, overflow);
    for (const item of removed){
      if (!item || item.snapshotId == null) continue;
      const key = String(item.snapshotId);
      if (cpuCallDecisionMap[key] === item){
        delete cpuCallDecisionMap[key];
      }
    }
  }

  try{
    if (typeof window !== "undefined"){
      window.lastCpuCallDecision = lastCpuCallDecision;
      window.cpuCallDecisionHistory = cpuCallDecisionHistory;
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuOpenDecision === "function"){
      window.MBSanmaMatchLog.pushCpuOpenDecision(normalized);
    }
  }catch(e){}

  return normalized;
}

function getCpuCallDecisionForSnapshot(snapshotId){
  if (!Number.isFinite(snapshotId)) return null;
  return cpuCallDecisionMap[String(snapshotId)] || null;
}

function consumeCpuCallDecisionForSnapshot(snapshotId){
  if (!Number.isFinite(snapshotId)) return null;
  const key = String(snapshotId);
  const decision = cpuCallDecisionMap[key] || null;
  if (!decision) return null;
  if (decision.consumed) return null;
  decision.consumed = true;
  if (decision.status === "decided"){
    decision.status = "consumed";
  }
  return decision;
}

function updateCpuCallDecisionForSnapshot(snapshotId, patch){
  if (!Number.isFinite(snapshotId)) return null;
  const key = String(snapshotId);
  const decision = cpuCallDecisionMap[key] || null;
  if (!decision || !patch || typeof patch !== "object") return decision || null;

  if (typeof patch.status === "string" && patch.status.trim()){
    decision.status = patch.status.trim();
  }
  if (typeof patch.finalAction === "string"){
    decision.finalAction = patch.finalAction.trim().toLowerCase();
  }
  if (typeof patch.executionSource === "string"){
    decision.executionSource = patch.executionSource.trim();
  }
  if (typeof patch.note === "string" && patch.note){
    decision.note = decision.note ? (decision.note + "|" + patch.note) : patch.note;
  }
  if (typeof patch.reasonTag === "string"){
    const nextTag = normalizeCpuCallDecisionReasonTag(patch.reasonTag);
    if (nextTag){
      decision.reasonTag = nextTag;
      if (!Array.isArray(decision.reasonTags)) decision.reasonTags = [];
      if (!decision.reasonTags.includes(nextTag)) decision.reasonTags.unshift(nextTag);
    }
  }
  if (Array.isArray(patch.reasonTags)){
    if (!Array.isArray(decision.reasonTags)) decision.reasonTags = [];
    for (const tag of patch.reasonTags){
      pushCpuCallDecisionReasonTag(decision.reasonTags, tag);
    }
    if (!decision.reasonTag && decision.reasonTags.length > 0){
      decision.reasonTag = decision.reasonTags[0];
    }
  }
  if (patch.meta && typeof patch.meta === "object"){
    decision.meta = {
      ...(decision.meta && typeof decision.meta === "object" ? decision.meta : {}),
      ...patch.meta
    };
  }

  decision.resolvedAt = Date.now();

  try{
    if (typeof window !== "undefined"){
      window.lastCpuCallDecision = decision;
      window.cpuCallDecisionHistory = cpuCallDecisionHistory;
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuOpenDecision === "function"){
      window.MBSanmaMatchLog.pushCpuOpenDecision(decision);
    }
  }catch(e){}

  return decision;
}

function resolveCpuCallDecision(snapshotId, decision){
  const snapshot = getSnapshotById(snapshotId);
  if (!snapshot) return null;
  return recordCpuCallDecision(snapshot, decision, "externalResolve");
}

function callCpuCallSnapshotHook(snapshot){
  try{
    if (typeof window === "undefined") return null;
    if (typeof window.onCpuCallSnapshot !== "function") return null;
    const decision = window.onCpuCallSnapshot(snapshot);
    if (decision == null) return null;
    return recordCpuCallDecision(snapshot, decision, "hookReturn");
  }catch(e){
    return null;
  }
}

function recordCpuCallSnapshot(snapshot){
  if (!snapshot) return null;

  try{
    if (typeof evaluateCpuOpenCallSnapshot === "function"){
      snapshot.internalOpenEval = evaluateCpuOpenCallSnapshot(snapshot);
    }
  }catch(e){
    snapshot.internalOpenEval = null;
  }

  lastCpuCallSnapshot = snapshot;
  cpuCallSnapshotHistory.push(snapshot);
  if (cpuCallSnapshotHistory.length > CPU_CALL_SNAPSHOT_HISTORY_MAX){
    cpuCallSnapshotHistory.splice(0, cpuCallSnapshotHistory.length - CPU_CALL_SNAPSHOT_HISTORY_MAX);
  }

  try{
    if (typeof window !== "undefined"){
      window.lastCpuCallSnapshot = lastCpuCallSnapshot;
      window.cpuCallSnapshotHistory = cpuCallSnapshotHistory;
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushCpuOpenSnapshot === "function"){
      window.MBSanmaMatchLog.pushCpuOpenSnapshot(snapshot);
    }
  }catch(e){}

  const shouldCallExternalHook = (typeof doesCpuOpenSeatUseExternalDecision === "function")
    ? doesCpuOpenSeatUseExternalDecision(snapshot.candidateSeatIndex)
    : true;

  if (shouldCallExternalHook){
    callCpuCallSnapshotHook(snapshot);
  }

  return snapshot;
}

function captureCpuCallSnapshot(seatIndex, discardedTile, discarderSeatIndex, sourceType = "discard"){
  const snapshot = buildCpuCallSnapshot(seatIndex, discardedTile, discarderSeatIndex, sourceType);
  if (!snapshot) return null;
  return recordCpuCallSnapshot(snapshot);
}

function getLastCpuCallSnapshot(){
  return lastCpuCallSnapshot;
}

function getCpuCallSnapshotHistory(){
  return Array.isArray(cpuCallSnapshotHistory) ? cpuCallSnapshotHistory.slice() : [];
}

function clearCpuCallDecisions(){
  lastCpuCallDecision = null;
  cpuCallDecisionHistory = [];
  cpuCallDecisionMap = Object.create(null);
  try{
    if (typeof window !== "undefined"){
      window.lastCpuCallDecision = null;
      window.cpuCallDecisionHistory = cpuCallDecisionHistory;
    }
  }catch(e){}
}

function getLastCpuCallDecision(){
  return lastCpuCallDecision;
}

function getCpuCallDecisionHistory(){
  return Array.isArray(cpuCallDecisionHistory) ? cpuCallDecisionHistory.slice() : [];
}

function clearCpuCallSnapshots(){
  lastCpuCallSnapshot = null;
  cpuCallSnapshotHistory = [];
  clearCpuCallDecisions();
  try{
    if (typeof window !== "undefined"){
      window.lastCpuCallSnapshot = null;
      window.cpuCallSnapshotHistory = cpuCallSnapshotHistory;
      window.resolveCpuCallDecision = resolveCpuCallDecision;
      window.updateCpuCallDecisionForSnapshot = updateCpuCallDecisionForSnapshot;
    }
  }catch(e){}
}

try{
  if (typeof window !== "undefined"){
    window.resolveCpuCallDecision = resolveCpuCallDecision;
    window.updateCpuCallDecisionForSnapshot = updateCpuCallDecisionForSnapshot;
  }
}catch(e){}
