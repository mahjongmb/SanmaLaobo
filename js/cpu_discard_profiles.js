// MBsanma/js/cpu_discard_profiles.js
// ========= cpu_discard_profiles.js（CPU打牌プロファイル定義） =========
// 役割：
// - CPU打牌評価の傾向を重みセットで持つ
// - 外部AI / 内部AI / 旧来ロジック の切替を席ごとに持つ
// - external 用5軸スタイルから、internal evaluator 用の重みを動的生成する
//
// 注意：
// - ここでは実行しない
// - 実際の採点は cpu_discard_eval.js 側で行う

const CPU_DISCARD_PROFILE_LIBRARY = {
  safe: {
    key: "safe",
    label: "Safe",
    shantenWeight: 240,
    improveCountFactor: 3.2,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 42,
    riichiSujiBonus: 22,
    riichiOneChanceBonus: 10,
    riichiDangerPenalty: 24,
    openYakuhaiDangerPenalty: 12,
    riichiReadyBonus: 18,
    doraKeepBonus: 10,
    redKeepBonus: 12,
    redDiscardPenalty: 8,
    honorPairKeepBonus: 8,
    isolatedHonorDiscardBonus: 8,
    terminalDiscardBonus: 2,
    duplicateCandidatePenalty: 0
  },

  menzen: {
    key: "menzen",
    label: "Menzen",
    shantenWeight: 230,
    improveCountFactor: 3.8,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 36,
    riichiSujiBonus: 18,
    riichiOneChanceBonus: 8,
    riichiDangerPenalty: 20,
    openYakuhaiDangerPenalty: 10,
    riichiReadyBonus: 28,
    doraKeepBonus: 14,
    redKeepBonus: 16,
    redDiscardPenalty: 10,
    honorPairKeepBonus: 10,
    isolatedHonorDiscardBonus: 7,
    terminalDiscardBonus: 1,
    duplicateCandidatePenalty: 0
  },

  balanced: {
    key: "balanced",
    label: "Balanced",
    shantenWeight: 240,
    improveCountFactor: 3.2,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 42,
    riichiSujiBonus: 22,
    riichiOneChanceBonus: 10,
    riichiDangerPenalty: 24,
    openYakuhaiDangerPenalty: 12,
    riichiReadyBonus: 40,
    doraKeepBonus: 10,
    redKeepBonus: 12,
    redDiscardPenalty: 8,
    honorPairKeepBonus: 8,
    isolatedHonorDiscardBonus: 8,
    terminalDiscardBonus: 2,
    duplicateCandidatePenalty: 0
  },

  speedy: {
    key: "speedy",
    label: "Speedy",
    shantenWeight: 245,
    improveCountFactor: 5.1,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 24,
    riichiSujiBonus: 12,
    riichiOneChanceBonus: 5,
    riichiDangerPenalty: 13,
    openYakuhaiDangerPenalty: 6,
    riichiReadyBonus: 34,
    doraKeepBonus: 8,
    redKeepBonus: 10,
    redDiscardPenalty: 6,
    honorPairKeepBonus: 5,
    isolatedHonorDiscardBonus: 5,
    terminalDiscardBonus: 0,
    duplicateCandidatePenalty: 0
  },

  value: {
    key: "value",
    label: "Value",
    shantenWeight: 215,
    improveCountFactor: 3.7,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 30,
    riichiSujiBonus: 15,
    riichiOneChanceBonus: 7,
    riichiDangerPenalty: 16,
    openYakuhaiDangerPenalty: 8,
    riichiReadyBonus: 24,
    doraKeepBonus: 20,
    redKeepBonus: 22,
    redDiscardPenalty: 12,
    honorPairKeepBonus: 10,
    isolatedHonorDiscardBonus: 5,
    terminalDiscardBonus: -1,
    duplicateCandidatePenalty: 0
  },

  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    shantenWeight: 250,
    improveCountFactor: 5.4,
    drawnDiscardBonus: 0,
    riichiGenbutsuBonus: 20,
    riichiSujiBonus: 10,
    riichiOneChanceBonus: 4,
    riichiDangerPenalty: 12,
    openYakuhaiDangerPenalty: 5,
    riichiReadyBonus: 36,
    doraKeepBonus: 7,
    redKeepBonus: 9,
    redDiscardPenalty: 5,
    honorPairKeepBonus: 4,
    isolatedHonorDiscardBonus: 4,
    terminalDiscardBonus: 0,
    duplicateCandidatePenalty: 0
  }
};

