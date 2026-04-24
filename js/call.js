// MBsanma/js/call.js
// ========= call.js（鳴き：ロン/ポン/スキップ/明槓） =========
// 役割：鳴き判定・鳴き選択UI・鳴き実行（状態変更はここ）
//
// 優先度（簡易）：ロン ＞ 明槓 ＞ ポン
//
// 依存：hand13, drawn, melds, cpuLeftRiver, cpuRightRiver, isEnded, isRiichiSelecting, isRiichi
// 依存：ponBtn, ronBtn, passBtn, kanBtn, setBtnEnabled(), render(), calcShanten(), countsFromTiles()
// 依存：drawFromDeadWallForKan(), deadWall, doraIndicators, clearNewFlags()
//
// NOTE：ボタンは「カンボタン(kanBtn)」を鳴き中の明槓にも流用する。

let pendingCallResolver = null;
let playerCallAiTimer = null;
const PLAYER_CALL_AI_DELAY_MS = 650;

function clearPlayerCallAiTimer(){
  if (playerCallAiTimer){
    clearTimeout(playerCallAiTimer);
    playerCallAiTimer = null;
  }
}

function shouldUsePlayerOpenAiForCurrentPrompt(canRon){
  if (canRon) return false;
  return (typeof isPlayerOpenAiEnabled === "function") && isPlayerOpenAiEnabled();
}

function getPlayerOpenAiProfileOverride(){
  return "balanced";
}

function __callCloneDisplayTile(tile, fallbackCode = null){
  if (tile && tile.code){
    return {
      code: tile.code,
      imgCode: tile.imgCode || tile.code
    };
  }
  if (!fallbackCode) return null;
  return {
    code: fallbackCode,
    imgCode: fallbackCode
  };
}

function __callExtractTilesByCodePreserveOrder(src, code, count){
  const removedTiles = [];
  const remainTiles = [];

  if (!Array.isArray(src) || !code || count <= 0){
    return { removedTiles, remainTiles: Array.isArray(src) ? src.slice() : [] };
  }

  for (const tile of src){
    if (tile && tile.code === code && removedTiles.length < count){
      removedTiles.push(tile);
    } else {
      remainTiles.push(tile);
    }
  }

  return { removedTiles, remainTiles };
}

function __callBuildOpenMeld(type, code, from, removedTiles, calledTile, fromSeatIndex = null){
  const concealedTiles = Array.isArray(removedTiles)
    ? removedTiles.map((tile)=> __callCloneDisplayTile(tile, code)).filter(Boolean)
    : [];
  const called = __callCloneDisplayTile(calledTile, code);

  let tiles = [];
  let calledIndex = 0;

  if (from === "L"){
    tiles = [called, ...concealedTiles];
    calledIndex = 0;
  } else {
    tiles = [...concealedTiles, called];
    calledIndex = concealedTiles.length;
  }

  return {
    type,
    code,
    from,
    fromSeatIndex: (Number.isInteger(fromSeatIndex) ? fromSeatIndex : null),
    tiles,
    calledIndex
  };
}

function addPlayerCallAiVisibleTileCounts(counts, tilesLike){
  if (!Array.isArray(counts) || !Array.isArray(tilesLike)) return;
  for (const tile of tilesLike){
    if (!tile || !tile.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[tile.code];
    if (idx === undefined) continue;
    counts[idx] += 1;
  }
}

function addPlayerCallAiVisibleMeldCounts(counts, meldList){
  if (!Array.isArray(counts) || !Array.isArray(meldList)) return;
  for (const meld of meldList){
    if (!meld || !meld.code || typeof TYPE_TO_IDX !== "object") continue;
    const idx = TYPE_TO_IDX[meld.code];
    if (idx === undefined) continue;
    const kind = meld.type || "pon";
    counts[idx] += (kind === "ankan" || kind === "minkan" || kind === "kakan") ? 4 : 3;
  }
}

function buildPlayerCallAiVisibleCounts(concealedTiles){
  const counts = Array.isArray(TILE_TYPES) ? Array(TILE_TYPES.length).fill(0) : [];
  addPlayerCallAiVisibleTileCounts(counts, concealedTiles);
  addPlayerCallAiVisibleTileCounts(counts, river);
  addPlayerCallAiVisibleTileCounts(counts, cpuRightRiver);
  addPlayerCallAiVisibleTileCounts(counts, cpuLeftRiver);
  addPlayerCallAiVisibleTileCounts(counts, peis);
  try{ if (Array.isArray(cpuRightPeis)) addPlayerCallAiVisibleTileCounts(counts, cpuRightPeis); }catch(e){}
  try{ if (Array.isArray(cpuLeftPeis)) addPlayerCallAiVisibleTileCounts(counts, cpuLeftPeis); }catch(e){}
  if (Array.isArray(doraIndicators)) addPlayerCallAiVisibleTileCounts(counts, doraIndicators);
  addPlayerCallAiVisibleMeldCounts(counts, melds);
  try{ if (Array.isArray(cpuRightMelds)) addPlayerCallAiVisibleMeldCounts(counts, cpuRightMelds); }catch(e){}
  try{ if (Array.isArray(cpuLeftMelds)) addPlayerCallAiVisibleMeldCounts(counts, cpuLeftMelds); }catch(e){}
  return counts;
}

function getPlayerCallAiRiichiSeatIndexes(){
  const out = [];
  try{ if (typeof isRiichi !== "undefined" && isRiichi) out.push(0); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(1)) out.push(1); }catch(e){}
  try{ if (typeof isCpuRiichiSeat === "function" && isCpuRiichiSeat(2)) out.push(2); }catch(e){}
  return out;
}

