// MBsanma/js/doubleRonOverlayPatch.js
// ========= doubleRonOverlayPatch.js（ダブロン演出/結果順番表示パッチ） =========
// 役割：
// - ダブロン時、ロン演出を同時表示せず順番に1人ずつ表示する
// - 全員分のロン演出が終わったら、結果画面は先頭ロン者から順番に表示する
// - 全員分の結果画面が終わってから、従来どおり次局処理へ進める
//
// 注意：
// - 既存の actions.js / main.js / turn2.js / result.js を直接壊さず後付けで差し込む
// - render.js は描画専用のまま
// - 状態変更は既存のキュー API を使う

(function(){
  "use strict";

  function getQueue(){
    try{
      if (typeof window !== "undefined" && typeof window.getAgariResultQueue === "function"){
        return window.getAgariResultQueue();
      }
    }catch(e){}
    return [];
  }

  function getQueueIndex(){
    try{
      if (typeof window !== "undefined" && Number.isInteger(window.agariResultQueueIndex)){
        return window.agariResultQueueIndex;
      }
    }catch(e){}
    return 0;
  }

  function setQueueIndex(index){
    try{
      if (typeof window === "undefined") return;
      if (!Number.isInteger(index) || index < 0) return;
      window.agariResultQueueIndex = index;
    }catch(e){}
  }

  function findHeadRonQueueIndex(){
    const queue = getQueue();
    if (!Array.isArray(queue) || queue.length <= 0) return 0;

    for (let i = 0; i < queue.length; i++){
      const entry = queue[i];
      if (entry && entry.winType === "ron" && entry.headWinner) return i;
    }

    for (let i = 0; i < queue.length; i++){
      const entry = queue[i];
      if (entry && entry.winType === "ron") return i;
    }

    return 0;
  }

  function getCurrentRonEntry(){
    try{
      if (typeof window !== "undefined" && typeof window.getCurrentAgariResultEntry === "function"){
        const entry = window.getCurrentAgariResultEntry();
        if (entry && entry.winType === "ron") return entry;
      }
    }catch(e){}
    return null;
  }

  function getCurrentRonSeatIndex(){
    const entry = getCurrentRonEntry();
    if (entry && typeof entry.winnerSeatIndex === "number"){
      return entry.winnerSeatIndex;
    }

    if (typeof lastAgariWinnerSeatIndex === "number"){
      return lastAgariWinnerSeatIndex;
    }

    return 0;
  }

  function clearAllExtraRonOverlaysSafe(){
    try{
      if (typeof removeExtraRonOverlays === "function"){
        removeExtraRonOverlays();
      }
    }catch(e){}
  }

  function applyRonSeatClassOnly(seatIndex){
    try{
      if (typeof applyAgariWinnerClass === "function"){
        applyAgariWinnerClass(ronOverlay, seatIndex);
        return;
      }
    }catch(e){}

    try{
      if (typeof clearAgariWinnerClasses === "function"){
        clearAgariWinnerClasses(ronOverlay);
      }
    }catch(e){}

    if (!ronOverlay) return;
    ronOverlay.classList.remove("winner-self", "winner-left", "winner-right");
    if (seatIndex === 1){
      ronOverlay.classList.add("winner-right");
    } else if (seatIndex === 2){
      ronOverlay.classList.add("winner-left");
    } else {
      ronOverlay.classList.add("winner-self");
    }
  }

  function openRonSequential(){
    if (!ronOverlay) return;

    clearAllExtraRonOverlaysSafe();

    const seatIndex = getCurrentRonSeatIndex();
    applyRonSeatClassOnly(seatIndex);

    agariOverlayStep = 1;
    ronOverlay.style.display = "flex";
  }

  function closeRonSequential(){
    clearAllExtraRonOverlaysSafe();

    try{
      if (typeof clearAgariWinnerClasses === "function"){
        clearAgariWinnerClasses(ronOverlay);
      }
    }catch(e){}

    if (ronOverlay){
      ronOverlay.style.display = "none";
    }
  }

  function hasNextRonOverlayEntry(){
    try{
      if (typeof window === "undefined") return false;
      if (typeof window.hasNextAgariResultQueueEntry !== "function") return false;
      const current = typeof window.getCurrentAgariResultEntry === "function"
        ? window.getCurrentAgariResultEntry()
        : null;
      return !!(current && current.winType === "ron" && window.hasNextAgariResultQueueEntry());
    }catch(e){
      return false;
    }
  }

  function advanceToNextRonOverlayEntry(){
    try{
      if (typeof window !== "undefined" && typeof window.advanceAgariResultQueue === "function"){
        window.advanceAgariResultQueue();
      }
    }catch(e){}
  }

  function resetQueueToHeadRonForResult(){
    const headIndex = findHeadRonQueueIndex();
    setQueueIndex(headIndex);
  }

  function patchOpenRon(){
    if (typeof window.openRon !== "function") return;
    if (window.openRon.__doubleRonSequentialPatched__) return;

    const originalOpenRon = window.openRon;
    const patchedOpenRon = function(){
      try{
        openRonSequential();
      }catch(e){
        originalOpenRon();
      }
    };
    patchedOpenRon.__doubleRonSequentialPatched__ = true;
    patchedOpenRon.__original__ = originalOpenRon;
    window.openRon = patchedOpenRon;
  }

  function patchCloseRon(){
    if (typeof window.closeRon !== "function") return;
    if (window.closeRon.__doubleRonSequentialPatched__) return;

    const originalCloseRon = window.closeRon;
    const patchedCloseRon = function(){
      try{
        closeRonSequential();
      }catch(e){
        originalCloseRon();
      }
    };
    patchedCloseRon.__doubleRonSequentialPatched__ = true;
    patchedCloseRon.__original__ = originalCloseRon;
    window.closeRon = patchedCloseRon;
  }

  function patchMoveOverlayToTable(){
    if (typeof window.movePostAgariFlowFromOverlayToTable !== "function") return;
    if (window.movePostAgariFlowFromOverlayToTable.__doubleRonSequentialPatched__) return;

    const originalMove = window.movePostAgariFlowFromOverlayToTable;

    const patchedMove = function(closeFn){
      const currentEntry = getCurrentRonEntry();

      if (currentEntry && hasNextRonOverlayEntry()){
        try{
          if (typeof closeFn === "function"){
            closeFn();
          }
        }catch(e){}

        advanceToNextRonOverlayEntry();

        try{
          if (typeof openRon === "function"){
            openRon();
          }
        }catch(e){}

        try{
          if (typeof setPostAgariStageToOverlay === "function"){
            setPostAgariStageToOverlay();
          } else if (typeof __postAgariStage !== "undefined"){
            __postAgariStage = "overlay";
          }
        }catch(e){}

        return;
      }

      if (currentEntry){
        resetQueueToHeadRonForResult();
      }

      return originalMove(closeFn);
    };

    patchedMove.__doubleRonSequentialPatched__ = true;
    patchedMove.__original__ = originalMove;
    window.movePostAgariFlowFromOverlayToTable = patchedMove;
  }

  function bootPatch(){
    patchOpenRon();
    patchCloseRon();
    patchMoveOverlayToTable();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootPatch, { once: true });
  } else {
    bootPatch();
  }
})();