const CPU_DISCARD_PROFILE_ALIAS = {
  speed: "speedy",
  daten: "value",
  mae: "aggressive",
  forward: "aggressive",
  defense: "safe",
  closed: "menzen"
};

const CPU_DISCARD_ENGINE_MODE_LIBRARY = {
  external: { key: "external", label: "External" },
  internal: { key: "internal", label: "Internal" },
  legacy: { key: "legacy", label: "Legacy" }
};

const CPU_DISCARD_SEAT_PROFILE_KEY = {
  0: "safe",
  1: "safe",
  2: "safe"
};

const CPU_DISCARD_SEAT_ENGINE_MODE = {
  0: "internal",
  1: "internal",
  2: "internal"
};

const CPU_DISCARD_EXTERNAL_STYLE_LIBRARY = {
  balanced: {
    key: "balanced",
    label: "Balanced",
    pushPullBias: -2,
    speedShapeBias: -1,
    meldRiichiBias: 1,
    winValueBias: 0,
    situationalFlexBias: 2
  },

  defensive: {
    key: "defensive",
    label: "Defensive",
    pushPullBias: -2,
    speedShapeBias: -1,
    meldRiichiBias: 1,
    winValueBias: 0,
    situationalFlexBias: 2
  },

  speedy: {
    key: "speedy",
    label: "Speedy",
    pushPullBias: 1,
    speedShapeBias: 2,
    meldRiichiBias: -1,
    winValueBias: -1,
    situationalFlexBias: 0
  },

  menzen: {
    key: "menzen",
    label: "Menzen",
    pushPullBias: 0,
    speedShapeBias: -1,
    meldRiichiBias: 2,
    winValueBias: 1,
    situationalFlexBias: 1
  },

  value: {
    key: "value",
    label: "Value",
    pushPullBias: 0,
    speedShapeBias: -1,
    meldRiichiBias: 1,
    winValueBias: 2,
    situationalFlexBias: 1
  },

  aggressive: {
    key: "aggressive",
    label: "Aggressive",
    pushPullBias: 2,
    speedShapeBias: 1,
    meldRiichiBias: -1,
    winValueBias: -1,
    situationalFlexBias: -1
  }
};

const CPU_DISCARD_EXTERNAL_STYLE_ALIAS = {
  defend: "defensive",
  safe: "defensive",
  speed: "speedy",
  menzen_like: "menzen",
  value_like: "value",
  attack: "aggressive",
  push: "aggressive"
};

const CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT = {
  0: "balanced",
  1: "balanced",
  2: "balanced"
};

const CPU_DISCARD_INTERNAL_STYLE_MAP_V1 = {
  version: "discard_style_map_v1",
  baseProfileKey: "balanced",
  styleScalePerSituationalFlex: 0.06,
  shantenBySpeedShape: 12,
  shantenByPushPull: 4,
  improveBySpeedShape: 0.45,
  improveByPushPull: 0.15,
  drawnDiscardByPushPull: 0,
  riichiGenbutsuByPushPull: -4,
  riichiSujiByPushPull: -2,
  riichiOneChanceByPushPull: -1,
  riichiDangerByPushPull: -3,
  openYakuhaiDangerByPushPull: -2,
  riichiReadyBySpeedShape: 3,
  riichiReadyByMeldRiichi: 4.5,
  riichiReadyByPushPull: 1.5,
  doraKeepByWinValue: 3,
  redKeepByWinValue: 3,
  redDiscardByWinValue: 1.5,
  honorPairByMeldRiichi: -1.2,
  honorPairByWinValue: 1.1,
  isolatedHonorByMeldRiichi: 0.8,
  isolatedHonorByWinValue: -1,
  terminalDiscardByWinValue: -1
};

function normalizeCpuDiscardProfileKey(key){
  const name = String(key || "balanced").trim();
  if (CPU_DISCARD_PROFILE_LIBRARY[name]) return name;
  const alias = CPU_DISCARD_PROFILE_ALIAS[name];
  if (alias && CPU_DISCARD_PROFILE_LIBRARY[alias]) return alias;
  return "balanced";
}

