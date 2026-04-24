// MBsanma/js/tensukeisan.js
// ========= tensukeisan.js（点数計算専用） =========
// 役割：
// - 三人麻雀の点数表に従って、結果画面用の点数を返す
// - 将来の持ち点増減処理でも使える形で返す
//
// 注意：
// - 状態変更はしない
// - ツモ損 / 100点単位あり / 切り上げ をルール設定から切り替える
// - 「切り上げ」は現行標準ルールの 1000 点単位切り上げを指す
// - 「あり」は 100 点単位の正確な支払いを指す

const SANMA_TSUMO_REGULAR_TABLE = {
  "20": {
    "1": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 1000
    },
    "2": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 1000
    },
    "3": {
      "ko": 1000,
      "oya": 2000,
      "dealerAll": 2000
    },
    "4": {
      "ko": 2000,
      "oya": 4000,
      "dealerAll": 4000
    }
  },
  "25": {
    "3": {
      "ko": 1000,
      "oya": 3000,
      "dealerAll": 3000
    },
    "4": {
      "ko": 2000,
      "oya": 5000,
      "dealerAll": 5000
    }
  },
  "30": {
    "1": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 1000
    },
    "2": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 2000
    },
    "3": {
      "ko": 1000,
      "oya": 3000,
      "dealerAll": 3000
    }
  },
  "40": {
    "1": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 1000
    },
    "2": {
      "ko": 1000,
      "oya": 2000,
      "dealerAll": 2000
    },
    "3": {
      "ko": 2000,
      "oya": 4000,
      "dealerAll": 4000
    }
  },
  "50": {
    "1": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 1000
    },
    "2": {
      "ko": 1000,
      "oya": 3000,
      "dealerAll": 3000
    },
    "3": {
      "ko": 2000,
      "oya": 5000,
      "dealerAll": 5000
    }
  },
  "60": {
    "1": {
      "ko": 1000,
      "oya": 1000,
      "dealerAll": 2000
    },
    "2": {
      "ko": 1000,
      "oya": 3000,
      "dealerAll": 3000
    }
  },
  "70": {
    "1": {
      "ko": 1000,
      "oya": 2000,
      "dealerAll": 2000
    },
    "2": {
      "ko": 2000,
      "oya": 3000,
      "dealerAll": 4000
    }
  }
};
const SANMA_RON_REGULAR_TABLE = {
  "25": {
    "2": {
      "koRon": 2000,
      "oyaRon": 3000
    },
    "3": {
      "koRon": 4000,
      "oyaRon": 5000
    },
    "4": {
      "koRon": 7000,
      "oyaRon": 10000
    }
  },
  "30": {
    "1": {
      "koRon": 1000,
      "oyaRon": 2000
    },
    "2": {
      "koRon": 2000,
      "oyaRon": 3000
    },
    "3": {
      "koRon": 4000,
      "oyaRon": 6000
    }
  },
  "40": {
    "1": {
      "koRon": 2000,
      "oyaRon": 2000
    },
    "2": {
      "koRon": 3000,
      "oyaRon": 4000
    },
    "3": {
      "koRon": 6000,
      "oyaRon": 8000
    }
  },
  "50": {
    "1": {
      "koRon": 2000,
      "oyaRon": 3000
    },
    "2": {
      "koRon": 4000,
      "oyaRon": 5000
    },
    "3": {
      "koRon": 7000,
      "oyaRon": 10000
    }
  },
  "60": {
    "1": {
      "koRon": 2000,
      "oyaRon": 3000
    },
    "2": {
      "koRon": 4000,
      "oyaRon": 6000
    }
  },
  "70": {
    "1": {
      "koRon": 3000,
      "oyaRon": 4000
    },
    "2": {
      "koRon": 5000,
      "oyaRon": 7000
    }
  }
};
const SANMA_TSUMO_LIMIT_TABLE = {
  "mangan": {
    "ko": 3000,
    "oya": 5000,
    "dealerAll": 6000
  },
  "haneman": {
    "ko": 4000,
    "oya": 8000,
    "dealerAll": 9000
  },
  "baiman": {
    "ko": 6000,
    "oya": 10000,
    "dealerAll": 12000
  },
  "sanbaiman": {
    "ko": 8000,
    "oya": 16000,
    "dealerAll": 18000
  },
  "yakuman": {
    "ko": 12000,
    "oya": 20000,
    "dealerAll": 24000
  }
};
const SANMA_RON_LIMIT_TABLE = {
  "mangan": {
    "koRon": 8000,
    "oyaRon": 12000
  },
  "haneman": {
    "koRon": 12000,
    "oyaRon": 18000
  },
  "baiman": {
    "koRon": 16000,
    "oyaRon": 24000
  },
  "sanbaiman": {
    "koRon": 24000,
    "oyaRon": 36000
  },
  "yakuman": {
    "koRon": 32000,
    "oyaRon": 48000
  }
};

