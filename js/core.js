// MBsanma/js/core.js
// ========= core.js（状態・共通ユーティリティ） =========

// ===== 牌定義 =====
// 三麻（萬子なし） + 1m/9mのみ追加 + 字牌（東南西北白發中：北=4z）
const TILE_TYPES = [
  // 萬子（1m,9mのみ）
  "1m","9m",

  // ピンズ
  "1p","2p","3p","4p","5p","6p","7p","8p","9p",

  // ソーズ
  "1s","2s","3s","4s","5s","6s","7s","8s","9s",

  // 字牌（東南西北白發中：北=4z）
  "1z","2z","3z","4z","5z","6z","7z"
];

const TYPE_TO_IDX = Object.fromEntries(
  TILE_TYPES.map((c, i) => [c, i])
);
const TILE_COLOR_KEYS = ["r", "b", "g", "n"];
const SHIRO_POCCHI_IMG_CODE = "siropocchi";
const HANAHAI_IMG_CODES = ["1h", "2h", "3h", "4h"];

function createEmptyTileCompositionCounts(){
  return { r: 0, b: 0, g: 0, n: 0 };
}

function buildDefaultTileComposition(){
  const tiles = {};
  for (const code of TILE_TYPES){
    tiles[code] = createEmptyTileCompositionCounts();
  }
  tiles["5p"].r = 2;
  tiles["5s"].r = 2;
  tiles["4z"].n = 1;
  return {
    version: 1,
    tiles
  };
}

function normalizeTileComposition(raw){
  const src = (raw && typeof raw === "object") ? raw : {};
  const srcTiles = (src.tiles && typeof src.tiles === "object") ? src.tiles : {};
  const out = {
    version: 1,
    tiles: {}
  };

  for (const code of TILE_TYPES){
    const row = (srcTiles[code] && typeof srcTiles[code] === "object") ? srcTiles[code] : createEmptyTileCompositionCounts();
    const nextRow = createEmptyTileCompositionCounts();
    let used = 0;

    for (const colorKey of TILE_COLOR_KEYS){
      let count = Number(row[colorKey]);
      if (!Number.isFinite(count)) count = 0;
      count = Math.max(0, Math.min(4, Math.round(count)));
      if ((used + count) > 4) count = Math.max(0, 4 - used);
      nextRow[colorKey] = count;
      used += count;
    }

    out.tiles[code] = nextRow;
  }

  return out;
}

function cloneTileComposition(comp){
  return normalizeTileComposition(comp);
}

function getTileCompositionForGame(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getTileComposition === "function"){
      return normalizeTileComposition(window.MBSanmaRulesConfig.getTileComposition());
    }
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return normalizeTileComposition(window.MBSanmaRulesConfig.getValue("tiles-tile-composition", buildDefaultTileComposition()));
    }
  }catch(e){}
  return buildDefaultTileComposition();
}

function getRuleValueForCore(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getRuleBoolForCore(key, fallback){
  const raw = getRuleValueForCore(key, fallback);
  if (typeof raw === "boolean") return raw;
  const text = String(raw == null ? "" : raw).toLowerCase();
  if (text === "true" || text === "1" || text === "on") return true;
  if (text === "false" || text === "0" || text === "off") return false;
  return !!fallback;
}

function getConfiguredWallEndTypeForGame(){
  const raw = String(getRuleValueForCore("tiles-wall-end-type", "7ton") || "").toLowerCase();
  return raw === "all" ? "all" : "7ton";
}

function getWallDrawReserveCountForGame(){
  return 0;
}

function getRemainingDrawableWallCount(){
  const count = Array.isArray(wall) ? wall.length : 0;
  if (getConfiguredWallEndTypeForGame() === "all"){
    const extra = Array.isArray(torikiriDrawableTiles) ? torikiriDrawableTiles.length : 0;
    return Math.max(0, count + extra);
  }
  return Math.max(0, count - getWallDrawReserveCountForGame());
}

function isWallExhaustedForDraw(){
  return getRemainingDrawableWallCount() <= 0;
}

function getConfiguredPeiTypeForGame(){
  const raw = String(getRuleValueForCore("tiles-pei-type", "nuki") || "").toLowerCase();
  if (raw === "bakaze") return "bakaze";
  if (raw === "otakaze") return "otakaze";
  return "nuki";
}

function isPeiNukiEnabledForGame(){
  return getConfiguredPeiTypeForGame() === "nuki";
}

function isHanahaiEnabledForGame(){
  return String(getRuleValueForCore("tiles-hanahai-type", "off") || "").toLowerCase() === "on";
}

function isHanahaiImgCode(imgCode){
  return HANAHAI_IMG_CODES.includes(String(imgCode || ""));
}

function isHanahaiTile(tile){
  if (!tile || typeof tile !== "object") return false;
  return isHanahaiImgCode(normalizeTileImgCode(tile.imgCode || tile.code || "", tile.code || ""));
}

function isNukiActionEnabledForGame(){
  return isPeiNukiEnabledForGame() || isHanahaiEnabledForGame();
}

function isNukiTileForGame(tile){
  if (!tile || typeof tile !== "object") return false;
  if (isHanahaiEnabledForGame() && isHanahaiTile(tile)) return true;
  if (!isPeiNukiEnabledForGame()) return false;
  return String(tile.code || "") === "4z";
}

function isUraDoraEnabledForGame(){
  return getRuleBoolForCore("tiles-uradora", true);
}

function isKanDoraEnabledForGame(){
  return getRuleBoolForCore("tiles-kandora", true);
}

function isKanUraEnabledForGame(){
  return getRuleBoolForCore("tiles-kanura", true);
}

function isShiroPocchiEnabledForGame(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return String(window.MBSanmaRulesConfig.getValue("overview-chip-target-shiro-pocchi", "off") || "").toLowerCase() === "on";
    }
  }catch(e){}
  return false;
}

function getShiroPocchiChipCountForGame(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getNumber === "function"){
      const value = Number(window.MBSanmaRulesConfig.getNumber("overview-chip-target-shiro-pocchi-count", 1));
      if (Number.isFinite(value)) return Math.max(0, Math.round(value));
    }
  }catch(e){}
  return 1;
}

