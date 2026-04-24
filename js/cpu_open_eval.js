// MBsanma/js/cpu_open_eval.js
// ========= cpu_open_eval.js（CPU副露評価器 / 影武者） =========
// 役割：
// - CPU副露候補snapshotを採点して、内部AIなら何を選ぶかを返す
// - まだ実行はしない。外部AIの教師役と比較するための「影武者」
// - プロファイル差し替えで、守備寄り / 速度寄り / 打点寄り を変えられるようにする
//
// 注意：
// - ここでは render を触らない
// - 状態変更はしない

function getCpuOpenEvalProfile(snapshot, profileOverride){
  if (profileOverride && typeof profileOverride === "object"){
    return {
      key: String(profileOverride.key || "custom"),
      ...profileOverride
    };
  }

  if (typeof profileOverride === "string" && profileOverride.trim()){
    return (typeof getCpuOpenProfile === "function")
      ? getCpuOpenProfile(profileOverride.trim())
      : null;
  }

  const seatIndex = snapshot && snapshot.candidateSeatIndex;
  if (typeof getCpuOpenSeatProfile === "function"){
    return getCpuOpenSeatProfile(seatIndex);
  }

  return (typeof getCpuOpenProfile === "function")
    ? getCpuOpenProfile("balanced")
    : null;
}

function getCpuOpenEvalHints(snapshot, action){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const analysis = snapshot && snapshot.callAnalysis && typeof snapshot.callAnalysis === "object"
    ? (action === "pon" ? snapshot.callAnalysis.pon : action === "minkan" ? snapshot.callAnalysis.minkan : null)
    : null;

  const out = [];
  const push = (name)=>{
    if (typeof name !== "string" || !name) return;
    if (!out.includes(name)) out.push(name);
  };

  if (Array.isArray(selfInfo.valuePlanHints)){
    for (const hint of selfInfo.valuePlanHints) push(hint);
  }
  if (analysis && Array.isArray(analysis.valuePlanHintsAfterCall)){
    for (const hint of analysis.valuePlanHintsAfterCall) push(hint);
  }

  return out;
}

function hasCpuOpenEvalHint(hints, name){
  return Array.isArray(hints) && hints.includes(name);
}

