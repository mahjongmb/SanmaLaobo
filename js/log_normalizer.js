// ========= log_normalizer.js（ログ正規化） =========
// 役割：
// - match_log.js の生イベントを「1アクション1件」へ束ねる
// - 表示用/解析用の最小正規化口を提供する
// - renderや状態変更には触らない

(function(global){
  "use strict";

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function getPayload(event){
    return (event && event.payload && typeof event.payload === "object") ? event.payload : {};
  }

  function formatDateTime(value){
    if (!value) return "—";
    try{
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${y}/${m}/${day} ${hh}:${mm}:${ss}`;
    }catch(e){
      return String(value);
    }
  }

  function getSeatLabel(seatIndex){
    if (seatIndex === 0) return "あなた";
    if (seatIndex === 1) return "右CPU";
    if (seatIndex === 2) return "左CPU";
    return "不明";
  }

  function getRoundLabel(kyoku){
    const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
    const wind = start.roundWind || "?";
    const number = Number(start.roundNumber) || 0;
    const honba = Number(start.honba) || 0;
    return `${wind}${number}局 ${honba}本場`;
  }

  function getSeqLabel(startSeq, endSeq){
    const from = Number(startSeq) || 0;
    const to = Number(endSeq) || 0;
    if (from > 0 && to > 0 && from !== to) return `#${from}-#${to}`;
    return `#${from || to || 0}`;
  }

  function getCpuDecisionStatusText(status){
    const map = {
      decided: "判断",
      selected: "選択",
      executed: "実行",
      decision_rejected: "却下",
      candidate_not_found: "候補なし"
    };
    return map[status] || status || "";
  }

  function getCpuExecutionSourceText(source){
    const map = {
      external: "external",
      internal_eval: "internal",
      internal_eval_fallback: "internal fallback",
      legacy: "legacy"
    };
    return map[source] || source || "";
  }

  function getCpuDiscardDecisionCode(payload){
    if (!payload || typeof payload !== "object") return "";
    return payload.finalDiscardCode || payload.selectedDiscardCode || payload.discardCode || payload.externalDiscardCode || payload.shadowInternalDiscardCode || "";
  }

  function getCpuOpenDecisionAction(payload){
    if (!payload || typeof payload !== "object") return "";
    return payload.finalAction || payload.action || "";
  }

  function buildDefaultEntry(event){
    const payload = getPayload(event);
    const type = event && event.type ? event.type : "event";

    let title = type;
    let detail = "";
    let extra = "";

    if (type === "draw"){
      title = `${getSeatLabel(payload.seatIndex)} ツモ ${payload.tile && payload.tile.code ? payload.tile.code : "?"}`;
      if (payload.source) detail = `source=${payload.source}`;
    }else if (type === "discard"){
      const code = payload.tile && payload.tile.code ? payload.tile.code : (payload.code || "?");
      title = `${getSeatLabel(payload.seatIndex)} 打牌 ${code}`;
    }else if (type === "pei"){
      title = `${getSeatLabel(payload.seatIndex)} 北抜き`;
    }else if (type === "pon"){
      title = `${getSeatLabel(payload.seatIndex)} ポン ${payload.code || (payload.tile && payload.tile.code) || "?"}`;
    }else if (type === "minkan"){
      title = `${getSeatLabel(payload.seatIndex)} 明槓 ${payload.code || (payload.tile && payload.tile.code) || "?"}`;
    }else if (type === "ankan"){
      title = `${getSeatLabel(payload.seatIndex)} 暗槓 ${payload.code || (payload.tile && payload.tile.code) || "?"}`;
    }else if (type === "kakan"){
      title = `${getSeatLabel(payload.seatIndex)} 加槓 ${payload.code || (payload.tile && payload.tile.code) || "?"}`;
    }else if (type === "agari_tsumo"){
      title = `${getSeatLabel(payload.winnerSeatIndex)} ツモ`; 
    }else if (type === "agari_ron"){
      const winners = Array.isArray(payload.winnerSeatIndexes)
        ? payload.winnerSeatIndexes.map(getSeatLabel).join(" / ")
        : getSeatLabel(payload.winnerSeatIndex);
      title = `${winners} ロン`;
    }else if (type === "ryukyoku_exhaustion"){
      title = "山枯れ流局";
    }else if (type === "settlement"){
      const settlement = payload.settlement && typeof payload.settlement === "object" ? payload.settlement : {};
      if (settlement.type === "agari") title = `精算 ${settlement.winType === "tsumo" ? "ツモ" : "ロン"}`;
      else if (settlement.type === "ryukyoku") title = "精算 流局";
      else title = "精算";
      if (Array.isArray(settlement.afterScores)) detail = `after=${settlement.afterScores.join(" / ")}`;
    }else if (type === "cpu_api_bridge_request"){
      title = `API要求 ${payload.kind || ""}`.trim();
      const bits = [];
      if (payload.mode) bits.push(`mode=${payload.mode}`);
      if (payload.endpoint) bits.push(payload.endpoint);
      detail = bits.join(" / ");
    }else if (type === "cpu_api_bridge_response"){
      title = `API応答 ${payload.ok ? "成功" : "失敗"} ${payload.kind || ""}`.trim();
      const bits = [];
      if (payload.mode) bits.push(`mode=${payload.mode}`);
      if (payload.status) bits.push(`status=${payload.status}`);
      if (payload.error) bits.push(`error=${payload.error}`);
      detail = bits.join(" / ");
    }

    return {
      kind: "default",
      title,
      sub: formatDateTime(event && event.at),
      detail,
      extra,
      seqLabel: getSeqLabel(event && event.seq, event && event.seq),
      rawCount: 1,
      seatIndex: payload.seatIndex
    };
  }

  function findNextMatchingApiResponse(events, startIndex, kind){
    for (let i = startIndex; i < events.length; i++){
      const event = events[i];
      if (!event || event.type !== "cpu_api_bridge_response") continue;
      const payload = getPayload(event);
      if (payload.kind === kind) return { event, index: i };
    }
    return null;
  }

  function buildCpuDiscardEntry(bundle){
    const snapshotPayload = getPayload(bundle.snapshot);
    const decisions = safeArray(bundle.decisions);
    const lastDecisionPayload = decisions.length ? getPayload(decisions[decisions.length - 1]) : {};
    const discardPayload = bundle.discardEvent ? getPayload(bundle.discardEvent) : {};
    const apiRequestPayload = bundle.apiRequest ? getPayload(bundle.apiRequest) : {};
    const apiResponsePayload = bundle.apiResponse ? getPayload(bundle.apiResponse) : {};

    const seatLabel = getSeatLabel(snapshotPayload.seatIndex);
    const finalCode = discardPayload.tile && discardPayload.tile.code
      ? discardPayload.tile.code
      : getCpuDiscardDecisionCode(lastDecisionPayload) || "?";

    const title = `${seatLabel} 打牌 ${finalCode}`;
    const bits = [];
    const candidateCount = Number(snapshotPayload.candidateCount) || 0;
    if (candidateCount > 0) bits.push(`${candidateCount}候補`);
    const execText = getCpuExecutionSourceText(lastDecisionPayload.executionSource);
    if (execText) bits.push(execText);
    const statusText = getCpuDecisionStatusText(lastDecisionPayload.status);
    if (statusText) bits.push(statusText);
    if (lastDecisionPayload.shadowAgree === true) bits.push("shadow一致");
    else if (lastDecisionPayload.shadowInternalDiscardCode || lastDecisionPayload.externalDiscardCode) bits.push("shadow差分あり");
    if (bundle.discardEvent) bits.push("実打牌");

    const detailBits = [];
    if (lastDecisionPayload.selectedDiscardCode) detailBits.push(`selected=${lastDecisionPayload.selectedDiscardCode}`);
    if (lastDecisionPayload.shadowInternalDiscardCode) detailBits.push(`shadow=${lastDecisionPayload.shadowInternalDiscardCode}`);
    if (lastDecisionPayload.externalDiscardCode) detailBits.push(`external=${lastDecisionPayload.externalDiscardCode}`);
    if (lastDecisionPayload.reasonTag) detailBits.push(`reason=${lastDecisionPayload.reasonTag}`);

    const extraBits = [];
    if (apiRequestPayload.mode) extraBits.push(`apiReq=${apiRequestPayload.mode}`);
    if (bundle.apiResponse){
      extraBits.push(apiResponsePayload.ok ? "apiRes=ok" : `apiRes=${apiResponsePayload.error || "ng"}`);
    }
    if (decisions.length > 1) extraBits.push(`decision=${decisions.length}件`);

    const atSource = bundle.discardEvent || decisions[decisions.length - 1] || bundle.snapshot;

    return {
      kind: "cpu_discard",
      title,
      sub: `${formatDateTime(atSource && atSource.at)} / ${bits.join(" / ")}`,
      detail: detailBits.join(" / "),
      extra: extraBits.join(" / "),
      seqLabel: getSeqLabel(bundle.startSeq, bundle.endSeq),
      rawCount: Number(bundle.rawCount) || 1,
      seatIndex: snapshotPayload.seatIndex
    };
  }

  function buildCpuOpenEntry(bundle){
    const snapshotPayload = getPayload(bundle.snapshot);
    const decisions = safeArray(bundle.decisions);
    const lastDecisionPayload = decisions.length ? getPayload(decisions[decisions.length - 1]) : {};
    const seatLabel = getSeatLabel(snapshotPayload.candidateSeatIndex);
    const tileCode = snapshotPayload.discardedTile && snapshotPayload.discardedTile.code ? snapshotPayload.discardedTile.code : "?";
    const action = getCpuOpenDecisionAction(lastDecisionPayload) || "pass";
    const title = `${seatLabel} 副露 ${action} (${tileCode})`;

    const acts = [];
    if (snapshotPayload.legalActions && snapshotPayload.legalActions.pon) acts.push("ポン");
    if (snapshotPayload.legalActions && snapshotPayload.legalActions.minkan) acts.push("明槓");

    const bits = [];
    if (acts.length) bits.push(`候補:${acts.join("/")}`);
    const statusText = getCpuDecisionStatusText(lastDecisionPayload.status);
    if (statusText) bits.push(statusText);
    if (lastDecisionPayload.source) bits.push(lastDecisionPayload.source);

    const detailBits = [];
    if (lastDecisionPayload.reasonTag) detailBits.push(`reason=${lastDecisionPayload.reasonTag}`);
    if (lastDecisionPayload.shadowAction) detailBits.push(`shadow=${lastDecisionPayload.shadowAction}`);
    if (Array.isArray(lastDecisionPayload.reasonTags) && lastDecisionPayload.reasonTags.length){
      detailBits.push(`tags=${lastDecisionPayload.reasonTags.join(",")}`);
    }

    const atSource = decisions[decisions.length - 1] || bundle.snapshot;

    return {
      kind: "cpu_open",
      title,
      sub: `${formatDateTime(atSource && atSource.at)} / ${bits.join(" / ")}`,
      detail: detailBits.join(" / "),
      extra: decisions.length > 1 ? `decision=${decisions.length}件` : "",
      seqLabel: getSeqLabel(bundle.startSeq, bundle.endSeq),
      rawCount: Number(bundle.rawCount) || 1,
      seatIndex: snapshotPayload.candidateSeatIndex
    };
  }

  function groupEvents(events){
    const list = safeArray(events);
    const out = [];
    const used = new Set();

    for (let i = 0; i < list.length; i++){
      if (used.has(i)) continue;
      const event = list[i];
      if (!event || typeof event !== "object") continue;
      const payload = getPayload(event);

      if (event.type === "cpu_discard_snapshot"){
        const snapshotId = Number(payload.snapshotId) || null;
        const seatIndex = payload.seatIndex;
        const bundle = {
          snapshot: event,
          decisions: [],
          apiRequest: null,
          apiResponse: null,
          discardEvent: null,
          startSeq: Number(event.seq) || 0,
          endSeq: Number(event.seq) || 0,
          rawCount: 1
        };

        for (let j = i + 1; j < list.length; j++){
          if (used.has(j)) continue;
          const next = list[j];
          if (!next || typeof next !== "object") continue;
          const nextPayload = getPayload(next);

          if (next.type === "cpu_discard_snapshot") break;

          if (next.type === "cpu_discard_decision" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.decisions.push(next);
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            bundle.rawCount += 1;
            used.add(j);
            continue;
          }

          if (next.type === "cpu_api_bridge_request" && nextPayload.kind === "cpuDiscardCandidate" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.apiRequest = next;
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            bundle.rawCount += 1;
            used.add(j);
            const responseMatch = findNextMatchingApiResponse(list, j + 1, "cpuDiscardCandidate");
            if (responseMatch && !used.has(responseMatch.index)){
              bundle.apiResponse = responseMatch.event;
              bundle.endSeq = Number(responseMatch.event.seq) || bundle.endSeq;
              bundle.rawCount += 1;
              used.add(responseMatch.index);
            }
            continue;
          }

          if (next.type === "discard" && nextPayload.seatIndex === seatIndex){
            const expectedCode = bundle.decisions.length ? (getCpuDiscardDecisionCode(getPayload(bundle.decisions[bundle.decisions.length - 1])) || "") : "";
            const actualCode = nextPayload.tile && nextPayload.tile.code ? nextPayload.tile.code : (nextPayload.code || "");
            if (!expectedCode || expectedCode === actualCode){
              bundle.discardEvent = next;
              bundle.endSeq = Number(next.seq) || bundle.endSeq;
              bundle.rawCount += 1;
              used.add(j);
              break;
            }
          }
        }

        out.push(buildCpuDiscardEntry(bundle));
        continue;
      }

      if (event.type === "cpu_open_snapshot"){
        const snapshotId = Number(payload.snapshotId) || null;
        const bundle = {
          snapshot: event,
          decisions: [],
          startSeq: Number(event.seq) || 0,
          endSeq: Number(event.seq) || 0,
          rawCount: 1
        };

        for (let j = i + 1; j < list.length; j++){
          if (used.has(j)) continue;
          const next = list[j];
          if (!next || typeof next !== "object") continue;
          const nextPayload = getPayload(next);

          if (next.type === "cpu_open_snapshot") break;
          if (next.type === "cpu_open_decision" && snapshotId != null && Number(nextPayload.snapshotId) === snapshotId){
            bundle.decisions.push(next);
            bundle.endSeq = Number(next.seq) || bundle.endSeq;
            bundle.rawCount += 1;
            used.add(j);
            continue;
          }
        }

        out.push(buildCpuOpenEntry(bundle));
        continue;
      }

      if (
        event.type === "cpu_discard_decision" ||
        event.type === "cpu_open_decision" ||
        event.type === "cpu_api_bridge_request" ||
        event.type === "cpu_api_bridge_response"
      ){
        continue;
      }

      out.push(buildDefaultEntry(event));
    }

    return out;
  }

  function getKyokuResultText(kyoku){
    const settlement = kyoku && kyoku.settlement && typeof kyoku.settlement === "object" ? kyoku.settlement : null;
    if (!settlement) return "未精算";
    if (settlement.type === "agari"){
      return `${getSeatLabel(settlement.winnerSeatIndex)} ${settlement.winType === "tsumo" ? "ツモ" : "ロン"}`;
    }
    if (settlement.type === "ryukyoku") return "流局";
    return "精算済み";
  }

  function normalizeKyoku(kyoku){
    const rawEvents = safeArray(kyoku && kyoku.events);
    const rows = groupEvents(rawEvents);
    return {
      source: kyoku,
      kyokuId: kyoku && kyoku.kyokuId ? kyoku.kyokuId : "",
      label: getRoundLabel(kyoku),
      resultText: getKyokuResultText(kyoku),
      rawEventCount: rawEvents.length,
      rowCount: rows.length,
      rows
    };
  }

  function normalizeMatch(log){
    const kyokus = safeArray(log && log.kyokus).map(normalizeKyoku);
    const rowCount = kyokus.reduce((sum, kyoku)=> sum + (Number(kyoku.rowCount) || 0), 0);
    const rawEventCount = kyokus.reduce((sum, kyoku)=> sum + (Number(kyoku.rawEventCount) || 0), 0);
    return {
      source: log,
      matchId: log && log.matchId ? log.matchId : "",
      startedAt: log && log.startedAt ? log.startedAt : "",
      session: log && log.session ? log.session : null,
      kyokus,
      kyokuCount: kyokus.length,
      rowCount,
      rawEventCount
    };
  }

  function normalizeStoredLogs(logs){
    return safeArray(logs).filter((item)=> item && typeof item === "object").map(normalizeMatch);
  }

  global.MBSanmaLogNormalizer = {
    formatDateTime,
    getSeatLabel,
    getRoundLabel,
    normalizeKyoku,
    normalizeMatch,
    normalizeStoredLogs
  };
})(window);