function isShiroPocchiTile(tile){
  if (!tile || typeof tile !== "object") return false;
  return normalizeTileImgCode(tile.imgCode || tile.code || "", tile.code || "") === SHIRO_POCCHI_IMG_CODE;
}

function getTileNormalCountFromComposition(code, composition){
  const normalized = normalizeTileComposition(composition);
  const row = normalized.tiles[code] || createEmptyTileCompositionCounts();
  const colored = TILE_COLOR_KEYS.reduce((sum, key)=> sum + (Number(row[key]) || 0), 0);
  return Math.max(0, 4 - colored);
}

function buildTilesForCodeFromComposition(code, composition){
  const normalized = normalizeTileComposition(composition);
  const row = normalized.tiles[code] || createEmptyTileCompositionCounts();
  const out = [];

  const normalCount = getTileNormalCountFromComposition(code, normalized);

  for (let i = 0; i < normalCount; i++){
    out.push(makeTile(code));
  }
  for (const colorKey of TILE_COLOR_KEYS){
    const count = Number(row[colorKey]) || 0;
    for (let i = 0; i < count; i++){
      out.push(makeTile(code, `${colorKey}${code}`, colorKey === "r"));
    }
  }

  if (code === "4z" && isHanahaiEnabledForGame()){
    for (const imgCode of HANAHAI_IMG_CODES){
      out.push(makeTile(code, imgCode, false));
    }
  }

  if (code === "5z" && isShiroPocchiEnabledForGame() && out.length > 0){
    const replaceIndex = out.findIndex((tile)=> tile && tile.code === "5z" && normalizeTileImgCode(tile.imgCode || tile.code, tile.code) === "5z");
    const targetIndex = replaceIndex >= 0 ? replaceIndex : 0;
    out[targetIndex] = makeTile(code, SHIRO_POCCHI_IMG_CODE, false);
  }

  return out;
}

function normalizeTileImgCode(imgCode, code = ""){
  const raw = String(imgCode || code || "");
  if (!raw) return String(code || "");
  return raw;
}

