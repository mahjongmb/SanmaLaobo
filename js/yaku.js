// MBsanma/js/yaku.js
// ========= yaku.js（役判定 / 打点素材） =========
// 目的：
// - 役判定を既存進行から分離して、あとから点数計算 / CPU判断へ流用しやすくする
// - 状態変更はしない（純関数中心）
//
// この段階で扱うもの：
// - 通常役（主要役）
//   リーチ / 門前ツモ / 役牌 / 断么九 / 平和 / 一盃口 /
//   七対子 / 対々和 / 三暗刻 / 混一色 / 清一色 / 小三元 / 混老頭
// - 役満
//   国士無双（単役満のみ）
// - ボーナス集計素材
//   ドラ / 赤ドラ / 北ドラ（※北ドラは役ではなく bonus 側で返す）
//
// 注意：
// - まだ点数計算そのものはしない
// - ドラ類だけではアガリ不可なので、役判定と bonus は分けて返す
// - render.js など描画系からは呼ばない前提

const YAKU_DEFS = {
  riichi:        { key: "riichi",        name: "リーチ",       han: 1 },
  openRiichi:    { key: "openRiichi",    name: "オープンリーチ", han: 1 },
  openRiichiForcedDealInYakuman: { key: "openRiichiForcedDealInYakuman", name: "手詰まり放銃", han: 0, yakuman: 1 },
  doubleRiichi:  { key: "doubleRiichi",  name: "ダブリー",     han: 2 },
  ippatsu:       { key: "ippatsu",       name: "一発",         han: 1 },
  menzenTsumo:   { key: "menzenTsumo",   name: "門前ツモ",     han: 1 },
  haitei:        { key: "haitei",        name: "海底撈月",     han: 1 },
  houtei:        { key: "houtei",        name: "河底撈魚",     han: 1 },
  rinshan:       { key: "rinshan",       name: "嶺上開花",     han: 1 },
  chankan:       { key: "chankan",       name: "槍槓",         han: 1 },
  tanyao:        { key: "tanyao",        name: "断么九",       han: 1, kuisagari: false },
  pinfu:         { key: "pinfu",         name: "平和",         han: 1 },
  iipeiko:       { key: "iipeiko",       name: "一盃口",       han: 1 },
  ryanpeiko:     { key: "ryanpeiko",     name: "二盃口",       han: 3 },
  chiitoi:       { key: "chiitoi",       name: "七対子",       han: 2 },
  yakuhaiSeat:   { key: "yakuhaiSeat",   name: "自風",         han: 1 },
  yakuhaiRound:  { key: "yakuhaiRound",  name: "場風",         han: 1 },
  yakuhaiHaku:   { key: "yakuhaiHaku",   name: "白",           han: 1 },
  yakuhaiHatsu:  { key: "yakuhaiHatsu",  name: "發",           han: 1 },
  yakuhaiChun:   { key: "yakuhaiChun",   name: "中",           han: 1 },
  toitoi:        { key: "toitoi",        name: "対々和",       han: 2 },
  sanankou:      { key: "sanankou",      name: "三暗刻",       han: 2 },
  sanshokuDokou: { key: "sanshokuDokou", name: "三色同刻",     han: 2 },
  sankantsu:     { key: "sankantsu",     name: "三槓子",       han: 2 },
  ittsuu:        { key: "ittsuu",        name: "一気通貫",     han: 2, kuisagariHan: 1 },
  chanta:        { key: "chanta",        name: "混全帯么九",   han: 2, kuisagariHan: 1 },
  junchan:       { key: "junchan",       name: "純全帯么九",   han: 3, kuisagariHan: 2 },
  honitsu:       { key: "honitsu",       name: "混一色",       han: 3, kuisagariHan: 2 },
  chinitsu:      { key: "chinitsu",       name: "清一色",       han: 6, kuisagariHan: 5 },
  shousangen:    { key: "shousangen",    name: "小三元",       han: 2 },
  honroutou:     { key: "honroutou",     name: "混老頭",       han: 2 },
  localSanpuu:   { key: "localSanpuu",   name: "三風",         han: 2 },
  localSanrenkou:{ key: "localSanrenkou",name: "三連刻",       han: 2 },
  localSuurenkou:{ key: "localSuurenkou",name: "四連刻",       han: 0, yakuman: 1 },
  localShousharin:{ key: "localShousharin", name: "小車輪",    han: 0, yakuman: 1 },
  localDaisharin:{ key: "localDaisharin",name: "大車輪",       han: 0, yakuman: 1 },
  localManzuHonitsu:{ key: "localManzuHonitsu", name: "萬子のホンイツ", han: 6 },
  nagashiBaiman: { key: "nagashiBaiman", name: "流し倍満",     han: 8 },
  kokushi:       { key: "kokushi",       name: "国士無双",     han: 0, yakuman: 1 }
};

function yakuTileIsTerminalOrHonor(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  if (suit === "z") return true;
  if (suit === "m" || suit === "p" || suit === "s"){
    return code[0] === "1" || code[0] === "9";
  }
  return false;
}

function yakuTileIsHonor(code){
  return !!code && code[1] === "z";
}

function yakuTileIsYaochu(code){
  return yakuTileIsTerminalOrHonor(code);
}
function yakuTileIsYaochuDiscardForNagashi(code){
  return yakuTileIsTerminalOrHonor(code);
}

function getRuleValueForYaku(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getConfiguredNagashiModeForYaku(){
  const raw = String(getRuleValueForYaku("extra-nagashi-mode", "baiman") || "").toLowerCase();
  if (raw === "mangan") return "mangan";
  if (raw === "off") return "off";
  return "baiman";
}

function isRuleOnForYaku(key, fallback){
  const raw = String(getRuleValueForYaku(key, fallback ? "on" : "off") || "").toLowerCase();
  if (raw === "on") return true;
  if (raw === "off") return false;
  return !!fallback;
}

const YAKU_RULE_KEY_MAP = {
  riichi: "yaku-riichi",
  doubleRiichi: "yaku-double-riichi",
  ippatsu: "yaku-ippatsu",
  menzenTsumo: "yaku-tsumo",
  tanyao: "yaku-tanyao",
  pinfu: "yaku-pinfu",
  iipeiko: "yaku-iipeikou",
  ryanpeiko: "yaku-ryanpeikou",
  chiitoi: "yaku-chiitoitsu",
  yakuhaiSeat: "yaku-yakuhai",
  yakuhaiRound: "yaku-yakuhai",
  yakuhaiHaku: "yaku-yakuhai",
  yakuhaiHatsu: "yaku-yakuhai",
  yakuhaiChun: "yaku-yakuhai",
  haitei: "yaku-haitei",
  houtei: "yaku-houtei",
  rinshan: "yaku-rinshan",
  chankan: "yaku-chankan",
  toitoi: "yaku-toitoi",
  sanankou: "yaku-sanankou",
  sanshokuDokou: "yaku-sanshoku-doukou",
  sankantsu: "yaku-sankantsu",
  ittsuu: "yaku-ittsuu",
  chanta: "yaku-chanta",
  junchan: "yaku-junchan",
  honroutou: "yaku-honroutou",
  shousangen: "yaku-shousangen",
  honitsu: "yaku-honitsu",
  chinitsu: "yaku-chinitsu",
  nagashiBaiman: "yaku-nagashi-baiman-base",
  renhou: "yaku-renhou",
  kokushi: "yaku-kokushi",
  suuankou: "yaku-suuankou",
  daisangen: "yaku-daisangen",
  tsuuiisou: "yaku-tsuuiisou",
  ryuuiisou: "yaku-ryuuiisou",
  chinroutou: "yaku-chinroutou",
  shousuushii: "yaku-shousuushii",
  daisuushii: "yaku-daisuushii",
  chuurenpoutou: "yaku-chuuren",
  suukantsu: "yaku-suukantsu",
  tenhou: "yaku-tenhou",
  chiihou: "yaku-chiihou"
  ,localSanpuu: "yaku-local-sanpuu"
  ,localSanrenkou: "yaku-local-sanrenkou"
  ,localSuurenkou: "yaku-local-suurenkou"
  ,localShousharin: "yaku-local-shousharin"
  ,localDaisharin: "yaku-local-daisharin"
};

function isAdoptedYakuEnabled(key){
  const ruleKey = YAKU_RULE_KEY_MAP[key];
  if (!ruleKey) return true;
  const value = getRuleValueForYaku(ruleKey, true);
  if (typeof value === "boolean") return value;
  const raw = String(value == null ? "" : value).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "off") return false;
  return !!value;
}

function isKuitanEnabledForYaku(){
  return isRuleOnForYaku("basic-kuitan-type", true);
}

function isChiitoi4maiEnabledForYaku(){
  return isRuleOnForYaku("basic-chiitoi-4mai", true);
}

function isUraDoraEnabledForYaku(){
  const raw = getRuleValueForYaku("tiles-uradora", true);
  if (typeof raw === "boolean") return raw;
  const text = String(raw == null ? "" : raw).toLowerCase();
  if (text === "true" || text === "1" || text === "on") return true;
  if (text === "false" || text === "0" || text === "off") return false;
  return true;
}

function countConfiguredUraDoraForYaku(result){
  if (!result || !result.input || !result.input.isRiichi) return 0;
  if (!isUraDoraEnabledForYaku()) return 0;
  return countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators);
}

function getAtozukeModeForYaku(){
  const raw = String(getRuleValueForYaku("basic-atozuke-type", "allow") || "").toLowerCase();
  if (raw === "on") return "allow";
  if (raw === "off") return "kanzen_sakizuke";
  if (raw === "no_atozuke") return "kanzen_sakizuke";
  if (raw === "kanzen_sakizuke") return "kanzen_sakizuke";
  return "allow";
}

function isTsumopinEnabledForYaku(){
  return isRuleOnForYaku("basic-tsumopin", true);
}

function isKokushiAnkanRonEnabledForYaku(){
  return isRuleOnForYaku("extra-kokushi-ankan-ron", true);
}