const SANMA_EXACT_RON_REGULAR_TABLE = {
  "25": {
    "2": {
      "koRon": 1600,
      "oyaRon": 2400
    },
    "3": {
      "koRon": 3200,
      "oyaRon": 4800
    },
    "4": {
      "koRon": 6400,
      "oyaRon": 9600
    }
  },
  "30": {
    "1": {
      "koRon": 1000,
      "oyaRon": 1500
    },
    "2": {
      "koRon": 2000,
      "oyaRon": 2900
    },
    "3": {
      "koRon": 3900,
      "oyaRon": 5800
    },
    "4": {
      "koRon": 7700,
      "oyaRon": 11600
    }
  },
  "40": {
    "1": {
      "koRon": 1300,
      "oyaRon": 2000
    },
    "2": {
      "koRon": 2600,
      "oyaRon": 3900
    },
    "3": {
      "koRon": 5200,
      "oyaRon": 7700
    }
  },
  "50": {
    "1": {
      "koRon": 1600,
      "oyaRon": 2400
    },
    "2": {
      "koRon": 3200,
      "oyaRon": 4800
    },
    "3": {
      "koRon": 6400,
      "oyaRon": 9600
    }
  },
  "60": {
    "1": {
      "koRon": 2000,
      "oyaRon": 2900
    },
    "2": {
      "koRon": 3900,
      "oyaRon": 5800
    },
    "3": {
      "koRon": 7700,
      "oyaRon": 11600
    }
  },
  "70": {
    "1": {
      "koRon": 2300,
      "oyaRon": 3400
    },
    "2": {
      "koRon": 4500,
      "oyaRon": 6800
    }
  },
  "80": {
    "1": {
      "koRon": 2600,
      "oyaRon": 3900
    },
    "2": {
      "koRon": 5200,
      "oyaRon": 7700
    }
  },
  "90": {
    "1": {
      "koRon": 2900,
      "oyaRon": 4400
    },
    "2": {
      "koRon": 5800,
      "oyaRon": 8700
    }
  },
  "100": {
    "1": {
      "koRon": 3200,
      "oyaRon": 4800
    },
    "2": {
      "koRon": 6400,
      "oyaRon": 9600
    }
  },
  "110": {
    "1": {
      "koRon": 3600,
      "oyaRon": 5300
    },
    "2": {
      "koRon": 7100,
      "oyaRon": 10500
    }
  }
};
const SANMA_EXACT_RON_LIMIT_TABLE = {
  "mangan": {
    "koRon": 8000,
    "oyaRon": 12000
  },
  "haneman": {
    "koRon": 12000,
    "oyaRon": 18000
  },
  "baiman": {
    "koRon": 16000,
    "oyaRon": 24000
  },
  "sanbaiman": {
    "koRon": 24000,
    "oyaRon": 36000
  },
  "yakuman": {
    "koRon": 32000,
    "oyaRon": 48000
  }
};

