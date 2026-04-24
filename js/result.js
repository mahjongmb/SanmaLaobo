// MBsanma/js/result.js
// ========= result.js（結果確認画面の表示専用） =========
// 役割：
// - 結果確認画面(resultOverlay)の中身を描画する
// - open / close API を提供する
//
// 注意：
// - 状態変更は行わない
// - 点数計算はまだ未実装なので、翻数と符を表示する
// - 既存の進行(main.js)から openResultOverlay / closeResultOverlay を呼ぶ前提

const resultOverlay = document.getElementById("resultOverlay");
const resultPanel = document.getElementById("resultPanel");

const resultTitleEl = document.getElementById("resultTitle");
const resultSubtitleEl = document.getElementById("resultSubtitle");
const resultWinTypeEl = document.getElementById("resultWinType");
const resultWinnerEl = document.getElementById("resultWinner");

const resultTopRowEl = document.getElementById("resultTopRow");
const resultInfoRowEl = document.getElementById("resultInfoRow");
const resultDoraBlockEl = document.getElementById("resultDoraBlock");
const resultUraDoraBlockEl = document.getElementById("resultUraDoraBlock");

const resultHandTilesEl = document.getElementById("resultHandTiles");
const resultDoraTilesEl = document.getElementById("resultDoraTiles");
const resultUraDoraTilesEl = document.getElementById("resultUraDoraTiles");
const resultYakuListEl = document.getElementById("resultYakuList");
const resultHanFuEl = document.getElementById("resultHanFu");
const resultPointTextEl = document.getElementById("resultPointText");


function isCompactLandscapePhoneForResult(){
  try{
    return window.matchMedia('(orientation: landscape) and (max-height: 520px)').matches;
  }catch(e){
    return false;
  }
}

function installOverlayNoZoomGuards(el){
  if (!el || el.__overlayNoZoomGuardsInstalled) return;
  el.__overlayNoZoomGuardsInstalled = true;
  el.style.touchAction = "manipulation";
  el.style.webkitTapHighlightColor = "transparent";
  el.style.userSelect = "none";

  let lastTouchEndAt = 0;

  const prevent = (ev)=>{
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
  };

  el.addEventListener("gesturestart", prevent, { passive: false });
  el.addEventListener("gesturechange", prevent, { passive: false });
  el.addEventListener("gestureend", prevent, { passive: false });
  el.addEventListener("dblclick", prevent, { passive: false });

  el.addEventListener("touchstart", (ev)=>{
    if (ev.touches && ev.touches.length > 1){
      prevent(ev);
    }
  }, { passive: false });

  el.addEventListener("touchmove", (ev)=>{
    if (ev.touches && ev.touches.length > 1){
      prevent(ev);
    }
  }, { passive: false });

  el.addEventListener("touchend", (ev)=>{
    const now = Date.now();
    if ((now - lastTouchEndAt) < 320){
      prevent(ev);
    }
    lastTouchEndAt = now;
  }, { passive: false });
}


function isResultOverlayShownForNoZoomGuard(){
  if (!resultOverlay) return false;
  return resultOverlay.style.display !== "none" && resultOverlay.style.display !== "";
}