function buildPlayerCallAiAnalysis(kind, code, currentShanten, fixedMeldCount){
  if (kind !== "pon" && kind !== "minkan") return null;
  const removeCount = (kind === "pon") ? 2 : 3;
  const concealed = Array.isArray(hand13) ? hand13.slice() : [];
  let removed = 0;
  for (let i = concealed.length - 1; i >= 0 && removed < removeCount; i--){
    if (concealed[i] && concealed[i].code === code){
      concealed.splice(i, 1);
      removed++;
    }
  }
  if (removed < removeCount) return null;

  const fixedAfter = fixedMeldCount + 1;
  const countsAfterCall = (typeof countsFromTiles === "function") ? countsFromTiles(concealed) : null;
  const shantenAfterCall = countsAfterCall && typeof calcShanten === "function" ? calcShanten(countsAfterCall, fixedAfter) : 99;
  const visibleCounts = buildPlayerCallAiVisibleCounts(concealed);
  const improveAfterCall = (countsAfterCall && typeof countCpuImproveTiles === "function")
    ? countCpuImproveTiles(0, countsAfterCall, visibleCounts, fixedAfter)
    : 0;

  let bestDiscard = null;
  if (kind === "pon" && typeof chooseCpuCallDiscardInfo === "function"){
    bestDiscard = chooseCpuCallDiscardInfo(0, concealed, fixedAfter, { forbiddenDiscardCode: code });
  }

  let improveBefore = 0;
  try{
    const currentCounts = (typeof countsFromTiles === "function") ? countsFromTiles(hand13) : null;
    const currentVisible = buildPlayerCallAiVisibleCounts(hand13);
    if (currentCounts && typeof countCpuImproveTiles === "function"){
      improveBefore = countCpuImproveTiles(0, currentCounts, currentVisible, fixedMeldCount);
    }
  }catch(e){}

  const improveAfterBest = bestDiscard ? (Number(bestDiscard.improveCount) || 0) : improveAfterCall;
  const shantenAfterBest = bestDiscard ? (Number(bestDiscard.shantenAfter) || 99) : shantenAfterCall;
  const keepsTenpai = currentShanten === 0 && shantenAfterBest === 0;
  const advancesShanten = shantenAfterBest < currentShanten;
  const worsensShanten = shantenAfterBest > currentShanten;
  const improveDrop = Math.max(0, improveBefore - improveAfterBest);
  const keepRate = improveBefore > 0 ? (improveAfterBest / improveBefore) : 1;
  const waitTypeCountAfter = (shantenAfterBest === 0 && typeof countTenpaiWaitTypeCount === "function")
    ? countTenpaiWaitTypeCount(bestDiscard ? bestDiscard.afterTiles : concealed, fixedAfter)
    : 0;

  return {
    discardedTileIsYakuhaiForSelf: (typeof isYakuhaiCodeForSeat === "function") ? isYakuhaiCodeForSeat(code, 0) : false,
    keepsTenpai,
    advancesShanten,
    worsensShanten,
    improveCountAfter: improveAfterBest,
    tenpaiWaitTypeCountAfter: waitTypeCountAfter,
    sameTileDiscardWouldBeBest: !!(bestDiscard && bestDiscard.discardTile && bestDiscard.discardTile.code === code),
    improveDropAfterBestDiscard: improveDrop,
    improveKeepRateAfterBestDiscard: keepRate,
    valuePlanHintsAfterCall: []
  };
}