function clampCpuOpenEval(value, min, max){
  const n = Number(value) || 0;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function pushCpuOpenEvalPart(parts, key, score, note){
  const n = Number(score) || 0;
  if (!Number.isFinite(n) || n === 0) return;
  parts.push({ key, score: n, note: note || "" });
}

function sumCpuOpenEvalParts(parts){
  if (!Array.isArray(parts)) return 0;
  let total = 0;
  for (const part of parts){
    total += Number(part && part.score) || 0;
  }
  return Math.round(total * 100) / 100;
}

function getCpuOpenEvalProfileNumber(profile, key, fallback){
  if (profile && Number.isFinite(profile[key])) return Number(profile[key]);
  return Number(fallback) || 0;
}

function getCpuOpenVerifyTuning(){
  try{
    if (typeof getCpuVerifyTuning === "function"){
      const tuning = getCpuVerifyTuning();
      if (tuning && tuning.enabled && tuning.open && typeof tuning.open === "object"){
        return tuning.open;
      }
    }
  }catch(e){}
  return null;
}

function getCpuOpenPlacement(snapshot, seatIndex){
  const scores = Array.isArray(snapshot && snapshot.scores) ? snapshot.scores.map((score)=> Number(score) || 0) : [];
  if (!scores.length || !Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= scores.length) return null;
  const order = scores
    .map((score, index)=> ({ score, index }))
    .sort((a, b)=> (b.score - a.score) || (a.index - b.index));
  const pos = order.findIndex((item)=> item.index === seatIndex);
  return pos >= 0 ? (pos + 1) : null;
}

function getCpuOpenRoundPhase(snapshot){
  const tilesLeft = snapshot && snapshot.round ? (Number(snapshot.round.tilesLeftInWall) || 0) : 0;
  if (tilesLeft <= 0) return "unknown";
  if (tilesLeft <= 18) return "end";
  if (tilesLeft <= 36) return "late";
  if (tilesLeft <= 58) return "mid";
  return "early";
}

function buildCpuOpenTableContext(snapshot){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const seatIndex = snapshot && Number.isInteger(snapshot.candidateSeatIndex) ? snapshot.candidateSeatIndex : null;
  const placement = getCpuOpenPlacement(snapshot, seatIndex);
  const tuning = getCpuOpenVerifyTuning();
  const clamp = (value)=> Math.max(-3, Math.min(3, Number(value) || 0));
  return {
    placement,
    phase: getCpuOpenRoundPhase(snapshot),
    isTop: placement === 1,
    isLast: placement === 3,
    isDealer: !!selfInfo.isDealer,
    currentShanten: Number.isFinite(selfInfo.currentShanten) ? Number(selfInfo.currentShanten) : null,
    anyRiichi: !!(snapshot && snapshot.table && snapshot.table.anyRiichi),
    callAggressionBias: clamp(tuning && tuning.callAggressionBias),
    speedBias: clamp(tuning && tuning.speedBias),
    valueBias: clamp(tuning && tuning.valueBias),
    defenseBias: clamp(tuning && tuning.defenseBias)
  };
}

function hasCpuOpenPonValueReason(analysis, hints){
  return !!(analysis && (
    analysis.discardedTileIsYakuhaiForSelf ||
    analysis.keepsTenpai
  ))
    || hasCpuOpenEvalHint(hints, "honitsu_like")
    || hasCpuOpenEvalHint(hints, "toitoi_like")
    || hasCpuOpenEvalHint(hints, "tanyao_like");
}

function hasCpuOpenPonSpeedReason(analysis){
  return !!(analysis && (
    analysis.advancesShanten ||
    analysis.keepsTenpai
  ));
}

function hasCpuOpenMinkanValueReason(analysis, hints){
  return !!(analysis && (
    analysis.discardedTileIsYakuhaiForSelf ||
    analysis.keepsTenpai
  ))
    || hasCpuOpenEvalHint(hints, "honitsu_like")
    || hasCpuOpenEvalHint(hints, "toitoi_like");
}

function hasCpuOpenMinkanSpeedReason(analysis){
  return !!(analysis && (
    analysis.advancesShanten ||
    analysis.keepsTenpai
  ));
}

function estimateCpuOpenPostCallValue(analysis, hints){
  const out = {
    score: 0,
    flags: []
  };
  const push = (flag)=>{
    if (typeof flag !== "string" || !flag) return;
    if (!out.flags.includes(flag)) out.flags.push(flag);
  };

  if (analysis && analysis.discardedTileIsYakuhaiForSelf){
    out.score += 2.2;
    push("yakuhai");
  }
  if (hasCpuOpenEvalHint(hints, "honitsu_like")){
    out.score += 2.2;
    push("honitsu_like");
  }
  if (hasCpuOpenEvalHint(hints, "toitoi_like")){
    out.score += 1.2;
    push("toitoi_like");
  }
  if (hasCpuOpenEvalHint(hints, "tanyao_like")){
    out.score += 0.8;
    push("tanyao_like");
  }
  if (analysis && analysis.keepsTenpai){
    out.score += 0.7;
    push("tenpai");
  }
  if (analysis && Number(analysis.tenpaiWaitTypeCountAfter) >= 2){
    out.score += 0.5;
    push("multi_wait");
  }

  return out;
}

function getCpuOpenWaitQualityPenalty(analysis){
  if (!analysis) return 0;
  const waitTypeCount = Number(analysis.tenpaiWaitTypeCountAfter) || 0;
  const improveCount = Number(analysis.improveCountAfter) || 0;
  if (waitTypeCount <= 0) return 0;
  if (waitTypeCount <= 1 && improveCount <= 4) return 1.8;
  if (waitTypeCount <= 1 && improveCount <= 8) return 1.0;
  return 0;
}

function inferCpuOpenEvalReasonTags(snapshot, action, hints, analysis, tableInfo){
  const out = [];
  const push = (tag)=>{
    if (typeof tag !== "string" || !tag) return;
    if (!out.includes(tag)) out.push(tag);
  };

  if (action === "pass"){
    if (tableInfo.anyRiichi && !(snapshot && snapshot.self && snapshot.self.riichi)){
      push("riichi_danger_pass");
    }
    if (!analysis || (!analysis.discardedTileIsYakuhaiForSelf && !hasCpuOpenEvalHint(hints, "honitsu_like") && !hasCpuOpenEvalHint(hints, "toitoi_like") && !hasCpuOpenEvalHint(hints, "tanyao_like") && !analysis.advancesShanten && !analysis.keepsTenpai)){
      push("no_value_pass");
    }
    if (out.length <= 0 && analysis && analysis.advancesShanten){
      push("close_call_pass");
    }
    if (out.length <= 0){
      push("pass_eval");
    }
    return out;
  }

  if (action === "pon"){
    const hasValueReason = hasCpuOpenPonValueReason(analysis, hints);
    if (analysis && analysis.discardedTileIsYakuhaiForSelf){
      push(analysis.keepsTenpai ? "yakuhai_tenpai" : "yakuhai_speed");
    }
    if (hasCpuOpenEvalHint(hints, "honitsu_like")) push("honitsu_speed");
    if (hasCpuOpenEvalHint(hints, "toitoi_like")) push("toitoi_speed");
    if (hasCpuOpenEvalHint(hints, "tanyao_like")) push("tanyao_speed");
    if (analysis && analysis.keepsTenpai) push("tenpai_keep");
    if (analysis && analysis.advancesShanten){
      push(hasValueReason ? "shanten_up_value" : "shanten_up_only");
    }
    if (analysis && Number(analysis.improveDropAfterBestDiscard) >= 4){
      push("postcall_efficiency_drop");
    }
    if (out.length <= 0) push("call_push");
    return out;
  }

  if (action === "minkan"){
    if (analysis && analysis.keepsTenpai) push("minkan_tenpai");
    if (analysis && analysis.discardedTileIsYakuhaiForSelf) push("minkan_yakuhai");
    if (hasCpuOpenEvalHint(hints, "honitsu_like") || hasCpuOpenEvalHint(hints, "toitoi_like")) push("minkan_value");
    if (out.length <= 0) push("minkan_push");
    return out;
  }

  push("eval_decision");
  return out;
}

function evaluateCpuOpenPass(snapshot, profile){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const context = buildCpuOpenTableContext(snapshot);
  const ponAnalysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.pon : null;
  const minkanAnalysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.minkan : null;
  const parts = [];

  pushCpuOpenEvalPart(parts, "pass_base", profile.passBase);

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_bonus", profile.riichiDangerPassBonus);
  }

  if ((selfInfo.currentShanten | 0) >= 2){
    pushCpuOpenEvalPart(parts, "far_shanten_bonus", profile.farShantenPassBonus);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_bonus", profile.topScorePassBonus);
  }

  const ponHints = getCpuOpenEvalHints(snapshot, "pon");
  const hasPonValue = hasCpuOpenPonValueReason(ponAnalysis, ponHints);

  const minkanHints = getCpuOpenEvalHints(snapshot, "minkan");
  const hasMinkanValue = hasCpuOpenMinkanValueReason(minkanAnalysis, minkanHints);

  if (!hasPonValue && !hasMinkanValue){
    pushCpuOpenEvalPart(parts, "no_value_bonus", profile.noValuePassBonus);
  }

  if (context.anyRiichi && context.phase !== "early"){
    pushCpuOpenEvalPart(parts, "late_riichi_pass_bonus", getCpuOpenEvalProfileNumber(profile, "riichiDangerPassBonus", 5) * 0.18);
  }
  if (context.isTop){
    pushCpuOpenEvalPart(parts, "top_guard_pass_bonus", getCpuOpenEvalProfileNumber(profile, "topScorePassBonus", 1) * 0.8);
  }
  if (context.isLast && (context.currentShanten === 0 || context.currentShanten === 1)){
    pushCpuOpenEvalPart(parts, "last_push_pass_penalty", -0.9);
  }
  if (context.defenseBias > 0){
    pushCpuOpenEvalPart(parts, "tuning_defense_pass_bonus", context.defenseBias * 0.65);
  }
  if (context.callAggressionBias > 0){
    pushCpuOpenEvalPart(parts, "tuning_aggression_pass_penalty", -(context.callAggressionBias * 0.55));
  }

  return {
    action: "pass",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "pass", [], null, tableInfo)
  };
}