function installResultOverlayDocumentNoZoomGuard(){
  if (typeof document === "undefined") return;
  if (document.__resultOverlayDocumentNoZoomGuardInstalled) return;
  document.__resultOverlayDocumentNoZoomGuardInstalled = true;

  let lastTouchEndAt = 0;

  const isInsideResultOverlay = (target)=>{
    if (!resultOverlay || !target) return false;
    if (target === resultOverlay) return true;
    if (typeof resultOverlay.contains === "function") return resultOverlay.contains(target);
    return false;
  };

  const shouldBlock = (ev)=>{
    if (!isResultOverlayShownForNoZoomGuard()) return false;
    const target = ev && ev.target;
    return isInsideResultOverlay(target);
  };

  document.addEventListener("dblclick", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener("gesturestart", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener("gesturechange", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener("gestureend", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
  }, { passive: false, capture: true });

  document.addEventListener("touchstart", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (ev.touches && ev.touches.length > 1 && typeof ev.preventDefault === "function"){
      ev.preventDefault();
    }
  }, { passive: false, capture: true });

  document.addEventListener("touchmove", (ev)=>{
    if (!shouldBlock(ev)) return;
    if (ev.touches && ev.touches.length > 1 && typeof ev.preventDefault === "function"){
      ev.preventDefault();
    }
  }, { passive: false, capture: true });

  document.addEventListener("touchend", (ev)=>{
    if (!shouldBlock(ev)) return;

    const now = Date.now();
    if ((now - lastTouchEndAt) < 360 && typeof ev.preventDefault === "function"){
      ev.preventDefault();
    }
    lastTouchEndAt = now;
  }, { passive: false, capture: true });
}

function installDefaultGameOverlayNoZoomGuards(){
  const ids = [
    "tsumoOverlay",
    "nagashiOverlay",
    "ryukyokuOverlay",
    "ronOverlay",
    "resultOverlay",
    "resultPanel",
    "kanOverlay",
    "ponOverlay",
    "riichiOverlay",
    "drawOverlay",
    "settingsOverlay",
    "settingsPanel"
  ];

  for (const id of ids){
    const el = document.getElementById(id);
    if (!el) continue;
    installOverlayNoZoomGuards(el);
  }
}

function applyResultOverlayResponsiveLayout(){
  if (!resultOverlay || !resultPanel) return;

  const compact = isCompactLandscapePhoneForResult();
  const strip = ensureResultTopDoraStrip();
  const doraGroup = document.getElementById("resultTopDoraGroup");
  const uraGroup = document.getElementById("resultTopUraDoraGroup");
  const doraLabel = document.getElementById("resultTopDoraLabel");
  const uraLabel = document.getElementById("resultTopUraDoraLabel");
  const doraTiles = document.getElementById("resultTopDoraTiles");
  const uraTiles = document.getElementById("resultTopUraDoraTiles");

  if (resultTopRowEl){
    resultTopRowEl.style.display = "grid";
    resultTopRowEl.style.alignItems = "center";
    resultTopRowEl.style.columnGap = compact ? "8px" : "18px";
    resultTopRowEl.style.rowGap = compact ? "6px" : "8px";
    resultTopRowEl.style.gridTemplateColumns = compact ? "auto minmax(0, 1fr)" : "auto minmax(0, 1fr) auto";
    resultTopRowEl.style.gridTemplateAreas = compact ? '"winType winner"' : "none";
  }

  if (resultWinTypeEl){
    resultWinTypeEl.style.alignSelf = "center";
    resultWinTypeEl.style.gridArea = compact ? "winType" : "auto";
  }

  if (resultWinnerEl){
    resultWinnerEl.style.alignSelf = "center";
    resultWinnerEl.style.gridArea = compact ? "winner" : "auto";
  }

  if (strip){
    strip.style.display = compact ? "none" : "flex";
    strip.style.alignSelf = "center";
    strip.style.justifySelf = "stretch";
    strip.style.gridArea = compact ? "auto" : "auto";
    strip.style.gap = compact ? "18px" : "72px";
    strip.style.width = "100%";
  }

  for (const group of [doraGroup, uraGroup]){
    if (!group) continue;
    group.style.gap = compact ? "6px" : "8px";
  }

  for (const label of [doraLabel, uraLabel]){
    if (!label) continue;
    label.style.fontSize = compact ? "11px" : "14px";
  }

  for (const tilesEl of [doraTiles, uraTiles]){
    if (!tilesEl) continue;
    tilesEl.style.minHeight = compact ? "34px" : "44px";
  }

  const pointSubTextEl = document.getElementById("resultPointSubText");
  if (pointSubTextEl){
    pointSubTextEl.style.fontSize = compact ? "13px" : "18px";
  }

  const pointChipTextEl = document.getElementById("resultPointChipText");
  if (pointChipTextEl){
    pointChipTextEl.style.fontSize = compact ? "14px" : "20px";
  }

  if (resultYakuListEl){
    if (compact){
      resultYakuListEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
      resultYakuListEl.style.columnGap = "8px";
      resultYakuListEl.style.rowGap = "6px";
    } else {
      applyResultYakuListLayout();
    }
  }

  const handRoot = resultHandTilesEl ? resultHandTilesEl.firstElementChild : null;
  if (handRoot){
    handRoot.style.rowGap = compact ? "4px" : "10px";
    if (handRoot.children[1] && handRoot.children[1].style){
      handRoot.children[1].style.marginLeft = compact ? "10px" : "18px";
    }
    if (handRoot.children[2] && handRoot.children[2].style){
      handRoot.children[2].style.marginLeft = compact ? "10px" : "18px";
      handRoot.children[2].style.gap = compact ? "10px" : "18px";
    }
  }

  if (resultInfoRowEl){
    resultInfoRowEl.style.display = compact ? "grid" : "none";
    resultInfoRowEl.style.gridTemplateColumns = compact ? "repeat(2, minmax(0, 1fr))" : "1fr 1fr";
    resultInfoRowEl.style.gap = compact ? "8px" : "14px";
    resultInfoRowEl.style.alignItems = "stretch";
  }

  if (resultDoraBlockEl){
    resultDoraBlockEl.style.minHeight = compact ? "0" : "98px";
  }

  if (resultUraDoraBlockEl){
    resultUraDoraBlockEl.style.minHeight = compact ? "0" : "98px";
  }
}

if (typeof window !== "undefined") {
  window.installOverlayNoZoomGuards = installOverlayNoZoomGuards;
  window.isCompactLandscapePhoneForResult = isCompactLandscapePhoneForResult;
}

installDefaultGameOverlayNoZoomGuards();
installResultOverlayDocumentNoZoomGuard();

if (typeof window !== "undefined" && !window.__resultOverlayResponsiveHandlerInstalled){
  window.__resultOverlayResponsiveHandlerInstalled = true;
  window.addEventListener("resize", ()=>{
    if (resultOverlay && resultOverlay.style.display === "flex") applyResultOverlayResponsiveLayout();
  });
}

// ================================
// 基本表示名
// ================================
function resultSeatName(seatIndex){
  if (seatIndex === 0) return "あなた";
  if (seatIndex === 1) return "右CPU";
  if (seatIndex === 2) return "左CPU";
  return "不明";
}

function resultWinTypeLabel(winType){
  if (winType === "tsumo") return "ツモ";
  if (winType === "ron") return "ロン";
  if (winType === "nagashi") return "流し";
  if (winType === "ryukyoku") return "流局";
  return "";
}

function getResultNagashiModeLabel(info){
  const source = (info && Array.isArray(info.yaku)) ? info.yaku : [];
  for (const y of source){
    if (!y) continue;
    if (y.name === "流し満貫") return "満貫";
    if (y.name === "流し倍満") return "倍満";
  }
  return "流し";
}

function getCurrentAgariViewEntry(){
  try{
    if (typeof window !== "undefined" && typeof window.getCurrentAgariResultEntry === "function"){
      const entry = window.getCurrentAgariResultEntry();
      if (entry) return entry;
    }
  }catch(e){}

  try{
    if (typeof window !== "undefined" && typeof window.getCurrentNagashiResultEntry === "function"){
      const entry = window.getCurrentNagashiResultEntry();
      if (entry) return entry;
    }
  }catch(e){}

  return {
    winType: lastAgariType,
    winnerSeatIndex: lastAgariWinnerSeatIndex,
    discarderSeatIndex: lastAgariDiscarderSeatIndex,
    ronTile: (lastAgariRonTile && lastAgariRonTile.code) ? { code: lastAgariRonTile.code, imgCode: lastAgariRonTile.imgCode || lastAgariRonTile.code } : null,
    headWinner: true
  };
}

function getResultRyukyokuSettlement(){
  try{
    if (typeof buildCurrentRoundSettlement === "function"){
      const settlement = buildCurrentRoundSettlement();
      if (settlement && settlement.type === "ryukyoku") return settlement;
    }
  }catch(e){}

  try{
    if (typeof pendingRoundSettlement !== "undefined" && pendingRoundSettlement && pendingRoundSettlement.type === "ryukyoku"){
      return pendingRoundSettlement;
    }
  }catch(e){}

  return null;
}

function getRyukyokuPointSummaryText(settlement){
  const tenpaiSeats = (settlement && Array.isArray(settlement.tenpaiSeats))
    ? settlement.tenpaiSeats
    : [];

  if (tenpaiSeats.length === 0) return "全員ノーテン";
  if (tenpaiSeats.length === 3) return "全員テンパイ";
  if (tenpaiSeats.length === 1) return "一人テンパイ";
  if (tenpaiSeats.length === 2) return "二人テンパイ";
  return "流局";
}

function getPlayerDeltaTextFromSettlement(settlement){
  if (!settlement || !Array.isArray(settlement.delta)) return "(±0)";
  const value = Number.isFinite(settlement.delta[0]) ? (settlement.delta[0] | 0) : 0;
  if (value > 0) return `(+${value})`;
  if (value < 0) return `(${value})`;
  return "(±0)";
}


function resultRonRouteText(){
  const entry = getCurrentAgariViewEntry();
  const winner = entry ? entry.winnerSeatIndex : null;
  const discarder = entry && typeof entry.discarderSeatIndex === "number" ? entry.discarderSeatIndex : null;

  if (winner == null || discarder == null) return resultSeatName(winner);
  return `${resultSeatName(discarder)}→${resultSeatName(winner)}`;
}

function getNagashiWinnerSeatIndexesForResult(entryOverride){
  const entry = entryOverride || getCurrentAgariViewEntry();
  if (!entry || entry.winType !== "nagashi") return [];

  if (entry.winnerSeatIndex === 0 || entry.winnerSeatIndex === 1 || entry.winnerSeatIndex === 2){
    return [entry.winnerSeatIndex];
  }

  if (Array.isArray(lastNagashiWinnerSeatIndexes) && lastNagashiWinnerSeatIndexes.length > 0){
    return lastNagashiWinnerSeatIndexes.filter((seat)=> seat === 0 || seat === 1 || seat === 2);
  }

  return [];
}

function getNagashiWinnerText(entryOverride){
  const seats = getNagashiWinnerSeatIndexesForResult(entryOverride);
  if (seats.length <= 0) return "";
  return seats.map((seat)=> resultSeatName(seat)).join("・");
}
function resultSeatWindBySeatIndex(seatIndex){
  const e = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  if (e === 0){
    if (seatIndex === 0) return "東";
    if (seatIndex === 1) return "南";
    if (seatIndex === 2) return "西";
  }

  if (e === 1){
    if (seatIndex === 1) return "東";
    if (seatIndex === 2) return "南";
    if (seatIndex === 0) return "西";
  }

  if (e === 2){
    if (seatIndex === 2) return "東";
    if (seatIndex === 0) return "南";
    if (seatIndex === 1) return "西";
  }

  return null;
}

function isResultUraDoraEnabled(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      const raw = window.MBSanmaRulesConfig.getValue("tiles-uradora", true);
      if (typeof raw === "boolean") return raw;
      const text = String(raw == null ? "" : raw).toLowerCase();
      if (text === "true" || text === "1" || text === "on") return true;
      if (text === "false" || text === "0" || text === "off") return false;
    }
  }catch(e){}
  return true;
}

function shouldShowResultUraDora(info){
  try{
    return !!(
      isResultUraDoraEnabled() &&
      info &&
      info.input &&
      info.input.isRiichi &&
      lastAgariType !== "ryukyoku" &&
      Array.isArray(uraDoraIndicators) &&
      uraDoraIndicators.length > 0
    );
  }catch(e){
    return false;
  }
}

