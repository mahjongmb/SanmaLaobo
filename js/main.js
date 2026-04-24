// MBsanma/js/main.js
// ========= main.js（起動/イベント紐付け） =========

// ================================
// ★ 自動で次局へ（誤爆防止）
// ================================
let __autoNextTimer = null;
let __nextKyokuArmed = false;
const PLAYER_AI_POST_AGARI_DELAY_MS = 3000;
const VERIFY_FAST_MODE_STORAGE_KEY = "mbsanma_verify_fast_mode_v1";

const GAME_SPEED_PROFILE_NORMAL = Object.freeze({
  cpuTurnDelayMs: 500,
  playerTurnDrawDelayMs: 500,
  playerAutoDiscardDelayMs: 650,
  playerSpecialActionDelayMs: 520,
  postAgariDelayMs: PLAYER_AI_POST_AGARI_DELAY_MS,
  kanEffectDurationMs: 650,
  riichiEffectDurationMs: 650,
  drawEffectDurationMs: 220,
  tsumoEffectLeadMs: 1000,
  verifyNextHanchanDelayMs: 1200
});

const GAME_SPEED_PROFILE_VERIFY_FAST = Object.freeze({
  cpuTurnDelayMs: 35,
  playerTurnDrawDelayMs: 60,
  playerAutoDiscardDelayMs: 70,
  playerSpecialActionDelayMs: 70,
  postAgariDelayMs: 180,
  kanEffectDurationMs: 120,
  riichiEffectDurationMs: 120,
  drawEffectDurationMs: 80,
  tsumoEffectLeadMs: 120,
  verifyNextHanchanDelayMs: 220
});

const GAME_SPEED_PROFILE_VERIFY_ULTRA = Object.freeze({
  cpuTurnDelayMs: 8,
  playerTurnDrawDelayMs: 10,
  playerAutoDiscardDelayMs: 12,
  playerSpecialActionDelayMs: 12,
  postAgariDelayMs: 40,
  kanEffectDurationMs: 40,
  riichiEffectDurationMs: 40,
  drawEffectDurationMs: 24,
  tsumoEffectLeadMs: 24,
  verifyNextHanchanDelayMs: 40
});

let verifyFastModeLevel = "off";

function normalizeVerifyFastModeLevel(value){
  const raw = String(value == null ? "" : value).toLowerCase();
  if (raw === "ultra") return "ultra";
  if (raw === "fast" || raw === "on" || raw === "true") return "fast";
  if (raw === "off" || raw === "false" || raw === "") return "off";
  return "off";
}

function isVerifyLaunchModeNow(){
  try{
    return !!readAppRuntimeModeFromSessionStorage().isVerifyMode;
  }catch(e){
    return false;
  }
}

function isVerifyFastModeEnabled(){
  return isVerifyLaunchModeNow() && verifyFastModeLevel !== "off";
}

function getVerifyFastModeLevel(){
  return normalizeVerifyFastModeLevel(verifyFastModeLevel);
}

function setVerifyFastModeLevel(value){
  verifyFastModeLevel = normalizeVerifyFastModeLevel(value);
  try{
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function"){
      window.dispatchEvent(new CustomEvent("mbsanma:game-speed-changed", {
        detail: {
          verifyFastModeEnabled: isVerifyFastModeEnabled(),
          verifyFastModeLevel: getVerifyFastModeLevel(),
          profile: getCurrentGameSpeedProfile()
        }
      }));
    }
  }catch(e){}
  return verifyFastModeLevel;
}

function setVerifyFastModeEnabled(value){
  return setVerifyFastModeLevel(value ? "fast" : "off");
}

function getCurrentGameSpeedProfile(){
  if (!isVerifyLaunchModeNow()) return GAME_SPEED_PROFILE_NORMAL;
  const level = getVerifyFastModeLevel();
  if (level === "ultra") return GAME_SPEED_PROFILE_VERIFY_ULTRA;
  if (level === "fast") return GAME_SPEED_PROFILE_VERIFY_FAST;
  return GAME_SPEED_PROFILE_NORMAL;
}

function getGameSpeedMs(key, fallback){
  try{
    const profile = getCurrentGameSpeedProfile();
    const value = profile ? Number(profile[key]) : NaN;
    if (Number.isFinite(value) && value >= 0) return value;
  }catch(e){}
  return fallback;
}

try{
  if (typeof window !== "undefined"){
    window.isVerifyFastModeEnabled = isVerifyFastModeEnabled;
    window.getVerifyFastModeLevel = getVerifyFastModeLevel;
    window.setVerifyFastModeLevel = setVerifyFastModeLevel;
    window.getCurrentGameSpeedProfile = getCurrentGameSpeedProfile;
    window.getGameSpeedMs = getGameSpeedMs;
  }
}catch(e){}

function getRuleValueForMain(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getConfiguredGameTypeForMain(){
  return String(getRuleValueForMain("overview-game-type", "hanchan") || "").toLowerCase() === "tonpuu" ? "tonpuu" : "hanchan";
}

function getConfiguredRenchanTypeForMain(){
  return String(getRuleValueForMain("overview-renchan-type", "tenpai") || "").toLowerCase() === "agari" ? "agari" : "tenpai";
}

// ★ 流局（山枯れ）時の「親テンパイ」情報（actions.js がセット）
let lastRyukyokuDealerTenpai = null;

// ★ アガリ後進行段階
// "none"        : 通常局中
// "overlay"     : 演出オーバーレイ表示中
// "table"       : 卓確認中
// "result"      : 結果確認中
// "nextArmed"   : 次局クリック待ち
let __postAgariStage = "none";


// ★ デバッグ用：CPはリーチするがツモ・ロンしない
let debugCpuRiichiOnlyMode = false;

// ★ CPU自動進行の世代管理（局リセット時に古いループを止める）
let __cpuTurnLoopEpoch = 0;

// ★ デバッグシナリオ開始前の新半荘リセット中はCPU自動進行を止める
let __suspendCpuAutoKick = false;
let __lastDebugScenarioStartFailureReason = "";

function setDebugScenarioStartFailureReason(message){
  __lastDebugScenarioStartFailureReason = String(message || "");
  return __lastDebugScenarioStartFailureReason;
}

function getDebugScenarioStartFailureReason(){
  return String(__lastDebugScenarioStartFailureReason || "");
}

try{
  if (typeof window !== "undefined"){
    window.getDebugScenarioStartFailureReason = getDebugScenarioStartFailureReason;
  }
}catch(e){}

function setDebugCpuRiichiOnlyMode(value){
  debugCpuRiichiOnlyMode = !!value;
}

function isDebugCpuRiichiOnlyMode(){
  return !!debugCpuRiichiOnlyMode;
}

function bumpCpuTurnLoopEpoch(){
  __cpuTurnLoopEpoch += 1;
  return __cpuTurnLoopEpoch;
}

function getCpuTurnLoopEpoch(){
  return __cpuTurnLoopEpoch;
}

function clearAutoNextTimer(){
  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }
  __nextKyokuArmed = false;
}

function resetPostAgariStage(){
  __postAgariStage = "none";
  __nextKyokuArmed = false;
}

function setPostAgariStageToOverlay(){
  __postAgariStage = "overlay";
  __nextKyokuArmed = false;
  schedulePlayerAiPostAgariAdvance("overlay");
}

function hasResultOverlayApi(){
  return (typeof openResultOverlay === "function" && typeof closeResultOverlay === "function");
}

function isResultOverlayVisible(){
  if (typeof resultOverlay === "undefined" || !resultOverlay) return false;
  const d = resultOverlay.style && resultOverlay.style.display;
  return (d !== "none" && d !== "");
}

function hasAgariResultQueueNow(){
  try{
    return (typeof window !== "undefined" && typeof window.getCurrentAgariResultEntry === "function" && !!window.getCurrentAgariResultEntry());
  }catch(e){
    return false;
  }
}

function getHeadAgariResultEntrySafe(){
  try{
    if (typeof window !== "undefined" && typeof window.getAgariQueueHeadEntry === "function"){
      return window.getAgariQueueHeadEntry();
    }
  }catch(e){}
  return null;
}

function isPlayerPostAgariAutoAdvanceEnabled(){
  try{
    return (typeof isPlayerDiscardAiEnabled === "function") && isPlayerDiscardAiEnabled();
  }catch(e){
    return false;
  }
}

function closeCurrentAgariOverlayForAutoAdvance(){
  try{
    if (tsumoOverlay && tsumoOverlay.style && tsumoOverlay.style.display !== "none" && tsumoOverlay.style.display !== ""){
      if (typeof closeTsumo === "function") closeTsumo();
      return true;
    }
  }catch(e){}

  try{
    if (ronOverlay && ronOverlay.style && ronOverlay.style.display !== "none" && ronOverlay.style.display !== ""){
      if (typeof closeRon === "function") closeRon();
      return true;
    }
  }catch(e){}

  try{
    if (nagashiOverlay && nagashiOverlay.style && nagashiOverlay.style.display !== "none" && nagashiOverlay.style.display !== ""){
      if (typeof closeNagashi === "function") closeNagashi();
      return true;
    }
  }catch(e){}

  try{
    if (ryukyokuOverlay && ryukyokuOverlay.style && ryukyokuOverlay.style.display !== "none" && ryukyokuOverlay.style.display !== ""){
      if (typeof closeRyukyoku === "function") closeRyukyoku();
      return true;
    }
  }catch(e){}

  return false;
}

function getPostAgariAutoAdvanceDelayMs(){
  return getGameSpeedMs("postAgariDelayMs", PLAYER_AI_POST_AGARI_DELAY_MS);
}

function getPostAgariOverlayRetryDelayMs(){
  const base = getPostAgariAutoAdvanceDelayMs();
  if (!Number.isFinite(base) || base <= 0) return 80;
  return Math.max(40, Math.min(120, base));
}

function schedulePlayerAiPostAgariAdvance(stage, delayMs){
  if (!isPlayerPostAgariAutoAdvanceEnabled()) return;

  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }

  const nextDelayMs = (Number.isFinite(delayMs) && delayMs >= 0)
    ? delayMs
    : getPostAgariAutoAdvanceDelayMs();

  __autoNextTimer = setTimeout(()=>{
    __autoNextTimer = null;

    if (!isEnded) return;

    if (stage === "overlay"){
      if (__postAgariStage !== "overlay") return;
      movePostAgariFlowFromOverlayToTable(()=>{
        closeCurrentAgariOverlayForAutoAdvance();
      });
      return;
    }

    if (stage === "result"){
      if (__postAgariStage !== "result") return;
      movePostAgariFlowFromResultToNext();
      return;
    }

    if (stage === "next"){
      if (__postAgariStage !== "nextArmed") return;
      if (isAnyOverlayVisible()){
        schedulePlayerAiPostAgariAdvance("next", getPostAgariOverlayRetryDelayMs());
        return;
      }
      startNextKyoku();
    }
  }, nextDelayMs);
}

function installRyukyokuOverlayStagePatch(){
  try{
    if (typeof openRyukyoku !== "function") return;
    if (openRyukyoku.__playerAiOverlayWrapped) return;

    const original = openRyukyoku;
    const wrapped = function(...args){
      try{
        setPostAgariStageToOverlay();
      }catch(e){}
      return original.apply(this, args);
    };

    wrapped.__playerAiOverlayWrapped = true;
    openRyukyoku = wrapped;
  }catch(e){}
}

