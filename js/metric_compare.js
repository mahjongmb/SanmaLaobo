(function(global){
  "use strict";

  function numberOrNull(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function formatRate(value){
    const n = numberOrNull(value);
    return n == null ? "-" : `${(n * 100).toFixed(1)}%`;
  }

  function formatPoint(value){
    const n = numberOrNull(value);
    return n == null ? "-" : `${Math.round(n).toLocaleString()}点`;
  }

  function formatJunme(value){
    const n = numberOrNull(value);
    return n == null ? "-" : `${n.toFixed(1)}巡目`;
  }

  function formatSignedRate(value){
    const n = numberOrNull(value);
    if (n == null) return "-";
    return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pt`;
  }

  function formatSignedPoint(value){
    const n = numberOrNull(value);
    if (n == null) return "-";
    return `${n >= 0 ? "+" : ""}${Math.round(n).toLocaleString()}点`;
  }

  function formatSignedJunme(value){
    const n = numberOrNull(value);
    if (n == null) return "-";
    return `${n >= 0 ? "+" : ""}${n.toFixed(1)}巡目`;
  }

  function makeRow(label, actual, target, kind, threshold){
    const actualN = numberOrNull(actual);
    const targetN = numberOrNull(target);
    const delta = actualN == null || targetN == null ? null : actualN - targetN;
    const absDelta = delta == null ? null : Math.abs(delta);
    const formatter = kind === "point" ? formatPoint : kind === "junme" ? formatJunme : formatRate;
    const deltaFormatter = kind === "point" ? formatSignedPoint : kind === "junme" ? formatSignedJunme : formatSignedRate;
    const normalized = absDelta == null ? 0 : absDelta / Math.max(Number(threshold) || 1, 0.0001);
    return {
      label,
      actual: actualN,
      target: targetN,
      delta,
      kind,
      score: normalized,
      actualText: formatter(actualN),
      targetText: formatter(targetN),
      deltaText: deltaFormatter(delta)
    };
  }

  function buildSummaryComparison(summary, reference){
    const src = summary && typeof summary === "object" ? summary : {};
    const ref = reference && typeof reference === "object" ? reference : {};
    const overallRef = ref.overall || {};
    const riichiRef = ref.riichi || {};
    const agari = src.agari || {};
    const riichi = src.riichi || {};
    const open = src.open || {};
    const hoju = src.hoju || {};
    const hitByTsumo = src.hitByTsumo || {};
    const horizontal = src.horizontal || {};
    const ryukyoku = src.ryukyoku || {};

    return [
      makeRow("リーチ率", riichi.rate, overallRef.riichiRate, "rate", 0.02),
      makeRow("副露率", open.rate, overallRef.openRate, "rate", 0.02),
      makeRow("和了率", agari.rate, overallRef.agariRate, "rate", 0.02),
      makeRow("放銃率", hoju.rate, overallRef.hojuRate, "rate", 0.015),
      makeRow("被ツモ率", hitByTsumo.rate, overallRef.hitByTsumoRate, "rate", 0.02),
      makeRow("横移動率", horizontal.rate, overallRef.horizontalRate, "rate", 0.02),
      makeRow("流局率", ryukyoku.rate, overallRef.ryukyokuRate, "rate", 0.02),
      makeRow("和了時ツモ割合", agari.tsumoRate, overallRef.agariTsumoRate, "rate", 0.03),
      makeRow("和了時リーチ割合", agari.riichiRate, overallRef.agariRiichiRate, "rate", 0.03),
      makeRow("和了時副露割合", agari.openRate, overallRef.agariOpenRate, "rate", 0.03),
      makeRow("平均打点", agari.averagePoint, overallRef.agariAveragePoint, "point", 500),
      makeRow("リーチ平均巡目", riichi.averageJunme, riichiRef.averageJunme, "junme", 0.8),
      makeRow("リーチ時和了率", agari.riichiAgariRate, riichiRef.agariRate, "rate", 0.03),
      makeRow("リーチ時平均打点", riichi.averagePoint, riichiRef.agariAveragePoint, "point", 500)
    ].filter((row)=> row.actual != null && row.target != null)
      .sort((a, b)=> b.score - a.score);
  }

  global.MBSanmaMetricCompare = {
    buildSummaryComparison,
    formatRate,
    formatPoint,
    formatJunme
  };
})(window);