function evaluateCpuOpenPon(snapshot, profile){
  const legal = !!(snapshot && snapshot.legalActions && snapshot.legalActions.pon);
  const policyLegal = !snapshot || !snapshot.currentPolicyDecision || snapshot.currentPolicyDecision.pon !== false;
  if (!legal || !policyLegal){
    return {
      action: "pon",
      legal: false,
      score: null,
      parts: [],
      reasonTags: []
    };
  }

  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const context = buildCpuOpenTableContext(snapshot);
  const analysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.pon : null;
  const hints = getCpuOpenEvalHints(snapshot, "pon");
  const parts = [];
  const postCallValue = estimateCpuOpenPostCallValue(analysis, hints);
  const speedScale = Math.max(0.7, Math.min(1.5, 1 + (context.speedBias * 0.12) + (context.callAggressionBias * 0.06)));
  const valueScale = Math.max(0.7, Math.min(1.6, 1 + (context.valueBias * 0.12)));
  const defenseScale = Math.max(0.7, Math.min(1.8, 1 + (context.defenseBias * 0.14) + (context.isTop ? 0.08 : 0) - (context.isLast ? 0.08 : 0)));

  pushCpuOpenEvalPart(parts, "pon_base", profile.ponBase);

  if (analysis && analysis.discardedTileIsYakuhaiForSelf){
    pushCpuOpenEvalPart(parts, "yakuhai_bonus", profile.ponYakuhaiBonus * valueScale);
  }
  const hasValueReason = hasCpuOpenPonValueReason(analysis, hints);
  const hasSpeedReason = hasCpuOpenPonSpeedReason(analysis);

  if (analysis && analysis.keepsTenpai){
    pushCpuOpenEvalPart(parts, "tenpai_keep_bonus", profile.ponTenpaiKeepBonus * speedScale);
  }
  if (analysis && analysis.advancesShanten){
    const shantenAdvanceBonus = hasValueReason
      ? profile.ponShantenAdvanceBonus
      : profile.ponShantenAdvanceBonus * 0.45;
    pushCpuOpenEvalPart(parts, "shanten_up_bonus", shantenAdvanceBonus * speedScale);
  }
  if (analysis && analysis.worsensShanten){
    pushCpuOpenEvalPart(parts, "worsen_penalty", -profile.ponWorsenPenalty);
  }

  if (analysis){
    pushCpuOpenEvalPart(parts, "improve_factor", clampCpuOpenEval(analysis.improveCountAfter, 0, 20) * profile.ponImproveCountFactor * speedScale);
    pushCpuOpenEvalPart(parts, "wait_factor", clampCpuOpenEval(analysis.tenpaiWaitTypeCountAfter, 0, 6) * profile.ponWaitTypeFactor);
  }

  const hasHonitsuHint = hasCpuOpenEvalHint(hints, "honitsu_like");
  if (hasHonitsuHint) pushCpuOpenEvalPart(parts, "honitsu_bonus", (profile.ponHonitsuBonus * 1.35) * valueScale);
  if (hasCpuOpenEvalHint(hints, "toitoi_like")) pushCpuOpenEvalPart(parts, "toitoi_bonus", profile.ponToitoiBonus * valueScale);
  if (hasCpuOpenEvalHint(hints, "tanyao_like")) pushCpuOpenEvalPart(parts, "tanyao_bonus", profile.ponTanyaoBonus * valueScale);
  if (hasCpuOpenEvalHint(hints, "already_open")) pushCpuOpenEvalPart(parts, "already_open_bonus", profile.ponAlreadyOpenBonus);
  if (selfInfo.isDealer) pushCpuOpenEvalPart(parts, "dealer_bonus", profile.ponDealerBonus + (context.isDealer ? 0.45 : 0));

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_penalty", -profile.ponRiichiDangerPenalty * defenseScale);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_penalty", -profile.ponTopScorePenalty);
  }

  const currentShanten = Number(selfInfo.currentShanten);

  if (!hasValueReason){
    pushCpuOpenEvalPart(parts, "no_value_penalty", -profile.ponNoValuePenalty * valueScale);
  }

  if (!hasValueReason && hasSpeedReason){
    pushCpuOpenEvalPart(parts, "speed_only_penalty", -(profile.ponSpeedOnlyPenalty || 0));
  }

  if (Number.isFinite(currentShanten) && currentShanten >= 2 && !hasValueReason){
    pushCpuOpenEvalPart(parts, "far_shanten_penalty", -profile.ponFarShantenPenalty);
  }

  if (context.isLast && (analysis && (analysis.keepsTenpai || analysis.advancesShanten))){
    pushCpuOpenEvalPart(parts, "last_place_push_bonus", 1.1 + (context.callAggressionBias * 0.25));
  }
  if (hasHonitsuHint && analysis && (analysis.keepsTenpai || analysis.advancesShanten)){
    pushCpuOpenEvalPart(parts, "honitsu_speed_bonus", 1.8 + (context.callAggressionBias * 0.18));
  }
  if (hasHonitsuHint && analysis && analysis.discardedTileIsYakuhaiForSelf){
    pushCpuOpenEvalPart(parts, "honitsu_yakuhai_bonus", 1.6 * valueScale);
  }
  if (hasHonitsuHint && selfInfo && !selfInfo.riichi && !(tableInfo.anyRiichi && !context.isLast)){
    pushCpuOpenEvalPart(parts, "honitsu_forward_bonus", 1.2);
  }
  if (context.isTop && tableInfo.anyRiichi){
    pushCpuOpenEvalPart(parts, "top_guard_penalty", -0.9);
  }
  if (context.phase === "late" || context.phase === "end"){
    if (!hasValueReason && !(analysis && analysis.keepsTenpai)){
      pushCpuOpenEvalPart(parts, "late_call_quality_penalty", -0.8);
    }
  }
  if (postCallValue.score <= 0.8 && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "thin_value_penalty", -1.0);
  }
  if (postCallValue.score >= 2.4){
    pushCpuOpenEvalPart(parts, "postcall_value_bonus", Math.min(2.8, postCallValue.score * 0.65));
  }
  const waitQualityPenalty = getCpuOpenWaitQualityPenalty(analysis);
  if (waitQualityPenalty > 0){
    pushCpuOpenEvalPart(parts, "bad_wait_penalty", -waitQualityPenalty);
  }

  if (analysis && analysis.sameTileDiscardWouldBeBest){
    pushCpuOpenEvalPart(
      parts,
      "same_tile_postcall_penalty",
      -getCpuOpenEvalProfileNumber(profile, "ponSameTilePostcallPenalty", 1.25)
    );
  }

  if (analysis){
    const improveDrop = Math.max(0, Number(analysis.improveDropAfterBestDiscard) || 0);
    const keepRate = Number.isFinite(analysis.improveKeepRateAfterBestDiscard)
      ? Number(analysis.improveKeepRateAfterBestDiscard)
      : null;
    const dropThreshold = getCpuOpenEvalProfileNumber(profile, "ponEfficiencyDropThreshold", 5);
    const largeDropThreshold = getCpuOpenEvalProfileNumber(profile, "ponLargeEfficiencyDropThreshold", 8);
    const keepRateThreshold = getCpuOpenEvalProfileNumber(profile, "ponEfficiencyKeepRateThreshold", 0.55);

    if (improveDrop >= dropThreshold){
      pushCpuOpenEvalPart(
        parts,
        "efficiency_drop_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponEfficiencyDropPenalty", 1.2),
        `drop=${improveDrop}`
      );
    }

    if (improveDrop >= largeDropThreshold){
      pushCpuOpenEvalPart(
        parts,
        "large_efficiency_drop_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponLargeEfficiencyDropPenalty", 2.0),
        `drop=${improveDrop}`
      );
    }

    if (keepRate != null && keepRate <= keepRateThreshold && improveDrop >= Math.max(2, dropThreshold - 1)){
      pushCpuOpenEvalPart(
        parts,
        "low_efficiency_keep_rate_penalty",
        -getCpuOpenEvalProfileNumber(profile, "ponEfficiencyKeepRatePenalty", 0.9),
        `keepRate=${keepRate}`
      );
    }
  }
  if (analysis && analysis.bestDiscardAfterCall && analysis.bestDiscardAfterCall.shantenAfterDiscard > 0 && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "postcall_non_tenpai_penalty", -1.1);
  }

  return {
    action: "pon",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "pon", hints, analysis, tableInfo)
  };
}

