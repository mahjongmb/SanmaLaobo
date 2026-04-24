// ========= kan.js（暗槓 / 加槓） =========
// 役割：自分手番中のカン実行（状態変更担当）
// - 暗槓（手の中4枚）
// - 加槓（ポン→4枚目追加）
// 明槓は call.js 側で処理する

function openKanEffect(seatIndex = 0){
  if (!kanOverlay) return;

  const inner = kanOverlay.querySelector(".inner");
  const img = inner ? inner.querySelector("img") : null;

  kanOverlay.style.position = "fixed";
  kanOverlay.style.inset = "0";
  kanOverlay.style.display = "block";
  kanOverlay.style.pointerEvents = "none";
  kanOverlay.style.zIndex = "2500";
  kanOverlay.style.background = "transparent";

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
  let w = "320px";

  if (seatIndex === 1){
    x = "82%";
    y = "58%";
    w = "280px";
  } else if (seatIndex === 2){
    x = "18%";
    y = "58%";
    w = "280px";
  }

  if (inner){
    inner.style.left = x;
    inner.style.top = y;
    inner.style.width = `min(${w}, 34vw)`;
    if (seatIndex === 0){
      inner.style.width = "min(320px, 40vw)";
    }

    void inner.offsetWidth;
    const kanDur = (typeof getGameSpeedMs === "function") ? getGameSpeedMs("kanEffectDurationMs", 900) : 900;
    inner.animate(
      [
        { opacity: 0, transform: "translate(-50%, -50%) scale(0.72)" },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.06)", offset: 0.38 },
        { opacity: 1, transform: "translate(-50%, -50%) scale(1.00)", offset: 0.72 },
        { opacity: 0, transform: "translate(-50%, -50%) scale(1.12)" }
      ],
      {
        duration: kanDur,
        easing: "ease-out",
        fill: "forwards"
      }
    );
  }

  const kanDurClose = (typeof getGameSpeedMs === "function") ? getGameSpeedMs("kanEffectDurationMs", 900) : 900;
  setTimeout(()=>{
    if (!kanOverlay) return;
    kanOverlay.style.display = "none";
  }, kanDurClose);
}