function getConfiguredLocalManzuHonitsuModeForYaku(){
  const raw = String(getRuleValueForYaku("yaku-local-manzu-honitsu", "yakuman") || "").toLowerCase();
  if (raw === "off") return "off";
  if (raw === "yakuman") return "yakuman";
  return "han6";
}

function isKokushiResultForYaku(result){
  if (!result || !result.isAgari || !Array.isArray(result.yaku)) return false;
  return result.yaku.some((item)=> item && item.key === "kokushi");
}

function getImplicitSpecialRonOptionsForYaku(opts){
  if (opts && opts.isAnkanRon) return { isAnkanRon: true };
  try{
    if (typeof window !== "undefined" && window.MBSanmaSpecialRonContext && window.MBSanmaSpecialRonContext.type === "ankanRon") {
      return { isAnkanRon: true };
    }
  }catch(e){}
  return {};
}

function applyKokushiAnkanRonRestrictionToYakuResult(result, opts){
  const effectiveOpts = getImplicitSpecialRonOptionsForYaku(opts);
  if (!effectiveOpts.isAnkanRon) return result;
  if (!result || !result.isAgari) return result;
  if (!isKokushiAnkanRonEnabledForYaku()) return invalidateAtozukeResult(result);
  if (!isKokushiResultForYaku(result)) return invalidateAtozukeResult(result);
  return result;
}

function getAtozukeComparableYakuKeys(result){
  const keys = new Set();
  const list = result && Array.isArray(result.yaku) ? result.yaku : [];
  for (const item of list){
    if (!item || !item.key) continue;
    keys.add(item.key);
  }
  return keys;
}

function removeOneTileByCodeForYaku(tiles, code){
  const src = Array.isArray(tiles) ? tiles.slice() : [];
  const out = [];
  let removed = false;
  for (const tile of src){
    if (!removed && tile && tile.code === code){
      removed = true;
      continue;
    }
    out.push(tile);
  }
  return removed ? out : null;
}

function getGuaranteedAtozukeYakuKeysFromTenpai(opts){
  const tiles14 = Array.isArray(opts && opts.tiles14) ? opts.tiles14.slice() : [];
  const meldList = Array.isArray(opts && opts.meldList) ? opts.meldList.slice() : [];
  const winTileCode = opts && opts.winTileCode ? String(opts.winTileCode) : "";
  if (!winTileCode) return { waitCount: 0, keys: new Set() };

  const base13 = removeOneTileByCodeForYaku(tiles14, winTileCode);
  if (!Array.isArray(base13) || base13.length !== 13) return { waitCount: 0, keys: new Set() };

  const fixedM = Array.isArray(meldList) ? meldList.length : 0;
  let shared = null;
  let waitCount = 0;

  for (const code of TILE_TYPES){
    const candidateTiles14 = base13.slice();
    candidateTiles14.push({ code });

    try{
      if (typeof calcShanten === "function" && calcShanten(yakuSafeCountsFromTiles(candidateTiles14), fixedM) !== -1){
        continue;
      }
    }catch(e){
      continue;
    }

    const info = getAgariYakuInfoCore({
      ...opts,
      tiles14: candidateTiles14,
      winTileCode: code
    });

    if (!info || !info.isAgari) continue;

    waitCount++;

    if ((info.yakuman | 0) <= 0 && (info.han | 0) <= 0){
      return { waitCount, keys: new Set() };
    }

    const currentKeys = getAtozukeComparableYakuKeys(info);
    if (shared === null){
      shared = currentKeys;
    } else {
      shared = new Set(Array.from(shared).filter((key)=> currentKeys.has(key)));
    }

    if (shared.size <= 0){
      return { waitCount, keys: new Set() };
    }
  }

  return {
    waitCount,
    keys: shared || new Set()
  };
}

function invalidateAtozukeResult(result){
  if (!result) return result;
  result.isAgari = false;
  result.yaku = [];
  result.han = 0;
  result.yakuman = 0;
  result.totalHan = 0;
  return result;
}

function applyCommonWaitYakuRestrictionToYakuResult(result){
  if (!result || !result.input || !result.isAgari) return result;
  if ((result.yakuman | 0) > 0) return result;

  const guaranteed = getGuaranteedAtozukeYakuKeysFromTenpai(result.input);
  if ((guaranteed.waitCount | 0) <= 0) return result;
  if (!guaranteed.keys || guaranteed.keys.size <= 0){
    return invalidateAtozukeResult(result);
  }

  const currentKeys = getAtozukeComparableYakuKeys(result);
  for (const key of guaranteed.keys){
    if (currentKeys.has(key)) return result;
  }

  return invalidateAtozukeResult(result);
}

function applyNoAtozukeRestrictionToYakuResult(result){
  return applyCommonWaitYakuRestrictionToYakuResult(result);
}

function isWindCodeForYaku(code){
  return code === "1z" || code === "2z" || code === "3z" || code === "4z";
}

function isDragonCodeForYaku(code){
  return code === "5z" || code === "6z" || code === "7z";
}

function isKanTypeForYaku(type){
  return type === "minkan" || type === "ankan" || type === "kakan";
}

function isGreenTileCodeForYaku(code){
  return code === "2s" || code === "3s" || code === "4s" || code === "6s" || code === "8s" || code === "6z";
}

function getFirstOpenMeldForSakizuke(meldList){
  if (!Array.isArray(meldList)) return null;
  for (const meld of meldList){
    if (!meld || !meld.type) continue;
    if (meld.type === "pon" || meld.type === "minkan" || meld.type === "kakan") return meld;
  }
  return null;
}

function resultHasYakuKey(result, key){
  if (!result || !Array.isArray(result.yaku)) return false;
  return result.yaku.some((item)=> item && item.key === key);
}

function cloneYakuResultForAtozuke(result){
  if (!result) return result;
  try{
    return JSON.parse(JSON.stringify(result));
  }catch(e){
    return result;
  }
}

function isKanzenSakizukeOutebishaShanponWait(result){
  if (!result || !result.input || result.handKind !== "standard") return false;
  const winTileCode = result.input.winTileCode ? String(result.input.winTileCode) : "";
  if (!winTileCode || !result.pattern || !Array.isArray(result.pattern.melds)) return false;

  return result.pattern.melds.some((group)=>{
    return !!group && group.type === "koutsu" && group.code === winTileCode;
  });
}

function getKanzenSakizukeOutebishaWaitType(result){
  if (!isKanzenSakizukeOutebishaShanponWait(result)) return "";

  const yakuKeys = getAtozukeComparableYakuKeys(result);
  const hasYakuhai = (
    yakuKeys.has("yakuhaiSeat") ||
    yakuKeys.has("yakuhaiRound") ||
    yakuKeys.has("yakuhaiHaku") ||
    yakuKeys.has("yakuhaiHatsu") ||
    yakuKeys.has("yakuhaiChun")
  );
  if (hasYakuhai) return "yakuhai";
  if (yakuKeys.has("sanshokuDokou")) return "sanshokuDokou";
  return "";
}

function isKanzenSakizukeOutebishaPatternFromTenpai(opts){
  const tiles14 = Array.isArray(opts && opts.tiles14) ? opts.tiles14.slice() : [];
  const meldList = Array.isArray(opts && opts.meldList) ? opts.meldList.slice() : [];
  const winTileCode = opts && opts.winTileCode ? String(opts.winTileCode) : "";
  if (!winTileCode) return false;

  const base13 = removeOneTileByCodeForYaku(tiles14, winTileCode);
  if (!Array.isArray(base13) || base13.length !== 13) return false;

  const fixedM = Array.isArray(meldList) ? meldList.length : 0;
  const waitTypes = [];

  for (const code of TILE_TYPES){
    const candidateTiles14 = base13.slice();
    candidateTiles14.push({ code });

    try{
      if (typeof calcShanten === "function" && calcShanten(yakuSafeCountsFromTiles(candidateTiles14), fixedM) !== -1){
        continue;
      }
    }catch(e){
      continue;
    }

    const info = getAgariYakuInfoCore({
      ...opts,
      tiles14: candidateTiles14,
      winTileCode: code
    });
    if (!info || !info.isAgari) continue;

    const waitType = getKanzenSakizukeOutebishaWaitType(info);
    if (!waitType) return false;
    waitTypes.push(waitType);
  }

  if (waitTypes.length !== 2) return false;

  const yakuhaiCount = waitTypes.filter((type)=> type === "yakuhai").length;
  const sanshokuCount = waitTypes.filter((type)=> type === "sanshokuDokou").length;
  if (yakuhaiCount === 2) return true;
  if (yakuhaiCount === 1 && sanshokuCount === 1) return true;
  return false;
}

function isFirstMeldPartOfSanshokuDokou(result, code){
  if (!result || !result.pattern || !code || !yakuTileIsNumber(code)) return false;
  const groups = [];
  if (Array.isArray(result.pattern.melds)) groups.push(...result.pattern.melds);
  groups.push(...normalizeExternalMeldGroups(result.input && result.input.meldList));

  const num = code[0];
  let hasM = false;
  let hasP = false;
  let hasS = false;
  for (const g of groups){
    if (!g || g.type !== "koutsu" || !g.code) continue;
    if (g.code[0] !== num) continue;
    if (g.code[1] === "m") hasM = true;
    if (g.code[1] === "p") hasP = true;
    if (g.code[1] === "s") hasS = true;
  }
  return hasM && hasP && hasS;
}

function isFirstMeldPartOfHonitsuLike(result, code, requireHonorless){
  if (!result || !code) return false;
  const codes = getTileCodeListFromTilesAndMelds(result.input && result.input.tiles14, result.input && result.input.meldList);
  const profile = getSuitProfile(codes);
  if (profile.suits.size !== 1) return false;
  const suit = Array.from(profile.suits)[0] || "";
  if (requireHonorless){
    return !profile.hasHonor && yakuTileSuit(code) === suit;
  }
  if (yakuTileIsHonor(code)) return true;
  return yakuTileSuit(code) === suit;
}