function evaluateCpuOpenMinkan(snapshot, profile){
  const legal = !!(snapshot && snapshot.legalActions && snapshot.legalActions.minkan);
  const policyLegal = !snapshot || !snapshot.currentPolicyDecision || snapshot.currentPolicyDecision.minkan !== false;
  if (!legal || !policyLegal){
    return {
      action: "minkan",
      legal: false,
      score: null,
      parts: [],
      reasonTags: []
    };
  }

  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === "object" ? snapshot.self : {};
  const tableInfo = snapshot && snapshot.table && typeof snapshot.table === "object" ? snapshot.table : {};
  const context = buildCpuOpenTableContext(snapshot);
  const analysis = snapshot && snapshot.callAnalysis ? snapshot.callAnalysis.minkan : null;
  const hints = getCpuOpenEvalHints(snapshot, "minkan");
  const parts = [];
  const postCallValue = estimateCpuOpenPostCallValue(analysis, hints);
  const speedScale = Math.max(0.7, Math.min(1.5, 1 + (context.speedBias * 0.12) + (context.callAggressionBias * 0.05)));
  const valueScale = Math.max(0.7, Math.min(1.6, 1 + (context.valueBias * 0.12)));
  const defenseScale = Math.max(0.75, Math.min(1.9, 1 + (context.defenseBias * 0.16) + (context.isTop ? 0.10 : 0) - (context.isLast ? 0.08 : 0)));

  pushCpuOpenEvalPart(parts, "minkan_base", profile.minkanBase);

  if (analysis && analysis.discardedTileIsYakuhaiForSelf){
    pushCpuOpenEvalPart(parts, "yakuhai_bonus", profile.minkanYakuhaiBonus * valueScale);
  }
  const hasValueReason = hasCpuOpenMinkanValueReason(analysis, hints);
  const hasSpeedReason = hasCpuOpenMinkanSpeedReason(analysis);

  if (analysis && analysis.keepsTenpai){
    pushCpuOpenEvalPart(parts, "tenpai_keep_bonus", profile.minkanTenpaiKeepBonus * speedScale);
  }
  if (analysis && analysis.advancesShanten){
    const shantenAdvanceBonus = hasValueReason
      ? profile.minkanShantenAdvanceBonus
      : profile.minkanShantenAdvanceBonus * 0.45;
    pushCpuOpenEvalPart(parts, "shanten_up_bonus", shantenAdvanceBonus * speedScale);
  }
  if (analysis && analysis.worsensShanten){
    pushCpuOpenEvalPart(parts, "worsen_penalty", -profile.minkanWorsenPenalty);
  }

  if (analysis){
    pushCpuOpenEvalPart(parts, "improve_factor", clampCpuOpenEval(analysis.improveCountAfter, 0, 20) * profile.minkanImproveCountFactor * speedScale);
    pushCpuOpenEvalPart(parts, "wait_factor", clampCpuOpenEval(analysis.tenpaiWaitTypeCountAfter, 0, 6) * profile.minkanWaitTypeFactor);
  }

  const hasHonitsuHint = hasCpuOpenEvalHint(hints, "honitsu_like");
  if (hasHonitsuHint) pushCpuOpenEvalPart(parts, "honitsu_bonus", (profile.minkanHonitsuBonus * 1.25) * valueScale);
  if (hasCpuOpenEvalHint(hints, "toitoi_like")) pushCpuOpenEvalPart(parts, "toitoi_bonus", profile.minkanToitoiBonus * valueScale);
  if (!hasCpuOpenEvalHint(hints, "already_open")) pushCpuOpenEvalPart(parts, "closed_hand_penalty", -profile.minkanClosedHandPenalty);

  if (tableInfo.anyRiichi && !selfInfo.riichi){
    pushCpuOpenEvalPart(parts, "riichi_danger_penalty", -profile.minkanRiichiDangerPenalty * defenseScale);
  }

  const score = Number(selfInfo.score) || 0;
  const topScore = Array.isArray(snapshot && snapshot.scores)
    ? Math.max(...snapshot.scores.map((v)=> Number(v) || 0))
    : score;
  if (score >= topScore && topScore > 0){
    pushCpuOpenEvalPart(parts, "top_score_penalty", -profile.minkanTopScorePenalty);
  }

  if (!hasValueReason){
    pushCpuOpenEvalPart(parts, "no_value_penalty", -profile.minkanNoValuePenalty * valueScale);
  }

  if (!hasValueReason && hasSpeedReason){
    pushCpuOpenEvalPart(parts, "speed_only_penalty", -(profile.minkanSpeedOnlyPenalty || 0));
  }

  if (!profile.allowLooseMinkan && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "strict_minkan_penalty", -1.2);
  }

  if (context.isTop && tableInfo.anyRiichi){
    pushCpuOpenEvalPart(parts, "top_guard_penalty", -1.1);
  }
  if (context.isLast && analysis && analysis.keepsTenpai){
    pushCpuOpenEvalPart(parts, "last_place_push_bonus", 0.9 + (context.callAggressionBias * 0.22));
  }
  if (hasHonitsuHint && analysis && analysis.keepsTenpai && !tableInfo.anyRiichi){
    pushCpuOpenEvalPart(parts, "honitsu_minkan_push_bonus", 1.0 + (context.callAggressionBias * 0.16));
  }
  if (context.phase === "late" || context.phase === "end"){
    if (!(analysis && analysis.keepsTenpai)){
      pushCpuOpenEvalPart(parts, "late_minkan_quality_penalty", -0.9);
    }
  }
  if (tableInfo.anyRiichi && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "riichi_table_minkan_penalty", -1.4);
  }
  if (Array.isArray(tableInfo.riichiSeatIndexes) && tableInfo.riichiSeatIndexes.length >= 2){
    pushCpuOpenEvalPart(parts, "multi_riichi_minkan_penalty", -2.1);
  }
  if (context.isTop && !context.isDealer){
    pushCpuOpenEvalPart(parts, "top_nondealer_minkan_penalty", -0.8);
  }
  if (postCallValue.score <= 0.8 && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "thin_value_penalty", -1.2);
  }
  if (postCallValue.score >= 2.6){
    pushCpuOpenEvalPart(parts, "postcall_value_bonus", Math.min(2.4, postCallValue.score * 0.55));
  }
  const waitQualityPenalty = getCpuOpenWaitQualityPenalty(analysis);
  if (waitQualityPenalty > 0){
    pushCpuOpenEvalPart(parts, "bad_wait_penalty", -(waitQualityPenalty + 0.2));
  }
  if (tableInfo.anyRiichi && analysis && analysis.keepsTenpai && Number(analysis.tenpaiWaitTypeCountAfter) <= 1 && postCallValue.score < 2.2){
    pushCpuOpenEvalPart(parts, "riichi_single_wait_penalty", -1.6);
  }
  if (context.phase === "end" && analysis && analysis.keepsTenpai && Number(analysis.tenpaiWaitTypeCountAfter) <= 1){
    pushCpuOpenEvalPart(parts, "endgame_single_wait_penalty", -1.2);
  }
  if (analysis && analysis.bestDiscardAfterCall && analysis.bestDiscardAfterCall.shantenAfterDiscard > 0 && !(analysis && analysis.keepsTenpai)){
    pushCpuOpenEvalPart(parts, "postcall_non_tenpai_penalty", -1.3);
  }
  if (hasHonitsuHint && !(analysis && (analysis.keepsTenpai || analysis.advancesShanten))){
    pushCpuOpenEvalPart(parts, "honitsu_no_speed_penalty", -0.8);
  }

  return {
    action: "minkan",
    legal: true,
    score: sumCpuOpenEvalParts(parts),
    parts,
    reasonTags: inferCpuOpenEvalReasonTags(snapshot, "minkan", hints, analysis, tableInfo)
  };
}