function __kanCloneDisplayTile(tile, fallbackCode = null){
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

function __kanExtractTilesByCodePreserveOrder(src, code, count){
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

function __kanFallbackPonTiles(code, from){
  const tileA = __kanCloneDisplayTile(null, code);
  const tileB = __kanCloneDisplayTile(null, code);
  const called = __kanCloneDisplayTile(null, code);

  if (from === "L"){
    return {
      tiles: [called, tileA, tileB],
      calledIndex: 0
    };
  }

  return {
    tiles: [tileA, tileB, called],
    calledIndex: 2
  };
}

function __kanBuildKakanMeld(oldMeld, addedTile, code){
  const baseCode = code || (oldMeld && oldMeld.code) || null;
  let tiles = [];
  let calledIndex = 0;

  if (oldMeld && Array.isArray(oldMeld.tiles) && oldMeld.tiles.length >= 3){
    tiles = oldMeld.tiles.slice(0, 3).map((tile)=> __kanCloneDisplayTile(tile, baseCode)).filter(Boolean);
    if (Number.isInteger(oldMeld.calledIndex) && oldMeld.calledIndex >= 0 && oldMeld.calledIndex < tiles.length){
      calledIndex = oldMeld.calledIndex;
    } else {
      calledIndex = (oldMeld.from === "L") ? 0 : (tiles.length - 1);
    }
  } else {
    const fallback = __kanFallbackPonTiles(baseCode, oldMeld && oldMeld.from);
    tiles = fallback.tiles;
    calledIndex = fallback.calledIndex;
  }

  return {
    type: "kakan",
    code: baseCode,
    from: oldMeld && oldMeld.from ? oldMeld.from : "R",
    tiles,
    calledIndex,
    addedTile: __kanCloneDisplayTile(addedTile, baseCode)
  };
}

// ================================
// ★ リーチ後暗槓の判定（待ち不変 + おくりカン禁止）
//
// ルール（このプロジェクト仕様）
// - リーチ後の暗槓は「待ちが変わらない」ならOK
// - おくりカンNG：ツモってきた牌（drawn）と別の牌でカンするのは禁止
//   → つまり「drawn.code が暗槓牌と一致している」暗槓だけ許可
//
// ここは “状態変更なし” の純関数として実装して
// render.js のボタン点灯にも使えるようにする
// ================================
function _calcWaitCodesFromTiles(tiles, fixedM){
  const set = new Set();
  if (typeof TILE_TYPES === "undefined" || !Array.isArray(TILE_TYPES)) return [];
  if (typeof countsFromTiles !== "function") return [];
  if (typeof calcShanten !== "function") return [];

  const base = Array.isArray(tiles) ? tiles.slice() : [];

  for (const code of TILE_TYPES){
    const t14 = base.slice();
    t14.push({ code });

    try{
      if (calcShanten(countsFromTiles(t14), fixedM) === -1){
        set.add(code);
      }
    }catch(e){
      // 判定が落ちた牌は待ちに入れない（安全側）
    }
  }

  return Array.from(set).sort();
}

function _setEqualsArray(a, b){
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++){
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ★ render.js から呼べるようにグローバルで提供
function canRiichiAnkanNow(ankanCode){
  try{
    if (!ankanCode) return false;
    if (!isRiichi) return true; // リーチ中でなければ制限なし

    // おくりカン禁止：drawn が暗槓牌であること
    if (!drawn || drawn.code !== ankanCode) return false;

    const fixedM = Array.isArray(melds) ? melds.length : 0;

    // 1) カン前の“待ち”（リーチ後の基準は「手牌（drawn を切る前提）」= hand13）
    const beforeWait = _calcWaitCodesFromTiles(hand13, fixedM);
    if (!beforeWait || beforeWait.length === 0) return false; // そもそもテンパイじゃないなら不可

    // 2) カン後（4枚抜いて melds+1）の“待ち”をシミュレート
    const pool = [];
    if (Array.isArray(hand13)) pool.push(...hand13.map(t=>({ code: t.code })));
    if (drawn) pool.push({ code: drawn.code });

    let picked = 0;
    const remain = [];
    for (const t of pool){
      if (t.code === ankanCode && picked < 4){
        picked++;
      } else {
        remain.push(t);
      }
    }
    if (picked < 4) return false;

    const afterWait = _calcWaitCodesFromTiles(remain, fixedM + 1);
    if (!afterWait || afterWait.length === 0) return false;

    // 3) 待ち集合が完全一致ならOK
    return _setEqualsArray(beforeWait, afterWait);
  }catch(e){
    // 判定失敗時は安全側（不可）
    return false;
  }
}

// ================================
// 加槓判定
// ================================
function findKakanTarget(){
  if (!Array.isArray(melds)) return null;

  const pool = hand13.slice();
  if (drawn) pool.push(drawn);

  for (let i = 0; i < melds.length; i++){
    const m = melds[i];
    if (!m || m.type !== "pon") continue;

    const code = m.code;
    const hasFourth = pool.find(t => t.code === code);
    if (hasFourth){
      return {
        meldIndex: i,
        code,
        tile: hasFourth
      };
    }
  }

  return null;
}

// ================================
// 暗槓判定（既存）
// ================================
function findAnkanTargetCode(){
  if (typeof findQuadTargetCode === "function"){
    return findQuadTargetCode();
  }
  return null;
}

// ================================
// 共通：ドラ追加
// ================================
function addKanDora(){
  if (typeof pushNextKanDoraIndicatorsFromDeadWall === "function"){
    pushNextKanDoraIndicatorsFromDeadWall();
    return;
  }

  if (deadWall && deadWall.length > 0){
    const nextIdx = Array.isArray(doraIndicators) ? doraIndicators.length : 0;
    const next = deadWall[nextIdx];
    if (next){
      doraIndicators.push({ code: next.code, imgCode: next.imgCode || next.code, isRed: !!next.isRed });
    }

    const nextUraIdx = Math.max(0, (Array.isArray(uraDoraIndicators) ? uraDoraIndicators.length : 0) - 1);
    const nextUra = deadWall[nextUraIdx];
    if (nextUra){
      uraDoraIndicators.push({ code: nextUra.code, imgCode: nextUra.imgCode || nextUra.code, isRed: !!nextUra.isRed });
    }
  }
}

// ================================
// 共通：嶺上ツモ
// ================================
function doRinshanDraw(){
  drawn = null;

  if (typeof drawFromDeadWallForKan === "function"){
    const t = drawFromDeadWallForKan();
    if (t){
      t.isNew = true;
      drawn = t;
      try{ if (typeof markCurrentWinContextRinshan === "function") markCurrentWinContextRinshan(); }catch(e){}
    }
  }
}

// ================================
// 加槓実行
// ================================
function doKakan(){
  const target = findKakanTarget();
  if (!target) return;

  const { meldIndex, code } = target;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}

  if (typeof tryCpuRonOnPlayerKakan === "function"){
    try{
      if (tryCpuRonOnPlayerKakan(code)) return;
    }catch(e){}
  }

  clearNewFlags();

  // =========================================================
  // 手牌（hand13 + drawn）から「同一牌1枚」を抜き、加槓として副露へ
  //
  // ★重要：
  //   drawn で加槓する場合も、hand13 内の牌で加槓する場合も、
  //   残り牌はすべて hand13 側へ寄せる。
  //   そうしないと、元からいた drawn が doRinshanDraw() の先頭で
  //   消されてしまい、手牌が1枚足りなくなる。
  // =========================================================
  const pool = [];
  if (Array.isArray(hand13)) pool.push(...hand13);
  if (drawn) pool.push(drawn);

  const kakanExtract = __kanExtractTilesByCodePreserveOrder(pool, code, 1);
  const remain = kakanExtract.remainTiles;
  const addedTile = kakanExtract.removedTiles[0] || null;
  if (!addedTile) return;

  // meldをkakanへ昇格
  const old = melds[meldIndex];
  melds[meldIndex] = __kanBuildKakanMeld(old, addedTile, code);

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("kakan", {
        seatIndex: 0,
        code,
        addedTile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(addedTile) : null
      });
    }
  }catch(e){}

  openKanEffect();

  // ★ カン後：残り牌はすべて「手牌側」へ寄せ、drawn は嶺上で作り直す
  hand13 = sortHand(remain);
  drawn = null;

  addKanDora();
  doRinshanDraw();

  try{
    if (drawn && typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("draw", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawn) : { code: drawn.code, imgCode: drawn.imgCode || drawn.code },
        source: "deadwall_kan"
      });
    }
  }catch(e){}

  hoveredTileId = null;
  clearNewFlags();

  // 嶺上後は通常DISCARDへ
  try{
    if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
    if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
  }catch(e){}

  // ★ リーチ中なら「嶺上の後の挙動」もリーチの流れに戻す
  if (isRiichi){
    try{ riichiWait = false; }catch(e){}
  }

  render();

  if (!isEnded && isRiichi && typeof scheduleRiichiAuto === "function"){
    scheduleRiichiAuto();
  }
}