// ================================
// ★ 次局へ進む（ここだけで局進行）
// ================================
function startNextKyoku(){
  if (!__nextKyokuArmed) return;
  __nextKyokuArmed = false;

  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  const nextSeatOf = (s)=>{
    if (typeof nextSeatIndexOf === "function") return nextSeatIndexOf(s);
    return (s + 1) % 3;
  };

  // ================================
  // ★ 親番/本場の進行ルール（このプロジェクト仕様）
  // - 親がアガった：連荘（本場+1 / 局番号は据え置き）
  // - 山枯れ流局で親テンパイ：連荘（本場+1 / 局番号は据え置き）
  // - 親がアガらない / 親ノーテン流局：親流れ（親交代 / 本場=0 / 局番号+1）
  //
  // ★ 三麻の局進行
  // - 東1 → 東2 → 東3 → 南1 → 南2 → 南3
  // - 南3で親が流れたら対局終了
  // ================================
  let dealerKeeps = false;

  try{
    const renchanType = getConfiguredRenchanTypeForMain();
    const headEntry = getHeadAgariResultEntrySafe();
    if (headEntry && (headEntry.winType === "tsumo" || headEntry.winType === "ron")){
      dealerKeeps = (headEntry.winnerSeatIndex === dealer);
    } else if (lastAgariType === "tsumo" || lastAgariType === "ron"){
      dealerKeeps = (lastAgariWinnerSeatIndex === dealer);
    } else if (lastAgariType === "nagashi"){
      dealerKeeps = Array.isArray(lastNagashiWinnerSeatIndexes) && lastNagashiWinnerSeatIndexes.includes(dealer);
    } else if (lastAgariType === "ryukyoku"){
      dealerKeeps = (renchanType === "tenpai") ? (lastRyukyokuDealerTenpai === true) : false;
    } else {
      dealerKeeps = false;
    }
  }catch(e){
    dealerKeeps = false;
  }

  if (dealerKeeps){
    honba = (typeof honba === "number") ? (honba + 1) : 1;
    // roundNumber / roundWind は据え置き
  } else {
    // 親流れ
    eastSeatIndex = nextSeatOf(dealer);
    honba = 0;

    // 次局（表示上の局番号）
    roundNumber++;

    if (roundNumber > 3){
      const gameType = getConfiguredGameTypeForMain();
      if (roundWind === "東" && gameType !== "tonpuu"){
        roundWind = "南";
        roundNumber = 1;
      } else {
        // 東3 / 南3 終了
        lastAgariWinnerSeatIndex = null;
        lastAgariDiscarderSeatIndex = null;
        lastAgariType = null;
        lastAgariRonTile = null;
        lastRyukyokuDealerTenpai = null;

        resetPostAgariStage();
        return;
      }
    }
  }

  // 次局に影響を残さない
  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;
  try{ if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function") window.clearAgariResultQueue(); }catch(e){}

  resetPostAgariStage();
  startNewKyoku();
}

function armNextKyoku(){
  // ★放置で「次局に行けなくなる」原因だった 2秒自動解除をやめる
  // これで、卓確認後にしばらく放置しても、次のクリックで次局へ進める
  if (__autoNextTimer){
    clearTimeout(__autoNextTimer);
    __autoNextTimer = null;
  }
  __nextKyokuArmed = true;
  __postAgariStage = "nextArmed";
  schedulePlayerAiPostAgariAdvance("next");
}

function movePostAgariFlowFromOverlayToTable(closeFn){
  try{
    if (typeof closeFn === "function") closeFn();
  }catch(e){}

  // 演出オーバーレイを閉じたら、卓確認画面へ
  __postAgariStage = "table";

  if (isPlayerPostAgariAutoAdvanceEnabled()){
    movePostAgariFlowFromTableToResult();
  }
}

function movePostAgariFlowFromTableToResult(){
  // 結果画面APIがまだ無い間は、従来どおり次局待ちへフォールバック
  if (!hasResultOverlayApi()){
    armNextKyoku();
    return;
  }

  try{
    openResultOverlay();
  }catch(e){}

  __postAgariStage = "result";
  schedulePlayerAiPostAgariAdvance("result");
}

function getSeatTilesForSettlementLog(seatIndex){
  if (seatIndex === 0){
    const out = Array.isArray(hand13) ? hand13.slice() : [];
    if (drawn && drawn.code) out.push(drawn);
    return out;
  }

  if (seatIndex === 1 || seatIndex === 2){
    const baseHand = seatIndex === 1
      ? (Array.isArray(cpuRightHand13) ? cpuRightHand13.slice() : [])
      : (Array.isArray(cpuLeftHand13) ? cpuLeftHand13.slice() : []);

    try{
      if (typeof getCpuDrawnTileBySeat === "function"){
        const extra = getCpuDrawnTileBySeat(seatIndex);
        if (extra && extra.code) baseHand.push(extra);
      }
    }catch(e){}

    return baseHand;
  }

  return [];
}

function getSeatFixedMeldCountForSettlementLog(seatIndex){
  if (seatIndex === 0){
    return Array.isArray(melds) ? melds.length : 0;
  }

  try{
    if (typeof getCpuFixedMeldCountBySeat === "function"){
      const count = Number(getCpuFixedMeldCountBySeat(seatIndex));
      if (Number.isFinite(count) && count >= 0) return count;
    }
  }catch(e){}

  if (seatIndex === 1){
    return (typeof cpuRightMelds !== "undefined" && Array.isArray(cpuRightMelds)) ? cpuRightMelds.length : 0;
  }
  if (seatIndex === 2){
    return (typeof cpuLeftMelds !== "undefined" && Array.isArray(cpuLeftMelds)) ? cpuLeftMelds.length : 0;
  }

  return 0;
}

function getExpectedConcealedTileCountForSettlementLog(fixedMeldCount){
  const n = 13 - ((Number(fixedMeldCount) || 0) * 3);
  return Math.max(0, n | 0);
}

function isTenpaiWithTilesForSettlementLog(tiles, fixedMeldCount){
  try{
    if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function") return false;
    const counts = countsFromTiles(Array.isArray(tiles) ? tiles : []);
    return calcShanten(counts, fixedMeldCount) === 0;
  }catch(e){
    return false;
  }
}

function isSeatTenpaiForSettlementLog(seatIndex){
  const tiles = getSeatTilesForSettlementLog(seatIndex);
  const fixedMeldCount = getSeatFixedMeldCountForSettlementLog(seatIndex);
  const expectedConcealedCount = getExpectedConcealedTileCountForSettlementLog(fixedMeldCount);
  const expectedWithDrawCount = expectedConcealedCount + 1;

  if (tiles.length === expectedConcealedCount){
    return isTenpaiWithTilesForSettlementLog(tiles, fixedMeldCount);
  }

  if (tiles.length === expectedWithDrawCount){
    for (let i = 0; i < tiles.length; i++){
      const candidate = tiles.slice();
      candidate.splice(i, 1);
      if (isTenpaiWithTilesForSettlementLog(candidate, fixedMeldCount)) return true;
    }
    return false;
  }

  return false;
}

function buildTenpaiSeatIndexesForSettlementLog(){
  const out = [];
  for (let seatIndex = 0; seatIndex < 3; seatIndex++){
    if (isSeatTenpaiForSettlementLog(seatIndex)) out.push(seatIndex);
  }
  return out;
}

function readSeatRiichiStateForSettlementLog(seatIndex){
  if (seatIndex === 0) return !!isRiichi;

  const getterNames = [
    "getRiichiStateBySeat",
    "getSeatRiichiState",
    "isSeatRiichi",
    "isRiichiSeat",
    "getCpuRiichiStateBySeat",
    "isCpuRiichiSeat"
  ];

  for (const name of getterNames){
    try{
      const fn = (typeof window !== "undefined" && typeof window[name] === "function") ? window[name] : null;
      if (!fn) continue;
      return !!fn(seatIndex);
    }catch(e){}
  }

  try{
    if (seatIndex === 1){
      if (typeof cpuRightRiichi !== "undefined") return !!cpuRightRiichi;
      if (typeof isCpuRightRiichi !== "undefined") return !!isCpuRightRiichi;
      if (typeof cpuRightIsRiichi !== "undefined") return !!cpuRightIsRiichi;
    }
    if (seatIndex === 2){
      if (typeof cpuLeftRiichi !== "undefined") return !!cpuLeftRiichi;
      if (typeof isCpuLeftRiichi !== "undefined") return !!isCpuLeftRiichi;
      if (typeof cpuLeftIsRiichi !== "undefined") return !!cpuLeftIsRiichi;
    }
  }catch(e){}

  return false;
}

function buildRiichiSeatIndexesForSettlementLog(){
  const out = [];
  for (let seatIndex = 0; seatIndex < 3; seatIndex++){
    if (readSeatRiichiStateForSettlementLog(seatIndex)) out.push(seatIndex);
  }
  return out;
}

function prepareSettlementForLog(settlement){
  if (!settlement || typeof settlement !== "object") return settlement;

  try{
    const out = { ...settlement };

    if (out.type === "agari"){
      out.tenpaiSeats = buildTenpaiSeatIndexesForSettlementLog();
    } else if (!Array.isArray(out.tenpaiSeats) || out.tenpaiSeats.length <= 0){
      const computedTenpaiSeats = buildTenpaiSeatIndexesForSettlementLog();
      if (computedTenpaiSeats.length > 0) out.tenpaiSeats = computedTenpaiSeats;
    }

    if (!Array.isArray(out.riichiSeats) || out.riichiSeats.length <= 0){
      const computedRiichiSeats = buildRiichiSeatIndexesForSettlementLog();
      if (computedRiichiSeats.length > 0) out.riichiSeats = computedRiichiSeats;
    }

    return out;
  }catch(e){
    return settlement;
  }
}

try{
  if (typeof window !== "undefined"){
    window.mbSanmaPrepareSettlementForLog = prepareSettlementForLog;
  }
}catch(e){}

function movePostAgariFlowFromResultToNext(){
  if (hasAgariResultQueueNow()){
    try{
      if (typeof window.hasNextAgariResultQueueEntry === "function" && window.hasNextAgariResultQueueEntry()){
        if (typeof window.advanceAgariResultQueue === "function") window.advanceAgariResultQueue();
        if (typeof openResultOverlay === "function") openResultOverlay();
        __postAgariStage = "result";
        schedulePlayerAiPostAgariAdvance("result");
        return;
      }
    }catch(e){}
  }

  let settlement = null;

  try{
    if (typeof buildCurrentRoundSettlement === "function"){
      settlement = buildCurrentRoundSettlement();
    }
  }catch(e){}

  try{
    if (typeof applyPendingRoundSettlement === "function"){
      settlement = applyPendingRoundSettlement() || settlement;
    }
  }catch(e){}

  try{
    if (typeof closeResultOverlay === "function") closeResultOverlay();
  }catch(e){}

  try{
    if (typeof render === "function") render();
  }catch(e){}

  let endInfo = null;
  try{
    if (typeof getHanchanEndReasonAfterSettlement === "function"){
      endInfo = getHanchanEndReasonAfterSettlement(settlement);
    }
  }catch(e){}

  if (endInfo && endInfo.end){
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.finishMatch === "function"){
        window.MBSanmaMatchLog.finishMatch(endInfo, settlement);
      }
    }catch(e){}
    try{
      if (typeof showHanchanEndOverlay === "function"){
        showHanchanEndOverlay(endInfo, settlement);
      }
    }catch(e){}
    resetPostAgariStage();
    return;
  }

  armNextKyoku();
}


function setInitialDoraAndUraFromDeadWall(){
  if (typeof resetDoraIndicatorsFromDeadWall === "function"){
    resetDoraIndicatorsFromDeadWall();
    return;
  }

  doraIndicators = [];
  uraDoraIndicators = [];
  try{ if (typeof deadWallDrawCursor !== "undefined") deadWallDrawCursor = 0; }catch(e){}

  if (!Array.isArray(deadWall) || deadWall.length <= 0) return;

  const omote = deadWall[8];
  if (omote && omote.code){
    doraIndicators.push({ code: omote.code, imgCode: omote.imgCode || omote.code, isRed: !!omote.isRed });
  }

  const ura = deadWall[12];
  if (ura && ura.code){
    uraDoraIndicators.push({ code: ura.code, imgCode: ura.imgCode || ura.code, isRed: !!ura.isRed });
  }
}

function resetKyokuRuntimeState(){
  bumpCpuTurnLoopEpoch();

  try{ if (typeof forceClearCpuTurnLoopGuard === "function") forceClearCpuTurnLoopGuard(); }catch(e){}
  try{ if (typeof clearPlayerDrawTimer === "function") clearPlayerDrawTimer(); }catch(e){}
  try{ if (typeof clearPlayerAutoDiscardTimer === "function") clearPlayerAutoDiscardTimer(); }catch(e){}
  try{ if (typeof clearPlayerCallAiTimer === "function") clearPlayerCallAiTimer(); }catch(e){}

  isEnded = false;

  isRiichi = false;
  isRiichiSelecting = false;
  riichiCandidates = null;
  riichiWait = false;
  try{ if (typeof resetPlayerRiichiDisplayState === "function") resetPlayerRiichiDisplayState(); }catch(e){}

  pendingCall = null;
  mustDiscardAfterCall = false;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  river = [];
  cpuLeftRiver  = [];
  cpuRightRiver = [];
  melds = [];
  peis  = [];

  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;

  doraIndicators = [];
  uraDoraIndicators = [];

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}
  try{ if (typeof clearAllDoubleRiichiFlags === "function") clearAllDoubleRiichiFlags(); }catch(e){}
  try{ if (typeof resetOpenCallOrKanFlag === "function") resetOpenCallOrKanFlag(); }catch(e){}
  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}
  try{ if (typeof resetCpuExtraState === "function") resetCpuExtraState(); }catch(e){}

  clearAutoNextTimer();
  resetPostAgariStage();

  try{ if (typeof closeTsumo === "function") closeTsumo(); }catch(e){}
  try{ if (typeof closeRon === "function") closeRon(); }catch(e){}
  try{ if (typeof closeNagashi === "function") closeNagashi(); }catch(e){}
  try{ if (typeof closeRyukyoku === "function") closeRyukyoku(); }catch(e){}
  try{ if (typeof closeResultOverlay === "function") closeResultOverlay(); }catch(e){}

  try{ if (typeof kanOverlay !== "undefined" && kanOverlay) kanOverlay.style.display = "none"; }catch(e){}
  try{ if (typeof riichiOverlay !== "undefined" && riichiOverlay) riichiOverlay.style.display = "none"; }catch(e){}
  try{ if (typeof drawOverlay !== "undefined" && drawOverlay) drawOverlay.style.display = "none"; }catch(e){}
}

function normalizeDebugTileSpec(imgCode){
  const raw = String(imgCode || "");
  if (!raw) return { code: "", imgCode: "" };

  if (raw === "siropocchi"){
    return { code: "5z", imgCode: "siropocchi" };
  }

  if (/^[rbgn][1-9][mpsz]$/.test(raw)){
    return { code: raw.slice(1), imgCode: raw };
  }

  return { code: raw, imgCode: raw };
}

function consumeRequestedDebugTileFromPool(pool, spec){
  if (!Array.isArray(pool) || !spec || !spec.code || !spec.imgCode) return null;

  let idx = pool.findIndex((t)=> t && t.code === spec.code && t.imgCode === spec.imgCode);

  if (idx < 0 && spec.code === "5z" && spec.imgCode === "5z"){
    idx = pool.findIndex((t)=> t && t.code === "5z");
  }

  if (idx < 0) return null;

  const picked = pool[idx];
  pool.splice(idx, 1);
  return picked;
}