function normalizeCpuDiscardExternalStyleKey(key){
  const name = String(key || "balanced").trim();
  if (CPU_DISCARD_EXTERNAL_STYLE_LIBRARY[name]) return name;
  const alias = CPU_DISCARD_EXTERNAL_STYLE_ALIAS[name];
  if (alias && CPU_DISCARD_EXTERNAL_STYLE_LIBRARY[alias]) return alias;
  return "balanced";
}

function clampCpuDiscardExternalStyleBias(value){
  const n = Number(value) || 0;
  if (n < -2) return -2;
  if (n > 2) return 2;
  return Math.round(n);
}

function clampCpuDiscardProfileNumber(value, min, max, digits = 0){
  let n = Number(value) || 0;
  if (Number.isFinite(min) && n < min) n = min;
  if (Number.isFinite(max) && n > max) n = max;
  if (!digits) return Math.round(n);
  const unit = 10 ** digits;
  return Math.round(n * unit) / unit;
}

function describeCpuDiscardExternalStyleBias(value, labels){
  const v = clampCpuDiscardExternalStyleBias(value);
  if (v <= -2) return labels[0];
  if (v === -1) return labels[1];
  if (v === 0) return labels[2];
  if (v === 1) return labels[3];
  return labels[4];
}

function buildCpuDiscardExternalStylePolicyText(style){
  const src = style && typeof style === "object" ? style : {};
  return {
    pushPull: describeCpuDiscardExternalStyleBias(src.pushPullBias, [
      "strongly fold-oriented",
      "slightly fold-oriented",
      "standard push-pull judgment",
      "slightly push-oriented",
      "strongly push-oriented"
    ]),
    speedShape: describeCpuDiscardExternalStyleBias(src.speedShapeBias, [
      "strongly shape-oriented",
      "slightly shape-oriented",
      "balanced between speed and final shape",
      "slightly speed-oriented",
      "strongly speed-oriented"
    ]),
    meldRiichi: describeCpuDiscardExternalStyleBias(src.meldRiichiBias, [
      "strongly meld-oriented",
      "slightly meld-oriented",
      "balanced between meld route and riichi route",
      "slightly riichi-oriented",
      "strongly riichi-oriented"
    ]),
    winValue: describeCpuDiscardExternalStyleBias(src.winValueBias, [
      "strongly win-rate-oriented",
      "slightly win-rate-oriented",
      "balanced between win rate and value",
      "slightly value-oriented",
      "strongly value-oriented"
    ]),
    situationalFlex: describeCpuDiscardExternalStyleBias(src.situationalFlexBias, [
      "keep personality stable even when the table changes",
      "adapt only a little to score and round pressure",
      "standard adaptation to score, round, dealer, and danger pressure",
      "adapt noticeably to score, round, dealer, and danger pressure",
      "adapt very strongly to score, round, dealer, and danger pressure"
    ])
  };
}

function normalizeCpuDiscardSeatEngineMode(mode){
  const key = String(mode || "internal").trim().toLowerCase();
  return CPU_DISCARD_ENGINE_MODE_LIBRARY[key] ? key : "internal";
}

function cloneCpuDiscardProfile(profile){
  return profile ? { ...profile } : null;
}

function getCpuDiscardProfileLibrary(){
  return { ...CPU_DISCARD_PROFILE_LIBRARY };
}

function getCpuDiscardProfile(key){
  return cloneCpuDiscardProfile(
    CPU_DISCARD_PROFILE_LIBRARY[normalizeCpuDiscardProfileKey(key)] || CPU_DISCARD_PROFILE_LIBRARY.balanced
  );
}

function cloneCpuDiscardExternalStyle(style){
  if (!style) return null;
  const out = { ...style };
  if (style.policyText && typeof style.policyText === "object"){
    out.policyText = { ...style.policyText };
  }
  return out;
}

function getCpuDiscardExternalStyleLibrary(){
  const out = {};
  for (const key of Object.keys(CPU_DISCARD_EXTERNAL_STYLE_LIBRARY)){
    out[key] = getCpuDiscardExternalStyle(key);
  }
  return out;
}