// ================================
// 暗槓実行
// ================================
function doAnkan(codeOverride){
  const code = codeOverride || findAnkanTargetCode();
  if (!code) return;

  try{ if (typeof clearAllIppatsuChances === "function") clearAllIppatsuChances(); }catch(e){}

  clearNewFlags();

  // =========================================================
  // 手牌（hand13 + drawn）から「同一牌4枚」を抜き、暗槓として副露へ
  //
  // ★重要：このプロジェクトの hand13 は常に13枚固定ではない
  //   - 副露が増えると手牌枚数が減る（例：pon後は hand13 が 10 になる）
  //   - なので「remain.slice(0,13)」のような固定化はしない
  // =========================================================

  const pool = [];
  if (Array.isArray(hand13)) pool.push(...hand13);
  if (drawn) pool.push(drawn);

  const ankanExtract = __kanExtractTilesByCodePreserveOrder(pool, code, 4);
  const remain = ankanExtract.remainTiles;
  const removedTiles = ankanExtract.removedTiles;
  if (removedTiles.length < 4) return;

  // 副露登録
  melds.push({
    type: "ankan",
    code,
    tiles: removedTiles.map((tile)=> __kanCloneDisplayTile(tile, code)).filter(Boolean)
  });

  try{
    if (typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("ankan", {
        seatIndex: 0,
        code,
        removedTiles: window.MBSanmaMatchLog.cloneTileArray ? window.MBSanmaMatchLog.cloneTileArray(removedTiles) : []
      });
    }
  }catch(e){}
  try{ if (typeof markOpenCallOrKanThisKyoku === "function") markOpenCallOrKanThisKyoku(); }catch(e){}

  openKanEffect();

  // ★ カン後：残り牌はすべて「手牌側」へ寄せ、drawn は嶺上で作り直す
  hand13 = sortHand(remain);
  drawn = null;

  // ★ 自分の暗槓に対するCPU国士ロン判定は
  //   「暗槓成立後・演出開始後・嶺上前」で行う
  if (typeof tryCpuRonOnPlayerAnkan === "function") {
    try{
      if (tryCpuRonOnPlayerAnkan(code)) return;
    }catch(e){}
  }

  addKanDora();
  doRinshanDraw();

  try{
    if (drawn && typeof window !== "undefined" && window.MBSanmaMatchLog && typeof window.MBSanmaMatchLog.pushEvent === "function"){
      window.MBSanmaMatchLog.pushEvent("draw", {
        seatIndex: 0,
        tile: window.MBSanmaMatchLog.cloneTile ? window.MBSanmaMatchLog.cloneTile(drawn) : { code: drawn.code, imgCode: drawn.imgCode || drawn.code },
        source: "deadwall_kan"
      });
    }
  }catch(e){}

  hoveredTileId = null;
  clearNewFlags();

  // 嶺上後は通常DISCARDへ
  try{
    if (typeof currentTurnSeatIndex !== "undefined") currentTurnSeatIndex = 0;
    if (typeof turnPhase !== "undefined") turnPhase = "DISCARD";
  }catch(e){}

  // ★ リーチ中なら「嶺上の後の挙動」もリーチの流れに戻す
  if (isRiichi){
    try{ riichiWait = false; }catch(e){}
  }

  render();

  // ★ リーチ中：嶺上牌を引いた後の処理（基本ツモ切り/ペー可/アガリは手動ツモ）へ
  if (!isEnded && isRiichi && typeof scheduleRiichiAuto === "function"){
    scheduleRiichiAuto();
  }
}

// ================================
// ★ カンボタン統合入口
// ================================
function doKan(){
  if (isEnded) return;
  if (isRiichiSelecting) return;

  // ★ ポン後の「切るまで」中はカン不可
  if (typeof mustDiscardAfterCall !== "undefined" && mustDiscardAfterCall) return;

  // 1) 鳴き中なら明槓（call.jsで処理）
  if (pendingCall && pendingCall.canMinkan){
    if (typeof chooseMinkan === "function"){
      chooseMinkan(true);
    }
    return;
  }

  // 2) 加槓優先
  //    ※ リーチ後はそもそも鳴けない想定だが、保険で弾く
  if (findKakanTarget()){
    if (isRiichi) return;
    doKakan();
    return;
  }

  // 3) 暗槓
  const ankanCode = findAnkanTargetCode();
  if (ankanCode){
    // ★ リーチ後暗槓：待ち不変 + おくりカン禁止
    if (isRiichi){
      if (typeof canRiichiAnkanNow === "function"){
        if (!canRiichiAnkanNow(ankanCode)) return;
      } else {
        // 判定関数が無いなら安全側で不可
        return;
      }
    }

    doAnkan(ankanCode);
    return;
  }
}