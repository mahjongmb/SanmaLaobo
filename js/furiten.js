// MBsanma/js/furiten.js
// ========= furiten.js（フリテン管理：既存ファイル無改造で後付け） =========
//
// 目的：既存の call.js / core.js / turn.js / render.js / main.js を編集せずに、フリテンを“後から”導入する。
// 手段：グローバル関数をラップして挙動を差し込む（canRonOn / choosePass / drawOne / render / startNewKyoku等）。
//
// 対応範囲
// - 河フリテン：自分の河に「現在の待ち牌」が1枚でもあればロン不可
// - 見逃し一時フリテン：鳴き画面で「ロン可能なのにスキップした」→ temp=true
//   解除：次に“自分がツモる”タイミングで temp=false
// - ★追加仕様：リーチ後に限り、見逃したら局終了まで temp を解除しない（永久フリテン）
//
// UI
// - フリテン状態のとき、手牌の中央上に「フリテン」と表示する
//   ★ actionbar やボタン配置に依存しないよう、body直下 fixed で追従させる
//
// 注意：このファイルは “他のJSより後” に読み込むこと（index.htmlで一番最後）

(function(){
  "use strict";

  // =========================================================
  // グローバル置き場（デバッグ用に見えるように）
  // =========================================================
  const F = {
    enabled: true,

    // 見逃しフリテン
    temp: false,

    // ★ リーチ後の見逃しは「局終了まで解除しない」
    tempPermanent: false,

    // 直近で temp を立てた理由（任意）
    lastMissed: null, // { code, at: Date.now(), from, riichi }

    // 河フリテン判定のキャッシュ（軽量化）
    _cacheKey: null,
    _cacheMachi: null,

    // UI
    _badgeEl: null,

    // ログ出したい時だけ true
    debug: false
  };

  try{ window.furiten = F; }catch(e){}

  function log(){
    if (!F.debug) return;
    try{ console.log("[furiten]", ...arguments); }catch(e){}
  }

  // =========================================================
  // ヘルパ
  // =========================================================
  function safeArray(x){ return Array.isArray(x) ? x : []; }

  function countsFromTilesLocal(tiles){
    if (typeof countsFromTiles === "function"){
      return countsFromTiles(tiles);
    }

    const types = (typeof TILE_TYPES !== "undefined" && Array.isArray(TILE_TYPES)) ? TILE_TYPES : [];
    const map = (typeof TYPE_TO_IDX !== "undefined" && TYPE_TO_IDX) ? TYPE_TO_IDX : null;
    const c = Array(types.length).fill(0);
    if (!map) return c;

    for (const t of tiles){
      const code = t && t.code;
      const idx = map[code];
      if (idx !== undefined) c[idx]++;
    }
    return c;
  }

  function calcShantenSafe(counts, fixedM){
    if (typeof calcShanten !== "function") return 99;
    try{
      return calcShanten(counts, fixedM);
    }catch(e){
      return 99;
    }
  }

  function makeKeyForMachi(){
    const h = safeArray(hand13).map(t=>t.code).sort().join(",");
    const m = safeArray(melds).length;
    const rlen = safeArray(river).length;
    return `H:${h}|M:${m}|R:${rlen}`;
  }

  // =========================================================
  // 待ち集合（ロン前提：hand13 + 1枚でアガリになる牌）
  // =========================================================
  function getRonMachiCodes(){
    const types = (typeof TILE_TYPES !== "undefined" && Array.isArray(TILE_TYPES)) ? TILE_TYPES : null;
    if (!types) return [];

    const base = safeArray(hand13);
    if (base.length === 0) return [];

    const fixedM = safeArray(melds).length;

    const key = makeKeyForMachi();
    if (F._cacheKey === key && Array.isArray(F._cacheMachi)){
      return F._cacheMachi;
    }

    const set = new Set();
    for (const code of types){
      const tiles14 = base.slice();
      tiles14.push({ code });

      const sh = calcShantenSafe(countsFromTilesLocal(tiles14), fixedM);
      if (sh === -1) set.add(code);
    }

    const arr = Array.from(set);
    F._cacheKey = key;
    F._cacheMachi = arr;
    return arr;
  }

  function isRiverFuritenNow(){
    const rv = safeArray(river);
    if (rv.length === 0) return false;

    const machi = getRonMachiCodes();
    if (!machi || machi.length === 0) return false;

    const s = new Set(machi);
    for (const t of rv){
      if (t && s.has(t.code)) return true;
    }
    return false;
  }

  function getRuleValueForFuriten(key, fallback){
    try{
      if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
        return window.MBSanmaRulesConfig.getValue(key, fallback);
      }
    }catch(e){}
    return fallback;
  }

  function isRiichiSkipEnabledForFuriten(){
    return String(getRuleValueForFuriten("basic-riichi-skip", "on") || "").toLowerCase() !== "off";
  }

  function isFuritenNow(){
    if (!F.enabled) return false;
    if (F.temp) return true;
    if (isRiverFuritenNow()) return true;
    return false;
  }

  // =========================================================
  // UI：手牌中央上「フリテン」バッジ（レイアウト非参加）
  // =========================================================
  function getHandWrapEl(){
    return document.querySelector(".hand-wrap");
  }

  function getHandEl(){
    return document.getElementById("hand");
  }

  function getHandRowEl(){
    const handEl = getHandEl();
    if (!handEl) return null;
    return handEl.querySelector(".handRow");
  }

  function ensureFuritenBadge(){
    if (F._badgeEl && F._badgeEl.isConnected) return F._badgeEl;

    const badge = document.createElement("span");
    badge.id = "furitenBadge";
    badge.textContent = "フリテン";

    badge.style.position = "fixed";
    badge.style.left = "-9999px";
    badge.style.top  = "-9999px";
    badge.style.zIndex = "9999";

    badge.style.display = "none";
    badge.style.padding = "4px 12px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "14px";
    badge.style.fontWeight = "900";
    badge.style.letterSpacing = "0.04em";
    badge.style.lineHeight = "1.2";
    badge.style.opacity = "0.9";
    badge.style.userSelect = "none";
    badge.style.pointerEvents = "none";
    badge.style.whiteSpace = "nowrap";

    badge.style.border = "1px solid rgba(255,255,255,0.18)";
    badge.style.background =
      "linear-gradient(180deg, rgba(66,16,24,0.92) 0%, rgba(36,8,14,0.90) 100%)";
    badge.style.color = "rgba(255,238,242,0.98)";
    badge.style.boxShadow =
      "0 10px 20px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)";
    badge.style.backdropFilter = "blur(6px)";
    badge.style.webkitBackdropFilter = "blur(6px)";
    badge.style.textShadow = "0 1px 2px rgba(0,0,0,0.28)";

    document.body.appendChild(badge);
    F._badgeEl = badge;
    return badge;
  }

  function positionBadgeAboveHandCenter(badge){
    const rowEl = getHandRowEl();
    const handEl = getHandEl();
    const wrapEl = getHandWrapEl();

    const anchorEl = rowEl || handEl || wrapEl;
    if (!anchorEl || !anchorEl.isConnected) return false;

    const r = anchorEl.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return false;

    const x = Math.round(r.left + (r.width / 2));
    const y = Math.max(10, Math.round(r.top - 10));

    badge.style.left = `${x}px`;
    badge.style.top  = `${y}px`;
    badge.style.transform = "translate(-50%, -100%)";
    return true;
  }

  function updateFuritenBadge(){
    try{
      const badge = ensureFuritenBadge();
      if (!badge) return;

      const on = isFuritenNow();
      if (!on){
        badge.style.display = "none";
        return;
      }

      if (!positionBadgeAboveHandCenter(badge)){
        badge.style.display = "none";
        return;
      }

      badge.style.display = "inline-block";
    }catch(e){}
  }

  // =========================================================
  // 局開始/リセットでフリテン状態をクリア
  // =========================================================
  function resetFuritenState(reason){
    try{
      F.temp = false;
      F.tempPermanent = false;
      F.lastMissed = null;
      F._cacheKey = null;
      F._cacheMachi = null;
      log("reset", reason || "");
      updateFuritenBadge();
    }catch(e){}
  }

  // =========================================================
  // パッチ群
  // =========================================================
  function patchCanRonOn(){
    if (typeof canRonOn !== "function") return false;
    if (canRonOn.__furiten_patched__) return true;

    const orig = canRonOn;

    function wrapped(tile){
      try{
        if (isFuritenNow()) return false;
      }catch(e){}
      try{
        return orig(tile);
      }catch(e){
        try{ if (typeof showFatalError === "function") showFatalError(e, "furiten:canRonOn"); }catch(_e){}
        return false;
      }
    }

    wrapped.__furiten_patched__ = true;
    wrapped.__furiten_orig__ = orig;

    try{ window.canRonOn = wrapped; }catch(e){}
    try{ canRonOn = wrapped; }catch(e){} // eslint-disable-line no-global-assign
    return true;
  }

  // ★スキップ見逃し → temp。リーチ中は永久（局終了まで解除しない）
  function patchChoosePass(){
    if (typeof choosePass !== "function") return false;
    if (choosePass.__furiten_patched__) return true;

    const orig = choosePass;

    function wrapped(){
      try{
        if (F.enabled && typeof pendingCall !== "undefined" && pendingCall && pendingCall.canRon){
          const riichiNow = (typeof isRiichi !== "undefined" && !!isRiichi);

          F.temp = true;
          if (riichiNow && isRiichiSkipEnabledForFuriten()) F.tempPermanent = true;

          F.lastMissed = {
            code: pendingCall.code || null,
            from: pendingCall.from || null,
            at: Date.now(),
            riichi: riichiNow
          };
          updateFuritenBadge();
        }
      }catch(e){}

      try{
        return orig();
      }catch(e){
        try{ if (typeof showFatalError === "function") showFatalError(e, "furiten:choosePass"); }catch(_e){}
        return;
      }
    }

    wrapped.__furiten_patched__ = true;
    wrapped.__furiten_orig__ = orig;

    try{ window.choosePass = wrapped; }catch(e){}
    try{ choosePass = wrapped; }catch(e){} // eslint-disable-line no-global-assign
    return true;
  }

  // ★次ツモで解除（ただし永久/リーチ中は解除しない）
  function patchDrawOne(){
    if (typeof drawOne !== "function") return false;
    if (drawOne.__furiten_patched__) return true;

    const orig = drawOne;

    function wrapped(){
      try{
        if (F.enabled && F.temp){
          if (typeof currentTurnSeatIndex !== "undefined" && currentTurnSeatIndex === 0){
            const riichiNow = (typeof isRiichi !== "undefined" && !!isRiichi);
            if (!F.tempPermanent && !riichiNow){
              F.temp = false;
            }
            updateFuritenBadge();
          }
        }
      }catch(e){}

      try{
        return orig();
      }catch(e){
        try{ if (typeof showFatalError === "function") showFatalError(e, "furiten:drawOne"); }catch(_e){}
        return null;
      }
    }

    wrapped.__furiten_patched__ = true;
    wrapped.__furiten_orig__ = orig;

    try{ window.drawOne = wrapped; }catch(e){}
    try{ drawOne = wrapped; }catch(e){} // eslint-disable-line no-global-assign
    return true;
  }

  // render後にバッジ更新。局終了なら（次局持ち越し防止で）クリア
  function patchRender(){
    if (typeof render !== "function") return false;
    if (render.__furiten_patched__) return true;

    const orig = render;

    function wrapped(){
      let ret;
      try{
        ret = orig();
      }catch(e){
        try{ if (typeof showFatalError === "function") showFatalError(e, "furiten:render(orig)"); }catch(_e){}
      }

      try{
        if (typeof isEnded !== "undefined" && isEnded){
          if (F.temp || F.tempPermanent){
            resetFuritenState("isEnded");
          }
        }
      }catch(e){}

      try{ updateFuritenBadge(); }catch(e){}
      return ret;
    }

    wrapped.__furiten_patched__ = true;
    wrapped.__furiten_orig__ = orig;

    try{ window.render = wrapped; }catch(e){}
    try{ render = wrapped; }catch(e){} // eslint-disable-line no-global-assign
    return true;
  }

  // main.js の入口をラップして局切替時に必ずクリア
  function patchFnClearOnCall(fnName){
    try{
      const fn = window[fnName];
      if (typeof fn !== "function") return false;
      if (fn.__furiten_patched__) return true;

      const orig = fn;
      function wrapped(){
        resetFuritenState(fnName);
        try{
          return orig.apply(this, arguments);
        }catch(e){
          try{ if (typeof showFatalError === "function") showFatalError(e, `furiten:${fnName}`); }catch(_e){}
        }
      }

      wrapped.__furiten_patched__ = true;
      wrapped.__furiten_orig__ = orig;
      window[fnName] = wrapped;
      return true;
    }catch(e){
      return false;
    }
  }

  function tryPatchAll(){
    patchCanRonOn();
    patchChoosePass();
    patchDrawOne();
    patchRender();

    patchFnClearOnCall("startNewKyoku");
    patchFnClearOnCall("doReset");
    patchFnClearOnCall("startNewHanchan");
    patchFnClearOnCall("startNextKyoku");

    try{ ensureFuritenBadge(); }catch(e){}
    try{ updateFuritenBadge(); }catch(e){}

    try{
      F.isFuritenNow = isFuritenNow;
      F.isRiverFuritenNow = isRiverFuritenNow;
      F.isRiichiSkipEnabled = isRiichiSkipEnabledForFuriten;
    }catch(e){}
  }

  function boot(){
    // 即時
    tryPatchAll();

    // 読み込み順が前でも追いつけるよう再試行（軽量）
    let tries = 0;
    const t = setInterval(()=>{
      tries++;
      tryPatchAll();
      if (tries >= 50) clearInterval(t);
    }, 50);

    // renderが呼ばれない局面でも追従
    setInterval(()=>{ try{ updateFuritenBadge(); }catch(e){} }, 250);

    window.addEventListener("resize", ()=>{ try{ updateFuritenBadge(); }catch(e){} }, { passive:true });
    window.addEventListener("scroll",  ()=>{ try{ updateFuritenBadge(); }catch(e){} }, { passive:true });
  }

  boot();

})();