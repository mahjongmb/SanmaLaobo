// MBsanma/js/seisan.js
// ========= seisan.js（点数移動・供託・終局判定） =========
// 役割：
// - 和了 / 流局時の点数移動内容を作る
// - result閉じ時に1回だけ scores へ反映する
// - 供託 / 聴牌料 / 本場 / 飛び / オーラス終了を扱う
//
// 注意：
// - render系では状態変更しない
// - 実際の score 変更は applyPendingRoundSettlement() だけで行う

function getRuleValueForSeisan(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getRuleNumberForSeisan(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getNumber === "function"){
      const value = window.MBSanmaRulesConfig.getNumber(key, fallback);
      return Number.isFinite(value) ? value : fallback;
    }
  }catch(e){}
  const raw = Number(getRuleValueForSeisan(key, fallback));
  return Number.isFinite(raw) ? raw : fallback;
}

function isRuleOnForSeisan(key, fallback){
  const raw = String(getRuleValueForSeisan(key, fallback ? "on" : "off") || "").toLowerCase();
  if (raw === "on") return true;
  if (raw === "off") return false;
  return !!fallback;
}

function getConfiguredStartScoreForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("overview-start-score", 35000)));
}

function getConfiguredReturnScoreForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("overview-return-score", 40000)));
}

function getConfiguredGameTypeForSeisan(){
  return String(getRuleValueForSeisan("overview-game-type", "hanchan") || "").toLowerCase() === "tonpuu" ? "tonpuu" : "hanchan";
}

function getConfiguredRenchanTypeForSeisan(){
  return String(getRuleValueForSeisan("overview-renchan-type", "tenpai") || "").toLowerCase() === "agari" ? "agari" : "tenpai";
}

function isHakoshitaEnabledForSeisan(){
  return isRuleOnForSeisan("score-hakoshita-type", false);
}

function isTobiEndEnabledForSeisan(){
  return isRuleOnForSeisan("score-tobi-end", true);
}

function getConfiguredColdEndPointForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("score-cold-end-point", 80000)));
}

function getConfiguredHonbaRonForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("score-honba-ron", 1000)));
}

function getConfiguredHonbaTsumoEachForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("score-honba-tsumo-each", 1000)));
}

function getConfiguredTenpaiFeeForSeisan(){
  return Math.max(0, Math.round(getRuleNumberForSeisan("score-tenpai-fee", 1000)));
}

function getConfiguredRateValueForSeisan(){
  const raw = String(getRuleValueForSeisan("overview-rate", "100p") || "").toLowerCase();
  const match = raw.match(/(\d+(?:\.\d+)?)\s*p/);
  const value = match ? Number(match[1]) : Number(raw);
  if (Number.isFinite(value) && value > 0) return value;
  return 100;
}

function getConfiguredRateMultiplierForSeisan(){
  return getConfiguredRateValueForSeisan() / 100;
}

function getConfiguredChipUnitForSeisan(){
  const raw = Number(getRuleNumberForSeisan("overview-chip-unit", 100));
  if (!Number.isFinite(raw) || raw < 0) return 1;
  return raw / 100;
}

function getConfiguredTobiChipCountForSeisan(){
  const tobiChipPoint = Math.max(0, Math.round(getRuleNumberForSeisan("score-tobi-chip", 100)));
  const chipUnitPoint = Math.max(1, Math.round(getRuleNumberForSeisan("overview-chip-unit", 100)));
  return Math.max(0, Math.round(tobiChipPoint / chipUnitPoint));
}

function isKeishikiTenpaiEnabledForSeisan(){
  return isRuleOnForSeisan("basic-keishiki-tenpai", true);
}

function getSeatWindForSeisan(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return null;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const diff = (seatIndex - dealerSeat + 3) % 3;
  if (diff === 0) return "東";
  if (diff === 1) return "南";
  return "西";
}

function getMeldListForSettlementSeat(seat){
  if (seat === 0) return Array.isArray(melds) ? melds.slice() : [];
  if (seat === 1) return (typeof cpuRightMelds !== "undefined" && Array.isArray(cpuRightMelds)) ? cpuRightMelds.slice() : [];
  if (seat === 2) return (typeof cpuLeftMelds !== "undefined" && Array.isArray(cpuLeftMelds)) ? cpuLeftMelds.slice() : [];
  return [];
}

function getPeisForSettlementSeat(seat){
  if (seat === 0) return Array.isArray(peis) ? peis.slice() : [];
  if (seat === 1) return (typeof cpuRightPeis !== "undefined" && Array.isArray(cpuRightPeis)) ? cpuRightPeis.slice() : [];
  if (seat === 2) return (typeof cpuLeftPeis !== "undefined" && Array.isArray(cpuLeftPeis)) ? cpuLeftPeis.slice() : [];
  return [];
}

function isSeatRiichiForSeisan(seat){
  if (seat === 0) return !!isRiichi;
  try{
    if (typeof isCpuRiichiSeat === "function") return !!isCpuRiichiSeat(seat);
  }catch(e){}
  if (seat === 1) return !!(typeof cpuRightRiichi !== "undefined" && cpuRightRiichi);
  if (seat === 2) return !!(typeof cpuLeftRiichi !== "undefined" && cpuLeftRiichi);
  return false;
}