function buildPlayerCallAiSnapshot(tile, from, legalActions){
  const code = tile && tile.code ? tile.code : "";
  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const currentCounts = (typeof countsFromTiles === "function") ? countsFromTiles(hand13) : null;
  const currentShanten = currentCounts && typeof calcShanten === "function" ? calcShanten(currentCounts, fixedMeldCount) : 99;
  const discarderSeatIndex = (from === "R") ? 1 : ((from === "L") ? 2 : null);
  const anyRiichi = getPlayerCallAiRiichiSeatIndexes().length > 0;
  const sameTileCount = Array.isArray(hand13) ? hand13.filter((t)=> t && t.code === code).length : 0;
  const ponBlockedByTriplet = (typeof hasCpuPonBlockedByConcealedTriplet === "function")
    ? hasCpuPonBlockedByConcealedTriplet(hand13, tile)
    : (sameTileCount >= 3);

  return {
    snapshotId: `player-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    candidateSeatIndex: 0,
    discardedTile: tile && tile.code ? { code: tile.code, imgCode: tile.imgCode || tile.code } : null,
    discarderSeatIndex,
    legalActions: {
      pon: !!(legalActions && legalActions.pon) && !ponBlockedByTriplet,
      minkan: !!(legalActions && legalActions.minkan)
    },
    scores: Array.isArray(scores) ? scores.slice() : [],
    self: {
      currentShanten,
      score: Array.isArray(scores) ? (Number(scores[0]) || 0) : 0,
      riichi: !!isRiichi,
      isDealer: (typeof eastSeatIndex === "number" ? eastSeatIndex : 0) === 0,
      valuePlanHints: [],
      melds: Array.isArray(melds) ? melds.slice() : [],
      peis: Array.isArray(peis) ? peis.slice() : [],
      river: Array.isArray(river) ? river.slice() : []
    },
    table: {
      anyRiichi,
      riichiSeatIndexes: getPlayerCallAiRiichiSeatIndexes(),
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
      }
    },
    callAnalysis: {
      pon: buildPlayerCallAiAnalysis("pon", code, currentShanten, fixedMeldCount),
      minkan: buildPlayerCallAiAnalysis("minkan", code, currentShanten, fixedMeldCount)
    }
  };
}

function getPlayerOpenAiDecision(tile, from, legalActions){
  const snapshot = buildPlayerCallAiSnapshot(tile, from, legalActions);

  try{
    if (typeof buildCpuOpenShadowDecision === "function"){
      const decision = buildCpuOpenShadowDecision(snapshot, getPlayerOpenAiProfileOverride());
      if (decision && decision.action) return decision.action;
    }
  }catch(e){}

  if (legalActions && legalActions.minkan) return "minkan";
  if (legalActions && legalActions.pon) return "pon";
  return "pass";
}

function maybeSchedulePlayerOpenAiChoice(forceReschedule = false){
  if (forceReschedule) clearPlayerCallAiTimer();
  if (playerCallAiTimer) return;
  if (!pendingCall || pendingCall.type !== "call" || !pendingCall.aiControlled) return;

  if (pendingCall.canRon && typeof isPlayerSpecialAiEnabled === "function" && isPlayerSpecialAiEnabled()){
    chooseRon(true);
    return;
  }

  const callAiDelayMs = (typeof getGameSpeedMs === "function")
    ? getGameSpeedMs("playerSpecialActionDelayMs", PLAYER_CALL_AI_DELAY_MS)
    : PLAYER_CALL_AI_DELAY_MS;
  playerCallAiTimer = setTimeout(()=>{
    playerCallAiTimer = null;
    if (!pendingCall || pendingCall.type !== "call" || !pendingCall.aiControlled) return;
    if (isEnded) return;

    if (pendingCall.canRon && typeof isPlayerSpecialAiEnabled === "function" && isPlayerSpecialAiEnabled()){
      chooseRon(true);
      return;
    }

    const tile = { code: pendingCall.code, imgCode: pendingCall.code };
    const action = getPlayerOpenAiDecision(tile, pendingCall.from, {
      pon: !!pendingCall.canPon,
      minkan: !!pendingCall.canMinkan
    });

    if (action === "minkan"){
      chooseMinkan(true);
      return;
    }
    if (action === "pon"){
      choosePon(true);
      return;
    }
    choosePass();
  }, callAiDelayMs);
}

function openPonEffect(seatIndex = 0){
  if (!ponOverlay) return;

  const inner = ponOverlay.querySelector(".inner");
  const img = inner ? inner.querySelector("img") : null;

  ponOverlay.style.position = "fixed";
  ponOverlay.style.inset = "0";
  ponOverlay.style.display = "block";
  ponOverlay.style.pointerEvents = "none";
  ponOverlay.style.zIndex = "2500";
  ponOverlay.style.background = "transparent";

  if (inner){
    inner.style.position = "absolute";
    inner.style.left = "50%";
    inner.style.top = "50%";
    inner.style.transform = "translate(-50%, -50%) scale(1)";
    inner.style.transformOrigin = "center center";
    inner.style.opacity = "0";
    inner.style.filter = "drop-shadow(0 0 18px rgba(255,140,40,0.95)) drop-shadow(0 0 42px rgba(255,90,0,0.75))";
    inner.style.willChange = "transform, opacity";
    inner.style.animation = "none";
  }

  if (img){
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.userSelect = "none";
    img.draggable = false;
  }

  let x = "50%";
  let y = "78%";
  let w = "300px";

  if (seatIndex === 1){
    x = "82%";
    y = "58%";
    w = "260px";
  } else if (seatIndex === 2){
    x = "18%";
    y = "58%";
    w = "260px";
  }

  if (inner){
    inner.style.left = x;
    inner.style.top = y;
    inner.style.width = `min(${w}, 32vw)`;
    if (seatIndex === 0){
      inner.style.width = "min(300px, 38vw)";
    }

    void inner.offsetWidth;
    inner.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.72)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.06)", offset: 0.38 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.00)", offset: 0.72 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.12)" }
      ],
      {
        duration: 900,
        easing: "ease-out",
        fill: "forwards"
      }
    );
  }

  setTimeout(()=>{
    if (!ponOverlay) return;
    ponOverlay.style.display = "none";
  }, 900);
}

// ================================
// ★ フリテン（河フリテンのみ）
// - 自分の河に「現在の待ち牌」が1枚でもあればロン不可
// - 状態フラグを持たずに純関数で判定する（1ファイル完結・安全優先）
// ================================
function getRonMachiCodesFromHand13(){
  // 「ロン前提」：hand13(13枚)に1枚足してアガリになる牌コード一覧
  // ※ melds.length を固定メンツ数として calcShanten -1 をアガリ扱い
  const base = Array.isArray(hand13) ? hand13.slice() : [];
  if (base.length === 0) return [];

  const fixedM = Array.isArray(melds) ? melds.length : 0;

  const set = new Set();

  // TILE_TYPES は core.js のグローバルを利用（無ければ安全側で空）
  if (typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return [];

  for (const code of TILE_TYPES){
    const tiles14 = base.slice();
    tiles14.push({ code });

    try{
      if (calcShanten(countsFromTiles(tiles14), fixedM) === -1){
        set.add(code);
      }
    }catch(e){
      // calcShanten が落ちたら、その牌は待ち候補に入れない（安全側）
    }
  }

  return Array.from(set);
}

function isRiverFuritenNow(){
  // 自分の河に「現在の待ち牌」があればフリテン
  if (!Array.isArray(river) || river.length === 0) return false;

  const machi = getRonMachiCodesFromHand13();
  if (!machi || machi.length === 0) return false;

  const s = new Set(machi);
  for (const t of river){
    if (t && s.has(t.code)) return true;
  }
  return false;
}


function getRuleValueForCall(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isRiichiSkipEnabledForCall(){
  return String(getRuleValueForCall("basic-riichi-skip", "on") || "").toLowerCase() !== "off";
}

function canChoosePassOnCurrentCall(){
  if (!pendingCall || (pendingCall.type !== "call" && pendingCall.type !== "ankanRon")) return false;
  if (pendingCall.canRon && isRiichi && !isRiichiSkipEnabledForCall()) return false;
  return true;
}

function shouldAutoRonOnCurrentCall(canRon){
  if (!canRon) return false;
  if (!isRiichi) return false;
  if (isRiichiSkipEnabledForCall()) return false;
  return true;
}

function canPlayerRonAgariByYaku(tile, extraOpts = null){
  if (!tile || !tile.code) return false;
  if (typeof getCurrentPlayerAgariYakuInfo !== "function") return true;

  try{
    const info = getCurrentPlayerAgariYakuInfo("ron", tile, extraOpts);
    if (!info || !info.isAgari) return false;
    if ((info.yakuman | 0) > 0) return true;
    return (info.han | 0) > 0;
  }catch(e){
    return false;
  }
}

function canPonOn(code){
  if (isEnded) return false;
  if (isRiichi) return false;           // 簡易：リーチ後は鳴けない（今の方針のまま）
  if (isRiichiSelecting) return false;
  if (drawn) return false;              // 自分のツモ中は鳴き扱いにしない
  const n = hand13.filter(t => t.code === code).length;
  return n >= 2;
}

function canMinkanOn(code){
  if (isEnded) return false;
  if (isRiichi) return false;           // 簡易：リーチ後は鳴けない（今の方針のまま）
  if (isRiichiSelecting) return false;
  if (drawn) return false;              // 自分のツモ中は鳴き扱いにしない
  const n = hand13.filter(t => t.code === code).length;
  return n >= 3;
}

function canRonOn(tile, extraOpts = null){
  if (isEnded) return false;
  if (isRiichiSelecting) return false;
  if (drawn) return false;              // 自分のツモ中はロン判定にしない
  if (!tile || !tile.code) return false;

  // ★ オープンリーチ中は他家の捨て牌ではロンできない
  // （振り込みが発生しないルール）
  if ((!extraOpts || !extraOpts.isAnkanRon) && typeof isPlayerOpenRiichiActive === "function" && isPlayerOpenRiichiActive()) return false;

  // ★ 河フリテン：今の待ち牌が自分の河に1枚でもあればロン不可
  // （待ち集合は hand13 から算出。tile.code でアガるかどうかはこの後で最終判定）
  try{
    if (isRiverFuritenNow()) return false;
  }catch(e){
    // 判定が落ちてもロンを許可すると危険なので、ここは「フリテン扱い（ロン不可）」に倒すと
    // 体験が悪い。今回は“判定失敗＝無視”で進める（レンダ落ちの方が致命なので安全運用）
  }

  const tiles14 = hand13.slice();
  tiles14.push({ code: tile.code });

  const fixedM = Array.isArray(melds) ? melds.length : 0;
  if (calcShanten(countsFromTiles(tiles14), fixedM) !== -1) return false;

  return canPlayerRonAgariByYaku(tile, extraOpts);
}

function beginCpuAnkanRonPrompt(seatIndex, code){
  clearPlayerCallAiTimer();
  if (pendingCall) return false;
  if (seatIndex !== 1 && seatIndex !== 2) return false;
  if (!code) return false;

  const from = seatIndex === 1 ? "R" : "L";
  const tile = { code, imgCode: code };
  const canRon = canRonOn(tile, { isAnkanRon: true });
  if (!canRon) return false;

  if (shouldAutoRonOnCurrentCall(canRon)){
    doRonWin(tile, from, { isAnkanRon: true });
    return true;
  }

  // 検証モード：プレイヤーもAI制御なのでチャンカンロンを自動判断
  if (typeof isVerifyLaunchModeNow === "function" && isVerifyLaunchModeNow()){
    if (typeof isPlayerSpecialAiEnabled === "function" && isPlayerSpecialAiEnabled()){
      doRonWin(tile, from, { isAnkanRon: true });
      return true;
    }
    // ロンできないなら即パス
    if (typeof continueCpuAnkanAfterPlayerPass === "function") continueCpuAnkanAfterPlayerPass(seatIndex, code);
    return true;
  }

  const autoByInternalAi = shouldUsePlayerOpenAiForCurrentPrompt(canRon);
  pendingCall = {
    type: "ankanRon",
    from,
    code,
    canPon: false,
    canRon: true,
    canMinkan: false,
    aiControlled: autoByInternalAi,
    ronOptions: { isAnkanRon: true },
    onPass: function(){
      try{
        if (typeof continueCpuAnkanAfterPlayerPass === "function") continueCpuAnkanAfterPlayerPass(seatIndex, code);
      }catch(e){}
    }
  };

  render();
  if (autoByInternalAi) maybeSchedulePlayerOpenAiChoice(true);
  return true;
}

// ★ 押せる鳴きボタンだけを表示する（render.js の補助）
function renderCallButtons(){
  const inCall = !!pendingCall;
  const canPon = inCall ? !!pendingCall.canPon : false;
  const canRon = inCall ? !!pendingCall.canRon : false;
  const canMinkan = inCall ? !!pendingCall.canMinkan : false;
  const aiControlled = !!(pendingCall && pendingCall.aiControlled && !canRon);
  const canPass = inCall && !aiControlled && canChoosePassOnCurrentCall();

  if (typeof setActionButtonState === "function"){
    setActionButtonState(ronBtn, inCall && canRon, inCall && canRon);
    setActionButtonState(ponBtn, inCall && !aiControlled && canPon, inCall && !aiControlled && canPon);
    setActionButtonState(kanBtn, inCall && !aiControlled && canMinkan, inCall && !aiControlled && canMinkan);
    setActionButtonState(passBtn, canPass, canPass);
    if (typeof refreshActionbarVisibility === "function") refreshActionbarVisibility();
    return;
  }

  setBtnEnabled(ponBtn, inCall && canPon);
  setBtnEnabled(ronBtn, inCall && canRon);
  setBtnEnabled(passBtn, canPass);
  setBtnEnabled(kanBtn, inCall && canMinkan);
}

function peekCpuRonPriorityOnCpuDiscardSafe(){
  try{
    if (typeof peekCpuRonPriorityOnCpuDiscard === "function"){
      return peekCpuRonPriorityOnCpuDiscard();
    }
  }catch(e){}
  return null;
}

function clearCpuRonPriorityOnCpuDiscardSafe(){
  try{
    if (typeof clearCpuRonPriorityOnCpuDiscard === "function"){
      clearCpuRonPriorityOnCpuDiscard();
    }
  }catch(e){}
}

function triggerCpuRonPriorityOnCpuDiscardSafe(){
  try{
    if (typeof triggerCpuRonPriorityOnCpuDiscard === "function"){
      return !!triggerCpuRonPriorityOnCpuDiscard();
    }
  }catch(e){}
  return false;
}

function beginCallPrompt(from, tile){
  clearPlayerCallAiTimer();
  if (pendingCall) return Promise.resolve("pass");
  if (!tile || !tile.code) return Promise.resolve("pass");

  let canPon = canPonOn(tile.code);
  const canRon = canRonOn(tile);
  let canMinkan = canMinkanOn(tile.code);

  const cpuRonPriority = peekCpuRonPriorityOnCpuDiscardSafe();

  // ★ CPUロン優先
  // 同じ捨て牌で「自分はポン/明槓のみ」「他CPUはロン可能」の場合は
  // 自分の鳴き選択を出さず、その場でCPUロンを確定させる。
  if (cpuRonPriority){
    if (canRon){
      // 自分がロンできるときだけロン選択を残す。
      // ポン/明槓はロンに負けるので押せないようにする。
      canPon = false;
      canMinkan = false;
    } else {
      triggerCpuRonPriorityOnCpuDiscardSafe();
      return Promise.resolve("cpu_ron");
    }
  }

  if (!canPon && !canRon && !canMinkan) return Promise.resolve("pass");

  if (shouldAutoRonOnCurrentCall(canRon)){
    doRonWin({ code: tile.code, imgCode: tile.imgCode || tile.code }, from);
    return Promise.resolve("ron");
  }

  // 自分AIが有効な場合はロンを自動選択（高速モード等でボタンが出るだけで止まる問題を修正）
  if (canRon && typeof isPlayerSpecialAiEnabled === "function" && isPlayerSpecialAiEnabled()){
    doRonWin({ code: tile.code, imgCode: tile.imgCode || tile.code }, from);
    return Promise.resolve("ron");
  }

  // ★ ロン＋ポン/明槓が同時に可能でも、自動確定はしない
  // 選択UIを出して、ユーザーがロン / ポン / 明槓 / スキップを選べるようにする。

  const autoByInternalAi = shouldUsePlayerOpenAiForCurrentPrompt(canRon);

  pendingCall = {
    type: "call",
    from,
    code: tile.code,
    canPon,
    canRon,
    canMinkan,
    aiControlled: autoByInternalAi
  };

  render();

  return new Promise((resolve)=>{
    pendingCallResolver = resolve;
    if (autoByInternalAi){
      maybeSchedulePlayerOpenAiChoice(true);
    }
  });
}

function endCallPrompt(result){
  clearPlayerCallAiTimer();
  pendingCall = null;

  const r = pendingCallResolver;
  pendingCallResolver = null;

  render();

  if (typeof r === "function") r(result);
}

// =========================================================
// ★ turn.js が呼ぶ「鳴き判定の入口」
// - 以前のプロジェクトではこの名前で呼んでいた想定
// - これが無いと CPU 捨て牌後の鳴きUIが一切出ず、ポン/ロン/明槓ができない
// =========================================================
async function maybePromptCallOnDiscard(from, discardedTile){
  return await beginCallPrompt(from, discardedTile);
}

// ★ ポン成立後の「鳴き後打牌ターン」へ強制遷移（turn.js が無い/壊れてても安全側に寄せる）
function forceEnterCallDiscardTurnHard(){
  // 1) まずは turn.js の正規APIがあればそれを使う
  if (typeof forceEnterPlayerCallDiscardTurn === "function"){
    forceEnterPlayerCallDiscardTurn();
    return;
  }

  // 2) 無い場合でも、グローバルレキシカル変数へ直接アクセスを試みる
  try{
    if (typeof clearPlayerDrawTimer === "function") clearPlayerDrawTimer();
  }catch(e){}

  try{
    // ※ turn.js の top-level let でも、別scriptから同名identifierで参照できる（window経由は不可）
    if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
    if (typeof turnPhase !== "undefined") turnPhase = "CALL_DISCARD";
  }catch(e){}

  // 3) 念のため drawn は確実に消す（鳴き直後はツモ無し）
  try{ drawn = null; }catch(e){}
}

// ★ 明槓成立後は「嶺上ツモ → 自分の通常打牌」へ（ツモ有りDISCARD）
function forceEnterPlayerDiscardTurnAfterKanHard(){
  try{
    if (typeof clearPlayerDrawTimer === "function") clearPlayerDrawTimer();
  }catch(e){}

  try{
    if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
    if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
  }catch(e){}

  try{
    if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
  }catch(e){}
}

function doRonWin(ronTile, from, opts = {}){
  if (isEnded) return;

  try{
    if (typeof window !== "undefined") {
      window.MBSanmaSpecialRonContext = (opts && opts.isAnkanRon) ? { type: "ankanRon" } : null;
    }
  }catch(e){}

  try{
    if (typeof setPostAgariStageToOverlay === "function") setPostAgariStageToOverlay();
  }catch(e){}

  try{
    if (opts && opts.isChankan && typeof markCurrentWinContextChankan === "function") markCurrentWinContextChankan();
  }catch(e){}

  const discarderSeatIndex = (from === "R") ? 1 : ((from === "L") ? 2 : null);
  const winnerSeats = [0];

  try{
    const cpuRonPriority = (typeof peekCpuRonPriorityOnCpuDiscardSafe === "function")
      ? peekCpuRonPriorityOnCpuDiscardSafe()
      : null;
    if (cpuRonPriority && (cpuRonPriority.seatIndex === 1 || cpuRonPriority.seatIndex === 2)){
      if (!winnerSeats.includes(cpuRonPriority.seatIndex)){
        winnerSeats.push(cpuRonPriority.seatIndex);
      }
    }
  }catch(e){}

  hoveredTileId = null;
  clearNewFlags();

  if (winnerSeats.length > 1 && typeof finishRonBatch === "function"){
    finishRonBatch(winnerSeats, ronTile, discarderSeatIndex);
    return;
  }

  isEnded = true;
  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("agari_ron", {
        winnerSeatIndexes: [0],
        discarderSeatIndex,
        ronTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(ronTile) : (ronTile ? { code: ronTile.code, imgCode: ronTile.imgCode || ronTile.code } : null)
      });
    }
  }catch(e){}
  lastAgariWinnerSeatIndex = 0;
  lastAgariDiscarderSeatIndex = discarderSeatIndex;
  lastAgariType = "ron";
  lastAgariRonTile = null;
  if (ronTile && ronTile.code){
    lastAgariRonTile = {
      code: ronTile.code,
      imgCode: ronTile.imgCode || ronTile.code
    };
  }

  render();

  if (typeof openRon === "function") openRon();
}

// ================================
// UIから呼ばれる（ポン / ロン / スキップ / 明槓）
// ================================

function choosePon(doIt){
  if (!pendingCall || pendingCall.type !== "call") return;
  if (!doIt){
    if (triggerCpuRonPriorityOnCpuDiscardSafe()){
      endCallPrompt("cpu_ron");
      return;
    }
    endCallPrompt("pass");
    return;
  }
  if (!pendingCall.canPon) return;

  if (peekCpuRonPriorityOnCpuDiscardSafe()){
    endCallPrompt("cpu_ron");
    triggerCpuRonPriorityOnCpuDiscardSafe();
    return;
  }

  const from = pendingCall.from;
  const code = pendingCall.code;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  // CPU河の最後の1枚を「鳴いた牌」として取り除く
  let calledTile = null;
  let calledSeatIndex = null;
  if (from === "R"){
    if (cpuRightRiver.length > 0) calledTile = cpuRightRiver.pop() || null;
    calledSeatIndex = 1;
  } else {
    if (cpuLeftRiver.length > 0) calledTile = cpuLeftRiver.pop() || null;
    calledSeatIndex = 2;
  }
  try{
    if (calledTile && typeof markCpuRiichiDisplayTileCalledAwayBySeat === "function"){
      markCpuRiichiDisplayTileCalledAwayBySeat(calledSeatIndex, calledTile.id);
    }
  }catch(e){}

  // 手牌から同一牌を2枚抜く
  const ponExtract = __callExtractTilesByCodePreserveOrder(hand13, code, 2);
  const removedTiles = ponExtract.removedTiles;

  if (removedTiles.length < 2){
    endCallPrompt("pass");
    return;
  }

  hand13 = ponExtract.remainTiles;

  // 副露として保持（from付き）
  melds.push(__callBuildOpenMeld("pon", code, from, removedTiles, calledTile, calledSeatIndex));

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("pon", {
        seatIndex: 0,
        fromSeatIndex: calledSeatIndex,
        code,
        calledTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(calledTile) : null,
        removedTiles: window.MBSanmaMatchLog.cloneTileArray ? window.MBSanmaMatchLog.cloneTileArray(removedTiles) : []
      });
    }
  }catch(e){}

  openPonEffect(0);
  try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}

  hoveredTileId = null;
  clearNewFlags();
  drawn = null;

  // ★★★ ここが本体：ポン成立時点で「自分の鳴き後打牌（ツモ無し）」へ必ず遷移させる ★★★
  forceEnterCallDiscardTurnHard();
  forceEnterCallDiscardTurnHard();

  // ★ ポン後は「切るまで」ツモ/カン/ペー等を封印
  mustDiscardAfterCall = true;

  endCallPrompt("pon");
}

function chooseMinkan(doIt){
  if (!pendingCall || pendingCall.type !== "call") return;
  if (!doIt){
    if (triggerCpuRonPriorityOnCpuDiscardSafe()){
      endCallPrompt("cpu_ron");
      return;
    }
    endCallPrompt("pass");
    return;
  }
  if (!pendingCall.canMinkan) return;

  if (peekCpuRonPriorityOnCpuDiscardSafe()){
    endCallPrompt("cpu_ron");
    triggerCpuRonPriorityOnCpuDiscardSafe();
    return;
  }

  const from = pendingCall.from;
  const code = pendingCall.code;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  // CPU河の最後の1枚を「鳴いた牌」として取り除く（明槓は捨て牌を使う）
  let calledTile = null;
  let calledSeatIndex = null;
  if (from === "R"){
    if (cpuRightRiver.length > 0) calledTile = cpuRightRiver.pop() || null;
    calledSeatIndex = 1;
  } else {
    if (cpuLeftRiver.length > 0) calledTile = cpuLeftRiver.pop() || null;
    calledSeatIndex = 2;
  }
  try{
    if (calledTile && typeof markCpuRiichiDisplayTileCalledAwayBySeat === "function"){
      markCpuRiichiDisplayTileCalledAwayBySeat(calledSeatIndex, calledTile.id);
    }
  }catch(e){}

  // 手牌から同一牌を3枚抜く
  const minkanExtract = __callExtractTilesByCodePreserveOrder(hand13, code, 3);
  const removedTiles = minkanExtract.removedTiles;

  if (removedTiles.length < 3){
    endCallPrompt("pass");
    return;
  }

  hand13 = minkanExtract.remainTiles;

  // 副露として保持（from付き）
  melds.push(__callBuildOpenMeld("minkan", code, from, removedTiles, calledTile, calledSeatIndex));

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("minkan", {
        seatIndex: 0,
        fromSeatIndex: calledSeatIndex,
        code,
        calledTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(calledTile) : null,
        removedTiles: window.MBSanmaMatchLog.cloneTileArray ? window.MBSanmaMatchLog.cloneTileArray(removedTiles) : []
      });
    }
  }catch(e){}

  if (typeof openKanEffect === "function") openKanEffect(0);
  try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}

  hoveredTileId = null;
  clearNewFlags();
  drawn = null;

  // ドラ追加
  // - 王牌18枚の固定帯ルールに従って追加する
  // - 0〜7   : 嶺上牌/北抜き補充
  // - 8〜12  : 表ドラ表示牌
  // - 13〜17 : 裏ドラ表示牌
  if (typeof pushNextKanDoraIndicatorsFromDeadWall === "function"){
    pushNextKanDoraIndicatorsFromDeadWall();
  }

  // 王牌から嶺上ツモ
  const t = drawFromDeadWallForKan();
  if (t){
    t.isNew = true;
    drawn = t;
    try{ if (typeof markCurrentWinContextRinshan === "function") markCurrentWinContextRinshan(); }catch(e){}
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("draw", {
          seatIndex: 0,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(t) : { code: t.code, imgCode: t.imgCode || t.code },
          source: "deadwall_kan"
        });
      }
    }catch(e){}
  }

  // 明槓後は通常DISCARDへ
  forceEnterPlayerDiscardTurnAfterKanHard();

  endCallPrompt("minkan");
}

// UIから呼ばれる（ロン）
function chooseRon(doIt){
  if (!pendingCall || (pendingCall.type !== "call" && pendingCall.type !== "ankanRon")) return;
  if (!doIt){
    if (pendingCall.type === "call" && triggerCpuRonPriorityOnCpuDiscardSafe()){
      endCallPrompt("cpu_ron");
      return;
    }
    const onPass = pendingCall && typeof pendingCall.onPass === "function" ? pendingCall.onPass : null;
    endCallPrompt("pass");
    if (onPass) onPass();
    return;
  }
  if (!pendingCall.canRon) return;

  const ronTile = {
    code: pendingCall.code,
    imgCode: pendingCall.code
  };

  const from = pendingCall.from;
  const ronOptions = (pendingCall && pendingCall.ronOptions && typeof pendingCall.ronOptions === "object")
    ? pendingCall.ronOptions
    : {};
  endCallPrompt("ron");
  doRonWin(ronTile, from, ronOptions);
}

// UIから呼ばれる（スキップ）
function choosePass(){
  if (!pendingCall || (pendingCall.type !== "call" && pendingCall.type !== "ankanRon")) return;
  if (!canChoosePassOnCurrentCall()) return;
  const onPass = pendingCall && typeof pendingCall.onPass === "function" ? pendingCall.onPass : null;
  endCallPrompt("pass");
  if (onPass) onPass();
}
