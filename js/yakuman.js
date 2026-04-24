// MBsanma/js/yakuman.js
// ========= yakuman.js（役満判定） =========
// 目的：
// - 役満判定を通常役から分離する
// - result.js などの入口は増やさず、yaku.js からだけ呼ばれる
//
// 注意：
// - 状態変更はしない
// - buildYakuResultBase / addYaku / finalizeYakuResult などの共通関数は yaku.js 側を使う

const YAKUMAN_DEFS = {
  kokushi:       { key: "kokushi",       name: "国士無双",   han: 0, yakuman: 1 },
  daisangen:     { key: "daisangen",     name: "大三元",     han: 0, yakuman: 1 },
  tsuuiisou:     { key: "tsuuiisou",     name: "字一色",     han: 0, yakuman: 1 },
  chinroutou:    { key: "chinroutou",    name: "清老頭",     han: 0, yakuman: 1 },
  shousuushii:   { key: "shousuushii",   name: "小四喜",     han: 0, yakuman: 1 },
  daisuushii:    { key: "daisuushii",    name: "大四喜",     han: 0, yakuman: 1 },
  ryuuiisou:     { key: "ryuuiisou",     name: "緑一色",     han: 0, yakuman: 1 },
  chuurenpoutou: { key: "chuurenpoutou", name: "九蓮宝燈",   han: 0, yakuman: 1 },
  suukantsu:     { key: "suukantsu",     name: "四槓子",     han: 0, yakuman: 1 },
  suuankou:      { key: "suuankou",      name: "四暗刻",     han: 0, yakuman: 1 },
  tenhou:        { key: "tenhou",        name: "天和",       han: 0, yakuman: 1 },
  chiihou:       { key: "chiihou",       name: "地和",       han: 0, yakuman: 1 }
};