function hasYakuTenpaiWithSettlementTiles(tiles, fixedM, seat){
  if (!Array.isArray(tiles) || typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return false;
  if (typeof getAgariYakuInfo !== "function") return true;

  const meldList = getMeldListForSettlementSeat(seat);
  const seatWind = getSeatWindForSeisan(seat);
  const roundWindValue = (typeof roundWind !== "undefined") ? roundWind : null;
  const doraList = Array.isArray(doraIndicators) ? doraIndicators.slice() : [];
  const uraList = Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [];
  const peiList = getPeisForSettlementSeat(seat);
  const isRiichiSeat = isSeatRiichiForSeisan(seat);

  for (const code of TILE_TYPES){
    if (!code) continue;
    try{
      const tiles14 = tiles.slice();
      tiles14.push({ code });
      const info = getAgariYakuInfo({
        tiles14,
        meldList,
        winType: "ron",
        winTileCode: code,
        isRiichi: isRiichiSeat,
        roundWind: roundWindValue,
        seatWind,
        doraIndicators: doraList,
        uraDoraIndicators: uraList,
        peis: peiList
      });
      if (info && info.isAgari && (((info.yakuman | 0) > 0) || ((info.han | 0) > 0))) return true;
    }catch(e){}
  }

  return false;
}

function getConfiguredOkaValueForSeisan(){
  return ((getConfiguredReturnScoreForSeisan() - getConfiguredStartScoreForSeisan()) / 1000) * 3;
}

function normalizeScoreState(){
  if (!Array.isArray(scores) || scores.length !== 3){
    const startScore = getConfiguredStartScoreForSeisan();
    scores = [startScore, startScore, startScore];
  }

  for (let i = 0; i < 3; i++){
    if (!Number.isFinite(scores[i])) scores[i] = getConfiguredStartScoreForSeisan();
    scores[i] = scores[i] | 0;
  }

  if (!Number.isFinite(kyotakuCount)) kyotakuCount = 0;
  kyotakuCount = Math.max(0, kyotakuCount | 0);

  if (typeof pendingRoundSettlement === "undefined"){
    pendingRoundSettlement = null;
  }
}

function resetScoreStateForNewHanchan(){
  const startScore = getConfiguredStartScoreForSeisan();
  scores = [startScore, startScore, startScore];
  kyotakuCount = 0;
  pendingRoundSettlement = null;

  try{
    if (typeof resetHanchanSeatStats === "function"){
      resetHanchanSeatStats();
    }
  }catch(e){}
}

function cloneScoreArray(src){
  if (!Array.isArray(src)) return [0, 0, 0];
  return [
    Number.isFinite(src[0]) ? (src[0] | 0) : 0,
    Number.isFinite(src[1]) ? (src[1] | 0) : 0,
    Number.isFinite(src[2]) ? (src[2] | 0) : 0
  ];
}

function getCurrentRiichiDepositorSeats(){
  try{
    if (typeof window !== "undefined" && typeof window.getCommittedRiichiStickSeats === "function"){
      const seats = window.getCommittedRiichiStickSeats();
      if (Array.isArray(seats)){
        return seats.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
      }
    }
  }catch(e){}

  const seats = [];
  for (let seat = 0; seat < 3; seat++){
    try{
      if (typeof window !== "undefined" && typeof window.hasCommittedRiichiStickForSeat === "function"){
        if (window.hasCommittedRiichiStickForSeat(seat)) seats.push(seat);
      }
    }catch(e){}
  }
  return seats;
}
function getNagashiQualifiedSeatsForSettlement(){
  if (Array.isArray(lastNagashiWinnerSeatIndexes) && lastNagashiWinnerSeatIndexes.length > 0){
    return lastNagashiWinnerSeatIndexes.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
  }

  try{
    if (typeof getNagashiBaimanQualifiedSeatsFromState === "function"){
      const seats = getNagashiBaimanQualifiedSeatsFromState();
      if (Array.isArray(seats)){
        return seats.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
      }
    }
  }catch(e){}

  return [];
}

function getNagashiScoreInfoForSeat(seatIndex){
  if (typeof createNagashiBaimanYakuInfo !== "function") return null;
  if (typeof calcSanmaScoreFromInfo !== "function") return null;

  try{
    const info = createNagashiBaimanYakuInfo(seatIndex);
    if (!info) return null;
    return calcSanmaScoreFromInfo(info, seatIndex, "nagashi");
  }catch(e){
    return null;
  }
}

function getTilesForSettlementSeat(seat){
  if (seat === 0){
    const arr = [];
    if (Array.isArray(hand13)) arr.push(...hand13);
    if (drawn) arr.push(drawn);
    return arr;
  }

  if (seat === 1){
    return Array.isArray(cpuRightHand13) ? cpuRightHand13.slice() : [];
  }

  if (seat === 2){
    return Array.isArray(cpuLeftHand13) ? cpuLeftHand13.slice() : [];
  }

  return [];
}

function getFixedMForSettlementSeat(seat){
  if (seat === 0){
    return Array.isArray(melds) ? melds.length : 0;
  }
  if (typeof getCpuFixedMeldCountBySeat === "function"){
    return getCpuFixedMeldCountBySeat(seat);
  }
  return 0;
}

function isTenpaiWithSettlementTiles(tiles, fixedM, seat = null){
  try{
    const counts = countsFromTiles(tiles);
    const sh = (typeof calcShanten === "function") ? calcShanten(counts, fixedM) : 99;
    if (sh !== 0) return false;
    if (isKeishikiTenpaiEnabledForSeisan()) return true;
    return hasYakuTenpaiWithSettlementTiles(Array.isArray(tiles) ? tiles.slice() : [], fixedM, seat);
  }catch(e){
    return false;
  }
}

function getExpectedConcealedTileCountAtRyukyoku(fixedM){
  const n = 13 - ((Number(fixedM) || 0) * 3);
  return Math.max(0, n | 0);
}

function isSeatTenpaiAtRyukyoku(seat){
  const tiles = getTilesForSettlementSeat(seat);
  const fixedM = getFixedMForSettlementSeat(seat);
  const expectedConcealedCount = getExpectedConcealedTileCountAtRyukyoku(fixedM);
  const expectedWithDrawCount = expectedConcealedCount + 1;

  if (tiles.length === expectedConcealedCount){
    return isTenpaiWithSettlementTiles(tiles, fixedM, seat);
  }

  if (tiles.length === expectedWithDrawCount){
    for (let i = 0; i < tiles.length; i++){
      const cand = tiles.slice();
      cand.splice(i, 1);
      if (isTenpaiWithSettlementTiles(cand, fixedM, seat)) return true;
    }
    return false;
  }

  return false;
}

function getRyukyokuTenpaiSeats(){
  const seats = [];
  for (let seat = 0; seat < 3; seat++){
    if (isSeatTenpaiAtRyukyoku(seat)) seats.push(seat);
  }
  return seats;
}

function getOtherSeatIndexes(baseSeat){
  const list = [];
  for (let seat = 0; seat < 3; seat++){
    if (seat !== baseSeat) list.push(seat);
  }
  return list;
}

function addDelta(delta, seatIndex, amount){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  if (!Number.isFinite(amount) || amount === 0) return;
  delta[seatIndex] = (delta[seatIndex] | 0) + (amount | 0);
}

function getPreviousSeatIndexForSettlement(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return null;
  return (seatIndex + 2) % 3;
}

function getTobiBustSeatIndexes(afterScores){
  const list = [];
  const scoresArr = Array.isArray(afterScores) ? afterScores : [];
  for (let seat = 0; seat < 3; seat++){
    const value = Number(scoresArr[seat]) || 0;
    if (value <= 0) list.push(seat);
  }
  return list;
}

function getRonTobiRecipientSeatFromSettlement(settlement, bustSeat){
  if (!settlement) return null;

  if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
    const winnerSeats = settlement.agariEntries
      .map((entry)=> entry && entry.winnerSeatIndex)
      .filter((seat)=> seat === 0 || seat === 1 || seat === 2);

    if (winnerSeats.length <= 0) return null;
    if (winnerSeats.length === 1) return winnerSeats[0];

    const kamichaSeat = getPreviousSeatIndexForSettlement(bustSeat);
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

function getRyukyokuTobiRecipientSeatFromSettlement(settlement, bustSeat){
  if (!settlement || !Array.isArray(settlement.tenpaiSeats)) return null;

  const tenpaiSeats = settlement.tenpaiSeats.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
  if (tenpaiSeats.length <= 0) return null;
  if (tenpaiSeats.length === 1) return tenpaiSeats[0];

  const kamichaSeat = getPreviousSeatIndexForSettlement(bustSeat);
  if (kamichaSeat === 0 || kamichaSeat === 1 || kamichaSeat === 2){
    if (tenpaiSeats.includes(kamichaSeat)) return kamichaSeat;
  }

  return tenpaiSeats[0];
}

function getTobiChipRecipientSeatFromSettlement(settlement, bustSeat){
  if (!settlement) return null;
  if (bustSeat !== 0 && bustSeat !== 1 && bustSeat !== 2) return null;

  if (settlement.type === "agari"){
    if (settlement.winType === "tsumo"){
      return (settlement.winnerSeatIndex === 0 || settlement.winnerSeatIndex === 1 || settlement.winnerSeatIndex === 2)
        ? settlement.winnerSeatIndex
        : null;
    }

    if (settlement.winType === "ron"){
      return getRonTobiRecipientSeatFromSettlement(settlement, bustSeat);
    }
  }

  if (settlement.type === "ryukyoku"){
    return getRyukyokuTobiRecipientSeatFromSettlement(settlement, bustSeat);
  }

  return null;
}

function getHighestScoreSeatForSettlement(scoreList, bustSeat){
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

function getNoBustAdjustedScoresForSettlement(scoreList, settlement){
  const adjusted = cloneScoreArray(scoreList);
  if (isHakoshitaEnabledForSeisan()){
    return adjusted;
  }

  const bustSeats = getTobiBustSeatIndexes(adjusted);
  if (bustSeats.length <= 0){
    return adjusted;
  }

  for (const bustSeat of bustSeats){
    const rawScore = Number(adjusted[bustSeat]) || 0;
    if (rawScore >= 0) continue;

    const deficit = -rawScore;
    adjusted[bustSeat] = 0;

    let recipientSeat = getTobiChipRecipientSeatFromSettlement(settlement, bustSeat);
    if (recipientSeat !== 0 && recipientSeat !== 1 && recipientSeat !== 2){
      recipientSeat = getHighestScoreSeatForSettlement(adjusted, bustSeat);
    }

    if (recipientSeat !== 0 && recipientSeat !== 1 && recipientSeat !== 2) continue;
    if (recipientSeat === bustSeat) continue;

    adjusted[recipientSeat] = (Number(adjusted[recipientSeat]) || 0) - deficit;
  }

  return adjusted;
}

function applyTobiChipStatsFromSettlement(settlement){
  if (!settlement || !Array.isArray(settlement.afterScores)) return;

  const tobiChipCount = getConfiguredTobiChipCountForSeisan();
  if (tobiChipCount <= 0) return;

  const bustSeats = getTobiBustSeatIndexes(settlement.afterScores);
  if (bustSeats.length <= 0) return;

  for (const bustSeat of bustSeats){
    const recipientSeat = getTobiChipRecipientSeatFromSettlement(settlement, bustSeat);
    if (recipientSeat !== 0 && recipientSeat !== 1 && recipientSeat !== 2) continue;
    if (recipientSeat === bustSeat) continue;

    addHanchanEndSeatStatSafe(bustSeat, "chip", -tobiChipCount);
    addHanchanEndSeatStatSafe(recipientSeat, "chip", tobiChipCount);
  }
}


function cloneSettlementDetailValue(value){
  try{
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }catch(e){
    return null;
  }
}

function scoreInfoToSettlementPoint(scoreInfo, winType){
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

function buildSettlementResultMeta(entryLike, info, scoreInfo, chipInfo){
  const entry = entryLike && typeof entryLike === "object" ? entryLike : {};
  return {
    roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
    roundNumber: (typeof roundNumber !== "undefined") ? (Number(roundNumber) || 0) : 0,
    honba: (typeof honba !== "undefined") ? (Number(honba) || 0) : 0,
    eastSeatIndex: (typeof eastSeatIndex !== "undefined") ? (Number(eastSeatIndex) || 0) : 0,
    winnerSeatIndex: Number.isInteger(entry.winnerSeatIndex) ? entry.winnerSeatIndex : null,
    discarderSeatIndex: Number.isInteger(entry.discarderSeatIndex) ? entry.discarderSeatIndex : null,
    winType: typeof entry.winType === "string" ? entry.winType : "",
    pointText: scoreInfo && typeof scoreInfo.displayText === "string" ? scoreInfo.displayText : "",
    honbaText: scoreInfo && typeof scoreInfo.honbaDisplayText === "string" ? scoreInfo.honbaDisplayText : "",
    chipText: chipInfo && typeof chipInfo.displayText === "string" ? chipInfo.displayText : "",
    isDealerWin: scoreInfo && typeof scoreInfo.isDealer !== "undefined" ? !!scoreInfo.isDealer : null,
    isMenzen: info && typeof info.isMenzen !== "undefined" ? !!info.isMenzen : null,
    handKind: info && typeof info.handKind === "string" ? info.handKind : "",
    configuredTsumoson: isRuleOnForSeisan("score-tsumoson", false),
    configuredRoundingType: String(getRuleValueForSeisan("score-rounding-type", "ceil") || "ceil").toLowerCase() === "ari" ? "ari" : "ceil"
  };
}

function buildSettlementAgariDetailPayload(entryLike, info, scoreInfo){
  const entry = entryLike && typeof entryLike === "object" ? entryLike : {};
  let chipInfo = null;
  try{
    if (typeof buildResultChipInfoByEntry === "function"){
      chipInfo = buildResultChipInfoByEntry(entry);
    }
  }catch(e){
    chipInfo = null;
  }

  return {
    pointText: scoreInfo && typeof scoreInfo.displayText === "string" ? scoreInfo.displayText : "",
    pointValue: scoreInfoToSettlementPoint(scoreInfo, entry.winType),
    han: Number.isFinite(Number(info && info.han)) ? Number(info.han) : null,
    fu: Number.isFinite(Number(info && info.fu)) ? Number(info.fu) : null,
    totalHan: Number.isFinite(Number(info && info.totalHan)) ? Number(info.totalHan) : null,
    yakuman: Number.isFinite(Number(info && info.yakuman)) ? Number(info.yakuman) : null,
    yaku: cloneSettlementDetailValue(info && info.yaku),
    bonus: cloneSettlementDetailValue(info && info.bonus),
    yakuInfo: cloneSettlementDetailValue(info),
    chipInfo: cloneSettlementDetailValue(chipInfo),
    resultMeta: buildSettlementResultMeta(entry, info, scoreInfo, chipInfo)
  };
}

function buildNagashiSettlement(){
  normalizeScoreState();

  const winnerSeats = getNagashiQualifiedSeatsForSettlement();
  if (winnerSeats.length <= 0) return null;

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const honbaCount = (typeof honba === "number" && Number.isFinite(honba)) ? Math.max(0, honba | 0) : 0;
  const honbaBonusPerPayer = honbaCount * getConfiguredHonbaTsumoEachForSeisan();
  const agariEntries = [];

  for (const winnerSeatIndex of winnerSeats){
    const scoreInfo = getNagashiScoreInfoForSeat(winnerSeatIndex);
    if (!scoreInfo) continue;

    const nagashiInfo = (typeof createNagashiBaimanYakuInfo === "function") ? createNagashiBaimanYakuInfo(winnerSeatIndex) : null;
    const nagashiEntry = {
      winType: "nagashi",
      winnerSeatIndex,
      discarderSeatIndex: null,
      scoreInfo,
      headWinner: false
    };
    Object.assign(nagashiEntry, buildSettlementAgariDetailPayload(nagashiEntry, nagashiInfo, scoreInfo));
    agariEntries.push(nagashiEntry);

    const loserSeats = getOtherSeatIndexes(winnerSeatIndex);

    for (const seat of loserSeats){
      let total = 0;
      if (scoreInfo.isDealer){
        total = (Number.isFinite(scoreInfo.payAll) ? (scoreInfo.payAll | 0) : 0) + honbaBonusPerPayer;
      } else {
        const payDealer = Number.isFinite(scoreInfo.payDealer) ? (scoreInfo.payDealer | 0) : 0;
        const payChild = Number.isFinite(scoreInfo.payChild) ? (scoreInfo.payChild | 0) : 0;
        total = ((seat === dealerSeat) ? payDealer : payChild) + honbaBonusPerPayer;
      }

      addDelta(delta, seat, -total);
      addDelta(delta, winnerSeatIndex, total);
    }
  }

  if (agariEntries.length <= 0) return null;

  agariEntries[0].headWinner = true;

  const kyotakuPoint = (previousKyotakuCount + currentHandKyotakuCount) * 1000;
  if (kyotakuPoint > 0){
    addDelta(delta, agariEntries[0].winnerSeatIndex, kyotakuPoint);
  }

  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  const nagashiSettlement = {
    type: "agari",
    winType: "nagashi",
    winnerSeatIndex: agariEntries[0].winnerSeatIndex,
    discarderSeatIndex: null,
    beforeScores,
    delta,
    afterScores,
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: 0,
    agariEntries
  };
  Object.assign(nagashiSettlement, buildSettlementAgariDetailPayload(agariEntries[0], agariEntries[0].yakuInfo, agariEntries[0].scoreInfo));
  return nagashiSettlement;
}

// ================================
// パオ（責任払い）判定
// ================================

function isYakumanPaoEnabled(){
  return getRuleValueForSeisan("extra-yakuman-pao", "on") !== "off";
}

function isDaiminkanPaoEnabled(){
  return getRuleValueForSeisan("extra-daiminkan-pao", "on") !== "off";
}

function getYakumanPaoSeatForWinner(winnerSeat, info){
  if (!info || !Array.isArray(info.yaku)) return null;
  const yakuKeys = info.yaku.map((y) => y && y.key).filter(Boolean);

  const hasDaisangen = yakuKeys.includes("daisangen");
  const hasDaisuushii = yakuKeys.includes("daisuushii");
  if (!hasDaisangen && !hasDaisuushii) return null;

  const winnerMelds = getMeldListForSettlementSeat(winnerSeat);

  if (hasDaisangen){
    const dragonCodes = new Set(["5z", "6z", "7z"]);
    const dragonMelds = winnerMelds.filter((m) => m && (m.type === "pon" || m.type === "minkan") && dragonCodes.has(m.code));
    if (dragonMelds.length === 3){
      const paoSeat = dragonMelds[dragonMelds.length - 1].fromSeatIndex;
      if (Number.isInteger(paoSeat) && paoSeat !== winnerSeat) return paoSeat;
    }
  }

  if (hasDaisuushii){
    const windCodes = new Set(["1z", "2z", "3z", "4z"]);
    const windMelds = winnerMelds.filter((m) => m && (m.type === "pon" || m.type === "minkan") && windCodes.has(m.code));
    if (windMelds.length === 4){
      const paoSeat = windMelds[windMelds.length - 1].fromSeatIndex;
      if (Number.isInteger(paoSeat) && paoSeat !== winnerSeat) return paoSeat;
    }
  }

  return null;
}

function getDaiminkanPaoSeatForWinner(winnerSeat, info){
  if (!info || !info.input || !info.input.isRinshan) return null;
  const winnerMelds = getMeldListForSettlementSeat(winnerSeat);
  for (let i = winnerMelds.length - 1; i >= 0; i--){
    const m = winnerMelds[i];
    if (m && m.type === "minkan"){
      const paoSeat = m.fromSeatIndex;
      if (Number.isInteger(paoSeat) && paoSeat !== winnerSeat) return paoSeat;
      break;
    }
  }
  return null;
}

function buildAgariSettlement(){
  const winner = (typeof lastAgariWinnerSeatIndex === "number") ? lastAgariWinnerSeatIndex : null;
  const winType = lastAgariType;
  if (winner == null) return null;
  if (winType !== "tsumo" && winType !== "ron") return null;

  const info = (typeof getResultYakuInfo === "function") ? getResultYakuInfo() : null;
  const scoreInfo = (typeof calcSanmaScoreFromInfo === "function")
    ? calcSanmaScoreFromInfo(info, winner, winType)
    : null;

  if (!scoreInfo) return null;

  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const honbaCount = (typeof honba === "number" && Number.isFinite(honba)) ? Math.max(0, honba | 0) : 0;
  const honbaBonusRon = honbaCount * getConfiguredHonbaRonForSeisan();
  const honbaBonusTsumoEach = honbaCount * getConfiguredHonbaTsumoEachForSeisan();

  // パオ判定
  let paoSeatIndex = null;
  let paoType = null;

  const isYakuman = info && (info.yakuman | 0) > 0;
  if (winType === "tsumo" && isDaiminkanPaoEnabled()){
    const daiminkanPaoSeat = getDaiminkanPaoSeatForWinner(winner, info);
    if (daiminkanPaoSeat != null){
      paoSeatIndex = daiminkanPaoSeat;
      paoType = "daiminkan";
    }
  }
  if (paoType == null && isYakuman && isYakumanPaoEnabled()){
    const yakumanPaoSeat = getYakumanPaoSeatForWinner(winner, info);
    if (yakumanPaoSeat != null){
      paoSeatIndex = yakumanPaoSeat;
      paoType = "yakuman";
    }
  }

  if (paoType === "daiminkan"){
    // 嶺上ツモ後の大明槓パオ: ロン点として大明槓者が全額
    const ronScoreInfo = (typeof calcSanmaScoreFromInfo === "function")
      ? calcSanmaScoreFromInfo(info, winner, "ron")
      : null;
    const ronPoint = (ronScoreInfo && Number.isFinite(ronScoreInfo.ronPoint)) ? (ronScoreInfo.ronPoint | 0) : 0;
    const total = ronPoint + honbaBonusRon;
    addDelta(delta, paoSeatIndex, -total);
    addDelta(delta, winner, total);

  } else if (paoType === "yakuman" && winType === "tsumo"){
    // 役満パオ（ツモ）: ロン点でパオ者が全額
    const ronScoreInfo = (typeof calcSanmaScoreFromInfo === "function")
      ? calcSanmaScoreFromInfo(info, winner, "ron")
      : null;
    const ronPoint = (ronScoreInfo && Number.isFinite(ronScoreInfo.ronPoint)) ? (ronScoreInfo.ronPoint | 0) : 0;
    const total = ronPoint + honbaBonusRon;
    addDelta(delta, paoSeatIndex, -total);
    addDelta(delta, winner, total);

  } else if (paoType === "yakuman" && winType === "ron"){
    // 役満パオ（ロン）: 基本点折半、本場は放銃者持ち
    const discarder = (typeof lastAgariDiscarderSeatIndex === "number") ? lastAgariDiscarderSeatIndex : null;
    if (discarder == null) return null;
    const ronPoint = (Number.isFinite(scoreInfo.ronPoint) ? (scoreInfo.ronPoint | 0) : 0);
    if (discarder === paoSeatIndex){
      // 放銃者=パオ者: 通常ロンと同じ
      addDelta(delta, discarder, -(ronPoint + honbaBonusRon));
      addDelta(delta, winner, ronPoint + honbaBonusRon);
    } else {
      const half = Math.round(ronPoint / 2);
      const rest = ronPoint - half;
      addDelta(delta, paoSeatIndex, -half);
      addDelta(delta, discarder, -(rest + honbaBonusRon));
      addDelta(delta, winner, ronPoint + honbaBonusRon);
    }

  } else if (winType === "tsumo"){
    // 通常ツモ
    const payAll = Number.isFinite(scoreInfo.payAll) ? (scoreInfo.payAll | 0) : 0;
    const payChild = Number.isFinite(scoreInfo.payChild) ? (scoreInfo.payChild | 0) : 0;
    const payDealer = Number.isFinite(scoreInfo.payDealer) ? (scoreInfo.payDealer | 0) : 0;
    const loserSeats = getOtherSeatIndexes(winner);

    for (const seat of loserSeats){
      let total = 0;
      if (scoreInfo.isDealer){
        total = payAll + honbaBonusTsumoEach;
      } else {
        total = ((seat === dealerSeat) ? payDealer : payChild) + honbaBonusTsumoEach;
      }

      addDelta(delta, seat, -total);
      addDelta(delta, winner, total);
    }
  } else {
    // 通常ロン
    const discarder = (typeof lastAgariDiscarderSeatIndex === "number") ? lastAgariDiscarderSeatIndex : null;
    if (discarder == null) return null;

    const total = (Number.isFinite(scoreInfo.ronPoint) ? (scoreInfo.ronPoint | 0) : 0) + honbaBonusRon;
    addDelta(delta, discarder, -total);
    addDelta(delta, winner, total);
  }

  const kyotakuPoint = (previousKyotakuCount + currentHandKyotakuCount) * 1000;
  if (kyotakuPoint > 0){
    addDelta(delta, winner, kyotakuPoint);
  }

  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  const agariEntryLike = {
    winType,
    winnerSeatIndex: winner,
    discarderSeatIndex: (typeof lastAgariDiscarderSeatIndex === "number") ? lastAgariDiscarderSeatIndex : null,
    ronTile: (typeof lastAgariRonTile !== "undefined" && lastAgariRonTile && lastAgariRonTile.code)
      ? { code: lastAgariRonTile.code, imgCode: lastAgariRonTile.imgCode || lastAgariRonTile.code }
      : null
  };

  const settlement = {
    type: "agari",
    winType,
    winnerSeatIndex: winner,
    discarderSeatIndex: agariEntryLike.discarderSeatIndex,
    scoreInfo,
    beforeScores,
    delta,
    afterScores,
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: 0,
    paoSeatIndex,
    paoType
  };

  Object.assign(settlement, buildSettlementAgariDetailPayload(agariEntryLike, info, scoreInfo));
  return settlement;
}

function getAgariQueueForSettlement(){
  try{
    if (typeof window !== "undefined" && typeof window.getAgariResultQueue === "function"){
      const queue = window.getAgariResultQueue();
      return Array.isArray(queue) ? queue.slice() : [];
    }
  }catch(e){}
  return [];
}

function hasAgariResultQueueForSettlement(){
  return getAgariQueueForSettlement().length > 0;
}

function getHeadAgariQueueEntryForSettlement(queue){
  const list = Array.isArray(queue) ? queue : [];
  return list.find((entry)=> entry && entry.headWinner) || list[0] || null;
}

function getResultYakuInfoFromEntryForSettlement(entry){
  try{
    if (!entry) return null;
    if (typeof getResultYakuInfoByEntry === "function"){
      return getResultYakuInfoByEntry(entry);
    }
  }catch(e){}
  return null;
}

function buildCombinedSettlementFromAgariQueue(){
  const queue = getAgariQueueForSettlement();
  if (queue.length <= 0) return null;

  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const honbaCount = (typeof honba === "number" && Number.isFinite(honba)) ? Math.max(0, honba | 0) : 0;
  const honbaBonusRon = honbaCount * getConfiguredHonbaRonForSeisan();
  const headEntry = getHeadAgariQueueEntryForSettlement(queue);

  for (const entry of queue){
    if (!entry || entry.winType !== "ron") continue;
    const winner = entry.winnerSeatIndex;
    const discarder = entry.discarderSeatIndex;
    if (winner == null || discarder == null) continue;

    const info = getResultYakuInfoFromEntryForSettlement(entry);
    const scoreInfo = (typeof calcSanmaScoreFromInfo === "function")
      ? calcSanmaScoreFromInfo(info, winner, "ron")
      : null;
    if (!scoreInfo) continue;

    entry.scoreInfo = scoreInfo;
    Object.assign(entry, buildSettlementAgariDetailPayload(entry, info, scoreInfo));

    const total = (Number.isFinite(scoreInfo.ronPoint) ? (scoreInfo.ronPoint | 0) : 0) + honbaBonusRon;
    addDelta(delta, discarder, -total);
    addDelta(delta, winner, total);
  }


  const kyotakuWinner = headEntry ? headEntry.winnerSeatIndex : null;
  const kyotakuPoint = (previousKyotakuCount + currentHandKyotakuCount) * 1000;
  if (kyotakuWinner != null && kyotakuPoint > 0){
    addDelta(delta, kyotakuWinner, kyotakuPoint);
  }

  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  const combinedSettlement = {
    type: "agari",
    winType: "ron",
    winnerSeatIndex: headEntry ? headEntry.winnerSeatIndex : null,
    discarderSeatIndex: headEntry ? headEntry.discarderSeatIndex : null,
    beforeScores,
    delta,
    afterScores,
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: 0,
    agariEntries: queue.slice(),
    headEntry
  };

  if (headEntry){
    Object.assign(combinedSettlement, buildSettlementAgariDetailPayload(headEntry, headEntry.yakuInfo, headEntry.scoreInfo));
  }

  return combinedSettlement;
}

function buildRyukyokuSettlement(){
  normalizeScoreState();

  const beforeScores = cloneScoreArray(scores);
  const delta = [0, 0, 0];
  const tenpaiSeats = getRyukyokuTenpaiSeats();
  const riichiSeats = getCurrentRiichiDepositorSeats();
  const previousKyotakuCount = kyotakuCount | 0;
  const currentHandKyotakuCount = riichiSeats.length | 0;
  const tenpaiFee = getConfiguredTenpaiFeeForSeisan();

  if (tenpaiSeats.length === 1){
    const winner = tenpaiSeats[0];
    const losers = getOtherSeatIndexes(winner);
    for (const seat of losers){
      addDelta(delta, seat, -tenpaiFee);
      addDelta(delta, winner, tenpaiFee);
    }
  } else if (tenpaiSeats.length === 2){
    const loser = [0, 1, 2].find((seat)=> !tenpaiSeats.includes(seat));
    if (typeof loser === "number"){
      addDelta(delta, loser, -(tenpaiFee * 2));
      for (const seat of tenpaiSeats){
        addDelta(delta, seat, tenpaiFee);
      }
    }
  }


  const afterScores = [
    beforeScores[0] + delta[0],
    beforeScores[1] + delta[1],
    beforeScores[2] + delta[2]
  ];

  return {
    type: "ryukyoku",
    winType: "ryukyoku",
    winnerSeatIndex: null,
    discarderSeatIndex: null,
    beforeScores,
    delta,
    afterScores,
    tenpaiSeats: tenpaiSeats.slice(),
    riichiSeats: riichiSeats.slice(),
    previousKyotakuCount,
    currentHandKyotakuCount,
    nextKyotakuCount: previousKyotakuCount + currentHandKyotakuCount
  };
}

function buildCurrentRoundSettlement(){
  let settlement = null;

  // ここではキャッシュしない。
  // result描画中に先に精算を確定してしまうと、
  // その後に参照したい最新の供託本数や状態が反映されず、
  // 「流局表示では4本なのに次局で2本へ戻る」ようなズレが起きる。
  // 実際の確定は applyPendingRoundSettlement() 側で行う。
  if (hasAgariResultQueueForSettlement()){
    settlement = buildCombinedSettlementFromAgariQueue();
  } else if (lastAgariType === "nagashi"){
    settlement = buildNagashiSettlement();
  } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
    settlement = buildAgariSettlement();
  } else if (lastAgariType === "ryukyoku"){
    settlement = buildRyukyokuSettlement();
  }

  return settlement;
}

function clearPendingRoundSettlement(){
  pendingRoundSettlement = null;
}

function addHanchanEndSeatStatSafe(seatIndex, key, amount = 1){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  if (!Number.isFinite(amount) || amount === 0) return;

  try{
    if (typeof incrementHanchanSeatStat === "function"){
      incrementHanchanSeatStat(seatIndex, key, amount);
      return;
    }
  }catch(e){}

  try{
    if (key === "riichi" && Array.isArray(hanchanRiichiCounts)){
      hanchanRiichiCounts[seatIndex] = (Number(hanchanRiichiCounts[seatIndex]) || 0) + (amount | 0);
    }
    if (key === "agari" && Array.isArray(hanchanAgariCounts)){
      hanchanAgariCounts[seatIndex] = (Number(hanchanAgariCounts[seatIndex]) || 0) + (amount | 0);
    }
    if ((key === "hoju" || key === "houju") && Array.isArray(hanchanHojuCounts)){
      hanchanHojuCounts[seatIndex] = (Number(hanchanHojuCounts[seatIndex]) || 0) + (amount | 0);
    }
    if ((key === "chip" || key === "chips") && Array.isArray(hanchanChipCounts)){
      hanchanChipCounts[seatIndex] = (Number(hanchanChipCounts[seatIndex]) || 0) + (amount | 0);
    }
  }catch(e){}
}

function applyHanchanChipStatsFromEntry(entry){
  if (!entry) return;
  if (typeof buildResultChipInfoByEntry !== "function") return;

  let chipInfo = null;
  try{
    chipInfo = buildResultChipInfoByEntry(entry);
  }catch(e){
    chipInfo = null;
  }

  if (!chipInfo || !Array.isArray(chipInfo.delta)) return;

  for (let seat = 0; seat < 3; seat++){
    const amount = Number.isFinite(chipInfo.delta[seat]) ? (chipInfo.delta[seat] | 0) : 0;
    if (amount !== 0){
      addHanchanEndSeatStatSafe(seat, "chip", amount);
    }
  }
}

function applyHanchanSeatStatsFromSettlement(settlement){
  if (!settlement) return;

  const riichiSeatSet = new Set();
  if (Array.isArray(settlement.riichiSeats)){
    for (const seat of settlement.riichiSeats){
      if (seat === 0 || seat === 1 || seat === 2){
        riichiSeatSet.add(seat);
      }
    }
  }

  for (const seat of riichiSeatSet){
    addHanchanEndSeatStatSafe(seat, "riichi", 1);
  }

  if (settlement.type !== "agari") return;

  const agariSeatSet = new Set();

  if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
    for (const entry of settlement.agariEntries){
      if (!entry) continue;
      const seat = entry.winnerSeatIndex;
      if (seat === 0 || seat === 1 || seat === 2){
        agariSeatSet.add(seat);
      }
    }
  } else if (settlement.winnerSeatIndex === 0 || settlement.winnerSeatIndex === 1 || settlement.winnerSeatIndex === 2){
    agariSeatSet.add(settlement.winnerSeatIndex);
  }

  for (const seat of agariSeatSet){
    addHanchanEndSeatStatSafe(seat, "agari", 1);
  }

  if (settlement.winType === "ron"){
    const discarderSeat = (settlement.headEntry && (settlement.headEntry.discarderSeatIndex === 0 || settlement.headEntry.discarderSeatIndex === 1 || settlement.headEntry.discarderSeatIndex === 2))
      ? settlement.headEntry.discarderSeatIndex
      : settlement.discarderSeatIndex;

    if (discarderSeat === 0 || discarderSeat === 1 || discarderSeat === 2){
      addHanchanEndSeatStatSafe(discarderSeat, "hoju", 1);
    }
  }

  if (Array.isArray(settlement.agariEntries) && settlement.agariEntries.length > 0){
    for (const entry of settlement.agariEntries){
      if (!entry || entry.winType === "nagashi") continue;
      applyHanchanChipStatsFromEntry(entry);
    }
    applyTobiChipStatsFromSettlement(settlement);
    return;
  }

  if (settlement.type === "agari" && (settlement.winType === "tsumo" || settlement.winType === "ron")){
    applyHanchanChipStatsFromEntry({
      winType: settlement.winType,
      winnerSeatIndex: settlement.winnerSeatIndex,
      discarderSeatIndex: settlement.discarderSeatIndex,
      ronTile: (settlement.headEntry && settlement.headEntry.ronTile) ? settlement.headEntry.ronTile : null
    });
  }

  applyTobiChipStatsFromSettlement(settlement);
}

function applyPendingRoundSettlement(){
  const settlement = pendingRoundSettlement || buildCurrentRoundSettlement();
  if (!settlement) return null;

  normalizeScoreState();

  try{
    applyHanchanSeatStatsFromSettlement(settlement);
  }catch(e){}

  scores = settlement.afterScores.slice();
  kyotakuCount = Math.max(0, settlement.nextKyotakuCount | 0);
  pendingRoundSettlement = null;

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.recordSettlement === "function"){
      window.MBSanmaMatchLog.recordSettlement(settlement);
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.resetCommittedRiichiStickState === "function"){
      window.resetCommittedRiichiStickState();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function"){
      window.clearAgariResultQueue();
    }
  }catch(e){}

  return settlement;
}

