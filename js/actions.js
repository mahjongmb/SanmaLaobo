// MBsanma/js/actions.js
// ========= actions.js（アクション共通処理） =========

// ================================
// ★ アガリオーバーレイ位置クラス制御
// - 0 = 自分     -> winner-self
// - 1 = 右CPU    -> winner-right
// - 2 = 左CPU    -> winner-left
// ================================
function clearAgariWinnerClasses(overlayEl){
  if (!overlayEl) return;
  overlayEl.classList.remove("winner-self", "winner-left", "winner-right");
}

function getAgariWinnerClassBySeatIndex(seatIndex){
  if (seatIndex === 0) return "winner-self";
  if (seatIndex === 1) return "winner-right";
  if (seatIndex === 2) return "winner-left";
  return "winner-self";
}

function applyAgariWinnerClass(overlayEl, seatIndex){
  if (!overlayEl) return;
  clearAgariWinnerClasses(overlayEl);
  overlayEl.classList.add(getAgariWinnerClassBySeatIndex(seatIndex));
}

function getExtraRonOverlayClassName(){
  return "extraRonOverlay";
}

function removeExtraRonOverlays(){
  const list = Array.from(document.querySelectorAll("." + getExtraRonOverlayClassName()));
  for (const el of list){
    try{ el.remove(); }catch(e){}
  }
}

function getCurrentRonOverlayWinnerSeatIndexes(){
  try{
    if (typeof window !== "undefined" && typeof window.getRonWinnerSeatIndexesFromQueue === "function"){
      const seats = window.getRonWinnerSeatIndexesFromQueue();
      if (Array.isArray(seats) && seats.length > 0) return seats.slice();
    }
  }catch(e){}

  if (typeof lastAgariWinnerSeatIndex === "number") return [lastAgariWinnerSeatIndex];
  return [0];
}

function makeExtraRonOverlayForSeat(seatIndex){
  if (!ronOverlay) return null;
  const clone = ronOverlay.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.add(getExtraRonOverlayClassName());
  clone.style.pointerEvents = "none";
  clone.style.display = "flex";

  const hint = clone.querySelector(".hint");
  if (hint) hint.style.display = "none";

  applyAgariWinnerClass(clone, seatIndex);
  return clone;
}

function syncRonOverlaysForWinnerSeats(seatIndexes){
  removeExtraRonOverlays();
  if (!ronOverlay) return;

  const list = Array.isArray(seatIndexes) ? seatIndexes.slice() : [];
  if (list.length <= 0) return;

  applyAgariWinnerClass(ronOverlay, list[0]);

  for (let i = 1; i < list.length; i++){
    const clone = makeExtraRonOverlayForSeat(list[i]);
    if (clone) document.body.appendChild(clone);
  }
}

// ツモオーバーレイ
function openTsumo(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("agari_tsumo", {
        winnerSeatIndex: (typeof lastAgariWinnerSeatIndex === "number") ? lastAgariWinnerSeatIndex : 0,
        winType: "tsumo"
      });
    }
  }catch(e){}

  // ★ 手動ツモでも「局終了」にしておく（卓に戻った後のクリックで次局へ進めるため）
  if (typeof isEnded !== "undefined" && !isEnded){
    isEnded = true;
  }

  // ★ 勝者情報を記録
  // - 自分ツモ時は seatIndex=0 をここで確定
  // - CPUツモ時は core2.js 側で事前に設定してから openTsumo() を呼ぶ
  try{
    if (typeof lastAgariWinnerSeatIndex !== "number"){
      lastAgariWinnerSeatIndex = 0;
    }
    lastAgariDiscarderSeatIndex = null;
    lastAgariType = "tsumo";
  }catch(e){}

  // ★ 勝者位置クラスを付与
  try{
    const seatIndex = (typeof lastAgariWinnerSeatIndex === "number")
      ? lastAgariWinnerSeatIndex
      : 0;
    applyAgariWinnerClass(tsumoOverlay, seatIndex);
  }catch(e){}

  // ★ アガリは「確認→次局」の2段階
  agariOverlayStep = 1;
  tsumoOverlay.style.display = "flex";
}

function closeTsumo(){
  clearAgariWinnerClasses(tsumoOverlay);
  tsumoOverlay.style.display = "none";
}


function getExtraNagashiOverlayClassName(){
  return "extraNagashiOverlay";
}

function removeExtraNagashiOverlays(){
  const list = Array.from(document.querySelectorAll("." + getExtraNagashiOverlayClassName()));
  for (const el of list){
    try{ el.remove(); }catch(e){}
  }
}

function getCurrentNagashiOverlayWinnerSeatIndexes(){
  try{
    if (typeof window !== "undefined" && typeof window.getCurrentNagashiResultEntry === "function"){
      const entry = window.getCurrentNagashiResultEntry();
      if (entry && (entry.winnerSeatIndex === 0 || entry.winnerSeatIndex === 1 || entry.winnerSeatIndex === 2)){
        return [entry.winnerSeatIndex];
      }
    }
  }catch(e){}

  if (Array.isArray(lastNagashiWinnerSeatIndexes) && lastNagashiWinnerSeatIndexes.length > 0){
    return lastNagashiWinnerSeatIndexes.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
  }

  if (typeof lastAgariWinnerSeatIndex === "number") return [lastAgariWinnerSeatIndex];
  return [0];
}

