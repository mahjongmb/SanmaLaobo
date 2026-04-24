(function(){
  "use strict";

  const CURRENT_LOGIN_ACCOUNT_STORAGE_KEY = "mbsanma_app_current_login_account_v1";
  const ACTIVE_SESSION_STORAGE_KEY = "mbsanma_app_active_session_v1";
  const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "mbsanma_visitor_active_session_v1";

  const replayAccountBadge = document.getElementById("replayAccountBadge");
  const matchSummaryCard = document.getElementById("matchSummaryCard");
  const kyokuSelect = document.getElementById("kyokuSelect");
  const speedSelect = document.getElementById("speedSelect");
  const stepRange = document.getElementById("stepRange");
  const firstStepBtn = document.getElementById("firstStepBtn");
  const prevStepBtn = document.getElementById("prevStepBtn");
  const playToggleBtn = document.getElementById("playToggleBtn");
  const nextStepBtn = document.getElementById("nextStepBtn");
  const lastStepBtn = document.getElementById("lastStepBtn");
  const stepMeta = document.getElementById("stepMeta");
  const currentCard = document.getElementById("currentCard");
  const startInfoList = document.getElementById("startInfoList");
  const trailList = document.getElementById("trailList");
  const eventLogList = document.getElementById("eventLogList");

  const state = {
    match: null,
    kyokuIndex: 0,
    stepIndex: 0,
    playTimer: 0,
    isPlaying: false
  };

  function normalizeAccountId(value){
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function loadSessionLabel(){
    const keys = [ACTIVE_SESSION_STORAGE_KEY, LEGACY_ACTIVE_SESSION_STORAGE_KEY];
    for (const key of keys){
      try{
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.mode === "account" && parsed.accountId) return normalizeAccountId(parsed.accountId);
        if (parsed && parsed.mode === "local") return "ローカル";
      }catch(e){}
    }
    try{
      const loginId = normalizeAccountId(localStorage.getItem(CURRENT_LOGIN_ACCOUNT_STORAGE_KEY) || "");
      if (loginId) return loginId;
    }catch(e){}
    return "ローカル";
  }

  function formatDateTime(value){
    try{
      const api = window.MBSanmaLogNormalizer;
      if (api && typeof api.formatDateTime === "function") return api.formatDateTime(value);
    }catch(e){}
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
  }

  function getSeatLabel(seatIndex){
    if (seatIndex === 0) return "あなた";
    if (seatIndex === 1) return "右CPU";
    if (seatIndex === 2) return "左CPU";
    return "不明";
  }

  function getMatchModeText(log){
    const raw = String(log && log.meta && log.meta.matchMode || "").toLowerCase();
    if (raw === "cpu_batch" || raw === "batch") return "検証モード";
    if (raw === "app_play" || raw === "normal" || raw === "manual") return "対局モード";
    return "未分類";
  }

  function getTileColorKey(tile){
    if (!tile || typeof tile !== "object") return "";
    if (typeof tile.colorKey === "string" && tile.colorKey) return tile.colorKey;
    const imgCode = String(tile.imgCode || tile.code || "");
    if (imgCode.length >= 3 && ["r", "b", "g", "n"].includes(imgCode[0])) return imgCode[0];
    return tile.isRed ? "r" : "";
  }

  function getTileColorLabel(tile){
    const map = { r: "赤", b: "青", g: "金", n: "虹" };
    return map[getTileColorKey(tile)] || "";
  }

  function tileText(tile){
    if (!tile || typeof tile !== "object") return "—";
    const code = tile.imgCode || tile.code || "—";
    const colorLabel = getTileColorLabel(tile);
    return colorLabel ? `${code}(${colorLabel})` : code;
  }

  function tileArrayText(list){
    return Array.isArray(list) && list.length ? list.map(tileText).join(" ") : "—";
  }

  function scoreArrayText(list){
    return Array.isArray(list) && list.length ? list.map((v)=> (Number(v) || 0).toLocaleString("ja-JP")).join(" / ") : "—";
  }

  function getQueryMatchId(){
    try{
      const url = new URL(location.href);
      return String(url.searchParams.get("matchId") || "");
    }catch(e){
      return "";
    }
  }

  async function getCompletedLogsAsync(){
    try{
      if (window.MBSanmaMatchLog){
        let logs = [];
        if (typeof window.MBSanmaMatchLog.getStoredLogsAsync === "function"){
          logs = await window.MBSanmaMatchLog.getStoredLogsAsync();
        } else if (typeof window.MBSanmaMatchLog.getStoredLogs === "function"){
          logs = window.MBSanmaMatchLog.getStoredLogs();
        }
        return Array.isArray(logs)
          ? logs.filter((item)=> {
              if (!item || typeof item !== "object" || !item.endedAt) return false;
              const matchMode = String(item && item.meta && item.meta.matchMode || "").toLowerCase();
              return matchMode === "app_play" || matchMode === "normal" || matchMode === "manual";
            })
          : [];
      }
    }catch(e){}
    return [];
  }

  async function loadTargetMatch(){
    const normalizer = window.MBSanmaLogNormalizer;
    const logs = await getCompletedLogsAsync();
    const targetId = getQueryMatchId();
    const raw = logs.find((item)=> item && item.matchId === targetId) || logs[0] || null;
    if (!raw || !normalizer || typeof normalizer.normalizeMatch !== "function") return null;
    return normalizer.normalizeMatch(raw);
  }

  function getCurrentKyoku(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    return kyokus[state.kyokuIndex] || null;
  }

  function getCurrentRows(){
    const kyoku = getCurrentKyoku();
    return Array.isArray(kyoku && kyoku.rows) ? kyoku.rows : [];
  }

  function stopAutoPlay(){
    if (state.playTimer){
      clearTimeout(state.playTimer);
      state.playTimer = 0;
    }
    state.isPlaying = false;
    if (playToggleBtn) playToggleBtn.textContent = "再生";
  }

  function moveToFirstAvailableStep(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    for (let i = 0; i < kyokus.length; i++){
      const rows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (rows.length){
        state.kyokuIndex = i;
        state.stepIndex = 0;
        return;
      }
    }
    state.kyokuIndex = 0;
    state.stepIndex = 0;
  }

  function moveToLastAvailableStep(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    for (let i = kyokus.length - 1; i >= 0; i--){
      const rows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (rows.length){
        state.kyokuIndex = i;
        state.stepIndex = rows.length - 1;
        return;
      }
    }
    state.kyokuIndex = 0;
    state.stepIndex = 0;
  }

  function stepForward(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    if (!kyokus.length) return false;

    const rows = getCurrentRows();
    if (rows.length && state.stepIndex < rows.length - 1){
      state.stepIndex += 1;
      return true;
    }

    for (let i = state.kyokuIndex + 1; i < kyokus.length; i++){
      const nextRows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (!nextRows.length) continue;
      state.kyokuIndex = i;
      state.stepIndex = 0;
      return true;
    }

    return false;
  }

  function stepBackward(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    if (!kyokus.length) return false;

    if (state.stepIndex > 0){
      state.stepIndex -= 1;
      return true;
    }

    for (let i = state.kyokuIndex - 1; i >= 0; i--){
      const prevRows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (!prevRows.length) continue;
      state.kyokuIndex = i;
      state.stepIndex = prevRows.length - 1;
      return true;
    }

    return false;
  }

  function scheduleNextPlayStep(){
    stopAutoPlay();
    state.isPlaying = true;
    playToggleBtn.textContent = "停止";
    const delay = Math.max(120, Number(speedSelect && speedSelect.value) || 700);
    state.playTimer = window.setTimeout(()=>{
      if (!stepForward()){
        stopAutoPlay();
        render();
        return;
      }
      render();
      if (state.isPlaying) scheduleNextPlayStep();
    }, delay);
  }

  function buildSummary(){
    if (!matchSummaryCard) return;
    matchSummaryCard.innerHTML = "";
    const match = state.match;
    if (!match){
      matchSummaryCard.innerHTML = '<div class="emptyCard">選択された半荘が見つかりません。</div>';
      return;
    }

    const settlement = match.source && match.source.summary && match.source.summary.settlement || null;
    const afterScores = Array.isArray(settlement && settlement.afterScores) ? settlement.afterScores.slice(0, 3) : [0, 0, 0];
    const rows = [0,1,2].map((seatIndex)=> ({ seatIndex, name:getSeatLabel(seatIndex), score:Number(afterScores[seatIndex]) || 0 }));
    rows.sort((a,b)=> b.score - a.score || a.seatIndex - b.seatIndex);

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "summaryTitle";
    title.textContent = `三麻 / ${getMatchModeText(match.source)}`;
    const meta = document.createElement("div");
    meta.className = "summaryMeta";
    meta.innerHTML = `${formatDateTime(match.startedAt)}<br>局数 ${match.kyokuCount} / matchId: ${match.matchId}`;
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "summaryBadges";
    const badges = [
      getMatchModeText(match.source),
      match.source && match.source.session && match.source.session.mode === "account" && match.source.session.accountId ? normalizeAccountId(match.source.session.accountId) : "ローカル",
      rows.map((row)=> `${row.rank || ""}${row.name} ${row.score.toLocaleString("ja-JP")}`).join(" / ")
    ];
    badges.forEach((text)=> {
      const badge = document.createElement("div");
      badge.className = "summaryBadge";
      badge.textContent = text;
      right.appendChild(badge);
    });

    matchSummaryCard.appendChild(left);
    matchSummaryCard.appendChild(right);
  }

  function createInfoRow(labelText, valueText){
    const row = document.createElement("div");
    row.className = "infoRow";
    const label = document.createElement("div");
    label.className = "infoLabel";
    label.textContent = labelText;
    const value = document.createElement("div");
    value.className = "infoValue";
    value.textContent = valueText || "—";
    row.appendChild(label);
    row.appendChild(value);
    return row;
  }

  function syncKyokuSelect(){
    if (!kyokuSelect) return;
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    kyokuSelect.innerHTML = "";
    kyokus.forEach((kyoku, index)=>{
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${kyoku && kyoku.label ? kyoku.label : `局${index + 1}`} / ${kyoku && kyoku.resultText ? kyoku.resultText : "未精算"}`;
      kyokuSelect.appendChild(option);
    });
    kyokuSelect.disabled = !kyokus.length;
    if (kyokus.length){
      kyokuSelect.value = String(state.kyokuIndex);
    }
  }

  function renderLoading(text){
    const message = text || "牌譜ログを読み込み中です。";
    if (matchSummaryCard) matchSummaryCard.innerHTML = `<div class="emptyCard">${message}</div>`;
    if (currentCard) currentCard.innerHTML = `<div class="emptyCard">${message}</div>`;
    if (startInfoList) startInfoList.innerHTML = `<div class="emptyCard">${message}</div>`;
    if (trailList) trailList.innerHTML = `<div class="emptyCard">${message}</div>`;
    if (eventLogList) eventLogList.innerHTML = `<div class="emptyCard">${message}</div>`;
    [kyokuSelect, speedSelect, stepRange, firstStepBtn, prevStepBtn, playToggleBtn, nextStepBtn, lastStepBtn].forEach((el)=> el && (el.disabled = true));
  }

  function render(){
    buildSummary();
    syncKyokuSelect();

    const kyoku = getCurrentKyoku();
    const rows = getCurrentRows();
    const hasRows = rows.length > 0;

    if (!hasRows){
      state.stepIndex = 0;
      stepRange.min = "0";
      stepRange.max = "0";
      stepRange.value = "0";
    } else {
      if (state.stepIndex < 0) state.stepIndex = 0;
      if (state.stepIndex > rows.length - 1) state.stepIndex = rows.length - 1;
      stepRange.min = "0";
      stepRange.max = String(rows.length - 1);
      stepRange.value = String(state.stepIndex);
    }

    firstStepBtn.disabled = !stepBackwardAvailable() && !(hasRows && state.stepIndex > 0);
    prevStepBtn.disabled = !stepBackwardAvailable() && !(hasRows && state.stepIndex > 0);
    nextStepBtn.disabled = !stepForwardAvailable() && !(hasRows && state.stepIndex < rows.length - 1);
    lastStepBtn.disabled = !stepForwardAvailable() && !(hasRows && state.stepIndex < rows.length - 1);
    playToggleBtn.disabled = !hasRows;
    speedSelect.disabled = !hasRows;
    stepRange.disabled = !hasRows;
    kyokuSelect.disabled = !(Array.isArray(state.match && state.match.kyokus) && state.match.kyokus.length);

    const label = kyoku && kyoku.label ? kyoku.label : "局";
    stepMeta.textContent = hasRows
      ? `${label} / ${state.stepIndex + 1}手目 / 全${rows.length}手 / ${kyoku && kyoku.resultText ? kyoku.resultText : "未精算"}`
      : `${label} / イベントなし`;

    currentCard.innerHTML = "";
    if (!kyoku){
      currentCard.innerHTML = '<div class="emptyCard">局データがありません。</div>';
    } else if (!hasRows){
      currentCard.innerHTML = `<div class="currentTitle">${label}</div><div class="currentSub">${kyoku.resultText || "未精算"}</div><div class="currentText">この局には再生できるイベントがありません。</div>`;
    } else {
      const row = rows[state.stepIndex];
      const title = document.createElement("div");
      title.className = "currentTitle";
      title.textContent = row && row.title ? row.title : "イベント";
      const sub = document.createElement("div");
      sub.className = "currentSub";
      sub.textContent = `${label} / ${kyoku.resultText || "未精算"} / ${row && row.seqLabel ? row.seqLabel : "#0"} / ${row && row.sub ? row.sub : "—"}`;
      currentCard.appendChild(title);
      currentCard.appendChild(sub);
      if (row && row.detail){
        const detail = document.createElement("div");
        detail.className = "currentText";
        detail.textContent = row.detail;
        currentCard.appendChild(detail);
      }
      if (row && row.extra){
        const extra = document.createElement("div");
        extra.className = "currentSub";
        extra.textContent = row.extra;
        currentCard.appendChild(extra);
      }
    }

    startInfoList.innerHTML = "";
    const start = kyoku && kyoku.source && kyoku.source.start && typeof kyoku.source.start === "object" ? kyoku.source.start : null;
    if (!start){
      startInfoList.appendChild(createInfoRow("開始", "情報なし"));
    } else {
      startInfoList.appendChild(createInfoRow("局", `${start.roundWind || "?"}${Number(start.roundNumber) || 0}局 ${Number(start.honba) || 0}本場`));
      startInfoList.appendChild(createInfoRow("結果", kyoku.resultText || "未精算"));
      startInfoList.appendChild(createInfoRow("ドラ", tileArrayText(start.doraIndicators)));
      startInfoList.appendChild(createInfoRow("点数", scoreArrayText(start.scores)));
      startInfoList.appendChild(createInfoRow("自配牌", tileArrayText(start.hand13)));
      startInfoList.appendChild(createInfoRow("自ツモ", tileText(start.drawn)));
      startInfoList.appendChild(createInfoRow("右CPU", tileArrayText(start.cpuRightHand13)));
      startInfoList.appendChild(createInfoRow("左CPU", tileArrayText(start.cpuLeftHand13)));
    }

    trailList.innerHTML = "";
    eventLogList.innerHTML = "";
    if (!hasRows){
      trailList.innerHTML = '<div class="emptyCard">表示できるイベントがありません。</div>';
      eventLogList.innerHTML = '<div class="emptyCard">この局のログはありません。</div>';
    } else {
      const from = Math.max(0, state.stepIndex - 2);
      const to = Math.min(rows.length - 1, state.stepIndex + 2);
      for (let i = from; i <= to; i++){
        const row = rows[i];
        const item = document.createElement("div");
        item.className = `trailRow${i === state.stepIndex ? " isCurrent" : ""}`;
        item.innerHTML = `<div class="trailTop"><div class="trailTitle">${escapeHtml(row && row.title ? row.title : "イベント")}</div><div class="trailSeq">${escapeHtml(row && row.seqLabel ? row.seqLabel : "#0")}</div></div>${row && row.sub ? `<div class="trailSub">${escapeHtml(row.sub)}</div>` : ""}${row && row.detail ? `<div class="trailText">${escapeHtml(row.detail)}</div>` : ""}`;
        trailList.appendChild(item);
      }

      rows.forEach((row, index)=>{
        const item = document.createElement("div");
        item.className = `logEventRow${index === state.stepIndex ? " isCurrent" : ""}`;
        item.innerHTML = `<div class="logEventTop"><div class="logEventType">${escapeHtml(row && row.title ? row.title : "イベント")}</div><div class="logEventSeq">${escapeHtml(row && row.seqLabel ? row.seqLabel : "#0")}</div></div>${row && row.sub ? `<div class="logEventSub">${escapeHtml(row.sub)}</div>` : ""}${row && row.detail ? `<div class="logEventText">${escapeHtml(row.detail)}</div>` : ""}${row && row.extra ? `<div class="logEventSub">${escapeHtml(row.extra)}</div>` : ""}`;
        eventLogList.appendChild(item);
      });
    }
  }

  function escapeHtml(text){
    return String(text || "").replace(/[&<>\"']/g, (ch)=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function stepForwardAvailable(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    if (!kyokus.length) return false;
    const rows = getCurrentRows();
    if (rows.length && state.stepIndex < rows.length - 1) return true;
    for (let i = state.kyokuIndex + 1; i < kyokus.length; i++){
      const nextRows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (nextRows.length) return true;
    }
    return false;
  }

  function stepBackwardAvailable(){
    const kyokus = Array.isArray(state.match && state.match.kyokus) ? state.match.kyokus : [];
    if (!kyokus.length) return false;
    if (state.stepIndex > 0) return true;
    for (let i = state.kyokuIndex - 1; i >= 0; i--){
      const prevRows = Array.isArray(kyokus[i] && kyokus[i].rows) ? kyokus[i].rows : [];
      if (prevRows.length) return true;
    }
    return false;
  }

  function bindControls(){
    kyokuSelect.addEventListener("change", ()=>{
      stopAutoPlay();
      state.kyokuIndex = Math.max(0, Number(kyokuSelect.value) || 0);
      state.stepIndex = 0;
      const rows = getCurrentRows();
      if (!rows.length){
        for (let i = state.kyokuIndex + 1; i < state.match.kyokus.length; i++){
          const nextRows = Array.isArray(state.match.kyokus[i] && state.match.kyokus[i].rows) ? state.match.kyokus[i].rows : [];
          if (!nextRows.length) continue;
          state.kyokuIndex = i;
          state.stepIndex = 0;
          break;
        }
      }
      render();
    });

    stepRange.addEventListener("input", ()=>{
      stopAutoPlay();
      state.stepIndex = Math.max(0, Number(stepRange.value) || 0);
      render();
    });

    firstStepBtn.addEventListener("click", ()=>{ stopAutoPlay(); moveToFirstAvailableStep(); render(); });
    lastStepBtn.addEventListener("click", ()=>{ stopAutoPlay(); moveToLastAvailableStep(); render(); });
    prevStepBtn.addEventListener("click", ()=>{ stopAutoPlay(); if (stepBackward()) render(); });
    nextStepBtn.addEventListener("click", ()=>{ stopAutoPlay(); if (stepForward()) render(); });
    playToggleBtn.addEventListener("click", ()=>{
      if (state.isPlaying){
        stopAutoPlay();
        return;
      }
      if (!stepForwardAvailable() && !(getCurrentRows().length && state.stepIndex < getCurrentRows().length - 1)) return;
      scheduleNextPlayStep();
    });

    speedSelect.addEventListener("change", ()=>{
      if (!state.isPlaying) return;
      scheduleNextPlayStep();
    });
  }

  async function boot(){
    if (replayAccountBadge) replayAccountBadge.textContent = loadSessionLabel();
    renderLoading();
    state.match = await loadTargetMatch();

    if (!state.match){
      renderLoading("表示できる半荘ログがありません。一覧へ戻って確認してください。");
      return;
    }

    moveToFirstAvailableStep();
    render();
    bindControls();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", ()=> { boot().catch(()=> renderLoading("牌譜ログの読み込みに失敗しました。")); }, { once:true });
  }else{
    boot().catch(()=> renderLoading("牌譜ログの読み込みに失敗しました。"));
  }
})();