function compareCpuOpenEvalEntries(a, b){
  const aScore = (a && Number.isFinite(a.score)) ? a.score : -999999;
  const bScore = (b && Number.isFinite(b.score)) ? b.score : -999999;
  if (aScore !== bScore) return bScore - aScore;

  const rank = { pass: 0, pon: 1, minkan: 2 };
  const aRank = rank[a && a.action] != null ? rank[a.action] : 99;
  const bRank = rank[b && b.action] != null ? rank[b.action] : 99;
  return aRank - bRank;
}

function evaluateCpuOpenCallSnapshot(snapshot, profileOverride = null){
  if (!snapshot || typeof snapshot !== "object") return null;

  const profile = getCpuOpenEvalProfile(snapshot, profileOverride);
  if (!profile) return null;

  const passEntry = evaluateCpuOpenPass(snapshot, profile);
  const ponEntry = evaluateCpuOpenPon(snapshot, profile);
  const minkanEntry = evaluateCpuOpenMinkan(snapshot, profile);

  const entries = [passEntry, ponEntry, minkanEntry];
  const legalEntries = entries.filter((entry)=> entry && (entry.action === "pass" || entry.legal));
  legalEntries.sort(compareCpuOpenEvalEntries);

  const best = legalEntries[0] || passEntry;
  const reasonTags = Array.isArray(best.reasonTags) ? best.reasonTags.slice() : [];

  return {
    kind: "cpuOpenShadowEval",
    engine: "cpu_open_eval_v1",
    snapshotId: snapshot.snapshotId,
    seatIndex: snapshot.candidateSeatIndex,
    profileKey: profile.key || (typeof getCpuOpenSeatProfileKey === "function" ? getCpuOpenSeatProfileKey(snapshot.candidateSeatIndex) : "balanced"),
    profileLabel: profile.label || profile.key || "Profile",
    action: best.action,
    reasonTag: reasonTags[0] || "",
    reasonTags,
    scores: {
      pass: passEntry.score,
      pon: ponEntry.legal ? ponEntry.score : null,
      minkan: minkanEntry.legal ? minkanEntry.score : null
    },
    breakdown: {
      pass: passEntry.parts,
      pon: ponEntry.parts,
      minkan: minkanEntry.parts
    },
    legalActions: {
      pon: !!(snapshot.legalActions && snapshot.legalActions.pon),
      minkan: !!(snapshot.legalActions && snapshot.legalActions.minkan)
    },
    createdAt: Date.now()
  };
}