function makeExtraNagashiOverlayForSeat(seatIndex){
  if (!nagashiOverlay) return null;
  const clone = nagashiOverlay.cloneNode(true);
  clone.removeAttribute("id");
  clone.classList.add(getExtraNagashiOverlayClassName());
  clone.style.pointerEvents = "none";
  clone.style.display = "flex";
  applyAgariWinnerClass(clone, seatIndex);
  return clone;
}

function syncNagashiOverlaysForWinnerSeats(seatIndexes){
  removeExtraNagashiOverlays();
  if (!nagashiOverlay) return;

  const list = Array.isArray(seatIndexes) ? seatIndexes.slice() : [];
  if (list.length <= 0) return;

  applyAgariWinnerClass(nagashiOverlay, list[0]);

  for (let i = 1; i < list.length; i++){
    const clone = makeExtraNagashiOverlayForSeat(list[i]);
    if (clone) document.body.appendChild(clone);
  }
}

function openNagashi(){
  try{
    if (typeof isEnded !== "undefined" && !isEnded){
      isEnded = true;
    }
  }catch(e){}

  try{
    lastAgariType = "nagashi";
  }catch(e){}

  try{
    const seatIndexes = getCurrentNagashiOverlayWinnerSeatIndexes();
    syncNagashiOverlaysForWinnerSeats(seatIndexes);
  }catch(e){}

  agariOverlayStep = 1;
  if (nagashiOverlay){
    nagashiOverlay.style.display = "flex";
  }
}

function closeNagashi(){
  removeExtraNagashiOverlays();
  clearAgariWinnerClasses(nagashiOverlay);
  if (nagashiOverlay){
    nagashiOverlay.style.display = "none";
  }
}

function openRon(){
  try{
    const seatIndexes = getCurrentRonOverlayWinnerSeatIndexes();
    syncRonOverlaysForWinnerSeats(seatIndexes);
  }catch(e){}

  agariOverlayStep = 1;
  ronOverlay.style.display = "flex";
}

function closeRon(){
  removeExtraRonOverlays();
  clearAgariWinnerClasses(ronOverlay);
  ronOverlay.style.display = "none";
}

// 流局オーバーレイ
function openRyukyoku(){
  // ★ 流局も「確認→次局」の2段階
  ryukyokuOverlayStep = 1;
  ryukyokuOverlay.style.display = "flex";
}
function closeRyukyoku(){ ryukyokuOverlay.style.display = "none"; }

// ================================
// ★ 山枯れ流局（turn.js / riichi.js から呼ばれる）
// - 親テンパイなら連荘（本場+1）
// - 親ノーテンなら親流れ（次局で親交代）
// ※ テンパイ判定は shanten.js の calcShanten を利用（0ならテンパイ）
// ================================
function getNagashiWinnerSeatIndexesForCurrentState(){
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

function endByExhaustionRyukyoku(){
  if (typeof isEnded !== "undefined" && isEnded) return;

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("ryukyoku_exhaustion", {
        reason: "exhaustion"
      });
    }
  }catch(e){}

  try{ isEnded = true; }catch(e){}

  const nagashiWinnerSeats = getNagashiWinnerSeatIndexesForCurrentState();
  if (nagashiWinnerSeats.length > 0){
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("agari_nagashi", {
          winnerSeatIndexes: nagashiWinnerSeats.slice(),
          winType: "nagashi"
        });
      }
    }catch(e){}

    try{
      lastNagashiWinnerSeatIndexes = nagashiWinnerSeats.slice();
      if (typeof setNagashiResultQueueFromWinners === "function"){
        setNagashiResultQueueFromWinners(nagashiWinnerSeats);
      }
      lastAgariWinnerSeatIndex = nagashiWinnerSeats[0];
      lastAgariDiscarderSeatIndex = null;
      lastAgariType = "nagashi";
      lastRyukyokuDealerTenpai = null;
    }catch(e){}

    try{
      if (typeof clearSelectedTile === "function") clearSelectedTile();
      if (typeof clearNewFlags === "function") clearNewFlags();
    }catch(e){}

    if (typeof render === "function") render();

    try{
      if (typeof setPostAgariStageToOverlay === "function") setPostAgariStageToOverlay();
    }catch(e){}

    if (typeof openNagashi === "function"){
      openNagashi();
    } else if (typeof openRyukyoku === "function"){
      openRyukyoku();
    }
    return;
  }

  const dealer = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  const nextSeatOf = (s)=>{
    if (typeof nextSeatIndexOf === "function") return nextSeatIndexOf(s);
    return (s + 1) % 3;
  };

  const getTilesForSeat = (seat)=>{
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
  };

  const fixedMForSeat = (seat)=>{
    if (seat === 0){
      return Array.isArray(melds) ? melds.length : 0;
    }
    if (typeof getCpuFixedMeldCountBySeat === "function"){
      return getCpuFixedMeldCountBySeat(seat);
    }
    return 0;
  };

  const isTenpaiWith13Counts = (tiles, fixedM)=>{
    try{
      const counts = countsFromTiles(tiles);
      const s = (typeof calcShanten === "function") ? calcShanten(counts, fixedM) : 99;
      return s === 0;
    }catch(e){
      return false;
    }
  };

  const getExpectedConcealedCount = (fixedM)=>{
    const n = 13 - ((Number(fixedM) || 0) * 3);
    return Math.max(0, n | 0);
  };

  const isTenpaiForSeat = (seat)=>{
    const tiles = getTilesForSeat(seat);
    const fixedM = fixedMForSeat(seat);
    const expectedConcealedCount = getExpectedConcealedCount(fixedM);
    const expectedWithDrawCount = expectedConcealedCount + 1;

    // 副露数ぶん減った手牌枚数でもテンパイ判定する
    if (tiles.length === expectedConcealedCount){
      return isTenpaiWith13Counts(tiles, fixedM);
    }

    // drawn を持っている等で1枚多い場合は、1枚切ってテンパイ可能かを見る
    if (tiles.length === expectedWithDrawCount){
      for (let i = 0; i < tiles.length; i++){
        const cand = tiles.slice();
        cand.splice(i, 1);
        if (isTenpaiWith13Counts(cand, fixedM)) return true;
      }
      return false;
    }

    // その他は安全側：テンパイ扱いしない
    return false;
  };

  const dealerTenpai = (typeof window !== "undefined" && typeof window.mbSanmaIsSeatTenpaiAtRyukyoku === "function")
    ? !!window.mbSanmaIsSeatTenpaiAtRyukyoku(dealer)
    : isTenpaiForSeat(dealer);

  // ★ 次局進行用に保存
  // - lastAgariType は "ryukyoku" をセット
  // - 親テンパイかどうかを lastRyukyokuDealerTenpai に保存（main.js で参照）
  try{
    lastAgariWinnerSeatIndex = null;
    lastAgariDiscarderSeatIndex = null;
    lastAgariType = "ryukyoku";
  }catch(e){}
  try{
    // どこにも宣言が無くても（非 strict なら）代入でグローバルになるが、
    // main.js 側で let 宣言しておく想定
    lastRyukyokuDealerTenpai = !!dealerTenpai;
  }catch(e){}

  try{
    if (typeof clearSelectedTile === "function") clearSelectedTile();
    if (typeof clearNewFlags === "function") clearNewFlags();
  }catch(e){}

  if (typeof render === "function") render();
  if (typeof openRyukyoku === "function") openRyukyoku();
}


