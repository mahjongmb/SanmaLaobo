// ========= pei.js（北抜き） =========

function doPei(){
  try{
    if (isEnded) return;
    if (isRiichiSelecting) return;
    if (typeof isNukiActionEnabledForGame === "function" && !isNukiActionEnabledForGame()) return;

    // ★ ポン後の「切るまで」中はペー不可
    if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

    // ★ リーチ中は「待ち状態(riichiWait)」のときだけOK
    if (isRiichi && !riichiWait) return;

    clearNewFlags();

    // ================================
    // 1) ツモ北ならそれを抜く（drawn を差し替えればOK）
    // ================================
    if (drawn && typeof isNukiTileForGame === "function" && isNukiTileForGame(drawn)){
      peis.push(drawn);
      try{
        if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("pei", {
            seatIndex: 0,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawn) : { code: drawn.code, imgCode: drawn.imgCode || drawn.code }
          });
        }
      }catch(e){}
      drawn = null;

      // ★ 王牌から補充（嶺上扱い）
      const add = drawFromDeadWallForPei();
      if (add){
        add.isNew = true;
        drawn = add;
        try{
          if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
            window.MBSanmaMatchLog.pushEvent("draw", {
              seatIndex: 0,
              tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(add) : { code: add.code, imgCode: add.imgCode || add.code },
              source: "deadwall_pei"
            });
          }
        }catch(e){}
      }

      if (isRiichi) riichiWait = false;

      render();

      // ★ ここで未定義でも落とさない（保険）
      if (isRiichi && typeof scheduleRiichiAuto === "function") scheduleRiichiAuto();

      return;
    }

    // ================================
    // 2) 手牌北を抜く（hand13 を 13枚に戻し、drawn は維持）
    // ================================
    const idx = hand13.findIndex((t)=> typeof isNukiTileForGame === "function" && isNukiTileForGame(t));
    if (idx < 0) return;

    const north = hand13.splice(idx, 1)[0];
    peis.push(north);
    try{
      if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
        window.MBSanmaMatchLog.pushEvent("pei", {
          seatIndex: 0,
          tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(north) : { code: north.code, imgCode: north.imgCode || north.code }
        });
      }
    }catch(e){}

    // ★ 王牌から補充：drawn に入れると「hand13=12 + drawn=1」になってズレるので
    //    hand13 側へ戻す（drawn はそのまま維持）
    const add = drawFromDeadWallForPei();
    if (add){
      add.isNew = true;
      hand13.push(add);
      hand13 = sortHand(hand13);
      try{
        if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
          window.MBSanmaMatchLog.pushEvent("draw", {
            seatIndex: 0,
            tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(add) : { code: add.code, imgCode: add.imgCode || add.code },
            source: "deadwall_pei"
          });
        }
      }catch(e){}
    }

    if (isRiichi) riichiWait = false;

    render();

    // ★ ここで未定義でも落とさない（保険）
    if (isRiichi && typeof scheduleRiichiAuto === "function") scheduleRiichiAuto();

  }catch(err){
    // ★ doPei 内で捕まえると stack が取れるので、Script error. で潰れない
    if (typeof showFatalError === "function") showFatalError(err, "doPei()");
  }
}
