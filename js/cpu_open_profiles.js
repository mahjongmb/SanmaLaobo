// MBsanma/js/cpu_open_profiles.js
// ========= cpu_open_profiles.js（CPU副露プロファイル定義） =========
// 役割：
// - CPU副露判断の傾向を、重みセットとして管理する
// - 同じ評価器でも、守備寄り / バランス / 速度寄り / 打点寄り / 前のめり へ切り替えられるようにする
// - 席ごとの副露エンジン種別（external / internal / legacy）も管理する
//
// 注意：
// - ここでは実行しない。定義と参照だけ。
// - 実際の採点は cpu_open_eval.js 側で行う

const CPU_OPEN_PROFILE_LIBRARY = {
  safe: {
    key: "safe",
    label: "Safe",
    passBase: 0.8,
    ponBase: -0.5,
    minkanBase: -2.8,

    riichiDangerPassBonus: 5.8,
    noValuePassBonus: 2.6,
    farShantenPassBonus: 1.8,
    topScorePassBonus: 1.1,

    ponYakuhaiBonus: 3.0,
    ponTenpaiKeepBonus: 2.4,
    ponShantenAdvanceBonus: 1.8,
    ponImproveCountFactor: 0.05,
    ponWaitTypeFactor: 0.14,
    ponHonitsuBonus: 1.4,
    ponToitoiBonus: 1.4,
    ponTanyaoBonus: 0.7,
    ponAlreadyOpenBonus: 0.5,
    ponDealerBonus: 0.4,
    ponRiichiDangerPenalty: 5.8,
    ponNoValuePenalty: 3.4,
    ponSpeedOnlyPenalty: 1.2,
    ponWorsenPenalty: 4.8,
    ponFarShantenPenalty: 1.8,
    ponTopScorePenalty: 0.9,

    minkanYakuhaiBonus: 1.0,
    minkanTenpaiKeepBonus: 2.0,
    minkanShantenAdvanceBonus: 0.8,
    minkanImproveCountFactor: 0.03,
    minkanWaitTypeFactor: 0.22,
    minkanHonitsuBonus: 0.7,
    minkanToitoiBonus: 0.7,
    minkanRiichiDangerPenalty: 7.5,
    minkanNoValuePenalty: 4.8,
    minkanSpeedOnlyPenalty: 0.8,
    minkanWorsenPenalty: 6.0,
    minkanClosedHandPenalty: 1.0,
    minkanTopScorePenalty: 1.2,
    allowLooseMinkan: false
  },

  menzen: {
    key: "menzen",
    label: "Menzen",
    passBase: 1.05,
    ponBase: -0.95,
    minkanBase: -3.0,

    riichiDangerPassBonus: 6.2,
    noValuePassBonus: 3.0,
    farShantenPassBonus: 2.0,
    topScorePassBonus: 1.2,

    ponYakuhaiBonus: 2.8,
    ponTenpaiKeepBonus: 2.1,
    ponShantenAdvanceBonus: 1.35,
    ponImproveCountFactor: 0.04,
    ponWaitTypeFactor: 0.12,
    ponHonitsuBonus: 1.3,
    ponToitoiBonus: 1.3,
    ponTanyaoBonus: 0.45,
    ponAlreadyOpenBonus: 0.25,
    ponDealerBonus: 0.25,
    ponRiichiDangerPenalty: 6.2,
    ponNoValuePenalty: 4.1,
    ponSpeedOnlyPenalty: 1.95,
    ponWorsenPenalty: 4.9,
    ponFarShantenPenalty: 2.0,
    ponTopScorePenalty: 1.0,
    ponSameTilePostcallPenalty: 1.8,
    ponEfficiencyDropThreshold: 4,
    ponEfficiencyDropPenalty: 1.6,
    ponLargeEfficiencyDropThreshold: 7,
    ponLargeEfficiencyDropPenalty: 2.8,
    ponEfficiencyKeepRateThreshold: 0.6,
    ponEfficiencyKeepRatePenalty: 1.2,

    minkanYakuhaiBonus: 0.9,
    minkanTenpaiKeepBonus: 1.8,
    minkanShantenAdvanceBonus: 0.6,
    minkanImproveCountFactor: 0.03,
    minkanWaitTypeFactor: 0.20,
    minkanHonitsuBonus: 0.6,
    minkanToitoiBonus: 0.6,
    minkanRiichiDangerPenalty: 7.8,
    minkanNoValuePenalty: 5.0,
    minkanSpeedOnlyPenalty: 1.2,
    minkanWorsenPenalty: 6.2,
    minkanClosedHandPenalty: 1.2,
    minkanTopScorePenalty: 1.2,
    allowLooseMinkan: false
  },

  balanced: {
    key: "balanced",
    label: "Balanced",
    // 実測調整: リーチ過多・副露不足を補正するため、balanced は標準副露をやや広く取る
    passBase: -0.4,
    ponBase: 0.55,
    minkanBase: -3.0,

    riichiDangerPassBonus: 6.2,
    noValuePassBonus: 0.85,
    farShantenPassBonus: 0.85,
    topScorePassBonus: 1.2,

    ponYakuhaiBonus: 5.6,
    ponTenpaiKeepBonus: 3.9,
    ponShantenAdvanceBonus: 3.5,
    ponImproveCountFactor: 0.135,
    ponWaitTypeFactor: 0.12,
    // 鳴きホンイツ強化（ユーザー要望：鳴きのホンイツをもう少し強く見てもいい）:
    //  - ponHonitsuBonus 1.3→1.7（eval側で×1.35されるので実効 1.76→2.30）
    //  - minkanHonitsuBonus 0.6→1.0（ポンとの釣り合い）
    ponHonitsuBonus: 1.7,
    ponToitoiBonus: 1.3,
    ponTanyaoBonus: 0.9,
    ponAlreadyOpenBonus: 1.25,
    ponDealerBonus: 0.85,
    ponRiichiDangerPenalty: 6.2,
    ponNoValuePenalty: 3.0,
    ponSpeedOnlyPenalty: 0.35,
    ponWorsenPenalty: 4.9,
    ponFarShantenPenalty: 2.0,
    ponTopScorePenalty: 1.0,
    ponSameTilePostcallPenalty: 1.8,
    ponEfficiencyDropThreshold: 4,
    ponEfficiencyDropPenalty: 1.6,
    ponLargeEfficiencyDropThreshold: 7,
    ponLargeEfficiencyDropPenalty: 2.8,
    ponEfficiencyKeepRateThreshold: 0.6,
    ponEfficiencyKeepRatePenalty: 1.2,

    minkanYakuhaiBonus: 0.9,
    minkanTenpaiKeepBonus: 1.8,
    minkanShantenAdvanceBonus: 0.6,
    minkanImproveCountFactor: 0.03,
    minkanWaitTypeFactor: 0.20,
    minkanHonitsuBonus: 1.0,
    minkanToitoiBonus: 0.6,
    minkanRiichiDangerPenalty: 7.8,
    minkanNoValuePenalty: 5.0,
    minkanSpeedOnlyPenalty: 1.2,
    minkanWorsenPenalty: 6.2,
    minkanClosedHandPenalty: 1.2,
    minkanTopScorePenalty: 1.2,
    allowLooseMinkan: false
  },

  speedy: {
    key: "speedy",
    label: "Speedy",
    passBase: 0.0,
    ponBase: 0.2,
    minkanBase: -1.8,

    riichiDangerPassBonus: 3.5,
    noValuePassBonus: 1.4,
    farShantenPassBonus: 0.8,
    topScorePassBonus: 0.2,

    ponYakuhaiBonus: 3.0,
    ponTenpaiKeepBonus: 3.0,
    ponShantenAdvanceBonus: 2.8,
    ponImproveCountFactor: 0.08,
    ponWaitTypeFactor: 0.18,
    ponHonitsuBonus: 1.8,
    ponToitoiBonus: 1.5,
    ponTanyaoBonus: 1.1,
    ponAlreadyOpenBonus: 0.9,
    ponDealerBonus: 0.8,
    ponRiichiDangerPenalty: 3.6,
    ponNoValuePenalty: 2.2,
    ponSpeedOnlyPenalty: 1.0,
    ponWorsenPenalty: 4.4,
    ponFarShantenPenalty: 0.8,
    ponTopScorePenalty: 0.1,

    minkanYakuhaiBonus: 1.3,
    minkanTenpaiKeepBonus: 3.2,
    minkanShantenAdvanceBonus: 1.0,
    minkanImproveCountFactor: 0.05,
    minkanWaitTypeFactor: 0.34,
    minkanHonitsuBonus: 0.9,
    minkanToitoiBonus: 1.0,
    minkanRiichiDangerPenalty: 5.2,
    minkanNoValuePenalty: 3.6,
    minkanSpeedOnlyPenalty: 0.8,
    minkanWorsenPenalty: 5.3,
    minkanClosedHandPenalty: 0.6,
    minkanTopScorePenalty: 0.2,
    allowLooseMinkan: false
  },

  value: {
    key: "value",
    label: "Value",
    passBase: 0.5,
    ponBase: -0.4,
    minkanBase: -2.4,

    riichiDangerPassBonus: 5.0,
    noValuePassBonus: 2.8,
    farShantenPassBonus: 1.2,
    topScorePassBonus: 0.7,

    ponYakuhaiBonus: 3.6,
    ponTenpaiKeepBonus: 2.4,
    ponShantenAdvanceBonus: 1.8,
    ponImproveCountFactor: 0.05,
    ponWaitTypeFactor: 0.14,
    ponHonitsuBonus: 2.3,
    ponToitoiBonus: 2.1,
    ponTanyaoBonus: 0.6,
    ponAlreadyOpenBonus: 0.4,
    ponDealerBonus: 0.5,
    ponRiichiDangerPenalty: 4.9,
    ponNoValuePenalty: 3.6,
    ponSpeedOnlyPenalty: 1.4,
    ponWorsenPenalty: 4.8,
    ponFarShantenPenalty: 1.4,
    ponTopScorePenalty: 0.5,

    minkanYakuhaiBonus: 1.2,
    minkanTenpaiKeepBonus: 2.6,
    minkanShantenAdvanceBonus: 0.8,
    minkanImproveCountFactor: 0.04,
    minkanWaitTypeFactor: 0.26,
    minkanHonitsuBonus: 1.1,
    minkanToitoiBonus: 1.1,
    minkanRiichiDangerPenalty: 6.8,
    minkanNoValuePenalty: 4.2,
    minkanSpeedOnlyPenalty: 0.9,
    minkanWorsenPenalty: 5.8,
    minkanClosedHandPenalty: 0.9,
    minkanTopScorePenalty: 0.8,
    allowLooseMinkan: false
  },

  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    passBase: -0.2,
    ponBase: 0.4,
    minkanBase: -1.4,

    riichiDangerPassBonus: 2.8,
    noValuePassBonus: 1.0,
    farShantenPassBonus: 0.4,
    topScorePassBonus: 0.0,

    ponYakuhaiBonus: 3.0,
    ponTenpaiKeepBonus: 3.0,
    ponShantenAdvanceBonus: 3.0,
    ponImproveCountFactor: 0.09,
    ponWaitTypeFactor: 0.20,
    ponHonitsuBonus: 1.6,
    ponToitoiBonus: 1.6,
    ponTanyaoBonus: 1.2,
    ponAlreadyOpenBonus: 1.1,
    ponDealerBonus: 0.9,
    ponRiichiDangerPenalty: 2.8,
    ponNoValuePenalty: 1.8,
    ponSpeedOnlyPenalty: 0.8,
    ponWorsenPenalty: 4.2,
    ponFarShantenPenalty: 0.4,
    ponTopScorePenalty: 0.0,

    minkanYakuhaiBonus: 1.4,
    minkanTenpaiKeepBonus: 3.4,
    minkanShantenAdvanceBonus: 1.1,
    minkanImproveCountFactor: 0.06,
    minkanWaitTypeFactor: 0.38,
    minkanHonitsuBonus: 0.9,
    minkanToitoiBonus: 1.0,
    minkanRiichiDangerPenalty: 4.5,
    minkanNoValuePenalty: 3.0,
    minkanSpeedOnlyPenalty: 0.7,
    minkanWorsenPenalty: 5.0,
    minkanClosedHandPenalty: 0.5,
    minkanTopScorePenalty: 0.0,
    allowLooseMinkan: true
  }
};