// ================================
// 上段中央の小型ドラ帯
// ================================
function ensureResultTopDoraStrip(){
  if (!resultTopRowEl) return null;

  let strip = document.getElementById("resultTopDoraStrip");
  if (strip) return strip;

  strip = document.createElement("div");
  strip.id = "resultTopDoraStrip";
  strip.style.display = "flex";
  strip.style.flexDirection = "row";
  strip.style.alignItems = "center";
  strip.style.justifyContent = "flex-start";
  strip.style.gap = "72px";
  strip.style.minWidth = "0";
  strip.style.width = "100%";
  strip.style.flexWrap = "nowrap";
  strip.style.padding = "0";
  strip.style.margin = "0";

  const doraGroup = document.createElement("div");
  doraGroup.id = "resultTopDoraGroup";
  doraGroup.style.display = "flex";
  doraGroup.style.flexDirection = "row";
  doraGroup.style.alignItems = "center";
  doraGroup.style.gap = "8px";
  doraGroup.style.minWidth = "0";
  doraGroup.style.flexWrap = "nowrap";
  doraGroup.style.flex = "0 0 auto";

  const doraLabel = document.createElement("div");
  doraLabel.id = "resultTopDoraLabel";
  doraLabel.textContent = "ドラ";
  doraLabel.style.fontWeight = "700";
  doraLabel.style.fontSize = "14px";
  doraLabel.style.lineHeight = "1";
  doraLabel.style.whiteSpace = "nowrap";

  const doraTiles = document.createElement("div");
  doraTiles.id = "resultTopDoraTiles";
  doraTiles.style.display = "flex";
  doraTiles.style.flexDirection = "row";
  doraTiles.style.alignItems = "center";
  doraTiles.style.gap = "0px";
  doraTiles.style.lineHeight = "0";
  doraTiles.style.flexWrap = "nowrap";
  doraTiles.style.minHeight = "44px";
  doraTiles.style.flex = "0 0 auto";

  doraGroup.appendChild(doraLabel);
  doraGroup.appendChild(doraTiles);

  const uraGroup = document.createElement("div");
  uraGroup.id = "resultTopUraDoraGroup";
  uraGroup.style.display = "flex";
  uraGroup.style.flexDirection = "row";
  uraGroup.style.alignItems = "center";
  uraGroup.style.gap = "8px";
  uraGroup.style.minWidth = "0";
  uraGroup.style.flexWrap = "nowrap";
  uraGroup.style.flex = "0 0 auto";

  const uraLabel = document.createElement("div");
  uraLabel.id = "resultTopUraDoraLabel";
  uraLabel.textContent = "裏ドラ";
  uraLabel.style.fontWeight = "700";
  uraLabel.style.fontSize = "14px";
  uraLabel.style.lineHeight = "1";
  uraLabel.style.whiteSpace = "nowrap";

  const uraTiles = document.createElement("div");
  uraTiles.id = "resultTopUraDoraTiles";
  uraTiles.style.display = "flex";
  uraTiles.style.flexDirection = "row";
  uraTiles.style.alignItems = "center";
  uraTiles.style.gap = "0px";
  uraTiles.style.lineHeight = "0";
  uraTiles.style.flexWrap = "nowrap";
  uraTiles.style.minHeight = "44px";
  uraTiles.style.flex = "0 0 auto";

  uraGroup.appendChild(uraLabel);
  uraGroup.appendChild(uraTiles);

  strip.appendChild(doraGroup);
  strip.appendChild(uraGroup);

  const winTypeNode = resultWinTypeEl;
  if (winTypeNode && winTypeNode.nextSibling){
    resultTopRowEl.insertBefore(strip, winTypeNode.nextSibling);
  } else {
    resultTopRowEl.appendChild(strip);
  }

  return strip;
}

function getResultTopDoraTilesEl(){
  const strip = ensureResultTopDoraStrip();
  if (!strip) return null;
  return document.getElementById("resultTopDoraTiles");
}

function getResultTopUraDoraTilesEl(){
  const strip = ensureResultTopDoraStrip();
  if (!strip) return null;
  return document.getElementById("resultTopUraDoraTiles");
}


function ensureResultPointSubTextEl(){
  if (!resultPointTextEl) return null;

  let sub = document.getElementById("resultPointSubText");
  if (sub) return sub;

  sub = document.createElement("div");
  sub.id = "resultPointSubText";
  sub.style.marginTop = "6px";
  sub.style.fontSize = "18px";
  sub.style.fontWeight = "700";
  sub.style.lineHeight = "1.1";
  sub.style.opacity = "0.9";
  sub.style.color = "rgba(255, 220, 140, 0.92)";
  sub.style.textAlign = "right";

  const parent = resultPointTextEl.parentNode;
  if (parent){
    parent.appendChild(sub);
  }
  return sub;
}

function ensureResultPointChipTextEl(){
  if (!resultPointTextEl) return null;

  let sub = document.getElementById("resultPointChipText");
  if (sub) return sub;

  sub = document.createElement("div");
  sub.id = "resultPointChipText";
  sub.style.marginTop = "6px";
  sub.style.fontSize = "20px";
  sub.style.fontWeight = "800";
  sub.style.lineHeight = "1.1";
  sub.style.opacity = "0.96";
  sub.style.color = "rgba(148, 245, 226, 0.96)";
  sub.style.textAlign = "right";
  sub.style.textShadow = "0 1px 3px rgba(0,0,0,0.82)";

  const parent = resultPointTextEl.parentNode;
  if (parent){
    parent.appendChild(sub);
  }
  return sub;
}

function arrangeResultTopRowLayout(){
  if (!resultTopRowEl || !resultWinTypeEl || !resultWinnerEl) return;

  const compact = isCompactLandscapePhoneForResult();
  ensureResultTopDoraStrip();

  resultTopRowEl.style.display = "grid";
  resultTopRowEl.style.gridTemplateColumns = compact ? "auto minmax(0, 1fr)" : "auto minmax(0, 1fr) auto";
  resultTopRowEl.style.alignItems = "center";
  resultTopRowEl.style.columnGap = compact ? "8px" : "18px";
  resultTopRowEl.style.rowGap = compact ? "6px" : "8px";
  resultTopRowEl.style.gridTemplateAreas = compact ? '"winType winner"' : "none";

  resultWinTypeEl.style.alignSelf = "center";
  resultWinTypeEl.style.gridArea = compact ? "winType" : "auto";
  resultWinnerEl.style.alignSelf = "center";
  resultWinnerEl.style.gridArea = compact ? "winner" : "auto";

  const strip = document.getElementById("resultTopDoraStrip");
  if (strip){
    strip.style.alignSelf = "center";
    strip.style.justifySelf = "stretch";
    strip.style.display = compact ? "none" : "flex";
  }

  if (resultInfoRowEl){
    resultInfoRowEl.style.display = compact ? "grid" : "none";
  }

  if (resultDoraBlockEl){
    resultDoraBlockEl.style.display = compact ? "" : "none";
  }

  if (resultUraDoraBlockEl){
    resultUraDoraBlockEl.style.display = compact ? "" : "none";
  }
}

// ================================
// 牌表示補助
// ================================
function cloneTileLike(tile){
  if (!tile || !tile.code) return null;
  return {
    code: tile.code,
    imgCode: tile.imgCode || tile.code
  };
}

function cloneMeldLike(meld){
  if (!meld || !meld.code) return null;
  return {
    type: meld.type || "ankan",
    code: meld.code,
    from: meld.from || null,
    redCount: Number.isFinite(meld.redCount) ? meld.redCount : 0,
    tiles: Array.isArray(meld.tiles)
      ? meld.tiles.map((tile)=> cloneTileLike(tile)).filter(Boolean)
      : [],
    addedTile: cloneTileLike(meld.addedTile)
  };
}

function appendTileImgToResult(el, tile){
  if (!el || !tile || !tile.code) return;
  const img = makeTileImg(tile);
  el.appendChild(img);
}

function appendCompactTileImgToResult(el, tile){
  if (!el || !tile || !tile.code) return;
  const img = makeTileImg(tile);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.maxHeight = "44px";
  img.style.width = "auto";
  el.appendChild(img);
}

function clearResultTiles(el){
  if (!el) return;
  el.innerHTML = "";
}