function startDebugKyokuByCodes(selectedImgCodes){
  try{
    if (!Array.isArray(selectedImgCodes) || selectedImgCodes.length !== 13) return false;

    const requested = selectedImgCodes.map(normalizeDebugTileSpec);
    const fullWall = shuffle(makeWall());

    const consumeTile = ({ code, imgCode })=>{
      return consumeRequestedDebugTileFromPool(fullWall, { code, imgCode });
    };

    const selectedTiles = [];
    for (const item of requested){
      const tile = consumeTile(item);
      if (!tile) return false;
      selectedTiles.push(tile);
    }

    if (fullWall.length < (18 + 1 + 13 + 13)) return false;

    resetKyokuRuntimeState();

    try{
      if (typeof resetScoreStateForNewHanchan === "function"){
        resetScoreStateForNewHanchan();
      }
    }catch(e){}

    nextId = 1 + fullWall.length + selectedTiles.length;
    initWallsFromShuffled(fullWall);

    setInitialDoraAndUraFromDeadWall();

    hand13 = sortHand(selectedTiles);
    drawn = null;

    cpuRightHand13 = sortHand(wall.slice(0, 13));
    wall = wall.slice(13);

    cpuLeftHand13 = sortHand(wall.slice(0, 13));
    wall = wall.slice(13);

    initialHand13 = hand13.map(t => ({...t}));
    initialDrawn  = drawn ? ({...drawn}) : null;
    initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
    initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

    clearNewFlags();
    if (drawn) drawn.isNew = true;

    try{
      if (typeof initTurnForKyokuStart === "function"){
        initTurnForKyokuStart();
      } else {
        if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
        if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
      }
    }catch(e){}

    render();
    try{
      if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex === 0 && typeof schedulePlayerAutoDiscardIfNeeded === "function"){
        schedulePlayerAutoDiscardIfNeeded(true);
      }
    }catch(e){}
    return true;
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "startDebugKyokuByCodes()");
    return false;
  }
}

// ================================
// ================================
// ★ 新しい局（配牌〜）
// ================================


function parseDebugKyokuLabel(label){
  const text = String(label || '東1');
  if (text.startsWith('南')){
    const n = Number(text.slice(1)) || 1;
    return { roundWind: '南', roundNumber: Math.min(3, Math.max(1, n)) };
  }
  const n = Number(text.slice(1)) || 1;
  return { roundWind: '東', roundNumber: Math.min(3, Math.max(1, n)) };
}

function getDebugScenarioSafeMaxJunme(){
  try{
    const totalTiles = (typeof makeWall === "function") ? ((makeWall() || []).length | 0) : 108;
    const handReserve = 13 * 3;
    const deadWallReserve = 18;
    const wallTopReserve = 9;
    const openingDrawReserve = 1;
    const freeForRivers = Math.max(0, totalTiles - handReserve - deadWallReserve - wallTopReserve - openingDrawReserve);
    return Math.max(0, Math.floor(freeForRivers / 3));
  }catch(e){
    return 13;
  }
}


function buildDebugScenarioPonMeldFromTiles(tiles3){
  const tiles = Array.isArray(tiles3) ? tiles3.slice(0, 3) : [];
  if (tiles.length !== 3) return null;
  const firstCode = tiles[0] && tiles[0].code ? tiles[0].code : "";
  if (!firstCode) return null;
  const isSameCode = tiles.every((tile)=> tile && tile.code === firstCode);
  if (!isSameCode) return null;

  return {
    type: "pon",
    code: firstCode,
    tiles: tiles.map((tile)=> ({ ...tile }))
  };
}

function buildDebugScenarioSeatSetup(arr, options){
  const opts = (options && typeof options === "object") ? options : {};
  const hasOpenMeld = !!opts.hasOpenMeld;
  const keepOrder = !!opts.keepOrder;
  const consumeTile = (typeof opts.consumeTile === "function") ? opts.consumeTile : null;
  const drawRandomFromPool = (typeof opts.drawRandomFromPool === "function") ? opts.drawRandomFromPool : null;
  const normalizeCode = (typeof opts.normalizeCode === "function") ? opts.normalizeCode : null;

  if (!consumeTile || !drawRandomFromPool || !normalizeCode) return null;

  const rawList = Array.isArray(arr) ? arr.slice(0, 13) : [];
  const seatMelds = [];
  let concealedRawList = rawList.slice();
  let concealedTargetCount = 13;

  if (hasOpenMeld){
    const meldSpecs = rawList.slice(0, 3).map(normalizeDebugTileSpec);
    if (meldSpecs.length !== 3) return null;

    const meldTiles = [];
    for (const spec of meldSpecs){
      const tile = consumeTile(spec);
      if (!tile) return null;
      meldTiles.push(tile);
    }

    const meld = buildDebugScenarioPonMeldFromTiles(meldTiles);
    if (!meld) return null;

    seatMelds.push(meld);
    concealedRawList = rawList.slice(3);
    concealedTargetCount = 10;
  }

  const concealedTiles = [];
  for (const imgCode of concealedRawList.slice(0, concealedTargetCount)){
    const tile = consumeTile(normalizeDebugTileSpec(imgCode));
    if (!tile) return null;
    concealedTiles.push(tile);
  }

  while (concealedTiles.length < concealedTargetCount){
    const tile = drawRandomFromPool();
    if (!tile) return null;
    concealedTiles.push(tile);
  }

  return {
    hand13: keepOrder ? concealedTiles.slice() : sortHand(concealedTiles),
    melds: seatMelds
  };
}

function resetRuntimeStateForDebugScenario(){
  clearAutoNextTimer();
  resetPostAgariStage();

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startMatch === "function"){
      const meta = (typeof buildMatchLogStartMeta === "function") ? buildMatchLogStartMeta() : {};
      window.MBSanmaMatchLog.startMatch({
        ...meta,
        startedFrom: "startDebugKyokuByScenario",
        matchMode: "debug_scenario"
      });
    }
  }catch(e){}

  try{
    if (typeof resetScoreStateForNewHanchan === "function"){
      resetScoreStateForNewHanchan();
    }
  }catch(e){}

  try{
    if (typeof resetHanchanCarryState === "function"){
      resetHanchanCarryState();
    }
  }catch(e){}

  resetKyokuRuntimeState();

  roundWind = "東";
  roundNumber = 1;
  eastSeatIndex = 0;
  honba = 0;

  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;

  wall = [];
  liveWall = wall;
  deadWall = [];
  try{ if (typeof torikiriDrawableTiles !== "undefined") torikiriDrawableTiles = []; }catch(e){}
  doraIndicators = [];
  uraDoraIndicators = [];

  hand13 = [];
  drawn = null;
  cpuRightHand13 = [];
  cpuLeftHand13 = [];

  river = [];
  cpuRightRiver = [];
  cpuLeftRiver = [];
  melds = [];
  peis = [];

  try{ if (typeof cpuRightMelds !== "undefined") cpuRightMelds = []; }catch(e){}
  try{ if (typeof cpuLeftMelds !== "undefined") cpuLeftMelds = []; }catch(e){}
  try{ if (typeof cpuRightPeis !== "undefined") cpuRightPeis = []; }catch(e){}
  try{ if (typeof cpuLeftPeis !== "undefined") cpuLeftPeis = []; }catch(e){}
  try{ if (typeof setCpuDrawnTileBySeat === "function") setCpuDrawnTileBySeat(1, null); }catch(e){}
  try{ if (typeof setCpuDrawnTileBySeat === "function") setCpuDrawnTileBySeat(2, null); }catch(e){}

  initialHand13 = [];
  initialDrawn = null;
  initialCpuRightHand13 = [];
  initialCpuLeftHand13 = [];

  nextId = 1;

  try{
    if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
    if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
  }catch(e){}

  try{ if (typeof clearSelectedTile === "function") clearSelectedTile(); }catch(e){}
  try{ hoveredTileId = null; }catch(e){}
}

function pushDebugScenarioStartKyokuLog(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startKyoku === "function"){
      window.MBSanmaMatchLog.startKyoku({
        roundWind,
        roundNumber,
        honba,
        eastSeatIndex,
        kyotakuCount,
        scores,
        doraIndicators,
        uraDoraIndicators,
        wall,
        deadWall,
        hand13,
        drawn,
        cpuRightHand13,
        cpuLeftHand13,
        river,
        cpuRightRiver,
        cpuLeftRiver,
        melds,
        cpuRightMelds: (typeof cpuRightMelds !== "undefined") ? cpuRightMelds : [],
        cpuLeftMelds: (typeof cpuLeftMelds !== "undefined") ? cpuLeftMelds : [],
        peis,
        cpuRightPeis: (typeof cpuRightPeis !== "undefined") ? cpuRightPeis : [],
        cpuLeftPeis: (typeof cpuLeftPeis !== "undefined") ? cpuLeftPeis : []
      });
    }
  }catch(e){}
}

function reserveDebugScenarioSelectedTiles(fullPool, list, max){
  const out = [];
  const src = Array.isArray(list) ? list.slice(0, max) : [];
  for (const imgCode of src){
    const tile = consumeRequestedDebugTileFromPool(fullPool, normalizeDebugTileSpec(imgCode));
    if (!tile) return null;
    out.push(tile);
  }
  return out;
}

function buildDebugScenarioSeatSetupFromReservedTiles(reservedTiles, options){
  const opts = (options && typeof options === "object") ? options : {};
  const hasOpenMeld = !!opts.hasOpenMeld;
  const keepOrder = !!opts.keepOrder;
  const drawRandomFromPool = (typeof opts.drawRandomFromPool === "function") ? opts.drawRandomFromPool : null;

  if (!drawRandomFromPool) return null;

  const rawTiles = Array.isArray(reservedTiles) ? reservedTiles.slice() : [];
  const seatMelds = [];
  let concealedTiles = rawTiles.slice();
  let concealedTargetCount = 13;

  if (hasOpenMeld){
    const meldTiles = rawTiles.slice(0, 3);
    const meld = buildDebugScenarioPonMeldFromTiles(meldTiles);
    if (!meld) return null;
    seatMelds.push(meld);
    concealedTiles = rawTiles.slice(3);
    concealedTargetCount = 10;
  }

  while (concealedTiles.length < concealedTargetCount){
    const tile = drawRandomFromPool();
    if (!tile) return null;
    concealedTiles.push(tile);
  }

  if (concealedTiles.length > concealedTargetCount){
    concealedTiles = concealedTiles.slice(0, concealedTargetCount);
  }

  return {
    hand13: keepOrder ? concealedTiles.slice() : sortHand(concealedTiles),
    melds: seatMelds
  };
}

function buildDebugScenarioOrderedTilesFromReserved(reservedTiles, max, drawRandomFromPool){
  const out = Array.isArray(reservedTiles) ? reservedTiles.slice(0, max) : [];
  while (out.length < max){
    const tile = drawRandomFromPool();
    if (!tile) return null;
    out.push(tile);
  }
  return out;
}

