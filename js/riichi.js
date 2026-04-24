// ========= riichi.js（リーチ：選択→成立→自動ツモ切り＋例外停止） =========

let riichiEffectHideTimer = null;
let isRiichiTypeSelecting = false;
let pendingRiichiDeclarationType = "normal";


function getRiichiEffectDurationMs(){
  try{
    if (typeof getGameSpeedMs === "function"){
      const ms = Number(getGameSpeedMs("riichiEffectDurationMs", 900));
      if (Number.isFinite(ms) && ms >= 0) return ms;
    }
  }catch(e){}
  return 900;
}

function getRiichiAutoDiscardDelayMs(){
  try{
    if (typeof getGameSpeedMs === "function"){
      const ms = Number(getGameSpeedMs("playerAutoDiscardDelayMs", 260));
      if (Number.isFinite(ms) && ms >= 0) return ms;
    }
  }catch(e){}
  return 260;
}

function getRiichiAutoRetryDelayMs(){
  const base = getRiichiAutoDiscardDelayMs();
  if (!Number.isFinite(base) || base <= 0) return 40;
  return Math.max(20, Math.min(80, base));
}

function openRiichiEffect(seatIndex = 0){
  if (!riichiOverlay) return;

  const inner = riichiOverlay.querySelector(".inner");
  const img = inner ? inner.querySelector("img") : null;

  riichiOverlay.style.position = "fixed";
  riichiOverlay.style.inset = "0";
  riichiOverlay.style.display = "block";
  riichiOverlay.style.pointerEvents = "none";
  riichiOverlay.style.zIndex = "2500";
  riichiOverlay.style.background = "transparent";

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
  let w = "360px";

  if (seatIndex === 1){
    x = "82%";
    y = "58%";
    w = "300px";
  } else if (seatIndex === 2){
    x = "18%";
    y = "58%";
    w = "300px";
  }

  const durationMs = getRiichiEffectDurationMs();

  try{
    if (riichiEffectHideTimer){
      clearTimeout(riichiEffectHideTimer);
      riichiEffectHideTimer = null;
    }
  }catch(e){}

  try{
    if (inner && typeof inner.getAnimations === "function"){
      inner.getAnimations().forEach((anim)=>{
        try{ anim.cancel(); }catch(e){}
      });
    }
  }catch(e){}

  if (inner){
    inner.style.left = x;
    inner.style.top = y;
    inner.style.width = `min(${w}, 34vw)`;
    if (seatIndex === 0){
      inner.style.width = "min(360px, 42vw)";
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
        duration: durationMs,
        easing: "ease-out",
        fill: "forwards"
      }
    );
  }

  riichiEffectHideTimer = setTimeout(()=>{
    riichiEffectHideTimer = null;
    if (!riichiOverlay) return;
    riichiOverlay.style.display = "none";
  }, durationMs);
}

function stopRiichiAuto(){
  if (riichiAutoTimer){
    clearTimeout(riichiAutoTimer);
    riichiAutoTimer = null;
  }
}

function getRiichiCancelBtnEl(){
  return document.getElementById("riichiCancelBtn");
}

function cancelRiichiSelection(){
  if (!isRiichiSelecting && !isRiichiTypeSelecting) return;

  isRiichiSelecting = false;
  isRiichiTypeSelecting = false;
  riichiCandidates = null;
  hoveredTileId = null;
  resetPendingRiichiDeclarationType();

  try{
    if (typeof updateStatsDefault === "function") updateStatsDefault();
  }catch(e){}

  render();
}

function getOpenRiichiBtnEl(){
  return document.getElementById("openRiichiBtn");
}

function bindOpenRiichiButton(){
  const btn = getOpenRiichiBtnEl();
  if (!btn || btn.dataset.boundOpenRiichi === "1") return;

  btn.dataset.boundOpenRiichi = "1";
  btn.addEventListener("click", ()=>{
    doRiichi("open");
  });
}

function bindNormalRiichiChoiceButton(){
  if (!riichiBtn || riichiBtn.dataset.boundNormalRiichiChoice === "1") return;

  riichiBtn.dataset.boundNormalRiichiChoice = "1";
  riichiBtn.addEventListener("click", ()=>{
    if (!isRiichiTypeSelecting) return;
    selectNormalRiichiMode();
  });
}

function bindRiichiCancelButton(){
  const btn = getRiichiCancelBtnEl();
  if (!btn || btn.dataset.boundRiichiCancel === "1") return;

  btn.dataset.boundRiichiCancel = "1";
  btn.addEventListener("click", ()=>{
    cancelRiichiSelection();
  });
}