// ================================
// 保存済みロン牌取得
// - 推定ではなく、和了時点で保存した放銃牌を使う
// ================================
function getSavedRonTileLike(entryOverride){
  const entry = entryOverride || getCurrentAgariViewEntry();
  if (entry && entry.ronTile && entry.ronTile.code){
    return {
      code: entry.ronTile.code,
      imgCode: entry.ronTile.imgCode || entry.ronTile.code
    };
  }

  if (typeof lastAgariRonTile === "undefined") return null;
  if (!lastAgariRonTile || !lastAgariRonTile.code) return null;
  return {
    code: lastAgariRonTile.code,
    imgCode: lastAgariRonTile.imgCode || lastAgariRonTile.code
  };
}

// ================================
// 勝者の手牌取得
// - concealedTiles: 通常手牌部分（ツモ牌はここに含める）
// - meldList: 副露
// - ronTile: ロン牌だけ独立表示
// ================================
function getResultWinnerHandParts(entryOverride){
  const entry = entryOverride || getCurrentAgariViewEntry();
  const winner = entry ? entry.winnerSeatIndex : null;
  const winType = entry ? entry.winType : null;

  const concealedTiles = [];
  const meldList = [];
  const peiTiles = [];
  let ronTile = null;

  if (winner === 0){
    if (Array.isArray(hand13)){
      for (const t of hand13){
        const c = cloneTileLike(t);
        if (c) concealedTiles.push(c);
      }
    }

    if (Array.isArray(melds)){
      for (const m of melds){
        const c = cloneMeldLike(m);
        if (c) meldList.push(c);
      }
    }

    if (Array.isArray(peis)){
      for (const t of peis){
        const c = cloneTileLike(t);
        if (c) peiTiles.push(c);
      }
    }

    if (winType === "tsumo"){
      if (drawn && drawn.code){
        const c = cloneTileLike(drawn);
        if (c) concealedTiles.push(c);
      }
    } else if (winType === "ron"){
      const rt = getSavedRonTileLike(entry);
      if (rt && rt.code){
        ronTile = { code: rt.code, imgCode: rt.imgCode || rt.code };
      }
    }

    return {
      concealedTiles,
      meldList,
      peiTiles,
      ronTile
    };
  }

  if (winner === 1){
    if (Array.isArray(cpuRightHand13)){
      for (const t of cpuRightHand13){
        const c = cloneTileLike(t);
        if (c) concealedTiles.push(c);
      }
    }

    if (typeof getCpuMeldRefBySeat === "function" && Array.isArray(getCpuMeldRefBySeat(1))){
      for (const m of getCpuMeldRefBySeat(1)){
        const c = cloneMeldLike(m);
        if (c) meldList.push(c);
      }
    }

    if (typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(1))){
      for (const t of getCpuPeiRefBySeat(1)){
        const c = cloneTileLike(t);
        if (c) peiTiles.push(c);
      }
    }

    if (winType === "tsumo"){
      const dt = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(1) : null;
      if (dt && dt.code){
        const c = cloneTileLike(dt);
        if (c) concealedTiles.push(c);
      }
    } else if (winType === "ron"){
      const rt = getSavedRonTileLike(entry);
      if (rt && rt.code){
        ronTile = { code: rt.code, imgCode: rt.imgCode || rt.code };
      }
    }

    return {
      concealedTiles,
      meldList,
      peiTiles,
      ronTile
    };
  }

  if (winner === 2){
    if (Array.isArray(cpuLeftHand13)){
      for (const t of cpuLeftHand13){
        const c = cloneTileLike(t);
        if (c) concealedTiles.push(c);
      }
    }

    if (typeof getCpuMeldRefBySeat === "function" && Array.isArray(getCpuMeldRefBySeat(2))){
      for (const m of getCpuMeldRefBySeat(2)){
        const c = cloneMeldLike(m);
        if (c) meldList.push(c);
      }
    }

    if (typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(2))){
      for (const t of getCpuPeiRefBySeat(2)){
        const c = cloneTileLike(t);
        if (c) peiTiles.push(c);
      }
    }

    if (winType === "tsumo"){
      const dt = (typeof getCpuDrawnTileBySeat === "function") ? getCpuDrawnTileBySeat(2) : null;
      if (dt && dt.code){
        const c = cloneTileLike(dt);
        if (c) concealedTiles.push(c);
      }
    } else if (winType === "ron"){
      const rt = getSavedRonTileLike(entry);
      if (rt && rt.code){
        ronTile = { code: rt.code, imgCode: rt.imgCode || rt.code };
      }
    }

    return {
      concealedTiles,
      meldList,
      peiTiles,
      ronTile
    };
  }

  return {
    concealedTiles,
    meldList,
    peiTiles,
    ronTile
  };
}

function getResultWinnerTiles(entryOverride){
  const parts = getResultWinnerHandParts(entryOverride);
  const list = [];

  if (Array.isArray(parts.concealedTiles)){
    for (const t of parts.concealedTiles){
      const c = cloneTileLike(t);
      if (c) list.push(c);
    }
  }

  if (parts.ronTile && parts.ronTile.code){
    list.push({ code: parts.ronTile.code, imgCode: parts.ronTile.imgCode || parts.ronTile.code });
  }

  return list;
}

// ================================
// 結果画面用：副露表示ヘルパ
// - 通常手牌は gap 0 で詰める
// - 副露ブロック内は詰める
// - 副露ブロック同士は少し空ける
// - ロン牌は最後に独立表示
// ================================
function resultCreateHandRoot(){
  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "row";
  root.style.alignItems = "flex-end";
  root.style.flexWrap = "wrap";
  root.style.columnGap = "0px";
  root.style.rowGap = "10px";
  root.style.lineHeight = "0";
  return root;
}

function resultCreateConcealedWrap(){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "0px";
  wrap.style.lineHeight = "0";
  wrap.style.flexWrap = "nowrap";
  return wrap;
}

function resultCreateMeldAreaWrap(){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "18px";
  wrap.style.lineHeight = "0";
  wrap.style.flexWrap = "nowrap";
  wrap.style.marginLeft = "18px";
  return wrap;
}

function resultCreateRonTileWrap(){
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "0px";
  wrap.style.lineHeight = "0";
  wrap.style.marginLeft = "18px";
  return wrap;
}