function startDebugKyokuByScenario(opts){
  try{
    const fail = (message)=>{
      setDebugScenarioStartFailureReason(message);
      return false;
    };

    setDebugScenarioStartFailureReason("");

    const scenario = (opts && typeof opts === 'object') ? opts : {};
    const selected = (scenario.selected && typeof scenario.selected === 'object') ? scenario.selected : {};
    const flags = (scenario.flags && typeof scenario.flags === 'object') ? scenario.flags : {};
    const furoFlags = (flags.furo && typeof flags.furo === 'object') ? flags.furo : {};
    const cpuPresetDiscardOrderFlags = (flags.cpuPresetDiscardOrder && typeof flags.cpuPresetDiscardOrder === 'object') ? flags.cpuPresetDiscardOrder : {};
    const cpuRiichiOnly = !!scenario.cpuRiichiOnly;

    __suspendCpuAutoKick = true;


    const kyokuInfo = parseDebugKyokuLabel(scenario.kyokuLabel);
    const nextRoundWind = kyokuInfo.roundWind;
    const nextRoundNumber = kyokuInfo.roundNumber;
    const nextEastSeatIndex = (scenario.dealer === 1 || scenario.dealer === 2) ? scenario.dealer : 0;
    const nextHonba = (Number.isInteger(scenario.honba) && scenario.honba >= 0) ? scenario.honba : 0;

    const safeMaxJunme = getDebugScenarioSafeMaxJunme();
    const junme = Math.max(0, Math.min(safeMaxJunme, (Number.isInteger(scenario.junme) && scenario.junme >= 0)
      ? scenario.junme
      : (Number(scenario.junme) || 0)));

    const fullPool = shuffle(makeWall());

    const drawRandomFromPool = ()=>{
      if (!Array.isArray(fullPool) || fullPool.length <= 0) return null;
      return fullPool.pop() || null;
    };

    const reservedSelected = {
      me: reserveDebugScenarioSelectedTiles(fullPool, selected.me, 13),
      right: reserveDebugScenarioSelectedTiles(fullPool, selected.right, 13),
      left: reserveDebugScenarioSelectedTiles(fullPool, selected.left, 13),
      dora: reserveDebugScenarioSelectedTiles(fullPool, selected.dora, 1),
      deadDraw: reserveDebugScenarioSelectedTiles(fullPool, selected.deadDraw, 8),
      wallTop: reserveDebugScenarioSelectedTiles(fullPool, selected.wallTop, 9)
    };

    if (!reservedSelected.me) return fail('あなたの指定牌を山から確保できませんでした。指定牌の重複や在庫を確認してください。');
    if (!reservedSelected.right) return fail('右CPUの指定牌を山から確保できませんでした。指定牌の重複や在庫を確認してください。');
    if (!reservedSelected.left) return fail('左CPUの指定牌を山から確保できませんでした。指定牌の重複や在庫を確認してください。');
    if (!reservedSelected.dora) return fail('ドラ指定牌を山から確保できませんでした。');
    if (!reservedSelected.deadDraw) return fail('王牌補充牌の指定を山から確保できませんでした。');
    if (!reservedSelected.wallTop) return fail('次ツモ9枚の指定を山から確保できませんでした。');

    const meSetup = buildDebugScenarioSeatSetupFromReservedTiles(reservedSelected.me, {
      hasOpenMeld: !!furoFlags.me,
      keepOrder: false,
      drawRandomFromPool
    });
    const rightSetup = buildDebugScenarioSeatSetupFromReservedTiles(reservedSelected.right, {
      hasOpenMeld: !!furoFlags.right,
      keepOrder: !!cpuPresetDiscardOrderFlags.right,
      drawRandomFromPool
    });
    const leftSetup = buildDebugScenarioSeatSetupFromReservedTiles(reservedSelected.left, {
      hasOpenMeld: !!furoFlags.left,
      keepOrder: !!cpuPresetDiscardOrderFlags.left,
      drawRandomFromPool
    });

    if (!meSetup) return fail('あなたの副露指定を局面へ変換できませんでした。副露済みなら先頭3枚を同じ牌にしてください。');
    if (!rightSetup) return fail('右CPUの副露指定を局面へ変換できませんでした。副露済みなら先頭3枚を同じ牌にしてください。');
    if (!leftSetup) return fail('左CPUの副露指定を局面へ変換できませんでした。副露済みなら先頭3枚を同じ牌にしてください。');

    const meHand = meSetup.hand13;
    const rightHand = rightSetup.hand13;
    const leftHand = leftSetup.hand13;

    let omote = null;
    if (Array.isArray(reservedSelected.dora) && reservedSelected.dora.length > 0){
      omote = reservedSelected.dora[0] || null;
    } else {
      omote = drawRandomFromPool();
    }
    if (!omote) return fail('ドラ表示牌を確保できませんでした。');

    const ura = drawRandomFromPool();
    if (!ura) return fail('裏ドラ表示牌を確保できませんでした。');

    const supplementTiles = buildDebugScenarioOrderedTilesFromReserved(reservedSelected.deadDraw, 8, drawRandomFromPool);
    if (!supplementTiles) return fail('王牌補充牌8枚を用意できませんでした。');

    const extraOmoteTiles = [];
    while (extraOmoteTiles.length < 3){
      const tile = drawRandomFromPool();
      if (!tile) return fail('カンドラ表示牌を確保できませんでした。');
      extraOmoteTiles.push(tile);
    }

    const extraUraTiles = [];
    while (extraUraTiles.length < 3){
      const tile = drawRandomFromPool();
      if (!tile) return fail('カン裏表示牌を確保できませんでした。');
      extraUraTiles.push(tile);
    }

    const unusedDeadTiles = [];
    while (unusedDeadTiles.length < 2){
      const tile = drawRandomFromPool();
      if (!tile) return fail('王牌の未使用牌を確保できませんでした。');
      unusedDeadTiles.push(tile);
    }

    const customDeadWall = [
      ...supplementTiles,
      omote,
      ...extraOmoteTiles,
      ura,
      ...extraUraTiles,
      ...unusedDeadTiles
    ];

    const nextSeatOf = (s)=> ((s + 1) % 3);
    const riverOrder = [nextEastSeatIndex, nextSeatOf(nextEastSeatIndex), nextSeatOf(nextSeatOf(nextEastSeatIndex))];
    const riverMap = { 0: [], 1: [], 2: [] };

    for (let j = 0; j < junme; j++){
      for (const seat of riverOrder){
        const tile = drawRandomFromPool();
        if (!tile) return fail('巡目ぶんの河牌を用意できませんでした。');
        tile.isNew = false;
        riverMap[seat].push(tile);
      }
    }

    const wallTopTiles = buildDebugScenarioOrderedTilesFromReserved(reservedSelected.wallTop, 9, drawRandomFromPool);
    if (!wallTopTiles) return fail('次ツモ9枚を用意できませんでした。');

    const remainingWall = [
      ...shuffle(fullPool.slice()),
      ...wallTopTiles.slice().reverse()
    ];

    if (!Array.isArray(remainingWall) || remainingWall.length <= 0) return fail('残り山を構築できませんでした。');

    resetRuntimeStateForDebugScenario();

    setDebugCpuRiichiOnlyMode(cpuRiichiOnly);
    try{
      if (typeof setDebugCpuPresetDiscardOrderEnabledBySeat === 'function'){
        setDebugCpuPresetDiscardOrderEnabledBySeat(1, !!cpuPresetDiscardOrderFlags.right);
        setDebugCpuPresetDiscardOrderEnabledBySeat(2, !!cpuPresetDiscardOrderFlags.left);
      }
    }catch(e){}

    roundWind = nextRoundWind;
    roundNumber = nextRoundNumber;
    eastSeatIndex = nextEastSeatIndex;
    honba = nextHonba;

    wall = remainingWall;
    liveWall = wall;
    if (typeof getConfiguredWallEndTypeForGame === 'function' && getConfiguredWallEndTypeForGame() === 'all' && typeof buildTorikiriWallStateFromFixedDeadWall === 'function'){
      const torikiriState = buildTorikiriWallStateFromFixedDeadWall(customDeadWall);
      deadWall = torikiriState.reservedDeadWall;
      try{ if (typeof torikiriDrawableTiles !== 'undefined') torikiriDrawableTiles = torikiriState.drawableTiles.slice(); }catch(e){}
    } else {
      deadWall = customDeadWall;
      try{ if (typeof torikiriDrawableTiles !== 'undefined') torikiriDrawableTiles = []; }catch(e){}
    }
    try{ if (typeof deadWallDrawCursor !== 'undefined') deadWallDrawCursor = 0; }catch(e){}
    try{ if (typeof deadWallKanRefillCount !== 'undefined') deadWallKanRefillCount = 0; }catch(e){}

    setInitialDoraAndUraFromDeadWall();

    hand13 = meHand;
    cpuRightHand13 = rightHand;
    cpuLeftHand13 = leftHand;
    drawn = null;

    melds = Array.isArray(meSetup.melds) ? meSetup.melds.slice() : [];
    try{ if (typeof cpuRightMelds !== 'undefined') cpuRightMelds = Array.isArray(rightSetup.melds) ? rightSetup.melds.slice() : []; }catch(e){}
    try{ if (typeof cpuLeftMelds !== 'undefined') cpuLeftMelds = Array.isArray(leftSetup.melds) ? leftSetup.melds.slice() : []; }catch(e){}

    river = riverMap[0].slice();
    cpuRightRiver = riverMap[1].slice();
    cpuLeftRiver = riverMap[2].slice();

    initialHand13 = hand13.map(t => ({...t}));
    initialDrawn  = null;
    initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
    initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

    clearNewFlags();

    currentTurnSeatIndex = eastSeatIndex;
    turnPhase = 'DISCARD';
    if (typeof clearSelectedTile === 'function') clearSelectedTile();

    if (currentTurnSeatIndex === 0){
      drawn = drawOne();
      if (!drawn) return fail('親の初手ツモ牌を引けませんでした。');
      drawn.isNew = true;
      initialDrawn = drawn ? ({...drawn}) : null;
      pushDebugScenarioStartKyokuLog();
      __suspendCpuAutoKick = false;
      render();
      try{
        if (typeof schedulePlayerAutoDiscardIfNeeded === 'function'){
          schedulePlayerAutoDiscardIfNeeded(true);
        }
      }catch(e){}
    } else {
      drawn = null;
      initialDrawn = null;
      pushDebugScenarioStartKyokuLog();
      __suspendCpuAutoKick = false;
      render();
      if (typeof kickCpuTurnsIfNeeded === 'function'){
        kickCpuTurnsIfNeeded(true);
      }
    }

    return true;
  }catch(err){
    setDebugScenarioStartFailureReason(err && err.message ? err.message : 'startDebugKyokuByScenario() で例外が発生しました。');
    if (typeof showFatalError === 'function') showFatalError(err, 'startDebugKyokuByScenario()');
    return false;
  }finally{
    __suspendCpuAutoKick = false;
  }
}

function startNewKyoku(){
  resetKyokuRuntimeState();

  nextId = 1;
  const shuffled108 = shuffle(makeWall());
  initWallsFromShuffled(shuffled108);

  setInitialDoraAndUraFromDeadWall();

  hand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  drawn = null;
  if ((typeof eastSeatIndex === "number" ? eastSeatIndex : 0) === 0){
    drawn = drawOne();
    if (drawn) drawn.isNew = true;
  }

  cpuRightHand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  cpuLeftHand13 = sortHand(wall.slice(0, 13));
  wall = wall.slice(13);

  initialHand13 = hand13.map(t => ({...t}));
  initialDrawn  = drawn ? ({...drawn}) : null;

  initialCpuRightHand13 = cpuRightHand13.map(t => ({...t}));
  initialCpuLeftHand13  = cpuLeftHand13.map(t => ({...t}));

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startKyoku === "function"){
      window.MBSanmaMatchLog.startKyoku({
        roundWind,
        roundNumber,
        honba,
        eastSeatIndex,
        kyotakuCount,
        scores,
        doraIndicators,
        uraDoraIndicators,
        wall,
        deadWall,
        hand13,
        drawn,
        cpuRightHand13,
        cpuLeftHand13,
        river,
        cpuRightRiver,
        cpuLeftRiver,
        melds,
        cpuRightMelds: (typeof cpuRightMelds !== "undefined") ? cpuRightMelds : [],
        cpuLeftMelds: (typeof cpuLeftMelds !== "undefined") ? cpuLeftMelds : [],
        peis,
        cpuRightPeis: (typeof cpuRightPeis !== "undefined") ? cpuRightPeis : [],
        cpuLeftPeis: (typeof cpuLeftPeis !== "undefined") ? cpuLeftPeis : []
      });
    }
  }catch(e){}

  clearNewFlags();
  if (drawn) drawn.isNew = true;

  try{
    if (typeof initTurnForKyokuStart === "function"){
      initTurnForKyokuStart();
    } else {
      if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
      if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
    }
  }catch(e){}

  render();
}

// ================================
// ★ 新しい半荘
// ================================
function resetHanchanCarryState(){
  try{
    if (typeof clearPendingRoundSettlement === "function"){
      clearPendingRoundSettlement();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.clearAgariResultQueue === "function"){
      window.clearAgariResultQueue();
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.resetCommittedRiichiStickState === "function"){
      window.resetCommittedRiichiStickState();
    }
  }catch(e){}
}


function getMatchLogCpuSeatMetaSafe(seatIndex){
  return {
    openEngineMode: (typeof getCpuOpenSeatEngineMode === "function") ? getCpuOpenSeatEngineMode(seatIndex) : "internal",
    openProfileKey: (typeof getCpuOpenSeatProfileKey === "function") ? getCpuOpenSeatProfileKey(seatIndex) : "",
    discardEngineMode: (typeof getCpuDiscardSeatEngineMode === "function") ? getCpuDiscardSeatEngineMode(seatIndex) : "internal",
    discardStyleKey: (typeof getCpuDiscardSeatExternalStyleKey === "function") ? getCpuDiscardSeatExternalStyleKey(seatIndex) : ""
  };
}

function isMatchLogBridgeEnabledByCurrentSettings(){
  try{
    const right = getMatchLogCpuSeatMetaSafe(1);
    const left = getMatchLogCpuSeatMetaSafe(2);
    return right.openEngineMode === "external" ||
      right.discardEngineMode === "external" ||
      left.openEngineMode === "external" ||
      left.discardEngineMode === "external";
  }catch(e){
    return false;
  }
}

function cloneRuleSnapshotForMatchLog(value){
  try{
    if (!value || typeof value !== "object") return null;
    return JSON.parse(JSON.stringify(value));
  }catch(e){
    return null;
  }
}

function getCurrentRuleSetIdForMatchLog(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig){
      const explicit = String(window.MBSanmaRulesConfig.ruleSetId || "").trim();
      if (explicit) return explicit;
    }
  }catch(e){}
  return "standard";
}

function getCurrentRuleSnapshotForMatchLog(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.read === "function"){
      return cloneRuleSnapshotForMatchLog(window.MBSanmaRulesConfig.read());
    }
  }catch(e){}
  return null;
}

function buildMatchLogStartMeta(){
  return {
    startedFrom: "startNewHanchan",
    appTitle: "MBサンマアプリ版",
    ruleSetId: getCurrentRuleSetIdForMatchLog(),
    ruleSnapshot: getCurrentRuleSnapshotForMatchLog(),
    playerControl: {
      discardMode: (typeof getPlayerDiscardControlMode === "function") ? getPlayerDiscardControlMode() : "manual",
      openMode: (typeof getPlayerOpenControlMode === "function") ? getPlayerOpenControlMode() : "manual",
      specialMode: (typeof getPlayerSpecialControlMode === "function") ? getPlayerSpecialControlMode() : "manual"
    },
    cpuSeats: {
      1: getMatchLogCpuSeatMetaSafe(1),
      2: getMatchLogCpuSeatMetaSafe(2)
    },
    bridgeEnabled: isMatchLogBridgeEnabledByCurrentSettings()
  };
}

