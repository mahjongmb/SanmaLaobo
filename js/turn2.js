// ========= turn2.js（CPUロン後乗せ + リーチ棒成立パッチ） =========
// 目的：
// - turn.js を直接いじらずに、CPUロンアガリを後乗せする
// - リーチ宣言牌にポン/明槓が入ってもリーチは成立させる
// - リーチ宣言牌にロンがかかったときだけリーチ不成立にする
// - 成立したリーチだけ1000点棒を場に出し、持ち点から1000点を引く
//
// 対応内容
// - 自分の捨て牌に対して CPU右 / CPU左 がロンできる
// - CPU右の捨て牌に対して CPU左 がロンできる
// - CPU左の捨て牌に対して CPU右 がロンできる
// - リーチ棒の表示（中央エリアの各家付近）
//
// 方針
// - 既存関数をラップ / 上書きして差し込む
// - render.js は描画専用のまま
// - リーチ成立判定だけをこのパッチで後決めする
//
// 注意
// - CPUフリテンはまだ未対応
// - ダブロンは既存キューAPIに乗せて処理する

(function(){
  "use strict";

  function ensureAgariResultQueueApi(){
    if (typeof window === "undefined") return;

    if (!Array.isArray(window.agariResultQueue)) window.agariResultQueue = [];
    if (!Number.isInteger(window.agariResultQueueIndex)) window.agariResultQueueIndex = 0;

    window.clearAgariResultQueue = function(){
      window.agariResultQueue = [];
      window.agariResultQueueIndex = 0;
    };

    window.setAgariResultQueue = function(entries){
      window.agariResultQueue = Array.isArray(entries) ? entries.slice() : [];
      window.agariResultQueueIndex = 0;
    };

    window.getAgariResultQueue = function(){
      return Array.isArray(window.agariResultQueue) ? window.agariResultQueue : [];
    };

    window.getCurrentAgariResultEntry = function(){
      const queue = window.getAgariResultQueue();
      const idx = Number.isInteger(window.agariResultQueueIndex) ? window.agariResultQueueIndex : 0;
      if (idx < 0 || idx >= queue.length) return null;
      return queue[idx] || null;
    };

    window.hasNextAgariResultQueueEntry = function(){
      const queue = window.getAgariResultQueue();
      const idx = Number.isInteger(window.agariResultQueueIndex) ? window.agariResultQueueIndex : 0;
      return idx < (queue.length - 1);
    };

    window.advanceAgariResultQueue = function(){
      const queue = window.getAgariResultQueue();
      if (queue.length <= 0) return null;
      if (!Number.isInteger(window.agariResultQueueIndex)) window.agariResultQueueIndex = 0;
      if (window.agariResultQueueIndex < (queue.length - 1)) window.agariResultQueueIndex++;
      return window.getCurrentAgariResultEntry();
    };

    window.getAgariQueueHeadEntry = function(){
      const queue = window.getAgariResultQueue();
      if (queue.length <= 0) return null;
      return queue.find((entry)=> entry && entry.headWinner) || queue[0] || null;
    };

    window.getRonWinnerSeatIndexesFromQueue = function(){
      const queue = window.getAgariResultQueue();
      const seats = [];
      for (const entry of queue){
        if (!entry || entry.winType !== "ron") continue;
        const seat = entry.winnerSeatIndex;
        if (seat !== 0 && seat !== 1 && seat !== 2) continue;
        if (!seats.includes(seat)) seats.push(seat);
      }
      return seats;
    };
  }

  ensureAgariResultQueueApi();

  let cpuRonPriorityOnCpuDiscard = null;

  function setCpuRonPriorityOnCpuDiscard(seatIndex, tile, discarderSeatIndex){
    if (seatIndex !== 1 && seatIndex !== 2) return;
    if (!tile || !tile.code) return;

    cpuRonPriorityOnCpuDiscard = {
      seatIndex,
      tile: {
        code: tile.code,
        imgCode: tile.imgCode || tile.code
      },
      discarderSeatIndex: (typeof discarderSeatIndex === "number") ? discarderSeatIndex : null
    };
  }

  function peekCpuRonPriorityOnCpuDiscard(){
    return cpuRonPriorityOnCpuDiscard;
  }

  function clearCpuRonPriorityOnCpuDiscard(){
    cpuRonPriorityOnCpuDiscard = null;
  }

  function getCpuSeatWindForRon(seatIndex){
    const e = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

    if (e === 0){
      if (seatIndex === 0) return "東";
      if (seatIndex === 1) return "南";
      if (seatIndex === 2) return "西";
    }

    if (e === 1){
      if (seatIndex === 1) return "東";
      if (seatIndex === 2) return "南";
      if (seatIndex === 0) return "西";
    }

    if (e === 2){
      if (seatIndex === 2) return "東";
      if (seatIndex === 0) return "南";
      if (seatIndex === 1) return "西";
    }

    return null;
  }

  function isCpuRiichiForRon(seatIndex){
    try{
      if (typeof isCpuRiichiSeat === "function"){
        return !!isCpuRiichiSeat(seatIndex);
      }

      if (seatIndex === 1){
        return !!cpuRightRiichi;
      }

      if (seatIndex === 2){
        return !!cpuLeftRiichi;
      }

      return false;
    }catch(e){
      return false;
    }
  }

  function getCpuRonAgariInfo(seatIndex, tiles14, tile, extraOpts = null){
    if (!Array.isArray(tiles14) || tiles14.length <= 0) return null;
    if (!tile || !tile.code) return null;
    if (typeof getAgariYakuInfo !== "function") return null;

    try{
      return getAgariYakuInfo({
        tiles14: tiles14.slice(),
        meldList: (typeof getCpuMeldRefBySeat === "function" && Array.isArray(getCpuMeldRefBySeat(seatIndex)))
          ? getCpuMeldRefBySeat(seatIndex).slice()
          : [],
        winType: "ron",
        winTileCode: tile.code,
        isRiichi: isCpuRiichiForRon(seatIndex),
        isOpenRiichi: (typeof isCpuOpenRiichiSeat === "function") ? isCpuOpenRiichiSeat(seatIndex) : false,
        roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
        seatWind: getCpuSeatWindForRon(seatIndex),
        doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : [],
        uraDoraIndicators: Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [],
        peis: (typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(seatIndex)))
          ? getCpuPeiRefBySeat(seatIndex).slice()
          : [],
        ...(typeof getWinSituationFlags === "function" ? getWinSituationFlags("ron", seatIndex) : {}),
        ...((extraOpts && typeof extraOpts === "object") ? extraOpts : {})
      });
    }catch(e){
      return null;
    }
  }

  function canCpuRonAgariByYaku(seatIndex, tiles14, tile, extraOpts = null){
    if (!Array.isArray(tiles14) || tiles14.length <= 0) return false;
    if (!tile || !tile.code) return false;
    if (typeof getAgariYakuInfo !== "function") return true;

    const info = getCpuRonAgariInfo(seatIndex, tiles14, tile, extraOpts);
    if (!info || !info.isAgari) return false;
    if ((info.yakuman | 0) > 0) return true;
    return (info.han | 0) > 0;
  }

  function canCpuKokushiAnkanRonFallback(seatIndex, tile, extraOpts = null){
    try{
      if (!extraOpts || !extraOpts.isAnkanRon) return false;
      if (!tile || !tile.code) return false;
      if (seatIndex !== 1 && seatIndex !== 2) return false;
      if (typeof calcShantenKokushi !== "function") return false;
      if (typeof countsFromTiles !== "function") return false;
      if (typeof isKokushiAnkanRonEnabledForYaku === "function" && !isKokushiAnkanRonEnabledForYaku()) return false;

      const hand13Ref = cpuHandRefBySeat(seatIndex);
      if (!Array.isArray(hand13Ref) || hand13Ref.length <= 0) return false;

      const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
        ? getCpuFixedMeldCountBySeat(seatIndex)
        : 0;
      if ((fixedMeldCount | 0) !== 0) return false;

      const tiles14 = hand13Ref.slice();
      tiles14.push({ code: tile.code });

      return calcShantenKokushi(countsFromTiles(tiles14), fixedMeldCount) === -1;
    }catch(e){
      return false;
    }
  }

  function cpuHandRefBySeat(seatIndex){
    if (seatIndex === 1) return cpuRightHand13;
    if (seatIndex === 2) return cpuLeftHand13;
    return null;
  }

  function cpuRiverRefBySeat(seatIndex){
    if (seatIndex === 1) return cpuRightRiver;
    if (seatIndex === 2) return cpuLeftRiver;
    return null;
  }

  function isCpuRonAgariWithTile(seatIndex, tile, extraOpts = null){
    try{
      if ((typeof isDebugCpuRiichiOnlyMode === "function") && isDebugCpuRiichiOnlyMode()) return false;
      if (isEnded) return false;
      if (!tile || !tile.code) return false;
      if (seatIndex !== 1 && seatIndex !== 2) return false;
      if (typeof isCpuOpenRiichiSeat === "function" && isCpuOpenRiichiSeat(seatIndex)){
        if (typeof isCpuOpenRiichiFuritenBySeat === "function" && isCpuOpenRiichiFuritenBySeat(seatIndex)) return false;
      }

      const hand13Ref = cpuHandRefBySeat(seatIndex);
      if (!Array.isArray(hand13Ref) || hand13Ref.length <= 0) return false;

      const tiles14 = hand13Ref.slice();
      tiles14.push({ code: tile.code });

      if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function") return false;
      const counts14 = countsFromTiles(tiles14);
      const fixedMeldCount = (typeof getCpuFixedMeldCountBySeat === "function")
        ? getCpuFixedMeldCountBySeat(seatIndex)
        : 0;
      if (calcShanten(counts14, fixedMeldCount) !== -1){
        return canCpuKokushiAnkanRonFallback(seatIndex, tile, extraOpts);
      }

      if (canCpuRonAgariByYaku(seatIndex, tiles14, tile, extraOpts)) return true;
      return canCpuKokushiAnkanRonFallback(seatIndex, tile, extraOpts);
    }catch(e){
      return false;
    }
  }

  function isSeatRiichiForOpenRule(seatIndex){
    if (seatIndex === 0) return !!isRiichi;
    if (typeof isCpuRiichiSeat === "function") return !!isCpuRiichiSeat(seatIndex);
    return false;
  }

  function hasCommittedRiichiBeforeDiscardForOpenRule(seatIndex){
    try{
      if (typeof hasCommittedRiichiStickForSeat === "function"){
        return !!hasCommittedRiichiStickForSeat(seatIndex);
      }
    }catch(e){}
    return false;
  }

  function getSeatConcealedTilesAfterDiscardForOpenRule(seatIndex){
    if (seatIndex === 0) return Array.isArray(hand13) ? hand13.slice() : [];
    if (typeof getCpuHand13RefBySeat === "function"){
      const ref = getCpuHand13RefBySeat(seatIndex);
      return Array.isArray(ref) ? ref.slice() : [];
    }
    return [];
  }

  function getSeatMeldListForOpenRule(seatIndex){
    try{
      if (seatIndex === 0) return Array.isArray(melds) ? melds.slice() : [];
      if (typeof getCpuMeldRefBySeat === "function"){
        const ref = getCpuMeldRefBySeat(seatIndex);
        return Array.isArray(ref) ? ref.slice() : [];
      }
    }catch(e){}
    return [];
  }

  function getSeatPeiListForOpenRule(seatIndex){
    try{
      if (seatIndex === 0) return Array.isArray(peis) ? peis.slice() : [];
      if (typeof getCpuPeiRefBySeat === "function"){
        const ref = getCpuPeiRefBySeat(seatIndex);
        return Array.isArray(ref) ? ref.slice() : [];
      }
    }catch(e){}
    return [];
  }

  function isSeatOpenRiichiActiveForOpenRule(seatIndex){
    try{
      if (seatIndex === 0){
        return (typeof isPlayerOpenRiichiActive === "function") ? !!isPlayerOpenRiichiActive() : false;
      }
      return (typeof isCpuOpenRiichiSeat === "function") ? !!isCpuOpenRiichiSeat(seatIndex) : false;
    }catch(e){}
    return false;
  }

  function isSeatOpenRiichiFuritenForOpenRule(seatIndex){
    try{
      if (seatIndex === 1 || seatIndex === 2){
        return (typeof isCpuOpenRiichiFuritenBySeat === "function") ? !!isCpuOpenRiichiFuritenBySeat(seatIndex) : false;
      }
    }catch(e){}
    return false;
  }

  function getSeatFixedMeldCountForOpenRule(seatIndex){
    try{
      if (seatIndex === 0) return Array.isArray(melds) ? melds.length : 0;
      if (typeof getCpuFixedMeldCountBySeat === "function") return getCpuFixedMeldCountBySeat(seatIndex);
    }catch(e){}

    const meldList = getSeatMeldListForOpenRule(seatIndex);
    return Array.isArray(meldList) ? meldList.length : 0;
  }

  function isTileCodeActuallyDealingIntoSeatOpenRiichiForOpenRule(tileCode, seatIndex){
    try{
      if (!tileCode) return false;
      if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;
      if (!isSeatOpenRiichiActiveForOpenRule(seatIndex)) return false;
      if (isSeatOpenRiichiFuritenForOpenRule(seatIndex)) return false;

      const concealedTiles = getSeatConcealedTilesAfterDiscardForOpenRule(seatIndex);
      if (!Array.isArray(concealedTiles) || concealedTiles.length <= 0) return false;
      if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function"){
        if (typeof isTileCodeDealingIntoSeatOpenRiichi === "function"){
          return !!isTileCodeDealingIntoSeatOpenRiichi(tileCode, seatIndex);
        }
        return false;
      }

      const tiles14 = concealedTiles.slice();
      tiles14.push({ code: tileCode });

      return calcShanten(countsFromTiles(tiles14), getSeatFixedMeldCountForOpenRule(seatIndex)) === -1;
    }catch(e){
      try{
        if (typeof isTileCodeDealingIntoSeatOpenRiichi === "function"){
          return !!isTileCodeDealingIntoSeatOpenRiichi(tileCode, seatIndex);
        }
      }catch(_e){}
      return false;
    }
  }

  function getForbiddenDiscardCodeForOpenRule(seatIndex){
    try{
      if (seatIndex === 0 && typeof getPlayerForbiddenCallDiscardCode === "function"){
        return getPlayerForbiddenCallDiscardCode();
      }
      if ((seatIndex === 1 || seatIndex === 2) && typeof getCpuForbiddenCallDiscardCode === "function"){
        return getCpuForbiddenCallDiscardCode(seatIndex);
      }
    }catch(e){}
    return null;
  }

  function getDangerousOpenRiichiSeatIndexesForRon(discarderSeatIndex){
    if (typeof getDangerousOpenRiichiSeatIndexes !== "function") return [];
    const list = getDangerousOpenRiichiSeatIndexes(discarderSeatIndex);
    return Array.isArray(list) ? list.filter((seat)=> seat !== discarderSeatIndex) : [];
  }

  function hasSafeAlternativeAgainstDangerousOpenRiichi(discarderSeatIndex, discardedTile){
    if (!discardedTile || !discardedTile.code) return true;

    const dangerousOpenSeats = getDangerousOpenRiichiSeatIndexesForRon(discarderSeatIndex);
    if (dangerousOpenSeats.length <= 0) return true;

    const concealedAfterDiscard = getSeatConcealedTilesAfterDiscardForOpenRule(discarderSeatIndex);
    if (!Array.isArray(concealedAfterDiscard)) return true;

    const pool = concealedAfterDiscard.slice();
    pool.push({ code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code });
    if (pool.length <= 0) return true;

    const forbiddenDiscardCode = getForbiddenDiscardCodeForOpenRule(discarderSeatIndex);

    for (const tile of pool){
      if (!tile || !tile.code) continue;
      if (forbiddenDiscardCode && tile.code === forbiddenDiscardCode) continue;

      let unsafe = false;
      for (const openSeatIndex of dangerousOpenSeats){
        if (isTileCodeActuallyDealingIntoSeatOpenRiichiForOpenRule(tile.code, openSeatIndex)){
          unsafe = true;
          break;
        }
      }
      if (!unsafe) return true;
    }

    return false;
  }

  function shouldTreatOpenRiichiDealInAsForcedYakuman(winnerSeatIndex, discarderSeatIndex, ronTile){
    if (!ronTile || !ronTile.code) return false;
    if (winnerSeatIndex !== 0 && winnerSeatIndex !== 1 && winnerSeatIndex !== 2) return false;
    if (discarderSeatIndex !== 0 && discarderSeatIndex !== 1 && discarderSeatIndex !== 2) return false;
    if (winnerSeatIndex === discarderSeatIndex) return false;
    if (hasCommittedRiichiBeforeDiscardForOpenRule(discarderSeatIndex)) return false;
    if (typeof isSeatOpenRiichiDangerous !== "function" || !isSeatOpenRiichiDangerous(winnerSeatIndex)) return false;
    if (!isTileCodeActuallyDealingIntoSeatOpenRiichiForOpenRule(ronTile.code, winnerSeatIndex)) return false;
    return !hasSafeAlternativeAgainstDangerousOpenRiichi(discarderSeatIndex, ronTile);
  }

  function getHeadRonWinnerSeatIndex(discarderSeatIndex, winnerSeatIndexes){
    const winners = Array.isArray(winnerSeatIndexes) ? winnerSeatIndexes.slice() : [];
    if (winners.length <= 0) return null;

    if (discarderSeatIndex !== 0 && discarderSeatIndex !== 1 && discarderSeatIndex !== 2){
      return winners[0];
    }

    let seat = (discarderSeatIndex + 1) % 3;
    for (let i = 0; i < 3; i++){
      if (winners.includes(seat)) return seat;
      seat = (seat + 1) % 3;
    }

    return winners[0];
  }

  function buildRonResultQueueEntries(winnerSeatIndexes, ronTile, discarderSeatIndex){
    const winners = Array.isArray(winnerSeatIndexes) ? winnerSeatIndexes.slice() : [];
    const sorted = winners.slice().sort((a, b)=> a - b);
    const headWinnerSeatIndex = getHeadRonWinnerSeatIndex(discarderSeatIndex, winners);
    return sorted.map((seatIndex)=>({
      winType: "ron",
      winnerSeatIndex: seatIndex,
      discarderSeatIndex: (typeof discarderSeatIndex === "number") ? discarderSeatIndex : null,
      ronTile: ronTile && ronTile.code ? { code: ronTile.code, imgCode: ronTile.imgCode || ronTile.code } : null,
      headWinner: seatIndex === headWinnerSeatIndex,
      isOpenRiichiForcedDealInYakuman: shouldTreatOpenRiichiDealInAsForcedYakuman(seatIndex, discarderSeatIndex, ronTile)
    }));
  }

  function finishRonBatch(winnerSeatIndexes, ronTile, discarderSeatIndex, extraOpts = null){
    if (isEnded) return;

    const entries = buildRonResultQueueEntries(winnerSeatIndexes, ronTile, discarderSeatIndex);
    if (entries.length <= 0) return;

    try{
      if (typeof window !== "undefined") {
        window.MBSanmaSpecialRonContext = (extraOpts && extraOpts.isAnkanRon) ? { type: "ankanRon" } : null;
      }
    }catch(e){}

    isEnded = true;
    hoveredTileId = null;

    try{
      if (typeof setPostAgariStageToOverlay === "function") setPostAgariStageToOverlay();
    }catch(e){}

    try{
      if (typeof clearPlayerDrawTimer === "function") clearPlayerDrawTimer();
    }catch(e){}

    try{
      if (typeof clearNewFlags === "function") clearNewFlags();
    }catch(e){}

    try{
      if (typeof clearCpuDrawnTileBySeat === "function"){
        clearCpuDrawnTileBySeat(1);
        clearCpuDrawnTileBySeat(2);
      }
    }catch(e){}

    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("agari_ron", {
          winnerSeatIndexes: entries.map((entry)=> entry.winnerSeatIndex),
          discarderSeatIndex,
          ronTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(ronTile) : (ronTile ? { code: ronTile.code, imgCode: ronTile.imgCode || ronTile.code } : null)
        });
      }
    }catch(e){}

    try{
      if (typeof window !== "undefined" && typeof window.setAgariResultQueue === "function"){
        window.setAgariResultQueue(entries);
      }

      const head = entries.find((entry)=> entry && entry.headWinner) || entries[0] || null;
      lastAgariWinnerSeatIndex = head ? head.winnerSeatIndex : null;
      lastAgariDiscarderSeatIndex = head ? head.discarderSeatIndex : null;
      lastAgariType = "ron";
      lastAgariRonTile = head && head.ronTile ? { code: head.ronTile.code, imgCode: head.ronTile.imgCode || head.ronTile.code } : null;
    }catch(e){}

    try{
      if (typeof render === "function") render();
    }catch(e){}

    try{
      if (typeof openRon === "function") openRon();
    }catch(e){}
  }

  function finishCpuRon(seatIndex, ronTile, discarderSeatIndex){
    finishRonBatch([seatIndex], ronTile, discarderSeatIndex);
  }

  function tryCpuRonOnPlayerDiscard(){
    try{
      if (isEnded) return false;
      if (!Array.isArray(river) || river.length === 0) return false;

      const tile = river[river.length - 1];
      if (!tile || !tile.code) return false;

      const winners = [];
      if (isCpuRonAgariWithTile(1, tile)) winners.push(1);
      if (isCpuRonAgariWithTile(2, tile)) winners.push(2);
      if (winners.length <= 0) return false;

      finishRonBatch(winners, tile, 0);
      return true;
    }catch(e){
      if (typeof showFatalError === "function") showFatalError(e, "turn2:tryCpuRonOnPlayerDiscard()");
      return false;
    }
  }

  function tryCpuRonOnPlayerKakan(kakanCode){
    try{
      if (isEnded) return false;
      if (!kakanCode) return false;

      const tile = { code: kakanCode, imgCode: kakanCode };

      if (typeof markCurrentWinContextChankan === "function") markCurrentWinContextChankan();

      const winners = [];
      if (isCpuRonAgariWithTile(1, tile)) winners.push(1);
      if (isCpuRonAgariWithTile(2, tile)) winners.push(2);

      if (winners.length > 0){
        finishRonBatch(winners, tile, 0);
        return true;
      }

      if (typeof resetCurrentWinContext === "function") resetCurrentWinContext();
      return false;
    }catch(e){
      try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(_e){}
      if (typeof showFatalError === "function") showFatalError(e, "turn2:tryCpuRonOnPlayerKakan()");
      return false;
    }
  }

  function tryCpuRonOnPlayerAnkan(ankanCode){
    try{
      if (isEnded) return false;
      if (!ankanCode) return false;

      const tile = { code: ankanCode, imgCode: ankanCode };
      const extraOpts = { isAnkanRon: true };

      try{
        if (typeof window !== "undefined"){
          window.MBSanmaSpecialRonContext = { type: "ankanRon" };
        }
      }catch(e){}

      const winners = [];
      if (isCpuRonAgariWithTile(1, tile, extraOpts)) winners.push(1);
      if (isCpuRonAgariWithTile(2, tile, extraOpts)) winners.push(2);

      if (winners.length > 0){
        finishRonBatch(winners, tile, 0, extraOpts);
        return true;
      }

      try{
        if (typeof window !== "undefined"){
          window.MBSanmaSpecialRonContext = null;
        }
      }catch(e){}
      return false;
    }catch(e){
      try{
        if (typeof window !== "undefined"){
          window.MBSanmaSpecialRonContext = null;
        }
      }catch(_e){}
      if (typeof showFatalError === "function") showFatalError(e, "turn2:tryCpuRonOnPlayerAnkan()");
      return false;
    }
  }

  function tryCpuRonOnCpuDiscard(discardSeatIndex, discardedTile){
    try{
      if (isEnded) return false;
      if (!discardedTile || !discardedTile.code) return false;

      const targetSeat = (discardSeatIndex === 1) ? 2 : (discardSeatIndex === 2 ? 1 : null);
      if (targetSeat == null) return false;

      if (isCpuRonAgariWithTile(targetSeat, discardedTile)){
        finishCpuRon(targetSeat, discardedTile, discardSeatIndex);
        return true;
      }

      return false;
    }catch(e){
      if (typeof showFatalError === "function") showFatalError(e, "turn2:tryCpuRonOnCpuDiscard()");
      return false;
    }
  }

  // ================================
  // ★ リーチ棒成立 / 表示管理
  // ================================
  let committedRiichiStickBySeat = [false, false, false];

  function resetCommittedRiichiStickState(){
    committedRiichiStickBySeat = [false, false, false];
  }

  function getCommittedRiichiStickSeats(){
    const out = [];
    for (let i = 0; i < 3; i++){
      if (committedRiichiStickBySeat[i]) out.push(i);
    }
    return out;
  }

  function hasCommittedRiichiStickForSeat(seatIndex){
    if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;
    return !!committedRiichiStickBySeat[seatIndex];
  }

  function commitRiichiStickForSeat(seatIndex){
    if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
    if (committedRiichiStickBySeat[seatIndex]) return;

    committedRiichiStickBySeat[seatIndex] = true;

    try{
      if (Array.isArray(scores) && Number.isFinite(scores[seatIndex])){
        scores[seatIndex] = (scores[seatIndex] | 0) - 1000;
      }
    }catch(e){}
  }

  function shouldCommitPlayerRiichiAfterDiscard(){
    try{
      if (!Array.isArray(river) || river.length <= 0) return false;
      if (!isRiichi) return false;
      const tile = river[river.length - 1];
      return !!(tile && tile.isRiichiDeclare);
    }catch(e){
      return false;
    }
  }

  function shouldCommitCpuRiichiAfterDiscard(seatIndex, discardedTile){
    try{
      if (seatIndex !== 1 && seatIndex !== 2) return false;
      if (!discardedTile || discardedTile.id == null) return false;
      if (typeof isCpuRiichiSeat === "function" && !isCpuRiichiSeat(seatIndex)) return false;
      if (typeof getCpuRiichiDeclareTileIdBySeat !== "function") return false;
      return getCpuRiichiDeclareTileIdBySeat(seatIndex) === discardedTile.id;
    }catch(e){
      return false;
    }
  }

  function ensureRiichiStickStyle(){
    if (typeof document === "undefined") return;
    if (document.getElementById("riichiStickPatchStyle")) return;

    const style = document.createElement("style");
    style.id = "riichiStickPatchStyle";
    style.textContent = `
      #centerUi .riichiStickBox{
        position:absolute;
        display:none;
        pointer-events:none;
        z-index:8;
      }
      /* ===== PC / 共通 ===== */
      #centerUi .riichiStickBox img{
        display:block;
        width:clamp(72px, 10.5cqw, 120px);
        height:auto;
        filter: drop-shadow(0 6px 12px rgba(0,0,0,0.20));
      }
      #centerUi #riichiStickSelf{
        left:50%;
        bottom:20%;
        transform:translateX(-50%);
      }
      #centerUi #riichiStickRight{
        right:20%;
        top:58%;
        transform:translate(50%, -50%) rotate(-90deg);
      }
      #centerUi #riichiStickLeft{
        left:20%;
        top:58%;
        transform:translate(-50%, -50%) rotate(90deg);
      }

      /* ===== スマホ横向き専用 ===== */
      @media (orientation: landscape) and (max-height: 520px){
        #centerUi .riichiStickBox img{
          width:clamp(96px, 11cqw, 138px);
        }
        #centerUi #riichiStickSelf{
          left:50%;
          bottom:45%;
          transform:translateX(-50%);
        }
        #centerUi #riichiStickRight{
          right:28.25%;
          top:40.5%;
          transform:translate(50%, -50%) rotate(-90deg);
        }
        #centerUi #riichiStickLeft{
          left:28.25%;
          top:40.5%;
          transform:translate(-50%, -50%) rotate(90deg);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureRiichiStickDom(){
    if (typeof document === "undefined") return null;

    const root = document.getElementById("centerUi");
    if (!root) return null;

    ensureRiichiStickStyle();

    const ensureOne = (id)=>{
      let el = document.getElementById(id);
      if (el) return el;

      el = document.createElement("div");
      el.id = id;
      el.className = "riichiStickBox";

      const img = document.createElement("img");
      img.alt = "1000点棒";
      img.draggable = false;
      img.src = getAssetPath("img/sentenbou.png");

      el.appendChild(img);
      root.appendChild(el);
      return el;
    };

    return {
      self: ensureOne("riichiStickSelf"),
      right: ensureOne("riichiStickRight"),
      left: ensureOne("riichiStickLeft")
    };
  }

  function renderCommittedRiichiStickUi(){
    const dom = ensureRiichiStickDom();
    if (!dom) return;

    const hideForEnd = !!isEnded;

    dom.self.style.display = (!hideForEnd && hasCommittedRiichiStickForSeat(0)) ? "block" : "none";
    dom.right.style.display = (!hideForEnd && hasCommittedRiichiStickForSeat(1)) ? "block" : "none";
    dom.left.style.display = (!hideForEnd && hasCommittedRiichiStickForSeat(2)) ? "block" : "none";
  }

  try{
    if (typeof window !== "undefined"){
      window.tryCpuRonOnPlayerKakan = tryCpuRonOnPlayerKakan;
      window.tryCpuRonOnPlayerAnkan = tryCpuRonOnPlayerAnkan;
      window.peekCpuRonPriorityOnCpuDiscard = peekCpuRonPriorityOnCpuDiscard;
      window.clearCpuRonPriorityOnCpuDiscard = clearCpuRonPriorityOnCpuDiscard;
      window.triggerCpuRonPriorityOnCpuDiscard = function(){
        if (!cpuRonPriorityOnCpuDiscard) return false;
        const info = cpuRonPriorityOnCpuDiscard;
        cpuRonPriorityOnCpuDiscard = null;
        finishCpuRon(info.seatIndex, info.tile, info.discarderSeatIndex);
        return true;
      };
      window.finishRonBatch = finishRonBatch;
      window.isTileCodeActuallyDealingIntoSeatOpenRiichi = function(tileCode, seatIndex){
        return isTileCodeActuallyDealingIntoSeatOpenRiichiForOpenRule(tileCode, seatIndex);
      };
      window.getCommittedRiichiStickSeats = getCommittedRiichiStickSeats;
      window.hasCommittedRiichiStickForSeat = hasCommittedRiichiStickForSeat;
      window.resetCommittedRiichiStickState = resetCommittedRiichiStickState;
      window.commitRiichiStickForSeat = commitRiichiStickForSeat;
    }
  }catch(e){}

  // =========================================================
  // resetKyokuRuntimeState をラップ
  // - 局が変わるたびに「各家のリーチ棒表示状態」だけ初期化する
  // - kyotakuCount は既存ロジックに任せて残す
  // =========================================================
  if (typeof resetKyokuRuntimeState === "function" && !resetKyokuRuntimeState.__turn2_riichi_patch__){
    const __origResetKyokuRuntimeState = resetKyokuRuntimeState;

    resetKyokuRuntimeState = function(){
      resetCommittedRiichiStickState();
      return __origResetKyokuRuntimeState();
    };

    resetKyokuRuntimeState.__turn2_riichi_patch__ = true;
  }

  // =========================================================
  // renderCenterUi をラップ
  // - 中央UI描画後にリーチ棒を重ねる
  // =========================================================
  if (typeof renderCenterUi === "function" && !renderCenterUi.__turn2_riichi_patch__){
    const __origRenderCenterUi = renderCenterUi;

    renderCenterUi = function(){
      const ret = __origRenderCenterUi();
      try{ renderCommittedRiichiStickUi(); }catch(e){}
      return ret;
    };

    renderCenterUi.__turn2_riichi_patch__ = true;
  }

  // =========================================================
  // actions.js の afterPlayerDiscardAdvance をラップ
  // - 自分の捨て牌直後に CPUロンを先に確認
  // - ロンが無ければ、その捨て牌がリーチ宣言牌ならここで成立させる
  // - 成立後に従来処理へ
  // =========================================================
  if (typeof afterPlayerDiscardAdvance === "function" && !afterPlayerDiscardAdvance.__turn2_patched__){
    const __origAfterPlayerDiscardAdvance = afterPlayerDiscardAdvance;

    afterPlayerDiscardAdvance = function(){
      try{
        clearCpuRonPriorityOnCpuDiscard();
        hoveredTileId = null;
        if (typeof render === "function") render();

        if (tryCpuRonOnPlayerDiscard()){
          return;
        }

        const cpuOpenCallOnPlayerDiscard = (typeof tryCpuOpenCallOnPlayerDiscard === "function")
          ? !!tryCpuOpenCallOnPlayerDiscard()
          : false;

        if (cpuOpenCallOnPlayerDiscard){
          if (shouldCommitPlayerRiichiAfterDiscard()){
            commitRiichiStickForSeat(0);
            if (typeof render === "function") render();
          }
          if (!isEnded && typeof kickCpuTurnsIfNeeded === "function"){
            kickCpuTurnsIfNeeded();
          }
          return;
        }

        if (shouldCommitPlayerRiichiAfterDiscard()){
          commitRiichiStickForSeat(0);
          if (typeof render === "function") render();
        }

        return __origAfterPlayerDiscardAdvance();
      }catch(e){
        if (typeof showFatalError === "function") showFatalError(e, "turn2:afterPlayerDiscardAdvance()");
      }
    };

    afterPlayerDiscardAdvance.__turn2_patched__ = true;
  }

  // =========================================================
  // turn.js の kickCpuTurnsIfNeeded を上書き
  // - 既存の流れをほぼ維持
  // - CPU捨て牌後
  //    1) まず既存の「自分ロン/ポン/明槓」確認
  //    2) 自分がロンしなかったら、もう一人のCPUロン確認
  //    3) ロンが無かった場合だけ、CPUのリーチ棒を成立させる
  //       （ポン/明槓で宣言牌が消えても成立）
  // =========================================================
  if (typeof kickCpuTurnsIfNeeded === "function" && !kickCpuTurnsIfNeeded.__turn2_patched__){
    const __origKickCpuTurnsIfNeeded = kickCpuTurnsIfNeeded;

    kickCpuTurnsIfNeeded = async function(immediateFirst = false){
      if (isEnded) return;

      const loopEpoch = (typeof getCpuTurnLoopEpoch === "function") ? getCpuTurnLoopEpoch() : null;
      let firstStep = true;

      while (!isEnded && currentTurnSeatIndex !== 0 && (turnPhase === "DISCARD" || turnPhase === "CALL_DISCARD")){
        if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

        const seat = currentTurnSeatIndex;
        const isCpuCallDiscardTurn = (turnPhase === "CALL_DISCARD");

        if (!(immediateFirst && firstStep)){
          await sleep((typeof getCpuTurnDelayMs === "function") ? getCpuTurnDelayMs() : CPU_TURN_DELAY_MS);
        }
        firstStep = false;

        if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
        if (isEnded) return;

        if (!isCpuCallDiscardTurn){
          if (typeof isWallExhaustedForDraw === "function" ? isWallExhaustedForDraw() : ((Array.isArray(wall) ? wall.length : 0) === 0)){
            endRyukyokuFromTurnIfPossible();
            return;
          }
        }

        // ===== CPUのツモ牌を一度表示してから捨てる =====
        if (!isCpuCallDiscardTurn){
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

            if (typeof setCpuDrawnTileBySeat === "function"){
              setCpuDrawnTileBySeat(seat, cpuDrawnTile);
            }

            hoveredTileId = null;
            if (typeof render === "function") render();

            await sleep((typeof getCpuTurnDelayMs === "function") ? getCpuTurnDelayMs() : CPU_TURN_DELAY_MS);

            if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;
            if (isEnded) return;
          }
        }

        // ===== CPUが1枚捨てる =====
        const discardedTile = isCpuCallDiscardTurn
          ? ((typeof cpuDoOneCallDiscard === "function") ? cpuDoOneCallDiscard(seat) : null)
          : cpuDoOneDiscard(seat);

        clearCpuRonPriorityOnCpuDiscard();
        hoveredTileId = null;
        if (typeof render === "function") render();

        if (!discardedTile) return;

        const cpuRiichiDeclareDiscard = isCpuCallDiscardTurn ? false : shouldCommitCpuRiichiAfterDiscard(seat, discardedTile);

        // ===== 追加：自分の鳴き確認より前に、残りCPUのロン可能を保持 =====
        const cpuRonTargetSeat = (seat === 1) ? 2 : (seat === 2 ? 1 : null);
        if (cpuRonTargetSeat != null && isCpuRonAgariWithTile(cpuRonTargetSeat, discardedTile)){
          setCpuRonPriorityOnCpuDiscard(cpuRonTargetSeat, discardedTile, seat);
        }

        // ===== 既存：CPU捨て直後に自分のロン/ポン/明槓確認 =====
        if (typeof maybePromptCallOnDiscard === "function"){
          const from = isCpuRightSeat(seat) ? "R" : "L";
          const action = await maybePromptCallOnDiscard(from, discardedTile);

          if (loopEpoch !== null && typeof getCpuTurnLoopEpoch === "function" && loopEpoch !== getCpuTurnLoopEpoch()) return;

          if (action === "ron" || action === "cpu_ron"){
            return;
          }

          if (action === "pon"){
            if (cpuRiichiDeclareDiscard){
              commitRiichiStickForSeat(seat);
            }
            if (typeof forceEnterPlayerCallDiscardTurn === "function"){
              forceEnterPlayerCallDiscardTurn();
            }
            if (typeof render === "function") render();
            clearCpuRonPriorityOnCpuDiscard();
            return;
          }

          if (action === "minkan"){
            if (cpuRiichiDeclareDiscard){
              commitRiichiStickForSeat(seat);
              if (typeof render === "function") render();
            }
            clearCpuRonPriorityOnCpuDiscard();
            return;
          }

          if (action === "pass"){
            if (typeof triggerCpuRonPriorityOnCpuDiscard === "function" && triggerCpuRonPriorityOnCpuDiscard()){
              return;
            }
          }
        }

        // ===== 追加：自分がロンしなかったら、残りCPUがロンできるか =====
        if (typeof triggerCpuRonPriorityOnCpuDiscard === "function" && triggerCpuRonPriorityOnCpuDiscard()){
          return;
        }

        if (tryCpuRonOnCpuDiscard(seat, discardedTile)){
          return;
        }

        if (typeof tryCpuOpenCallOnCpuDiscard === "function" && tryCpuOpenCallOnCpuDiscard(seat, discardedTile)){
          if (cpuRiichiDeclareDiscard){
            commitRiichiStickForSeat(seat);
            if (typeof render === "function") render();
          }
          clearCpuRonPriorityOnCpuDiscard();
          continue;
        }

        clearCpuRonPriorityOnCpuDiscard();

        if (cpuRiichiDeclareDiscard){
          commitRiichiStickForSeat(seat);
          if (typeof render === "function") render();
        }

        if (typeof isWallExhaustedForDraw === "function" ? isWallExhaustedForDraw() : ((Array.isArray(wall) ? wall.length : 0) === 0)){
          endRyukyokuFromTurnIfPossible();
          return;
        }

        advanceTurnAfterDiscard(seat);

        if (currentTurnSeatIndex === 0) return;
      }
    };

    kickCpuTurnsIfNeeded.__turn2_patched__ = true;
    kickCpuTurnsIfNeeded.__turn2_orig__ = __origKickCpuTurnsIfNeeded;
  }

})();
