// MBsanma/js/fu.js
// ========= fu.js（符計算専用） =========
// 役割：
// - 符計算だけを担当する
// - 状態変更はしない
// - yaku.js が返す pattern / handKind / isMenzen / yaku を材料に使う
//
// 想定入力：
// calcFuInfo({
//   handKind: "standard" | "chiitoi" | "kokushi",
//   pattern,
//   meldList,
//   winType,        // "tsumo" / "ron"
//   winTileCode,    // "5p" など
//   roundWind,      // "東" / "南" / "西" / "北"
//   seatWind,       // "東" / "南" / "西" / "北"
//   isMenzen,       // true / false
//   yakuList        // [{ key:"pinfu", ... }, ...]
// })
//
// 返り値：
// {
//   fu: 30,                 // 最終符（切り上げ後）
//   rawFu: 24,              // 切り上げ前
//   roundedFu: 30,          // 切り上げ後（fuと同じ）
//   isChiitoiFixed: false,
//   isPinfuTsumoSpecial: false,
//   breakdown: [
//     { name: "副底", fu: 20 },
//     { name: "中張明刻", fu: 2 },
//     ...
//   ]
// }
//
// 注意：
// - 七対子は25符固定
// - 国士無双はここでは 0符扱い（点数計算側で別扱い前提）
// - 平和ツモは 20符固定の特例として扱う
// - 通常手ロンは最低30符になるようにする
// - render.js など描画系から直接状態変更しない

function fuTileIsHonor(code){
  return !!code && typeof code === "string" && code[1] === "z";
}

function fuTileIsNumber(code){
  if (!code || typeof code !== "string") return false;
  const suit = code[1];
  return suit === "m" || suit === "p" || suit === "s";
}

function fuTileIsTerminal(code){
  if (!fuTileIsNumber(code)) return false;
  return code[0] === "1" || code[0] === "9";
}

function fuTileIsTerminalOrHonor(code){
  return fuTileIsHonor(code) || fuTileIsTerminal(code);
}

function fuWindToCode(wind){
  if (wind === "東" || wind === "east") return "1z";
  if (wind === "南" || wind === "south") return "2z";
  if (wind === "西" || wind === "west") return "3z";
  if (wind === "北" || wind === "north") return "4z";
  return null;
}

function fuRoundUpTo10(n){
  const v = n | 0;
  if (v <= 0) return 0;
  return Math.ceil(v / 10) * 10;
}

function fuSafeArray(x){
  return Array.isArray(x) ? x : [];
}

function getRuleValueForFu(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isFuCalcEnabled(){
  const raw = String(getRuleValueForFu("score-fu-calc", "on") || "").toLowerCase();
  return raw !== "off";
}

function buildFixed30FuResult(){
  return {
    fu: 30,
    rawFu: 30,
    roundedFu: 30,
    isChiitoiFixed: false,
    isPinfuTsumoSpecial: false,
    breakdown: [
      { name: "符計算なし固定", fu: 30 }
    ]
  };
}

function fuHasYaku(yakuList, key){
  if (!Array.isArray(yakuList)) return false;
  return yakuList.some(y => y && y.key === key);
}

function normalizeFuExternalGroups(meldList){
  const groups = [];
  if (!Array.isArray(meldList)) return groups;

  for (const m of meldList){
    if (!m || !m.code) continue;

    if (m.type === "pon"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: true,
        concealed: false,
        source: "pon",
        isKan: false
      });
      continue;
    }

    if (m.type === "minkan"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: true,
        concealed: false,
        source: "minkan",
        isKan: true
      });
      continue;
    }

    if (m.type === "kakan"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: true,
        concealed: false,
        source: "kakan",
        isKan: true
      });
      continue;
    }

    if (m.type === "ankan"){
      groups.push({
        type: "koutsu",
        code: m.code,
        open: false,
        concealed: true,
        source: "ankan",
        isKan: true
      });
    }
  }

  return groups;
}

function cloneFuPatternMelds(pattern){
  if (!pattern || !Array.isArray(pattern.melds)) return [];
  return pattern.melds.map(g => ({
    type: g && g.type ? g.type : null,
    code: g && g.code ? g.code : null,
    open: !!(g && g.open),
    concealed: !!(g && g.concealed),
    source: g && g.source ? g.source : null,
    isKan: !!(g && g.isKan)
  }));
}