function isSeatTopOrTiedForTop(scoreList, seatIndex){
  if (!Array.isArray(scoreList)) return false;
  const me = Number(scoreList[seatIndex]) || 0;
  for (let i = 0; i < scoreList.length; i++){
    if (i === seatIndex) continue;
    const other = Number(scoreList[i]) || 0;
    if (other > me) return false;
  }
  return true;
}

function getHanchanEndReasonAfterSettlement(settlement){
  if (!settlement || !Array.isArray(settlement.afterScores)) return null;

  const afterScores = settlement.afterScores.slice();

  if (isTobiEndEnabledForSeisan()){
    for (let seat = 0; seat < afterScores.length; seat++){
      if ((afterScores[seat] | 0) <= 0){
        return {
          end: true,
          reason: `${typeof resultSeatName === "function" ? resultSeatName(seat) : ("席" + seat)}がトビ`
        };
      }
    }
  }

  const coldEndPoint = getConfiguredColdEndPointForSeisan();
  if (coldEndPoint > 0){
    for (let seat = 0; seat < afterScores.length; seat++){
      if ((afterScores[seat] | 0) >= coldEndPoint){
        return {
          end: true,
          reason: `${typeof resultSeatName === "function" ? resultSeatName(seat) : ("席" + seat)}が${coldEndPoint}点到達`
        };
      }
    }
  }

  const finalWind = getConfiguredGameTypeForSeisan() === "tonpuu" ? "東" : "南";
  if (roundWind === finalWind && (roundNumber | 0) === 3){
    const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
    const renchanType = getConfiguredRenchanTypeForSeisan();
    let dealerKeeps = false;

    const headEntry = getHeadAgariQueueEntryForSettlement(getAgariQueueForSettlement());
    if (headEntry && (headEntry.winType === "tsumo" || headEntry.winType === "ron")){
      dealerKeeps = (headEntry.winnerSeatIndex === dealerSeat);
    } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
      dealerKeeps = (lastAgariWinnerSeatIndex === dealerSeat);
    } else if (lastAgariType === "nagashi"){
      dealerKeeps = Array.isArray(lastNagashiWinnerSeatIndexes) && lastNagashiWinnerSeatIndexes.includes(dealerSeat);
    } else if (lastAgariType === "ryukyoku"){
      dealerKeeps = (renchanType === "tenpai") ? (lastRyukyokuDealerTenpai === true) : false;
    }

    if (!dealerKeeps){
      return {
        end: true,
        reason: `${finalWind}3 親流れ終了`
      };
    }

    if (isSeatTopOrTiedForTop(afterScores, dealerSeat)){
      return {
        end: true,
        reason: `${finalWind}3 親トップ終了`
      };
    }
  }

  return null;
}