const CPU_OPEN_PROFILE_ALIAS = {
  speed: "speedy",
  daten: "value",
  mae: "aggressive",
  forward: "aggressive",
  defense: "safe",
  closed: "menzen"
};

const CPU_OPEN_ENGINE_MODE_LIBRARY = {
  external: { key: "external", label: "External" },
  internal: { key: "internal", label: "Internal" },
  legacy: { key: "legacy", label: "Legacy" }
};

const CPU_OPEN_SEAT_PROFILE_KEY = {
  0: "balanced",
  1: "balanced",
  2: "balanced"
};

const CPU_OPEN_SEAT_ENGINE_MODE = {
  0: "internal",
  1: "internal",
  2: "internal"
};

function normalizeCpuOpenProfileKey(key){
  const name = String(key || "balanced").trim();
  if (CPU_OPEN_PROFILE_LIBRARY[name]) return name;
  const alias = CPU_OPEN_PROFILE_ALIAS[name];
  if (alias && CPU_OPEN_PROFILE_LIBRARY[alias]) return alias;
  return "balanced";
}

function normalizeCpuOpenSeatEngineMode(mode){
  const key = String(mode || "internal").trim().toLowerCase();
  return CPU_OPEN_ENGINE_MODE_LIBRARY[key] ? key : "internal";
}