function getAssetPath(relativePath){
  const normalized = String(relativePath || "").replace(/^\.?\//, "");
  let prefix = "";
  try{
    if (typeof window !== "undefined" && typeof window.MBSANMA_ASSET_PREFIX === "string"){
      prefix = window.MBSANMA_ASSET_PREFIX;
    }
  }catch(e){}
  return `${prefix}${normalized}`;
}

function getTileColorKeyFromImgCode(imgCode, code = ""){
  const normalized = normalizeTileImgCode(imgCode, code);
  if (normalized.length < 3) return "";
  const prefix = normalized[0];
  if (!["r", "b", "g", "n"].includes(prefix)) return "";

  const body = normalized.slice(1);
  const baseCode = String(code || body || "");
  if (!body || body === baseCode) return prefix;
  return "";
}

// ===== 表示系 =====
function tileLabel(code){
  const n = code[0];
  const suit = code[1];

  if (suit === "m") return `${n}萬`;
  if (suit === "p") return `${n}筒`;
  if (suit === "s") return `${n}索`;

  const Z_LABEL = {
    "1z": "東",
    "2z": "南",
    "3z": "西",
    "4z": "北",
    "5z": "白",
    "6z": "發",
    "7z": "中",
  };
  return Z_LABEL[code] || code;
}

function tileImgSrc(code){
  const normalized = normalizeTileImgCode(code, code);
  return getAssetPath(`img/${normalized}.png`);
}

function tileImgSrcByTile(tile){
  if (tile && tile.imgCode){
    return getAssetPath(`img/${normalizeTileImgCode(tile.imgCode, tile.code || "")}.png`);
  }
  if (tile && tile.code) return getAssetPath(`img/${normalizeTileImgCode(tile.code, tile.code)}.png`);
  return getAssetPath("img/unknown.png");
}
function haimenSrc(){
  return getAssetPath("img/haimen.png");
}

// ===== タイル生成 =====
let nextId = 1;

function makeTile(code, imgCode = code, isRed = false){
  const normalizedImgCode = normalizeTileImgCode(imgCode, code);
  const colorKey = getTileColorKeyFromImgCode(normalizedImgCode, code);
  return {
    id: nextId++,
    code,
    imgCode: normalizedImgCode,
    colorKey,
    color: colorKey,
    isRed: !!isRed || colorKey === "r",
    isNew: false
  };
}

// ===== 山生成 =====
function makeWall(){
  const wall = [];
  const composition = getTileCompositionForGame();
  for (const code of TILE_TYPES){
    wall.push(...buildTilesForCodeFromComposition(code, composition));
  }
  return wall;
}

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ===== 手牌ソート =====
function sortHand(arr){
  const suitOrder = { m:0, p:1, s:2, z:3 };
  return arr.slice().sort((A, B)=>{
    const a = A.code;
    const b = B.code;
    if (suitOrder[a[1]] !== suitOrder[b[1]]) {
      return suitOrder[a[1]] - suitOrder[b[1]];
    }
    return Number(a[0]) - Number(b[0]);
  });
}

// ===== DOM生成 =====
function makeImgByCode(code){
  const img = document.createElement("img");
  img.src = tileImgSrc(code);
  img.alt = tileLabel(code);
  img.title = code;
  img.draggable = false;
  img.onerror = () => img.replaceWith(document.createTextNode(`[${code}]`));
  return img;
}

function makeTileImg(tile){
  const img = document.createElement("img");
  img.src = tileImgSrcByTile(tile);
  img.alt = tileLabel(tile.code);
  img.title = tile.code;
  img.draggable = false;
  img.onerror = () => img.replaceWith(document.createTextNode(`[${tile.code}]`));
  return img;
}

function makeHaimenImg(){
  const img = document.createElement("img");
  img.src = haimenSrc();
  img.alt = "裏";
  img.title = "haimen";
  img.draggable = false;
  img.onerror = () => img.replaceWith(document.createTextNode(`[haimen]`));
  return img;
}

function makeChipIconImg(){
  const img = document.createElement("img");
  img.src = getAssetPath("img/chip.png");
  img.alt = "チップ";
  img.title = "チップ";
  img.draggable = false;
  img.dataset.fallbackStep = "0";
  img.className = "scoreChipIconImg";

  img.onerror = () => {
    const step = img.dataset.fallbackStep || "0";

    if (step === "0") {
      img.dataset.fallbackStep = "1";
      img.src = getAssetPath("img/sentenbou.png");
      return;
    }

    const fallback = document.createElement("span");
    fallback.className = "scoreChipIconFallback";
    fallback.textContent = "●";
    img.replaceWith(fallback);
  };

  return img;
}

// ===== DOM参照 =====
const handEl   = document.getElementById("hand");
const riverEl  = document.getElementById("river");
const statsEl  = document.getElementById("stats");

const meldsEl  = document.getElementById("melds");
const peisEl   = document.getElementById("peis");

// ★ topbar
const newBtn          = document.getElementById("newBtn");
const resetBtn        = document.getElementById("resetBtn");
const debugTenpaiBtn  = document.getElementById("debugTenpaiBtn");
const debugChiitoiBtn = document.getElementById("debugChiitoiBtn");
// ★ デバッグ：4枚使い七対子（ローカル）配牌
const debugChiitoi4Btn = document.getElementById("debugChiitoi4Btn");
// ★ デバッグ：国士13面テンパイ配牌
const debugKokushi13Btn = document.getElementById("debugKokushi13Btn");
// ★ デバッグ：1113335557799p
const debugRiichiAnkanBtn = document.getElementById("debugRiichiAnkanBtn");

// ★ 受け入れ表示ON/OFF（右上固定）
const ukeireToggleBtn = document.getElementById("ukeireToggleBtn");

const peiBtn    = document.getElementById("peiBtn");
const ponBtn    = document.getElementById("ponBtn");
const ronBtn    = document.getElementById("ronBtn");
const kanBtn    = document.getElementById("kanBtn");
const passBtn   = document.getElementById("passBtn");
const riichiBtn = document.getElementById("riichiBtn");
const tsumoBtn  = document.getElementById("tsumoBtn");
const kyuushuBtn = document.getElementById("kyuushuBtn");

const riichiBadge     = document.getElementById("riichiBadge");
const riichiPickBadge = document.getElementById("riichiPickBadge");

const tsumoOverlay    = document.getElementById("tsumoOverlay");
const nagashiOverlay  = document.getElementById("nagashiOverlay");
const ryukyokuOverlay = document.getElementById("ryukyokuOverlay");
const ronOverlay      = document.getElementById("ronOverlay");
const kanOverlay      = document.getElementById("kanOverlay");
const ponOverlay      = document.getElementById("ponOverlay");
const riichiOverlay   = document.getElementById("riichiOverlay");

// CPU DOM
const cpuLeftHandEl   = document.getElementById("cpuLeftHand");
const cpuRightHandEl  = document.getElementById("cpuRightHand");
const cpuLeftRiverEl  = document.getElementById("cpuLeftRiver");
const cpuRightRiverEl = document.getElementById("cpuRightRiver");
const cpuLeftPeisEl   = document.getElementById("cpuLeftPeis");
const cpuRightPeisEl  = document.getElementById("cpuRightPeis");
const cpuLeftMeldsEl  = document.getElementById("cpuLeftMelds");
const cpuRightMeldsEl = document.getElementById("cpuRightMelds");

// ===== ゲーム状態 =====
let initialHand13 = [];
let initialDrawn  = null;

let hand13 = [];
let drawn  = null;
let river  = [];

let wall   = [];

let liveWall = [];
let deadWall = [];
let doraIndicators = [];
let uraDoraIndicators = [];

// ================================
// ★ 王牌18枚の内部構成
// 0〜7   : 嶺上牌/北抜き補充に使う8枚
// 8〜11  : 表ドラ表示牌（初期1枚 + カンで最大3枚追加）
// 12〜15 : 裏ドラ表示牌（初期1枚 + カンで最大3枚追加）
// 16〜17 : 未使用牌
// 18〜21 : カン成立時だけ通常山の先頭から補充される未使用牌
// ================================
const DEAD_WALL_DRAW_COUNT = 8;
const DEAD_WALL_DORA_START = 8;
const DEAD_WALL_URA_START = 12;
const DEAD_WALL_INDICATOR_MAX = 4;
const DEAD_WALL_INITIAL_COUNT = 18;
const DEAD_WALL_KAN_REFILL_MAX = 4;

// 0〜8 の範囲で進む（何枚補充で使ったか）
let deadWallDrawCursor = 0;
let deadWallKanRefillCount = 0;
let torikiriDrawableTiles = [];

let hoveredTileId = null;
let selectedTileId = null;
let selectedTileIsDrawn = false;

function clearSelectedTile(){
  selectedTileId = null;
  selectedTileIsDrawn = false;
  hoveredTileId = null;
}

function setSelectedTile(tileId, isDrawn = false){
  if (tileId == null){
    clearSelectedTile();
    return;
  }
  selectedTileId = tileId;
  selectedTileIsDrawn = !!isDrawn;
  hoveredTileId = tileId;
}

function hasSelectedTile(){
  return selectedTileId != null;
}

function isSelectedTile(tileId, isDrawn = false){
  if (selectedTileId == null) return false;
  return selectedTileId === tileId && selectedTileIsDrawn === !!isDrawn;
}

function getSelectedTilePreviewState(){
  if (selectedTileId == null) return null;
  return {
    tileId: selectedTileId,
    isDrawn: !!selectedTileIsDrawn
  };
}


let melds = [];
let peis  = [];

let isEnded = false;

let cpuLeftHand13 = [];
let cpuRightHand13 = [];
let cpuLeftRiver = [];
let cpuRightRiver = [];

let initialCpuLeftHand13 = [];
let initialCpuRightHand13 = [];

let isRiichi          = false;
let isRiichiSelecting = false;
let riichiCandidates  = null;
let riichiAutoTimer   = null;
let riichiWait        = false;

// ★ 自分のリーチ宣言牌
// - declare : 内部上の本来の宣言牌
// - display : 河で横向きに見せる牌
// - pending : 宣言牌が副露で消えたあと、次の捨て牌へ横向き表示を引き継ぐ待機
let playerRiichiDeclareTileId = null;
let playerRiichiDisplayTileId = null;
let playerRiichiDisplayPending = false;

let kanTargetCode = null;

// ★ 鳴き
let pendingCall = null;

// ★ 鳴き後の強制打牌（ポン後はツモ/カン/ペー不可で「切るだけ」）
let mustDiscardAfterCall = false;

// ================================
// ★ アガリ情報（次局進行用）
// ================================
let lastAgariWinnerSeatIndex = null;    // 0=自分 / 1=右CPU / 2=左CPU
let lastAgariDiscarderSeatIndex = null; // 0=自分 / 1=右CPU / 2=左CPU
let lastAgariType = null;               // "tsumo" | "ron" | null
let lastAgariRonTile = null;            // ロン時の放銃牌

// ================================
// ★ 場面役/一発管理
// ================================
let ippatsuChanceBySeat = [false, false, false];
let doubleRiichiBySeat = [false, false, false];
let hadOpenCallOrKanThisKyoku = false;
let currentWinContext = {
  rinshan: false,
  chankan: false
};

function resetIppatsuChanceBySeat(){
  ippatsuChanceBySeat = [false, false, false];
}

function clearAllIppatsuChances(){
  resetIppatsuChanceBySeat();
}

function resetPlayerRiichiDisplayState(){
  playerRiichiDeclareTileId = null;
  playerRiichiDisplayTileId = null;
  playerRiichiDisplayPending = false;
}

function setPlayerRiichiDeclareTileId(tileId){
  playerRiichiDeclareTileId = tileId ?? null;
  playerRiichiDisplayTileId = tileId ?? null;
  playerRiichiDisplayPending = false;
}

function getPlayerRiichiDeclareTileId(){
  return playerRiichiDeclareTileId;
}

function getPlayerRiichiDisplayTileId(){
  return playerRiichiDisplayTileId;
}

function markPlayerRiichiDisplayTileCalledAway(tileId){
  if (tileId == null) return;
  if (playerRiichiDisplayTileId == null) return;
  if (playerRiichiDisplayTileId !== tileId) return;

  playerRiichiDisplayTileId = null;

  if (isRiichi && playerRiichiDeclareTileId != null){
    playerRiichiDisplayPending = true;
  }
}

function maybeAdoptPlayerRiichiDisplayTile(tile){
  if (!tile || tile.id == null) return;
  if (!isRiichi) return;
  if (!playerRiichiDisplayPending) return;

  playerRiichiDisplayTileId = tile.id;
  playerRiichiDisplayPending = false;
}

function resetDoubleRiichiBySeat(){
  doubleRiichiBySeat = [false, false, false];
}

function clearAllDoubleRiichiFlags(){
  resetDoubleRiichiBySeat();
}

function resetOpenCallOrKanFlag(){
  hadOpenCallOrKanThisKyoku = false;
}

function markOpenCallOrKanThisKyoku(){
  hadOpenCallOrKanThisKyoku = true;
}

function hasOpenCallOrKanThisKyoku(){
  return !!hadOpenCallOrKanThisKyoku;
}

function setDoubleRiichiForSeat(seatIndex, value){
  if (!Array.isArray(doubleRiichiBySeat)) resetDoubleRiichiBySeat();
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  doubleRiichiBySeat[seatIndex] = !!value;
}

function getDoubleRiichiForSeat(seatIndex){
  if (!Array.isArray(doubleRiichiBySeat)) return false;
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;
  return !!doubleRiichiBySeat[seatIndex];
}

function setIppatsuChanceForSeat(seatIndex, value){
  if (!Array.isArray(ippatsuChanceBySeat)) resetIppatsuChanceBySeat();
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  ippatsuChanceBySeat[seatIndex] = !!value;
}

function getIppatsuChanceForSeat(seatIndex){
  if (!Array.isArray(ippatsuChanceBySeat)) return false;
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;
  return !!ippatsuChanceBySeat[seatIndex];
}

function resetCurrentWinContext(){
  currentWinContext = { rinshan: false, chankan: false };
}

function setCurrentWinContextFlags(flags = {}){
  if (!currentWinContext || typeof currentWinContext !== "object") resetCurrentWinContext();
  currentWinContext.rinshan = !!flags.rinshan;
  currentWinContext.chankan = !!flags.chankan;
}

function markCurrentWinContextRinshan(){
  setCurrentWinContextFlags({ rinshan: true, chankan: false });
}

function markCurrentWinContextChankan(){
  setCurrentWinContextFlags({ rinshan: false, chankan: true });
}

function isSeatRiichiNow(seatIndex){
  if (seatIndex === 0) return !!isRiichi;
  if (seatIndex === 1 && typeof cpuRightRiichi !== "undefined") return !!cpuRightRiichi;
  if (seatIndex === 2 && typeof cpuLeftRiichi !== "undefined") return !!cpuLeftRiichi;
  return false;
}

function getRiverRefBySeatIndex(seatIndex){
  if (seatIndex === 0) return Array.isArray(river) ? river : [];
  if (seatIndex === 1) return Array.isArray(cpuRightRiver) ? cpuRightRiver : [];
  if (seatIndex === 2) return Array.isArray(cpuLeftRiver) ? cpuLeftRiver : [];
  return [];
}

function canDeclareDoubleRiichiNow(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;

  const myRiver = getRiverRefBySeatIndex(seatIndex);
  const rightRiverRef = getRiverRefBySeatIndex(1);
  const leftRiverRef = getRiverRefBySeatIndex(2);
  const selfRiverRef = getRiverRefBySeatIndex(0);
  const totalDiscards = selfRiverRef.length + rightRiverRef.length + leftRiverRef.length;

  if (myRiver.length !== 0) return false;
  if (totalDiscards > 2) return false;

  if (typeof hasOpenCallOrKanThisKyoku === "function" && hasOpenCallOrKanThisKyoku()) return false;
  if (Array.isArray(melds) && melds.length > 0) return false;

  // 北抜きはダブリー権を消さない。
  return true;
}

function getWinSituationFlags(winType, seatIndex){
  const isRinshan = !!(currentWinContext && currentWinContext.rinshan);
  const isChankan = !!(currentWinContext && currentWinContext.chankan);
  const wallCount = Array.isArray(wall) ? wall.length : 0;
  const seatIsRiichi = isSeatRiichiNow(seatIndex);
  const myRiver = getRiverRefBySeatIndex(seatIndex);
  const isFirstDrawAgari = (winType === "tsumo")
    && !isRinshan
    && !isChankan
    && Array.isArray(myRiver)
    && myRiver.length === 0;
  const noOpenCallOrKanYet = !hasOpenCallOrKanThisKyoku();
  const dealerSeat = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;

  return {
    isIppatsu: seatIsRiichi && getIppatsuChanceForSeat(seatIndex),
    isDoubleRiichi: seatIsRiichi && getDoubleRiichiForSeat(seatIndex),
    isHaitei: (winType === "tsumo") && !isRinshan && !isChankan && getRemainingDrawableWallCount() === 0,
    isHoutei: (winType === "ron") && !isChankan && getRemainingDrawableWallCount() === 0,
    isRinshan,
    isChankan,
    isTenhou: isFirstDrawAgari && noOpenCallOrKanYet && seatIndex === dealerSeat,
    isChiihou: isFirstDrawAgari && noOpenCallOrKanYet && seatIndex !== dealerSeat
  };
}

// ================================
// ★ 半荘/局の状態
// ================================
let roundWind = "東";
let roundNumber = 1;
let eastSeatIndex = 0;

// ★ 本場
let honba = 0;

// ★ 持ち点 / 供託 / 局精算待ち
let scores = [35000, 35000, 35000];
let kyotakuCount = 0;
let pendingRoundSettlement = null;

// ★ 半荘通算成績（半荘終了画面用）
let hanchanRiichiCounts = [0, 0, 0];
let hanchanAgariCounts = [0, 0, 0];
let hanchanHojuCounts = [0, 0, 0];
let hanchanChipCounts = [0, 0, 0];

function cloneHanchanSeatStatsForView(){
  return [0, 1, 2].map((seatIndex)=>(
    {
      riichi: Number.isFinite(hanchanRiichiCounts[seatIndex]) ? (hanchanRiichiCounts[seatIndex] | 0) : 0,
      agari: Number.isFinite(hanchanAgariCounts[seatIndex]) ? (hanchanAgariCounts[seatIndex] | 0) : 0,
      hoju: Number.isFinite(hanchanHojuCounts[seatIndex]) ? (hanchanHojuCounts[seatIndex] | 0) : 0,
      chip: Number.isFinite(hanchanChipCounts[seatIndex]) ? (hanchanChipCounts[seatIndex] | 0) : 0
    }
  ));
}

function syncHanchanSeatStatsView(){
  try{
    if (typeof window === "undefined") return;
    const view = cloneHanchanSeatStatsForView();
    window.hanchanSeatStats = view;
    window.hanchanStats = view;
    window.hanchanStatsBySeat = view;
  }catch(e){}
}

function normalizeHanchanSeatStats(){
  const normalizeArray = (src)=>{
    const out = [0, 0, 0];
    if (!Array.isArray(src)) return out;
    for (let i = 0; i < 3; i++){
      if (Number.isFinite(src[i])) out[i] = src[i] | 0;
    }
    return out;
  };

  hanchanRiichiCounts = normalizeArray(hanchanRiichiCounts);
  hanchanAgariCounts = normalizeArray(hanchanAgariCounts);
  hanchanHojuCounts = normalizeArray(hanchanHojuCounts);
  hanchanChipCounts = normalizeArray(hanchanChipCounts);
  syncHanchanSeatStatsView();
}

function resetHanchanSeatStats(){
  hanchanRiichiCounts = [0, 0, 0];
  hanchanAgariCounts = [0, 0, 0];
  hanchanHojuCounts = [0, 0, 0];
  hanchanChipCounts = [0, 0, 0];
  syncHanchanSeatStatsView();
}

function getHanchanChipCount(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return 0;
  if (!Array.isArray(hanchanChipCounts)) return 0;
  return Number.isFinite(hanchanChipCounts[seatIndex]) ? (hanchanChipCounts[seatIndex] | 0) : 0;
}

function incrementHanchanSeatStat(seatIndex, key, amount = 1){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return;
  if (!Number.isFinite(amount) || amount === 0) return;

  normalizeHanchanSeatStats();

  const add = amount | 0;

  if (key === "riichi"){
    hanchanRiichiCounts[seatIndex] = (hanchanRiichiCounts[seatIndex] | 0) + add;
    syncHanchanSeatStatsView();
    return;
  }

  if (key === "agari"){
    hanchanAgariCounts[seatIndex] = (hanchanAgariCounts[seatIndex] | 0) + add;
    syncHanchanSeatStatsView();
    return;
  }

  if (key === "hoju" || key === "houju"){
    hanchanHojuCounts[seatIndex] = (hanchanHojuCounts[seatIndex] | 0) + add;
    syncHanchanSeatStatsView();
    return;
  }

  if (key === "chip" || key === "chips"){
    hanchanChipCounts[seatIndex] = (hanchanChipCounts[seatIndex] | 0) + add;
    syncHanchanSeatStatsView();
  }
}

normalizeHanchanSeatStats();

// ================================
// ★ 受け入れ表示 ON/OFF
// ================================
let isUkeireVisible = false;


// ===== ボタン enable/disable =====
function setBtnEnabled(btn, enabled){
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("enabled", !!enabled);
}


// ================================
// ===== 牌カウント作成 =====
// ================================
function countsFromTiles(tiles){
  const c = Array(TILE_TYPES.length).fill(0);
  for (const t of tiles){
    const idx = TYPE_TO_IDX[t.code];
    if (idx !== undefined) c[idx]++;
  }
  return c;
}

// ================================
// ===== 可視牌カウント（受け入れ計算用） =====
// visibleCounts[i] は「見えている枚数（手牌/河/副露/抜き北/ドラ表示など）」
// shanten.js 側では remain = 4 - visibleCounts[i] で残り枚数を作る
// ※ 状態変更はしない（読み取りのみ）
// ================================
function countVisible(){
  const c = Array(TILE_TYPES.length).fill(0);

  const addCode = (code, n=1)=>{
    const idx = TYPE_TO_IDX[code];
    if (idx === undefined) return;
    c[idx] += (n|0);
  };

  const addTiles = (arr)=>{
    if (!Array.isArray(arr)) return;
    for (const t of arr){
      if (t && t.code) addCode(t.code, 1);
    }
  };

  // 自分手牌（13枚）＋ツモ牌
  addTiles(hand13);
  if (drawn && drawn.code) addCode(drawn.code, 1);

  // 河（自分/CPU）
  addTiles(river);
  addTiles(cpuLeftRiver);
  addTiles(cpuRightRiver);

  // 抜き北
  addTiles(peis);

  // ドラ表示（表）
  if (Array.isArray(doraIndicators)){
    for (const d of doraIndicators){
      if (d && d.code) addCode(d.code, 1);
    }
  }

  // 副露（pon/minkan/ankan/kakan）
  if (Array.isArray(melds)){
    for (const m of melds){
      if (!m || !m.code) continue;
      if (m.type === "pon") addCode(m.code, 3);
      else if (m.type === "minkan") addCode(m.code, 4);
      else if (m.type === "ankan") addCode(m.code, 4);
      else if (m.type === "kakan") addCode(m.code, 4);
      else addCode(m.code, 0);
    }
  }

  // 念のため上限クリップ（4枚を超えるのは表示用に意味がない）
  for (let i=0;i<c.length;i++){
    if (c[i] > 4) c[i] = 4;
    if (c[i] < 0) c[i] = 0;
  }

  return c;
}

// ================================
// ===== 便利: 抜き牌が手にあるか =====
// ================================
function hasNukiTileInHand(){
  if (!isNukiActionEnabledForGame()) return false;
  if (drawn && isNukiTileForGame(drawn)) return true;
  return hand13.some((t)=> isNukiTileForGame(t));
}

function hasNorthInHand(){
  return hasNukiTileInHand();
}

// ================================
// ===== 便利: 4枚そろい（暗槓候補）を探す =====
// （render/kan から呼ばれる。状態変更なし）
// ================================
function findQuadTargetCode(){
  const pool = [];
  if (Array.isArray(hand13)) pool.push(...hand13);
  if (drawn) pool.push(drawn);

  if (pool.length === 0) return null;

  const map = new Map(); // code -> count
  for (const t of pool){
    if (!t || !t.code) continue;
    const c = t.code;
    map.set(c, (map.get(c) || 0) + 1);
  }

  for (const [code, n] of map.entries()){
    if (n >= 4) return code;
  }

  return null;
}

// ================================
// ===== newフラグを全消し =====
// ================================
function clearNewFlags(){
  if (Array.isArray(hand13)){
    for (const t of hand13){
      if (t) t.isNew = false;
    }
  }
  if (drawn) drawn.isNew = false;

  if (Array.isArray(cpuLeftHand13)){
    for (const t of cpuLeftHand13){
      if (t) t.isNew = false;
    }
  }
  if (Array.isArray(cpuRightHand13)){
    for (const t of cpuRightHand13){
      if (t) t.isNew = false;
    }
  }
}

// ================================
// ===== 王牌管理（山108 -> 王牌18 + 通常山90） =====
// 王牌18枚の並びは以下で固定する
//   0〜7   : 嶺上牌/北抜き補充
//   8〜11  : 表ドラ表示牌
//   12〜15 : 裏ドラ表示牌
//   16〜17 : 未使用牌
// カン成立時は、通常山の先頭から1枚を王牌末尾へ補充する
// （18〜21 の未使用帯として増えていく）
// ================================
function buildTorikiriWallStateFromFixedDeadWall(fixedDeadWall){
  const reservedDeadWall = Array(DEAD_WALL_INITIAL_COUNT).fill(null);
  const drawableTiles = [];

  for (let i = 0; i < DEAD_WALL_INITIAL_COUNT; i++){
    const tile = fixedDeadWall[i] || null;
    if (!tile) continue;

    const isSupplementSlot = i < DEAD_WALL_DRAW_COUNT;
    const isInitialOmoteSlot = i === DEAD_WALL_DORA_START;
    const isInitialUraSlot = i === DEAD_WALL_URA_START;

    if (isSupplementSlot || isInitialOmoteSlot || isInitialUraSlot){
      reservedDeadWall[i] = tile;
    } else {
      drawableTiles.push(tile);
    }
  }

  return {
    reservedDeadWall,
    drawableTiles
  };
}

function initWallsFromShuffled(shuffled108){
  const fixedDeadWall = shuffled108.slice(-DEAD_WALL_INITIAL_COUNT);
  liveWall = shuffled108.slice(0, shuffled108.length - DEAD_WALL_INITIAL_COUNT);

  if (getConfiguredWallEndTypeForGame() === "all"){
    const torikiriState = buildTorikiriWallStateFromFixedDeadWall(fixedDeadWall);
    deadWall = torikiriState.reservedDeadWall;
    torikiriDrawableTiles = torikiriState.drawableTiles.slice();
  } else {
    deadWall = fixedDeadWall;
    torikiriDrawableTiles = [];
  }

  // wall は「通常山」を参照する（既存コード互換）
  wall = liveWall;

  deadWallDrawCursor = 0;
  deadWallKanRefillCount = 0;
}

function cloneIndicatorLike(tile){
  if (!tile) return null;
  const code = tile.code;
  const imgCode = normalizeTileImgCode(tile.imgCode || code, code);
  const colorKey = tile.colorKey || getTileColorKeyFromImgCode(imgCode, code);
  return {
    code,
    imgCode,
    colorKey,
    color: colorKey,
    isRed: !!tile.isRed || colorKey === "r"
  };
}

function getDeadWallTileAt(index){
  if (!Array.isArray(deadWall)) return null;
  if (index < 0 || index >= deadWall.length) return null;
  return deadWall[index] || null;
}

function getDeadWallRemainingSupplementCount(){
  return Math.max(0, DEAD_WALL_DRAW_COUNT - deadWallDrawCursor);
}

function getDeadWallUsedSupplementCount(){
  return Math.max(0, Math.min(DEAD_WALL_DRAW_COUNT, deadWallDrawCursor));
}

function getDeadWallDisplayCount(){
  const total = Array.isArray(deadWall)
    ? deadWall.reduce((sum, tile)=> sum + (tile ? 1 : 0), 0)
    : 0;
  return Math.max(0, total - getDeadWallUsedSupplementCount());
}

function appendKanRefillTileFromLiveWall(){
  if (getConfiguredWallEndTypeForGame() === "all") return null;
  if (!Array.isArray(deadWall)) return null;
  if (!Array.isArray(wall)) return null;
  if (deadWallKanRefillCount >= DEAD_WALL_KAN_REFILL_MAX) return null;
  if (wall.length <= 0) return null;

  const t = wall.shift();
  if (!t) return null;

  t.isNew = false;
  deadWall.push(t);
  deadWallKanRefillCount++;
  return t;
}

function takeTileFromDrawableWallTailForKanIndicator(){
  let t = null;

  if (Array.isArray(torikiriDrawableTiles) && torikiriDrawableTiles.length > 0){
    t = torikiriDrawableTiles.pop() || null;
  } else if (Array.isArray(wall) && wall.length > 0){
    t = wall.pop() || null;
  }

  if (t) t.isNew = false;
  return t;
}

function appendTorikiriKanIndicatorPair(){
  if (getConfiguredWallEndTypeForGame() !== "all") return false;

  const currentOmoteCount = Array.isArray(doraIndicators) ? doraIndicators.length : 0;
  const currentUraCount = Array.isArray(uraDoraIndicators) ? uraDoraIndicators.length : 0;
  const nextOmoteIndex = DEAD_WALL_DORA_START + currentOmoteCount;
  const nextUraIndex = DEAD_WALL_URA_START + currentUraCount;

  if (nextOmoteIndex >= (DEAD_WALL_DORA_START + DEAD_WALL_INDICATOR_MAX)) return false;
  if (nextUraIndex >= (DEAD_WALL_URA_START + DEAD_WALL_INDICATOR_MAX)) return false;
  if (!Array.isArray(deadWall)) deadWall = Array(DEAD_WALL_INITIAL_COUNT).fill(null);
  if (deadWall[nextOmoteIndex] || deadWall[nextUraIndex]) return false;

  const omote = takeTileFromDrawableWallTailForKanIndicator();
  const ura = takeTileFromDrawableWallTailForKanIndicator();
  if (!omote || !ura) return false;

  deadWall[nextOmoteIndex] = omote;
  deadWall[nextUraIndex] = ura;
  return true;
}

function getDeadWallInitialDoraTile(){
  return getDeadWallTileAt(DEAD_WALL_DORA_START);
}

function getDeadWallInitialUraTile(){
  return getDeadWallTileAt(DEAD_WALL_URA_START);
}

function getDeadWallDoraTileByStep(stepIndex){
  if (stepIndex < 0 || stepIndex >= DEAD_WALL_INDICATOR_MAX) return null;
  return getDeadWallTileAt(DEAD_WALL_DORA_START + stepIndex);
}

function getDeadWallUraTileByStep(stepIndex){
  if (stepIndex < 0 || stepIndex >= DEAD_WALL_INDICATOR_MAX) return null;
  return getDeadWallTileAt(DEAD_WALL_URA_START + stepIndex);
}

function resetDoraIndicatorsFromDeadWall(){
  doraIndicators = [];
  uraDoraIndicators = [];

  const omote = getDeadWallInitialDoraTile();
  if (omote){
    const like = cloneIndicatorLike(omote);
    if (like) doraIndicators.push(like);
  }

  if (isUraDoraEnabledForGame()){
    const ura = getDeadWallInitialUraTile();
    if (ura){
      const like = cloneIndicatorLike(ura);
      if (like) uraDoraIndicators.push(like);
    }
  }
}

function pushNextKanDoraIndicatorsFromDeadWall(){
  const currentOmoteCount = Array.isArray(doraIndicators) ? doraIndicators.length : 0;
  const currentUraCount = Array.isArray(uraDoraIndicators) ? uraDoraIndicators.length : 0;

  if (getConfiguredWallEndTypeForGame() === "all"){
    appendTorikiriKanIndicatorPair();
  }

  if (isKanDoraEnabledForGame()){
    const nextOmote = getDeadWallDoraTileByStep(currentOmoteCount);
    if (nextOmote){
      const like = cloneIndicatorLike(nextOmote);
      if (like){
        if (!Array.isArray(doraIndicators)) doraIndicators = [];
        doraIndicators.push(like);
      }
    }
  }

  if (isUraDoraEnabledForGame() && isKanUraEnabledForGame()){
    const nextUra = getDeadWallUraTileByStep(currentUraCount);
    if (nextUra){
      const like = cloneIndicatorLike(nextUra);
      if (like){
        if (!Array.isArray(uraDoraIndicators)) uraDoraIndicators = [];
        uraDoraIndicators.push(like);
      }
    }
  }
}

// ================================
// ===== 山から1枚ツモる（通常山） =====
// - turn.js / riichi.js から呼ばれる
// - 状態変更：wall から1枚引いて返す
// ================================
function drawOne(){
  resetCurrentWinContext();

  let t = null;

  if (Array.isArray(wall) && wall.length > 0){
    t = wall.pop() || null;
  } else if (getConfiguredWallEndTypeForGame() === "all" && Array.isArray(torikiriDrawableTiles) && torikiriDrawableTiles.length > 0){
    t = torikiriDrawableTiles.pop() || null;
  }

  if (t) t.isNew = true;
  return t || null;
}

function drawNextSupplementFromDeadWall(){
  if (!Array.isArray(deadWall) || deadWall.length <= 0) return null;
  if (deadWallDrawCursor >= DEAD_WALL_DRAW_COUNT) return null;

  const t = deadWall[deadWallDrawCursor];
  if (!t) return null;

  deadWallDrawCursor++;
  t.isNew = true;
  return t;
}

// 王牌から引く（カン用）
function drawFromDeadWallForKan(){
  const t = drawNextSupplementFromDeadWall();
  if (!t) return null;

  if (getConfiguredWallEndTypeForGame() !== "all"){
    appendKanRefillTileFromLiveWall();
  }
  return t;
}

// 王牌から引く（北抜き用）
function drawFromDeadWallForPei(){
  return drawNextSupplementFromDeadWall();
}


// ================================
// ===== エラーを画面に出す（コンソール不要化） =====
// ================================
let __fatalOverlayEl = null;

function ensureFatalOverlay(){
  if (__fatalOverlayEl) return __fatalOverlayEl;

  const el = document.createElement("div");
  el.id = "fatalOverlay";
  el.style.position = "fixed";
  el.style.inset = "0";
  el.style.display = "none";
  el.style.zIndex = "20000";
  el.style.background = "rgba(0,0,0,0.78)";
  el.style.color = "#fff";
  el.style.fontFamily = "system-ui, sans-serif";
  el.style.padding = "18px";
  el.style.boxSizing = "border-box";
  el.style.overflow = "auto";

  const box = document.createElement("div");
  box.style.maxWidth = "980px";
  box.style.margin = "0 auto";
  box.style.background = "rgba(0,0,0,0.35)";
  box.style.border = "1px solid rgba(255,255,255,0.18)";
  box.style.borderRadius = "14px";
  box.style.padding = "14px 14px 10px";
  box.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = "エラーが発生しました（画面に原因を表示します）";
  title.style.fontWeight = "900";
  title.style.fontSize = "16px";
  title.style.marginBottom = "10px";

  const msg = document.createElement("pre");
  msg.id = "fatalMsg";
  msg.style.whiteSpace = "pre-wrap";
  msg.style.wordBreak = "break-word";
  msg.style.fontSize = "12px";
  msg.style.lineHeight = "1.5";
  msg.style.margin = "0";

  const hint = document.createElement("div");
  hint.textContent = "クリックで閉じる（ただし内部状態は壊れている可能性があります）";
  hint.style.opacity = "0.85";
  hint.style.fontSize = "12px";
  hint.style.marginTop = "10px";

  box.appendChild(title);
  box.appendChild(msg);
  box.appendChild(hint);
  el.appendChild(box);

  el.addEventListener("click", ()=>{
    el.style.display = "none";
  });

  document.body.appendChild(el);
  __fatalOverlayEl = el;
  return el;
}

function showFatalError(err, extra){
  try{
    const el = ensureFatalOverlay();
    const pre = el.querySelector("#fatalMsg");
    const lines = [];

    if (extra) lines.push(String(extra));
    if (err && err.stack) lines.push(err.stack);
    else if (err && err.message) lines.push(err.message);
    else lines.push(String(err));

    pre.textContent = lines.join("\n\n");
    el.style.display = "block";
  }catch(_e){
    // 最後の砦：何もしない
  }
}

// ★ Script error. でも filename/line/col を出す
window.addEventListener("error", (ev)=>{
  try{
    // =========================================================
    // ★ ノイズ対策（重要）
    //   「Script error.」かつ詳細（filename/line）が取れないケースは、
    //   拡張機能やブラウザ内部由来のことが多く、ゲームが正常に動いていても出る。
    //   → これだけは“致命扱いしない”で無視する（本体エラーは従来通り表示）
    // =========================================================
    const msgOnly = (ev && typeof ev.message === "string") ? ev.message : "";
    const fileOnly = (ev && typeof ev.filename === "string") ? ev.filename : "";

    // 典型：Script error. / (no filename):?:?
    if (msgOnly === "Script error." && (!fileOnly || fileOnly === "(no filename)")){
      return;
    }

    // 拡張機能起因（詳細が取れない/不要なものが多い）
    if (fileOnly && (fileOnly.startsWith("chrome-extension://") || fileOnly.startsWith("extensions::"))){
      return;
    }

    // =========================================================
    // ★ resource error（画像/JS/CSS読み込み失敗）対策
    //   - 牌画像は img.onerror で置換しているので、ここでは「致命扱いしない」
    //   - script/link の読み込み失敗はゲームが動かないので、原因を明示して表示
    // =========================================================
    const target = ev && ev.target;
    if (target && target.tagName){
      const tag = String(target.tagName).toUpperCase();
      const url = target.src || target.href || "";

      // 牌画像など IMG の読み込み失敗は「表示劣化」だけなので黙って無視
      if (tag === "IMG"){
        return;
      }

      // SCRIPT / LINK の読み込み失敗は致命（JS/CSSが欠けている）
      if ((tag === "SCRIPT" || tag === "LINK") && url){
        showFatalError(`Resource load failed\n${tag}: ${url}`, "resource.onerror");
        return;
      }
    }

    const fallback =
      `${ev && ev.message ? ev.message : "Unknown error"}\n` +
      `${ev && ev.filename ? ev.filename : "(no filename)"}:${ev && ev.lineno ? ev.lineno : "?"}:${ev && ev.colno ? ev.colno : "?"}`;

    showFatalError(ev.error || fallback, "window.onerror");
  }catch(e){
    showFatalError(e, "window.onerror(handler failed)");
  }
});

window.addEventListener("unhandledrejection", (ev)=>{
  showFatalError(ev.reason, "unhandledrejection");
});