function getFuPairValueCount(pairCode, roundWind, seatWind){
  let count = 0;
  if (!pairCode) return 0;

  const seatCode = fuWindToCode(seatWind);
  const roundCode = fuWindToCode(roundWind);

  if (pairCode === seatCode) count++;
  if (pairCode === roundCode) count++;

  if (pairCode === "5z") count++;
  if (pairCode === "6z") count++;
  if (pairCode === "7z") count++;

  return count;
}

function getFuPairName(pairCode, roundWind, seatWind){
  const names = [];

  const seatCode = fuWindToCode(seatWind);
  const roundCode = fuWindToCode(roundWind);

  if (pairCode === seatCode){
    names.push(`自風雀頭（${seatWind || ""}）`);
  }
  if (pairCode === roundCode){
    names.push(`場風雀頭（${roundWind || ""}）`);
  }
  if (pairCode === "5z"){
    names.push("白雀頭");
  }
  if (pairCode === "6z"){
    names.push("發雀頭");
  }
  if (pairCode === "7z"){
    names.push("中雀頭");
  }

  if (names.length === 0) return "役なし雀頭";
  return names.join(" / ");
}

function getFuMeldBaseValue(code, isKan){
  const yaochu = fuTileIsTerminalOrHonor(code);

  if (isKan){
    return yaochu ? 16 : 8;
  }
  return yaochu ? 4 : 2;
}

function calcFuForMeldGroup(group, winType, winTileCode){
  if (!group || group.type !== "koutsu" || !group.code){
    return {
      fu: 0,
      name: "",
      open: !!(group && group.open),
      isKan: !!(group && group.isKan)
    };
  }

  const isKan = !!group.isKan;
  const base = getFuMeldBaseValue(group.code, isKan);

  let treatedOpen = !!group.open;

  if (!treatedOpen && !isKan && winType === "ron" && winTileCode && group.code === winTileCode){
    treatedOpen = true;
  }

  const fu = treatedOpen ? base : (base * 2);

  const yaochu = fuTileIsTerminalOrHonor(group.code);
  const kindText = isKan ? "槓子" : "刻子";
  const openText = treatedOpen ? "明" : "暗";
  const tileText = yaochu ? "么九" : "中張";

  return {
    fu,
    name: `${tileText}${openText}${kindText}`,
    open: treatedOpen,
    isKan
  };
}

function getFuWaitCandidates(pattern, winTileCode){
  const candidates = [];

  if (!pattern || !winTileCode) return candidates;

  if (pattern.pairCode && pattern.pairCode === winTileCode){
    candidates.push({
      fu: 2,
      name: "単騎待ち"
    });
  }

  if (Array.isArray(pattern.melds)){
    for (const g of pattern.melds){
      if (!g || !g.code || !g.type) continue;

      if (g.type === "koutsu" && g.code === winTileCode){
        candidates.push({
          fu: 0,
          name: "シャンポン待ち"
        });
        continue;
      }

      if (g.type !== "shuntsu") continue;
      if (g.code[1] !== winTileCode[1]) continue;

      const suit = g.code[1];
      if (suit !== "p" && suit !== "s") continue;

      const start = Number(g.code[0]);
      const win = Number(winTileCode[0]);

      if (!Number.isInteger(start) || !Number.isInteger(win)) continue;
      if (win !== start && win !== start + 1 && win !== start + 2) continue;

      if (win === start + 1){
        candidates.push({
          fu: 2,
          name: "嵌張待ち"
        });
        continue;
      }

      if (win === start && start === 7){
        candidates.push({
          fu: 2,
          name: "辺張待ち"
        });
        continue;
      }

      if (win === start + 2 && start === 1){
        candidates.push({
          fu: 2,
          name: "辺張待ち"
        });
        continue;
      }

      candidates.push({
        fu: 0,
        name: "両面待ち"
      });
    }
  }

  return candidates;
}

function pickBestFuWait(pattern, winTileCode){
  const candidates = getFuWaitCandidates(pattern, winTileCode);
  if (candidates.length === 0){
    return { fu: 0, name: "" };
  }

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++){
    const cur = candidates[i];
    if ((cur.fu | 0) > (best.fu | 0)){
      best = cur;
    }
  }
  return best;
}

function buildFuEmptyResult(){
  return {
    fu: 0,
    rawFu: 0,
    roundedFu: 0,
    isChiitoiFixed: false,
    isPinfuTsumoSpecial: false,
    breakdown: []
  };
}