// カン演出
function getActionSpeedMs(key, fallback){
  try{
    if (typeof getGameSpeedMs === "function"){
      return getGameSpeedMs(key, fallback);
    }
  }catch(e){}
  return fallback;
}

// カン演出
function openKanEffect(){
  if (!kanOverlay) return;
  kanOverlay.style.display = "flex";
  setTimeout(()=>{ kanOverlay.style.display = "none"; }, getActionSpeedMs("kanEffectDurationMs", 650));
}

// リーチ演出
function openRiichiEffect(){
  if (!riichiOverlay) return;
  riichiOverlay.style.display = "flex";
  setTimeout(()=>{ riichiOverlay.style.display = "none"; }, getActionSpeedMs("riichiEffectDurationMs", 650));
}

// ツモ文字演出
function openDrawEffect(){
  const el = document.getElementById("drawOverlay");
  if (!el) return;
  el.style.display = "flex";
  setTimeout(()=>{ el.style.display = "none"; }, getActionSpeedMs("drawEffectDurationMs", 220));
}

async function openTsumoWithEffect(){
  openDrawEffect();
  await new Promise(r=>setTimeout(r, getActionSpeedMs("tsumoEffectLeadMs", 1000)));
  openTsumo();
}

// （自分の捨ての後の処理）
function afterPlayerDiscardAdvance(){
  if (typeof clearSelectedTile === "function") clearSelectedTile();
  try{ if (typeof clearPlayerDangerousOpenRiichiDiscardCache === "function") clearPlayerDangerousOpenRiichiDiscardCache(); }catch(e){}
  render();

  if (typeof advanceTurnAfterDiscard === "function"){
    advanceTurnAfterDiscard(0);
  }

  if (!isEnded && typeof kickCpuTurnsIfNeeded === "function"){
    kickCpuTurnsIfNeeded();
  }
}

function getPlayerForbiddenCallDiscardCode(){
  if (typeof turnPhase === "undefined" || turnPhase !== "CALL_DISCARD") return null;
  if (typeof currentTurnSeatIndex === "undefined" || currentTurnSeatIndex !== 0) return null;
  if (!Array.isArray(melds) || melds.length <= 0) return null;

  const lastMeld = melds[melds.length - 1];
  if (!lastMeld || lastMeld.type !== "pon" || !lastMeld.code) return null;
  return lastMeld.code;
}


