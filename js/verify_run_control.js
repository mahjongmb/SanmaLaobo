// ============================================================
// verify_run_control.js
// 検証モードの高速/超高速モード中に CPU/自分打牌の自動進行を
// 一時停止/再開できる機能。画面右上にトグルボタンを表示する。
//
// 責務:
//  - 停止フラグの管理
//  - 停止中に await できる waitWhileVerifyRunPaused() の提供
//  - 再開時にコールバック発火する onVerifyRunResumed() の提供
//  - 検証モード＋高速/超高速モード時のみ表示される右上ボタンの描画
// 依存:
//  - window.isVerifyFastModeEnabled (main.js)
//  - window.getVerifyFastModeLevel (main.js)
//  - イベント "mbsanma:game-speed-changed" (main.js からディスパッチ)
// 非依存（参照する側で typeof ガード推奨）:
//  - turn.js / app_play_ui.js が waitWhileVerifyRunPaused / onVerifyRunResumed を利用
// ============================================================

(function(){
  "use strict";

  let verifyRunPaused = false;
  const pauseWaiters = [];        // Promise resolve を溜める（waitWhileVerifyRunPaused）
  const resumedCallbacks = [];    // 再開時に一度だけ呼ぶコールバック

  function isVerifyRunPaused(){
    return verifyRunPaused;
  }

  function flushResumed(){
    while (pauseWaiters.length){
      const resolve = pauseWaiters.shift();
      try{ resolve(); }catch(e){}
    }
    while (resumedCallbacks.length){
      const cb = resumedCallbacks.shift();
      try{ cb(); }catch(e){}
    }
  }

  function setVerifyRunPaused(value){
    const next = !!value;
    if (verifyRunPaused === next) return verifyRunPaused;
    verifyRunPaused = next;

    if (!verifyRunPaused){
      flushResumed();
    }

    try{
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function"){
        window.dispatchEvent(new CustomEvent("mbsanma:verify-pause-changed", {
          detail: { paused: verifyRunPaused }
        }));
      }
    }catch(e){}

    return verifyRunPaused;
  }

  function toggleVerifyRunPause(){
    return setVerifyRunPaused(!verifyRunPaused);
  }

  function waitWhileVerifyRunPaused(){
    if (!verifyRunPaused) return Promise.resolve();
    return new Promise((resolve)=>{ pauseWaiters.push(resolve); });
  }

  function onVerifyRunResumed(callback){
    if (typeof callback !== "function") return;
    if (!verifyRunPaused){
      try{ callback(); }catch(e){}
      return;
    }
    resumedCallbacks.push(callback);
  }

  // ============================================================
  // UI: 右上トグルボタン
  // ============================================================

  const BUTTON_ID = "verifyRunPauseBtn";

  function shouldShowPauseButton(){
    try{
      if (typeof window.isVerifyFastModeEnabled === "function"){
        return !!window.isVerifyFastModeEnabled();
      }
    }catch(e){}
    return false;
  }

  function applyButtonStyle(btn, paused){
    if (!btn) return;
    btn.style.position = "fixed";
    btn.style.top = "10px";
    btn.style.right = "10px";
    btn.style.zIndex = "2147483000";
    btn.style.padding = "8px 14px";
    btn.style.minWidth = "96px";
    btn.style.border = "1px solid rgba(255, 248, 230, 0.28)";
    btn.style.borderRadius = "10px";
    btn.style.color = "#fbf6e7";
    btn.style.fontFamily = "inherit";
    btn.style.fontSize = "13px";
    btn.style.fontWeight = "600";
    btn.style.letterSpacing = "0.04em";
    btn.style.cursor = "pointer";
    btn.style.userSelect = "none";
    btn.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.42)";
    btn.style.backdropFilter = "blur(6px)";
    btn.style.webkitBackdropFilter = "blur(6px)";

    if (paused){
      btn.style.background =
        "linear-gradient(180deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.06) 100%), " +
        "linear-gradient(135deg, rgba(84, 128, 76, 0.96) 0%, rgba(46, 78, 42, 0.96) 100%)";
      btn.style.borderColor = "rgba(200, 240, 180, 0.55)";
    } else {
      btn.style.background =
        "linear-gradient(180deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 100%), " +
        "linear-gradient(135deg, rgba(25, 37, 31, 0.94) 0%, rgba(10, 15, 13, 0.96) 100%)";
      btn.style.borderColor = "rgba(255, 248, 230, 0.28)";
    }
  }

  function ensureButtonEl(){
    let btn = document.getElementById(BUTTON_ID);
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", "検証モード一時停止/再開");
    btn.addEventListener("click", (ev)=>{
      try{
        ev.preventDefault();
        ev.stopPropagation();
      }catch(e){}
      toggleVerifyRunPause();
    });
    if (document.body){
      document.body.appendChild(btn);
    }
    return btn;
  }

  function removeButtonEl(){
    const btn = document.getElementById(BUTTON_ID);
    if (btn && btn.parentNode){
      btn.parentNode.removeChild(btn);
    }
  }

  function updatePauseButton(){
    if (!shouldShowPauseButton()){
      removeButtonEl();
      // 検証モード外/高速OFFに戻った時は勝手に停止解除する（タイマー復帰のため）
      if (verifyRunPaused) setVerifyRunPaused(false);
      return;
    }

    if (!document.body){
      // body 未生成時はリトライ（ごく稀）
      setTimeout(updatePauseButton, 50);
      return;
    }

    const btn = ensureButtonEl();
    btn.textContent = verifyRunPaused ? "▶ 再開" : "⏸ 一時停止";
    applyButtonStyle(btn, verifyRunPaused);
  }

  // ============================================================
  // window へ公開
  // ============================================================

  try{
    if (typeof window !== "undefined"){
      window.isVerifyRunPaused = isVerifyRunPaused;
      window.setVerifyRunPaused = setVerifyRunPaused;
      window.toggleVerifyRunPause = toggleVerifyRunPause;
      window.waitWhileVerifyRunPaused = waitWhileVerifyRunPaused;
      window.onVerifyRunResumed = onVerifyRunResumed;

      window.addEventListener("mbsanma:verify-pause-changed", updatePauseButton);
      window.addEventListener("mbsanma:game-speed-changed", updatePauseButton);

      if (document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", updatePauseButton);
      } else {
        updatePauseButton();
      }
    }
  }catch(e){}
})();