function resultUprightImg(code){
  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function resultHaimenImg(){
  if (typeof makeHaimenImg === "function"){
    const img = makeHaimenImg();
    img.style.display = "block";
    img.style.margin = "0";
    img.style.padding = "0";
    return img;
  }

  const img = makeImgByCode("1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.opacity = "0.35";
  return img;
}

function resultCalledRotatedImg(code){
  const img = makeImgByCode(code);
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.transform = "rotate(90deg)";
  img.style.transformOrigin = "center center";
  img.style.marginLeft = "6px";
  img.style.marginRight = "6px";
  img.style.translate = "0 5px";
  return img;
}

function resultCreateMeldWrapBase(){
  const wrap = document.createElement("div");
  wrap.className = "meld";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "0px";
  wrap.style.lineHeight = "0";
  return wrap;
}

function resultBuildMeldNode(m){
  if (!m || !m.code) return null;

  const type = m.type || "ankan";
  const code = m.code;

  if (type === "pon"){
    const wrap = resultCreateMeldWrapBase();
    const from = m.from;
    const n = 3;

    for (let i = 0; i < n; i++){
      const isCalled =
        (from === "R" && i === n - 1) ||
        (from === "L" && i === 0);

      const img = isCalled ? resultCalledRotatedImg(code) : resultUprightImg(code);
      wrap.appendChild(img);
    }

    return wrap;
  }

  if (type === "minkan"){
    const wrap = resultCreateMeldWrapBase();
    const from = m.from;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.alignItems = "flex-end";
    row.style.gap = "0px";
    row.style.lineHeight = "0";

    for (let i = 0; i < 3; i++){
      row.appendChild(resultUprightImg(code));
    }

    const called = resultCalledRotatedImg(code);

    if (from === "L"){
      wrap.appendChild(called);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(row);
      wrap.appendChild(called);
    }

    return wrap;
  }

  if (type === "kakan"){
    const wrap = resultCreateMeldWrapBase();
    const from = m.from;
    const n = 3;

    for (let i = 0; i < n; i++){
      const isCalled =
        (from === "R" && i === n - 1) ||
        (from === "L" && i === 0);

      if (!isCalled){
        wrap.appendChild(resultUprightImg(code));
        continue;
      }

      const stack = document.createElement("span");
      stack.style.position = "relative";
      stack.style.display = "inline-block";
      stack.style.lineHeight = "0";
      stack.style.margin = "0";
      stack.style.padding = "0";

      const baseCalled = resultCalledRotatedImg(code);

      const top = makeImgByCode(code);
      top.style.position = "absolute";
      top.style.display = "block";
      top.style.margin = "0";
      top.style.padding = "0";
      top.style.left = "50%";
      top.style.top = "-28px";
      top.style.transform = "translateX(-50%) rotate(90deg)";
      top.style.transformOrigin = "center center";
      top.style.zIndex = "2";
      top.style.pointerEvents = "none";

      stack.appendChild(baseCalled);
      stack.appendChild(top);

      wrap.appendChild(stack);
    }

    return wrap;
  }

  const wrap = resultCreateMeldWrapBase();
  wrap.appendChild(resultHaimenImg());
  wrap.appendChild(resultUprightImg(code));
  wrap.appendChild(resultUprightImg(code));
  wrap.appendChild(resultHaimenImg());
  return wrap;
}

function renderResultHandTiles(entryOverride){
  if (!resultHandTilesEl) return;

  clearResultTiles(resultHandTilesEl);

  const targetEntry = entryOverride || getCurrentAgariViewEntry();
  const parts = getResultWinnerHandParts(targetEntry);

  resultHandTilesEl.style.display = "block";
  resultHandTilesEl.style.lineHeight = "0";

  const root = resultCreateHandRoot();

  const concealedWrap = resultCreateConcealedWrap();
  for (const t of parts.concealedTiles){
    if (!t || !t.code) continue;
    const img = makeTileImg(t);
    img.style.display = "block";
    img.style.margin = "0";
    img.style.padding = "0";
    concealedWrap.appendChild(img);
  }
  root.appendChild(concealedWrap);

  if (parts.ronTile && parts.ronTile.code){
    const ronWrap = resultCreateRonTileWrap();
    const img = makeTileImg(parts.ronTile);
    img.style.display = "block";
    img.style.margin = "0";
    img.style.padding = "0";
    ronWrap.appendChild(img);
    root.appendChild(ronWrap);
  }

  if (Array.isArray(parts.meldList) && parts.meldList.length > 0){
    const meldArea = resultCreateMeldAreaWrap();
    for (const m of parts.meldList){
      const node = resultBuildMeldNode(m);
      if (node) meldArea.appendChild(node);
    }
    root.appendChild(meldArea);
  }

  resultHandTilesEl.appendChild(root);
}

// ================================
// 表示用ドラ牌
// - 中央表示と同じく「表示牌の次」を見せる
// ================================
function getDisplayDoraTileLikes(indicators){
  const list = [];
  if (!Array.isArray(indicators)) return list;

  for (const d of indicators){
    if (!d || !d.code) continue;

    let code = d.code;
    if (typeof getDoraCodeFromIndicator === "function"){
      code = getDoraCodeFromIndicator(d.code);
    }

    list.push({ code, imgCode: code });
  }

  return list;
}

// ================================
// 役情報取得
// ================================
function getResultYakuInfoByEntry(entry){
  const fallbackEntry = getCurrentAgariViewEntry();
  const targetEntry = entry || fallbackEntry;
  const winner = targetEntry ? targetEntry.winnerSeatIndex : null;
  const winType = targetEntry ? targetEntry.winType : null;

  if (winner == null || !winType) return null;

  if (winType === "nagashi"){
    if (typeof createNagashiBaimanYakuInfo !== "function") return null;
    try{
      return createNagashiBaimanYakuInfo(winner);
    }catch(e){
      return null;
    }
  }

  if (winner === 0){
    if (typeof getCurrentPlayerAgariYakuInfo !== "function") return null;

    const ronTile = (winType === "ron")
      ? ((targetEntry && targetEntry.ronTile && targetEntry.ronTile.code)
        ? { code: targetEntry.ronTile.code, imgCode: targetEntry.ronTile.imgCode || targetEntry.ronTile.code }
        : getSavedRonTileLike(targetEntry))
      : null;
    try{
      return getCurrentPlayerAgariYakuInfo(winType, ronTile, {
        isOpenRiichiForcedDealInYakuman: !!(targetEntry && targetEntry.isOpenRiichiForcedDealInYakuman)
      });
    }catch(e){
      return null;
    }
  }

  const parts = getResultWinnerHandParts(targetEntry);
  const tiles14 = [];

  if (Array.isArray(parts.concealedTiles)){
    for (const t of parts.concealedTiles){
      if (t && t.code){
        const imgCode = normalizeResultTileImgCode(t.imgCode || t.code, t.code);
        const colorKey = getResultTileColorKey({ ...t, imgCode });
        tiles14.push({
          code: t.code,
          imgCode,
          colorKey,
          isRed: !!t.isRed || colorKey === "r"
        });
      }
    }
  }

  if (winType === "ron" && parts.ronTile && parts.ronTile.code){
    const ronImgCode = normalizeResultTileImgCode(parts.ronTile.imgCode || parts.ronTile.code, parts.ronTile.code);
    const ronColorKey = getResultTileColorKey({ ...parts.ronTile, imgCode: ronImgCode });
    tiles14.push({
      code: parts.ronTile.code,
      imgCode: ronImgCode,
      colorKey: ronColorKey,
      isRed: !!parts.ronTile.isRed || ronColorKey === "r"
    });
  }

  const meldList = Array.isArray(parts.meldList) ? parts.meldList.slice() : [];
  const totalCount = tiles14.length + meldList.reduce((sum, m)=>{
    if (!m || !m.type) return sum;

    if (typeof getAgariShapeMeldTileCount === "function"){
      return sum + getAgariShapeMeldTileCount(m);
    }

    if (m.type === "pon") return sum + 3;
    if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") return sum + 3;
    return sum;
  }, 0);

  if (totalCount !== 14) return null;
  if (typeof getAgariYakuInfo !== "function") return null;

  try{
    return getAgariYakuInfo({
      tiles14: tiles14,
      meldList: meldList,
      winType: winType,
      winTileCode: (winType === "ron" && parts.ronTile && parts.ronTile.code)
        ? parts.ronTile.code
        : (tiles14[tiles14.length - 1] ? tiles14[tiles14.length - 1].code : null),
      isRiichi:
        (winner === 1) ? !!cpuRightRiichi :
        (winner === 2) ? !!cpuLeftRiichi :
        false,
      isOpenRiichi: (typeof isCpuOpenRiichiSeat === "function") ? isCpuOpenRiichiSeat(winner) : false,
      isOpenRiichiForcedDealInYakuman: !!(targetEntry && targetEntry.isOpenRiichiForcedDealInYakuman),
      roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
      seatWind: resultSeatWindBySeatIndex(winner),
      doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : [],
      uraDoraIndicators: Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [],
      peis:
        (typeof getCpuPeiRefBySeat === "function" && Array.isArray(getCpuPeiRefBySeat(winner)))
          ? getCpuPeiRefBySeat(winner).slice()
          : [],
      ...((typeof getWinSituationFlags === "function") ? getWinSituationFlags(winType, winner) : {})
    });
  }catch(e){
    return null;
  }
}

// ================================
// 役一覧レイアウト
// - 2列表示で縦伸びを抑える
// ================================
function applyResultYakuListLayout(){
  if (!resultYakuListEl) return;

  resultYakuListEl.style.display = "grid";
  resultYakuListEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  resultYakuListEl.style.columnGap = "12px";
  resultYakuListEl.style.rowGap = "10px";
  resultYakuListEl.style.alignItems = "stretch";
}

function createResultYakuRow(nameText, hanText, spanAll = false){
  const row = document.createElement("div");
  row.className = "resultYakuRow";

  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "10px";
  row.style.minWidth = "0";

  if (spanAll){
    row.style.gridColumn = "1 / -1";
  }

  const name = document.createElement("div");
  name.className = "resultYakuName";
  name.textContent = nameText || "";
  name.style.minWidth = "0";
  name.style.flex = "1 1 auto";

  const han = document.createElement("div");
  han.className = "resultYakuHan";
  han.textContent = hanText || "";
  han.style.flex = "0 0 auto";
  han.style.whiteSpace = "nowrap";

  row.appendChild(name);
  row.appendChild(han);

  return row;
}

// ================================
// 役一覧描画
// ================================

function getResultYakuInfo(){
  return getResultYakuInfoByEntry(getCurrentAgariViewEntry());
}

function normalizeResultTileImgCode(imgCode, code = ""){
  const raw = String(imgCode || code || "");
  if (!raw) return String(code || "");
  return raw;
}

function getResultTileColorKey(tile){
  if (!tile || typeof tile !== "object") return "";
  if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
  const imgCode = normalizeResultTileImgCode(tile.imgCode || tile.code || "", tile.code || "");
  if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
  return tile.isRed ? "r" : "";
}

function isResultRainbowNorthTile(tile){
  if (!tile || typeof tile !== "object") return false;
  const imgCode = normalizeResultTileImgCode(tile.imgCode || tile.code || "", tile.code || "");
  return imgCode === "n4z";
}

function createDefaultChipTargetTileSettingForResult(){
  return {
    dora: false,
    doraCount: "0",
    chipValue: "0",
    targetMode: "menzen",
    useDetailedDora: false,
    useDetailedChip: false,
    doraMenzenCount: "0",
    doraFuroCount: "0",
    chipMenzenCount: "0",
    chipFuroCount: "0"
  };
}

function normalizeChipTargetTileSettingForResult(value){
  const src = (value && typeof value === "object") ? value : {};
  let rawMode = String(src.targetMode != null ? src.targetMode : "menzen");
  if (rawMode !== "naki") rawMode = "menzen";

  const baseDoraCount = String(src.doraCount != null ? src.doraCount : "0");
  const baseChipValue = String(src.chipValue != null ? src.chipValue : "0");
  const useDetailedDora = !!src.useDetailedDora;
  const useDetailedChip = !!src.useDetailedChip;

  return {
    dora: !!src.dora,
    doraCount: baseDoraCount,
    chipValue: baseChipValue,
    targetMode: rawMode,
    useDetailedDora: useDetailedDora,
    useDetailedChip: useDetailedChip,
    doraMenzenCount: useDetailedDora
      ? String(src.doraMenzenCount != null ? src.doraMenzenCount : baseDoraCount)
      : baseDoraCount,
    doraFuroCount: useDetailedDora
      ? String(src.doraFuroCount != null ? src.doraFuroCount : baseDoraCount)
      : baseDoraCount,
    chipMenzenCount: useDetailedChip
      ? String(src.chipMenzenCount != null ? src.chipMenzenCount : baseChipValue)
      : baseChipValue,
    chipFuroCount: useDetailedChip
      ? String(src.chipFuroCount != null ? src.chipFuroCount : baseChipValue)
      : baseChipValue
  };
}

function getAllChipTargetSettingsForResult(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getChipTargetSettings === "function"){
      return window.MBSanmaRulesConfig.getChipTargetSettings() || {};
    }
  }catch(e){}
  return {};
}