const SANMA_EXACT_TSUMO_ARI_REGULAR_TABLE = {
  "20": {
    "2": {
      "ko": 400,
      "oya": 700,
      "dealerAll": 700
    },
    "3": {
      "ko": 700,
      "oya": 1300,
      "dealerAll": 1300
    },
    "4": {
      "ko": 1300,
      "oya": 2600,
      "dealerAll": 2600
    }
  },
  "25": {
    "1": {
      "ko": 300,
      "oya": 500,
      "dealerAll": 500
    },
    "3": {
      "ko": 800,
      "oya": 1600,
      "dealerAll": 1600
    },
    "4": {
      "ko": 1600,
      "oya": 3200,
      "dealerAll": 3200
    }
  },
  "30": {
    "1": {
      "ko": 400,
      "oya": 700,
      "dealerAll": 700
    },
    "2": {
      "ko": 500,
      "oya": 1000,
      "dealerAll": 1300
    },
    "3": {
      "ko": 1000,
      "oya": 2000,
      "dealerAll": 2000
    },
    "4": {
      "ko": 2000,
      "oya": 3900,
      "dealerAll": 3900
    }
  },
  "40": {
    "1": {
      "ko": 400,
      "oya": 800,
      "dealerAll": 800
    },
    "2": {
      "ko": 700,
      "oya": 1300,
      "dealerAll": 1600
    },
    "3": {
      "ko": 1300,
      "oya": 2600,
      "dealerAll": 2600
    },
    "4": {
      "ko": 2000,
      "oya": 4000,
      "dealerAll": 4000
    }
  },
  "50": {
    "1": {
      "ko": 500,
      "oya": 1000,
      "dealerAll": 1000
    },
    "2": {
      "ko": 800,
      "oya": 1600,
      "dealerAll": 2000
    },
    "3": {
      "ko": 1600,
      "oya": 3200,
      "dealerAll": 3200
    }
  },
  "60": {
    "1": {
      "ko": 700,
      "oya": 1300,
      "dealerAll": 1200
    },
    "2": {
      "ko": 1000,
      "oya": 2000,
      "dealerAll": 2300
    },
    "3": {
      "ko": 2000,
      "oya": 3900,
      "dealerAll": 3900
    }
  },
  "70": {
    "1": {
      "ko": 700,
      "oya": 1500,
      "dealerAll": 1300
    },
    "2": {
      "ko": 1200,
      "oya": 2300,
      "dealerAll": 2600
    },
    "3": {
      "ko": 2000,
      "oya": 4000,
      "dealerAll": 4000
    }
  },
  "80": {
    "1": {
      "ko": 800,
      "oya": 1600,
      "dealerAll": 1500
    },
    "2": {
      "ko": 1300,
      "oya": 2600,
      "dealerAll": 2900
    }
  },
  "90": {
    "1": {
      "ko": 800,
      "oya": 1600,
      "dealerAll": 1600
    },
    "2": {
      "ko": 1500,
      "oya": 2900,
      "dealerAll": 3200
    }
  },
  "100": {
    "2": {
      "ko": 1600,
      "oya": 3200,
      "dealerAll": 3600
    }
  },
  "110": {
    "2": {
      "ko": 1800,
      "oya": 3600
    }
  }
};
const SANMA_EXACT_TSUMO_ARI_LIMIT_TABLE = {
  "mangan": {
    "ko": 2000,
    "oya": 4000,
    "dealerAll": 4000
  },
  "haneman": {
    "ko": 3000,
    "oya": 6000,
    "dealerAll": 6000
  },
  "baiman": {
    "ko": 4000,
    "oya": 8000,
    "dealerAll": 8000
  },
  "sanbaiman": {
    "ko": 6000,
    "oya": 12000,
    "dealerAll": 12000
  },
  "yakuman": {
    "ko": 8000,
    "oya": 16000,
    "dealerAll": 16000
  }
};