function getCpuDiscardExternalStyle(key){
  const normalizedKey = normalizeCpuDiscardExternalStyleKey(key);
  const base = CPU_DISCARD_EXTERNAL_STYLE_LIBRARY[normalizedKey] || CPU_DISCARD_EXTERNAL_STYLE_LIBRARY.balanced;
  const style = {
    ...base,
    pushPullBias: clampCpuDiscardExternalStyleBias(base.pushPullBias),
    speedShapeBias: clampCpuDiscardExternalStyleBias(base.speedShapeBias),
    meldRiichiBias: clampCpuDiscardExternalStyleBias(base.meldRiichiBias),
    winValueBias: clampCpuDiscardExternalStyleBias(base.winValueBias),
    situationalFlexBias: clampCpuDiscardExternalStyleBias(base.situationalFlexBias)
  };
  style.policyText = buildCpuDiscardExternalStylePolicyText(style);
  return cloneCpuDiscardExternalStyle(style);
}

function getCpuDiscardSeatExternalStyleKey(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return "balanced";
  return normalizeCpuDiscardExternalStyleKey(CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT[seatIndex]);
}

function getCpuDiscardSeatExternalStyle(seatIndex){
  return getCpuDiscardExternalStyle(getCpuDiscardSeatExternalStyleKey(seatIndex));
}

function setCpuDiscardSeatExternalStyle(seatIndex, key){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return getCpuDiscardSeatExternalStyle(seatIndex);

  const nextKey = normalizeCpuDiscardExternalStyleKey(key);
  CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT[seatIndex] = nextKey;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT = CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT;
    }
  }catch(e){}

  return getCpuDiscardSeatExternalStyle(seatIndex);
}

function setCpuDiscardSeatExternalStyleAll(key){
  const nextKey = normalizeCpuDiscardExternalStyleKey(key);
  CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT[0] = nextKey;
  CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT[1] = nextKey;
  CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT[2] = nextKey;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT = CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT;
    }
  }catch(e){}

  return nextKey;
}

function getCpuDiscardSeatProfileKey(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return "balanced";
  return normalizeCpuDiscardProfileKey(CPU_DISCARD_SEAT_PROFILE_KEY[seatIndex]);
}

function getCpuDiscardSeatProfile(seatIndex){
  return getCpuDiscardProfile(getCpuDiscardSeatProfileKey(seatIndex));
}

function setCpuDiscardSeatProfile(seatIndex, key){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return getCpuDiscardSeatProfile(seatIndex);

  const nextKey = normalizeCpuDiscardProfileKey(key);
  CPU_DISCARD_SEAT_PROFILE_KEY[seatIndex] = nextKey;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_SEAT_PROFILE_KEY = CPU_DISCARD_SEAT_PROFILE_KEY;
    }
  }catch(e){}

  return getCpuDiscardSeatProfile(seatIndex);
}

function setCpuDiscardSeatProfileAll(key){
  const nextKey = normalizeCpuDiscardProfileKey(key);
  CPU_DISCARD_SEAT_PROFILE_KEY[0] = nextKey;
  CPU_DISCARD_SEAT_PROFILE_KEY[1] = nextKey;
  CPU_DISCARD_SEAT_PROFILE_KEY[2] = nextKey;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_SEAT_PROFILE_KEY = CPU_DISCARD_SEAT_PROFILE_KEY;
    }
  }catch(e){}

  return nextKey;
}

function cloneCpuDiscardInternalStyleProfileMeta(profile){
  if (!profile || typeof profile !== "object") return null;
  const out = {
    mappingVersion: profile.mappingVersion || CPU_DISCARD_INTERNAL_STYLE_MAP_V1.version,
    baseProfileKey: profile.baseProfileKey || CPU_DISCARD_INTERNAL_STYLE_MAP_V1.baseProfileKey,
    externalStyleKey: profile.externalStyleKey || "",
    styleScale: Number.isFinite(profile.styleScale) ? profile.styleScale : 1
  };

  if (profile.biases && typeof profile.biases === "object"){
    out.biases = { ...profile.biases };
  }
  if (profile.mappingFactors && typeof profile.mappingFactors === "object"){
    out.mappingFactors = { ...profile.mappingFactors };
  }
  return out;
}