function getRuleValueForYakuman(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isDoubleYakumanEnabledForYakuman(){
  const raw = String(getRuleValueForYakuman("extra-double-yakuman", "on") || "").toLowerCase();
  return raw !== "off";
}

function finalizeYakumanResultWithRules(result){
  const finalized = finalizeYakuResult(result);
  if (!finalized) return finalized;

  if (Number.isFinite(finalized.yakuman) && (finalized.yakuman | 0) > 0 && !isDoubleYakumanEnabledForYakuman()){
    finalized.yakuman = 1;
  }

  return finalized;
}

function cloneYakumanResultForMerge(result){
  if (!result) return null;
  try{
    return JSON.parse(JSON.stringify(result));
  }catch(e){
    return null;
  }
}

function mergeYakumanResults(primary, secondary){
  const a = cloneYakumanResultForMerge(primary);
  const b = cloneYakumanResultForMerge(secondary);
  if (!a || !b) return null;

  const merged = a;
  merged.isAgari = true;
  if (!merged.handKind && b.handKind) merged.handKind = b.handKind;
  if ((!merged.pattern || merged.pattern.handKind === merged.handKind) && b.pattern) merged.pattern = b.pattern;
  if ((!Array.isArray(merged.patterns) || merged.patterns.length <= 0) && Array.isArray(b.patterns)) merged.patterns = b.patterns;

  const existing = new Set(Array.isArray(merged.yaku) ? merged.yaku.map((y)=> y && y.key).filter(Boolean) : []);
  if (!Array.isArray(merged.yaku)) merged.yaku = [];
  if (Array.isArray(b.yaku)){
    for (const y of b.yaku){
      if (!y || !y.key || existing.has(y.key)) continue;
      merged.yaku.push(y);
      existing.add(y.key);
    }
  }

  const bonusA = merged.bonus || {};
  const bonusB = b.bonus || {};
  merged.bonus = {
    dora: Math.max(Number(bonusA.dora)||0, Number(bonusB.dora)||0),
    uraDora: Math.max(Number(bonusA.uraDora)||0, Number(bonusB.uraDora)||0),
    akaDora: Math.max(Number(bonusA.akaDora)||0, Number(bonusB.akaDora)||0),
    peiDora: Math.max(Number(bonusA.peiDora)||0, Number(bonusB.peiDora)||0)
  };

  return finalizeYakumanResultWithRules(merged);
}

function yakumanGetAllCodeList(base){
  if (!base || !base.input) return [];
  if (typeof getTileCodeListFromTilesAndMelds === "function"){
    return getTileCodeListFromTilesAndMelds(base.input.tiles14, base.input.meldList);
  }

  const codes = [];
  const tiles14 = Array.isArray(base.input.tiles14) ? base.input.tiles14 : [];
  const meldList = Array.isArray(base.input.meldList) ? base.input.meldList : [];

  for (const t of tiles14){
    if (t && t.code) codes.push(t.code);
  }
  for (const m of meldList){
    if (!m || !m.code || !m.type) continue;
    if (m.type === "pon"){
      codes.push(m.code, m.code, m.code);
    } else if (m.type === "minkan" || m.type === "ankan" || m.type === "kakan"){
      codes.push(m.code, m.code, m.code, m.code);
    }
  }
  return codes;
}

function yakumanIsHonor(code){
  if (typeof yakuTileIsHonor === "function") return yakuTileIsHonor(code);
  return !!code && code[1] === "z";
}

function yakumanIsTerminal(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  if (suit !== "m" && suit !== "p" && suit !== "s") return false;
  return code[0] === "1" || code[0] === "9";
}

function isKokushiAgariFromCounts(counts, meldList){
  if (Array.isArray(meldList) && meldList.length > 0) return false;
  if (typeof calcShantenKokushi !== "function") return false;
  return calcShantenKokushi(counts, 0) === -1;
}

function isTsuuiisouFromCodes(codes){
  if (!Array.isArray(codes) || codes.length === 0) return false;
  for (const code of codes){
    if (!yakumanIsHonor(code)) return false;
  }
  return true;
}

function isChinroutouFromCodes(codes){
  if (!Array.isArray(codes) || codes.length === 0) return false;
  for (const code of codes){
    if (!yakumanIsTerminal(code)) return false;
  }
  return true;
}

function isRyuuiisouFromCodes(codes){
  if (!Array.isArray(codes) || codes.length === 0) return false;
  const allowed = new Set(["2s", "3s", "4s", "6s", "8s", "6z"]);
  for (const code of codes){
    if (!allowed.has(code)) return false;
  }
  return true;
}

function isChuurenPoutouFromCounts(counts, meldList){
  if (Array.isArray(meldList) && meldList.length > 0) return false;
  if (!Array.isArray(counts)) return false;

  for (const suit of ["p", "s"]){
    const need = {
      ["1" + suit]: 3, ["2" + suit]: 1, ["3" + suit]: 1, ["4" + suit]: 1, ["5" + suit]: 1,
      ["6" + suit]: 1, ["7" + suit]: 1, ["8" + suit]: 1, ["9" + suit]: 3
    };

    let ok = true;
    let total = 0;
    let extra = 0;

    for (const code of TILE_TYPES){
      const idx = TYPE_TO_IDX[code];
      const n = (idx !== undefined && counts[idx] != null) ? (counts[idx] | 0) : 0;
      if (n <= 0) continue;
      total += n;

      if (code[1] !== suit){
        ok = false;
        break;
      }

      const req = need[code] || 0;
      if (n < req){
        ok = false;
        break;
      }
      extra += (n - req);
    }

    if (ok && total === 14 && extra === 1){
      return true;
    }
  }

  return false;
}

function getStandardYakumanKeys(base, pattern){
  const keys = [];
  if (!base || !base.input || !pattern) return keys;

  const externalGroups = (typeof normalizeExternalMeldGroups === "function")
    ? normalizeExternalMeldGroups(base.input.meldList)
    : [];

  const groups = [];
  if (Array.isArray(pattern.melds)) groups.push(...pattern.melds);
  if (Array.isArray(externalGroups)) groups.push(...externalGroups);

  const allCodes = yakumanGetAllCodeList(base);

  let dragonTriplets = 0;
  for (const code of ["5z", "6z", "7z"]){
    if (typeof countGroupByTypeAndCode === "function" && countGroupByTypeAndCode(groups, "koutsu", code) >= 1){
      dragonTriplets++;
    }
  }
  if (dragonTriplets === 3) keys.push("daisangen");

  if (isTsuuiisouFromCodes(allCodes)) keys.push("tsuuiisou");
  if (isChinroutouFromCodes(allCodes)) keys.push("chinroutou");
  if (isRyuuiisouFromCodes(allCodes)) keys.push("ryuuiisou");

  let windTriplets = 0;
  for (const code of ["1z", "2z", "3z", "4z"]){
    if (typeof countGroupByTypeAndCode === "function" && countGroupByTypeAndCode(groups, "koutsu", code) >= 1){
      windTriplets++;
    }
  }
  if (windTriplets === 4){
    keys.push("daisuushii");
  } else if (windTriplets === 3 && pattern.pairCode && ["1z", "2z", "3z", "4z"].includes(pattern.pairCode)){
    keys.push("shousuushii");
  }

  if (typeof countConcealedTriplets === "function"){
    const concealedTriplets = countConcealedTriplets(
      pattern,
      externalGroups,
      base.input.winType,
      base.input.winTileCode
    );

    if (concealedTriplets >= 4){
      if (base.input.winType === "tsumo"){
        keys.push("suuankou");
      } else if (base.input.winType === "ron" && pattern.pairCode && pattern.pairCode === base.input.winTileCode){
        keys.push("suuankou");
      }
    }
  }

  if (typeof countKanMelds === "function" && countKanMelds(base.input.meldList) >= 4){
    keys.push("suukantsu");
  }

  return keys;
}

function getStandardYakumanResult(base){
  const concealedPatterns = (typeof findStandardAgariPatternsFromCounts === "function")
    ? findStandardAgariPatternsFromCounts(base.counts)
    : [];

  let best = null;

  for (const pattern of concealedPatterns){
    const keys = getStandardYakumanKeys(base, pattern);
    if (!keys.length) continue;

    const result = buildYakuResultBase(base.input);
    result.isAgari = true;
    result.handKind = "standard";
    result.pattern = pattern;
    result.patterns = concealedPatterns;

    for (const key of keys){
      const def = YAKUMAN_DEFS[key];
      if (!def) continue;
      addYaku(result.yaku, key, def.name, def.han, def.yakuman);
    }

    result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
    result.bonus.uraDora = result.input.isRiichi
      ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
      : 0;
    result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
    result.bonus.peiDora = countPeiDora(result.input.peis);

    finalizeYakumanResultWithRules(result);

    if (!best || result.yakuman > best.yakuman){
      best = result;
      continue;
    }
    if (result.yakuman < best.yakuman) continue;
    if (result.totalHan > best.totalHan){
      best = result;
      continue;
    }
    if (result.totalHan < best.totalHan) continue;
    if ((result.fu | 0) > (best.fu | 0)){
      best = result;
    }
  }

  return best;
}

function getChiitoiYakumanResult(base){
  if (typeof isChiitoiAgariFromCounts !== "function" || !isChiitoiAgariFromCounts(base.counts)) return null;

  const keys = [];
  const allCodes = yakumanGetAllCodeList(base);

  if (isTsuuiisouFromCodes(allCodes)) keys.push("tsuuiisou");
  if (isChinroutouFromCodes(allCodes)) keys.push("chinroutou");
  if (isRyuuiisouFromCodes(allCodes)) keys.push("ryuuiisou");
  if (!keys.length) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "chiitoi";
  result.pattern = { handKind: "chiitoi", pairs: getChiitoiPairsFromCounts(base.counts) };
  result.patterns = [result.pattern];

  for (const key of keys){
    const def = YAKUMAN_DEFS[key];
    if (!def) continue;
    addYaku(result.yaku, key, def.name, def.han, def.yakuman);
  }

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakumanResultWithRules(result);
}

function getKokushiYakumanResult(base){
  if (!isKokushiAgariFromCounts(base.counts, base.input.meldList)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "kokushi";
  result.pattern = { handKind: "kokushi" };
  result.patterns = [result.pattern];

  addYaku(result.yaku, "kokushi", YAKUMAN_DEFS.kokushi.name, YAKUMAN_DEFS.kokushi.han, YAKUMAN_DEFS.kokushi.yakuman);

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakumanResultWithRules(result);
}

function getChuurenYakumanResult(base){
  if (!isChuurenPoutouFromCounts(base.counts, base.input.meldList)) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = "standard";
  result.pattern = { handKind: "standard", yakumanSpecial: "chuurenpoutou" };
  result.patterns = [result.pattern];

  addYaku(result.yaku, "chuurenpoutou", YAKUMAN_DEFS.chuurenpoutou.name, YAKUMAN_DEFS.chuurenpoutou.han, YAKUMAN_DEFS.chuurenpoutou.yakuman);

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakumanResultWithRules(result);
}

function getTenchiYakumanResult(base){
  if (!base || !base.input) return null;

  const keys = [];
  if (base.input.isTenhou) keys.push("tenhou");
  if (base.input.isChiihou) keys.push("chiihou");
  if (!keys.length) return null;

  const result = buildYakuResultBase(base.input);
  result.isAgari = true;
  result.handKind = (base.input.handKindHint || "standard");
  result.pattern = { handKind: result.handKind, yakumanSpecial: keys.join("+") };
  result.patterns = [result.pattern];

  for (const key of keys){
    const def = YAKUMAN_DEFS[key];
    if (!def) continue;
    addYaku(result.yaku, key, def.name, def.han, def.yakuman);
  }

  result.bonus.dora = countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.doraIndicators);
  result.bonus.uraDora = result.input.isRiichi
    ? countDoraFromIndicators(result.input.tiles14, result.input.meldList, result.input.uraDoraIndicators)
    : 0;
  result.bonus.akaDora = countAkaDoraInTilesAndMelds(result.input.tiles14, result.input.meldList);
  result.bonus.peiDora = countPeiDora(result.input.peis);

  return finalizeYakumanResultWithRules(result);
}

function getYakumanCandidates(base){
  const candidates = [];

  const tenchi = getTenchiYakumanResult(base);
  const kokushi = getKokushiYakumanResult(base);
  const chuuren = getChuurenYakumanResult(base);
  const chiitoi = getChiitoiYakumanResult(base);
  const standard = getStandardYakumanResult(base);

  const baseCandidates = [kokushi, chuuren, chiitoi, standard].filter(Boolean);

  if (tenchi) candidates.push(tenchi);
  for (const c of baseCandidates){
    candidates.push(c);
    if (tenchi){
      const merged = mergeYakumanResults(c, tenchi);
      if (merged) candidates.push(merged);
    }
  }

  return candidates;
}