const SANMA_EXACT_TSUMO_NASHI_REGULAR_TABLE = {
  "20": {
    "2": {
      "ko": 600,
      "oya": 900,
      "dealerAll": 1100
    },
    "3": {
      "ko": 1000,
      "oya": 1700,
      "dealerAll": 2000
    },
    "4": {
      "ko": 2000,
      "oya": 3200,
      "dealerAll": 3900
    }
  },
  "25": {
    "1": {
      "ko": 300,
      "oya": 500,
      "dealerAll": 600
    },
    "3": {
      "ko": 1200,
      "oya": 2000,
      "dealerAll": 2400
    },
    "4": {
      "ko": 2500,
      "oya": 3900,
      "dealerAll": 4800
    }
  },
  "30": {
    "1": {
      "ko": 400,
      "oya": 700,
      "dealerAll": 800
    },
    "2": {
      "ko": 800,
      "oya": 1200,
      "dealerAll": 1500
    },
    "3": {
      "ko": 1600,
      "oya": 2400,
      "dealerAll": 3000
    },
    "4": {
      "ko": 3100,
      "oya": 4600,
      "dealerAll": 5800
    }
  },
  "40": {
    "1": {
      "ko": 600,
      "oya": 900,
      "dealerAll": 1100
    },
    "2": {
      "ko": 1000,
      "oya": 1700,
      "dealerAll": 2000
    },
    "3": {
      "ko": 2000,
      "oya": 3200,
      "dealerAll": 3900
    },
    "4": {
      "ko": 4100,
      "oya": 6300,
      "dealerAll": 7800
    }
  },
  "50": {
    "1": {
      "ko": 600,
      "oya": 1000,
      "dealerAll": 1200
    },
    "2": {
      "ko": 1200,
      "oya": 2000,
      "dealerAll": 2400
    },
    "3": {
      "ko": 2500,
      "oya": 3900,
      "dealerAll": 4800
    }
  },
  "60": {
    "1": {
      "ko": 800,
      "oya": 1200,
      "dealerAll": 1500
    },
    "2": {
      "ko": 1600,
      "oya": 2400,
      "dealerAll": 3000
    },
    "3": {
      "ko": 3100,
      "oya": 4800,
      "dealerAll": 5900
    }
  },
  "70": {
    "1": {
      "ko": 900,
      "oya": 1500,
      "dealerAll": 1800
    },
    "2": {
      "ko": 1800,
      "oya": 2900,
      "dealerAll": 3500
    }
  },
  "80": {
    "1": {
      "ko": 1000,
      "oya": 1700,
      "dealerAll": 2000
    },
    "2": {
      "ko": 2000,
      "oya": 3200,
      "dealerAll": 3900
    }
  },
  "90": {
    "1": {
      "ko": 1200,
      "oya": 1900,
      "dealerAll": 2300
    },
    "2": {
      "ko": 2300,
      "oya": 3600,
      "dealerAll": 4400
    }
  },
  "100": {
    "2": {
      "ko": 2500,
      "oya": 3900,
      "dealerAll": 4800
    }
  },
  "110": {
    "2": {
      "ko": 2800,
      "oya": 4400,
      "dealerAll": 5400
    }
  }
};
const SANMA_EXACT_TSUMO_NASHI_LIMIT_TABLE = {
  "mangan": {
    "ko": 3000,
    "oya": 5000,
    "dealerAll": 6000
  },
  "haneman": {
    "ko": 4500,
    "oya": 7500,
    "dealerAll": 9000
  },
  "baiman": {
    "ko": 6000,
    "oya": 10000,
    "dealerAll": 12000
  },
  "sanbaiman": {
    "ko": 9000,
    "oya": 15000,
    "dealerAll": 18000
  },
  "yakuman": {
    "ko": 12000,
    "oya": 20000,
    "dealerAll": 24000
  }
};

function formatSanmaPoint(value){
  const n = Number(value) || 0;
  return n.toLocaleString("ja-JP");
}

function roundSanmaPointToThousand(value){
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 1000) * 1000;
}

function cloneSanmaScoreEntry(entry){
  if (!entry || typeof entry !== "object") return null;
  return { ...entry };
}

function getSanmaScoreLimitName(totalHan, yakumanCount){
  const ym = Number.isFinite(yakumanCount) ? (yakumanCount | 0) : 0;
  const han = Number.isFinite(totalHan) ? (totalHan | 0) : 0;

  if (ym > 0) return "yakuman";
  if (han >= 13) return isKazoeYakumanEnabledForTensukeisan() ? "yakuman" : "sanbaiman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5) return "mangan";
  return null;
}

function getRuleValueForTensukeisan(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function getRuleNumberForTensukeisan(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getNumber === "function"){
      const value = window.MBSanmaRulesConfig.getNumber(key, fallback);
      return Number.isFinite(value) ? value : fallback;
    }
  }catch(e){}
  const raw = Number(getRuleValueForTensukeisan(key, fallback));
  return Number.isFinite(raw) ? raw : fallback;
}

function getConfiguredHonbaRonForTensukeisan(){
  return Math.max(0, Math.round(getRuleNumberForTensukeisan("score-honba-ron", 1000)));
}

function getConfiguredHonbaTsumoEachForTensukeisan(){
  return Math.max(0, Math.round(getRuleNumberForTensukeisan("score-honba-tsumo-each", 1000)));
}

function isTsumosonEnabledForTensukeisan(){
  const raw = String(getRuleValueForTensukeisan("score-tsumoson", "off") || "").toLowerCase();
  return raw === "on";
}

function getConfiguredRoundingTypeForTensukeisan(){
  const raw = String(getRuleValueForTensukeisan("score-rounding-type", "ceil") || "").toLowerCase();
  return raw === "ari" ? "ari" : "ceil";
}