function findChipTargetSettingForResultTile(tile){
  const all = getAllChipTargetSettingsForResult();
  const code = String(tile && tile.code || "");
  const imgCode = normalizeResultTileImgCode(tile && (tile.imgCode || tile.code) || "", code);
  const keys = [];
  if (imgCode) keys.push(imgCode);
  if (code && !keys.includes(code)) keys.push(code);

  for (const key of keys){
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getEffectiveChipTargetSetting === "function"){
      return {
        exists: Object.prototype.hasOwnProperty.call(all, key),
        key,
        setting: window.MBSanmaRulesConfig.getEffectiveChipTargetSetting(key)
      };
    }
    if (Object.prototype.hasOwnProperty.call(all, key)){
      return {
        exists: true,
        key,
        setting: normalizeChipTargetTileSettingForResult(all[key])
      };
    }
  }

  return {
    exists: false,
    key: "",
    setting: normalizeChipTargetTileSettingForResult(createDefaultChipTargetTileSettingForResult())
  };
}

function parseChipTargetCountForResult(value){
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function getConfiguredChipCountForResultTile(tile, menzen, context = "hand"){
  if (!tile || typeof tile !== "object") return 0;

  const found = findChipTargetSettingForResultTile(tile);
  const setting = found.setting || normalizeChipTargetTileSettingForResult(createDefaultChipTargetTileSettingForResult());
  const targetMode = setting.targetMode === "naki" ? "naki" : "menzen";

  if (setting.chipCount && typeof setting.chipCount === "object"){
    return parseChipTargetCountForResult(menzen ? setting.chipCount.menzen : setting.chipCount.furo);
  }

  if (!setting.useDetailedChip){
    if (!menzen && targetMode !== "naki") return 0;
    return parseChipTargetCountForResult(setting.chipValue);
  }

  return parseChipTargetCountForResult(menzen ? setting.chipMenzenCount : setting.chipFuroCount);
}

function isResultMenzenMeldList(meldList){
  if (!Array.isArray(meldList) || meldList.length <= 0) return true;
  for (const meld of meldList){
    if (!meld) continue;
    const type = meld.type || "ankan";
    if (type !== "ankan") return false;
  }
  return true;
}

function countChipTargetTilesFromTileList(tileList, menzen, context = "hand"){
  if (!Array.isArray(tileList)) return 0;
  let count = 0;
  for (const tile of tileList){
    count += getConfiguredChipCountForResultTile(tile, menzen, context);
  }
  return count;
}

function getResultMeldTileLikes(meld){
  const out = [];
  if (!meld || typeof meld !== "object") return out;

  if (Array.isArray(meld.tiles)){
    for (const tile of meld.tiles){
      const c = cloneTileLike(tile);
      if (c) out.push(c);
    }
  }

  if (meld.addedTile && meld.addedTile.code){
    const c = cloneTileLike(meld.addedTile);
    if (c) out.push(c);
  }

  return out;
}

function countChipTargetTilesFromMeldList(meldList, menzen){
  if (!Array.isArray(meldList)) return 0;
  let count = 0;
  for (const meld of meldList){
    if (!meld) continue;

    const meldTiles = getResultMeldTileLikes(meld);
    if (meldTiles.length > 0){
      count += countChipTargetTilesFromTileList(meldTiles, menzen, "hand");
      continue;
    }

  }
  return count;
}

function countRainbowNorthChipTilesFromTileList(tileList, menzen){
  return countChipTargetTilesFromTileList(tileList, menzen, "pei");
}

function countNukiChipTilesFromTileList(tileList, menzen){
  return countRainbowNorthChipTilesFromTileList(tileList, menzen);
}

function getResultBonusColorDoraCount(info){
  const bonus = info && info.bonus && typeof info.bonus === "object" ? info.bonus : null;
  if (!bonus) return 0;
  return Number.isFinite(Number(bonus.colorDora)) ? (Number(bonus.colorDora) | 0) : 0;
}

function getResultBonusNukiDoraCount(info){
  const bonus = info && info.bonus && typeof info.bonus === "object" ? info.bonus : null;
  if (!bonus) return 0;
  return Number.isFinite(Number(bonus.nukiDora)) ? (Number(bonus.nukiDora) | 0) : 0;
}

function hasIppatsuChipYaku(info){
  const list = (info && Array.isArray(info.yaku)) ? info.yaku : [];
  return list.some((yaku)=>{
    const key = String(yaku && yaku.key ? yaku.key : "").toLowerCase();
    const name = String(yaku && yaku.name ? yaku.name : "");
    return key.includes("ippatsu") || name.includes("一発");
  });
}

function getRuleValueForResult(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isShiroPocchiEnabledForResult(){
  return String(getRuleValueForResult("overview-chip-target-shiro-pocchi", "off") || "").toLowerCase() === "on";
}

function getShiroPocchiChipCountForResult(){
  const n = Number(getRuleValueForResult("overview-chip-target-shiro-pocchi-count", 1));
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.round(n));
}

function isShiroPocchiTileForResult(tile){
  if (!tile || typeof tile !== "object") return false;
  if (typeof isShiroPocchiTile === "function") return !!isShiroPocchiTile(tile);
  return normalizeResultTileImgCode(tile.imgCode || tile.code || "", tile.code || "") === "siropocchi";
}

function countShiroPocchiTilesFromTileList(tileList){
  if (!Array.isArray(tileList)) return 0;
  let count = 0;
  for (const tile of tileList){
    if (isShiroPocchiTileForResult(tile)) count += 1;
  }
  return count;
}

function getOverviewIppatsuUraChipModeForResult(){
  const raw = String(getRuleValueForResult("overview-chip-target-ippatsu-ura", "both") || "").toLowerCase();
  if (raw === "ippatsu") return "ippatsu";
  if (raw === "ura") return "ura";
  if (raw === "none") return "none";
  return "both";
}

function shouldCountUraChipForResult(){
  const mode = getOverviewIppatsuUraChipModeForResult();
  return mode === "both" || mode === "ura";
}

function shouldCountIppatsuChipForResult(){
  const mode = getOverviewIppatsuUraChipModeForResult();
  return mode === "both" || mode === "ippatsu";
}

function buildResultChipInfoByEntry(entryOverride){
  const entry = entryOverride || getCurrentAgariViewEntry();
  const winner = entry ? entry.winnerSeatIndex : null;
  const winType = entry ? entry.winType : null;
  const discarder = entry && (entry.discarderSeatIndex === 0 || entry.discarderSeatIndex === 1 || entry.discarderSeatIndex === 2)
    ? entry.discarderSeatIndex
    : null;

  const empty = {
    winType,
    winnerSeatIndex: winner,
    discarderSeatIndex: discarder,
    menzen: false,
    colorChipCount: 0,
    targetTileChipCount: 0,
    peiChipCount: 0,
    nukiChipCount: 0,
    uraChipCount: 0,
    ippatsuChipCount: 0,
    baseChipUnits: 0,
    totalWinnerGain: 0,
    displayText: "",
    delta: [0, 0, 0],
    hasChip: false
  };

  if (winner !== 0 && winner !== 1 && winner !== 2) return empty;
  if (winType !== "tsumo" && winType !== "ron") return empty;

  const parts = getResultWinnerHandParts(entry);
  const meldList = Array.isArray(parts && parts.meldList) ? parts.meldList : [];
  const menzen = isResultMenzenMeldList(meldList);
  const info = getResultYakuInfoByEntry(entry);

  let colorChipCount = 0;
  colorChipCount += countChipTargetTilesFromTileList(parts && parts.concealedTiles, menzen, "hand");
  if (parts && parts.ronTile) colorChipCount += countChipTargetTilesFromTileList([parts.ronTile], menzen, "hand");
  colorChipCount += countChipTargetTilesFromMeldList(meldList, menzen);

  const peiChipCount = countNukiChipTilesFromTileList(parts && parts.peiTiles, menzen);
  const uraChipCount = shouldCountUraChipForResult() && info && info.bonus && Number.isFinite(info.bonus.uraDora) && info.bonus.uraDora > 0
    ? (info.bonus.uraDora | 0)
    : 0;
  const ippatsuChipCount = shouldCountIppatsuChipForResult() && hasIppatsuChipYaku(info) ? 1 : 0;
  const shiroPocchiTileCount = (winType === "tsumo") ? countShiroPocchiTilesFromTileList(parts && parts.concealedTiles) : 0;
  const shiroPocchiChipCount = (winType === "tsumo" && isShiroPocchiEnabledForResult() && shiroPocchiTileCount > 0)
    ? (shiroPocchiTileCount * getShiroPocchiChipCountForResult())
    : 0;
  const baseChipUnits = Math.max(0, (colorChipCount | 0) + (peiChipCount | 0) + (uraChipCount | 0) + (ippatsuChipCount | 0) + (shiroPocchiChipCount | 0));
  const delta = [0, 0, 0];

  if (baseChipUnits > 0){
    if (winType === "tsumo"){
      for (let seat = 0; seat < 3; seat++){
        if (seat === winner) continue;
        delta[seat] -= baseChipUnits;
        delta[winner] += baseChipUnits;
      }
    } else if (discarder === 0 || discarder === 1 || discarder === 2){
      delta[discarder] -= baseChipUnits;
      delta[winner] += baseChipUnits;
    }
  }

  return {
    winType,
    winnerSeatIndex: winner,
    discarderSeatIndex: discarder,
    menzen,
    colorChipCount,
    targetTileChipCount: colorChipCount,
    peiChipCount,
    nukiChipCount: peiChipCount,
    uraChipCount,
    ippatsuChipCount,
    shiroPocchiChipCount,
    baseChipUnits,
    totalWinnerGain: delta[winner] | 0,
    displayText: baseChipUnits > 0 ? (winType === "tsumo" ? `${baseChipUnits}枚オール` : `${baseChipUnits}枚`) : "",
    delta,
    hasChip: baseChipUnits > 0
  };
}

function renderResultYakuList(info){
  if (!resultYakuListEl) return;

  resultYakuListEl.innerHTML = "";
  applyResultYakuListLayout();

  if (!info){
    resultYakuListEl.appendChild(
      createResultYakuRow("役情報なし", "", true)
    );
    return;
  }

  const yakuList = Array.isArray(info.yaku) ? info.yaku.slice() : [];
  const bonusRows = [];

  if (info && info.bonus){
    const colorDora = getResultBonusColorDoraCount(info);
    const nukiDora = getResultBonusNukiDoraCount(info);

    if ((info.bonus.dora | 0) > 0){
      bonusRows.push({ name: "ドラ", hanText: `${info.bonus.dora | 0}翻` });
    }
    if ((info.bonus.uraDora | 0) > 0){
      bonusRows.push({ name: "裏ドラ", hanText: `${info.bonus.uraDora | 0}翻` });
    }
    if (colorDora > 0){
      bonusRows.push({ name: "色ドラ", hanText: `${colorDora}翻` });
    }
    if (nukiDora > 0){
      bonusRows.push({ name: "抜きドラ", hanText: `${nukiDora}翻` });
    }
  }

  if (yakuList.length === 0 && bonusRows.length === 0){
    resultYakuListEl.appendChild(
      createResultYakuRow("役なし", "", true)
    );
    return;
  }

  for (const y of yakuList){
    if (!y) continue;

    let hanText = "";
    if ((y.yakuman | 0) > 0){
      hanText = "役満";
    } else {
      hanText = `${y.han | 0}翻`;
    }

    resultYakuListEl.appendChild(
      createResultYakuRow(y.name || y.key || "", hanText)
    );
  }

  for (const b of bonusRows){
    resultYakuListEl.appendChild(
      createResultYakuRow(b.name, b.hanText)
    );
  }
}

// ================================
// 結果画面描画
// ================================
function renderResultOverlay(){
  if (!resultOverlay) return;

  installDefaultGameOverlayNoZoomGuards();

  const entry = getCurrentAgariViewEntry();
  const winner = entry ? entry.winnerSeatIndex : null;
  const winType = entry ? entry.winType : null;
  const isRyukyoku = (winType === "ryukyoku");
  const isNagashi = (winType === "nagashi");
  const ryukyokuSettlement = isRyukyoku ? getResultRyukyokuSettlement() : null;

  if (resultTitleEl){
    resultTitleEl.textContent = isRyukyoku ? "流局結果" : "和了結果";
  }

  if (resultSubtitleEl){
    resultSubtitleEl.textContent = "クリックで次へ";
  }

  if (resultWinTypeEl){
    resultWinTypeEl.textContent = resultWinTypeLabel(winType);
  }

  if (resultWinnerEl){
    if (isRyukyoku){
      resultWinnerEl.textContent = `${getRyukyokuPointSummaryText(ryukyokuSettlement)} ${getPlayerDeltaTextFromSettlement(ryukyokuSettlement)}`;
    } else if (isNagashi){
      resultWinnerEl.textContent = getNagashiWinnerText(entry) || resultSeatName(winner);
    } else {
      resultWinnerEl.textContent = (winType === "ron")
        ? resultRonRouteText()
        : resultSeatName(winner);
    }
  }

  arrangeResultTopRowLayout();

  clearResultTiles(resultHandTilesEl);
  clearResultTiles(resultDoraTilesEl);
  clearResultTiles(resultUraDoraTilesEl);

  const topDoraTilesEl = getResultTopDoraTilesEl();
  const topUraDoraTilesEl = getResultTopUraDoraTilesEl();
  clearResultTiles(topDoraTilesEl);
  clearResultTiles(topUraDoraTilesEl);

  if (resultHandTilesEl){
    resultHandTilesEl.style.display = (isRyukyoku || isNagashi) ? "none" : "block";
  }

  if (!isRyukyoku && !isNagashi){
    renderResultHandTiles(entry);
  }

  if (!isRyukyoku && !isNagashi){
    const doraTiles = getDisplayDoraTileLikes(doraIndicators);
    for (const t of doraTiles){
      appendTileImgToResult(resultDoraTilesEl, t);
      appendCompactTileImgToResult(topDoraTilesEl, t);
    }
  }

  const info = isRyukyoku ? null : getResultYakuInfo();
  const showUra = (!isRyukyoku && !isNagashi) ? shouldShowResultUraDora(info) : false;

  // パオ判定
  let resultPaoSeatIndex = null;
  let resultPaoType = null;
  if (!isRyukyoku && !isNagashi && winner != null && info){
    if (winType === "tsumo"
        && typeof isDaiminkanPaoEnabled === "function" && isDaiminkanPaoEnabled()
        && typeof getDaiminkanPaoSeatForWinner === "function"){
      const seat = getDaiminkanPaoSeatForWinner(winner, info);
      if (seat != null){ resultPaoSeatIndex = seat; resultPaoType = "daiminkan"; }
    }
    if (resultPaoType == null && (info.yakuman | 0) > 0
        && typeof isYakumanPaoEnabled === "function" && isYakumanPaoEnabled()
        && typeof getYakumanPaoSeatForWinner === "function"){
      const seat = getYakumanPaoSeatForWinner(winner, info);
      if (seat != null){ resultPaoSeatIndex = seat; resultPaoType = "yakuman"; }
    }
  }

  if (showUra){
    const uraTiles = getDisplayDoraTileLikes(uraDoraIndicators);
    for (const t of uraTiles){
      appendTileImgToResult(resultUraDoraTilesEl, t);
      appendCompactTileImgToResult(topUraDoraTilesEl, t);
    }
  }

  if (resultYakuListEl){
    resultYakuListEl.innerHTML = "";
  }

  if (!isRyukyoku){
    renderResultYakuList(info);
  }

  const compactResult = isCompactLandscapePhoneForResult();

  if (resultDoraBlockEl){
    resultDoraBlockEl.style.display = (isRyukyoku || isNagashi) ? "none" : (compactResult ? "" : "none");
  }

  if (resultUraDoraBlockEl){
    resultUraDoraBlockEl.style.display = (!isRyukyoku && !isNagashi && showUra && compactResult) ? "" : "none";
  }

  const topDoraGroupEl = document.getElementById("resultTopDoraGroup");
  if (topDoraGroupEl){
    topDoraGroupEl.style.display = (!compactResult && !isRyukyoku && !isNagashi) ? "flex" : "none";
  }

  const topUraGroupEl = document.getElementById("resultTopUraDoraGroup");
  if (topUraGroupEl){
    topUraGroupEl.style.display = (!compactResult && showUra) ? "flex" : "none";
  }

  if (resultHanFuEl){
    if (isRyukyoku){
      resultHanFuEl.textContent = "";
    } else if (isNagashi){
      resultHanFuEl.textContent = getResultNagashiModeLabel(info);
    } else if (info){
      if ((info.yakuman | 0) > 0){
        const ym = info.yakuman | 0;
        const base = (ym >= 2) ? `${ym}倍役満` : "役満";
        resultHanFuEl.textContent = resultPaoType === "yakuman" ? `${base}・パオ` : base;
      } else {
        const totalHan = (typeof info.totalHan === "number")
          ? (info.totalHan | 0)
          : (((info.han | 0) + (info.bonus && info.bonus.total ? (info.bonus.total | 0) : 0)) | 0);
        const fu = Number.isFinite(info.fu) ? (info.fu | 0) : 0;
        const base = `${totalHan}翻 ${fu}符`;
        resultHanFuEl.textContent = resultPaoType === "daiminkan" ? `${base}・パオ` : base;
      }
    } else {
      resultHanFuEl.textContent = "0翻 0符";
    }
  }

  if (resultPointTextEl){
    // パオ時はロン点で表示（ツモ払い分割でなく全額一本）
    const scoreWinType = (resultPaoType != null) ? "ron" : winType;
    const scoreInfo = (!isRyukyoku && typeof calcSanmaScoreFromInfo === "function")
      ? calcSanmaScoreFromInfo(info, winner, scoreWinType)
      : null;
    const chipInfo = isRyukyoku ? null : buildResultChipInfoByEntry(entry);

    const pointSubTextEl = ensureResultPointSubTextEl();
    if (pointSubTextEl){
      pointSubTextEl.textContent = "";
      pointSubTextEl.style.display = "none";
    }

    const pointChipTextEl = ensureResultPointChipTextEl();
    if (pointChipTextEl){
      pointChipTextEl.textContent = "";
      pointChipTextEl.style.display = "none";
    }

    if (isRyukyoku){
      resultPointTextEl.textContent = getRyukyokuPointSummaryText(ryukyokuSettlement);

      if (pointSubTextEl){
        pointSubTextEl.textContent = getPlayerDeltaTextFromSettlement(ryukyokuSettlement);
        pointSubTextEl.style.display = "block";
      }
    } else if (scoreInfo && scoreInfo.displayText){
      resultPointTextEl.textContent = scoreInfo.displayText;

      if (pointSubTextEl){
        let subText = "";
        if (resultPaoType != null && resultPaoSeatIndex != null){
          const paoName = resultSeatName(resultPaoSeatIndex);
          if (resultPaoType === "daiminkan"){
            subText = `大明槓責任払い（${paoName}が全額）`;
          } else if (resultPaoType === "yakuman"){
            const discarder = entry ? entry.discarderSeatIndex : null;
            if (winType === "tsumo" || discarder === resultPaoSeatIndex){
              subText = `役満パオ（${paoName}が全額）`;
            } else {
              subText = `役満パオ（${resultSeatName(discarder)}・${paoName}で折半）`;
            }
          }
          if (scoreInfo.honbaDisplayText){
            subText += `　${scoreInfo.honbaDisplayText}`;
          }
        } else if (scoreInfo.honbaDisplayText){
          subText = scoreInfo.honbaDisplayText;
        }
        if (subText){
          pointSubTextEl.textContent = subText;
          pointSubTextEl.style.display = "block";
        }
      }

      if (pointChipTextEl && chipInfo && chipInfo.displayText){
        pointChipTextEl.textContent = chipInfo.displayText;
        pointChipTextEl.style.display = "block";
      }
    } else {
      resultPointTextEl.textContent = "点数計算エラー";

      if (pointChipTextEl && chipInfo && chipInfo.displayText){
        pointChipTextEl.textContent = chipInfo.displayText;
        pointChipTextEl.style.display = "block";
      }
    }
  }

  applyResultOverlayResponsiveLayout();
}

// ================================
// 開閉API
// ================================
function openResultOverlay(){
  if (!resultOverlay) return;
  installDefaultGameOverlayNoZoomGuards();
  renderResultOverlay();
  applyResultOverlayResponsiveLayout();
  resultOverlay.style.display = "flex";
}

function closeResultOverlay(){
  if (!resultOverlay) return;
  resultOverlay.style.display = "none";
}