function buildCpuDiscardInternalProfileFromExternalStyle(styleOrKey, baseProfileKey = null){
  const style = (typeof styleOrKey === "string" || styleOrKey == null)
    ? getCpuDiscardExternalStyle(styleOrKey || "balanced")
    : getCpuDiscardExternalStyle(styleOrKey && styleOrKey.key ? styleOrKey.key : "balanced");

  const baseKey = normalizeCpuDiscardProfileKey(baseProfileKey || CPU_DISCARD_INTERNAL_STYLE_MAP_V1.baseProfileKey);
  const base = getCpuDiscardProfile(baseKey) || getCpuDiscardProfile("balanced");
  if (!base) return null;

  const pushPullBias = clampCpuDiscardExternalStyleBias(style && style.pushPullBias);
  const speedShapeBias = clampCpuDiscardExternalStyleBias(style && style.speedShapeBias);
  const meldRiichiBias = clampCpuDiscardExternalStyleBias(style && style.meldRiichiBias);
  const winValueBias = clampCpuDiscardExternalStyleBias(style && style.winValueBias);
  const situationalFlexBias = clampCpuDiscardExternalStyleBias(style && style.situationalFlexBias);

  const scale = clampCpuDiscardProfileNumber(
    1 + (situationalFlexBias * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.styleScalePerSituationalFlex),
    0.85,
    1.15,
    3
  );

  const scaledPushPull = pushPullBias * scale;
  const scaledSpeedShape = speedShapeBias * scale;
  const scaledMeldRiichi = meldRiichiBias * scale;
  const scaledWinValue = winValueBias * scale;

  const profile = {
    ...base,
    key: `${base.key}__style_${style && style.key ? style.key : "balanced"}`,
    label: `${style && style.label ? style.label : "Balanced"} (InternalV1)`,
    mappingVersion: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.version,
    baseProfileKey: base.key || baseKey,
    externalStyleKey: style && style.key ? style.key : "balanced",
    externalStyle: cloneCpuDiscardExternalStyle(style),
    styleScale: scale,
    biases: {
      pushPullBias,
      speedShapeBias,
      meldRiichiBias,
      winValueBias,
      situationalFlexBias
    }
  };

  profile.shantenWeight = clampCpuDiscardProfileNumber(
    (Number(base.shantenWeight) || 0)
      + (scaledSpeedShape * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.shantenBySpeedShape)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.shantenByPushPull),
    160,
    320,
    0
  );

  profile.improveCountFactor = clampCpuDiscardProfileNumber(
    (Number(base.improveCountFactor) || 0)
      + (scaledSpeedShape * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.improveBySpeedShape)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.improveByPushPull),
    2,
    7,
    2
  );

  profile.drawnDiscardBonus = clampCpuDiscardProfileNumber(
    (Number(base.drawnDiscardBonus) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.drawnDiscardByPushPull),
    -10,
    30,
    1
  );

  profile.riichiReadyBonus = clampCpuDiscardProfileNumber(
    (Number(base.riichiReadyBonus) || 0)
      + (scaledSpeedShape * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyBySpeedShape)
      + (scaledMeldRiichi * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyByMeldRiichi)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyByPushPull),
    0,
    60,
    1
  );

  profile.doraKeepBonus = clampCpuDiscardProfileNumber(
    (Number(base.doraKeepBonus) || 0)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.doraKeepByWinValue),
    0,
    30,
    1
  );

  profile.redKeepBonus = clampCpuDiscardProfileNumber(
    (Number(base.redKeepBonus) || 0)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.redKeepByWinValue),
    0,
    36,
    1
  );

  profile.redDiscardPenalty = clampCpuDiscardProfileNumber(
    (Number(base.redDiscardPenalty) || 0)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.redDiscardByWinValue),
    0,
    20,
    1
  );

  profile.honorPairKeepBonus = clampCpuDiscardProfileNumber(
    (Number(base.honorPairKeepBonus) || 0)
      + (scaledMeldRiichi * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.honorPairByMeldRiichi)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.honorPairByWinValue),
    0,
    20,
    1
  );

  profile.isolatedHonorDiscardBonus = clampCpuDiscardProfileNumber(
    (Number(base.isolatedHonorDiscardBonus) || 0)
      + (scaledMeldRiichi * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.isolatedHonorByMeldRiichi)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.isolatedHonorByWinValue),
    -10,
    20,
    1
  );

  profile.terminalDiscardBonus = clampCpuDiscardProfileNumber(
    (Number(base.terminalDiscardBonus) || 0)
      + (scaledWinValue * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.terminalDiscardByWinValue),
    -10,
    10,
    1
  );

  profile.riichiGenbutsuBonus = clampCpuDiscardProfileNumber(
    (Number(base.riichiGenbutsuBonus) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiGenbutsuByPushPull),
    0,
    60,
    1
  );

  profile.riichiSujiBonus = clampCpuDiscardProfileNumber(
    (Number(base.riichiSujiBonus) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiSujiByPushPull),
    0,
    40,
    1
  );

  profile.riichiOneChanceBonus = clampCpuDiscardProfileNumber(
    (Number(base.riichiOneChanceBonus) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiOneChanceByPushPull),
    0,
    24,
    1
  );

  profile.riichiDangerPenalty = clampCpuDiscardProfileNumber(
    (Number(base.riichiDangerPenalty) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiDangerByPushPull),
    0,
    40,
    1
  );

  profile.openYakuhaiDangerPenalty = clampCpuDiscardProfileNumber(
    (Number(base.openYakuhaiDangerPenalty) || 0)
      + (scaledPushPull * CPU_DISCARD_INTERNAL_STYLE_MAP_V1.openYakuhaiDangerByPushPull),
    0,
    24,
    1
  );

  profile.duplicateCandidatePenalty = Number(base.duplicateCandidatePenalty) || 0;
  profile.mappingFactors = {
    shantenBySpeedShape: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.shantenBySpeedShape,
    shantenByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.shantenByPushPull,
    improveBySpeedShape: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.improveBySpeedShape,
    improveByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.improveByPushPull,
    drawnDiscardByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.drawnDiscardByPushPull,
    riichiGenbutsuByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiGenbutsuByPushPull,
    riichiSujiByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiSujiByPushPull,
    riichiOneChanceByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiOneChanceByPushPull,
    riichiDangerByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiDangerByPushPull,
    openYakuhaiDangerByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.openYakuhaiDangerByPushPull,
    riichiReadyBySpeedShape: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyBySpeedShape,
    riichiReadyByMeldRiichi: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyByMeldRiichi,
    riichiReadyByPushPull: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.riichiReadyByPushPull,
    doraKeepByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.doraKeepByWinValue,
    redKeepByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.redKeepByWinValue,
    redDiscardByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.redDiscardByWinValue,
    honorPairByMeldRiichi: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.honorPairByMeldRiichi,
    honorPairByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.honorPairByWinValue,
    isolatedHonorByMeldRiichi: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.isolatedHonorByMeldRiichi,
    isolatedHonorByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.isolatedHonorByWinValue,
    terminalDiscardByWinValue: CPU_DISCARD_INTERNAL_STYLE_MAP_V1.terminalDiscardByWinValue
  };

  return cloneCpuDiscardProfile(profile);
}

