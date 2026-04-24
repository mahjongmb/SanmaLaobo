// MBsanma/js/cpu_call_policy.js
// ========= cpu_call_policy.js（CPU副露判断の調整値） =========

const CPU_CALL_POLICY = {
  pon: {
    enabled: true,
    onlyYakuhai: true,
    requireShantenNonWorse: true,
    maxShantenAfterCall: 2,
    minImproveTilesAfterCall: 0
  },
  minkan: {
    enabled: true,
    onlyYakuhai: true,
    requireShantenNonWorse: true,
    maxShantenAfterCall: 2,
    minImproveTilesAfterCall: 0,

    // ===== 明槓の追加条件 =====
    // ・持ち点がこの値以下
    // ・すでに1副露以上している
    // ・テンパイしている
    // ・待ち種類がこの数以上ある
    // ・明槓してもテンパイ維持
    maxScore: 35000,
    requireExistingMeld: true,
    requireTenpaiBeforeCall: true,
    minWaitTypeCountBeforeCall: 3,
    requireTenpaiAfterCall: true
  }
};

const CPU_SEAT_CALL_POLICY = {
  1: {},
  2: {}
};

function getCpuCallPolicy(type, seatIndex){
  const base = (CPU_CALL_POLICY && CPU_CALL_POLICY[type]) ? CPU_CALL_POLICY[type] : {};
  const seatRoot = (CPU_SEAT_CALL_POLICY && CPU_SEAT_CALL_POLICY[seatIndex]) ? CPU_SEAT_CALL_POLICY[seatIndex] : {};

  // 旧形式互換：seat直下に pon 用の設定が平置きされていても拾う
  const legacyFlat = (type === "pon") ? seatRoot : {};
  const typedSeat = (seatRoot && seatRoot[type]) ? seatRoot[type] : {};

  return { ...base, ...legacyFlat, ...typedSeat };
}

function getCpuPonPolicy(seatIndex){
  return getCpuCallPolicy("pon", seatIndex);
}

function getCpuMinkanPolicy(seatIndex){
  return getCpuCallPolicy("minkan", seatIndex);
}