function isKiriageManganEnabledForTensukeisan(){
  const raw = String(getRuleValueForTensukeisan("extra-kiriage-mangan", "on") || "").toLowerCase();
  return raw === "on";
}

function getConfiguredNagashiModeForTensukeisan(){
  const raw = String(getRuleValueForTensukeisan("extra-nagashi-mode", "baiman") || "").toLowerCase();
  if (raw === "mangan") return "mangan";
  if (raw === "off") return "off";
  return "baiman";
}

function isKazoeYakumanEnabledForTensukeisan(){
  const raw = String(getRuleValueForTensukeisan("extra-kazoe-yakuman", "on") || "").toLowerCase();
  return raw !== "off";
}

function getSanmaHonbaCount(){
  if (typeof honba === "number" && Number.isFinite(honba) && honba > 0){
    return honba | 0;
  }
  return 0;
}

function getRegularSanmaRonEntry(fu, han){
  const fuKey = String(fu | 0);
  const hanKey = String(han | 0);
  const roundingType = getConfiguredRoundingTypeForTensukeisan();
  const baseTable = roundingType === "ari" ? SANMA_EXACT_RON_REGULAR_TABLE : SANMA_RON_REGULAR_TABLE;
  return cloneSanmaScoreEntry((baseTable[fuKey] && baseTable[fuKey][hanKey]) || null);
}

function getSanmaRonLimitEntry(limitName, yakumanCount = 0){
  if (!limitName) return null;
  const roundingType = getConfiguredRoundingTypeForTensukeisan();
  const baseTable = roundingType === "ari" ? SANMA_EXACT_RON_LIMIT_TABLE : SANMA_RON_LIMIT_TABLE;
  const base = baseTable[limitName];
  if (!base) return null;
  if (limitName === "yakuman" && yakumanCount > 1){
    return {
      koRon: base.koRon * yakumanCount,
      oyaRon: base.oyaRon * yakumanCount
    };
  }
  return cloneSanmaScoreEntry(base);
}

function getExactSanmaTsumoRegularEntry(fu, han){
  const fuKey = String(fu | 0);
  const hanKey = String(han | 0);
  const tsumosonEnabled = isTsumosonEnabledForTensukeisan();
  const table = tsumosonEnabled ? SANMA_EXACT_TSUMO_ARI_REGULAR_TABLE : SANMA_EXACT_TSUMO_NASHI_REGULAR_TABLE;
  return cloneSanmaScoreEntry((table[fuKey] && table[fuKey][hanKey]) || null);
}

function getLegacySanmaTsumoRegularEntry(fu, han){
  const fuKey = String(fu | 0);
  const hanKey = String(han | 0);
  return cloneSanmaScoreEntry((SANMA_TSUMO_REGULAR_TABLE[fuKey] && SANMA_TSUMO_REGULAR_TABLE[fuKey][hanKey]) || null);
}

function getRegularSanmaTsumoEntry(fu, han, isDealer){
  const roundingType = getConfiguredRoundingTypeForTensukeisan();
  if (roundingType === "ari"){
    return getExactSanmaTsumoRegularEntry(fu, han);
  }

  if (!isTsumosonEnabledForTensukeisan()){
    return getLegacySanmaTsumoRegularEntry(fu, han);
  }

  const exact = getExactSanmaTsumoRegularEntry(fu, han);
  if (!exact) return null;

  if (isDealer){
    return { dealerAll: roundSanmaPointToThousand(exact.dealerAll) };
  }

  return {
    ko: roundSanmaPointToThousand(exact.ko),
    oya: roundSanmaPointToThousand(exact.oya)
  };
}

function getExactSanmaTsumoLimitEntry(limitName, yakumanCount = 0){
  if (!limitName) return null;
  const tsumosonEnabled = isTsumosonEnabledForTensukeisan();
  const table = tsumosonEnabled ? SANMA_EXACT_TSUMO_ARI_LIMIT_TABLE : SANMA_EXACT_TSUMO_NASHI_LIMIT_TABLE;
  const base = table[limitName];
  if (!base) return null;
  if (limitName === "yakuman" && yakumanCount > 1){
    return {
      ko: base.ko * yakumanCount,
      oya: base.oya * yakumanCount,
      dealerAll: base.dealerAll * yakumanCount
    };
  }
  return cloneSanmaScoreEntry(base);
}