function cloneCpuOpenProfile(profile){
  return profile ? { ...profile } : null;
}

function getCpuOpenProfileLibrary(){
  return { ...CPU_OPEN_PROFILE_LIBRARY };
}

function getCpuOpenProfile(key){
  return cloneCpuOpenProfile(CPU_OPEN_PROFILE_LIBRARY[normalizeCpuOpenProfileKey(key)] || CPU_OPEN_PROFILE_LIBRARY.balanced);
}

function getCpuOpenSeatProfileKey(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return "balanced";
  return normalizeCpuOpenProfileKey(CPU_OPEN_SEAT_PROFILE_KEY[seatIndex]);
}

function getCpuOpenSeatProfile(seatIndex){
  return getCpuOpenProfile(getCpuOpenSeatProfileKey(seatIndex));
}

function setCpuOpenSeatProfile(seatIndex, key){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return getCpuOpenSeatProfileKey(seatIndex);
  const nextKey = normalizeCpuOpenProfileKey(key);
  CPU_OPEN_SEAT_PROFILE_KEY[seatIndex] = nextKey;
  try{
    if (typeof window !== "undefined"){
      window.CPU_OPEN_SEAT_PROFILE_KEY = CPU_OPEN_SEAT_PROFILE_KEY;
    }
  }catch(e){}
  return nextKey;
}