// 「今の14枚がテンパイ」のとき、テンパイ維持できる捨て牌を列挙
function computeRiichiDiscardCandidates(){
  const fixedM = melds.length;
  const set = new Set();

  // 手牌のどれかを切る：13枚（drawnを含める）
  for (const t of hand13){
    const after13 = hand13.filter(x => x.id !== t.id);
    if (drawn) after13.push(drawn);
    const sh = calcShanten(countsFromTiles(after13), fixedM);
    if (sh === 0) set.add("H:" + t.id);
  }

  // drawnを切る：after13=hand13 がテンパイならOK
  if (drawn){
    const sh = calcShanten(countsFromTiles(hand13), fixedM);
    if (sh === 0) set.add("D:" + drawn.id);
  }

  return set;
}

function isClosedHandForRiichi(){
  if (!Array.isArray(melds) || melds.length === 0) return true;

  for (const meld of melds){
    if (!meld) continue;
    if (meld.type !== "ankan") return false;
  }

  return true;
}

function getRuleValueForRiichi(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isOpenRiichiRuleEnabled(){
  return String(getRuleValueForRiichi("extra-open-riichi", "off") || "").toLowerCase() === "on";
}

function isRiichiTypeSelectingActive(){
  return !!isRiichiTypeSelecting;
}

function getPendingRiichiDeclarationType(){
  return pendingRiichiDeclarationType === "open" ? "open" : "normal";
}

function setPendingRiichiDeclarationType(type){
  pendingRiichiDeclarationType = (type === "open") ? "open" : "normal";
  return getPendingRiichiDeclarationType();
}

function isPendingOpenRiichiSelection(){
  return getPendingRiichiDeclarationType() === "open";
}

function consumePendingOpenRiichiSelection(){
  const isOpen = isPendingOpenRiichiSelection();
  pendingRiichiDeclarationType = "normal";
  return isOpen;
}

function resetPendingRiichiDeclarationType(){
  pendingRiichiDeclarationType = "normal";
}

function openRiichiTypeSelection(){
  if (isEnded || isRiichi || isRiichiSelecting || isRiichiTypeSelecting) return;
  if (!isClosedHandForRiichi()) return;
  if (!isTenpaiNow14()) return;
  if (!isFuritenRiichiEnabled() && isPlayerFuritenNowForRiichi()) return;
  if (!isOpenRiichiRuleEnabled()) return;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

  bindRiichiCancelButton();

  isRiichiTypeSelecting = true;
  resetPendingRiichiDeclarationType();
  hoveredTileId = null;

  try{
    if (typeof updateStatsDefault === "function") updateStatsDefault();
  }catch(e){}

  render();
}

function selectNormalRiichiMode(){
  if (isEnded || isRiichi) return;
  isRiichiTypeSelecting = false;
  setPendingRiichiDeclarationType("normal");
  startRiichiSelection();
}

function selectOpenRiichiMode(){
  if (isEnded || isRiichi) return;
  if (!isOpenRiichiRuleEnabled()) return;
  isRiichiTypeSelecting = false;
  setPendingRiichiDeclarationType("open");
  startRiichiSelection();
}

function isFuritenRiichiEnabled(){
  return String(getRuleValueForRiichi("basic-furiten-riichi", "on") || "").toLowerCase() !== "off";
}

function isPlayerFuritenNowForRiichi(){
  try{
    if (typeof window !== "undefined" && window.furiten && typeof window.furiten.isFuritenNow === "function"){
      return !!window.furiten.isFuritenNow();
    }
  }catch(e){}

  try{
    if (typeof isFuritenNow === "function"){
      return !!isFuritenNow();
    }
  }catch(e){}

  return false;
}

function startRiichiSelection(){
  if (isEnded || isRiichi || isRiichiSelecting || isRiichiTypeSelecting) return;
  if (!isClosedHandForRiichi()) return;
  if (!isTenpaiNow14()) return;
  if (!isFuritenRiichiEnabled() && isPlayerFuritenNowForRiichi()) return;

  const cand = computeRiichiDiscardCandidates();
  if (cand.size <= 0){
    resetPendingRiichiDeclarationType();
    return;
  }

  bindRiichiCancelButton();
  bindOpenRiichiButton();
  bindNormalRiichiChoiceButton();

  isRiichiSelecting = true;
  riichiCandidates = cand;

  hoveredTileId = null;
  updateStatsDefault();
  render();
}

// ★ リーチ中、ツモ後に「止まる」かどうか（ペー or カン）
function shouldPauseForSpecialAfterRiichiDraw(){
  if (!drawn) return false;

  // 抜き行動：現在ルールで実際に抜ける牌を引いたときだけ止まる
  // - 北扱いが抜きドラのときの北
  // - 花牌ON時の花牌
  // ※ 北扱いが場風 / オタ風のときは北で止めない
  if (typeof isNukiTileForGame === "function" && isNukiTileForGame(drawn)) return true;

  // カン：今の手牌+ツモで4枚そろった
  const quadCode = findQuadTargetCode();
  if (quadCode){
    // ★重要：リーチ中は「実際に暗槓できるときだけ止まる」
    // （待ち不変 + おくりカン禁止を満たさない4枚では止まらない＝自動ツモ切り継続）
    if (isRiichi){
      if (typeof canRiichiAnkanNow === "function"){
        return !!canRiichiAnkanNow(quadCode);
      }
      // 判定関数が無いなら安全側で止めない（自動ツモ切りで進める）
      return false;
    }
    // リーチ前なら従来通り止まる
    return true;
  }

  return false;
}

function scheduleRiichiAuto(){
  stopRiichiAuto();
  try{
    if (typeof clearPlayerAutoDiscardTimer === "function") clearPlayerAutoDiscardTimer();
  }catch(e){}
  if (isEnded || !isRiichi) return;

  // ★ ターン制：自分の番でしか自動処理しない（CPUターン中に走ると詰む）
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return;

  // ★ すでにアガリなら「自動ツモしない」
  //   → ツモボタンを押せる状態にして、通常のツモと同じ流れにする
  //   （isEnded は立てない / overlay へ自動遷移しない）
  if ((typeof canTsumoAgariNow === "function") ? canTsumoAgariNow() : isAgariNow()){
    riichiWait = false;
    render();
    if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
    return;
  }

  // ツモが無いならツモる（ここで「止まる」判定ができるように）
  if (!drawn){
    drawn = drawOne();

    // ★ 山枯れの安全側（本来は「最後の捨て」で流局だが、ここで詰むのを避ける）
    if (!drawn){
      if (typeof endByExhaustionRyukyoku === "function"){
        endByExhaustionRyukyoku();
      } else {
        isEnded = true;
        render();
        openRyukyoku();
      }
      return;
    }

    render();
  }

  // ★ ツモ直後にアガリでも「自動ツモしない」
  //   → ツモボタンを押せる状態にして待つ
  if ((typeof canTsumoAgariNow === "function") ? canTsumoAgariNow() : isAgariNow()){
    riichiWait = false;
    render();
    if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
    return;
  }

  // ★ ここが今回の本体：ペー/（可能なら）カンが可能なら止める
  if (shouldPauseForSpecialAfterRiichiDraw()){
    const isNuki = typeof isNukiTileForGame === "function" && drawn && isNukiTileForGame(drawn);
    const aiActive = (typeof isPlayerSpecialAiEnabled === "function") && isPlayerSpecialAiEnabled();
    if (isNuki || !aiActive){
      // ペーはAIが処理できる／手動モードはそのまま止める
      riichiWait = true;
      render();
      if (aiActive && typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      return;
    }
    // カンはAI未対応：止めずにそのまま自動ツモ切りへ
  }

  // 止まらないなら一定時間後に自動ツモ切り
  riichiWait = false;
  riichiAutoTimer = setTimeout(()=>{
    if (isEnded || !isRiichi) return;
    if (riichiWait) return;

    // ★ ターンがズレてたら、次に自分の番が来たときにやり直す
    if (typeof isPlayerTurn === "function" && !isPlayerTurn()){
      riichiAutoTimer = setTimeout(()=>scheduleRiichiAuto(), getRiichiAutoRetryDelayMs());
      return;
    }

    if (!drawn){
      drawn = drawOne();

      if (!drawn){
        if (typeof endByExhaustionRyukyoku === "function"){
          endByExhaustionRyukyoku();
        } else {
          isEnded = true;
          render();
          openRyukyoku();
        }
        return;
      }

      render();
    }

    if ((typeof canTsumoAgariNow === "function") ? canTsumoAgariNow() : isAgariNow()){
      // ★ 自動ツモしない：ツモボタンへ委譲（AIが有効なら自動で押す）
      riichiWait = false;
      render();
      if (typeof maybeSchedulePlayerSpecialAiAction === "function") maybeSchedulePlayerSpecialAiAction(true);
      return;
    }

    discardDrawn(true);
  }, getRiichiAutoDiscardDelayMs());
}

// =========================================================
// ★ リーチボタン入口（UIから呼ばれる）
// =========================================================
function doRiichi(forceType = null){
  if (isEnded) return;
  if (isRiichi) return;
  if (isRiichiSelecting || isRiichiTypeSelecting) return;
  if (!isClosedHandForRiichi()) return;

  // ★ ポン後の「切るまで」中はリーチ不可
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

  const normalizedForceType = (forceType === "open") ? "open" : "normal";

  if (normalizedForceType === "open"){
    if (!isOpenRiichiRuleEnabled()) return;
    setPendingRiichiDeclarationType("open");
    startRiichiSelection();
    return;
  }

  setPendingRiichiDeclarationType("normal");
  startRiichiSelection();
}

bindRiichiCancelButton();
bindOpenRiichiButton();
bindNormalRiichiChoiceButton();