function getWaitCodesFromTenpaiTilesForLog(tiles13, fixedMeldCount){
  if (!Array.isArray(tiles13)) return [];
  if (typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return [];
  if (typeof countsFromTiles !== "function" || typeof calcShanten !== "function") return [];

  const out = [];
  const seen = new Set();
  for (const code of TILE_TYPES){
    if (!code || seen.has(code)) continue;
    seen.add(code);

    try{
      const tiles14 = tiles13.slice();
      tiles14.push({ code });
      if (calcShanten(countsFromTiles(tiles14), fixedMeldCount) === -1){
        out.push(code);
      }
    }catch(e){}
  }

  return out;
}

function getPatternPairCodeForLog(pattern){
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

function isTripletMeldTypeForLog(type){
  const value = String(type || "").toLowerCase();
  return value === "koutsu" || value === "anko" || value === "pon" || value === "triplet";
}

function getShuntsuSubtypeForLog(meldCode, waitCode){
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

function getRepresentativeWaitTypeKeyForLog(rawKeys){
  const keys = rawKeys instanceof Set ? rawKeys : new Set(Array.isArray(rawKeys) ? rawKeys : []);
  if (keys.has("ryanmen")) return "ryanmen";
  if (keys.has("kanchan")) return "kanchan";
  if (keys.has("penchan")) return "penchan";
  if (keys.has("shabo")) return "shabo";
  if (keys.has("tanki")) return "tanki";
  return "";
}

function getNonStandardWaitTypeKeyForLog(tiles13, waitCode, fixedMeldCount = 0){
  if (!waitCode) return "";
  if ((fixedMeldCount | 0) > 0) return "";
  if (typeof countsFromTiles !== "function") return "";

  try{
    const tiles14 = Array.isArray(tiles13) ? tiles13.slice() : [];
    tiles14.push({ code: waitCode });
    const counts14 = countsFromTiles(tiles14);

    const isChiitoiAgari = (typeof calcShantenChiitoi === "function")
      ? (calcShantenChiitoi(counts14) === -1)
      : false;
    const isKokushiAgari = (typeof calcShantenKokushi === "function")
      ? (calcShantenKokushi(counts14, fixedMeldCount) === -1)
      : false;

    if (!isChiitoiAgari && !isKokushiAgari) return "";

    const sameCodeCount = Array.isArray(tiles13)
      ? tiles13.reduce((sum, tile)=> sum + ((tile && tile.code === waitCode) ? 1 : 0), 0)
      : 0;

    if (sameCodeCount >= 1) return "tanki";
  }catch(e){}

  return "";
}

function getWaitTypeKeysForSingleWaitCodeFromPatternsForLog(tiles13, waitCode, fixedMeldCount = 0){
  const raw = new Set();
  if (!waitCode) return raw;
  if (typeof countsFromTiles !== "function") return raw;
  if (typeof findStandardAgariPatternsFromCounts !== "function") return raw;

  try{
    const tiles14 = Array.isArray(tiles13) ? tiles13.slice() : [];
    tiles14.push({ code: waitCode });
    const patterns = findStandardAgariPatternsFromCounts(countsFromTiles(tiles14));

    for (const pattern of (Array.isArray(patterns) ? patterns : [])){
      const pairCode = getPatternPairCodeForLog(pattern);
      if (pairCode === waitCode) raw.add("tanki");

      const meldsInPattern = Array.isArray(pattern && pattern.melds) ? pattern.melds : [];
      for (const meld of meldsInPattern){
        if (!meld || !meld.code) continue;

        if (isTripletMeldTypeForLog(meld.type) && meld.code === waitCode){
          raw.add("shabo");
          continue;
        }

        if (meld.type !== "shuntsu") continue;
        const subtype = getShuntsuSubtypeForLog(meld.code, waitCode);
        if (subtype) raw.add(subtype);
      }
    }
  }catch(e){}

  const representative = getRepresentativeWaitTypeKeyForLog(raw);
  if (representative){
    return new Set([representative]);
  }

  const fallback = getNonStandardWaitTypeKeyForLog(tiles13, waitCode, fixedMeldCount);
  if (fallback){
    return new Set([fallback]);
  }

  return raw;
}

function getRyanmenCapableWaitCodesForLog(tiles13, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes : [];
  if (!waits.length) return [];

  const out = [];
  const seen = new Set();

  for (const waitCode of waits){
    if (!waitCode || seen.has(waitCode)) continue;
    const keys = getWaitTypeKeysForSingleWaitCodeFromPatternsForLog(tiles13, waitCode);
    if (keys.has("ryanmen")){
      seen.add(waitCode);
      out.push(waitCode);
    }
  }

  return out;
}

function getNMenchanKeyForWaitCountForLog(waitCount){
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

function classifyWaitTypeKeysForLog(tiles13, fixedMeldCount, waitCodes){
  const waits = Array.isArray(waitCodes) ? waitCodes.filter(Boolean) : [];
  if (!waits.length) return [];

  if (waits.length >= 4){
    const nMenchanKey = getNMenchanKeyForWaitCountForLog(waits.length);
    return nMenchanKey ? [nMenchanKey] : ["other"];
  }

  let ryanmenCount = 0;
  let hasOther = false;
  const gukeiKeys = new Set();

  for (const waitCode of waits){
    const keys = getWaitTypeKeysForSingleWaitCodeFromPatternsForLog(tiles13, waitCode, fixedMeldCount);
    const representative = getRepresentativeWaitTypeKeyForLog(keys);

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

function isRyanmenWaitFromWaitCodesForLog(tiles13, fixedMeldCount, waitCodes, meldList){
  const keys = classifyWaitTypeKeysForLog(tiles13, fixedMeldCount, waitCodes);
  return keys.includes("ryanmen") || keys.includes("sanmenchan") || keys.includes("multi_ryanmen") || keys.some((key)=> /^\d+menchan$/.test(String(key || "")));
}

function buildTenpaiDetailForPlayerRiichiLog(){
  const tiles13 = Array.isArray(hand13) ? hand13.slice() : [];
  const fixedMeldCount = Array.isArray(melds) ? melds.length : 0;
  const waitCodes = getWaitCodesFromTenpaiTilesForLog(tiles13, fixedMeldCount);

  let waitTileCount = 0;
  try{
    if (typeof countVisibleForCpuSeat === "function" && typeof TYPE_TO_IDX === "object"){
      const visibleCounts = countVisibleForCpuSeat(0, tiles13);
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

  const waitTypeKeys = classifyWaitTypeKeysForLog(tiles13, fixedMeldCount, waitCodes);
  const isRyanmenWait = waitTypeKeys.includes("ryanmen") || waitTypeKeys.includes("sanmenchan") || waitTypeKeys.includes("multi_ryanmen") || waitTypeKeys.some((key)=> /^\d+menchan$/.test(String(key || "")));

  return {
    waitTileCount,
    waitTypeCount: Array.isArray(waitCodes) ? waitCodes.length : 0,
    isRyanmenWait,
    waitTypeKeys,
    waitCodes: waitCodes.slice()
  };
}

function pushPlayerRiichiEventForLog(discardedTile){
  try{
    if (typeof window === "undefined" || !window.MBSanmaMatchLog || typeof window.MBSanmaMatchLog.pushEvent !== "function") return;

    const tenpai = buildTenpaiDetailForPlayerRiichiLog();
    const tileLike = discardedTile && discardedTile.code
      ? (window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedTile) : { code: discardedTile.code, imgCode: discardedTile.imgCode || discardedTile.code })
      : null;

    window.MBSanmaMatchLog.pushEvent("riichi", {
      seatIndex: 0,
      junme: Array.isArray(river) ? river.length : 0,
      tile: tileLike,
      tenpai
    });
  }catch(e){}
}


function isPlayerRiichiTsumoChoiceLockedNow(){
  if (isEnded) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (!isRiichi) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD") return false;
  }

  if (!drawn) return false;
  if (typeof canTsumoAgariNow === "function") return !!canTsumoAgariNow();
  return false;
}


function canSelectPlayerTileForDiscard(isDrawnTile){
  if (isEnded) return false;
  if (typeof isRiichiTypeSelectingActive === "function" && isRiichiTypeSelectingActive()) return false;
  if (isPlayerRiichiTsumoChoiceLockedNow()) return false;
  if (typeof isPlayerDiscardAiEnabled === "function" && isPlayerDiscardAiEnabled()) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;

  if (typeof turnPhase !== "undefined"){
    if (isDrawnTile){
      if (turnPhase !== "DISCARD") return false;
    } else {
      if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return false;
    }
  }

  if (isDrawnTile){
    return !!drawn;
  }

  if (typeof turnPhase === "undefined" || turnPhase === "DISCARD"){
    return !!drawn;
  }

  return true;
}


function getDangerousOpenRiichiSeatIndexesForPlayerDiscard(){
  try{
    if (typeof getDangerousOpenRiichiSeatIndexes !== "function") return [];
    const list = getDangerousOpenRiichiSeatIndexes(0);
    return Array.isArray(list) ? list.filter((seat)=> seat === 1 || seat === 2) : [];
  }catch(e){
    return [];
  }
}

function isPlayerDiscardRestrictionByOpenRiichiDisabled(){
  if (typeof isRiichi !== "undefined" && isRiichi) return true;
  return false;
}

let playerDangerousOpenRiichiDiscardCache = null;

function clearPlayerDangerousOpenRiichiDiscardCache(){
  playerDangerousOpenRiichiDiscardCache = null;
}

function buildPlayerDangerousOpenRiichiDiscardCacheSignature(targetSeats, forbiddenCallDiscardCode){
  const seatPart = Array.isArray(targetSeats) ? targetSeats.join(",") : "";
  const handPart = Array.isArray(hand13)
    ? hand13.map((tile)=> {
        if (!tile || tile.id == null || !tile.code) return "";
        return String(tile.id) + ":" + String(tile.code);
      }).join("|")
    : "";
  const drawnPart = (drawn && drawn.id != null && drawn.code)
    ? (String(drawn.id) + ":" + String(drawn.code))
    : "";
  const phasePart = (typeof turnPhase !== "undefined") ? String(turnPhase) : "";
  const riichiPart = (typeof isRiichi !== "undefined" && isRiichi) ? "1" : "0";
  return [seatPart, String(forbiddenCallDiscardCode || ""), phasePart, riichiPart, handPart, drawnPart].join("#");
}

function isPlayerDiscardUnsafeAgainstDangerousOpenRiichiSeat(tileCode, seatIndex){
  if (!tileCode) return false;
  try{
    if (typeof window !== "undefined" && typeof window.isTileCodeActuallyDealingIntoSeatOpenRiichi === "function"){
      return !!window.isTileCodeActuallyDealingIntoSeatOpenRiichi(tileCode, seatIndex);
    }
  }catch(e){}

  try{
    if (typeof isTileCodeDealingIntoSeatOpenRiichi === "function"){
      return !!isTileCodeDealingIntoSeatOpenRiichi(tileCode, seatIndex);
    }
  }catch(e){}

  return false;
}

function getPlayerDangerousOpenRiichiDiscardCache(){
  const empty = {
    targetSeats: [],
    unsafeCodes: new Set(),
    safeKeys: new Set(),
    hasRestriction: false
  };

  if (isPlayerDiscardRestrictionByOpenRiichiDisabled()) return empty;

  const targetSeats = getDangerousOpenRiichiSeatIndexesForPlayerDiscard();
  if (!Array.isArray(targetSeats) || targetSeats.length <= 0) return empty;
  if (!Array.isArray(hand13)) return empty;

  const forbiddenCallDiscardCode = getPlayerForbiddenCallDiscardCode();
  const signature = buildPlayerDangerousOpenRiichiDiscardCacheSignature(targetSeats, forbiddenCallDiscardCode);
  if (
    playerDangerousOpenRiichiDiscardCache &&
    playerDangerousOpenRiichiDiscardCache.signature === signature
  ){
    return playerDangerousOpenRiichiDiscardCache;
  }

  const unsafeCodes = new Set();
  const codeSet = new Set();
  for (const tile of hand13){
    if (tile && tile.code) codeSet.add(tile.code);
  }
  if ((typeof turnPhase === "undefined" || turnPhase === "DISCARD") && drawn && drawn.code){
    codeSet.add(drawn.code);
  }

  for (const tileCode of codeSet){
    let unsafe = false;
    for (const seatIndex of targetSeats){
      if (isPlayerDiscardUnsafeAgainstDangerousOpenRiichiSeat(tileCode, seatIndex)){
        unsafe = true;
        break;
      }
    }
    if (unsafe) unsafeCodes.add(tileCode);
  }

  const safeKeys = new Set();
  for (const tile of hand13){
    if (!tile || tile.id == null || !tile.code) continue;
    if (forbiddenCallDiscardCode && tile.code === forbiddenCallDiscardCode) continue;
    if (!unsafeCodes.has(tile.code)){
      safeKeys.add("H:" + tile.id);
    }
  }

  if ((typeof turnPhase === "undefined" || turnPhase === "DISCARD") && drawn && drawn.id != null && drawn.code){
    if (!unsafeCodes.has(drawn.code)){
      safeKeys.add("D:" + drawn.id);
    }
  }

  playerDangerousOpenRiichiDiscardCache = {
    signature,
    targetSeats: targetSeats.slice(),
    unsafeCodes,
    safeKeys,
    hasRestriction: true
  };
  return playerDangerousOpenRiichiDiscardCache;
}

function isPlayerDiscardUnsafeAgainstDangerousOpenRiichi(tile){
  if (!tile || !tile.code) return false;
  const cache = getPlayerDangerousOpenRiichiDiscardCache();
  if (!cache.hasRestriction) return false;
  return cache.unsafeCodes.has(tile.code);
}

function buildPlayerSafeDiscardKeySetAgainstDangerousOpenRiichi(){
  const cache = getPlayerDangerousOpenRiichiDiscardCache();
  return cache && cache.safeKeys instanceof Set ? new Set(cache.safeKeys) : new Set();
}

function hasPlayerDangerousOpenRiichiRestrictionNow(){
  const cache = getPlayerDangerousOpenRiichiDiscardCache();
  return !!(cache && cache.hasRestriction);
}

function shouldUseSingleTapPlayerDiscardAgainstDangerousOpenRiichi(){
  return false;
}

function canPlayerDiscardTileAgainstDangerousOpenRiichi(tile, isDrawnTile){
  if (!tile || tile.id == null || !tile.code) return true;
  if (isPlayerDiscardRestrictionByOpenRiichiDisabled()) return true;

  const safeKeys = buildPlayerSafeDiscardKeySetAgainstDangerousOpenRiichi();
  if (!(safeKeys instanceof Set) || safeKeys.size <= 0) return true;

  const key = isDrawnTile ? ("D:" + tile.id) : ("H:" + tile.id);
  if (safeKeys.has(key)) return true;
  return !isPlayerDiscardUnsafeAgainstDangerousOpenRiichi(tile);
}

function pressPlayerHandTile(idx){
  if (!canSelectPlayerTileForDiscard(false)) return { type: "ignored" };
  if (!Array.isArray(hand13)) return { type: "ignored" };
  if (idx < 0 || idx >= hand13.length) return { type: "ignored" };

  const t = hand13[idx];
  if (!t) return { type: "ignored" };

  const forbiddenCallDiscardCode = getPlayerForbiddenCallDiscardCode();
  if (forbiddenCallDiscardCode && t.code === forbiddenCallDiscardCode){
    return { type: "ignored" };
  }

  if (!canPlayerDiscardTileAgainstDangerousOpenRiichi(t, false)){
    return { type: "ignored" };
  }

  if (isRiichiSelecting && riichiCandidates && !riichiCandidates.has("H:" + t.id)){
    return { type: "ignored" };
  }

  if (shouldUseSingleTapPlayerDiscardAgainstDangerousOpenRiichi()){
    return { type: "discardHand", idx };
  }

  if (typeof isSelectedTile === "function" && isSelectedTile(t.id, false)){
    return { type: "discardHand", idx };
  }

  if (typeof setSelectedTile === "function") setSelectedTile(t.id, false);
  return { type: "selected", idx };
}

function pressPlayerDrawnTile(){
  if (!canSelectPlayerTileForDiscard(true)) return { type: "ignored" };
  if (!drawn) return { type: "ignored" };

  if (isRiichiSelecting && riichiCandidates && !riichiCandidates.has("D:" + drawn.id)){
    return { type: "ignored" };
  }

  if (!canPlayerDiscardTileAgainstDangerousOpenRiichi(drawn, true)){
    return { type: "ignored" };
  }

  if (shouldUseSingleTapPlayerDiscardAgainstDangerousOpenRiichi()){
    return { type: "discardDrawn" };
  }

  if (typeof isSelectedTile === "function" && isSelectedTile(drawn.id, true)){
    return { type: "discardDrawn" };
  }

  if (typeof setSelectedTile === "function") setSelectedTile(drawn.id, true);
  return { type: "selected" };
}

// =========================================================
// ===== 自分の打牌（render.js から呼ばれる） =====
// - render.js 側は discardFromHand13(idx) / discardDrawn() を呼ぶ前提
// - 状態変更は actions.js で行う（プロジェクト方針）
// =========================================================
function discardFromHand13(idx){
  if (isEnded) return;
  if (isPlayerRiichiTsumoChoiceLockedNow()) return;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  // CALL_DISCARD（鳴き後ツモ無し打牌）と通常DISCARDのみ許可
  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD" && turnPhase !== "CALL_DISCARD") return;
  }

  // 鳴き選択待ち中は打牌させない（CPU進行が止まるのを防ぐ）
  if (typeof pendingCall !== "undefined" && pendingCall) return;

  if (!Array.isArray(hand13)) return;
  if (idx < 0 || idx >= hand13.length) return;

  // =========================================================
  // ★永久対策：ツモ番が来た直後（drawn未配布の0.5秒）に
  //            連打すると「ツモる前に切れて手牌が減る」問題を防ぐ
  //
  // turnPhase==="DISCARD" のときは、必ず drawn がある状態でのみ打牌を許可する。
  // ※ 例外：CALL_DISCARD（ポン後のツモ無し打牌）は drawn が無いのが正しいのでOK
  // =========================================================
  if ((typeof turnPhase === "undefined" || turnPhase === "DISCARD") && !drawn){
    return;
  }

  const t = hand13[idx];
  if (!t) return;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  const forbiddenCallDiscardCode = getPlayerForbiddenCallDiscardCode();
  if (forbiddenCallDiscardCode && t.code === forbiddenCallDiscardCode){
    return;
  }

  if (!canPlayerDiscardTileAgainstDangerousOpenRiichi(t, false)){
    return;
  }

  // リーチ選択中：候補以外は無視
  // ★宣言牌だけ横向き表示したいので、この打牌が「宣言打牌」かどうかを覚えておく
  let isRiichiDeclareDiscard = false;
  if (isRiichiSelecting && riichiCandidates){
    if (!riichiCandidates.has("H:" + t.id)) return;

    // この打牌でリーチ成立（今の仕様：打牌と同時に成立）
    isRiichiSelecting = false;
    riichiCandidates = null;
    isRiichi = true;
    try{
      if (typeof setPlayerOpenRiichi === "function"){
        const isOpenRiichi = (typeof consumePendingOpenRiichiSelection === "function")
          ? consumePendingOpenRiichiSelection()
          : ((typeof isPendingOpenRiichiSelection === "function") && isPendingOpenRiichiSelection());
        setPlayerOpenRiichi(!!isOpenRiichi);
      }
    }catch(e){}
    isRiichiDeclareDiscard = true;
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(0, canDeclareDoubleRiichiNow(0)); }catch(e){}
    if (typeof openRiichiEffect === "function") openRiichiEffect();
  }

  // 手牌から抜く
  hand13.splice(idx, 1);

  // 通常：drawn を手牌へ入れて 13枚に戻す
  if (typeof turnPhase === "undefined" || turnPhase === "DISCARD"){
    if (drawn){
      drawn.isNew = false;
      hand13.push(drawn);
      drawn = null;
      hand13 = sortHand(hand13);
    }
  }

  // 捨て牌へ
  t.isNew = false;
  t.isRiichiDeclare = !!isRiichiDeclareDiscard;
  if (isRiichiDeclareDiscard && typeof setPlayerRiichiDeclareTileId === "function"){
    setPlayerRiichiDeclareTileId(t.id);
  }
  if (!isRiichiDeclareDiscard && typeof maybeAdoptPlayerRiichiDisplayTile === "function"){
    maybeAdoptPlayerRiichiDisplayTile(t);
  }
  river.push(t);

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(t) : { code: t.code, imgCode: t.imgCode || t.code },
        source: (typeof turnPhase !== "undefined" && turnPhase === "CALL_DISCARD") ? "call_discard" : "hand",
        isTsumogiri: false,
        isRiichiDeclare: !!isRiichiDeclareDiscard,
        turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
      });
    }
  }catch(e){}

  if (isRiichiDeclareDiscard){
    pushPlayerRiichiEventForLog(t);
  }

  // ★ 鳴き後の強制打牌を完了
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall){
    try{
      if (typeof turnPhase === "undefined" || turnPhase === "CALL_DISCARD"){
        mustDiscardAfterCall = false;
      }
    }catch(e){}
  }

  // ★ 一発権を消すのは「一発権を持っている本人の一発ツモが終わったとき」だけ
  // 他家の通常打牌では消さない
  //
  // ここは「自分の打牌」なので、
  // - この打牌がリーチ宣言牌なら一発権は新しく付与された直後なので消さない
  // - すでにリーチ済みで、この打牌が宣言牌ではないなら
  //   自分の一発ツモが不成立で終わったということなので、自分の分だけ消す
  if (!isRiichiDeclareDiscard && isRiichi){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  clearNewFlags();
  afterPlayerDiscardAdvance();
}