function isFirstOpenMeldRelatedToCurrentYaku(result){
  if (!result || !result.input || !result.isAgari) return true;

  const firstMeld = getFirstOpenMeldForSakizuke(result.input.meldList);
  if (!firstMeld || !firstMeld.code) return true;

  const code = firstMeld.code;
  const yakuKeys = getAtozukeComparableYakuKeys(result);
  if (yakuKeys.size <= 0) return false;

  const yakuhaiTargets = getYakuhaiTargetCodes(result.input.roundWind, result.input.seatWind);
  if (yakuKeys.has("yakuhaiSeat") && code === yakuhaiTargets.seatCode) return true;
  if (yakuKeys.has("yakuhaiRound") && (code === yakuhaiTargets.roundCode || code === yakuhaiTargets.extraRoundCode)) return true;
  if (yakuKeys.has("yakuhaiHaku") && code === yakuhaiTargets.dragonHaku) return true;
  if (yakuKeys.has("yakuhaiHatsu") && code === yakuhaiTargets.dragonHatsu) return true;
  if (yakuKeys.has("yakuhaiChun") && code === yakuhaiTargets.dragonChun) return true;

  if (yakuKeys.has("toitoi")) return true;
  if (yakuKeys.has("sanshokuDokou") && isFirstMeldPartOfSanshokuDokou(result, code)) return true;
  if (yakuKeys.has("sankantsu") && isKanTypeForYaku(firstMeld.type)) return true;

  if (yakuKeys.has("chanta") && yakuTileIsTerminalOrHonor(code)) return true;
  if (yakuKeys.has("junchan") && !yakuTileIsHonor(code) && yakuTileIsTerminalOrHonor(code)) return true;
  if (yakuKeys.has("honroutou") && yakuTileIsTerminalOrHonor(code)) return true;

  if (yakuKeys.has("honitsu") && isFirstMeldPartOfHonitsuLike(result, code, false)) return true;
  if (yakuKeys.has("chinitsu") && isFirstMeldPartOfHonitsuLike(result, code, true)) return true;

  if (yakuKeys.has("shousangen") && isDragonCodeForYaku(code)) return true;
  if (yakuKeys.has("daisangen") && isDragonCodeForYaku(code)) return true;
  if (yakuKeys.has("shousuushii") && isWindCodeForYaku(code)) return true;
  if (yakuKeys.has("daisuushii") && isWindCodeForYaku(code)) return true;
  if (yakuKeys.has("tsuuiisou") && yakuTileIsHonor(code)) return true;
  if (yakuKeys.has("ryuuiisou") && isGreenTileCodeForYaku(code)) return true;
  if (yakuKeys.has("chinroutou") && !yakuTileIsHonor(code) && yakuTileIsTerminalOrHonor(code)) return true;
  if (yakuKeys.has("suukantsu") && isKanTypeForYaku(firstMeld.type)) return true;

  return false;
}

function getKanzenSakizukeAllowed1bYakuKeys(){
  return new Set([
    "yakuhaiSeat",
    "yakuhaiRound",
    "yakuhaiHaku",
    "yakuhaiHatsu",
    "yakuhaiChun",
    "ittsuu"
  ]);
}

function getKanzenSakizuke1bConcealedGroups(result){
  const groups = [];
  if (result && result.pattern && Array.isArray(result.pattern.melds)){
    groups.push(...result.pattern.melds);
  }

  const externalGroups = normalizeExternalMeldGroups(result && result.input && result.input.meldList);
  for (const g of externalGroups){
    if (!g || !g.concealed) continue;
    groups.push(g);
  }

  return groups;
}

function hasKanzenSakizuke1bConcealedYakuhai(result){
  const groups = getKanzenSakizuke1bConcealedGroups(result);
  if (!Array.isArray(groups) || groups.length <= 0) return false;

  const targets = getYakuhaiTargetCodes(
    result && result.input ? result.input.roundWind : null,
    result && result.input ? result.input.seatWind : null
  );
  const targetCodes = new Set([
    targets.seatCode,
    targets.roundCode,
    targets.extraRoundCode,
    targets.dragonHaku,
    targets.dragonHatsu,
    targets.dragonChun
  ].filter(Boolean));

  for (const g of groups){
    if (!g || g.type !== "koutsu" || !g.code) continue;
    if (targetCodes.has(g.code)) return true;
  }

  return false;
}

function hasKanzenSakizuke1bConcealedIttsuu(result){
  const groups = getKanzenSakizuke1bConcealedGroups(result);
  if (!Array.isArray(groups) || groups.length <= 0) return false;

  for (const suit of ["p", "s"]){
    let has123 = false;
    let has456 = false;
    let has789 = false;

    for (const g of groups){
      if (!g || g.type !== "shuntsu" || !g.code) continue;
      if (g.code[1] !== suit) continue;
      if (g.code === `1${suit}`) has123 = true;
      if (g.code === `4${suit}`) has456 = true;
      if (g.code === `7${suit}`) has789 = true;
    }

    if (has123 && has456 && has789) return true;
  }

  return false;
}

function isKanzenSakizuke1bSatisfied(result){
  if (!result || !result.input || !result.isAgari) return false;

  const allowedKeys = getKanzenSakizukeAllowed1bYakuKeys();
  const currentKeys = getAtozukeComparableYakuKeys(result);
  let hasAllowedCurrentYaku = false;
  for (const key of currentKeys){
    if (allowedKeys.has(key)){
      hasAllowedCurrentYaku = true;
      break;
    }
  }
  if (!hasAllowedCurrentYaku) return false;

  if (hasKanzenSakizuke1bConcealedYakuhai(result)) return true;
  if (hasKanzenSakizuke1bConcealedIttsuu(result)) return true;

  return false;
}

function applyKanzenSakizukeRestrictionToYakuResult(result){
  if (!result || !result.input || !result.isAgari) return result;

  const commonWaitBase = cloneYakuResultForAtozuke(result);
  const commonWaitResult = applyCommonWaitYakuRestrictionToYakuResult(commonWaitBase);
  if (commonWaitResult && commonWaitResult.isAgari){
    const is1aSatisfied = isFirstOpenMeldRelatedToCurrentYaku(commonWaitResult);
    const is1bSatisfied = isKanzenSakizuke1bSatisfied(commonWaitResult);
    if (is1aSatisfied || is1bSatisfied) return commonWaitResult;
    return invalidateAtozukeResult(commonWaitResult);
  }

  if (isKanzenSakizukeOutebishaPatternFromTenpai(result.input)){
    const is1aSatisfied = isFirstOpenMeldRelatedToCurrentYaku(result);
    const is1bSatisfied = isKanzenSakizuke1bSatisfied(result);
    if (is1aSatisfied || is1bSatisfied) return result;
  }

  return invalidateAtozukeResult(result);
}

function applyAtozukeRestrictionToYakuResult(result){
  if (!result || !result.input || !result.isAgari) return result;

  const mode = getAtozukeModeForYaku();
  if (mode === "allow") return result;
  if (mode === "no_atozuke") return applyCommonWaitYakuRestrictionToYakuResult(result);
  if (mode === "kanzen_sakizuke") return applyKanzenSakizukeRestrictionToYakuResult(result);
  return result;
}


function isNagashiOpenMeldType(type){
  return type === "pon" || type === "minkan" || type === "kakan";
}

function getNagashiCalledFromSeatIndex(callerSeatIndex, from){
  if (callerSeatIndex !== 0 && callerSeatIndex !== 1 && callerSeatIndex !== 2) return null;
  if (from === "R") return (callerSeatIndex + 1) % 3;
  if (from === "L") return (callerSeatIndex + 2) % 3;
  return null;
}

function getNagashiMeldMapFromGlobals(){
  return {
    0: Array.isArray(melds) ? melds.slice() : [],
    1: (typeof cpuRightMelds !== "undefined" && Array.isArray(cpuRightMelds)) ? cpuRightMelds.slice() : [],
    2: (typeof cpuLeftMelds !== "undefined" && Array.isArray(cpuLeftMelds)) ? cpuLeftMelds.slice() : []
  };
}

function getNagashiRiverMapFromGlobals(){
  return {
    0: Array.isArray(river) ? river.slice() : [],
    1: Array.isArray(cpuRightRiver) ? cpuRightRiver.slice() : [],
    2: Array.isArray(cpuLeftRiver) ? cpuLeftRiver.slice() : []
  };
}

function getNagashiCalledAwaySeatSetFromMeldMap(meldMap){
  const calledSeatSet = new Set();
  const src = (meldMap && typeof meldMap === "object") ? meldMap : {};

  for (const callerSeatIndex of [0, 1, 2]){
    const meldList = Array.isArray(src[callerSeatIndex]) ? src[callerSeatIndex] : [];
    for (const meld of meldList){
      if (!meld || !isNagashiOpenMeldType(meld.type)) continue;
      const discarderSeatIndex = getNagashiCalledFromSeatIndex(callerSeatIndex, meld.from);
      if (discarderSeatIndex === 0 || discarderSeatIndex === 1 || discarderSeatIndex === 2){
        calledSeatSet.add(discarderSeatIndex);
      }
    }
  }

  return calledSeatSet;
}

function isSeatRiichiAtNagashiCheck(seatIndex){
  try{
    if (typeof isSeatRiichiNow === "function"){
      return !!isSeatRiichiNow(seatIndex);
    }
  }catch(e){}

  if (seatIndex === 0) return !!isRiichi;
  if (seatIndex === 1) return !!cpuRightRiichi;
  if (seatIndex === 2) return !!cpuLeftRiichi;
  return false;
}