function calcFuInfo(opts = {}){
  const handKind = opts.handKind || (opts.pattern && opts.pattern.handKind) || null;
  const pattern = opts.pattern || null;
  const meldList = fuSafeArray(opts.meldList);
  const winType = opts.winType || null;
  const winTileCode = opts.winTileCode || null;
  const roundWind = opts.roundWind || null;
  const seatWind = opts.seatWind || null;
  const yakuList = fuSafeArray(opts.yakuList);

  const isMenzen = (typeof opts.isMenzen === "boolean")
    ? opts.isMenzen
    : meldList.every(m => !m || m.type === "ankan");

  const empty = buildFuEmptyResult();

  if (!pattern || !handKind){
    return empty;
  }

  if (!isFuCalcEnabled()){
    return buildFixed30FuResult();
  }

  if (handKind === "kokushi"){
    return {
      fu: 0,
      rawFu: 0,
      roundedFu: 0,
      isChiitoiFixed: false,
      isPinfuTsumoSpecial: false,
      breakdown: [
        { name: "国士無双", fu: 0 }
      ]
    };
  }

  if (handKind === "chiitoi"){
    return {
      fu: 25,
      rawFu: 25,
      roundedFu: 25,
      isChiitoiFixed: true,
      isPinfuTsumoSpecial: false,
      breakdown: [
        { name: "七対子固定", fu: 25 }
      ]
    };
  }

  if (handKind !== "standard"){
    return empty;
  }

  const breakdown = [];
  let rawFu = 20;

  breakdown.push({ name: "副底", fu: 20 });

  const internalGroups = cloneFuPatternMelds(pattern);
  const externalGroups = normalizeFuExternalGroups(meldList);

  let meldFu = 0;

  for (const g of internalGroups){
    if (!g || g.type !== "koutsu") continue;

    const info = calcFuForMeldGroup(
      {
        type: "koutsu",
        code: g.code,
        open: false,
        concealed: true,
        source: g.source || "concealed",
        isKan: false
      },
      winType,
      winTileCode
    );

    meldFu += (info.fu | 0);
    if ((info.fu | 0) > 0){
      breakdown.push({ name: info.name, fu: info.fu | 0 });
    }
  }

  for (const g of externalGroups){
    if (!g || g.type !== "koutsu") continue;

    const info = calcFuForMeldGroup(g, winType, winTileCode);

    meldFu += (info.fu | 0);
    if ((info.fu | 0) > 0){
      breakdown.push({ name: info.name, fu: info.fu | 0 });
    }
  }

  rawFu += meldFu;

  const pairValueCount = getFuPairValueCount(pattern.pairCode, roundWind, seatWind);
  const pairFu = pairValueCount * 2;
  if (pairFu > 0){
    rawFu += pairFu;
    breakdown.push({
      name: getFuPairName(pattern.pairCode, roundWind, seatWind),
      fu: pairFu
    });
  }

  const waitInfo = pickBestFuWait(pattern, winTileCode);
  const waitFu = waitInfo.fu | 0;
  if (waitFu > 0){
    rawFu += waitFu;
    breakdown.push({
      name: waitInfo.name,
      fu: waitFu
    });
  }

  const hasPinfu = fuHasYaku(yakuList, "pinfu");

  if (hasPinfu && isMenzen && winType === "tsumo"){
    return {
      fu: 20,
      rawFu: 20,
      roundedFu: 20,
      isChiitoiFixed: false,
      isPinfuTsumoSpecial: true,
      breakdown: [
        { name: "平和ツモ20符", fu: 20 }
      ]
    };
  }

  if (winType === "tsumo"){
    rawFu += 2;
    breakdown.push({ name: "ツモ", fu: 2 });
  } else if (winType === "ron" && isMenzen){
    rawFu += 10;
    breakdown.push({ name: "門前ロン", fu: 10 });
  }

  let roundedFu = fuRoundUpTo10(rawFu);

  if (winType === "ron" && roundedFu < 30){
    roundedFu = 30;
  }

  return {
    fu: roundedFu,
    rawFu,
    roundedFu,
    isChiitoiFixed: false,
    isPinfuTsumoSpecial: false,
    breakdown
  };
}

function calcFuInfoFromAgariInfo(info){
  if (!info) return buildFuEmptyResult();

  return calcFuInfo({
    handKind: info.handKind,
    pattern: info.pattern,
    meldList: info.input && Array.isArray(info.input.meldList) ? info.input.meldList : [],
    winType: info.input ? info.input.winType : null,
    winTileCode: info.input ? info.input.winTileCode : null,
    roundWind: info.input ? info.input.roundWind : null,
    seatWind: info.input ? info.input.seatWind : null,
    isMenzen: !!info.isMenzen,
    yakuList: Array.isArray(info.yaku) ? info.yaku : []
  });
}