function startNewHanchan(){
  clearAutoNextTimer();
  setDebugCpuRiichiOnlyMode(false);
  try{
    if (typeof setDebugCpuPresetDiscardOrderEnabledBySeat === "function"){
      setDebugCpuPresetDiscardOrderEnabledBySeat(1, false);
      setDebugCpuPresetDiscardOrderEnabledBySeat(2, false);
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.startMatch === "function"){
      window.MBSanmaMatchLog.startMatch(buildMatchLogStartMeta());
    }
  }catch(e){}

  try{
    if (typeof resetScoreStateForNewHanchan === "function"){
      resetScoreStateForNewHanchan();
    }
  }catch(e){}

  resetHanchanCarryState();

  roundWind = "東";
  roundNumber = 1;
  eastSeatIndex = Math.floor(Math.random() * 3);
  honba = 0;

  lastAgariWinnerSeatIndex = null;
  lastAgariDiscarderSeatIndex = null;
  lastAgariType = null;
  lastAgariRonTile = null;
  lastRyukyokuDealerTenpai = null;

  resetPostAgariStage();
  startNewKyoku();
}

// ================================
// ★ リセット（配牌に戻す）
// ================================
function doReset(){
  if (!initialHand13 || initialHand13.length === 0) return;

  resetKyokuRuntimeState();

  hand13 = initialHand13.map(t => ({...t}));
  drawn  = initialDrawn ? ({...initialDrawn}) : null;

  cpuRightHand13 = initialCpuRightHand13.map(t => ({...t}));
  cpuLeftHand13  = initialCpuLeftHand13.map(t => ({...t}));

  clearNewFlags();
  if (drawn) drawn.isNew = true;

  try{
    if (typeof initTurnForKyokuStart === "function"){
      initTurnForKyokuStart();
    } else {
      if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
      if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
    }
  }catch(e){}

  render();
}

// ================================

// ================================

// ================================

// ================================
// ★ オーバーレイの表示判定（卓画面に戻っているか）
// ================================
function isAnyOverlayVisible(){
  const isShown = (el)=>{
    if (!el) return false;
    // display:none だけで判定（CSS次第で opacity などもあるが、ここは安全側）
    const d = el.style && el.style.display;
    return (d !== "none" && d !== "");
  };

  // overlayは「表示時に style.display='block' などを付けてる前提」
  // もし display 指定を使っていない場合でも、卓クリック誤爆を防ぐために
  // isEnded=false の局中は進めない（下の卓クリック側で守る）
  return (
    isShown(tsumoOverlay) ||
    isShown(ronOverlay) ||
    isShown(nagashiOverlay) ||
    isShown(ryukyokuOverlay) ||
    isShown(kanOverlay) ||
    isShown(riichiOverlay) ||
    isResultOverlayVisible()
  );
}

// ================================
// ★ 演出オーバーレイを閉じたら「卓確認画面」へ
// ================================
function onAgariOverlayCloseToTable(closeFn){
  movePostAgariFlowFromOverlayToTable(closeFn);
}

function canUsePeiButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canUseRiichiButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canUseClosedKanButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;

  if (typeof pendingCall !== "undefined" && pendingCall){
    return false;
  }

  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
  }

  return true;
}

function canUseMinkanButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canMinkan;
}

function canUsePonButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canPon;
}

function canUseRonButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall === "undefined" || !pendingCall) return false;
  return !!pendingCall.canRon;
}

function canUseRiichiTsumoSkipButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isRiichi === "undefined" || !isRiichi) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  if (!drawn) return false;
  if (typeof canTsumoAgariNow === "function") return !!canTsumoAgariNow();
  return false;
}

function canUsePassButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return true;
  return canUseRiichiTsumoSkipButtonNow();
}

function canUseTsumoButtonNow(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

// ================================
// ★ 卓クリック / 結果クリックの進行
// - isEnded の時だけ
// - 演出オーバーレイが出ている最中は卓クリック無効
// - ボタン類のクリックは誤爆しないよう除外
// ================================
function bindTableClickFlowAfterAgari(){
  document.addEventListener("click", (ev)=>{
    try{
      if (!isEnded) return;

      const t = ev && ev.target;

      // ボタン操作で誤爆しない
      if (t && (t.closest && t.closest("button"))) return;

      // 演出中は卓クリックで進めない（オーバーレイ側クリックのみ）
      if (__postAgariStage === "overlay"){
        return;
      }

      // 卓確認中 → 結果確認画面
      if (__postAgariStage === "table"){
        if (isAnyOverlayVisible()) return;
        movePostAgariFlowFromTableToResult();
        return;
      }

      // 結果確認中は、結果画面側クリックで処理する
      if (__postAgariStage === "result"){
        return;
      }

      // 次局待ち → 次局
      if (__postAgariStage === "nextArmed"){
        if (isAnyOverlayVisible()) return;
        startNextKyoku();
      }
    }catch(e){
      // 何もしない
    }
  }, true);
}


const GAME_SETTINGS_STORAGE_KEY = "mbsanma_game_settings_v1";
const CPU_STRENGTH_PRESET_LIBRARY = Object.freeze({
  weak: Object.freeze({
    key: "weak",
    label: "よわい",
    openEngineMode: "internal",
    openProfileKey: "safe",
    discardEngineMode: "internal",
    discardStyleKey: "defensive"
  }),
  normal: Object.freeze({
    key: "normal",
    label: "普通",
    openEngineMode: "internal",
    openProfileKey: "balanced",
    discardEngineMode: "internal",
    discardStyleKey: "balanced"
  }),
  strong: Object.freeze({
    key: "strong",
    label: "つよい",
    openEngineMode: "internal",
    openProfileKey: "speedy",
    discardEngineMode: "internal",
    discardStyleKey: "speedy"
  })
});
const DEFAULT_CPU_STRENGTH_PRESET_KEY = "normal";
const DEFAULT_CPU_VERIFY_TUNING = Object.freeze({
  enabled: false,
  discard: Object.freeze({
    pushPullBias: 0,
    speedShapeBias: 0,
    meldRiichiBias: 0,
    winValueBias: 0,
    situationalFlexBias: 0
  }),
  open: Object.freeze({
    callAggressionBias: 0,
    speedBias: 0,
    valueBias: 0,
    defenseBias: 0
  })
});
const APP_LAUNCH_MODE_STORAGE_KEY = "mbsanma_app_launch_mode_v1";
const APP_PLAYER_MODE_STORAGE_KEY = "mbsanma_app_player_mode_v1";

function readAppRuntimeModeFromSessionStorage(){
  let launchMode = "battle";
  let playerMode = "manual";

  try{
    if (typeof sessionStorage !== "undefined"){
      const storedLaunchMode = String(sessionStorage.getItem(APP_LAUNCH_MODE_STORAGE_KEY) || "").toLowerCase();
      if (storedLaunchMode === "verify") launchMode = "verify";
    }
  }catch(e){}

  try{
    if (typeof sessionStorage !== "undefined"){
      const storedPlayerMode = String(sessionStorage.getItem(APP_PLAYER_MODE_STORAGE_KEY) || "").toLowerCase();
      if (storedPlayerMode === "auto") playerMode = "auto";
    }
  }catch(e){}

  if (launchMode === "verify" && playerMode !== "manual") playerMode = "auto";
  if (launchMode !== "verify" && playerMode !== "auto") playerMode = "manual";

  return {
    launchMode,
    playerMode,
    isBattleMode: launchMode === "battle",
    isVerifyMode: launchMode === "verify",
    isAutoPlayer: playerMode === "auto"
  };
}

function notifyPlayerControlModeChanged(){
  try{
    if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
    window.dispatchEvent(new CustomEvent("mbsanma:player-control-mode-changed", {
      detail: {
        mode: getPlayerUnifiedControlMode()
      }
    }));
  }catch(e){}
}

function applyAppRuntimeLaunchDefaultToPlayerControls(){
  const config = readAppRuntimeModeFromSessionStorage();
  setPlayerUnifiedControlMode(config.isAutoPlayer ? "internal" : "manual");
  notifyPlayerControlModeChanged();
  return config;
}


const PLAYER_CONTROL_MODE_LIBRARY = {
  manual: { key: "manual", label: "手動" },
  internal: { key: "internal", label: "内部AI" }
};

let playerDiscardControlMode = "manual";
let playerOpenControlMode = "manual";
let playerSpecialControlMode = "manual";

function normalizePlayerControlMode(mode){
  return String(mode || "manual") === "internal" ? "internal" : "manual";
}

function getPlayerDiscardControlMode(){
  return normalizePlayerControlMode(playerDiscardControlMode);
}

function setPlayerDiscardControlMode(mode){
  playerDiscardControlMode = normalizePlayerControlMode(mode);
  return playerDiscardControlMode;
}

function isPlayerDiscardAiEnabled(){
  return getPlayerDiscardControlMode() === "internal";
}

function getPlayerOpenControlMode(){
  return normalizePlayerControlMode(playerOpenControlMode);
}

function setPlayerOpenControlMode(mode){
  playerOpenControlMode = normalizePlayerControlMode(mode);
  return playerOpenControlMode;
}

function isPlayerOpenAiEnabled(){
  return getPlayerOpenControlMode() === "internal";
}

function getPlayerSpecialControlMode(){
  return normalizePlayerControlMode(playerSpecialControlMode);
}

function setPlayerSpecialControlMode(mode){
  playerSpecialControlMode = normalizePlayerControlMode(mode);
  return playerSpecialControlMode;
}

function isPlayerSpecialAiEnabled(){
  return getPlayerSpecialControlMode() === "internal";
}

try{
  if (typeof window !== "undefined"){
    window.PLAYER_CONTROL_MODE_LIBRARY = PLAYER_CONTROL_MODE_LIBRARY;
    window.getPlayerDiscardControlMode = getPlayerDiscardControlMode;
    window.setPlayerDiscardControlMode = setPlayerDiscardControlMode;
    window.isPlayerDiscardAiEnabled = isPlayerDiscardAiEnabled;
    window.getPlayerOpenControlMode = getPlayerOpenControlMode;
    window.setPlayerOpenControlMode = setPlayerOpenControlMode;
    window.isPlayerOpenAiEnabled = isPlayerOpenAiEnabled;
    window.getPlayerSpecialControlMode = getPlayerSpecialControlMode;
    window.setPlayerSpecialControlMode = setPlayerSpecialControlMode;
    window.isPlayerSpecialAiEnabled = isPlayerSpecialAiEnabled;
    window.getDebugScenarioSafeMaxJunme = getDebugScenarioSafeMaxJunme;
  }
}catch(e){}

function applyNonPersistentCpuDefaultsOnReload(){
  try{
    if (typeof setCpuHandOpen === "function") {
      setCpuHandOpen(false);
    } else {
      isCpuHandOpen = false;
    }
  }catch(e){}

  [0, 1, 2].forEach((seatIndex)=>{
    try{
      if (typeof setCpuOpenSeatEngineMode === "function") {
        setCpuOpenSeatEngineMode(seatIndex, "internal");
      }
    }catch(e){}

    try{
      if (typeof setCpuOpenSeatProfile === "function") {
        setCpuOpenSeatProfile(seatIndex, "balanced");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatEngineMode === "function") {
        setCpuDiscardSeatEngineMode(seatIndex, "internal");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatProfile === "function") {
        setCpuDiscardSeatProfile(seatIndex, "balanced");
      }
    }catch(e){}

    try{
      if (typeof setCpuDiscardSeatExternalStyle === "function") {
        setCpuDiscardSeatExternalStyle(seatIndex, "balanced");
      }
    }catch(e){}
  });

  syncQuickSettingButtons();
}

function getSettingsOverlayEl(){
  return document.getElementById("settingsOverlay");
}

function getSettingsBodyEl(){
  return document.getElementById("settingsBody");
}

function getSettingsCloseBtnEl(){
  return document.getElementById("settingsCloseBtn");
}

function getSettingsBtnEl(){
  return document.getElementById("settingsBtn");
}

let activeSettingsTab = "display";
let cpuStrengthPresetKey = DEFAULT_CPU_STRENGTH_PRESET_KEY;
let cpuVerifyTuning = cloneCpuVerifyTuning(DEFAULT_CPU_VERIFY_TUNING);

function normalizeSettingsTab(tabKey){
  const key = String(tabKey || "display");
  if (key === "player" || key === "cpu") return key;
  return "display";
}

function cloneCpuVerifyTuning(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const discardSrc = (src.discard && typeof src.discard === "object") ? src.discard : {};
  const openSrc = (src.open && typeof src.open === "object") ? src.open : {};
  return {
    enabled: !!src.enabled,
    discard: {
      pushPullBias: Number(discardSrc.pushPullBias) || 0,
      speedShapeBias: Number(discardSrc.speedShapeBias) || 0,
      meldRiichiBias: Number(discardSrc.meldRiichiBias) || 0,
      winValueBias: Number(discardSrc.winValueBias) || 0,
      situationalFlexBias: Number(discardSrc.situationalFlexBias) || 0
    },
    open: {
      callAggressionBias: Number(openSrc.callAggressionBias) || 0,
      speedBias: Number(openSrc.speedBias) || 0,
      valueBias: Number(openSrc.valueBias) || 0,
      defenseBias: Number(openSrc.defenseBias) || 0
    }
  };
}

function normalizeCpuStrengthPresetKey(key){
  const raw = String(key || "").trim().toLowerCase();
  if (raw === "weak" || raw === "easy") return "weak";
  if (raw === "strong" || raw === "hard") return "strong";
  return "normal";
}

function getCpuStrengthPresetLibrary(){
  return CPU_STRENGTH_PRESET_LIBRARY;
}

function getCpuStrengthPreset(key){
  return CPU_STRENGTH_PRESET_LIBRARY[normalizeCpuStrengthPresetKey(key)] || CPU_STRENGTH_PRESET_LIBRARY[DEFAULT_CPU_STRENGTH_PRESET_KEY];
}

function getCpuStrengthPresetKey(){
  return normalizeCpuStrengthPresetKey(cpuStrengthPresetKey);
}

function setCpuStrengthPreset(key){
  const preset = getCpuStrengthPreset(key);
  cpuStrengthPresetKey = preset.key;

  if (typeof setAllCpuOpenSeatEngineModes === "function"){
    setAllCpuOpenSeatEngineModes(preset.openEngineMode || "internal");
  }
  if (typeof setAllCpuOpenSeatProfiles === "function"){
    setAllCpuOpenSeatProfiles(preset.openProfileKey || "balanced");
  }
  if (typeof setCpuDiscardSeatEngineModeAll === "function"){
    setCpuDiscardSeatEngineModeAll(preset.discardEngineMode || "internal");
  }
  if (typeof setCpuDiscardSeatExternalStyleAll === "function"){
    setCpuDiscardSeatExternalStyleAll(preset.discardStyleKey || "balanced");
  }

  return preset.key;
}

function getCpuVerifyTuning(){
  return cloneCpuVerifyTuning(cpuVerifyTuning);
}

function setCpuVerifyTuning(raw){
  cpuVerifyTuning = cloneCpuVerifyTuning(raw);
  return getCpuVerifyTuning();
}

try{
  if (typeof window !== "undefined"){
    window.CPU_STRENGTH_PRESET_LIBRARY = CPU_STRENGTH_PRESET_LIBRARY;
    window.DEFAULT_CPU_STRENGTH_PRESET_KEY = DEFAULT_CPU_STRENGTH_PRESET_KEY;
    window.DEFAULT_CPU_VERIFY_TUNING = DEFAULT_CPU_VERIFY_TUNING;
    window.getCpuStrengthPresetLibrary = getCpuStrengthPresetLibrary;
    window.getCpuStrengthPreset = getCpuStrengthPreset;
    window.getCpuStrengthPresetKey = getCpuStrengthPresetKey;
    window.setCpuStrengthPreset = setCpuStrengthPreset;
    window.getCpuVerifyTuning = getCpuVerifyTuning;
    window.setCpuVerifyTuning = setCpuVerifyTuning;
  }
}catch(e){}

function getActiveSettingsTab(){
  return normalizeSettingsTab(activeSettingsTab);
}

function setActiveSettingsTab(tabKey){
  activeSettingsTab = normalizeSettingsTab(tabKey);
  return activeSettingsTab;
}

function isSettingsOverlayVisible(){
  const el = getSettingsOverlayEl();
  if (!el) return false;
  return el.style.display === "flex";
}

function syncQuickSettingButtons(){
  try{
    if (typeof cpuOpenToggleBtn !== "undefined" && cpuOpenToggleBtn && typeof getCpuHandOpenLabel === "function"){
      cpuOpenToggleBtn.textContent = getCpuHandOpenLabel();
    }
  }catch(e){}

  try{
    if (ukeireToggleBtn){
      ukeireToggleBtn.textContent = `受け入れ：${isUkeireVisible ? "ON" : "OFF"}`;
    }
  }catch(e){}
}

function getGameSettingSeatLabel(seatIndex){
  if (seatIndex === 1) return "右CP";
  if (seatIndex === 2) return "左CP";
  return "CP";
}

function getPlayerControlModeOptions(){
  const lib = (typeof PLAYER_CONTROL_MODE_LIBRARY === "object" && PLAYER_CONTROL_MODE_LIBRARY) ? PLAYER_CONTROL_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: lib[key] && lib[key].label ? lib[key].label : key }));
}

