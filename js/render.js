// MBsanma/js/render.js
// ========= render.js（描画/UIの司令塔） =========
// ※ render.js は描画専用（状態変更はしない）

function isAgariNow(){
  const fixedM = melds.length;
  const tiles14 = hand13.slice();
  if (drawn) tiles14.push(drawn);
  return calcShanten(countsFromTiles(tiles14), fixedM) === -1;
}

function canTsumoAgariNow(){
  if (isEnded) return false;
  if (!drawn) return false;

  if (typeof getCurrentPlayerAgariYakuInfo === "function"){
    try{
      const info = getCurrentPlayerAgariYakuInfo("tsumo");
      if (!info || !info.isAgari) return false;
      if ((info.yakuman | 0) > 0) return true;
      return (info.han | 0) > 0;
    }catch(e){
      return false;
    }
  }

  return isAgariNow();
}

function isTenpaiNow14(){
  const fixedM = melds.length;
  const tiles14 = hand13.slice();
  if (drawn) tiles14.push(drawn);
  const sh = calcShanten(countsFromTiles(tiles14), fixedM);
  // ★ ツモって和了形(-1)でも「テンパイ以上」として扱う（受けを広げるリーチを許可するため）
  return sh === 0 || sh === -1;
}

function hasRiichiDiscardCandidateNow(){
  // 「今の14枚（hand13+drawn）」から1枚切ってテンパイ(0)を維持できる捨て牌があるか
  // ※ アガリ(-1)でも、捨ててテンパイ維持できるならリーチ可能
  const fixedM = melds.length;

  // hand13 のどれかを切る
  for (const t of hand13){
    const after13 = hand13.filter(x => x.id !== t.id);
    if (drawn) after13.push(drawn);
    const sh = calcShanten(countsFromTiles(after13), fixedM);
    if (sh === 0) return true;
  }

  // drawn を切る
  if (drawn){
    const sh = calcShanten(countsFromTiles(hand13), fixedM);
    if (sh === 0) return true;
  }

  return false;
}

function findKakanTargetCode(){
  if (!Array.isArray(melds)) return null;

  const pool = hand13.slice();
  if (drawn) pool.push(drawn);

  for (const m of melds){
    if (!m || m.type !== "pon") continue;
    const code = m.code;
    if (!code) continue;
    if (pool.some(t => t.code === code)) return code;
  }
  return null;
}

// ★ リーチを塞ぐ「開いた副露」があるか
// - 暗槓だけならリーチ可
// - pon / minkan / kakan などが1つでもあればリーチ不可
function hasRiichiBlockingOpenMeld(){
  if (!Array.isArray(melds) || melds.length === 0) return false;

  for (const m of melds){
    if (!m) continue;
    if (m.type !== "ankan") return true;
  }

  return false;
}

function getActionbarEl(){
  return document.querySelector(".actionbar");
}

function getRiichiCancelBtnEl(){
  return document.getElementById("riichiCancelBtn");
}