function getCpuDiscardSeatInternalStyleProfile(seatIndex){
  const style = getCpuDiscardSeatExternalStyle(seatIndex);
  return buildCpuDiscardInternalProfileFromExternalStyle(style, CPU_DISCARD_INTERNAL_STYLE_MAP_V1.baseProfileKey);
}

function getCpuDiscardSeatEngineMode(seatIndex){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return "legacy";
  return normalizeCpuDiscardSeatEngineMode(CPU_DISCARD_SEAT_ENGINE_MODE[seatIndex]);
}

function setCpuDiscardSeatEngineMode(seatIndex, mode){
  if (seatIndex !== 0 && seatIndex !== 1 && seatIndex !== 2) return getCpuDiscardSeatEngineMode(seatIndex);

  const nextMode = normalizeCpuDiscardSeatEngineMode(mode);
  CPU_DISCARD_SEAT_ENGINE_MODE[seatIndex] = nextMode;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_SEAT_ENGINE_MODE = CPU_DISCARD_SEAT_ENGINE_MODE;
    }
  }catch(e){}

  return getCpuDiscardSeatEngineMode(seatIndex);
}

function setCpuDiscardSeatEngineModeAll(mode){
  const nextMode = normalizeCpuDiscardSeatEngineMode(mode);
  CPU_DISCARD_SEAT_ENGINE_MODE[0] = nextMode;
  CPU_DISCARD_SEAT_ENGINE_MODE[1] = nextMode;
  CPU_DISCARD_SEAT_ENGINE_MODE[2] = nextMode;

  try{
    if (typeof window !== "undefined"){
      window.CPU_DISCARD_SEAT_ENGINE_MODE = CPU_DISCARD_SEAT_ENGINE_MODE;
    }
  }catch(e){}

  return nextMode;
}

function isCpuDiscardSeatExternalMode(seatIndex){
  return getCpuDiscardSeatEngineMode(seatIndex) === "external";
}