function getPlayerUnifiedControlMode(){
  const discardMode = getPlayerDiscardControlMode();
  const openMode = getPlayerOpenControlMode();
  const specialMode = getPlayerSpecialControlMode();

  if (discardMode === "internal" && openMode === "internal" && specialMode === "internal"){
    return "internal";
  }

  return "manual";
}

function setPlayerUnifiedControlMode(mode){
  const normalized = normalizePlayerControlMode(mode);
  setPlayerDiscardControlMode(normalized);
  setPlayerOpenControlMode(normalized);
  setPlayerSpecialControlMode(normalized);
  return normalized;
}

function getPlayerControlModeLabelJa(mode){
  return normalizePlayerControlMode(mode) === "internal" ? "内部AI" : "手動";
}

function buildPlayerSettingsSectionHtml(){
  const unifiedMode = getPlayerUnifiedControlMode();
  const discardMode = getPlayerDiscardControlMode();
  const openMode = getPlayerOpenControlMode();
  const specialMode = getPlayerSpecialControlMode();

  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">自分設定</div>
      <div class="settingsSeats">
        <div class="settingsSeatCard">
          <div class="settingsSeatTitle">あなた</div>

          <div class="settingsField settingsPlayerModeRow">
            <div class="settingsLabel">操作モード</div>

            <div class="settingsModeSwitch" role="group" aria-label="自分操作モード切替">
              <button
                type="button"
                class="settingsModeSwitchBtn${unifiedMode === "manual" ? " isActive" : ""}"
                data-player-mode="manual"
                aria-pressed="${unifiedMode === "manual" ? "true" : "false"}"
              >手動</button>
              <button
                type="button"
                class="settingsModeSwitchBtn${unifiedMode === "internal" ? " isActive" : ""}"
                data-player-mode="internal"
                aria-pressed="${unifiedMode === "internal" ? "true" : "false"}"
              >自動</button>
            </div>

            <div class="settingsModeSummary">
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">打牌操作</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(discardMode))}</span>
              </div>
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">副露選択</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(openMode))}</span>
              </div>
              <div class="settingsModeSummaryItem">
                <span class="settingsModeSummaryLabel">特殊行動</span>
                <span class="settingsModeSummaryValue">${escapeSettingsHtml(getPlayerControlModeLabelJa(specialMode))}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildSettingsTabsHtml(){
  const activeTab = getActiveSettingsTab();
  const tabs = [
    { key: "display", label: "表示" },
    { key: "player", label: "自分設定" },
    { key: "cpu", label: "CP設定" }
  ];

  return `
    <div id="settingsTabs" role="tablist" aria-label="設定タブ">
      ${tabs.map((tab)=> `
        <button
          type="button"
          class="settingsTabBtn${activeTab === tab.key ? " isActive" : ""}"
          data-settings-tab="${tab.key}"
          role="tab"
          aria-selected="${activeTab === tab.key ? "true" : "false"}"
        >${tab.label}</button>
      `).join("")}
    </div>
  `;
}

function buildDisplaySettingsPaneHtml(){
  const cpuHandOpen = (typeof isCpuHandOpen !== "undefined") ? !!isCpuHandOpen : false;
  const ukeireVisible = !!isUkeireVisible;
  const verifyFastMode = getVerifyFastModeLevel();
  const isVerifyMode = isVerifyLaunchModeNow();
  const verifySpeedSummary = verifyFastMode === "ultra"
    ? "超高速"
    : (verifyFastMode === "fast" ? "高速" : "OFF");

  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">表示</div>
      <div class="settingsToggleRow">
        <label class="settingsCheck">
          <input type="checkbox" id="settingsCpuHandOpen"${cpuHandOpen ? " checked" : ""}>
          <span>CP手牌を表にする</span>
        </label>
        <label class="settingsCheck">
          <input type="checkbox" id="settingsUkeireVisible"${ukeireVisible ? " checked" : ""}>
          <span>受け入れ表示を出す</span>
        </label>
      </div>
      ${isVerifyMode ? `
        <div class="settingsModeSummary" style="margin-top:12px;">
          <div style="font-weight:800;">速度モード</div>
          <div class="settingsSegment" role="group" aria-label="検証モードの速度" style="margin-top:8px;">
            <button type="button" class="settingsSegmentBtn${verifyFastMode === "off" ? " isActive" : ""}" data-verify-fast-mode="off">OFF</button>
            <button type="button" class="settingsSegmentBtn${verifyFastMode === "fast" ? " isActive" : ""}" data-verify-fast-mode="fast">高速</button>
            <button type="button" class="settingsSegmentBtn${verifyFastMode === "ultra" ? " isActive" : ""}" data-verify-fast-mode="ultra">超高速</button>
          </div>
          <div class="settingsModeSummaryItem">
            <span class="settingsModeSummaryLabel">対象</span>
            <span class="settingsModeSummaryValue">検証モードのみ</span>
          </div>
          <div class="settingsModeSummaryItem">
            <span class="settingsModeSummaryLabel">現在</span>
            <span class="settingsModeSummaryValue">${verifySpeedSummary}</span>
          </div>
          <div class="settingsModeSummaryItem">
            <span class="settingsModeSummaryLabel">内容</span>
            <span class="settingsModeSummaryValue">打牌間隔・演出待ち・半荘切替を短縮</span>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function buildPlayerSettingsPaneHtml(){
  return buildPlayerSettingsSectionHtml();
}

function buildCpuSettingsPaneHtml(){
  return `
    <div class="settingsSection">
      <div class="settingsSectionTitle">CP設定</div>
      <div class="settingsSeats">
        ${buildGameSettingsSeatSectionHtml(1)}
        ${buildGameSettingsSeatSectionHtml(2)}
      </div>
    </div>
  `;
}

function buildSettingsTabPanelsHtml(){
  const activeTab = getActiveSettingsTab();
  const panes = [
    { key: "display", html: buildDisplaySettingsPaneHtml() },
    { key: "player", html: buildPlayerSettingsPaneHtml() },
    { key: "cpu", html: buildCpuSettingsPaneHtml() }
  ];

  return `
    <div id="settingsTabPanels">
      ${panes.map((pane)=> `
        <section class="settingsTabPane${activeTab === pane.key ? " isActive" : ""}" data-settings-pane="${pane.key}" role="tabpanel" aria-hidden="${activeTab === pane.key ? "false" : "true"}">
          <div class="settingsPaneInner">
            ${pane.html}
          </div>
        </section>
      `).join("")}
    </div>
  `;
}

function escapeSettingsHtml(value){
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSettingsOptionTags(list, selectedKey){
  const items = Array.isArray(list) ? list : [];
  return items.map((item)=>{
    const key = escapeSettingsHtml(item && item.key ? item.key : "");
    const label = escapeSettingsHtml(item && item.label ? item.label : key);
    const selected = (item && item.key === selectedKey) ? ' selected' : '';
    return `<option value="${key}"${selected}>${label}</option>`;
  }).join("");
}

function getCpuEngineModeLabelJa(key){
  if (key === "external") return "外部AI";
  if (key === "internal") return "内部AI";
  if (key === "legacy") return "旧ロジック";
  return key || "";
}

function getCpuOpenProfileLabelJa(key, fallback = ""){
  if (key === "safe") return "守備重視";
  if (key === "menzen") return "面前重視";
  if (key === "balanced") return "バランス";
  if (key === "speedy") return "速度重視";
  if (key === "value") return "打点重視";
  if (key === "aggressive") return "前のめり";
  return fallback || key || "";
}

function getCpuDiscardStyleLabelJa(key, fallback = ""){
  if (key === "balanced") return "バランス";
  if (key === "defensive") return "守備重視";
  if (key === "speedy") return "速度重視";
  if (key === "menzen") return "面前重視";
  if (key === "value") return "打点重視";
  if (key === "aggressive") return "前のめり";
  return fallback || key || "";
}

function getCpuOpenModeOptions(){
  const lib = (typeof CPU_OPEN_ENGINE_MODE_LIBRARY === "object" && CPU_OPEN_ENGINE_MODE_LIBRARY) ? CPU_OPEN_ENGINE_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuEngineModeLabelJa(key) }));
}

function getCpuOpenProfileOptions(){
  const lib = (typeof getCpuOpenProfileLibrary === "function") ? getCpuOpenProfileLibrary() : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuOpenProfileLabelJa(key, lib[key] && lib[key].label ? lib[key].label : key) }));
}

function getCpuDiscardModeOptions(){
  const lib = (typeof CPU_DISCARD_ENGINE_MODE_LIBRARY === "object" && CPU_DISCARD_ENGINE_MODE_LIBRARY) ? CPU_DISCARD_ENGINE_MODE_LIBRARY : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuEngineModeLabelJa(key) }));
}

function getCpuDiscardStyleOptions(){
  const lib = (typeof getCpuDiscardExternalStyleLibrary === "function") ? getCpuDiscardExternalStyleLibrary() : {};
  return Object.keys(lib).map((key)=> ({ key, label: getCpuDiscardStyleLabelJa(key, lib[key] && lib[key].label ? lib[key].label : key) }));
}

function getCpuOpenSeatModeSafe(seatIndex){
  if (typeof getCpuOpenSeatEngineMode === "function"){
    return getCpuOpenSeatEngineMode(seatIndex);
  }
  return "internal";
}

function getCpuOpenSeatProfileKeySafe(seatIndex){
  if (typeof getCpuOpenSeatProfileKey === "function"){
    return getCpuOpenSeatProfileKey(seatIndex);
  }
  return "balanced";
}

function getCpuDiscardSeatModeSafe(seatIndex){
  if (typeof getCpuDiscardSeatEngineMode === "function"){
    return getCpuDiscardSeatEngineMode(seatIndex);
  }
  return "internal";
}

function getCpuDiscardSeatStyleKeySafe(seatIndex){
  if (typeof getCpuDiscardSeatExternalStyleKey === "function"){
    return getCpuDiscardSeatExternalStyleKey(seatIndex);
  }
  return "balanced";
}

function buildGameSettingsSeatSectionHtml(seatIndex){
  const seatLabel = getGameSettingSeatLabel(seatIndex);
  const openMode = getCpuOpenSeatModeSafe(seatIndex);
  const openProfileKey = getCpuOpenSeatProfileKeySafe(seatIndex);
  const discardMode = getCpuDiscardSeatModeSafe(seatIndex);
  const discardStyleKey = getCpuDiscardSeatStyleKeySafe(seatIndex);

  const openProfileDisabled = openMode !== "internal" ? " disabled" : "";
  const discardStyleDisabled = discardMode === "legacy" ? " disabled" : "";

  return `
    <div class="settingsSeatCard">
      <div class="settingsSeatTitle">${escapeSettingsHtml(seatLabel)}</div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-open-engine-${seatIndex}">副露AI</label>
        <select class="settingsSelect" id="settings-open-engine-${seatIndex}" data-kind="open-engine" data-seat="${seatIndex}">
          ${buildSettingsOptionTags(getCpuOpenModeOptions(), openMode)}
        </select>
        <div class="settingsHint">内部AI・外部AI・旧ロジックを切り替えます。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-open-profile-${seatIndex}">副露スタイル</label>
        <select class="settingsSelect" id="settings-open-profile-${seatIndex}" data-kind="open-profile" data-seat="${seatIndex}"${openProfileDisabled}>
          ${buildSettingsOptionTags(getCpuOpenProfileOptions(), openProfileKey)}
        </select>
        <div class="settingsHint">副露AIが内部AIのときに使います。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-discard-engine-${seatIndex}">打牌AI</label>
        <select class="settingsSelect" id="settings-discard-engine-${seatIndex}" data-kind="discard-engine" data-seat="${seatIndex}">
          ${buildSettingsOptionTags(getCpuDiscardModeOptions(), discardMode)}
        </select>
        <div class="settingsHint">外部AI・内部AI・旧ロジックを切り替えます。</div>
      </div>

      <div class="settingsField">
        <label class="settingsLabel" for="settings-discard-style-${seatIndex}">打牌スタイル</label>
        <select class="settingsSelect" id="settings-discard-style-${seatIndex}" data-kind="discard-style" data-seat="${seatIndex}"${discardStyleDisabled}>
          ${buildSettingsOptionTags(getCpuDiscardStyleOptions(), discardStyleKey)}
        </select>
        <div class="settingsHint">打牌AIが旧ロジック以外のときに使います。</div>
      </div>
    </div>
  `;
}

function renderGameSettingsPanel(){
  const body = getSettingsBodyEl();
  if (!body) return;

  body.innerHTML = `
    ${buildSettingsTabsHtml()}
    ${buildSettingsTabPanelsHtml()}
  `;

  const tabButtons = body.querySelectorAll("button[data-settings-tab]");
  tabButtons.forEach((buttonEl)=>{
    buttonEl.addEventListener("click", ()=>{
      const nextTab = String(buttonEl.dataset.settingsTab || "display");
      setActiveSettingsTab(nextTab);
      renderGameSettingsPanel();
    });
  });

  const cpuHandOpenInput = document.getElementById("settingsCpuHandOpen");
  if (cpuHandOpenInput){
    cpuHandOpenInput.addEventListener("change", ()=>{
      if (typeof setCpuHandOpen === "function"){
        setCpuHandOpen(!!cpuHandOpenInput.checked);
      } else {
        isCpuHandOpen = !!cpuHandOpenInput.checked;
      }
      syncQuickSettingButtons();
      saveGameSettingsToStorage();
      if (typeof render === "function") render();
    });
  }

  const ukeireVisibleInput = document.getElementById("settingsUkeireVisible");
  if (ukeireVisibleInput){
    ukeireVisibleInput.addEventListener("change", ()=>{
      isUkeireVisible = !!ukeireVisibleInput.checked;
      syncQuickSettingButtons();
      saveGameSettingsToStorage();
      if (typeof render === "function") render();
    });
  }

  const verifyFastModeButtons = body.querySelectorAll("button[data-verify-fast-mode]");
  verifyFastModeButtons.forEach((buttonEl)=>{
    buttonEl.addEventListener("click", ()=>{
      setVerifyFastModeLevel(buttonEl.dataset.verifyFastMode || "off");
      saveGameSettingsToStorage();
      if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      renderGameSettingsPanel();
    });
  });

  const playerModeButtons = body.querySelectorAll("button[data-player-mode]");
  playerModeButtons.forEach((buttonEl)=>{
    buttonEl.addEventListener("click", ()=>{
      const value = String(buttonEl.dataset.playerMode || "manual");

      setPlayerUnifiedControlMode(value);
      saveGameSettingsToStorage();
      notifyPlayerControlModeChanged();

      if (typeof schedulePlayerAutoDiscardIfNeeded === "function") schedulePlayerAutoDiscardIfNeeded(true);
      if (typeof maybeSchedulePlayerOpenAiChoice === "function") maybeSchedulePlayerOpenAiChoice(true);
      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      if (typeof render === "function") render();

      renderGameSettingsPanel();
    });
  });

  const selects = body.querySelectorAll("select[data-kind][data-seat]");
  selects.forEach((selectEl)=>{
    selectEl.addEventListener("change", ()=>{
      const kind = String(selectEl.dataset.kind || "");
      const seatIndex = Number(selectEl.dataset.seat);
      const value = String(selectEl.value || "");

      if (kind === "open-engine"){
        if (typeof setCpuOpenSeatEngineMode === "function"){
          setCpuOpenSeatEngineMode(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "open-profile"){
        if (typeof setCpuOpenSeatProfile === "function"){
          setCpuOpenSeatProfile(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "discard-engine"){
        if (typeof setCpuDiscardSeatEngineMode === "function"){
          setCpuDiscardSeatEngineMode(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
        return;
      }

      if (kind === "discard-style"){
        if (typeof setCpuDiscardSeatExternalStyle === "function"){
          setCpuDiscardSeatExternalStyle(seatIndex, value);
        }
        saveGameSettingsToStorage();
        renderGameSettingsPanel();
      }
    });
  });
}

function openSettingsOverlay(){
  const overlay = getSettingsOverlayEl();
  const closeBtn = getSettingsCloseBtnEl();
  if (!overlay) return;

  renderGameSettingsPanel();
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  setTimeout(()=>{
    try{
      if (closeBtn && typeof closeBtn.focus === "function") closeBtn.focus();
    }catch(e){}
  }, 0);
}

function closeSettingsOverlay(){
  const overlay = getSettingsOverlayEl();
  const openBtn = getSettingsBtnEl();
  if (!overlay) return;

  try{
    if (document && document.activeElement && typeof document.activeElement.blur === "function"){
      document.activeElement.blur();
    }
  }catch(e){}

  overlay.style.display = "none";
  overlay.setAttribute("aria-hidden", "true");

  setTimeout(()=>{
    try{
      if (openBtn && typeof openBtn.focus === "function") openBtn.focus();
    }catch(e){}
  }, 0);
}

function collectGameSettingsForStorage(){
  const seats = {};
  [1, 2].forEach((seatIndex)=>{
    seats[seatIndex] = {
      openEngineMode: (typeof getCpuOpenSeatEngineMode === "function") ? getCpuOpenSeatEngineMode(seatIndex) : "internal",
      openProfileKey: (typeof getCpuOpenSeatProfileKey === "function") ? getCpuOpenSeatProfileKey(seatIndex) : "balanced",
      discardEngineMode: (typeof getCpuDiscardSeatEngineMode === "function") ? getCpuDiscardSeatEngineMode(seatIndex) : "internal",
      discardStyleKey: (typeof getCpuDiscardSeatExternalStyleKey === "function") ? getCpuDiscardSeatExternalStyleKey(seatIndex) : "balanced"
    };
  });

  return {
    cpuHandOpen: (typeof isCpuHandOpen !== "undefined") ? !!isCpuHandOpen : false,
    ukeireVisible: !!isUkeireVisible,
    verifyFastMode: getVerifyFastModeLevel(),
    cpuStrengthPresetKey: getCpuStrengthPresetKey(),
    cpuVerifyTuning: getCpuVerifyTuning(),
    seats,
    player: {
      discardControlMode: getPlayerDiscardControlMode(),
      openControlMode: getPlayerOpenControlMode(),
      specialControlMode: getPlayerSpecialControlMode()
    }
  };
}

function sanitizePersistedGameSettings(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const next = {
    ...src,
    seats: (src.seats && typeof src.seats === "object") ? { ...src.seats } : {},
    cpuVerifyTuning: cloneCpuVerifyTuning(src.cpuVerifyTuning),
    player: (src.player && typeof src.player === "object") ? { ...src.player } : {}
  };

  let changed = false;

  if (typeof next.cpuHandOpen !== "undefined"){
    next.cpuHandOpen = !!next.cpuHandOpen;
  }

  if (typeof next.cpuStrengthPresetKey !== "undefined"){
    next.cpuStrengthPresetKey = normalizeCpuStrengthPresetKey(next.cpuStrengthPresetKey);
  }

  [1, 2].forEach((seatIndex)=>{
    const seat = next.seats[String(seatIndex)] || next.seats[seatIndex];
    if (!seat || typeof seat !== "object"){
      next.seats[seatIndex] = {};
      return;
    }
    next.seats[seatIndex] = {
      openEngineMode: seat.openEngineMode != null ? String(seat.openEngineMode) : undefined,
      openProfileKey: seat.openProfileKey != null ? String(seat.openProfileKey) : undefined,
      discardEngineMode: seat.discardEngineMode != null ? String(seat.discardEngineMode) : undefined,
      discardStyleKey: seat.discardStyleKey != null ? String(seat.discardStyleKey) : undefined
    };
  });

  return { settings: next, changed };
}

function readVerifySettingsPageStateForGame(){
  const tryParse = (storage, key)=>{
    try{
      if (!storage || !key) return null;
      const raw = storage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object") ? parsed : null;
    }catch(e){
      return null;
    }
  };

  const local = (typeof localStorage !== "undefined") ? localStorage : null;
  const session = (typeof sessionStorage !== "undefined") ? sessionStorage : null;

  return tryParse(local, "mbsanma_settings_values_v1")
    || tryParse(local, "mbsanma_settings_ui_persist_v1")
    || tryParse(session, "mbsanma_settings_ui_v1")
    || null;
}

function getVerifyCpuOpenSettingFromSettingsPage(){
  const state = readVerifySettingsPageStateForGame();
  if (!state) return null;

  const value = String(state["verify-cpu-open"] || "").toLowerCase();
  if (value === "open") return true;
  if (value === "close") return false;
  return null;
}

function getVerifyFastModeLevelFromSettingsPage(){
  const state = readVerifySettingsPageStateForGame();
  if (!state) return null;

  if (typeof state["verify-fast-mode"] === "undefined" || state["verify-fast-mode"] == null || state["verify-fast-mode"] === ""){
    return null;
  }
  const value = normalizeVerifyFastModeLevel(state["verify-fast-mode"]);
  return value || null;
}

function saveGameSettingsToStorage(){
  try{
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(collectGameSettingsForStorage()));
    return true;
  }catch(e){
    return false;
  }
}

function applyGameSettingsFromObject(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const seats = (src.seats && typeof src.seats === "object") ? src.seats : {};
  const player = (src.player && typeof src.player === "object") ? src.player : {};

  try{
    const cpuHandOpenValue = (typeof src.cpuHandOpen !== "undefined")
      ? !!src.cpuHandOpen
      : getVerifyCpuOpenSettingFromSettingsPage();

    if (cpuHandOpenValue != null){
      if (typeof setCpuHandOpen === "function"){
        setCpuHandOpen(!!cpuHandOpenValue);
      } else {
        isCpuHandOpen = !!cpuHandOpenValue;
      }
    }
  }catch(e){}

  try{
    if (typeof src.ukeireVisible !== "undefined"){
      isUkeireVisible = !!src.ukeireVisible;
    }
  }catch(e){}

  try{
    const verifyFastModeValue = getVerifyFastModeLevelFromSettingsPage();
    if (verifyFastModeValue != null){
      setVerifyFastModeLevel(verifyFastModeValue);
    } else if (typeof src.verifyFastModeLevel !== "undefined"){
      setVerifyFastModeLevel(src.verifyFastModeLevel);
    } else if (typeof src.verifyFastMode !== "undefined"){
      setVerifyFastModeLevel(src.verifyFastMode);
    } else {
      setVerifyFastModeLevel("off");
    }
  }catch(e){}

  try{
    if (player.discardControlMode != null){
      setPlayerDiscardControlMode(player.discardControlMode);
    }
  }catch(e){}

  try{
    if (player.openControlMode != null){
      setPlayerOpenControlMode(player.openControlMode);
    }
  }catch(e){}

  try{
    if (player.specialControlMode != null){
      setPlayerSpecialControlMode(player.specialControlMode);
    }
  }catch(e){}

  try{
    if (typeof src.cpuStrengthPresetKey !== "undefined"){
      setCpuStrengthPreset(src.cpuStrengthPresetKey);
    }
  }catch(e){}

  try{
    setCpuVerifyTuning(src.cpuVerifyTuning);
  }catch(e){}

  [1, 2].forEach((seatIndex)=>{
    const seat = seats[String(seatIndex)] || seats[seatIndex] || {};
    try{
      if (seat.openEngineMode != null && typeof setCpuOpenSeatEngineMode === "function"){
        setCpuOpenSeatEngineMode(seatIndex, seat.openEngineMode);
      }
    }catch(e){}
    try{
      if (seat.openProfileKey != null && typeof setCpuOpenSeatProfile === "function"){
        setCpuOpenSeatProfile(seatIndex, seat.openProfileKey);
      }
    }catch(e){}
    try{
      if (seat.discardEngineMode != null && typeof setCpuDiscardSeatEngineMode === "function"){
        setCpuDiscardSeatEngineMode(seatIndex, seat.discardEngineMode);
      }
    }catch(e){}
    try{
      if (seat.discardStyleKey != null && typeof setCpuDiscardSeatExternalStyle === "function"){
        setCpuDiscardSeatExternalStyle(seatIndex, seat.discardStyleKey);
      }
    }catch(e){}
  });

  syncQuickSettingButtons();
}

function loadGameSettingsFromStorage(){
  try{
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(GAME_SETTINGS_STORAGE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    const sanitized = sanitizePersistedGameSettings(parsed);

    applyGameSettingsFromObject(sanitized.settings);

    if (sanitized.changed){
      try{
        localStorage.setItem(GAME_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized.settings));
      }catch(e){}
    }

    return true;
  }catch(e){
    return false;
  }
}

function installNoZoomTouchGuards(overlayEl, panelEl){
  const targets = [overlayEl, panelEl].filter(Boolean);
  if (targets.length <= 0) return;

  const addIfNeeded = (el, type, handler, options)=>{
    if (!el) return;
    const key = `__noZoomGuard_${type}`;
    if (el[key]) return;
    el.addEventListener(type, handler, options);
    el[key] = true;
  };

  const preventMultiTouch = (ev)=>{
    if (!ev) return;
    const touches = ev.touches || ev.targetTouches;
    if (touches && touches.length > 1){
      if (typeof ev.preventDefault === "function") ev.preventDefault();
    }
  };

  const preventGesture = (ev)=>{
    if (!ev) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  };

  const preventCtrlWheel = (ev)=>{
    if (!ev || !ev.ctrlKey) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  };

  for (const el of targets){
    try{
      if (el && el.style){
        el.style.touchAction = "pan-x pan-y";
        el.style.webkitTouchCallout = "none";
        el.style.webkitUserSelect = "none";
      }
    }catch(e){}

    addIfNeeded(el, "gesturestart", preventGesture, { passive: false });
    addIfNeeded(el, "gesturechange", preventGesture, { passive: false });
    addIfNeeded(el, "gestureend", preventGesture, { passive: false });
    addIfNeeded(el, "touchmove", preventMultiTouch, { passive: false });
    addIfNeeded(el, "wheel", preventCtrlWheel, { passive: false });
    addIfNeeded(el, "dblclick", preventGesture, { passive: false });
  }
}

function bindSettingsOverlayEvents(){
  const overlay = getSettingsOverlayEl();
  const closeBtn = getSettingsCloseBtnEl();
  const openBtn = getSettingsBtnEl();
  const panel = document.getElementById("settingsPanel");

  if (openBtn){
    openBtn.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      openSettingsOverlay();
    });
  }

  if (closeBtn){
    closeBtn.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      closeSettingsOverlay();
    });
  }

  if (overlay){
    overlay.addEventListener("click", (ev)=>{
      if (ev && ev.target === overlay){
        closeSettingsOverlay();
      }
    });
  }

  if (panel){
    panel.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
    });
  }

  installNoZoomTouchGuards(overlay, panel);

  document.addEventListener("keydown", (ev)=>{
    if (!isSettingsOverlayVisible()) return;
    if (!ev || ev.key !== "Escape") return;
    closeSettingsOverlay();
  });

  renderGameSettingsPanel();
}

// ================================
// ★ イベント紐付け
// ================================
function isPlayerActionTurnForButtons(){
  if (isEnded) return false;

  let selfTurn = false;
  try{
    if (typeof isPlayerTurn === "function") {
      selfTurn = !!isPlayerTurn();
    } else if (typeof currentTurnSeatIndex !== "undefined") {
      selfTurn = (currentTurnSeatIndex === 0);
    }
  }catch(e){
    selfTurn = false;
  }

  if (!selfTurn) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;

  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  return true;
}

function canChooseMinkanFromButton(){
  if (isEnded) return false;

  let selfTurn = false;
  try{
    if (typeof isPlayerTurn === "function") {
      selfTurn = !!isPlayerTurn();
    } else if (typeof currentTurnSeatIndex !== "undefined") {
      selfTurn = (currentTurnSeatIndex === 0);
    }
  }catch(e){
    selfTurn = false;
  }

  if (selfTurn) return false;
  return !!(typeof pendingCall !== "undefined" && pendingCall);
}

function bindEvents(){
  if (newBtn){
    newBtn.addEventListener("click", ()=>{
      startNewHanchan();
    });
  }




  if (typeof cpuOpenToggleBtn !== "undefined" && cpuOpenToggleBtn){
    cpuOpenToggleBtn.addEventListener("click", ()=>{
      if (typeof toggleCpuHandOpen === "function"){
        toggleCpuHandOpen();
      } else {
        isCpuHandOpen = !isCpuHandOpen;
      }

      syncQuickSettingButtons();
      saveGameSettingsToStorage();

      if (isSettingsOverlayVisible()){
        renderGameSettingsPanel();
      }

      render();
    });

    syncQuickSettingButtons();
  }

  if (resetBtn){
    resetBtn.addEventListener("click", ()=>{
      doReset();
    });
  }

  if (ukeireToggleBtn){
    ukeireToggleBtn.addEventListener("click", ()=>{
      isUkeireVisible = !isUkeireVisible;
      syncQuickSettingButtons();
      saveGameSettingsToStorage();

      if (isSettingsOverlayVisible()){
        renderGameSettingsPanel();
      }

      render();
    });
  }

  bindSettingsOverlayEvents();

  if (peiBtn){
    peiBtn.addEventListener("click", ()=>{
      if (!isPlayerActionTurnForButtons()) return;
      if (typeof doPei === "function") doPei();
    });
  }

  if (ponBtn){
    ponBtn.addEventListener("click", ()=>{
      if (!canUsePonButtonNow()) return;
      if (typeof choosePon === "function") choosePon(true);
    });
  }

  if (passBtn){
    passBtn.addEventListener("click", ()=>{
      if (!canUsePassButtonNow()) return;

      if (typeof pendingCall !== "undefined" && pendingCall){
        if (typeof choosePass === "function") choosePass();
        return;
      }

      if (canUseRiichiTsumoSkipButtonNow()){
        if (typeof discardDrawn === "function") discardDrawn(true);
      }
    });
  }

  if (kanBtn){
    kanBtn.addEventListener("click", ()=>{
      if (isPlayerActionTurnForButtons()){
        if (typeof doKan === "function") doKan();
        return;
      }

      if (!canChooseMinkanFromButton()) return;
      if (typeof chooseMinkan === "function") chooseMinkan(true);
    });
  }

  if (riichiBtn){
    riichiBtn.addEventListener("click", ()=>{
      if (!isPlayerActionTurnForButtons()) return;
      if (typeof doRiichi === "function") doRiichi();
    });
  }

  if (ronBtn){
    ronBtn.addEventListener("click", ()=>{
      if (!canUseRonButtonNow()) return;
      if (typeof chooseRon === "function") chooseRon(true);
    });
  }

  if (tsumoBtn){
    tsumoBtn.addEventListener("click", ()=>{
      if (!canUseTsumoButtonNow()) return;
      if (typeof openTsumo === "function"){
        setPostAgariStageToOverlay();
        openTsumo();
      }
    });
  }

  // オーバーレイ：ツモ（クリックで卓確認画面へ）
  if (tsumoOverlay){
    tsumoOverlay.addEventListener("click", (ev)=>{
      // 卓クリックにバブルして即進行しないように止める
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeTsumo === "function") closeTsumo(); });
    }, true);
  }

  // オーバーレイ：ロン（クリックで卓確認画面へ）
  if (ronOverlay){
    ronOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeRon === "function") closeRon(); });
    }, true);
  }

  // オーバーレイ：流し（クリックで卓確認画面へ）
  if (nagashiOverlay){
    nagashiOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeNagashi === "function") closeNagashi(); });
    }, true);
  }

  // オーバーレイ：流局（今は従来どおり卓確認へ）
  if (ryukyokuOverlay){
    ryukyokuOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      onAgariOverlayCloseToTable(()=>{ if (typeof closeRyukyoku === "function") closeRyukyoku(); });
    }, true);
  }

  // 結果確認画面（後から追加する新オーバーレイ）
  if (typeof resultOverlay !== "undefined" && resultOverlay){
    resultOverlay.addEventListener("click", (ev)=>{
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      if (__postAgariStage !== "result") return;
      movePostAgariFlowFromResultToNext();
    }, true);
  }

  // 卓クリックで進行
  bindTableClickFlowAfterAgari();
}



function cloneTopMenuButtonForAppExtraControls(srcBtn){
  if (!srcBtn) return null;
  try{
    return srcBtn.cloneNode(true);
  }catch(e){
    return null;
  }
}

function isAppPlayPageForExtraControls(){
  try{
    // play_app.html 側で専用6ボタン（appRuleBtn / appStatsBtn / appLogBtn）を
    // 直置きしたあとは、旧パッチの後付け追加を止める。
    if (
      document.getElementById("appRuleBtn") ||
      document.getElementById("appStatsBtn") ||
      document.getElementById("appLogBtn")
    ){
      return false;
    }

    return !!document.getElementById("activeAccountBadge")
      && !!document.getElementById("debugOpenBtn")
      && !!document.getElementById("settingsBtn")
      && !!document.querySelector(".boardTopMainControls");
  }catch(e){
    return false;
  }
}

function tryOpenInternalDebugOverlayFromAppExtraButton(){
  const openerCandidates = [
    (typeof openDebugOverlay === "function") ? openDebugOverlay : null,
    (typeof toggleDebugOverlay === "function") ? ()=>toggleDebugOverlay(true) : null,
    (typeof showDebugOverlay === "function") ? showDebugOverlay : null,
    (typeof openScenarioDebugOverlay === "function") ? openScenarioDebugOverlay : null
  ].filter(Boolean);

  for (const fn of openerCandidates){
    try{
      fn();
      return true;
    }catch(e){}
  }

  const overlayIds = [
    "debugOverlay",
    "scenarioDebugOverlay",
    "debugScenarioOverlay",
    "debugPanelOverlay"
  ];

  for (const id of overlayIds){
    try{
      const el = document.getElementById(id);
      if (!el) continue;
      el.style.display = "flex";
      el.setAttribute("aria-hidden", "false");
      return true;
    }catch(e){}
  }

  return false;
}

function appendAppExtraTopButton(container, sourceBtn, buttonId, label, onClick){
  if (!container || !sourceBtn || !buttonId) return null;

  const existing = document.getElementById(buttonId);
  if (existing) return existing;

  const nextBtn = cloneTopMenuButtonForAppExtraControls(sourceBtn);
  if (!nextBtn) return null;

  nextBtn.id = buttonId;
  nextBtn.textContent = label || sourceBtn.textContent || "";
  nextBtn.dataset.appExtraControl = "1";

  try{
    nextBtn.addEventListener("click", (ev)=>{
      try{
        if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
        if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      }catch(e){}
      if (typeof onClick === "function") onClick(ev);
    });
  }catch(e){}

  try{
    container.appendChild(nextBtn);
  }catch(e){
    return null;
  }

  return nextBtn;
}

function installAppModeExtraTopButtons(){
  if (!isAppPlayPageForExtraControls()) return;

  const container = document.querySelector(".boardTopMainControls");
  const ruleBtn = document.getElementById("debugOpenBtn");
  const statsBtn = document.getElementById("settingsBtn");
  if (!container || !ruleBtn || !statsBtn) return;

  appendAppExtraTopButton(container, ruleBtn, "appDebugOverlayBtn", "デバッグ", ()=>{
    const opened = tryOpenInternalDebugOverlayFromAppExtraButton();
    if (!opened){
      try{ console.warn("debug.js の公開オープナーが見つからないため、デバッグを開けませんでした。"); }catch(e){}
    }
  });

  appendAppExtraTopButton(container, statsBtn, "appSettingsOverlayBtn", "設定", ()=>{
    if (typeof openSettingsOverlay === "function") openSettingsOverlay();
  });
}

function scheduleInstallAppModeExtraTopButtons(){
  try{
    if (typeof window === "undefined") return;
    window.addEventListener("load", ()=>{
      setTimeout(()=>{
        installAppModeExtraTopButtons();
      }, 0);
    }, { once: true });
  }catch(e){}
}

// ================================
// ★ 起動
// ================================
(function boot(){
  try{
    installRyukyokuOverlayStagePatch();
    applyNonPersistentCpuDefaultsOnReload();
    const loadedGameSettings = loadGameSettingsFromStorage();
    if (!loadedGameSettings){
      const cpuHandOpenFromSettingsPage = getVerifyCpuOpenSettingFromSettingsPage();
      if (cpuHandOpenFromSettingsPage != null){
        if (typeof setCpuHandOpen === "function"){
          setCpuHandOpen(!!cpuHandOpenFromSettingsPage);
        } else {
          isCpuHandOpen = !!cpuHandOpenFromSettingsPage;
        }
      }
    }
    applyAppRuntimeLaunchDefaultToPlayerControls();
    bindEvents();
    scheduleInstallAppModeExtraTopButtons();
    syncQuickSettingButtons();
    startNewHanchan();
  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "boot()");
  }
})();