function setAllCpuOpenSeatProfiles(key){
  const nextKey = normalizeCpuOpenProfileKey(key);
  CPU_OPEN_SEAT_PROFILE_KEY[0] = nextKey;
  CPU_OPEN_SEAT_PROFILE_KEY[1] = nextKey;
  CPU_OPEN_SEAT_PROFILE_KEY[2] = nextKey;
  try{
    if (typeof window !== "undefined"){
      window.CPU_OPEN_SEAT_PROFILE_KEY = CPU_OPEN_SEAT_PROFILE_KEY;
    }
  }catch(e){}
  return true;
}

function getCpuOpenSeatEngineMode(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return "internal";
  return normalizeCpuOpenSeatEngineMode(CPU_OPEN_SEAT_ENGINE_MODE[seatIndex]);
}

function setCpuOpenSeatEngineMode(seatIndex, mode){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return getCpuOpenSeatEngineMode(seatIndex);
  const nextMode = normalizeCpuOpenSeatEngineMode(mode);
  CPU_OPEN_SEAT_ENGINE_MODE[seatIndex] = nextMode;
  try{
    if (typeof window !== "undefined"){
      window.CPU_OPEN_SEAT_ENGINE_MODE = CPU_OPEN_SEAT_ENGINE_MODE;
    }
  }catch(e){}
  return nextMode;
}