function ensureOpenRiichiBtnEl(){
  const actionbarEl = getActionbarEl();
  if (!actionbarEl) return null;

  let btn = document.getElementById("openRiichiBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.id = "openRiichiBtn";
  btn.type = "button";
  btn.className = "actionBtn";
  btn.textContent = "オープン";

  if (riichiBtn && riichiBtn.parentNode === actionbarEl){
    actionbarEl.insertBefore(btn, riichiBtn);
  } else {
    const riichiCancelBtn = getRiichiCancelBtnEl();
    if (riichiCancelBtn && riichiCancelBtn.parentNode === actionbarEl){
      actionbarEl.insertBefore(btn, riichiCancelBtn);
    } else {
      actionbarEl.appendChild(btn);
    }
  }

  try{
    if (typeof bindOpenRiichiButton === "function") bindOpenRiichiButton();
  }catch(e){}

  return btn;
}

function isPlayerRiichiTsumoChoiceLocked(){
  if (typeof isEnded !== "undefined" && isEnded) return false;
  if (typeof isRiichi === "undefined" || !isRiichi) return false;
  if (typeof isRiichiSelecting !== "undefined" && isRiichiSelecting) return false;
  if (typeof pendingCall !== "undefined" && pendingCall) return false;
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return false;
  if (typeof isPlayerTurn === "function" && !isPlayerTurn()) return false;
  if (typeof turnPhase !== "undefined" && turnPhase !== "DISCARD") return false;
  if (!drawn) return false;
  if (typeof canTsumoAgariNow === "function") return !!canTsumoAgariNow();
  return false;
}


function setActionButtonState(btn, visible, enabled){
  if (!btn) return;

  const isVisible = !!visible;
  const isEnabled = !!enabled && isVisible;

  btn.style.display = isVisible ? "inline-flex" : "none";
  btn.disabled = !isEnabled;
  btn.classList.toggle("isShown", isVisible);
  btn.classList.toggle("enabled", isEnabled);
  btn.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

function refreshActionbarVisibility(){
  const actionbarEl = getActionbarEl();
  if (!actionbarEl) return;

  const hasVisibleButton = !!actionbarEl.querySelector(".actionBtn.isShown");
  actionbarEl.classList.toggle("isVisible", hasVisibleButton);
  actionbarEl.classList.toggle("actionbarHidden", !hasVisibleButton);
  actionbarEl.setAttribute("aria-hidden", hasVisibleButton ? "false" : "true");
}

function hideAllActionButtons(){
  const riichiCancelBtn = getRiichiCancelBtnEl();
  const openRiichiBtn = ensureOpenRiichiBtnEl();

  setActionButtonState(peiBtn, false, false);
  setActionButtonState(ponBtn, false, false);
  setActionButtonState(kanBtn, false, false);
  setActionButtonState(passBtn, false, false);
  if (riichiBtn) riichiBtn.textContent = "リーチ";
  setActionButtonState(riichiBtn, false, false);
  setActionButtonState(openRiichiBtn, false, false);
  setActionButtonState(riichiCancelBtn, false, false);
  setActionButtonState(ronBtn, false, false);
  setActionButtonState(tsumoBtn, false, false);
  setActionButtonState(kyuushuBtn, false, false);
  refreshActionbarVisibility();
}

function disableActionButtonsImmediately(){
  hideAllActionButtons();
}

let queuedDiscardFrameId = null;

function queueDiscardAfterImmediateButtonOff(discardFn){
  // ★ リーチ後ツモ時の「ツモ / スキップ」選択中は手牌クリックを無効化する
  if (isPlayerRiichiTsumoChoiceLocked()) return;

  // ★ 自分の打牌AI中は手牌クリックを無効化する
  if (typeof isPlayerDiscardAiEnabled === "function" && isPlayerDiscardAiEnabled()) return;

  // ★ 鳴き待機中は手牌クリックを無効化する
  //   ポン/ロン/明槓/スキップの選択が出ている最中に discard 系へ入ると、
  //   ターン状態と pendingCall が食い違って進行不能になることがある。
  if (typeof pendingCall !== "undefined" && pendingCall) return;

  disableActionButtonsImmediately();

  try{
    if (document && document.activeElement && typeof document.activeElement.blur === "function"){
      document.activeElement.blur();
    }
  }catch(e){}

  if (queuedDiscardFrameId !== null) return;

  const runner = ()=>{
    queuedDiscardFrameId = null;

    // ★ requestAnimationFrame 待ちのあいだに鳴き待機へ入った場合も安全側で中断
    if (typeof pendingCall !== "undefined" && pendingCall) return;

    discardFn();
  };

  if (typeof requestAnimationFrame === "function"){
    queuedDiscardFrameId = requestAnimationFrame(runner);
  } else {
    queuedDiscardFrameId = setTimeout(runner, 0);
  }
}

function shouldEnableOpenRiichiButtonNow(){
  if (typeof isOpenRiichiRuleEnabled === "function"){
    try{
      return !!isOpenRiichiRuleEnabled();
    }catch(e){}
  }

  const storageKeys = ["mbsanma_rules_settings_v1", "mbsanma_rules_ui_persist_v1", "mbsanma_rules_ui_v2"];
  for (const storageKey of storageKeys){
    try{
      if (typeof localStorage !== "undefined"){
        const raw = localStorage.getItem(storageKey);
        if (raw){
          const parsed = JSON.parse(raw);
          if (parsed && Object.prototype.hasOwnProperty.call(parsed, "extra-open-riichi")){
            return String(parsed["extra-open-riichi"] || "").toLowerCase() === "on";
          }
        }
      }
    }catch(e){}

    try{
      if (typeof sessionStorage !== "undefined"){
        const raw = sessionStorage.getItem(storageKey);
        if (raw){
          const parsed = JSON.parse(raw);
          if (parsed && Object.prototype.hasOwnProperty.call(parsed, "extra-open-riichi")){
            return String(parsed["extra-open-riichi"] || "").toLowerCase() === "on";
          }
        }
      }
    }catch(e){}
  }

  return true;
}

function getHandElForPlayerStateBadges(){
  return document.getElementById("hand");
}

function ensurePlayerStateBadgeGroup(){
  let wrap = document.getElementById("playerStateBadgeGroup");
  if (wrap && wrap.isConnected) return wrap;

  wrap = document.createElement("div");
  wrap.id = "playerStateBadgeGroup";
  wrap.style.position = "fixed";
  wrap.style.left = "-9999px";
  wrap.style.top = "-9999px";
  wrap.style.zIndex = "9999";
  wrap.style.display = "none";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "center";
  wrap.style.gap = "8px";
  wrap.style.pointerEvents = "none";
  wrap.style.userSelect = "none";
  wrap.style.whiteSpace = "nowrap";
  wrap.style.transform = "translate(-50%, -100%)";

  const furiten = document.createElement("span");
  furiten.id = "playerStateBadgeFuriten";
  furiten.textContent = "フリテン";
  furiten.style.display = "none";
  furiten.style.padding = "4px 12px";
  furiten.style.borderRadius = "999px";
  furiten.style.fontSize = "14px";
  furiten.style.fontWeight = "900";
  furiten.style.letterSpacing = "0.04em";
  furiten.style.lineHeight = "1.2";
  furiten.style.opacity = "0.9";
  furiten.style.border = "1px solid rgba(255,255,255,0.18)";
  furiten.style.background =
    "linear-gradient(180deg, rgba(66,16,24,0.92) 0%, rgba(36,8,14,0.90) 100%)";
  furiten.style.color = "rgba(255,238,242,0.98)";
  furiten.style.boxShadow =
    "0 10px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)";
  furiten.style.backdropFilter = "blur(6px)";
  furiten.style.webkitBackdropFilter = "blur(6px)";
  furiten.style.textShadow = "0 1px 2px rgba(0,0,0,0.28)";

  const open = document.createElement("span");
  open.id = "playerStateBadgeOpenRiichi";
  open.textContent = "オープン";
  open.style.display = "none";
  open.style.padding = "4px 12px";
  open.style.borderRadius = "999px";
  open.style.fontSize = "14px";
  open.style.fontWeight = "900";
  open.style.letterSpacing = "0.04em";
  open.style.lineHeight = "1.2";
  open.style.opacity = "0.9";
  open.style.border = "1px solid rgba(255,255,255,0.18)";
  open.style.background =
    "linear-gradient(180deg, rgba(16,38,84,0.92) 0%, rgba(8,20,48,0.90) 100%)";
  open.style.color = "rgba(236,245,255,0.98)";
  open.style.boxShadow =
    "0 10px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)";
  open.style.backdropFilter = "blur(6px)";
  open.style.webkitBackdropFilter = "blur(6px)";
  open.style.textShadow = "0 1px 2px rgba(0,0,0,0.28)";

  wrap.appendChild(furiten);
  wrap.appendChild(open);
  document.body.appendChild(wrap);
  return wrap;
}

function setNativeFuritenBadgeSuppressed(suppressed){
  const nativeBadge = document.getElementById("furitenBadge");
  if (!nativeBadge) return;

  if (suppressed){
    nativeBadge.style.setProperty("display", "none", "important");
    nativeBadge.style.setProperty("opacity", "0", "important");
    nativeBadge.style.setProperty("visibility", "hidden", "important");
    nativeBadge.style.setProperty("pointer-events", "none", "important");
    nativeBadge.style.setProperty("left", "-9999px", "important");
    nativeBadge.style.setProperty("top", "-9999px", "important");
  } else {
    nativeBadge.style.removeProperty("display");
    nativeBadge.style.removeProperty("opacity");
    nativeBadge.style.removeProperty("visibility");
    nativeBadge.style.removeProperty("pointer-events");
    nativeBadge.style.removeProperty("left");
    nativeBadge.style.removeProperty("top");
  }
}

function forceHideNativeFuritenBadgeNow(){
  try{
    setNativeFuritenBadgeSuppressed(true);
  }catch(e){}
}

function isPlayerFuritenNowForStateBadge(){
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

function positionPlayerStateBadgeGroup(wrap){
  const handEl = getHandElForPlayerStateBadges();
  if (!handEl || !handEl.isConnected) return false;

  const rect = handEl.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;

  const x = Math.round(rect.left + (rect.width / 2));
  const y = Math.max(10, Math.round(rect.top - 10));

  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;
  wrap.style.transform = "translate(-50%, -100%)";
  return true;
}

function updateCombinedPlayerStateBadges(){
  const wrap = ensurePlayerStateBadgeGroup();
  if (!wrap) return;

  const furitenBadge = document.getElementById("playerStateBadgeFuriten");
  const openBadge = document.getElementById("playerStateBadgeOpenRiichi");
  if (!furitenBadge || !openBadge) return;

  const furitenNow = !isEnded && isPlayerFuritenNowForStateBadge();
  const openNow =
    !isEnded &&
    !!isRiichi &&
    (typeof isPlayerOpenRiichiActive === "function") &&
    isPlayerOpenRiichiActive();

  furitenBadge.style.display = furitenNow ? "inline-block" : "none";
  openBadge.style.display = openNow ? "inline-block" : "none";

  if (!furitenNow && !openNow){
    wrap.style.display = "none";
    setNativeFuritenBadgeSuppressed(false);
    return;
  }

  if (!positionPlayerStateBadgeGroup(wrap)){
    wrap.style.display = "none";
    setNativeFuritenBadgeSuppressed(false);
    return;
  }

  wrap.style.display = "inline-flex";
  setNativeFuritenBadgeSuppressed(furitenNow || openNow);
}

function updatePlayerOpenRiichiBadgeView(){
  if (riichiBadge){
    riichiBadge.textContent = "リーチ";
    riichiBadge.style.letterSpacing = "";
    riichiBadge.style.fontWeight = "";
  }

  updateCombinedPlayerStateBadges();
}

if (typeof window !== "undefined" && !window.__playerStateBadgeGroupResizeHookInstalled){
  window.__playerStateBadgeGroupResizeHookInstalled = true;
  window.addEventListener("resize", ()=>{
    try{ updateCombinedPlayerStateBadges(); }catch(e){}
  }, { passive: true });
  window.addEventListener("scroll", ()=>{
    try{ updateCombinedPlayerStateBadges(); }catch(e){}
  }, { passive: true });
}

if (typeof window !== "undefined" && !window.__nativeFuritenBadgeSuppressorInstalled){
  window.__nativeFuritenBadgeSuppressorInstalled = true;

  const rerunNativeFuritenBadgeSuppress = ()=>{
    try{ forceHideNativeFuritenBadgeNow(); }catch(e){}
  };

  if (typeof MutationObserver !== "undefined"){
    const bootObserver = ()=>{
      try{
        const root = document.documentElement || document.body;
        if (!root) return;
        const observer = new MutationObserver(()=>{
          rerunNativeFuritenBadgeSuppress();
        });
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["style", "class"]
        });
      }catch(e){}
    };

    if (document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", bootObserver, { once: true });
    } else {
      bootObserver();
    }
  }

  setInterval(rerunNativeFuritenBadgeSuppress, 50);
}

function updateActionButtons(){
  const riichiCancelBtn = getRiichiCancelBtnEl();
  const openRiichiBtn = ensureOpenRiichiBtnEl();
  const isRiichiTypeSelecting = (typeof isRiichiTypeSelectingActive === "function") && isRiichiTypeSelectingActive();
  const inCall = (typeof pendingCall !== "undefined" && !!pendingCall);
  const canPon = inCall ? !!pendingCall.canPon : false;
  const canRon = inCall ? !!pendingCall.canRon : false;
  const canMinkan = inCall ? !!pendingCall.canMinkan : false;

  // 鳴き応答中：押せるものだけ1行で出す
  if (inCall){
    const callAiControlling = !!(pendingCall && pendingCall.aiControlled);
    const canPass = (!callAiControlling) && (
      (typeof canChoosePassOnCurrentCall === "function")
        ? !!canChoosePassOnCurrentCall()
        : true
    );

    setActionButtonState(ronBtn, !callAiControlling && canRon, !callAiControlling && canRon);
    setActionButtonState(ponBtn, !callAiControlling && canPon, !callAiControlling && canPon);
    setActionButtonState(kanBtn, !callAiControlling && canMinkan, !callAiControlling && canMinkan);
    setActionButtonState(passBtn, canPass, canPass);

    setActionButtonState(peiBtn, false, false);
    if (riichiBtn) riichiBtn.textContent = "リーチ";
    setActionButtonState(riichiBtn, false, false);
    setActionButtonState(openRiichiBtn, false, false);
    setActionButtonState(riichiCancelBtn, false, false);
    setActionButtonState(tsumoBtn, false, false);
    setActionButtonState(kyuushuBtn, false, false);

    refreshActionbarVisibility();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ リーチ選択中はキャンセルだけ出す
  if (isRiichiSelecting){
    if (riichiBtn) riichiBtn.textContent = "リーチ";
    setActionButtonState(openRiichiBtn, false, false);
    setActionButtonState(riichiCancelBtn, true, true);
    setActionButtonState(peiBtn, false, false);
    setActionButtonState(ponBtn, false, false);
    setActionButtonState(kanBtn, false, false);
    setActionButtonState(passBtn, false, false);
    setActionButtonState(riichiBtn, false, false);
    setActionButtonState(ronBtn, false, false);
    setActionButtonState(tsumoBtn, false, false);
    setActionButtonState(kyuushuBtn, false, false);

    refreshActionbarVisibility();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ 自分のターン以外は全部隠す
  const isMyTurn = (typeof isPlayerTurn === "function") && isPlayerTurn();
  if (!isMyTurn){
    hideAllActionButtons();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ ポン後の「ツモ無し打牌待ち」中は、切る以外のボタンを出さない
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall){
    hideAllActionButtons();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  const canTsumo = canTsumoAgariNow();
  const specialAiControlling = (typeof isPlayerSpecialAiEnabled === "function") && isPlayerSpecialAiEnabled();
  const riichiTsumoChoiceLocked = isPlayerRiichiTsumoChoiceLocked();

  if (riichiTsumoChoiceLocked){
    setActionButtonState(tsumoBtn, !specialAiControlling && canTsumo, !specialAiControlling && canTsumo);
    setActionButtonState(passBtn, !specialAiControlling, !specialAiControlling);

    setActionButtonState(peiBtn, false, false);
    setActionButtonState(ponBtn, false, false);
    setActionButtonState(kanBtn, false, false);
    if (riichiBtn) riichiBtn.textContent = "リーチ";
    setActionButtonState(riichiBtn, false, false);
    setActionButtonState(openRiichiBtn, false, false);
    setActionButtonState(riichiCancelBtn, false, false);
    setActionButtonState(ronBtn, false, false);
    setActionButtonState(kyuushuBtn, false, false);

    refreshActionbarVisibility();

    if (riichiBadge) riichiBadge.style.display = isRiichi ? "inline-block" : "none";
    if (riichiPickBadge) riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
    return;
  }

  // ★ 暗槓だけならリーチ可
  const hasOpenMeld = hasRiichiBlockingOpenMeld();
  const blockedByFuritenRiichiRule =
    (typeof isFuritenRiichiEnabled === "function") &&
    (typeof isPlayerFuritenNowForRiichi === "function") &&
    (!isFuritenRiichiEnabled()) &&
    !!isPlayerFuritenNowForRiichi();

  // ★ アガリ形(-1)でも「捨ててテンパイ維持できる」ならリーチボタンを押せる
  const canRiichi =
    (!isEnded &&
     !isRiichi &&
     !isRiichiSelecting &&
     !hasOpenMeld &&
     !blockedByFuritenRiichiRule &&
     (typeof hasEnoughWallForRiichiDeclaration === "function" ? hasEnoughWallForRiichiDeclaration() : true) &&
     hasRiichiDiscardCandidateNow());

  kanTargetCode = findQuadTargetCode();

  const allowSpecial =
    (!isEnded) &&
    (
      (!isRiichi && !isRiichiSelecting) ||
      (isRiichi && riichiWait)
    );

  const kakanTargetCode = findKakanTargetCode();

  // =========================================================
  // ★ カン可否
  // - 通常：暗槓 or 加槓 があればOK
  // - リーチ中：
  //    ・riichiWait のときのみ候補
  //    ・暗槓は「待ち不変 + おくりカン禁止（drawnが4枚目）」のみOK
  //    ・加槓は不可（そもそもリーチ後は鳴けない前提）
  // =========================================================
  let canKan = false;
  if (allowSpecial){
    // 加槓（リーチ中は不可）
    if (!isRiichi && !!kakanTargetCode){
      canKan = true;
    }

    // 暗槓
    if (!canKan && !!kanTargetCode){
      if (isRiichi){
        if (typeof canRiichiAnkanNow === "function"){
          canKan = !!canRiichiAnkanNow(kanTargetCode);
        } else {
          canKan = false;
        }
      } else {
        canKan = true;
      }
    }
  }

  const canPei = allowSpecial && hasNorthInHand();
  const canKyuushu = !specialAiControlling && (typeof canDeclareKyuushuKyuuhaiNow === "function") && canDeclareKyuushuKyuuhaiNow();

  const canOpenRiichi =
    (!specialAiControlling) &&
    canRiichi &&
    shouldEnableOpenRiichiButtonNow();

  setActionButtonState(tsumoBtn, !specialAiControlling && canTsumo, !specialAiControlling && canTsumo);
  if (riichiBtn) riichiBtn.textContent = "リーチ";
  setActionButtonState(openRiichiBtn, canOpenRiichi, canOpenRiichi);
  setActionButtonState(riichiBtn, !specialAiControlling && canRiichi, !specialAiControlling && canRiichi);
  setActionButtonState(riichiCancelBtn, false, false);
  setActionButtonState(kanBtn, canKan, canKan);
  setActionButtonState(peiBtn, !specialAiControlling && canPei, !specialAiControlling && canPei);
  setActionButtonState(kyuushuBtn, canKyuushu, canKyuushu);

  setActionButtonState(ronBtn, false, false);
  setActionButtonState(ponBtn, false, false);
  setActionButtonState(passBtn, false, false);

  refreshActionbarVisibility();

  updatePlayerOpenRiichiBadgeView();
  if (riichiBadge){
    riichiBadge.style.display = isRiichi ? "inline-block" : "none";
  }
  if (riichiPickBadge){
    riichiPickBadge.textContent = "牌選択";
    riichiPickBadge.style.display = isRiichiSelecting ? "inline-block" : "none";
  }
}

// ========= 手牌描画 =========
function renderHand(){
  if (!handEl) return;

  handEl.innerHTML = "";

  // ==================================================
  // ★ 旧方式へ復元（あなたが貼った昔のrenderの方式）
  //
  // ・基準中心は hand13（drawn除外）の枚数で固定
  // ・row の margin-left を calc(50% - 中心px) にして、
  //   drawn が来ても「13枚の中心」が動かないようにする
  // ・newTile / blink を isNew で付ける（ハイライト復活）
  // ==================================================

  // handEl 自体は flex 中央寄せ等のCSSがあっても、
  // 旧方式は handEl の中に row を1個置く運用なので、
  // 念のため左詰めにして row の margin-left が効くように寄せる。
  handEl.style.justifyContent = "flex-start";
  handEl.style.paddingRight = "0px";

  // 中央基準（drawn除外）
  const baseCount = Array.isArray(hand13) ? hand13.length : 0;

  // タイル幅を“できる範囲で”動的に取る（取れなければ昔の54）
  // ※ CSSで img の width が固定されていれば offsetWidth で取れる
  let TILE_W = 54;
  try{
    if (hand13 && hand13.length > 0){
      const tmp = makeTileImg(hand13[0]);
      tmp.style.visibility = "hidden";
      tmp.style.position = "absolute";
      tmp.style.left = "-9999px";
      tmp.style.top = "-9999px";
      handEl.appendChild(tmp);
      const w = tmp.offsetWidth;
      tmp.remove();
      if (w && w > 0) TILE_W = w;
    }
  }catch(e){}

  const GAP = 2;
  const unit = TILE_W + GAP;

  // 昔の計算を踏襲
  const leftCount = (baseCount % 2 === 1) ? Math.floor((baseCount - 1) / 2) : (baseCount / 2);
  const centerInRow = (baseCount % 2 === 1)
    ? (leftCount * unit + TILE_W / 2)
    : (leftCount * unit - GAP / 2);

  const row = document.createElement("div");
  row.className = "handRow";
  row.style.display = "flex";
  row.style.gap = `${GAP}px`;
  row.style.alignItems = "center";
  row.style.flexWrap = "nowrap";

  // ★ 中央基準は baseCount（drawn除外）で固定
  row.style.marginLeft = `calc(50% - ${centerInRow}px)`;

  // 13枚
  for (let i = 0; i < hand13.length; i++){
    const t = hand13[i];
    const img = makeTileImg(t);

    // 旧方式：isNew で点滅（800msでblink解除）
    if (t && t.isNew){
      img.classList.add("newTile", "blink");
      setTimeout(()=>{ try{ img.classList.remove("blink"); }catch(e){} }, 800);
    }

    // 選択状態（1回目タップ/クリックで浮かせる）
    if (t && typeof isSelectedTile === "function" && isSelectedTile(t.id, false)){
      img.classList.add("selectedTile");
    }

    // リーチ選択中の候補ハイライト
    if (isRiichiSelecting && riichiCandidates && t){
      const key = "H:" + t.id;
      if (riichiCandidates.has(key)) img.classList.add("riichiPick");
      else img.classList.add("riichiDim");
    }

    // click / tap（1回目で選択、2回目で打牌）
    img.addEventListener("click", ()=>{
      if (typeof pressPlayerHandTile !== "function"){
        queueDiscardAfterImmediateButtonOff(()=>{
          discardFromHand13(i);
        });
        return;
      }

      const result = pressPlayerHandTile(i);
      if (!result || result.type === "ignored") return;

      if (result.type === "selected"){
        if (typeof render === "function") render();
        return;
      }

      if (result.type === "discardHand"){
        queueDiscardAfterImmediateButtonOff(()=>{
          discardFromHand13(i);
        });
      }
    });

    row.appendChild(img);
  }

  // ツモ牌（右端に付け足す：中央基準は動かさない）
  if (drawn){
    const img = makeTileImg(drawn);
    img.classList.add("drawnTile");

    if (drawn.isNew){
      img.classList.add("newTile", "blink");
      setTimeout(()=>{ try{ img.classList.remove("blink"); }catch(e){} }, 800);
    }

    if (typeof isSelectedTile === "function" && isSelectedTile(drawn.id, true)){
      img.classList.add("selectedTile");
    }

    if (isRiichiSelecting && riichiCandidates){
      const key = "D:" + drawn.id;
      if (riichiCandidates.has(key)) img.classList.add("riichiPick");
      else img.classList.add("riichiDim");
    }

    img.addEventListener("click", ()=>{
      if (typeof pressPlayerDrawnTile !== "function"){
        queueDiscardAfterImmediateButtonOff(()=>{
          discardDrawn();
        });
        return;
      }

      const result = pressPlayerDrawnTile();
      if (!result || result.type === "ignored") return;

      if (result.type === "selected"){
        if (typeof render === "function") render();
        return;
      }

      if (result.type === "discardDrawn"){
        queueDiscardAfterImmediateButtonOff(()=>{
          discardDrawn();
        });
      }
    });

    row.appendChild(img);
  }

  handEl.appendChild(row);
}

// ========= 河描画 =========
function renderRiver(){
  if (!riverEl) return;

  riverEl.innerHTML = "";

  const declareId =
    (typeof getPlayerRiichiDisplayTileId === "function")
      ? getPlayerRiichiDisplayTileId()
      : null;

  for (const t of river){
    const img = makeTileImg(t);
    if (t && t.id === declareId){
      img.classList.add("riichiDeclare");
    }
    riverEl.appendChild(img);
  }
}

// ========= 全体描画 =========
function render(){
  try{
    renderHand();
    renderRiver();

    // 右エリア（副露/北）
    if (typeof renderRight === "function") renderRight();
    else {
      if (typeof renderPeis === "function") renderPeis();
      if (typeof renderMelds === "function") renderMelds();
    }

    // CPU
    if (typeof renderCpu === "function") renderCpu();
    else {
      if (typeof renderCpuHands === "function") renderCpuHands();
      if (typeof renderCpuRivers === "function") renderCpuRivers();
    }

    // 中央UI（DOM確保→更新）
    if (typeof ensureCenterUi === "function") ensureCenterUi();
    if (typeof renderCenterUi === "function") renderCenterUi();

    // ★ stats はデフォルト表示（ホバー時は内容を切り替える）
    if (typeof updateStatsDefault === "function") updateStatsDefault();

    // アクションボタン
    updateActionButtons();

  }catch(err){
    if (typeof showFatalError === "function") showFatalError(err, "render()");
  }
}