function isSeatNagashiBaimanQualified(seatIndex, riverMap, meldMap, calledAwaySeatSet){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return false;

  const rivers = (riverMap && typeof riverMap === "object") ? riverMap : {};
  const meldsBySeat = (meldMap && typeof meldMap === "object") ? meldMap : {};
  const myRiver = Array.isArray(rivers[seatIndex]) ? rivers[seatIndex] : [];
  const myMelds = Array.isArray(meldsBySeat[seatIndex]) ? meldsBySeat[seatIndex] : [];
  const calledSet = (calledAwaySeatSet instanceof Set) ? calledAwaySeatSet : new Set();

  if (myRiver.length <= 0) return false;
  if (calledSet.has(seatIndex)) return false;
  if (isSeatRiichiAtNagashiCheck(seatIndex)) return false;

  // 流し倍満は「自分が鳴いていない / 暗槓していない」が条件。
  // 北抜きは melds ではなく peis で管理しているため、ここでは失格にしない。
  if (myMelds.length > 0) return false;

  for (const tile of myRiver){
    if (!tile || !tile.code) return false;
    if (!yakuTileIsYaochuDiscardForNagashi(tile.code)) return false;
  }

  return true;
}

function getNagashiBaimanQualifiedSeatsFromState(riverMap = null, meldMap = null){
  if (getConfiguredNagashiModeForYaku() === "off") return [];
  const rivers = riverMap || getNagashiRiverMapFromGlobals();
  const meldsBySeat = meldMap || getNagashiMeldMapFromGlobals();
  const calledAwaySeatSet = getNagashiCalledAwaySeatSetFromMeldMap(meldsBySeat);

  const seats = [];
  for (const seatIndex of [0, 1, 2]){
    if (isSeatNagashiBaimanQualified(seatIndex, rivers, meldsBySeat, calledAwaySeatSet)){
      seats.push(seatIndex);
    }
  }
  return seats;
}

function createNagashiBaimanYakuInfo(seatIndex){
  const nagashiMode = getConfiguredNagashiModeForYaku();
  if (nagashiMode === "off") return null;

  const dealerSeatIndex = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  const seatWind = (typeof getSeatWindBySeatIndexForCpu === "function")
    ? getSeatWindBySeatIndexForCpu(seatIndex)
    : (seatIndex === dealerSeatIndex ? "東" : null);

  const result = buildYakuResultBase({
    tiles14: [],
    meldList: [],
    winType: "nagashi",
    winTileCode: null,
    roundWind: (typeof roundWind !== "undefined") ? roundWind : null,
    seatWind,
    isRiichi: false,
    doraIndicators: [],
    uraDoraIndicators: [],
    peis: []
  });

  result.isAgari = true;
  result.handKind = "nagashi";
  result.isMenzen = true;
  addYaku(
    result.yaku,
    "nagashiBaiman",
    nagashiMode === "mangan" ? "流し満貫" : "流し倍満",
    nagashiMode === "mangan" ? 5 : 8
  );
  return finalizeYakuResult(result);
}

function yakuTileIsNumber(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  return suit === "m" || suit === "p" || suit === "s";
}

function yakuTileSuit(code){
  if (!code || typeof code !== "string") return "";
  return code[1] || "";
}

function yakuCloneCounts(counts){
  return Array.isArray(counts) ? counts.slice() : Array(TILE_TYPES.length).fill(0);
}

function yakuSafeCountsFromTiles(tiles){
  if (typeof countsFromTiles === "function"){
    return countsFromTiles(Array.isArray(tiles) ? tiles : []);
  }
  const c = Array(TILE_TYPES.length).fill(0);
  if (!Array.isArray(tiles)) return c;
  for (const t of tiles){
    const code = t && t.code;
    const idx = TYPE_TO_IDX[code];
    if (idx !== undefined) c[idx]++;
  }
  return c;
}

function getDoraCodeFromIndicatorForYaku(code){
  if (!code || typeof code !== "string" || code.length < 2) return code;

  const num = Number(code[0]);
  const suit = code[1];

  if (suit === "p" || suit === "s"){
    if (!Number.isInteger(num) || num < 1 || num > 9) return code;
    return `${num === 9 ? 1 : num + 1}${suit}`;
  }

  if (suit === "z"){
    if (!Number.isInteger(num) || num < 1 || num > 7) return code;

    if (num >= 1 && num <= 4){
      return `${num === 4 ? 1 : num + 1}z`;
    }

    return `${num === 7 ? 5 : num + 1}z`;
  }

  if (suit === "m"){
    if (code === "1m") return "9m";
    if (code === "9m") return "1m";
  }

  return code;
}

function isMenzenByMelds(meldList){
  if (!Array.isArray(meldList) || meldList.length === 0) return true;
  for (const m of meldList){
    if (!m) continue;
    if (m.type === "ankan") continue;
    return false;
  }
  return true;
}

function normalizeExternalMeldGroups(meldList){
  const groups = [];
  if (!Array.isArray(meldList)) return groups;

  for (const m of meldList){
    if (!m || !m.code) continue;

    if (m.type === "pon" || m.type === "minkan" || m.type === "kakan" || m.type === "ankan"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: m.type !== "ankan",
        concealed: m.type === "ankan",
        source: m.type
      });
    }
  }

  return groups;
}

function getMeldTileCount(m){
  if (!m || !m.type) return 0;
  if (m.type === "pon") return 3;
  if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") return 4;
  return 0;
}

function getAgariShapeMeldTileCount(m){
  if (!m || !m.type) return 0;
  if (m.type === "pon") return 3;
  if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") return 3;
  return 0;
}

function getTotalTileCountFromTilesAndMelds(tiles14, meldList){
  let total = 0;

  if (Array.isArray(tiles14)){
    total += tiles14.length;
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      total += getMeldTileCount(m);
    }
  }

  return total;
}

function getAgariShapeTileCountFromTilesAndMelds(tiles14, meldList){
  let total = 0;

  if (Array.isArray(tiles14)){
    total += tiles14.length;
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      total += getAgariShapeMeldTileCount(m);
    }
  }

  return total;
}

function findStandardAgariPatternsFromCounts(counts){
  const results = [];
  const work = yakuCloneCounts(counts);

  function pushResult(pairCode, melds){
    results.push({
      handKind: "standard",
      pairCode,
      melds: melds.map(x => ({ ...x }))
    });
  }

  function dfs(melds){
    let first = -1;
    for (let i = 0; i < work.length; i++){
      if (work[i] > 0){
        first = i;
        break;
      }
    }

    if (first === -1){
      pushResult(dfs.pairCode, melds);
      return;
    }

    const code = TILE_TYPES[first];
    const suit = code[1];
    const n = Number(code[0]);

    if (work[first] >= 3){
      work[first] -= 3;
      melds.push({ type: "koutsu", code, open: false, concealed: true, source: "concealed" });
      dfs(melds);
      melds.pop();
      work[first] += 3;
    }

    if ((suit === "p" || suit === "s") && n >= 1 && n <= 7){
      const idx2 = TYPE_TO_IDX[`${n + 1}${suit}`];
      const idx3 = TYPE_TO_IDX[`${n + 2}${suit}`];
      if (idx2 !== undefined && idx3 !== undefined && work[first] > 0 && work[idx2] > 0 && work[idx3] > 0){
        work[first]--;
        work[idx2]--;
        work[idx3]--;
        melds.push({ type: "shuntsu", code, open: false, concealed: true, source: "concealed" });
        dfs(melds);
        melds.pop();
        work[first]++;
        work[idx2]++;
        work[idx3]++;
      }
    }
  }

  for (let i = 0; i < work.length; i++){
    if (work[i] < 2) continue;
    work[i] -= 2;
    dfs.pairCode = TILE_TYPES[i];
    dfs([]);
    work[i] += 2;
  }

  return results;
}

function isChiitoiAgariFromCounts(counts){
  let pairUnits = 0;
  let tileCount = 0;
  let hasFourOfKind = false;

  for (let i = 0; i < counts.length; i++){
    const n = counts[i] | 0;
    tileCount += n;
    pairUnits += Math.floor(n / 2);
    if (n >= 4) hasFourOfKind = true;
  }

  if (tileCount !== 14 || pairUnits < 7) return false;
  if (!isChiitoi4maiEnabledForYaku() && hasFourOfKind) return false;
  return true;
}

function getChiitoiPairsFromCounts(counts){
  const pairs = [];
  for (let i = 0; i < counts.length; i++){
    const n = counts[i] | 0;
    const code = TILE_TYPES[i];
    const unit = Math.floor(n / 2);
    for (let k = 0; k < unit; k++){
      if (pairs.length < 7) pairs.push(code);
    }
    if (pairs.length >= 7) break;
  }
  return pairs;
}

function isKokushiAgariFromCounts(counts, meldList){
  if (Array.isArray(meldList) && meldList.length > 0) return false;
  if (typeof calcShantenKokushi !== "function") return false;
  return calcShantenKokushi(counts, 0) === -1;
}

function getTileCodeListFromTilesAndMelds(tiles14, meldList){
  const codes = [];
  if (Array.isArray(tiles14)){
    for (const t of tiles14){
      if (t && t.code) codes.push(t.code);
    }
  }
  if (Array.isArray(meldList)){
    for (const m of meldList){
      if (!m || !m.code) continue;
      if (m.type === "pon"){
        codes.push(m.code, m.code, m.code);
      } else if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan"){
        codes.push(m.code, m.code, m.code, m.code);
      }
    }
  }
  return codes;
}

function countCodeInCodeList(codes, targetCode){
  let n = 0;
  for (const code of codes){
    if (code === targetCode) n++;
  }
  return n;
}

function normalizeChipTargetImgCodeForYaku(imgCode, code = ""){
  const raw = String(imgCode || code || "");
  if (!raw) return String(code || "");
  return raw;
}

function getTileColorKeyForYaku(tile){
  if (!tile || typeof tile !== "object") return "";
  if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
  const imgCode = normalizeChipTargetImgCodeForYaku(tile.imgCode || tile.code || "", tile.code || "");
  if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
  return tile.isRed ? "r" : "";
}

function createDefaultChipTargetTileSettingForYaku(){
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

function normalizeChipTargetTileSettingForYaku(value){
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

function getAllChipTargetSettingsForYaku(){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getChipTargetSettings === "function"){
      return window.MBSanmaRulesConfig.getChipTargetSettings() || {};
    }
  }catch(e){}
  return {};
}

