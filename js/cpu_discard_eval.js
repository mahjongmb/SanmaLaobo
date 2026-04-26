// MBsanma/js/cpu_discard_eval.js
// ========= cpu_discard_eval.js（CPU打牌評価器 / 影武者） =========
// 役割：
// - CPU打牌候補snapshotを採点して、内部AIなら何を切るかを返す
// - 旧来ロジック（シャンテン / improveCount / ツモ切り / 牌コード）を土台に、
//   プロファイルで重みを変えられるようにする
//
// 注意：
// - render を触らない
// - 状態変更はしない

function getCpuDiscardEvalProfile(snapshot, profileOverride){
  if (profileOverride && typeof profileOverride === "object"){
    return {
      key: String(profileOverride.key || "custom"),
      ...profileOverride
    };
  }

  if (typeof profileOverride === "string" && profileOverride.trim()){
    const key = profileOverride.trim();

    if (typeof getCpuDiscardExternalStyleLibrary === "function" && typeof buildCpuDiscardInternalProfileFromExternalStyle === "function"){
      const styleLibrary = getCpuDiscardExternalStyleLibrary();
      if (styleLibrary && styleLibrary[key]){
        return buildCpuDiscardInternalProfileFromExternalStyle(styleLibrary[key]);
      }
    }

    return (typeof getCpuDiscardProfile === "function")
      ? getCpuDiscardProfile(key)
      : null;
  }

  const seatIndex = snapshot && snapshot.seatIndex;

  if (typeof getCpuDiscardSeatInternalStyleProfile === "function"){
    const dynamicProfile = getCpuDiscardSeatInternalStyleProfile(seatIndex);
    if (dynamicProfile) return dynamicProfile;
  }

  if (typeof getCpuDiscardSeatProfile === "function"){
    return getCpuDiscardSeatProfile(seatIndex);
  }

  return (typeof getCpuDiscardProfile === "function")
    ? getCpuDiscardProfile("balanced")
    : null;
}

function pushCpuDiscardEvalPart(parts, key, score, note){
  const n = Number(score) || 0;
  if (!Number.isFinite(n) || n === 0) return;
  parts.push({ key, score: n, note: note || "" });
}

function sumCpuDiscardEvalParts(parts){
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts){
    total += Number(part && part.score) || 0;
  }
  return Math.round(total * 100) / 100;
}

function countTileCodeInList(tilesLike, code){
  if (!Array.isArray(tilesLike) || !code) return 0;
  let n = 0;
  for (const tile of tilesLike){
    if (tile && tile.code === code) n++;
  }
  return n;
}

function getDoraCodeFromIndicatorForDiscardEval(code){
  if (typeof getDoraCodeFromIndicatorForYaku === "function"){
    return getDoraCodeFromIndicatorForYaku(code);
  }
  return code;
}

function countCandidateDoraTiles(snapshot, candidate){
  const indicators = snapshot && snapshot.round && Array.isArray(snapshot.round.doraIndicators)
    ? snapshot.round.doraIndicators
    : [];
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  if (indicators.length <= 0 || tiles.length <= 0) return 0;

  let total = 0;
  for (const dora of indicators){
    const indicatorCode = dora && dora.code ? dora.code : null;
    if (!indicatorCode) continue;
    const doraCode = getDoraCodeFromIndicatorForDiscardEval(indicatorCode);
    total += countTileCodeInList(tiles, doraCode);
  }
  return total;
}

function getCpuDiscardTileColorKey(tile){
  if (!tile || typeof tile !== "object") return "";
  if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
  const imgCode = String(tile.imgCode || tile.code || "");
  if (imgCode === "r4z") return "n";
  if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
  return tile.isRed ? "r" : "";
}

function isCpuDiscardRedFiveTile(tile){
  if (!tile || typeof tile !== "object") return false;
  if (getCpuDiscardTileColorKey(tile) !== "r") return false;
  const code = String(tile.code || "");
  return code === "5p" || code === "5s";
}

function countCandidateRedFiveTiles(candidate){
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  if (tiles.length <= 0) return 0;
  let total = 0;
  for (const tile of tiles){
    if (isCpuDiscardRedFiveTile(tile)) total++;
  }
  return total;
}

function isHonorCode(code){
  return !!code && code[1] === "z";
}

function isTerminalCode(code){
  if (!code || typeof code !== "string" || code.length < 2) return false;
  const suit = code[1];
  if (suit === "z") return false;
  return code[0] === "1" || code[0] === "9";
}

function getCpuDiscardNumberSuitKeys(){
  return ["m", "p", "s"];
}

function createCpuDiscardSuitCounts(){
  return { m: 0, p: 0, s: 0, z: 0 };
}

function getCpuDiscardDominantSuitSummary(suitCounts){
  const counts = (suitCounts && typeof suitCounts === "object") ? suitCounts : createCpuDiscardSuitCounts();
  const ordered = getCpuDiscardNumberSuitKeys()
    .map((suit)=> [suit, counts[suit] | 0])
    .sort((a, b)=> b[1] - a[1]);
  const dominantSuit = ordered[0] && ordered[0][1] > 0 ? ordered[0][0] : "";
  const dominantSuitCount = ordered[0] ? ordered[0][1] : 0;
  const otherSuitCount = ordered.slice(1).reduce((sum, item)=> sum + (item ? (item[1] | 0) : 0), 0);
  return {
    dominantSuit,
    dominantSuitCount,
    otherSuitCount,
    ordered
  };
}