function getHanchanEndSeatStatNumber(seatIndex, key){
  try{
    if (typeof window !== "undefined"){
      if (window.hanchanSeatStats && window.hanchanSeatStats[seatIndex] && Number.isFinite(window.hanchanSeatStats[seatIndex][key])){
        return window.hanchanSeatStats[seatIndex][key] | 0;
      }
      if (window.hanchanStats && window.hanchanStats[seatIndex] && Number.isFinite(window.hanchanStats[seatIndex][key])){
        return window.hanchanStats[seatIndex][key] | 0;
      }
      if (window.hanchanStatsBySeat && window.hanchanStatsBySeat[seatIndex] && Number.isFinite(window.hanchanStatsBySeat[seatIndex][key])){
        return window.hanchanStatsBySeat[seatIndex][key] | 0;
      }
    }
  }catch(e){}

  try{
    if (key === "riichi" && Array.isArray(hanchanRiichiCounts) && Number.isFinite(hanchanRiichiCounts[seatIndex])){
      return hanchanRiichiCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if (key === "agari" && Array.isArray(hanchanAgariCounts) && Number.isFinite(hanchanAgariCounts[seatIndex])){
      return hanchanAgariCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if ((key === "hoju" || key === "houju") && Array.isArray(hanchanHojuCounts) && Number.isFinite(hanchanHojuCounts[seatIndex])){
      return hanchanHojuCounts[seatIndex] | 0;
    }
  }catch(e){}

  try{
    if ((key === "chip" || key === "chips") && Array.isArray(hanchanChipCounts) && Number.isFinite(hanchanChipCounts[seatIndex])){
      return hanchanChipCounts[seatIndex] | 0;
    }
  }catch(e){}

  return null;
}

function formatHanchanEndCountText(value){
  if (!Number.isFinite(value)) return "—";
  return `${value | 0}回`;
}

function formatHanchanChipCountText(value){
  if (!Number.isFinite(value)) return "—";
  const n = value | 0;
  if (n > 0) return `+${n}枚`;
  if (n < 0) return `${n}枚`;
  return "0枚";
}

function getHanchanUmaByRank(rows){
  const secondScore = rows && rows[1] ? (Number(rows[1].score) || 0) : 0;
  const normalUma2 = Math.round(getRuleNumberForSeisan("score-uma-2", -5));
  const normalUma3 = Math.round(getRuleNumberForSeisan("score-uma-3", -10));
  const kubiEnabled = isRuleOnForSeisan("score-kubi-enabled", false);
  const kubiPoint = Math.round(getRuleNumberForSeisan("score-kubi-point", 40000));
  const kubiUma2 = Math.round(getRuleNumberForSeisan("score-kubi-uma-2", 5));
  const kubiUma3 = Math.round(getRuleNumberForSeisan("score-kubi-uma-3", -15));

  const useKubi = kubiEnabled && secondScore >= kubiPoint;
  const uma2 = useKubi ? kubiUma2 : normalUma2;
  const uma3 = useKubi ? kubiUma3 : normalUma3;
  const oka = getConfiguredOkaValueForSeisan();
  const topUma = oka - uma2 - uma3;

  return [topUma, uma2, uma3];
}

function calcHanchanFinalScoreValue(point, rankIndex, rows){
  const rawPoint = Number(point) || 0;
  const scorePoint = isHakoshitaEnabledForSeisan() ? rawPoint : Math.max(0, rawPoint);
  const base = (scorePoint - getConfiguredReturnScoreForSeisan()) / 1000;
  const scaledBase = base * getConfiguredRateMultiplierForSeisan();
  const umaByRank = getHanchanUmaByRank(rows);
  return scaledBase + (Number(umaByRank[rankIndex]) || 0);
}

function calcHanchanTotalScoreValue(point, rankIndex, rows, chipCount){
  const baseScore = calcHanchanFinalScoreValue(point, rankIndex, rows);
  const chipScore = (Number(chipCount) || 0) * getConfiguredChipUnitForSeisan();
  return baseScore + chipScore;
}

function formatHanchanChipDetailText(value){
  if (!Number.isFinite(value)) return "(0)";
  const n = (value | 0) * getConfiguredChipUnitForSeisan();
  if (n > 0) return `(+${n.toFixed(1)})`;
  if (n < 0) return `(${n.toFixed(1)})`;
  return "(0)";
}

function formatHanchanFinalScoreText(value){
  const n = Number.isFinite(value) ? value : 0;
  const sign = n > 0 ? "+" : "";
  return `(${sign}${n.toFixed(1)})`;
}

function formatHanchanTotalScoreText(value){
  const n = Number.isFinite(value) ? value : 0;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}`;
}

function makeHanchanEndHeaderCell(text, align = "center", isCompact = false){
  const cell = document.createElement("div");
  cell.textContent = text;
  cell.style.fontSize = isCompact ? "11px" : "15px";
  cell.style.fontWeight = "800";
  cell.style.color = "rgba(235,244,255,0.92)";
  cell.style.letterSpacing = "0.04em";
  cell.style.textAlign = align;
  cell.style.whiteSpace = "nowrap";
  return cell;
}

function makeHanchanEndCountCell(text, isCompact = false){
  const cell = document.createElement("div");
  cell.textContent = text;
  cell.style.fontSize = isCompact ? "18px" : "28px";
  cell.style.fontWeight = "900";
  cell.style.lineHeight = "1";
  cell.style.color = "#ffffff";
  cell.style.textAlign = "center";
  cell.style.whiteSpace = "nowrap";
  return cell;
}

function isCompactLandscapePhoneForHanchanEnd(){
  try{
    if (typeof window !== "undefined" && typeof window.isCompactLandscapePhoneForResult === "function") return !!window.isCompactLandscapePhoneForResult();
    return window.matchMedia("(orientation: landscape) and (max-height: 520px)").matches;
  }catch(e){
    return false;
  }
}

function getHanchanEndGridTemplateColumns(isCompact = false){
  if (isCompact){
    return "68px minmax(84px, 0.82fr) minmax(124px, 1.10fr) minmax(96px, 0.72fr) repeat(4, minmax(54px, 0.44fr))";
  }
  return "92px minmax(132px, 0.95fr) minmax(220px, 1.45fr) minmax(150px, 0.95fr) repeat(4, minmax(90px, 0.62fr))";
}

function getHanchanEndRowBackground(item, rankIndex){
  if (!item) return "rgba(255,255,255,0.07)";

  if (item.seat === 0 && rankIndex === 0){
    return "linear-gradient(90deg, rgba(104,176,255,0.22), rgba(255,214,100,0.15), rgba(255,255,255,0.08))";
  }

  if (item.seat === 0){
    return "linear-gradient(90deg, rgba(104,176,255,0.22), rgba(255,255,255,0.08))";
  }

  if (rankIndex === 0){
    return "linear-gradient(90deg, rgba(255,214,100,0.12), rgba(255,255,255,0.08))";
  }

  if (rankIndex === 2){
    return "linear-gradient(90deg, rgba(255,132,132,0.08), rgba(255,255,255,0.06))";
  }

  return "rgba(255,255,255,0.07)";
}

function getHanchanEndRowBorder(item, rankIndex){
  if (!item) return "1px solid rgba(255,255,255,0.06)";

  if (item.seat === 0){
    return "1px solid rgba(126,194,255,0.44)";
  }

  if (rankIndex === 0){
    return "1px solid rgba(255,220,138,0.24)";
  }

  if (rankIndex === 2){
    return "1px solid rgba(255,158,158,0.16)";
  }

  return "1px solid rgba(255,255,255,0.06)";
}

function getHanchanEndRowShadow(item){
  if (!item) return "0 10px 24px rgba(0,0,0,0.16)";

  if (item.seat === 0){
    return "0 0 0 1px rgba(104,176,255,0.14), 0 16px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)";
  }

  return "0 10px 24px rgba(0,0,0,0.16)";
}

function makeHanchanEndNameCell(item, isCompact = false){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = isCompact ? "6px" : "10px";
  wrap.style.minWidth = "0";

  const name = document.createElement("div");
  name.textContent = item && item.name ? item.name : "";
  name.style.fontSize = isCompact ? "18px" : "26px";
  name.style.fontWeight = "800";
  name.style.color = "#ffffff";
  name.style.minWidth = "0";
  name.style.whiteSpace = "nowrap";

  wrap.appendChild(name);

  if (item && item.seat === 0){
    const badge = document.createElement("div");
    badge.textContent = "YOU";
    badge.style.flex = "0 0 auto";
    badge.style.padding = isCompact ? "3px 7px" : "4px 9px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = isCompact ? "10px" : "12px";
    badge.style.fontWeight = "900";
    badge.style.letterSpacing = "0.08em";
    badge.style.lineHeight = "1";
    badge.style.color = "#eef8ff";
    badge.style.border = "1px solid rgba(148,212,255,0.52)";
    badge.style.background = "linear-gradient(180deg, rgba(112,184,255,0.28), rgba(49,101,170,0.28))";
    badge.style.boxShadow = "0 6px 16px rgba(0,0,0,0.18)";
    wrap.appendChild(badge);
  }

  return wrap;
}

function applyHanchanEndOverlayResponsiveStyles(){
  const overlay = document.getElementById("hanchanEndOverlay");
  const panel = document.getElementById("hanchanEndPanel");
  const title = document.getElementById("hanchanEndTitle");
  const reason = document.getElementById("hanchanEndReason");
  const scores = document.getElementById("hanchanEndScores");
  if (!overlay || !panel) return;

  const compact = isCompactLandscapePhoneForHanchanEnd();

  overlay.style.touchAction = "manipulation";
  overlay.style.padding = compact ? "8px" : "22px";

  panel.style.touchAction = "manipulation";
  panel.style.width = compact ? "min(98vw, 1320px)" : "min(1140px, 96vw)";
  panel.style.maxHeight = compact ? "96vh" : "92vh";
  panel.style.borderRadius = compact ? "16px" : "28px";
  panel.style.padding = compact ? "12px 12px 10px" : "34px 30px 24px";

  if (title){
    title.style.fontSize = compact ? "28px" : "48px";
    title.style.marginBottom = compact ? "6px" : "12px";
  }

  if (reason){
    reason.style.fontSize = compact ? "14px" : "22px";
    reason.style.marginBottom = compact ? "10px" : "22px";
  }

  if (scores){
    scores.style.gap = compact ? "6px" : "10px";
    scores.style.marginBottom = compact ? "10px" : "18px";
  }
}

function ensureHanchanEndOverlay(){
  let overlay = document.getElementById("hanchanEndOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "hanchanEndOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.backdropFilter = "blur(5px)";
  overlay.style.zIndex = "2800";
  overlay.style.padding = "22px";
  overlay.style.boxSizing = "border-box";
  overlay.style.touchAction = "manipulation";

  const panel = document.createElement("div");
  panel.id = "hanchanEndPanel";
  panel.style.width = "min(1140px, 96vw)";
  panel.style.maxHeight = "92vh";
  panel.style.overflowY = "auto";
  panel.style.overflowX = "hidden";
  panel.style.background = "linear-gradient(180deg, rgba(18,31,55,0.97), rgba(6,15,29,0.97))";
  panel.style.border = "1px solid rgba(255,255,255,0.13)";
  panel.style.borderRadius = "28px";
  panel.style.boxShadow = "0 24px 72px rgba(0,0,0,0.44)";
  panel.style.padding = "34px 30px 24px";
  panel.style.color = "#fff";
  panel.style.touchAction = "manipulation";
  panel.style.textAlign = "center";
  panel.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.id = "hanchanEndTitle";
  title.style.fontSize = "48px";
  title.style.fontWeight = "900";
  title.style.letterSpacing = "0.08em";
  title.style.lineHeight = "1.1";
  title.style.marginBottom = "12px";
  title.textContent = "対局終了";

  const reason = document.createElement("div");
  reason.id = "hanchanEndReason";
  reason.style.fontSize = "22px";
  reason.style.fontWeight = "700";
  reason.style.opacity = "0.92";
  reason.style.marginBottom = "22px";

  const scoresBox = document.createElement("div");
  scoresBox.id = "hanchanEndScores";
  scoresBox.style.display = "grid";
  scoresBox.style.gridTemplateColumns = "1fr";
  scoresBox.style.gap = "10px";
  scoresBox.style.textAlign = "left";
  scoresBox.style.marginBottom = "18px";
  scoresBox.style.width = "100%";
  scoresBox.style.minWidth = "0";

  const hint = document.createElement("div");
  hint.style.fontSize = "18px";
  hint.style.fontWeight = "700";
  hint.style.opacity = "0.84";
  hint.textContent = "クリックで閉じる";

  panel.appendChild(title);
  panel.appendChild(reason);
  panel.appendChild(scoresBox);
  panel.appendChild(hint);
  overlay.appendChild(panel);

  overlay.addEventListener("click", (ev)=>{
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    overlay.style.display = "none";
  }, true);

  document.body.appendChild(overlay);

  try{
    if (typeof window !== "undefined" && typeof window.installOverlayNoZoomGuards === "function") {
      window.installOverlayNoZoomGuards(overlay);
      window.installOverlayNoZoomGuards(panel);
    }
  }catch(e){}

  applyHanchanEndOverlayResponsiveStyles();
  return overlay;
}

function showHanchanEndOverlay(endInfo, settlement){
  const overlay = ensureHanchanEndOverlay();
  const compact = isCompactLandscapePhoneForHanchanEnd();
  const reasonEl = document.getElementById("hanchanEndReason");
  const scoresEl = document.getElementById("hanchanEndScores");

  if (reasonEl){
    reasonEl.textContent = endInfo && endInfo.reason ? endInfo.reason : "";
  }

  if (scoresEl){
    scoresEl.innerHTML = "";
    const rawFinalScores = Array.isArray(scores) ? scores : (settlement && settlement.afterScores ? settlement.afterScores : [0,0,0]);
    const finalScores = getNoBustAdjustedScoresForSettlement(rawFinalScores, settlement);

    if (Array.isArray(scores) && finalScores.length === 3){
      scores = finalScores.slice();
    }

    const seatNames = [
      "あなた",
      "右CPU",
      "左CPU"
    ];
    const rankLabels = ["トップ", "2着", "ラス"];

    const rows = [];
    for (let seat = 0; seat < 3; seat++){
      rows.push({
        seat,
        name: seatNames[seat],
        score: Number(finalScores[seat]) || 0
      });
    }

    rows.sort((a, b)=>{
      if (b.score !== a.score) return b.score - a.score;
      return a.seat - b.seat;
    });

    for (let i = 0; i < rows.length; i++){
      rows[i].rankIndex = i;
      rows[i].chipCount = Number(getHanchanEndSeatStatNumber(rows[i].seat, "chip")) || 0;
      rows[i].scoreValue = calcHanchanFinalScoreValue(rows[i].score, i, rows);
      rows[i].totalScoreValue = calcHanchanTotalScoreValue(
        rows[i].score,
        i,
        rows,
        rows[i].chipCount
      );
    }

    const gridTemplateColumns = getHanchanEndGridTemplateColumns(compact);

    const header = document.createElement("div");
    header.style.display = "grid";
    header.style.gridTemplateColumns = gridTemplateColumns;
    header.style.alignItems = "center";
    header.style.columnGap = compact ? "6px" : "10px";
    header.style.padding = compact ? "0 4px 0px" : "0 12px 2px";
    header.style.boxSizing = "border-box";
    header.style.minWidth = "0";

    header.appendChild(makeHanchanEndHeaderCell("順位", "left", compact));
    header.appendChild(makeHanchanEndHeaderCell("名前", "left", compact));
    header.appendChild(makeHanchanEndHeaderCell("最終持ち点", "left", compact));
    header.appendChild(makeHanchanEndHeaderCell("最終スコア", "center", compact));
    header.appendChild(makeHanchanEndHeaderCell("チップ", "center", compact));
    header.appendChild(makeHanchanEndHeaderCell("リーチ", "center", compact));
    header.appendChild(makeHanchanEndHeaderCell("和了", "center", compact));
    header.appendChild(makeHanchanEndHeaderCell("放銃", "center", compact));
    scoresEl.appendChild(header);

    for (let i = 0; i < rows.length; i++){
      const item = rows[i];
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = gridTemplateColumns;
      row.style.alignItems = "center";
      row.style.columnGap = compact ? "6px" : "10px";
      row.style.padding = compact ? "10px 6px" : "18px 12px";
      row.style.borderRadius = compact ? "12px" : "18px";
      row.style.background = getHanchanEndRowBackground(item, i);
      row.style.border = getHanchanEndRowBorder(item, i);
      row.style.boxShadow = getHanchanEndRowShadow(item);
      row.style.boxSizing = "border-box";
      row.style.minWidth = "0";

      const rank = document.createElement("div");
      rank.textContent = rankLabels[i] || "";
      rank.style.fontSize = compact ? "16px" : "23px";
      rank.style.fontWeight = "900";
      rank.style.color = (i === 0) ? "#ffe082" : (item.seat === 0 ? "#bfe3ff" : "#d7ecff");
      rank.style.letterSpacing = "0.04em";
      rank.style.whiteSpace = "nowrap";

      const name = makeHanchanEndNameCell(item, compact);

      const pointWrap = document.createElement("div");
      pointWrap.style.display = "flex";
      pointWrap.style.flexDirection = "column";
      pointWrap.style.alignItems = "flex-start";
      pointWrap.style.justifyContent = "center";
      pointWrap.style.gap = compact ? "2px" : "4px";
      pointWrap.style.minWidth = "0";

      const point = document.createElement("div");
      point.textContent = item.score.toLocaleString("ja-JP");
      point.style.fontSize = compact ? "clamp(24px, 4.8vw, 30px)" : "clamp(42px, 4.4vw, 54px)";
      point.style.fontWeight = "900";
      point.style.lineHeight = "0.92";
      point.style.color = "#ffffff";
      point.style.letterSpacing = "0.01em";
      point.style.whiteSpace = "nowrap";

      const scoreValue = document.createElement("div");
      scoreValue.textContent = formatHanchanFinalScoreText(item.scoreValue);
      scoreValue.style.fontSize = compact ? "15px" : "24px";
      scoreValue.style.fontWeight = "800";
      scoreValue.style.lineHeight = "1";
      scoreValue.style.color = item.scoreValue >= 0 ? "#f7fbff" : "rgba(255,255,255,0.78)";
      scoreValue.style.whiteSpace = "nowrap";

      pointWrap.appendChild(point);
      pointWrap.appendChild(scoreValue);

      const totalScoreWrap = document.createElement("div");
      totalScoreWrap.style.display = "flex";
      totalScoreWrap.style.flexDirection = "column";
      totalScoreWrap.style.alignItems = "center";
      totalScoreWrap.style.justifyContent = "center";
      totalScoreWrap.style.gap = compact ? "2px" : "4px";
      totalScoreWrap.style.minWidth = "0";

      const totalScore = document.createElement("div");
      totalScore.textContent = formatHanchanTotalScoreText(item.totalScoreValue);
      totalScore.style.fontSize = compact ? "20px" : "32px";
      totalScore.style.fontWeight = "900";
      totalScore.style.lineHeight = "1";
      totalScore.style.whiteSpace = "nowrap";
      totalScore.style.color = item.totalScoreValue >= 0 ? "#ffe082" : "#ffd2d2";

      const totalScoreDetail = document.createElement("div");
      totalScoreDetail.textContent = `${formatHanchanFinalScoreText(item.scoreValue)} ${formatHanchanChipDetailText(item.chipCount)}`;
      totalScoreDetail.style.fontSize = compact ? "11px" : "16px";
      totalScoreDetail.style.fontWeight = "800";
      totalScoreDetail.style.lineHeight = "1";
      totalScoreDetail.style.opacity = "0.82";
      totalScoreDetail.style.whiteSpace = "nowrap";
      totalScoreDetail.style.color = item.totalScoreValue >= 0
        ? "rgba(255,224,130,0.92)"
        : "rgba(255,210,210,0.92)";

      totalScoreWrap.appendChild(totalScore);
      totalScoreWrap.appendChild(totalScoreDetail);

      const chipWrap = document.createElement("div");
      chipWrap.style.display = "flex";
      chipWrap.style.flexDirection = "column";
      chipWrap.style.alignItems = "center";
      chipWrap.style.justifyContent = "center";
      chipWrap.style.gap = compact ? "2px" : "4px";
      chipWrap.style.minWidth = "0";

      const chip = makeHanchanEndCountCell(formatHanchanChipCountText(item.chipCount), compact);
      chip.style.fontSize = compact ? "18px" : "28px";
      chip.style.fontWeight = "900";
      chip.style.opacity = "0.96";
      chip.style.color = item.chipCount > 0
        ? "#9ef7e9"
        : (item.chipCount < 0 ? "#ffd2d2" : "rgba(255,255,255,0.86)");

      const chipDetail = document.createElement("div");
      chipDetail.textContent = formatHanchanChipDetailText(item.chipCount);
      chipDetail.style.fontSize = compact ? "11px" : "16px";
      chipDetail.style.fontWeight = "800";
      chipDetail.style.lineHeight = "1";
      chipDetail.style.opacity = "0.82";
      chipDetail.style.whiteSpace = "nowrap";
      chipDetail.style.color = item.chipCount > 0
        ? "rgba(158,247,233,0.92)"
        : (item.chipCount < 0 ? "rgba(255,210,210,0.92)" : "rgba(255,255,255,0.66)");

      chipWrap.appendChild(chip);
      chipWrap.appendChild(chipDetail);

      const riichi = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "riichi")), compact);
      const agari = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "agari")), compact);
      const hoju = makeHanchanEndCountCell(formatHanchanEndCountText(getHanchanEndSeatStatNumber(item.seat, "hoju")), compact);

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(pointWrap);
      row.appendChild(totalScoreWrap);
      row.appendChild(chipWrap);
      row.appendChild(riichi);
      row.appendChild(agari);
      row.appendChild(hoju);
      scoresEl.appendChild(row);
    }
  }

  try{
    if (typeof window !== "undefined" && typeof window.installOverlayNoZoomGuards === "function") {
      window.installOverlayNoZoomGuards(overlay);
      const panel = document.getElementById("hanchanEndPanel");
      if (panel) window.installOverlayNoZoomGuards(panel);
    }
  }catch(e){}

  applyHanchanEndOverlayResponsiveStyles();
  overlay.style.display = "flex";
}


try{
  if (typeof window !== "undefined"){
    window.mbSanmaIsSeatTenpaiAtRyukyoku = isSeatTenpaiAtRyukyoku;
    window.mbSanmaGetRyukyokuTenpaiSeats = getRyukyokuTenpaiSeats;
  }
}catch(e){}