function isCpuDiscardSeatInternalMode(seatIndex){
  return getCpuDiscardSeatEngineMode(seatIndex) === "internal";
}

function isCpuDiscardSeatLegacyMode(seatIndex){
  return getCpuDiscardSeatEngineMode(seatIndex) === "legacy";
}

function doesCpuDiscardSeatUseExternalDecision(seatIndex){
  return getCpuDiscardSeatEngineMode(seatIndex) === "external";
}

function doesCpuDiscardSeatUseInternalEval(seatIndex){
  const mode = getCpuDiscardSeatEngineMode(seatIndex);
  return mode === "internal" || mode === "external";
}

function doesCpuDiscardSeatUseLegacyPolicy(seatIndex){
  return getCpuDiscardSeatEngineMode(seatIndex) === "legacy";
}

try{
  if (typeof window !== "undefined"){
    window.CPU_DISCARD_PROFILE_LIBRARY = CPU_DISCARD_PROFILE_LIBRARY;
    window.CPU_DISCARD_ENGINE_MODE_LIBRARY = CPU_DISCARD_ENGINE_MODE_LIBRARY;
    window.CPU_DISCARD_EXTERNAL_STYLE_LIBRARY = CPU_DISCARD_EXTERNAL_STYLE_LIBRARY;
    window.CPU_DISCARD_SEAT_PROFILE_KEY = CPU_DISCARD_SEAT_PROFILE_KEY;
    window.CPU_DISCARD_SEAT_ENGINE_MODE = CPU_DISCARD_SEAT_ENGINE_MODE;
    window.CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT = CPU_DISCARD_EXTERNAL_STYLE_BY_SEAT;
    window.CPU_DISCARD_INTERNAL_STYLE_MAP_V1 = CPU_DISCARD_INTERNAL_STYLE_MAP_V1;

    window.getCpuDiscardProfileLibrary = getCpuDiscardProfileLibrary;
    window.getCpuDiscardExternalStyleLibrary = getCpuDiscardExternalStyleLibrary;
    window.getCpuDiscardProfile = getCpuDiscardProfile;
    window.getCpuDiscardSeatProfileKey = getCpuDiscardSeatProfileKey;
    window.getCpuDiscardSeatProfile = getCpuDiscardSeatProfile;
    window.setCpuDiscardSeatProfile = setCpuDiscardSeatProfile;
    window.setCpuDiscardSeatProfileAll = setCpuDiscardSeatProfileAll;
    window.getCpuDiscardExternalStyle = getCpuDiscardExternalStyle;
    window.getCpuDiscardSeatExternalStyleKey = getCpuDiscardSeatExternalStyleKey;
    window.getCpuDiscardSeatExternalStyle = getCpuDiscardSeatExternalStyle;
    window.setCpuDiscardSeatExternalStyle = setCpuDiscardSeatExternalStyle;
    window.setCpuDiscardSeatExternalStyleAll = setCpuDiscardSeatExternalStyleAll;
    window.buildCpuDiscardInternalProfileFromExternalStyle = buildCpuDiscardInternalProfileFromExternalStyle;
    window.getCpuDiscardSeatInternalStyleProfile = getCpuDiscardSeatInternalStyleProfile;
    window.cloneCpuDiscardInternalStyleProfileMeta = cloneCpuDiscardInternalStyleProfileMeta;
    window.getCpuDiscardSeatEngineMode = getCpuDiscardSeatEngineMode;
    window.setCpuDiscardSeatEngineMode = setCpuDiscardSeatEngineMode;
    window.setCpuDiscardSeatEngineModeAll = setCpuDiscardSeatEngineModeAll;
    window.isCpuDiscardSeatExternalMode = isCpuDiscardSeatExternalMode;
    window.isCpuDiscardSeatInternalMode = isCpuDiscardSeatInternalMode;
    window.isCpuDiscardSeatLegacyMode = isCpuDiscardSeatLegacyMode;
    window.doesCpuDiscardSeatUseExternalDecision = doesCpuDiscardSeatUseExternalDecision;
    window.doesCpuDiscardSeatUseInternalEval = doesCpuDiscardSeatUseInternalEval;
    window.doesCpuDiscardSeatUseLegacyPolicy = doesCpuDiscardSeatUseLegacyPolicy;
  }
}catch(e){}