function isYakuhaiLikeCodeForSeat(code, seatIndex){
  if (!code) return false;
  if (code === "5z" || code === "6z" || code === "7z") return true;

  const seatWind = (typeof getSeatWindBySeatIndexForCpu === "function")
    ? getSeatWindBySeatIndexForCpu(seatIndex)
    : null;

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

function getCpuDiscardEvalProfileNumber(profile, key, fallback){
  if (profile && Number.isFinite(profile[key])) return Number(profile[key]);
  return Number(fallback) || 0;
}

function clampCpuDiscardEval(value, min, max){
  const n = Number(value) || 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function getCpuDiscardVerifyTuning(){
  try{
    if (typeof getCpuVerifyTuning === "function"){
      const tuning = getCpuVerifyTuning();
      if (tuning && tuning.enabled && tuning.discard && typeof tuning.discard === "object"){
        return tuning.discard;
      }
    }
  }catch(e){}
  return null;
}

function getCpuDiscardTableScores(snapshot){
  if (snapshot && Array.isArray(snapshot.scores) && snapshot.scores.length >= 3){
    return snapshot.scores.map((score)=> Number(score) || 0);
  }
  if (snapshot && snapshot.table && Array.isArray(snapshot.table.scores) && snapshot.table.scores.length >= 3){
    return snapshot.table.scores.map((score)=> Number(score) || 0);
  }
  return [];
}

function getCpuDiscardPlacement(snapshot, seatIndex){
  const scores = getCpuDiscardTableScores(snapshot);
  if (!scores.length || !Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= scores.length) return null;
  const order = scores
    .map((score, index)=> ({ score, index }))
    .sort((a, b)=> (b.score - a.score) || (a.index - b.index));
  const pos = order.findIndex((item)=> item.index === seatIndex);
  return pos >= 0 ? (pos + 1) : null;
}

function getCpuDiscardRoundPhase(snapshot){
  const tilesLeft = snapshot && snapshot.round ? (Number(snapshot.round.tilesLeftInWall) || 0) : 0;
  if (tilesLeft <= 0) return "unknown";
  if (tilesLeft <= 18) return "end";
  if (tilesLeft <= 36) return "late";
  if (tilesLeft <= 58) return "mid";
  return "early";
}

function buildCpuDiscardTableContext(snapshot, candidate){
  const seatIndex = snapshot && Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : null;
  const placement = getCpuDiscardPlacement(snapshot, seatIndex);
  const phase = getCpuDiscardRoundPhase(snapshot);
  const threatCount = getCpuDiscardRiichiThreatSeatIndexes(snapshot).length;
  const openThreatCount = getCpuDiscardOpenThreatSeatIndexes(snapshot).length;
  const tuning = getCpuDiscardVerifyTuning();
  const pushPullBias = clampCpuDiscardEval(tuning && tuning.pushPullBias, -3, 3);
  const speedShapeBias = clampCpuDiscardEval(tuning && tuning.speedShapeBias, -3, 3);
  const meldRiichiBias = clampCpuDiscardEval(tuning && tuning.meldRiichiBias, -3, 3);
  const winValueBias = clampCpuDiscardEval(tuning && tuning.winValueBias, -3, 3);
  const situationalFlexBias = clampCpuDiscardEval(tuning && tuning.situationalFlexBias, -3, 3);
  const shantenAfter = candidate ? (Number(candidate.shantenAfter) || 0) : 99;
  return {
    seatIndex,
    placement,
    phase,
    threatCount,
    openThreatCount,
    isDealer: !!(snapshot && snapshot.self && snapshot.self.isDealer),
    isTop: placement === 1,
    isLast: placement === 3,
    isTenpai: shantenAfter <= 0,
    isOneShanten: shantenAfter === 1,
    pushPullBias,
    speedShapeBias,
    meldRiichiBias,
    winValueBias,
    situationalFlexBias
  };
}

function getCpuDiscardTableRiver(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const rivers = snapshot.table.rivers && typeof snapshot.table.rivers === "object" ? snapshot.table.rivers : null;
  if (!rivers) return [];
  const ref = rivers[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardTableMelds(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const meldsMap = snapshot.table.melds && typeof snapshot.table.melds === "object" ? snapshot.table.melds : null;
  if (!meldsMap) return [];
  const ref = meldsMap[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardTablePeis(snapshot, seatIndex){
  if (!snapshot || !snapshot.table || typeof snapshot.table !== "object") return [];
  const peisMap = snapshot.table.peis && typeof snapshot.table.peis === "object" ? snapshot.table.peis : null;
  if (!peisMap) return [];
  const ref = peisMap[seatIndex];
  return Array.isArray(ref) ? ref : [];
}

function getCpuDiscardVisibleCountMap(snapshot, candidate){
  const out = Object.create(null);
  const addCode = (code, n = 1)=>{
    if (!code) return;
    out[code] = (out[code] | 0) + (n | 0);
  };
  const addTiles = (tilesLike)=>{
    if (!Array.isArray(tilesLike)) return;
    for (const item of tilesLike){
      if (item && item.code) addCode(item.code, 1);
    }
  };
  const addMelds = (meldsLike)=>{
    if (!Array.isArray(meldsLike)) return;
    for (const meld of meldsLike){
      if (!meld || !meld.code) continue;
      const type = meld.type || "pon";
      const count = (type === "ankan" || type === "minkan" || type === "kakan") ? 4 : 3;
      addCode(meld.code, count);
    }
  };

  if (candidate && Array.isArray(candidate.after13)) addTiles(candidate.after13);
  if (snapshot && snapshot.self && typeof snapshot.self === "object"){
    addMelds(snapshot.self.melds);
    addTiles(snapshot.self.peis);
    addTiles(snapshot.self.river);
  }

  for (const seatIndex of [0, 1, 2]){
    addTiles(getCpuDiscardTableRiver(snapshot, seatIndex));
    addMelds(getCpuDiscardTableMelds(snapshot, seatIndex));
    addTiles(getCpuDiscardTablePeis(snapshot, seatIndex));
  }

  const indicators = snapshot && snapshot.round && Array.isArray(snapshot.round.doraIndicators)
    ? snapshot.round.doraIndicators
    : [];
  addTiles(indicators);
  return out;
}

function getCpuDiscardSujiPartnerCodes(code){
  if (!code || typeof code !== "string" || code.length < 2) return [];
  const suit = code[1];
  if (suit === "z") return [];
  const n = Number(code[0]);
  if (!Number.isFinite(n)) return [];
  const out = [];
  if (n - 3 >= 1) out.push(`${n - 3}${suit}`);
  if (n + 3 <= 9) out.push(`${n + 3}${suit}`);
  return out;
}

function isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, code){
  if (!code) return false;
  const river = getCpuDiscardTableRiver(snapshot, seatIndex);
  return river.some((tile)=> tile && tile.code === code);
}

function isCpuDiscardSujiToSeat(snapshot, seatIndex, code){
  const partners = getCpuDiscardSujiPartnerCodes(code);
  if (partners.length <= 0) return false;
  const river = getCpuDiscardTableRiver(snapshot, seatIndex);
  for (const tile of river){
    if (tile && partners.includes(tile.code)) return true;
  }
  return false;
}

function isCpuDiscardOneChanceToSeat(snapshot, candidate, seatIndex, code){
  const partners = getCpuDiscardSujiPartnerCodes(code);
  if (partners.length <= 0) return false;
  const visibleMap = getCpuDiscardVisibleCountMap(snapshot, candidate);
  for (const partner of partners){
    if ((visibleMap[partner] | 0) >= 4) return true;
  }
  return false;
}

function getCpuDiscardRiichiThreatSeatIndexes(snapshot){
  const selfSeat = snapshot && Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : -1;
  const seats = snapshot && snapshot.table && Array.isArray(snapshot.table.riichiSeatIndexes)
    ? snapshot.table.riichiSeatIndexes
    : [];
  return seats.filter((seatIndex)=> seatIndex !== selfSeat && (seatIndex === 0 || seatIndex === 1 || seatIndex === 2));
}

function getCpuDiscardOpenThreatSeatIndexes(snapshot){
  const selfSeat = snapshot && Number.isInteger(snapshot.seatIndex) ? snapshot.seatIndex : -1;
  const riichiSeats = new Set(getCpuDiscardRiichiThreatSeatIndexes(snapshot));
  const out = [];
  for (const seatIndex of [0, 1, 2]){
    if (seatIndex === selfSeat) continue;
    if (riichiSeats.has(seatIndex)) continue;
    const meldsLike = getCpuDiscardTableMelds(snapshot, seatIndex);
    if (Array.isArray(meldsLike) && meldsLike.length > 0) out.push(seatIndex);
  }
  return out;
}

function getCpuDiscardOpenThreatInfo(snapshot, seatIndex){
  const meldsLike = getCpuDiscardTableMelds(snapshot, seatIndex);
  const peisLike = getCpuDiscardTablePeis(snapshot, seatIndex);
  const info = {
    seatIndex,
    meldCount: Array.isArray(meldsLike) ? meldsLike.length : 0,
    peiCount: Array.isArray(peisLike) ? peisLike.length : 0,
    yakuhaiMeldCount: 0,
    honorMeldCount: 0,
    tripletLikeCount: 0,
    suitCounts: { p: 0, s: 0, z: 0 },
    dominantSuit: "",
    suitBiasLevel: 0
  };
  if (!Array.isArray(meldsLike) || meldsLike.length <= 0) return info;

  for (const meld of meldsLike){
    if (!meld || !meld.code) continue;
    const code = String(meld.code || "");
    const suit = code.slice(-1);
    if (info.suitCounts[suit] != null) info.suitCounts[suit] += 1;
    if (isHonorCode(code)) info.honorMeldCount += 1;
    if (isYakuhaiLikeCodeForSeat(code, seatIndex)) info.yakuhaiMeldCount += 1;
    if (meld.type === "pon" || meld.type === "minkan" || meld.type === "ankan" || meld.type === "kakan"){
      info.tripletLikeCount += 1;
    }
  }

  const suitEntries = Object.entries(info.suitCounts).sort((a, b)=> b[1] - a[1]);
  info.dominantSuit = suitEntries[0] && suitEntries[0][1] > 0 ? suitEntries[0][0] : "";
  info.suitBiasLevel = suitEntries[0] ? suitEntries[0][1] - (suitEntries[1] ? suitEntries[1][1] : 0) : 0;
  return info;
}

function isCpuDiscardThreatSeatDealer(snapshot, seatIndex){
  const dealerSeat = snapshot && snapshot.round ? Number(snapshot.round.eastSeatIndex) : NaN;
  return Number.isInteger(dealerSeat) && dealerSeat === seatIndex;
}

function getCpuDiscardThreatSeatDangerMultiplier(snapshot, seatIndex){
  let scale = 1;
  if (isCpuDiscardThreatSeatDealer(snapshot, seatIndex)) scale += 0.22;
  return clampCpuDiscardEval(scale, 1, 1.35);
}

function getCpuDiscardTileRiskClass(code){
  if (!code || typeof code !== "string" || code.length < 2) return "unknown";
  if (isHonorCode(code)) return "honor";
  if (isTerminalCode(code)) return "terminal";
  const n = Number(code[0]);
  if (!Number.isFinite(n)) return "unknown";
  if (n >= 4 && n <= 6) return "middle";
  return "near_terminal";
}

function countVisibleCodeForCpuDiscard(snapshot, candidate, code){
  if (!code) return 0;
  const visibleMap = getCpuDiscardVisibleCountMap(snapshot, candidate);
  return visibleMap[code] | 0;
}

function getCpuDiscardBaseDangerMultiplier(snapshot, candidate, code){
  const context = buildCpuDiscardTableContext(snapshot, candidate);
  const riskClass = getCpuDiscardTileRiskClass(code);
  const visibleCount = countVisibleCodeForCpuDiscard(snapshot, candidate, code);
  let scale = 1;

  // 放銃率低減強化（ユーザー要望）:
  //  - middle 1.16 → 1.30（無スジ中張の基礎危険度を上げる）
  //  - near_terminal 1.02 → 1.10（2/8 周辺も危険寄りに）
  //  - phase 加算 late +0.05→+0.08、end +0.12→+0.18
  //  - 上限 1.45 → 1.60
  if (riskClass === "honor"){
    scale = 0.82;
    if (visibleCount <= 1 && (context.phase === "late" || context.phase === "end")){
      scale += 0.26;
    }
    if (visibleCount >= 2) scale -= 0.12;
    if (visibleCount >= 3) scale -= 0.12;
  } else if (riskClass === "terminal"){
    scale = 0.9;
  } else if (riskClass === "near_terminal"){
    scale = 1.10;
  } else if (riskClass === "middle"){
    scale = 1.30;
  }

  if (context.phase === "late") scale += 0.08;
  if (context.phase === "end") scale += 0.18;

  return clampCpuDiscardEval(scale, 0.55, 1.60);
}

function evaluateCpuDiscardDefense(snapshot, candidate, profile){
  const parts = [];
  if (!snapshot || !candidate || !candidate.discardTile || !candidate.discardTile.code) return parts;

  const discardCode = candidate.discardTile.code;
  const riichiThreatSeats = getCpuDiscardRiichiThreatSeatIndexes(snapshot);
  const openThreatSeats = getCpuDiscardOpenThreatSeatIndexes(snapshot);
  const context = buildCpuDiscardTableContext(snapshot, candidate);
  // 守備重視強化（ユーザー要望：全体に押しすぎなのでもっと守備寄りに）:
  //  - threatCount係数 0.18→0.26（リーチ者1人いる時点で既に +0.26）
  //  - late 0.22→0.32 / end 0.48→0.60（終盤は降り優勢）
  //  - isTop 0.18→0.26（トップ目ほど守る）
  //  - isTenpai 緩和 -0.18→-0.06（放銃率低減再強化：テンパイでも押し緩和をほぼ無効化）
  //  - isOneShanten 緩和 -0.08→-0.02
  //  - 上限 2.2→2.6（危険局面で実質危険度をさらに積める）
  const dangerScale = clampCpuDiscardEval(
    1
      + (context.threatCount * 0.26)
      + (context.phase === "late" ? 0.32 : 0)
      + (context.phase === "end" ? 0.60 : 0)
      + (context.isTop ? 0.26 : 0)
      + (context.isLast ? -0.14 : 0)
      + (context.isTenpai ? -0.06 : 0)
      + (context.isOneShanten ? -0.02 : 0)
      + (context.isDealer ? -0.06 : 0)
      - (context.pushPullBias * 0.10)
      + (context.situationalFlexBias * 0.05),
    0.45,
    2.6
  );
  const safeScale = clampCpuDiscardEval(
    1
      + (context.threatCount * 0.10)
      + (context.phase === "late" ? 0.10 : 0)
      + (context.phase === "end" ? 0.18 : 0)
      + (context.isTop ? 0.08 : 0)
      + (context.isLast ? -0.06 : 0)
      - (context.pushPullBias * 0.05),
    0.6,
    1.7
  );

  const genbutsuBonus = getCpuDiscardEvalProfileNumber(profile, "riichiGenbutsuBonus", 32) * safeScale;
  const sujiBonus = getCpuDiscardEvalProfileNumber(profile, "riichiSujiBonus", 16) * safeScale;
  const oneChanceBonus = getCpuDiscardEvalProfileNumber(profile, "riichiOneChanceBonus", 7) * safeScale;
  const dangerPenalty = getCpuDiscardEvalProfileNumber(profile, "riichiDangerPenalty", 18) * dangerScale;
  const openYakuhaiPenalty = getCpuDiscardEvalProfileNumber(profile, "openYakuhaiDangerPenalty", 9) * dangerScale;
  const baseDangerScale = getCpuDiscardBaseDangerMultiplier(snapshot, candidate, discardCode);
  const multiRiichiScale = clampCpuDiscardEval(1 + (Math.max(0, riichiThreatSeats.length - 1) * 0.28), 1, 1.6);
  const discardSuit = String(discardCode || "").slice(-1);

  for (const seatIndex of riichiThreatSeats){
    const seatDangerScale = getCpuDiscardThreatSeatDangerMultiplier(snapshot, seatIndex);
    if (isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_genbutsu_bonus", genbutsuBonus, `seat:${seatIndex}`);
      continue;
    }

    if (isCpuDiscardSujiToSeat(snapshot, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_suji_bonus", sujiBonus, `seat:${seatIndex}`);
      continue;
    }

    if (isCpuDiscardOneChanceToSeat(snapshot, candidate, seatIndex, discardCode)){
      pushCpuDiscardEvalPart(parts, "riichi_one_chance_bonus", oneChanceBonus, `seat:${seatIndex}`);
      continue;
    }

    pushCpuDiscardEvalPart(parts, "riichi_danger_penalty", -(dangerPenalty * baseDangerScale * seatDangerScale * multiRiichiScale), `seat:${seatIndex}`);
  }

  if (isHonorCode(discardCode) && openThreatSeats.length > 0){
    for (const seatIndex of openThreatSeats){
      if (isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, discardCode)) continue;
      if (!isYakuhaiLikeCodeForSeat(discardCode, seatIndex)) continue;
      pushCpuDiscardEvalPart(parts, "open_yakuhai_danger_penalty", -openYakuhaiPenalty, `seat:${seatIndex}`);
    }
  }

  for (const seatIndex of openThreatSeats){
    if (isCpuDiscardGenbutsuToSeat(snapshot, seatIndex, discardCode)) continue;
    const threat = getCpuDiscardOpenThreatInfo(snapshot, seatIndex);
    if (!threat || threat.meldCount <= 0) continue;

    if (threat.dominantSuit && threat.suitBiasLevel >= 1 && discardSuit === threat.dominantSuit && discardSuit !== "z"){
      const suitPenalty = clampCpuDiscardEval((1.1 + (threat.suitBiasLevel * 0.35) + (threat.meldCount * 0.18)) * Math.max(0.7, dangerScale * 0.42), 0, 5.2);
      pushCpuDiscardEvalPart(parts, "open_flush_danger_penalty", -suitPenalty, `seat:${seatIndex}`);
    }

    if (threat.tripletLikeCount >= 2 && !isHonorCode(discardCode) && !isTerminalCode(discardCode)){
      const toitoiPenalty = clampCpuDiscardEval((0.75 + (threat.tripletLikeCount * 0.22)) * Math.max(0.75, dangerScale * 0.34), 0, 3.2);
      pushCpuDiscardEvalPart(parts, "open_triplet_danger_penalty", -toitoiPenalty, `seat:${seatIndex}`);
    }

    if (threat.yakuhaiMeldCount >= 1 && isHonorCode(discardCode) && !isYakuhaiLikeCodeForSeat(discardCode, snapshot && snapshot.seatIndex)){
      const honorPenalty = clampCpuDiscardEval((0.8 + (threat.yakuhaiMeldCount * 0.28)) * Math.max(0.7, dangerScale * 0.36), 0, 2.8);
      pushCpuDiscardEvalPart(parts, "open_honor_follow_danger_penalty", -honorPenalty, `seat:${seatIndex}`);
    }
  }

  if (riichiThreatSeats.length > 0){
    const riskClass = getCpuDiscardTileRiskClass(discardCode);
    if (riskClass === "honor"){
      pushCpuDiscardEvalPart(parts, "riichi_honor_shape_bonus", 2.6 * safeScale, `visible=${countVisibleCodeForCpuDiscard(snapshot, candidate, discardCode)}`);
    } else if (riskClass === "terminal"){
      pushCpuDiscardEvalPart(parts, "riichi_terminal_shape_bonus", 1.5 * safeScale);
    } else if (riskClass === "middle"){
      // 守備重視強化: 中張押しペナルティ 2.2→3.4、下限 0.8→0.9、倍率 0.75→0.9
      pushCpuDiscardEvalPart(parts, "riichi_middle_shape_penalty", -(3.4 * Math.max(0.9, dangerScale * 0.9)));
    }
    if (riichiThreatSeats.some((seatIndex)=> isCpuDiscardThreatSeatDealer(snapshot, seatIndex))){
      // 守備重視強化: 親リーチ卓圧 1.4→2.0、下限 0.9→0.95、倍率 0.7→0.85
      pushCpuDiscardEvalPart(parts, "dealer_riichi_table_penalty", -(2.0 * Math.max(0.95, dangerScale * 0.85)));
    }
    if (riichiThreatSeats.length >= 2){
      // 守備重視強化: ダブルリーチ卓圧 2.2→3.2、下限 0.9→0.95、倍率 0.75→0.85
      pushCpuDiscardEvalPart(parts, "multi_riichi_table_penalty", -(3.2 * Math.max(0.95, dangerScale * 0.85)));
    }
  }

  return parts;
}

function buildCpuDiscardReasonTags(candidate, profile){
  const tags = [];
  const push = (tag)=>{
    if (typeof tag !== "string" || !tag) return;
    if (!tags.includes(tag)) tags.push(tag);
  };

  if (candidate && candidate.willRiichi) push("riichi_ready");
  if (candidate && Number(candidate.shantenAfter) <= 0) push("tenpai_keep");
  if (candidate && Number(candidate.improveCount) >= 18) push("wide_improve");
  if (candidate && candidate.discardTile && isHonorCode(candidate.discardTile.code)) push("honor_cut");
  if (candidate && candidate.discardTile && isTerminalCode(candidate.discardTile.code)) push("terminal_cut");
  if (tags.length <= 0) push(profile && profile.key ? `${profile.key}_eval` : "discard_eval");

  return tags;
}

function buildCpuDiscardTenpaiContext(snapshot, candidate){
  const fixedMeldCount = snapshot && snapshot.self ? (Number(snapshot.self.fixedMeldCount) || 0) : 0;
  const waitTypeCount = (candidate && candidate.shantenAfter === 0 && typeof countTenpaiWaitTypeCount === "function")
    ? (Number(countTenpaiWaitTypeCount(candidate.after13, fixedMeldCount)) || 0)
    : 0;
  let waitTileCount = 0;
  let isRyanmenWait = false;
  let waitCodes = [];
  let waitTypeKeys = [];
  let isMiddleKanchanWait = false;
  let isMiddleShaboWait = false;
  let isMiddleTankiWait = false;
  let isPenchanOnlyWait = false;

  try{
    if (candidate && candidate.shantenAfter === 0 && typeof getCpuRiichiWaitCodesForLog === "function"){
      waitCodes = getCpuRiichiWaitCodesForLog(candidate.after13, fixedMeldCount);
      if (Array.isArray(waitCodes) && waitCodes.length > 0){
        if (typeof countVisibleForCpuSeat === "function" && typeof TYPE_TO_IDX === "object"){
          const visibleCounts = countVisibleForCpuSeat(snapshot && snapshot.seatIndex, candidate.after13);
          for (const code of waitCodes){
            const idx = TYPE_TO_IDX[code];
            if (idx === undefined) continue;
            waitTileCount += Math.max(0, 4 - (Number(visibleCounts[idx]) || 0));
          }
        }
        if (waitTileCount <= 0) waitTileCount = waitCodes.length;
        if (typeof isCpuRiichiRyanmenWaitForLog === "function"){
          isRyanmenWait = !!isCpuRiichiRyanmenWaitForLog(candidate.after13, fixedMeldCount, waitCodes);
        }
        if (typeof classifyCpuWaitTypeKeysForLog === "function"){
          waitTypeKeys = classifyCpuWaitTypeKeysForLog(candidate.after13, fixedMeldCount, waitCodes);
        }
        if (typeof getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog === "function"){
          for (const code of waitCodes){
            const keys = getCpuWaitTypeKeysForSingleWaitCodeFromPatternsForLog(candidate.after13, code, fixedMeldCount);
            if (!(keys instanceof Set) || !keys.has("kanchan")) continue;
            const num = Number(String(code || "")[0]);
            if (Number.isFinite(num) && num >= 4 && num <= 6){
              isMiddleKanchanWait = true;
              break;
            }
          }
        }
        if (Array.isArray(waitTypeKeys) && waitCodes.length > 0){
          const allMiddleWaitCodes = waitCodes.every((code)=>{
            const num = Number(String(code || "")[0]);
            return Number.isFinite(num) && num >= 4 && num <= 6;
          });
          if (allMiddleWaitCodes && waitTypeKeys.includes("shabo")) isMiddleShaboWait = true;
          if (allMiddleWaitCodes && waitTypeKeys.includes("tanki")) isMiddleTankiWait = true;
          if (waitTypeKeys.length === 1 && waitTypeKeys.includes("penchan")) isPenchanOnlyWait = true;
        }
      }
    }
  }catch(e){}

  return {
    waitCodes,
    waitTypeKeys,
    waitTypeCount,
    waitTileCount,
    isRyanmenWait,
    isKanchanWait: Array.isArray(waitTypeKeys) && waitTypeKeys.includes("kanchan"),
    isPenchanWait: Array.isArray(waitTypeKeys) && waitTypeKeys.includes("penchan"),
    isShaboWait: Array.isArray(waitTypeKeys) && waitTypeKeys.includes("shabo"),
    isTankiWait: Array.isArray(waitTypeKeys) && waitTypeKeys.includes("tanki"),
    isMiddleKanchanWait,
    isMiddleShaboWait,
    isMiddleTankiWait,
    isPenchanOnlyWait,
    isBadWait: waitTypeCount <= 1 && waitTileCount <= 3,
    isVeryBadWait: waitTypeCount <= 1 && waitTileCount <= 2,
    isUglyWait: waitTypeCount <= 1 && waitTileCount <= 4,
    isExcellentWait: isRyanmenWait && waitTileCount >= 6
  };
}

function estimateCpuDiscardOneShantenShape(snapshot, candidate){
  const fixedMeldCount = snapshot && snapshot.self ? (Number(snapshot.self.fixedMeldCount) || 0) : 0;
  if (!candidate || candidate.shantenAfter !== 1 || !Array.isArray(candidate.after13)) return { waitTypeCount: 0, isGoodShape: false, isExcellentShape: false };
  let waitTypeCount = 0;
  try{
    if (typeof countTenpaiWaitTypeCount === "function"){
      waitTypeCount = Number(countTenpaiWaitTypeCount(candidate.after13, fixedMeldCount)) || 0;
    }
  }catch(e){}
  return {
    waitTypeCount,
    isGoodShape: waitTypeCount >= 2 || Number(candidate.improveCount) >= 20,
    isExcellentShape: waitTypeCount >= 3 || Number(candidate.improveCount) >= 28
  };
}

function estimateCpuDiscardTwoShantenShape(snapshot, candidate){
  if (!candidate || candidate.shantenAfter !== 2 || !Array.isArray(candidate.after13)) return { sequenceLinkCount: 0, pairLikeCount: 0, isGoodShape: false };
  const pairPlan = estimateCpuDiscardPairPlan(snapshot, candidate);
  const improveCount = Number(candidate.improveCount) || 0;
  return {
    sequenceLinkCount: Number(pairPlan.sequenceLinkCount) || 0,
    pairLikeCount: Number(pairPlan.pairLikeCount) || 0,
    isGoodShape: ((Number(pairPlan.sequenceLinkCount) || 0) >= 4 && improveCount >= 20) || ((Number(pairPlan.sequenceLinkCount) || 0) >= 5)
  };
}

function estimateCpuDiscardDamaValue(snapshot, candidate){
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  if (!tiles.length) return { score: 0, flags: [] };

  const counts = Object.create(null);
  const suitCounts = createCpuDiscardSuitCounts();
  const flags = [];
  const pushFlag = (flag)=>{
    if (typeof flag !== "string" || !flag) return;
    if (!flags.includes(flag)) flags.push(flag);
  };

  for (const tile of tiles){
    if (!tile || !tile.code) continue;
    counts[tile.code] = (counts[tile.code] | 0) + 1;
    const suit = String(tile.code).slice(-1);
    if (suitCounts[suit] != null) suitCounts[suit] += 1;
  }

  let score = 0;
  const doraCount = countCandidateDoraTiles(snapshot, candidate);
  const redCount = countCandidateRedFiveTiles(candidate);
  if (doraCount > 0){
    score += doraCount * 1.2;
    pushFlag("dora");
  }
  if (redCount > 0){
    score += redCount * 1.0;
    pushFlag("aka");
  }

  for (const [code, count] of Object.entries(counts)){
    if (count >= 2 && isYakuhaiLikeCodeForSeat(code, snapshot && snapshot.seatIndex)){
      score += (count >= 3) ? 2.6 : 1.7;
      pushFlag("yakuhai");
    }
  }

  const suitSummary = getCpuDiscardDominantSuitSummary(suitCounts);
  const maxSuitCount = suitSummary.dominantSuitCount;
  const otherSuitCount = suitSummary.otherSuitCount;
  if (maxSuitCount >= 6 && otherSuitCount <= 2 && (suitCounts.z || 0) >= 1){
    score += maxSuitCount >= 8 ? 2.8 : (maxSuitCount >= 7 ? 2.2 : 1.7);
    pushFlag("honitsu_like");
  }

  let pairLike = 0;
  let tripletLike = 0;
  for (const count of Object.values(counts)){
    if ((count | 0) >= 2) pairLike++;
    if ((count | 0) >= 3) tripletLike++;
  }
  if (pairLike >= 4 && tripletLike >= 1){
    score += 1.0;
    pushFlag("toitoi_like");
  }

  if (snapshot && snapshot.self && snapshot.self.isDealer){
    score += 0.4;
    pushFlag("dealer");
  }

  if (candidate && candidate.shantenAfter === 0){
    const improveCount = Number(candidate.improveCount) || 0;
    if (improveCount >= 8){
      score += improveCount >= 16 ? 1.4 : (improveCount >= 12 ? 1.0 : 0.6);
      pushFlag("shape_change");
    }
  }

  return { score, flags };
}

function estimateCpuDiscardFlushPlan(snapshot, candidate){
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  const out = {
    dominantSuit: "",
    dominantSuitCount: 0,
    otherSuitCount: 0,
    honorCount: 0,
    offSuitCount: 0,
    isHonitsuLike: false,
    isStrongHonitsuLike: false
  };
  if (!tiles.length) return out;

  const suitCounts = createCpuDiscardSuitCounts();
  for (const tile of tiles){
    if (!tile || !tile.code) continue;
    const suit = String(tile.code).slice(-1);
    if (suitCounts[suit] != null) suitCounts[suit] += 1;
  }

  const suitSummary = getCpuDiscardDominantSuitSummary(suitCounts);
  out.dominantSuit = suitSummary.dominantSuit;
  out.dominantSuitCount = suitSummary.dominantSuitCount;
  out.otherSuitCount = suitSummary.otherSuitCount;
  out.honorCount = suitCounts.z | 0;
  out.offSuitCount = out.otherSuitCount;
  out.isHonitsuLike = out.dominantSuitCount >= 6 && out.otherSuitCount <= 2 && out.honorCount >= 1;
  out.isStrongHonitsuLike = out.dominantSuitCount >= 8 && out.otherSuitCount <= 1 && out.honorCount >= 1;
  return out;
}

function estimateCpuDiscardPairPlan(snapshot, candidate){
  const tiles = candidate && Array.isArray(candidate.after13) ? candidate.after13 : [];
  const out = {
    pairLikeCount: 0,
    tripletLikeCount: 0,
    sequenceLinkCount: 0,
    maxSuitCount: 0,
    otherSuitCount: 0,
    isFlushLike: false,
    shouldThinPairs: false
  };
  if (!tiles.length) return out;

  const counts = Object.create(null);
  const suitCounts = createCpuDiscardSuitCounts();
  for (const tile of tiles){
    if (!tile || !tile.code) continue;
    const code = String(tile.code);
    counts[code] = (counts[code] | 0) + 1;
    const suit = code.slice(-1);
    if (suitCounts[suit] != null) suitCounts[suit] += 1;
  }

  for (const [code, countRaw] of Object.entries(counts)){
    const count = countRaw | 0;
    if (count >= 2) out.pairLikeCount++;
    if (count >= 3) out.tripletLikeCount++;

    const suit = code.slice(-1);
    if (suit === "z") continue;
    const num = Number(code[0]);
    if (!Number.isFinite(num)) continue;
    if (num <= 8 && (counts[`${num + 1}${suit}`] | 0) > 0) out.sequenceLinkCount++;
    if (num <= 7 && (counts[`${num + 2}${suit}`] | 0) > 0) out.sequenceLinkCount++;
  }

  const suitSummary = getCpuDiscardDominantSuitSummary(suitCounts);
  out.maxSuitCount = suitSummary.dominantSuitCount;
  out.otherSuitCount = suitSummary.otherSuitCount;
  out.isFlushLike = out.maxSuitCount >= 8 && out.otherSuitCount <= 2;
  out.shouldThinPairs = (
    out.pairLikeCount >= 4 &&
    out.tripletLikeCount <= 1 &&
    out.sequenceLinkCount >= 5 &&
    !out.isFlushLike
  );

  return out;
}

function isCpuDiscardProspectiveRiverFuriten(snapshot, candidate){
  if (!snapshot || !candidate || candidate.shantenAfter !== 0 || !Array.isArray(candidate.after13)) return false;
  if (typeof getCpuRiichiWaitCodesForLog !== "function") return false;

  const fixedMeldCount = snapshot && snapshot.self ? (Number(snapshot.self.fixedMeldCount) || 0) : 0;
  let waitCodes = [];
  try{
    waitCodes = getCpuRiichiWaitCodesForLog(candidate.after13, fixedMeldCount);
  }catch(e){
    waitCodes = [];
  }
  if (!Array.isArray(waitCodes) || waitCodes.length <= 0) return false;

  const waitSet = new Set(waitCodes);
  const selfRiver = snapshot && snapshot.self && Array.isArray(snapshot.self.river) ? snapshot.self.river : [];
  for (const tile of selfRiver){
    if (tile && tile.code && waitSet.has(tile.code)) return true;
  }

  const discardTile = candidate.discardTile;
  return !!(discardTile && discardTile.code && waitSet.has(discardTile.code));
}

function shouldCpuDiscardCandidateRiichi(snapshot, candidate, profile){
  if (!candidate || candidate.shantenAfter !== 0) return false;
  const context = buildCpuDiscardTableContext(snapshot, candidate);
  const tenpai = buildCpuDiscardTenpaiContext(snapshot, candidate);
  const damaValue = estimateCpuDiscardDamaValue(snapshot, candidate);
  const isProspectiveFuriten = isCpuDiscardProspectiveRiverFuriten(snapshot, candidate);
  const valueScale = clampCpuDiscardEval(1 + (context.winValueBias * 0.12), 0.65, 1.7);
  const isStrongRyanmen = tenpai.isRyanmenWait && tenpai.waitTileCount >= 4;
  const isWideRyanmen = tenpai.isRyanmenWait && tenpai.waitTileCount >= 6;
  const hasDamaReason = damaValue.score >= 1.0 || damaValue.flags.includes("yakuhai") || damaValue.flags.includes("honitsu_like") || damaValue.flags.includes("toitoi_like") || damaValue.flags.includes("shape_change");
  const isNoYakuHand = !hasDamaReason;
  // 「打点高いなら愚形でも立直」基準。ドラ赤役牌複合やホンイツクラスで score 3.5 以上を想定
  const isHighValueDama = damaValue.score >= 3.5;

  // --- 役なし愚形リーチの強制棄却（ユーザー要望：価値のない役なし愚形リーチを打たない）---
  // 役なし × 超悪形（待ち2枚以下の単種）は絶対にリーチしない（形式テンパイ or 聴牌外し候補）
  if (isNoYakuHand && tenpai.isVeryBadWait) return false;
  // 役なし × 悪形（待ち3枚以下）は、オーラスラス目で改善3枚以上のときだけ例外
  if (isNoYakuHand && tenpai.isBadWait && !(context.isLast && tenpai.waitTileCount >= 3)) return false;
  // 役なし × 醜形（待ち4枚以下の単種）は、オーラスでのみ例外（親でもダマ優先）
  if (isNoYakuHand && tenpai.isUglyWait && !context.isLast) return false;

  // --- 既存の否定条件（基本維持）---
  if (isProspectiveFuriten && !context.isLast && !isWideRyanmen) return false;
  if (tenpai.isMiddleKanchanWait && !context.isLast && !context.isDealer) return false;
  if (tenpai.isMiddleShaboWait && !context.isLast && !(context.isDealer && tenpai.waitTileCount >= 4)) return false;
  if (tenpai.isMiddleTankiWait && !context.isLast) return false;
  if (tenpai.isPenchanOnlyWait && !context.isLast && !(context.isDealer && context.threatCount <= 0 && tenpai.waitTileCount >= 3)) return false;
  if (context.threatCount > 0 && context.isTop && !tenpai.isExcellentWait) return false;
  if (context.phase === "end" && tenpai.isBadWait && !context.isLast) return false;
  if (tenpai.isBadWait && valueScale >= 1.15 && !context.isLast) return false;
  if (hasDamaReason && tenpai.isBadWait && !context.isLast && !(context.isDealer && context.threatCount <= 0 && tenpai.waitTileCount >= 4)) return false;
  if (damaValue.flags.includes("shape_change") && Number(candidate.improveCount) >= 12 && !tenpai.isExcellentWait && !context.isLast) return false;
  // 強化: 役あり愚形は基本ダマで変化を待つ。例外はオーラス親の高打点のみ
  if (tenpai.isUglyWait && hasDamaReason && !isHighValueDama && !(context.isLast && context.isDealer)) return false;
  // 強化: 超悪形はラス目か高打点でしかリーチしない（旧: threatCount<=1 縛りを撤廃）
  if (tenpai.isVeryBadWait && !isHighValueDama && !context.isLast) return false;
  // 最終強化（ユーザー要望：愚形リーチをさらに減らす）
  // 愚形待ち（単種≤4枚）は高打点（ダマ score>=3.5 = 跳満級相当）でない限り一律リーチ拒否。
  // オーラス親でも例外にしない。変化期待・手役成就はダマで狙わせる。
  // この規則は上の isUglyWait 系の条件を上書きする最後の門番として機能する
  if (tenpai.isUglyWait && !isHighValueDama) return false;
  if (hasDamaReason && damaValue.score >= 1.9 && !tenpai.isExcellentWait && !context.isLast && context.threatCount <= 1) return false;
  if (damaValue.score >= 2.8 && !context.isLast && !tenpai.isExcellentWait && !isStrongRyanmen) return false;
  if (damaValue.score >= 2.1 && tenpai.waitTileCount >= 4 && context.threatCount <= 1 && !context.isLast && !isWideRyanmen){
    return false;
  }
  if (isProspectiveFuriten && tenpai.waitTileCount < 6 && !context.isLast) return false;
  if (hasDamaReason && damaValue.score >= 2.0 && context.threatCount <= 1 && !context.isLast){
    return false;
  }
  if (hasDamaReason && damaValue.score >= 1.5 && tenpai.waitTileCount >= 5 && context.threatCount <= 0 && !context.isLast){
    return false;
  }
  if (hasDamaReason && damaValue.score >= 1.2 && tenpai.waitTileCount >= 4 && context.threatCount <= 0 && !context.isLast){
    return false;
  }

  // --- 肯定条件（オーラス救済を縮小・高打点愚形を解禁）---
  if (tenpai.isExcellentWait && tenpai.waitTileCount >= 7 && (!hasDamaReason || damaValue.score < 1.0 || context.isLast)) return true;
  // 縮小: オーラス救済は待ち3枚以上かつ(役あり or 醜形でない)に限定（旧: 2枚でも通っていた）
  if (context.isLast && tenpai.waitTileCount >= 3 && (!tenpai.isUglyWait || hasDamaReason)) return true;
  if (context.isDealer && isWideRyanmen && damaValue.score < 1.0) return true;
  if (isWideRyanmen && context.threatCount <= 1 && damaValue.score < 1.5) return true;
  if (isStrongRyanmen && context.threatCount <= 0 && context.phase !== "end" && damaValue.score < 0.8 && tenpai.waitTileCount >= 5) return true;
  if (tenpai.waitTileCount >= 7 && damaValue.score < 1.0) return true;
  // 新: 愚形でも高打点（ダマで跳満級）なら打点を活かしてリーチ（ユーザー「悪いなら高打点の時」）
  if (isHighValueDama && tenpai.waitTileCount >= 3 && context.threatCount <= 1) return true;

  return false;
}

function getCpuDiscardTenpaiBreakPenalty(snapshot, candidate, profile){
  if (!candidate || candidate.shantenAfter > 1) return 0;
  const context = buildCpuDiscardTableContext(snapshot, candidate);
  const tenpai = buildCpuDiscardTenpaiContext(snapshot, candidate);
  const base = Number(profile && profile.riichiReadyBonus) || 0;
  const shantenWeight = Number(profile && profile.shantenWeight) || 0;
  const currentShanten = snapshot && snapshot.self ? (Number(snapshot.self.currentShanten) || 0) : 99;
  const damaValue = estimateCpuDiscardDamaValue(snapshot, candidate);

  if (candidate.shantenAfter === 0){
    if (shouldCpuDiscardCandidateRiichi(snapshot, candidate, profile)) return 0;
    const hasDamaReason = damaValue.score >= 1.3 || damaValue.flags.includes("yakuhai") || damaValue.flags.includes("honitsu_like") || damaValue.flags.includes("toitoi_like") || damaValue.flags.includes("shape_change");
    const isNoYakuHand = !hasDamaReason;

    // --- 新: 聴牌外し誘導（役なし超悪形 / 役なし悪形で改善乏しい）---
    // shantenWeight に連動する強ペナルティで、1向聴側に強い候補があれば聴牌を崩す
    // base だけでは聴牌ペナルティが shantenWeight (例:220) を超えられず聴牌外しが実質起きないため、
    // 役なし超悪形のみ shantenWeight * 0.88 まで押し上げて拮抗圏に入れる
    if (isNoYakuHand && tenpai.isVeryBadWait && shantenWeight > 0){
      return clampCpuDiscardEval(shantenWeight * 0.88, 0, shantenWeight * 0.95);
    }
    // 役なし悪形で改善枚数も乏しい（=1向聴側に伸びしろがある想定）も外し寄りに
    if (isNoYakuHand && tenpai.isBadWait && Number(candidate.improveCount) <= 4 && shantenWeight > 0){
      return clampCpuDiscardEval(shantenWeight * 0.55, 0, shantenWeight * 0.7);
    }

    // --- 既存ペナルティ（基本維持）---
    if (context.threatCount > 0 && context.isTop && tenpai.isBadWait){
      return clampCpuDiscardEval(base * 1.15, 0, 42);
    }
    if (context.phase === "end" && tenpai.isBadWait && !context.isLast){
      return clampCpuDiscardEval(base * 1.05, 0, 36);
    }
    if (tenpai.isMiddleKanchanWait){
      return clampCpuDiscardEval(base * (hasDamaReason ? 1.18 : 1.02), 0, 38);
    }
    if (tenpai.isMiddleShaboWait){
      return clampCpuDiscardEval(base * (hasDamaReason ? 1.08 : 0.94), 0, 34);
    }
    if (tenpai.isMiddleTankiWait){
      return clampCpuDiscardEval(base * (hasDamaReason ? 1.16 : 1.02), 0, 36);
    }
    if (tenpai.isPenchanOnlyWait){
      return clampCpuDiscardEval(base * (hasDamaReason ? 0.98 : 0.84), 0, 30);
    }
    if (context.openThreatCount > 0 && context.phase === "end" && !context.isLast && !tenpai.isExcellentWait){
      return clampCpuDiscardEval(base * (tenpai.isBadWait ? 1.08 : 0.82), 0, 34);
    }
    if (context.openThreatCount >= 2 && (context.phase === "late" || context.phase === "end") && damaValue.score < 2.2 && tenpai.waitTileCount <= 4){
      return clampCpuDiscardEval(base * 0.88, 0, 30);
    }
    if (tenpai.isUglyWait && hasDamaReason){
      return clampCpuDiscardEval(base * (tenpai.isVeryBadWait ? 1.02 : 0.82), 0, 34);
    }
    if (tenpai.isVeryBadWait && Number(candidate.improveCount) >= 16){
      return clampCpuDiscardEval(base * 0.92, 0, 32);
    }
    if (tenpai.isBadWait){
      return clampCpuDiscardEval(base * 0.72, 0, 28);
    }
    return clampCpuDiscardEval(base * 0.26, 0, 12);
  }

  if (candidate.shantenAfter === 1 && currentShanten === 0){
    const oneShanten = estimateCpuDiscardOneShantenShape(snapshot, candidate);
    let bonus = 0;

    if (context.threatCount > 0 && context.isTop && !context.isDealer){
      bonus += base * 0.18;
    }
    if (context.phase === "end" || context.phase === "late"){
      bonus += base * 0.10;
    }
    if (context.isTop) bonus += base * 0.08;
    if (context.threatCount > 0) bonus += base * 0.12 * context.threatCount;
    if (Number(candidate.improveCount) >= 18) bonus += base * 0.12;
    if (Number(candidate.improveCount) >= 24) bonus += base * 0.08;
    if (oneShanten.isGoodShape) bonus += base * 0.14;
    if (oneShanten.waitTypeCount >= 3) bonus += base * 0.08;
    // 新: 好形1向聴（待ち種3+ かつ 改善24+）は聴牌外しを受け止める側に大きく上乗せ
    // shantenWeight 連動で、役なし超悪形の聴牌ペナルティ(0.88)と拮抗するレンジに到達させる
    if (oneShanten.isGoodShape && Number(candidate.improveCount) >= 24 && shantenWeight > 0){
      bonus += shantenWeight * 0.12;
    }

    // clamp 上限を shantenWeight 連動に拡張（旧: -24 固定）
    const clampMax = shantenWeight > 0 ? Math.max(24, shantenWeight * 0.18) : 24;
    return clampCpuDiscardEval(-bonus, -clampMax, 0);
  }

  return 0;
}

function evaluateCpuDiscardCandidate(snapshot, candidate, profile){
  const parts = [];
  if (!candidate || !candidate.discardTile) return null;
  const context = buildCpuDiscardTableContext(snapshot, candidate);
  const tenpai = buildCpuDiscardTenpaiContext(snapshot, candidate);
  const damaValue = estimateCpuDiscardDamaValue(snapshot, candidate);
  const pairPlan = estimateCpuDiscardPairPlan(snapshot, candidate);
  const flushPlan = estimateCpuDiscardFlushPlan(snapshot, candidate);
  const oneShantenShape = candidate.shantenAfter === 1 ? estimateCpuDiscardOneShantenShape(snapshot, candidate) : null;
  const twoShantenShape = candidate.shantenAfter === 2 ? estimateCpuDiscardTwoShantenShape(snapshot, candidate) : null;
  const speedScale = clampCpuDiscardEval(1 + (context.speedShapeBias * 0.10), 0.7, 1.5);
  const valueScale = clampCpuDiscardEval(1 + (context.winValueBias * 0.12), 0.65, 1.7);
  const riichiScale = clampCpuDiscardEval(1 + (context.meldRiichiBias * 0.10), 0.7, 1.5);
  const shouldRiichi = shouldCpuDiscardCandidateRiichi(snapshot, candidate, profile);

  pushCpuDiscardEvalPart(parts, "shanten", -(Number(candidate.shantenAfter) || 0) * (Number(profile.shantenWeight) || 0) * speedScale);
  pushCpuDiscardEvalPart(parts, "improve", (Number(candidate.improveCount) || 0) * (Number(profile.improveCountFactor) || 0) * speedScale);

  if (candidate.isDrawnDiscard){
    pushCpuDiscardEvalPart(parts, "drawn_discard_bonus", profile.drawnDiscardBonus);
  }

  const defenseParts = evaluateCpuDiscardDefense(snapshot, candidate, profile);
  if (Array.isArray(defenseParts) && defenseParts.length > 0){
    for (const part of defenseParts){
      if (part && part.key) parts.push(part);
    }
  }

  if (candidate.willRiichi && shouldRiichi){
    pushCpuDiscardEvalPart(parts, "riichi_ready_bonus", (Number(profile.riichiReadyBonus) || 0) * riichiScale);
  }

  const tenpaiBreakPenalty = getCpuDiscardTenpaiBreakPenalty(snapshot, candidate, profile);
  if (tenpaiBreakPenalty > 0){
    pushCpuDiscardEvalPart(parts, "bad_tenpai_penalty", -tenpaiBreakPenalty);
  } else if (tenpaiBreakPenalty < 0){
    pushCpuDiscardEvalPart(parts, "tenpai_break_bonus", -tenpaiBreakPenalty);
  }

  if (candidate.shantenAfter === 1 && oneShantenShape){
    if (oneShantenShape.isGoodShape){
      pushCpuDiscardEvalPart(parts, "one_shanten_good_shape_bonus", clampCpuDiscardEval(11.0 * speedScale, 0, 18));
    }
    if (oneShantenShape.isExcellentShape){
      pushCpuDiscardEvalPart(parts, "one_shanten_excellent_shape_bonus", clampCpuDiscardEval(8.0 * speedScale, 0, 13));
    }
    if (!oneShantenShape.isGoodShape && Number(candidate.improveCount) <= 16){
      pushCpuDiscardEvalPart(parts, "one_shanten_bad_shape_penalty", -clampCpuDiscardEval(7.5 * speedScale, 0, 12), `${oneShantenShape.waitTypeCount}type`);
    }
  }

  if (candidate.shantenAfter === 2 && twoShantenShape){
    if (twoShantenShape.isGoodShape){
      pushCpuDiscardEvalPart(parts, "two_shanten_shape_bonus", clampCpuDiscardEval((7.0 + (twoShantenShape.sequenceLinkCount * 0.9)) * speedScale, 0, 16));
    }
    if (twoShantenShape.sequenceLinkCount >= 5 && twoShantenShape.pairLikeCount <= 3){
      pushCpuDiscardEvalPart(parts, "two_shanten_ryanmen_route_bonus", clampCpuDiscardEval(6.8 * speedScale, 0, 12));
    }
    if (!twoShantenShape.isGoodShape && twoShantenShape.pairLikeCount >= 4){
      pushCpuDiscardEvalPart(parts, "two_shanten_pair_heavy_penalty", -clampCpuDiscardEval(5.8 * speedScale, 0, 10), `pairs=${twoShantenShape.pairLikeCount}`);
    }
  }

  const afterDoraCount = countCandidateDoraTiles(snapshot, candidate);
  pushCpuDiscardEvalPart(parts, "dora_keep_bonus", afterDoraCount * (Number(profile.doraKeepBonus) || 0) * valueScale);

  const afterRedCount = countCandidateRedFiveTiles(candidate);
  pushCpuDiscardEvalPart(parts, "red_keep_bonus", afterRedCount * (Number(profile.redKeepBonus) || 0) * valueScale);

  if (isCpuDiscardRedFiveTile(candidate.discardTile)){
    pushCpuDiscardEvalPart(parts, "red_discard_penalty", -(Number(profile.redDiscardPenalty) || 0) * valueScale);
  }

  const discardCode = candidate.discardTile && candidate.discardTile.code ? candidate.discardTile.code : "";
  const remainSameCode = countTileCodeInList(candidate.after13, discardCode);
  const discardSuit = String(discardCode || "").slice(-1);

  if (flushPlan.isHonitsuLike){
    const flushKeepBonus = clampCpuDiscardEval((flushPlan.isStrongHonitsuLike ? 6.0 : 4.2) * valueScale, 0, 11);
    const offSuitCutBonus = clampCpuDiscardEval((flushPlan.offSuitCount <= 1 ? 4.4 : 3.4) * valueScale, 0, 9);

    if (discardSuit && discardSuit !== "z" && discardSuit !== flushPlan.dominantSuit){
      pushCpuDiscardEvalPart(parts, "honitsu_offsuit_cut_bonus", offSuitCutBonus, `${discardCode}->${flushPlan.dominantSuit}`);
    } else if (discardSuit === flushPlan.dominantSuit){
      pushCpuDiscardEvalPart(parts, "honitsu_core_keep_bonus", flushKeepBonus, `${discardCode}->keep_${flushPlan.dominantSuit}`);
    } else if (discardSuit === "z" && flushPlan.honorCount >= 2 && !isYakuhaiLikeCodeForSeat(discardCode, snapshot && snapshot.seatIndex)){
      pushCpuDiscardEvalPart(parts, "honitsu_honor_balance_bonus", clampCpuDiscardEval(2.0 * valueScale, 0, 4.2), discardCode);
    }
  }

  if (pairPlan.shouldThinPairs && candidate.shantenAfter >= 1){
    const pairLockPenalty = clampCpuDiscardEval((pairPlan.pairLikeCount - 3) * 1.4, 0, 4.8);
    pushCpuDiscardEvalPart(parts, "pair_lock_penalty", -pairLockPenalty, `pairs=${pairPlan.pairLikeCount}/links=${pairPlan.sequenceLinkCount}`);

    if (remainSameCode === 1){
      pushCpuDiscardEvalPart(parts, "pair_release_bonus", 2.1 * speedScale, `code=${discardCode}`);
    }else if (remainSameCode >= 2){
      pushCpuDiscardEvalPart(parts, "pair_hold_penalty", -1.2, `code=${discardCode}`);
    }
  }

  if (remainSameCode >= 2 && isYakuhaiLikeCodeForSeat(discardCode, snapshot && snapshot.seatIndex)){
    pushCpuDiscardEvalPart(parts, "yakuhai_pair_keep_bonus", (Number(profile.honorPairKeepBonus) || 0) * valueScale);
  }

  if (isHonorCode(discardCode) && remainSameCode === 0){
    pushCpuDiscardEvalPart(parts, "isolated_honor_discard_bonus", profile.isolatedHonorDiscardBonus);
  }

  if (isTerminalCode(discardCode)){
    pushCpuDiscardEvalPart(parts, "terminal_discard_bonus", profile.terminalDiscardBonus);
  }

  if (context.threatCount > 0 && !context.isTenpai){
    // 守備重視強化（ユーザー要望：押しすぎ対策）:
    //  - isTop 0.42→0.54 / 非Top 0.26→0.36（非テンパイなら基本ベタ降り寄り）
    //  - late 1.12→1.22 / end 1.3→1.45（終盤はさらに降りやすく）
    //  - 上限 48→62（実質降り強度の天井を上げる）
    const foldPenalty = clampCpuDiscardEval(
      (Number(profile.riichiDangerPenalty) || 0)
        * (context.isTop ? 0.54 : 0.36)
        * context.threatCount
        * (context.phase === "late" ? 1.22 : (context.phase === "end" ? 1.45 : 1)),
      0,
      62
    );
    pushCpuDiscardEvalPart(parts, "threat_fold_bias", -foldPenalty);
  }

  if (context.isLast && context.threatCount > 0 && (context.isTenpai || context.isOneShanten)){
    pushCpuDiscardEvalPart(
      parts,
      "last_place_push_bonus",
      clampCpuDiscardEval((Number(profile.riichiReadyBonus) || 0) * 0.22 * context.threatCount, 0, 18)
    );
  }

  if (context.isDealer && context.isTenpai){
    pushCpuDiscardEvalPart(
      parts,
      "dealer_tenpai_push_bonus",
      clampCpuDiscardEval((Number(profile.riichiReadyBonus) || 0) * 0.16, 0, 10)
    );
  }

  if (candidate.shantenAfter === 0){
    // 両面以上率アップ（ユーザー要望：目指せ50%）:
    // 中張テンパイ維持ペナルティを全体的に強化し、1向聴戻しを選ばせやすくする
    if (tenpai.isMiddleKanchanWait){
      pushCpuDiscardEvalPart(parts, "middle_kanchan_tenpai_penalty", -clampCpuDiscardEval(22 * speedScale, 0, 30), `${tenpai.waitTileCount}wait`);
    }
    if (tenpai.isMiddleShaboWait){
      pushCpuDiscardEvalPart(parts, "middle_shabo_tenpai_penalty", -clampCpuDiscardEval(16 * speedScale, 0, 24), `${tenpai.waitTileCount}wait`);
    }
    if (tenpai.isMiddleTankiWait){
      pushCpuDiscardEvalPart(parts, "middle_tanki_tenpai_penalty", -clampCpuDiscardEval(17 * speedScale, 0, 26), `${tenpai.waitTileCount}wait`);
    }
    if (tenpai.isPenchanOnlyWait){
      pushCpuDiscardEvalPart(parts, "penchan_tenpai_penalty", -clampCpuDiscardEval(12 * speedScale, 0, 18), `${tenpai.waitTileCount}wait`);
    }
    // 強化: 愚形テンパイで改善枚数がある場合に、1向聴戻しを受け入れやすくするため減点を強化。
    // 再調整（両面以上率アップ）: 閾値 6→4、ベース 8→10、低打点係数 0.34→0.42、上限 26→32。
    // 高打点ダマは減点を緩めて聴牌維持（ダマテンパイ）を優先させる。
    if (tenpai.isUglyWait && Number(candidate.improveCount) >= 4){
      const uglyBreakCoef = (damaValue.score >= 3.5) ? 0.20 : 0.42;
      pushCpuDiscardEvalPart(parts, "ugly_wait_shape_change_penalty", -clampCpuDiscardEval((10 + (Number(candidate.improveCount) * uglyBreakCoef)) * speedScale, 0, 32), `${Number(candidate.improveCount) || 0}improve`);
    }
  }

  if (!shouldRiichi && damaValue.score > 0 && candidate.shantenAfter === 0){
    pushCpuDiscardEvalPart(
      parts,
      "dama_value_bonus",
      clampCpuDiscardEval(damaValue.score * 4.6, 0, 26),
      damaValue.flags.join("/")
    );
  }
  if (!shouldRiichi && candidate.shantenAfter === 0 && tenpai.isRyanmenWait && damaValue.score >= 1.4){
    pushCpuDiscardEvalPart(
      parts,
      "good_wait_dama_bonus",
      clampCpuDiscardEval((damaValue.score * 2.1) + (tenpai.waitTileCount * 0.28), 0, 12),
      `${tenpai.waitTileCount}wait`
    );
  }
  if (!shouldRiichi && candidate.shantenAfter === 0 && damaValue.flags.includes("shape_change") && Number(candidate.improveCount) >= 8){
    pushCpuDiscardEvalPart(
      parts,
      "shape_change_dama_bonus",
      clampCpuDiscardEval((Number(candidate.improveCount) * 0.38) + (tenpai.waitTypeCount * 1.2), 0, 12),
      `${Number(candidate.improveCount) || 0}improve`
    );
  }

  const score = sumCpuDiscardEvalParts(parts);
  const reasonTags = buildCpuDiscardReasonTags(candidate, profile);
  if (parts.some((part)=> part && part.key === "riichi_genbutsu_bonus")) reasonTags.push("riichi_genbutsu");
  if (parts.some((part)=> part && part.key === "riichi_suji_bonus")) reasonTags.push("riichi_suji");
  if (parts.some((part)=> part && part.key === "riichi_one_chance_bonus")) reasonTags.push("riichi_one_chance");
  if (parts.some((part)=> part && part.key === "riichi_danger_penalty")) reasonTags.push("riichi_danger");
  if (parts.some((part)=> part && part.key === "riichi_honor_shape_bonus")) reasonTags.push("riichi_honor_safe");
  if (parts.some((part)=> part && part.key === "riichi_terminal_shape_bonus")) reasonTags.push("riichi_terminal_safe");
  if (parts.some((part)=> part && part.key === "riichi_middle_shape_penalty")) reasonTags.push("riichi_middle_danger");
  if (parts.some((part)=> part && part.key === "dealer_riichi_table_penalty")) reasonTags.push("dealer_riichi_danger");
  if (parts.some((part)=> part && part.key === "multi_riichi_table_penalty")) reasonTags.push("multi_riichi_danger");
  if (parts.some((part)=> part && part.key === "open_yakuhai_danger_penalty")) reasonTags.push("open_yakuhai_danger");
  if (parts.some((part)=> part && part.key === "open_flush_danger_penalty")) reasonTags.push("open_flush_danger");
  if (parts.some((part)=> part && part.key === "open_triplet_danger_penalty")) reasonTags.push("open_triplet_danger");
  if (parts.some((part)=> part && part.key === "open_honor_follow_danger_penalty")) reasonTags.push("open_honor_danger");
  if (parts.some((part)=> part && part.key === "red_keep_bonus")) reasonTags.push("aka_keep");
  if (parts.some((part)=> part && part.key === "red_discard_penalty")) reasonTags.push("aka_discard");
  if (parts.some((part)=> part && part.key === "threat_fold_bias")) reasonTags.push("threat_fold");
  if (parts.some((part)=> part && part.key === "last_place_push_bonus")) reasonTags.push("last_push");
  if (parts.some((part)=> part && part.key === "dealer_tenpai_push_bonus")) reasonTags.push("dealer_push");
  if (parts.some((part)=> part && part.key === "bad_tenpai_penalty")) reasonTags.push("bad_tenpai");
  if (parts.some((part)=> part && part.key === "tenpai_break_bonus")) reasonTags.push("tenpai_break");
  if (parts.some((part)=> part && part.key === "dama_value_bonus")) reasonTags.push("dama_value");
  if (parts.some((part)=> part && part.key === "good_wait_dama_bonus")) reasonTags.push("good_wait_dama");
  if (parts.some((part)=> part && part.key === "shape_change_dama_bonus")) reasonTags.push("shape_change_dama");
  if (parts.some((part)=> part && part.key === "middle_kanchan_tenpai_penalty")) reasonTags.push("middle_kanchan_tenpai");
  if (parts.some((part)=> part && part.key === "middle_shabo_tenpai_penalty")) reasonTags.push("middle_shabo_tenpai");
  if (parts.some((part)=> part && part.key === "middle_tanki_tenpai_penalty")) reasonTags.push("middle_tanki_tenpai");
  if (parts.some((part)=> part && part.key === "penchan_tenpai_penalty")) reasonTags.push("penchan_tenpai");
  if (parts.some((part)=> part && part.key === "ugly_wait_shape_change_penalty")) reasonTags.push("ugly_wait_shape_change");
  if (parts.some((part)=> part && part.key === "one_shanten_good_shape_bonus")) reasonTags.push("one_shanten_good_shape");
  if (parts.some((part)=> part && part.key === "one_shanten_excellent_shape_bonus")) reasonTags.push("one_shanten_excellent_shape");
  if (parts.some((part)=> part && part.key === "one_shanten_bad_shape_penalty")) reasonTags.push("one_shanten_bad_shape");
  if (parts.some((part)=> part && part.key === "two_shanten_shape_bonus")) reasonTags.push("two_shanten_shape");
  if (parts.some((part)=> part && part.key === "two_shanten_ryanmen_route_bonus")) reasonTags.push("two_shanten_ryanmen_route");
  if (parts.some((part)=> part && part.key === "two_shanten_pair_heavy_penalty")) reasonTags.push("two_shanten_pair_heavy");
  if (parts.some((part)=> part && part.key === "honitsu_offsuit_cut_bonus")) reasonTags.push("honitsu_cut");
  if (parts.some((part)=> part && part.key === "honitsu_core_keep_bonus")) reasonTags.push("honitsu_keep");
  if (parts.some((part)=> part && part.key === "pair_release_bonus")) reasonTags.push("pair_release");
  if (parts.some((part)=> part && part.key === "pair_lock_penalty")) reasonTags.push("pair_lock");
  if (candidate.willRiichi && !shouldRiichi) reasonTags.push("dama_keep");

  return {
    discardTileId: candidate.discardTile.id,
    discardIndex: candidate.discardIndex,
    discardCode,
    isDrawnDiscard: !!candidate.isDrawnDiscard,
    shantenAfter: Number(candidate.shantenAfter) || 0,
    improveCount: Number(candidate.improveCount) || 0,
    willRiichi: !!candidate.willRiichi && shouldRiichi,
    originalWillRiichi: !!candidate.willRiichi,
    score,
    parts,
    reasonTags,
    tenpaiInfo: tenpai,
    damaValue,
    candidate
  };
}

function compareCpuDiscardEvalEntries(a, b){
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  if (a.score > b.score) return -1;
  if (a.score < b.score) return 1;

  if (a.shantenAfter < b.shantenAfter) return -1;
  if (a.shantenAfter > b.shantenAfter) return 1;

  if (a.improveCount > b.improveCount) return -1;
  if (a.improveCount < b.improveCount) return 1;

  const aCode = a.discardCode || "";
  const bCode = b.discardCode || "";
  if (aCode < bCode) return -1;
  if (aCode > bCode) return 1;

  return 0;
}

function evaluateCpuDiscardSnapshot(snapshot, profileOverride = null){
  if (!snapshot || !Array.isArray(snapshot.candidates) || snapshot.candidates.length <= 0) return null;

  const profile = getCpuDiscardEvalProfile(snapshot, profileOverride);
  if (!profile) return null;

  const entries = [];
  for (const candidate of snapshot.candidates){
    const entry = evaluateCpuDiscardCandidate(snapshot, candidate, profile);
    if (entry) entries.push(entry);
  }

  if (entries.length <= 0) return null;
  entries.sort(compareCpuDiscardEvalEntries);

  const best = entries[0];
  const reasonTags = Array.isArray(best.reasonTags) ? best.reasonTags.slice() : [];

  return {
    kind: "cpuDiscardShadowEval",
    engine: "cpu_discard_eval_v1",
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.seatIndex,
    profileKey: profile.key || (typeof getCpuDiscardSeatProfileKey === "function" ? getCpuDiscardSeatProfileKey(snapshot.seatIndex) : "balanced"),
    profileLabel: profile.label || profile.key || "Profile",
    profileBaseKey: profile.baseProfileKey || "",
    externalStyleKey: profile.externalStyleKey || (snapshot && snapshot.externalStyle && snapshot.externalStyle.key ? snapshot.externalStyle.key : ""),
    styleScale: Number.isFinite(profile.styleScale) ? profile.styleScale : null,
    mappingVersion: profile.mappingVersion || "",
    profileMeta: (typeof cloneCpuDiscardInternalStyleProfileMeta === "function")
      ? cloneCpuDiscardInternalStyleProfileMeta(profile)
      : null,
    discardTileId: best.discardTileId,
    discardIndex: best.discardIndex,
    discardCode: best.discardCode,
    action: "discard",
    willRiichi: !!best.willRiichi,
    reasonTag: reasonTags[0] || "",
    reasonTags,
    bestScore: best.score,
    entries: entries.map((entry)=>(
      {
        discardTileId: entry.discardTileId,
        discardIndex: entry.discardIndex,
        discardCode: entry.discardCode,
        score: entry.score,
        shantenAfter: entry.shantenAfter,
        improveCount: entry.improveCount,
        isDrawnDiscard: entry.isDrawnDiscard,
        willRiichi: entry.willRiichi,
        originalWillRiichi: entry.originalWillRiichi,
        tenpaiInfo: entry.tenpaiInfo,
        damaValue: entry.damaValue,
        parts: entry.parts,
        reasonTags: entry.reasonTags
      }
    )),
    createdAt: Date.now()
  };
}

function buildCpuDiscardShadowDecision(snapshot, profileOverride = null){
  const evalResult = evaluateCpuDiscardSnapshot(snapshot, profileOverride);
  if (!evalResult) return null;

  return {
    action: "discard",
    discardTileId: evalResult.discardTileId,
    discardIndex: evalResult.discardIndex,
    discardCode: evalResult.discardCode,
    willRiichi: !!evalResult.willRiichi,
    note: "internal_shadow_eval",
    reasonTag: evalResult.reasonTag,
    reasonTags: evalResult.reasonTags,
    meta: {
      engine: evalResult.engine,
      profileKey: evalResult.profileKey,
      profileBaseKey: evalResult.profileBaseKey,
      externalStyleKey: evalResult.externalStyleKey,
      styleScale: evalResult.styleScale,
      mappingVersion: evalResult.mappingVersion,
      profileMeta: evalResult.profileMeta,
      bestScore: evalResult.bestScore,
      topEntries: evalResult.entries.slice(0, 3)
    }
  };
}

function summarizeCpuDiscardEvalForMeta(evalResult){
  if (!evalResult || typeof evalResult !== "object") return null;
  return {
    engine: evalResult.engine || "cpu_discard_eval_v1",
    profileKey: evalResult.profileKey || "balanced",
    discardTileId: evalResult.discardTileId,
    discardIndex: evalResult.discardIndex,
    discardCode: evalResult.discardCode,
    bestScore: Number(evalResult.bestScore) || 0,
    reasonTag: evalResult.reasonTag || "",
    reasonTags: Array.isArray(evalResult.reasonTags) ? evalResult.reasonTags.slice() : []
  };
}

try{
  if (typeof window !== "undefined"){
    window.evaluateCpuDiscardSnapshot = evaluateCpuDiscardSnapshot;
    window.buildCpuDiscardShadowDecision = buildCpuDiscardShadowDecision;
    window.summarizeCpuDiscardEvalForMeta = summarizeCpuDiscardEvalForMeta;
  }
}catch(e){}