function setAllCpuOpenSeatEngineModes(mode){
  const nextMode = normalizeCpuOpenSeatEngineMode(mode);
  CPU_OPEN_SEAT_ENGINE_MODE[0] = nextMode;
  CPU_OPEN_SEAT_ENGINE_MODE[1] = nextMode;
  CPU_OPEN_SEAT_ENGINE_MODE[2] = nextMode;
  try{
    if (typeof window !== "undefined"){
      window.CPU_OPEN_SEAT_ENGINE_MODE = CPU_OPEN_SEAT_ENGINE_MODE;
    }
  }catch(e){}
  return true;
}

function doesCpuOpenSeatUseExternalDecision(seatIndex){
  return getCpuOpenSeatEngineMode(seatIndex) === "external";
}

function doesCpuOpenSeatUseInternalEval(seatIndex){
  const mode = getCpuOpenSeatEngineMode(seatIndex);
  return mode === "internal" || mode === "external";
}

function doesCpuOpenSeatUseLegacyPolicy(seatIndex){
  return getCpuOpenSeatEngineMode(seatIndex) === "legacy";
}

try{
  if (typeof window !== "undefined"){
    window.CPU_OPEN_PROFILE_LIBRARY = CPU_OPEN_PROFILE_LIBRARY;
    window.CPU_OPEN_PROFILE_ALIAS = CPU_OPEN_PROFILE_ALIAS;
    window.CPU_OPEN_ENGINE_MODE_LIBRARY = CPU_OPEN_ENGINE_MODE_LIBRARY;
    window.CPU_OPEN_SEAT_PROFILE_KEY = CPU_OPEN_SEAT_PROFILE_KEY;
    window.CPU_OPEN_SEAT_ENGINE_MODE = CPU_OPEN_SEAT_ENGINE_MODE;
    window.getCpuOpenProfileLibrary = getCpuOpenProfileLibrary;
    window.getCpuOpenProfile = getCpuOpenProfile;
    window.getCpuOpenSeatProfileKey = getCpuOpenSeatProfileKey;
    window.getCpuOpenSeatProfile = getCpuOpenSeatProfile;
    window.setCpuOpenSeatProfile = setCpuOpenSeatProfile;
    window.setAllCpuOpenSeatProfiles = setAllCpuOpenSeatProfiles;
    window.getCpuOpenSeatEngineMode = getCpuOpenSeatEngineMode;
    window.setCpuOpenSeatEngineMode = setCpuOpenSeatEngineMode;
    window.setAllCpuOpenSeatEngineModes = setAllCpuOpenSeatEngineModes;
    window.doesCpuOpenSeatUseExternalDecision = doesCpuOpenSeatUseExternalDecision;
    window.doesCpuOpenSeatUseInternalEval = doesCpuOpenSeatUseInternalEval;
    window.doesCpuOpenSeatUseLegacyPolicy = doesCpuOpenSeatUseLegacyPolicy;
  }
}catch(e){}