function buildCpuOpenShadowDecision(snapshot, profileOverride = null){
  const evalResult = evaluateCpuOpenCallSnapshot(snapshot, profileOverride);
  if (!evalResult) return null;
  return {
    action: evalResult.action,
    note: "internal_shadow_eval",
    reasonTag: evalResult.reasonTag,
    reasonTags: evalResult.reasonTags,
    meta: {
      engine: evalResult.engine,
      profileKey: evalResult.profileKey,
      scores: evalResult.scores
    }
  };
}

function summarizeCpuOpenEvalForMeta(evalResult){
  if (!evalResult || typeof evalResult !== "object") return null;
  return {
    engine: evalResult.engine || "cpu_open_eval_v1",
    profileKey: evalResult.profileKey || "balanced",
    action: evalResult.action || "pass",
    reasonTag: evalResult.reasonTag || "",
    reasonTags: Array.isArray(evalResult.reasonTags) ? evalResult.reasonTags.slice() : [],
    scores: evalResult.scores ? { ...evalResult.scores } : null
  };
}

try{
  if (typeof window !== "undefined"){
    window.evaluateCpuOpenCallSnapshot = evaluateCpuOpenCallSnapshot;
    window.buildCpuOpenShadowDecision = buildCpuOpenShadowDecision;
    window.summarizeCpuOpenEvalForMeta = summarizeCpuOpenEvalForMeta;
  }
}catch(e){}