function getLegacySanmaTsumoLimitEntry(limitName, yakumanCount = 0){
  if (!limitName) return null;
  const base = SANMA_TSUMO_LIMIT_TABLE[limitName];
  if (!base) return null;
  if (limitName === "yakuman" && yakumanCount > 1){
    return {
      ko: base.ko * yakumanCount,
      oya: base.oya * yakumanCount,
      dealerAll: base.dealerAll * yakumanCount
    };
  }
  return cloneSanmaScoreEntry(base);
}

function getSanmaTsumoLimitEntry(limitName, isDealer, yakumanCount = 0){
  const roundingType = getConfiguredRoundingTypeForTensukeisan();
  if (roundingType === "ari"){
    return getExactSanmaTsumoLimitEntry(limitName, yakumanCount);
  }

  if (!isTsumosonEnabledForTensukeisan()){
    return getLegacySanmaTsumoLimitEntry(limitName, yakumanCount);
  }

  const exact = getExactSanmaTsumoLimitEntry(limitName, yakumanCount);
  if (!exact) return null;

  if (isDealer){
    return { dealerAll: roundSanmaPointToThousand(exact.dealerAll) };
  }

  return {
    ko: roundSanmaPointToThousand(exact.ko),
    oya: roundSanmaPointToThousand(exact.oya)
  };
}

function buildSanmaTsumoScoreResult(entry, isDealer, limitName = null, yakumanCount = 0){
  if (!entry) return null;

  if (isDealer){
    return {
      winType: "tsumo",
      isDealer: true,
      limitName,
      yakumanCount: yakumanCount | 0,
      payChild: entry.dealerAll | 0,
      payDealer: 0,
      payAll: entry.dealerAll | 0,
      ronPoint: 0,
      totalGain: (entry.dealerAll | 0) * 2,
      displayText: `${formatSanmaPoint(entry.dealerAll)}オール`
    };
  }

  return {
    winType: "tsumo",
    isDealer: false,
    limitName,
    yakumanCount: yakumanCount | 0,
    payChild: entry.ko | 0,
    payDealer: entry.oya | 0,
    payAll: 0,
    ronPoint: 0,
    totalGain: (entry.ko | 0) + (entry.oya | 0),
    displayText: `${formatSanmaPoint(entry.ko)}/${formatSanmaPoint(entry.oya)}`
  };
}

function buildSanmaRonScoreResult(entry, isDealer, limitName = null, yakumanCount = 0){
  if (!entry) return null;

  const ronPoint = isDealer ? (entry.oyaRon | 0) : (entry.koRon | 0);

  return {
    winType: "ron",
    isDealer: !!isDealer,
    limitName,
    yakumanCount: yakumanCount | 0,
    payChild: 0,
    payDealer: 0,
    payAll: 0,
    ronPoint,
    totalGain: ronPoint,
    displayText: formatSanmaPoint(ronPoint)
  };
}

function attachSanmaHonbaInfo(scoreResult, honbaCount){
  if (!scoreResult) return null;

  const hb = Number.isFinite(honbaCount) ? (honbaCount | 0) : 0;
  const next = { ...scoreResult };

  next.honba = hb;
  next.honbaBonusPerPayer = 0;
  next.honbaBonusTotal = 0;
  next.honbaDisplayText = "";

  if (hb <= 0) return next;

  if (next.winType === "tsumo"){
    const bonusPerPayer = hb * getConfiguredHonbaTsumoEachForTensukeisan();
    next.honbaBonusPerPayer = bonusPerPayer;
    next.honbaBonusTotal = bonusPerPayer * 2;
    next.totalGain = (next.totalGain | 0) + next.honbaBonusTotal;

    if (next.isDealer){
      next.honbaDisplayText = `(+${formatSanmaPoint(bonusPerPayer)}オール)`;
      return next;
    }

    next.honbaDisplayText = `(+${formatSanmaPoint(bonusPerPayer)}/+${formatSanmaPoint(bonusPerPayer)})`;
    return next;
  }

  if (next.winType === "ron"){
    const bonusRon = hb * getConfiguredHonbaRonForTensukeisan();
    next.honbaBonusPerPayer = bonusRon;
    next.honbaBonusTotal = bonusRon;
    next.totalGain = (next.totalGain | 0) + next.honbaBonusTotal;
    next.honbaDisplayText = `(+${formatSanmaPoint(bonusRon)})`;
    return next;
  }

  return next;
}