function discardDrawn(allowRiichiTsumoSkip = false){
  if (isEnded) return;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  if (typeof turnPhase !== "undefined"){
    if (turnPhase !== "DISCARD") return; // ツモ牌切りは通常DISCARDのみ
  }

  if (typeof pendingCall !== "undefined" && pendingCall) return;

  if (isPlayerRiichiTsumoChoiceLockedNow() && !allowRiichiTsumoSkip) return;

  if (!drawn) return;

  if (typeof clearSelectedTile === "function") clearSelectedTile();

  // リーチ選択中：候補以外は無視
  // ★宣言牌だけ横向き表示したいので、この打牌が「宣言打牌」かどうかを覚えておく
  let isRiichiDeclareDiscard = false;
  if (!canPlayerDiscardTileAgainstDangerousOpenRiichi(drawn, true)) return;

  if (isRiichiSelecting && riichiCandidates){
    if (!riichiCandidates.has("D:" + drawn.id)) return;

    isRiichiSelecting = false;
    riichiCandidates = null;
    isRiichi = true;
    try{
      if (typeof setPlayerOpenRiichi === "function"){
        const isOpenRiichi = (typeof consumePendingOpenRiichiSelection === "function")
          ? consumePendingOpenRiichiSelection()
          : ((typeof isPendingOpenRiichiSelection === "function") && isPendingOpenRiichiSelection());
        setPlayerOpenRiichi(!!isOpenRiichi);
      }
    }catch(e){}
    isRiichiDeclareDiscard = true;
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, true); }catch(e){}
    try{ if (typeof setDoubleRiichiForSeat === "function" && typeof canDeclareDoubleRiichiNow === "function") setDoubleRiichiForSeat(0, canDeclareDoubleRiichiNow(0)); }catch(e){}
    if (typeof openRiichiEffect === "function") openRiichiEffect();
  }

  drawn.isNew = false;
  drawn.isRiichiDeclare = !!isRiichiDeclareDiscard;
  if (isRiichiDeclareDiscard && typeof setPlayerRiichiDeclareTileId === "function"){
    setPlayerRiichiDeclareTileId(drawn.id);
  }
  if (!isRiichiDeclareDiscard && typeof maybeAdoptPlayerRiichiDisplayTile === "function"){
    maybeAdoptPlayerRiichiDisplayTile(drawn);
  }
  const discardedDrawnTile = drawn;
  river.push(drawn);
  drawn = null;

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("discard", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(discardedDrawnTile) : { code: discardedDrawnTile.code, imgCode: discardedDrawnTile.imgCode || discardedDrawnTile.code },
        source: "drawn",
        isTsumogiri: true,
        isRiichiDeclare: !!isRiichiDeclareDiscard,
        turnPhase: (typeof turnPhase !== "undefined") ? turnPhase : ""
      });
    }
  }catch(e){}

  if (isRiichiDeclareDiscard){
    pushPlayerRiichiEventForLog(discardedDrawnTile);
  }

  // ★ 一発権を消すのは「一発権を持っている本人の一発ツモが終わったとき」だけ
  // 他家の通常打牌では消さない
  //
  // ここは「自分の打牌」なので、
  // - この打牌がリーチ宣言牌なら一発権は新しく付与された直後なので消さない
  // - すでにリーチ済みで、この打牌が宣言牌ではないなら
  //   自分の一発ツモが不成立で終わったということなので、自分の分だけ消す
  if (!isRiichiDeclareDiscard && isRiichi){
    try{ if (typeof setIppatsuChanceForSeat === "function") setIppatsuChanceForSeat(0, false); }catch(e){}
  }

  try{ if (typeof resetCurrentWinContext === "function") resetCurrentWinContext(); }catch(e){}

  clearNewFlags();
  afterPlayerDiscardAdvance();
}