function findChipTargetSettingForYakuTile(tile){
  const all = getAllChipTargetSettingsForYaku();
  const code = String(tile && tile.code || "");
  const imgCode = normalizeChipTargetImgCodeForYaku(tile && (tile.imgCode || tile.code) || "", code);
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
        setting: normalizeChipTargetTileSettingForYaku(all[key])
      };
    }
  }

  return {
    exists: false,
    key: "",
    setting: normalizeChipTargetTileSettingForYaku(createDefaultChipTargetTileSettingForYaku())
  };
}

function parseChipTargetCountForYaku(value){
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function getConfiguredTileDoraCountForYaku(tile, isMenzen = true){
  if (!tile || typeof tile !== "object") return 0;

  const found = findChipTargetSettingForYakuTile(tile);
  if (!found.setting || !found.setting.dora) return 0;

  if (found.setting.doraCount && typeof found.setting.doraCount === "object"){
    return parseChipTargetCountForYaku(isMenzen ? found.setting.doraCount.menzen : found.setting.doraCount.furo);
  }

  const useDetailedDora = !!found.setting.useDetailedDora;
  if (!useDetailedDora){
    return parseChipTargetCountForYaku(found.setting.doraCount);
  }

  return parseChipTargetCountForYaku(isMenzen ? found.setting.doraMenzenCount : found.setting.doraFuroCount);
}

function getConfiguredPeiTypeForYaku(){
  const raw = String(getRuleValueForYaku("tiles-pei-type", "nuki") || "").toLowerCase();
  if (raw === "bakaze") return "bakaze";
  if (raw === "otakaze") return "otakaze";
  return "nuki";
}

function isHanahaiEnabledForYaku(){
  return String(getRuleValueForYaku("tiles-hanahai-type", "off") || "").toLowerCase() === "on";
}

function isHanahaiTileForYaku(tile){
  if (!tile || typeof tile !== "object") return false;
  const imgCode = String(tile.imgCode || tile.code || "");
  return isHanahaiEnabledForYaku() && (imgCode === "1h" || imgCode === "2h" || imgCode === "3h" || imgCode === "4h");
}

function isPeiAbsoluteDoraOverrideEnabledForYaku(tile){
  if (!tile || typeof tile !== "object") return false;
  if (isHanahaiTileForYaku(tile)) return true;
  if (getConfiguredPeiTypeForYaku() !== "nuki") return false;
  return String(tile.code || "") === "4z";
}

function getPeiTileDoraCountForYaku(tile, isMenzen = true){
  if (!tile || typeof tile !== "object") return 0;
  if (!isPeiAbsoluteDoraOverrideEnabledForYaku(tile)){
    return getConfiguredTileDoraCountForYaku(tile, isMenzen);
  }

  const configured = getConfiguredTileDoraCountForYaku(tile, isMenzen);
  if (configured > 0) return configured;
  return 1;
}

function isAkaDoraTileForYaku(tile, isMenzen = true){
  return getConfiguredTileDoraCountForYaku(tile, isMenzen) > 0;
}

function getMeldTilesForYaku(meld){
  const out = [];
  if (!meld || typeof meld !== "object") return out;

  if (Array.isArray(meld.tiles)){
    for (const tile of meld.tiles){
      if (!tile || !tile.code) continue;
      out.push({ code: tile.code, imgCode: tile.imgCode || tile.code });
    }
  }

  if (meld.addedTile && meld.addedTile.code){
    out.push({ code: meld.addedTile.code, imgCode: meld.addedTile.imgCode || meld.addedTile.code });
  }

  return out;
}

function countAkaDoraInTilesAndMelds(tiles14, meldList, isMenzen = true){
  let count = 0;

  if (Array.isArray(tiles14)){
    for (const t of tiles14){
      if (!t) continue;
      count += getConfiguredTileDoraCountForYaku(t, isMenzen);
    }
  }

  if (Array.isArray(meldList)){
    for (const m of meldList){
      if (!m) continue;

      const meldTiles = getMeldTilesForYaku(m);
      if (meldTiles.length > 0){
        for (const tile of meldTiles){
          count += getConfiguredTileDoraCountForYaku(tile, isMenzen);
        }
        continue;
      }

    }
  }

  return count;
}

function countDoraFromIndicators(tiles14, meldList, indicators){
  if (!Array.isArray(indicators) || indicators.length === 0) return 0;

  const codes = getTileCodeListFromTilesAndMelds(tiles14, meldList);
  let total = 0;

  for (const d of indicators){
    const indicatorCode = d && d.code ? d.code : null;
    if (!indicatorCode) continue;
    const doraCode = getDoraCodeFromIndicatorForYaku(indicatorCode);
    total += countCodeInCodeList(codes, doraCode);
  }

  return total;
}

function countPeiDora(peisLike, isMenzen = true){
  if (!Array.isArray(peisLike)) return 0;
  let total = 0;
  for (const tile of peisLike){
    total += getPeiTileDoraCountForYaku(tile, isMenzen);
  }
  return total;
}

function countColorDoraInTilesAndMelds(tiles14, meldList, isMenzen = true){
  return countAkaDoraInTilesAndMelds(tiles14, meldList, isMenzen);
}

function countNukiDoraInPeis(peisLike, isMenzen = true){
  return countPeiDora(peisLike, isMenzen);
}

function getYakuhaiTargetCodes(roundWind, seatWind){
  const map = {
    east: "1z",
    south: "2z",
    west: "3z",
    north: "4z",
    "東": "1z",
    "南": "2z",
    "西": "3z",
    "北": "4z"
  };

  const peiType = getConfiguredPeiTypeForYaku();

  return {
    roundCode: map[roundWind] || null,
    extraRoundCode: peiType === "bakaze" ? "4z" : null,
    seatCode: map[seatWind] || null,
    dragonHaku: "5z",
    dragonHatsu: "6z",
    dragonChun: "7z"
  };
}

function countGroupByTypeAndCode(groups, type, code){
  let n = 0;
  if (!Array.isArray(groups)) return n;
  for (const g of groups){
    if (!g) continue;
    if (g.type === type && g.code === code) n++;
  }
  return n;
}

function allGroupsAreTriplets(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;
  for (const g of groups){
    if (!g || g.type !== "koutsu") return false;
  }
  return true;
}

function allGroupsAreSequences(groups){
  if (!Array.isArray(groups)) return false;
  for (const g of groups){
    if (!g || g.type !== "shuntsu") return false;
  }
  return true;
}

function pairCodeIsValue(pairCode, roundWind, seatWind){
  const yk = getYakuhaiTargetCodes(roundWind, seatWind);
  return (
    pairCode === yk.roundCode ||
    pairCode === yk.extraRoundCode ||
    pairCode === yk.seatCode ||
    pairCode === yk.dragonHaku ||
    pairCode === yk.dragonHatsu ||
    pairCode === yk.dragonChun
  );
}

function isRyanmenWaitForPinfu(shuntsuCode, winTileCode){
  if (!shuntsuCode || !winTileCode) return false;
  if (shuntsuCode[1] !== winTileCode[1]) return false;

  const start = Number(shuntsuCode[0]);
  const win = Number(winTileCode[0]);
  if (!Number.isInteger(start) || !Number.isInteger(win)) return false;

  if (start < 1 || start > 7) return false;
  if (win !== start && win !== start + 1 && win !== start + 2) return false;

  if (win === start + 1) return false;
  if (win === start && start === 7) return false;
  if (win === start + 2 && start === 1) return false;

  return true;
}

function hasPinfuPattern(pattern, externalGroups, winTileCode, roundWind, seatWind){
  if (!pattern || !winTileCode) return false;
  if (pairCodeIsValue(pattern.pairCode, roundWind, seatWind)) return false;

  const allGroups = [];
  if (Array.isArray(pattern.melds)) allGroups.push(...pattern.melds);
  if (Array.isArray(externalGroups)) allGroups.push(...externalGroups);

  if (!allGroupsAreSequences(allGroups)) return false;

  for (const g of pattern.melds){
    if (!g || g.type !== "shuntsu") continue;
    if (g.code[1] !== winTileCode[1]) continue;

    const start = Number(g.code[0]);
    const win = Number(winTileCode[0]);
    if (win !== start && win !== start + 1 && win !== start + 2) continue;

    if (isRyanmenWaitForPinfu(g.code, winTileCode)) return true;
  }

  return false;
}

function countIipeikoInPattern(pattern){
  if (!pattern || !Array.isArray(pattern.melds)) return 0;
  const map = new Map();
  for (const g of pattern.melds){
    if (!g || g.type !== "shuntsu") continue;
    const key = g.code;
    map.set(key, (map.get(key) || 0) + 1);
  }

  let count = 0;
  for (const n of map.values()){
    if (n >= 2) count += Math.floor(n / 2);
  }
  return count;
}

function countConcealedTriplets(pattern, externalGroups, winType, winTileCode){
  let count = 0;

  if (Array.isArray(pattern && pattern.melds)){
    for (const g of pattern.melds){
      if (!g || g.type !== "koutsu") continue;

      if (winType === "ron" && winTileCode && g.code === winTileCode){
        continue;
      }

      count++;
    }
  }

  if (Array.isArray(externalGroups)){
    for (const g of externalGroups){
      if (!g || g.type !== "koutsu") continue;
      if (g.concealed) count++;
    }
  }

  return count;
}

function hasSanshokuDokou(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;

  const targets = ["1", "9"];
  for (const num of targets){
    let hasM = false;
    let hasP = false;
    let hasS = false;

    for (const g of groups){
      if (!g || g.type !== "koutsu" || !g.code) continue;
      if (g.code[0] !== num) continue;

      if (g.code[1] === "m") hasM = true;
      if (g.code[1] === "p") hasP = true;
      if (g.code[1] === "s") hasS = true;
    }

    if (hasM && hasP && hasS) return true;
  }

  return false;
}

function hasIttsuu(groups){
  if (!Array.isArray(groups) || groups.length === 0) return false;

  for (const suit of ["p", "s"]){
    let has123 = false;
    let has456 = false;
    let has789 = false;

    for (const g of groups){
      if (!g || g.type !== "shuntsu" || !g.code) continue;
      if (g.code[1] !== suit) continue;

      if (g.code === `1${suit}`) has123 = true;
      if (g.code === `4${suit}`) has456 = true;
      if (g.code === `7${suit}`) has789 = true;
    }

    if (has123 && has456 && has789) return true;
  }

  return false;
}

function countKanMelds(meldList){
  if (!Array.isArray(meldList)) return 0;
  let count = 0;
  for (const m of meldList){
    if (!m || !m.type) continue;
    if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan") count++;
  }
  return count;
}

function groupContainsYaochu(group){
  if (!group || !group.code) return false;
  if (group.type === "koutsu"){
    return yakuTileIsTerminalOrHonor(group.code);
  }
  if (group.type === "shuntsu"){
    const suit = group.code[1];
    const start = Number(group.code[0]);
    if (!(suit === "p" || suit === "s")) return false;
    if (!Number.isInteger(start)) return false;
    return start === 1 || start === 7;
  }
  return false;
}

function groupContainsHonor(group){
  if (!group || !group.code) return false;
  if (group.type === "koutsu"){
    return yakuTileIsHonor(group.code);
  }
  return false;
}

function groupIsSequence(group){
  return !!group && group.type === "shuntsu";
}

function isChantaLikePattern(pattern, externalGroups, pairCode){
  const allGroups = [];
  if (Array.isArray(pattern && pattern.melds)) allGroups.push(...pattern.melds);
  if (Array.isArray(externalGroups)) allGroups.push(...externalGroups);

  if (allGroups.length !== 4) return { isChanta: false, isJunchan: false };

  let hasSequence = false;
  let hasHonor = yakuTileIsHonor(pairCode);

  if (!yakuTileIsTerminalOrHonor(pairCode)){
    return { isChanta: false, isJunchan: false };
  }

  for (const g of allGroups){
    if (!groupContainsYaochu(g)){
      return { isChanta: false, isJunchan: false };
    }
    if (groupIsSequence(g)){
      hasSequence = true;
    }
    if (groupContainsHonor(g)){
      hasHonor = true;
    }
  }

  if (!hasSequence){
    return { isChanta: false, isJunchan: false };
  }

  return {
    isChanta: true,
    isJunchan: !hasHonor
  };
}

function getSuitProfile(codes){
  const suits = new Set();
  let hasHonor = false;

  for (const code of codes){
    if (!code) continue;
    const suit = yakuTileSuit(code);
    if (suit === "z"){
      hasHonor = true;
    } else if (suit){
      suits.add(suit);
    }
  }

  return { suits, hasHonor };
}

function getSingleSuitFromProfile(profile){
  if (!profile || !profile.suits || profile.suits.size !== 1) return "";
  for (const suit of profile.suits){
    return suit || "";
  }
  return "";
}

function hasLocalSanpuu(groups){
  const windCodes = ["1z", "2z", "3z", "4z"];
  let count = 0;
  for (const code of windCodes){
    if (countGroupByTypeAndCode(groups, "koutsu", code) >= 1) count++;
  }
  return count >= 3;
}

function hasConsecutiveTripletRun(groups, runLength){
  if (!Array.isArray(groups) || groups.length === 0) return false;
  if (!Number.isInteger(runLength) || runLength <= 0) return false;

  const bySuit = new Map();
  for (const g of groups){
    if (!g || g.type !== "koutsu" || !g.code) continue;
    const suit = g.code[1];
    const num = Number(g.code[0]);
    if (!(suit === "m" || suit === "p" || suit === "s")) continue;
    if (!Number.isInteger(num)) continue;
    if (!bySuit.has(suit)) bySuit.set(suit, new Set());
    bySuit.get(suit).add(num);
  }

  for (const nums of bySuit.values()){
    for (let start = 1; start <= 9; start++){
      let ok = true;
      for (let offset = 0; offset < runLength; offset++){
        if (!nums.has(start + offset)){
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
  }

  return false;
}

function isExactChiitoiShape(pairCodes, expectedCodes){
  if (!Array.isArray(pairCodes) || !Array.isArray(expectedCodes)) return false;
  if (pairCodes.length !== expectedCodes.length) return false;
  for (let i = 0; i < expectedCodes.length; i++){
    if (pairCodes[i] !== expectedCodes[i]) return false;
  }
  return true;
}

function applyConfiguredFlushLikeYaku(result, profile){
  if (!result || !profile || profile.suits.size !== 1) return;

  const suit = getSingleSuitFromProfile(profile);
  if (!suit) return;

  if (profile.hasHonor){
    if (suit === "m"){
      const mode = getConfiguredLocalManzuHonitsuModeForYaku();
      if (mode === "yakuman"){
        addYaku(result.yaku, "localManzuHonitsu", "萬子のホンイツ", 0, 1);
      } else if (mode === "han6"){
        addYaku(result.yaku, "localManzuHonitsu", "萬子のホンイツ", 6, 0);
      } else {
        addYaku(result.yaku, "honitsu", YAKU_DEFS.honitsu.name, 2);
      }
      return;
    }

    const def = YAKU_DEFS.honitsu;
    addYaku(result.yaku, "honitsu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    return;
  }

  const def = YAKU_DEFS.chinitsu;
  addYaku(result.yaku, "chinitsu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
}

function applyLocalStandardYaku(result, groups){
  if (!result || !Array.isArray(groups)) return;

  if (hasLocalSanpuu(groups)){
    addYaku(result.yaku, "localSanpuu");
  }
  const hasSuurenkou = hasConsecutiveTripletRun(groups, 4);
  const hasSanrenkou = hasConsecutiveTripletRun(groups, 3);
  if (hasSuurenkou){
    const beforeCount = result.yaku.length;
    addYaku(result.yaku, "localSuurenkou");
    if (result.yaku.length === beforeCount && hasSanrenkou){
      addYaku(result.yaku, "localSanrenkou");
    }
  } else if (hasSanrenkou){
    addYaku(result.yaku, "localSanrenkou");
  }
}

function applyLocalChiitoiYaku(result){
  if (!result || !result.pattern || !Array.isArray(result.pattern.pairs)) return;

  const pairs = result.pattern.pairs.slice();
  if (isExactChiitoiShape(pairs, ["1p", "2p", "3p", "4p", "5p", "6p", "7p"]) ||
      isExactChiitoiShape(pairs, ["3p", "4p", "5p", "6p", "7p", "8p", "9p"])){
    addYaku(result.yaku, "localShousharin");
  }
  if (isExactChiitoiShape(pairs, ["2p", "3p", "4p", "5p", "6p", "7p", "8p"])){
    addYaku(result.yaku, "localDaisharin");
  }
}

function addYaku(resultList, key, overrideName, overrideHan, overrideYakuman){
  const def = YAKU_DEFS[key] || null;
  const name = overrideName || (def ? def.name : key);
  const han = Number.isFinite(overrideHan) ? overrideHan : (def ? def.han : 0);
  const yakuman = Number.isFinite(overrideYakuman) ? overrideYakuman : ((def && Number.isFinite(def.yakuman)) ? def.yakuman : 0);

  if (!def && !overrideName && !Number.isFinite(overrideHan) && !Number.isFinite(overrideYakuman)) return;
  if (!isAdoptedYakuEnabled(key)) return;

  resultList.push({
    key,
    name,
    han,
    yakuman
  });
}

function addYakuhaiByCode(resultList, groupCode, roundWind, seatWind){
  const yk = getYakuhaiTargetCodes(roundWind, seatWind);

  if (groupCode === yk.seatCode){
    addYaku(resultList, "yakuhaiSeat", `自風（${seatWind || ""}）`);
  }
  if (groupCode === yk.roundCode){
    addYaku(resultList, "yakuhaiRound", `場風（${roundWind || ""}）`);
  } else if (groupCode === yk.extraRoundCode){
    addYaku(resultList, "yakuhaiRound", "場風（北）");
  }
  if (groupCode === yk.dragonHaku){
    addYaku(resultList, "yakuhaiHaku");
  }
  if (groupCode === yk.dragonHatsu){
    addYaku(resultList, "yakuhaiHatsu");
  }
  if (groupCode === yk.dragonChun){
    addYaku(resultList, "yakuhaiChun");
  }
}

function buildYakuResultBase(opts){
  const tiles14 = Array.isArray(opts.tiles14) ? opts.tiles14.slice() : [];
  const meldList = Array.isArray(opts.meldList) ? opts.meldList.slice() : [];
  const counts = yakuSafeCountsFromTiles(tiles14);
  const isMenzen = isMenzenByMelds(meldList);

  return {
    input: {
      tiles14,
      meldList,
      winTileCode: opts.winTileCode || null,
      winType: opts.winType || null,
      roundWind: opts.roundWind || null,
      seatWind: opts.seatWind || null,
      isRiichi: !!opts.isRiichi,
      isOpenRiichi: !!opts.isOpenRiichi,
      isDoubleRiichi: !!opts.isDoubleRiichi,
      isIppatsu: !!opts.isIppatsu,
      isHaitei: !!opts.isHaitei,
      isHoutei: !!opts.isHoutei,
      isRinshan: !!opts.isRinshan,
      isChankan: !!opts.isChankan,
      isTenhou: !!opts.isTenhou,
      isChiihou: !!opts.isChiihou,
      doraIndicators: Array.isArray(opts.doraIndicators) ? opts.doraIndicators.slice() : [],
      uraDoraIndicators: Array.isArray(opts.uraDoraIndicators) ? opts.uraDoraIndicators.slice() : [],
      peis: Array.isArray(opts.peis) ? opts.peis.slice() : []
    },
    counts,
    isAgari: false,
    handKind: null,
    isMenzen,
    yaku: [],
    han: 0,
    totalHan: 0,
    yakuman: 0,
    bonus: {
      dora: 0,
      uraDora: 0,
      colorDora: 0,
      nukiDora: 0,
      total: 0
    },
    pattern: null,
    patterns: [],
    fu: 0,
    rawFu: 0,
    roundedFu: 0,
    fuBreakdown: [],
    fuInfo: null
  };
}

function applySituationYaku(result){
  if (!result || !result.input) return;

  if (result.input.isRiichi && result.input.isIppatsu && result.isMenzen){
    addYaku(result.yaku, "ippatsu");
  }
  if (result.input.isHaitei && result.input.winType === "tsumo"){
    addYaku(result.yaku, "haitei");
  }
  if (result.input.isHoutei && result.input.winType === "ron"){
    addYaku(result.yaku, "houtei");
  }
  if (result.input.isRinshan && result.input.winType === "tsumo"){
    addYaku(result.yaku, "rinshan");
  }
  if (result.input.isChankan && result.input.winType === "ron"){
    addYaku(result.yaku, "chankan");
  }
}

function applyOpenRiichiForcedDealInYakumanToYakuResult(result, opts){
  if (!result || !result.isAgari) return result;
  if (!opts || !opts.isOpenRiichiForcedDealInYakuman) return result;

  result.yaku = [];
  addYaku(result.yaku, "openRiichiForcedDealInYakuman");
  result.bonus = {
    dora: 0,
    uraDora: 0,
    colorDora: 0,
    nukiDora: 0,
    total: 0
  };
  result.han = 0;
  result.totalHan = 0;
  result.yakuman = 1;
  return result;
}

function finalizeYakuResult(base){
  let han = 0;
  let yakuman = 0;

  for (const y of base.yaku){
    if (!y) continue;
    if (y.yakuman) yakuman += y.yakuman;
    else han += (y.han | 0);
  }

  base.han = han;
  base.yakuman = yakuman;
  base.bonus.total = (base.bonus.dora | 0) + (base.bonus.uraDora | 0) + (base.bonus.colorDora | 0) + (base.bonus.nukiDora | 0);
  base.totalHan = (yakuman > 0) ? 0 : ((base.han | 0) + (base.bonus.total | 0));

  if (typeof calcFuInfoFromAgariInfo === "function"){
    const fuInfo = calcFuInfoFromAgariInfo(base);
    base.fuInfo = fuInfo || null;
    base.fu = fuInfo && Number.isFinite(fuInfo.fu) ? (fuInfo.fu | 0) : 0;
    base.rawFu = fuInfo && Number.isFinite(fuInfo.rawFu) ? (fuInfo.rawFu | 0) : 0;
    base.roundedFu = fuInfo && Number.isFinite(fuInfo.roundedFu) ? (fuInfo.roundedFu | 0) : 0;
    base.fuBreakdown = fuInfo && Array.isArray(fuInfo.breakdown) ? fuInfo.breakdown.slice() : [];
  } else {
    base.fuInfo = null;
    base.fu = 0;
    base.rawFu = 0;
    base.roundedFu = 0;
    base.fuBreakdown = [];
  }

  return base;
}

function getBestStandardYakuResult(base){
  const externalGroups = normalizeExternalMeldGroups(base.input.meldList);
  const concealedPatterns = findStandardAgariPatternsFromCounts(base.counts);
  const allCodeList = getTileCodeListFromTilesAndMelds(base.input.tiles14, base.input.meldList);

  let best = null;

  for (const pattern of concealedPatterns){
    const result = buildYakuResultBase(base.input);
    result.isAgari = true;
    result.handKind = "standard";
    result.pattern = pattern;
    result.patterns = concealedPatterns;

    const groups = [];
    groups.push(...pattern.melds);
    groups.push(...externalGroups);

    if (result.input.isRiichi && result.isMenzen){
      if (result.input.isDoubleRiichi){
        addYaku(result.yaku, "doubleRiichi");
      } else {
        addYaku(result.yaku, "riichi");
      }

      if (result.input.isOpenRiichi){
        addYaku(result.yaku, "openRiichi");
      }
    }

    if (result.input.winType === "tsumo" && result.isMenzen){
      addYaku(result.yaku, "menzenTsumo");
    }

    applySituationYaku(result);

    let allTanyao = true;
    for (const code of allCodeList){
      if (yakuTileIsYaochu(code)){
        allTanyao = false;
        break;
      }
    }
    if (allTanyao && (result.isMenzen || isKuitanEnabledForYaku())){
      addYaku(result.yaku, "tanyao");
    }

    if (
      result.isMenzen &&
      hasPinfuPattern(pattern, externalGroups, result.input.winTileCode, result.input.roundWind, result.input.seatWind) &&
      (result.input.winType !== "tsumo" || isTsumopinEnabledForYaku())
    ){
      addYaku(result.yaku, "pinfu");
    }

    if (result.isMenzen){
      const peikoCount = countIipeikoInPattern(pattern);
      if (peikoCount >= 2){
        addYaku(result.yaku, "ryanpeiko");
      } else if (peikoCount >= 1){
        addYaku(result.yaku, "iipeiko");
      }
    }

    for (const g of groups){
      if (!g || g.type !== "koutsu") continue;
      addYakuhaiByCode(result.yaku, g.code, result.input.roundWind, result.input.seatWind);
    }

    if (allGroupsAreTriplets(groups)){
      addYaku(result.yaku, "toitoi");
    }

    if (countConcealedTriplets(pattern, externalGroups, result.input.winType, result.input.winTileCode) >= 3){
      addYaku(result.yaku, "sanankou");
    }

    if (hasSanshokuDokou(groups)){
      addYaku(result.yaku, "sanshokuDokou");
    }

    if (countKanMelds(result.input.meldList) >= 3){
      addYaku(result.yaku, "sankantsu");
    }

    if (hasIttsuu(groups)){
      const def = YAKU_DEFS.ittsuu;
      addYaku(result.yaku, "ittsuu", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    }

    const chantaInfo = isChantaLikePattern(pattern, externalGroups, pattern.pairCode);
    if (chantaInfo.isJunchan){
      const def = YAKU_DEFS.junchan;
      addYaku(result.yaku, "junchan", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    } else if (chantaInfo.isChanta){
      const def = YAKU_DEFS.chanta;
      addYaku(result.yaku, "chanta", def.name, result.isMenzen ? def.han : def.kuisagariHan);
    }

    const profile = getSuitProfile(allCodeList);
    applyConfiguredFlushLikeYaku(result, profile);

    let dragonTriplets = 0;
    const dragonTripletCodes = ["5z", "6z", "7z"];
    for (const code of dragonTripletCodes){
      if (countGroupByTypeAndCode(groups, "koutsu", code) >= 1) dragonTriplets++;
    }
    if (dragonTriplets >= 2 && dragonTripletCodes.includes(pattern.pairCode)){
      addYaku(result.yaku, "shousangen");
    }

    let allHonroutou = true;
    for (const code of allCodeList){
      if (!yakuTileIsTerminalOrHonor(code)){
        allHonroutou = false;
        break;
      }
    }
    if (allHonroutou){
      addYaku(result.yaku, "honroutou");
    }

    applyLocalStandardYaku(result, groups);

    result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
    result.bonus.uraDora = countConfiguredUraDoraForYaku(result);
    result.bonus.colorDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList, result.isMenzen);
    result.bonus.nukiDora = countPeiDora(result.input.peis, result.isMenzen);

    finalizeYakuResult(result);

    if (!best){
      best = result;
      continue;
    }

    if (result.yakuman > best.yakuman){
      best = result;
      continue;
    }
    if (result.yakuman < best.yakuman) continue;

    if (result.totalHan > best.totalHan){
      best = result;
      continue;
    }
    if (result.totalHan < best.totalHan) continue;

    if (result.han > best.han){
      best = result;
      continue;
    }
    if (result.han < best.han) continue;

    if (result.bonus.total > best.bonus.total){
      best = result;
      continue;
    }
    if (result.bonus.total < best.bonus.total) continue;

    if ((result.fu | 0) > (best.fu | 0)){
      best = result;
      continue;
    }
  }

  return best;
}

function getChiitoiYakuResult(base){
  if (!isChiitoiAgariFromCounts(base.counts)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "chiitoi";
  result.pattern = { handKind: "chiitoi", pairs: getChiitoiPairsFromCounts(base.counts) };
  result.patterns = [result.pattern];

  if (result.input.isRiichi && result.isMenzen){
    addYaku(result.yaku, "riichi");
  }
  if (result.input.winType === "tsumo" && result.isMenzen){
    addYaku(result.yaku, "menzenTsumo");
  }

  applySituationYaku(result);
  addYaku(result.yaku, "chiitoi");

  const allCodeList = getTileCodeListFromTilesAndMelds(result.input.tiles14, result.input.meldList);

  let allTanyao = true;
  let allHonroutou = true;
  for (const code of allCodeList){
    if (yakuTileIsYaochu(code)) allTanyao = false;
    if (!yakuTileIsTerminalOrHonor(code)) allHonroutou = false;
  }
  if (allTanyao && (result.isMenzen || isKuitanEnabledForYaku())){
    addYaku(result.yaku, "tanyao");
  }
  if (allHonroutou){
    addYaku(result.yaku, "honroutou");
  }

  const profile = getSuitProfile(allCodeList);
  applyConfiguredFlushLikeYaku(result, profile);
  applyLocalChiitoiYaku(result);

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = countConfiguredUraDoraForYaku(result);
  result.bonus.colorDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList, result.isMenzen);
  result.bonus.nukiDora = countPeiDora(result.input.peis, result.isMenzen);

  return finalizeYakuResult(result);
}

function getKokushiYakuResult(base){
  if (!isKokushiAgariFromCounts(base.counts, base.input.meldList)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "kokushi";
  result.pattern = { handKind: "kokushi" };
  result.patterns = [result.pattern];

  applySituationYaku(result);
  addYaku(result.yaku, "kokushi");

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = countConfiguredUraDoraForYaku(result);
  result.bonus.colorDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList, result.isMenzen);
  result.bonus.nukiDora = countPeiDora(result.input.peis, result.isMenzen);

  return finalizeYakuResult(result);
}


function isYakuResultHigherPriority(candidate, best){
  if (!candidate) return false;
  if (!best) return true;

  if ((candidate.yakuman | 0) > (best.yakuman | 0)) return true;
  if ((candidate.yakuman | 0) < (best.yakuman | 0)) return false;

  if ((candidate.totalHan | 0) > (best.totalHan | 0)) return true;
  if ((candidate.totalHan | 0) < (best.totalHan | 0)) return false;

  if ((candidate.han | 0) > (best.han | 0)) return true;
  if ((candidate.han | 0) < (best.han | 0)) return false;

  const candidateBonus = candidate && candidate.bonus ? (candidate.bonus.total | 0) : 0;
  const bestBonus = best && best.bonus ? (best.bonus.total | 0) : 0;
  if (candidateBonus > bestBonus) return true;
  if (candidateBonus < bestBonus) return false;

  return (candidate.fu | 0) > (best.fu | 0);
}

function isShiroPocchiEnabledForYaku(){
  return String(getRuleValueForYaku("overview-chip-target-shiro-pocchi", "off") || "").toLowerCase() === "on";
}

function normalizeShiroPocchiImgCodeForYaku(tile){
  if (!tile || typeof tile !== "object") return "";
  return String(tile.imgCode || tile.code || "");
}

function isShiroPocchiTileForYaku(tile){
  if (!tile || typeof tile !== "object") return false;
  if (typeof isShiroPocchiTile === "function") return !!isShiroPocchiTile(tile);
  return normalizeShiroPocchiImgCodeForYaku(tile) === "siropocchi";
}

function getShiroPocchiDrawTileForYaku(opts = {}){
  if (String(opts && opts.winType || "") !== "tsumo") return null;

  const explicitDrawnTile = opts && opts.drawnTile;
  if (explicitDrawnTile && typeof explicitDrawnTile === "object"){
    return explicitDrawnTile;
  }

  const tiles14 = Array.isArray(opts && opts.tiles14) ? opts.tiles14 : [];
  if (tiles14.length !== 14) return null;

  const lastTile = tiles14[tiles14.length - 1];
  return (lastTile && typeof lastTile === "object") ? lastTile : null;
}

function getShiroPocchiBase13ForYaku(opts = {}){
  const tiles14 = Array.isArray(opts && opts.tiles14) ? opts.tiles14.slice() : [];
  if (tiles14.length !== 14) return null;

  const drawnTile = getShiroPocchiDrawTileForYaku(opts);
  if (!drawnTile || !isShiroPocchiTileForYaku(drawnTile)) return null;

  let removeIndex = -1;
  if (opts && opts.drawnTile){
    removeIndex = tiles14.findIndex((tile)=> tile === opts.drawnTile);
  }
  if (removeIndex < 0) removeIndex = tiles14.length - 1;

  const removed = tiles14.splice(removeIndex, 1)[0];
  if (!isShiroPocchiTileForYaku(removed)) return null;
  return (tiles14.length === 13) ? tiles14 : null;
}

function getShiroPocchiSubstituteAgariInfo(opts = {}){
  if (!isShiroPocchiEnabledForYaku()) return null;
  if (String(opts && opts.winType || "") !== "tsumo") return null;
  if (!opts || !opts.isRiichi) return null;

  const drawnTile = getShiroPocchiDrawTileForYaku(opts);
  if (!drawnTile || !isShiroPocchiTileForYaku(drawnTile)) return null;

  const base13 = getShiroPocchiBase13ForYaku(opts);
  if (!Array.isArray(base13) || base13.length !== 13) return null;

  const fixedM = Array.isArray(opts.meldList) ? opts.meldList.length : 0;
  let best = null;

  for (const code of TILE_TYPES){
    if (!code) continue;

    const candidateTiles14 = base13.slice();
    candidateTiles14.push({ code });

    try{
      if (typeof calcShanten === "function" && calcShanten(yakuSafeCountsFromTiles(candidateTiles14), fixedM) !== -1){
        continue;
      }
    }catch(e){
      continue;
    }

    let candidate = null;
    try{
      candidate = getAgariYakuInfoCore({
        ...opts,
        tiles14: candidateTiles14,
        drawnTile: { code, imgCode: code },
        winTileCode: code
      });
    }catch(e){
      candidate = null;
    }

    candidate = applyAtozukeRestrictionToYakuResult(candidate);
    if (!candidate || !candidate.isAgari) continue;
    if ((candidate.yakuman | 0) <= 0 && (candidate.han | 0) <= 0) continue;

    try{
      candidate = JSON.parse(JSON.stringify(candidate));
    }catch(e){}

    candidate.specialWin = {
      type: "shiroPocchi",
      substituteCode: code,
      originalImgCode: "siropocchi"
    };

    if (isYakuResultHigherPriority(candidate, best)){
      best = candidate;
    }
  }

  return best;
}

function getAgariYakuInfoCore(opts = {}){
  const base = buildYakuResultBase(opts);

  const tiles14 = base.input.tiles14;
  const meldList = base.input.meldList;
  const totalTileCount = getAgariShapeTileCountFromTilesAndMelds(tiles14, meldList);

  if (!Array.isArray(tiles14) || totalTileCount !== 14){
    return finalizeYakuResult(base);
  }

  const fixedM = Array.isArray(meldList) ? meldList.length : 0;
  if (typeof calcShanten === "function"){
    const sh = calcShanten(base.counts, fixedM);
    if (sh !== -1){
      return finalizeYakuResult(base);
    }
  }

  const candidates = [];

  if (typeof getYakumanCandidates === "function"){
    try{
      const yakumanCandidates = getYakumanCandidates(base);
      if (Array.isArray(yakumanCandidates)){
        for (const c of yakumanCandidates){
          if (c) candidates.push(c);
        }
      }
    }catch(e){}
  } else {
    const kokushi = getKokushiYakuResult(base);
    if (kokushi) candidates.push(kokushi);
  }

  const chiitoi = getChiitoiYakuResult(base);
  if (chiitoi) candidates.push(chiitoi);

  const standard = getBestStandardYakuResult(base);
  if (standard) candidates.push(standard);

  if (candidates.length === 0){
    base.isAgari = true;
    base.handKind = "unknown";
    base.bonus.dora = countDoraFromIndicators(base.input.tiles14, base.input.meldList, base.input.doraIndicators);
    base.bonus.uraDora = countConfiguredUraDoraForYaku(base);
    base.bonus.colorDora = countAkaDoraInTilesAndMelds(base.input.tiles14, base.input.meldList, base.isMenzen);
    base.bonus.nukiDora = countPeiDora(base.input.peis, base.isMenzen);
    return finalizeYakuResult(base);
  }

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++){
    const cur = candidates[i];

    if (cur.yakuman > best.yakuman){
      best = cur;
      continue;
    }
    if (cur.yakuman < best.yakuman) continue;

    if (cur.totalHan > best.totalHan){
      best = cur;
      continue;
    }
    if (cur.totalHan < best.totalHan) continue;

    if (cur.han > best.han){
      best = cur;
      continue;
    }
    if (cur.han < best.han) continue;

    if (cur.bonus.total > best.bonus.total){
      best = cur;
      continue;
    }
    if (cur.bonus.total < best.bonus.total) continue;

    if ((cur.fu | 0) > (best.fu | 0)){
      best = cur;
    }
  }

  return best;
}

function getAgariYakuInfo(opts = {}){
  const result = applyOpenRiichiForcedDealInYakumanToYakuResult(
    applyKokushiAnkanRonRestrictionToYakuResult(
      applyAtozukeRestrictionToYakuResult(getAgariYakuInfoCore(opts)),
      opts
    ),
    opts
  );
  if (result && result.isAgari && (((result.yakuman | 0) > 0) || ((result.han | 0) > 0))){
    return result;
  }

  const shiroPocchiResult = getShiroPocchiSubstituteAgariInfo(opts);
  if (opts && opts.isAnkanRon) return result;

  if (shiroPocchiResult) return applyOpenRiichiForcedDealInYakumanToYakuResult(shiroPocchiResult, opts);
  return result;
}

function canAgariByYakuInfo(opts = {}){
  const info = getAgariYakuInfo(opts);
  if (!info || !info.isAgari) return false;
  if ((info.yakuman | 0) > 0) return true;
  return (info.han | 0) > 0;
}

function getCurrentPlayerAgariYakuInfo(winType, ronTileLike, extraOpts = null){
  const tiles14 = Array.isArray(hand13) ? hand13.slice() : [];

  if (winType === "ron"){
    if (ronTileLike && ronTileLike.code) tiles14.push({ code: ronTileLike.code });
  } else if (drawn) {
    tiles14.push(drawn);
  }

  let seatWind = null;
  let roundW = (typeof roundWind !== "undefined") ? roundWind : null;

  if (typeof eastSeatIndex === "number"){
    if (eastSeatIndex === 0) seatWind = "東";
    else if (eastSeatIndex === 1) seatWind = "西";
    else if (eastSeatIndex === 2) seatWind = "南";
  }

  return getAgariYakuInfo({
    tiles14,
    meldList: Array.isArray(melds) ? melds.slice() : [],
    drawnTile: (winType === "ron") ? null : (drawn || null),
    winType: winType || (drawn ? "tsumo" : null),
    winTileCode: (winType === "ron" && ronTileLike && ronTileLike.code)
      ? ronTileLike.code
      : (drawn ? drawn.code : null),
    isRiichi: !!isRiichi,
    isOpenRiichi: (typeof isPlayerOpenRiichiActive === "function") ? isPlayerOpenRiichiActive() : false,
    roundWind: roundW,
    seatWind,
    doraIndicators: Array.isArray(doraIndicators) ? doraIndicators.slice() : [],
    uraDoraIndicators: Array.isArray(uraDoraIndicators) ? uraDoraIndicators.slice() : [],
    peis: Array.isArray(peis) ? peis.slice() : [],
    ...(typeof getWinSituationFlags === "function" ? getWinSituationFlags(winType || (drawn ? "tsumo" : null), 0) : {}),
    ...((extraOpts && typeof extraOpts === "object") ? extraOpts : {})
  });
}