function normalizeSanmaTotalHanFromInfo(info){
  if (!info) return 0;
  if (typeof info.totalHan === "number") return info.totalHan | 0;

  const baseHan = Number.isFinite(info.han) ? (info.han | 0) : 0;
  const bonusHan = (info.bonus && Number.isFinite(info.bonus.total)) ? (info.bonus.total | 0) : 0;
  return (baseHan + bonusHan) | 0;
}

function isSanmaNagashiBaimanInfo(info){
  if (!info || typeof info !== "object") return false;

  if (info.handKind === "nagashi") return true;

  const yakuList = Array.isArray(info.yaku) ? info.yaku : [];
  return yakuList.some((y)=>{
    if (!y) return false;
    return (
      y.key === "nagashiBaiman"
      || y.name === "流し倍満"
      || y.name === "流し満貫"
    );
  });
}

function getSanmaNagashiLimitNameFromInfo(info){
  if (!isSanmaNagashiBaimanInfo(info)) return null;
  const mode = getConfiguredNagashiModeForTensukeisan();
  if (mode === "off") return null;
  return mode === "mangan" ? "mangan" : "baiman";
}

function getSanmaIsDealerFromSeatIndex(seatIndex){
  if (typeof resultSeatWindBySeatIndex === "function"){
    return resultSeatWindBySeatIndex(seatIndex) === "東";
  }

  const east = (typeof eastSeatIndex === "number") ? eastSeatIndex : 0;
  return seatIndex === east;
}

function getForcedSanmaLimitName(info, totalHan, fu){
  const nagashiLimitName = getSanmaNagashiLimitNameFromInfo(info);
  if (nagashiLimitName){
    return nagashiLimitName;
  }

  if (
    isKiriageManganEnabledForTensukeisan()
    && (
      (totalHan === 4 && fu === 30)
      || (totalHan === 3 && fu === 60)
    )
  ){
    return "mangan";
  }

  return null;
}

function calcSanmaScoreFromInfo(info, seatIndex, winType){
  if (!info) return null;
  if (winType !== "tsumo" && winType !== "ron" && winType !== "nagashi") return null;

  const normalizedWinType = winType === "nagashi" ? "tsumo" : winType;
  const isDealer = getSanmaIsDealerFromSeatIndex(seatIndex);
  const totalHan = normalizeSanmaTotalHanFromInfo(info);
  const fu = Number.isFinite(info.fu) ? (info.fu | 0) : 0;
  const yakumanCount = Number.isFinite(info.yakuman) ? (info.yakuman | 0) : 0;
  const honbaCount = getSanmaHonbaCount();

  const forcedLimitName = getForcedSanmaLimitName(info, totalHan, fu);
  const limitName = forcedLimitName || getSanmaScoreLimitName(totalHan, yakumanCount);

  if (limitName){
    if (normalizedWinType === "tsumo"){
      const limitEntry = getSanmaTsumoLimitEntry(limitName, isDealer, yakumanCount);
      return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(limitEntry, isDealer, limitName, yakumanCount), honbaCount);
    }
    const limitEntry = getSanmaRonLimitEntry(limitName, yakumanCount);
    return attachSanmaHonbaInfo(buildSanmaRonScoreResult(limitEntry, isDealer, limitName, yakumanCount), honbaCount);
  }

  if (normalizedWinType === "tsumo"){
    const regular = getRegularSanmaTsumoEntry(fu, totalHan, isDealer);
    if (regular){
      return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(regular, isDealer, null, yakumanCount), honbaCount);
    }

    const fallbackLimit = getSanmaTsumoLimitEntry("mangan", isDealer, yakumanCount);
    return attachSanmaHonbaInfo(buildSanmaTsumoScoreResult(fallbackLimit, isDealer, "mangan", yakumanCount), honbaCount);
  }

  const regular = getRegularSanmaRonEntry(fu, totalHan);
  if (regular){
    return attachSanmaHonbaInfo(buildSanmaRonScoreResult(regular, isDealer, null, yakumanCount), honbaCount);
  }

  const fallbackLimit = getSanmaRonLimitEntry("mangan", yakumanCount);
  return attachSanmaHonbaInfo(buildSanmaRonScoreResult(fallbackLimit, isDealer, "mangan", yakumanCount), honbaCount);
}
