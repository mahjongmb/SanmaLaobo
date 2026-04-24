// ========= analysis_ui.js（アプリ版 条件指定分析UI） =========
// 役割：
// - app_play_ui.js の成績オーバーレイへ「分析」タブを後付けする
// - 保存済みログから、条件指定でリーチ/和了/放銃まわりを集計表示する
// - 既存の局進行や render 系には触れない

(function(){
  "use strict";

  const ANALYSIS_TAB_KEY = "analysis";
  const FILTER_STORAGE_KEY = "mbsanma_app_analysis_filters_v1";

  const analysisState = {
    active: false,
    filters: loadFilters()
  };

  injectAnalysisStyles();

  function safeArray(value){
    return Array.isArray(value) ? value : [];
  }

  function safeNumber(value, fallback = 0){
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function loadFilters(){
    try{
      const raw = localStorage.getItem(FILTER_STORAGE_KEY);
      if (!raw) return normalizeFilters(null);
      return normalizeFilters(JSON.parse(raw));
    }catch(e){
      return normalizeFilters(null);
    }
  }

  function saveFilters(){
    try{
      localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(analysisState.filters));
    }catch(e){}
  }

  function normalizeFilters(src){
    const raw = src && typeof src === "object" ? src : {};
    const limit = String(raw.limit || "50");
    const matchMode = String(raw.matchMode || "all");
    const dealer = String(raw.dealer || "all");
    const junmeBand = String(raw.junmeBand || "all");
    const waitShape = String(raw.waitShape || "all");
    return {
      limit: ["all", "20", "50", "100", "200"].includes(limit) ? limit : "50",
      matchMode: ["all", "normal", "batch", "unknown"].includes(matchMode) ? matchMode : "all",
      dealer: ["all", "dealer", "nondealer"].includes(dealer) ? dealer : "all",
      junmeBand: ["all", "1-6", "7-9", "10+"].includes(junmeBand) ? junmeBand : "all",
      waitShape: ["all", "ryanmen", "non_ryanmen", "known"].includes(waitShape) ? waitShape : "all"
    };
  }

  function injectAnalysisStyles(){
    if (document.getElementById("analysisUiStyle")) return;
    const style = document.createElement("style");
    style.id = "analysisUiStyle";
    style.textContent = `
      .visitorAnalysisPanel{
        display: grid;
        gap: 12px;
      }
      .visitorAnalysisNote{
        font-size: 12px;
        line-height: 1.7;
        color: rgba(245,247,244,0.76);
      }
      .visitorAnalysisFilterCard,
      .visitorAnalysisResultCard{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(20,35,62,0.88), rgba(24,34,58,0.82));
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .visitorAnalysisFilterGrid{
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
      }
      .visitorAnalysisField{
        display: grid;
        gap: 6px;
      }
      .visitorAnalysisLabel{
        font-size: 12px;
        font-weight: 800;
        color: rgba(245,247,244,0.74);
      }
      .visitorAnalysisSelect{
        width: 100%;
        min-height: 38px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.14);
        background: rgba(255,255,255,0.05);
        color: #f5f7f4;
        padding: 0 10px;
        box-sizing: border-box;
      }
      .visitorAnalysisResultTitle{
        font-size: 18px;
        font-weight: 900;
      }
      .visitorAnalysisSub{
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.72);
      }
      .visitorAnalysisMetricGrid{
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .visitorAnalysisMetric{
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(0,0,0,0.16);
        padding: 11px 10px;
        display: grid;
        gap: 5px;
      }
      .visitorAnalysisMetricLabel{
        font-size: 11px;
        font-weight: 700;
        color: rgba(245,247,244,0.64);
      }
      .visitorAnalysisMetricValue{
        font-size: 19px;
        font-weight: 900;
        line-height: 1.05;
        color: #ffd56f;
      }
      .visitorAnalysisMetricHint{
        font-size: 10px;
        color: rgba(245,247,244,0.48);
        line-height: 1.35;
      }
      .visitorAnalysisSectionTitle{
        font-size: 15px;
        font-weight: 900;
        color: #ffffff;
      }
      .visitorAnalysisEmpty{
        border-radius: 14px;
        border: 1px dashed rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.03);
        padding: 14px;
        font-size: 13px;
        line-height: 1.7;
        color: rgba(245,247,244,0.78);
      }
      @media (max-width: 640px){
        .visitorAnalysisFilterGrid{
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .visitorAnalysisMetricGrid{
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function getStoredLogsAsync(){
    try{
      if (window.MBSanmaMatchLog){
        if (typeof window.MBSanmaMatchLog.getStoredLogsAsync === "function"){
          const logs = await window.MBSanmaMatchLog.getStoredLogsAsync();
          return Array.isArray(logs) ? logs.filter((item)=> item && typeof item === "object") : [];
        }
        if (typeof window.MBSanmaMatchLog.getStoredLogs === "function"){
          const logs = window.MBSanmaMatchLog.getStoredLogs();
          return Array.isArray(logs) ? logs.filter((item)=> item && typeof item === "object") : [];
        }
      }
    }catch(e){}
    return [];
  }

  function getMatchMode(log){
    const meta = log && log.meta && typeof log.meta === "object" ? log.meta : {};
    const raw = String(meta.matchMode || "").toLowerCase();
    if (raw === "cpu_batch" || raw === "batch") return "batch";
    if (raw === "app_play" || raw === "normal" || raw === "play" || raw === "manual") return "normal";
    return raw ? raw : "unknown";
  }

  function getSettlement(kyoku){
    if (kyoku && kyoku.settlement && typeof kyoku.settlement === "object") return kyoku.settlement;
    const summary = kyoku && kyoku.summary && typeof kyoku.summary === "object" ? kyoku.summary : null;
    if (summary && summary.settlement && typeof summary.settlement === "object") return summary.settlement;
    return null;
  }

  function findPlayerRiichiEvent(kyoku){
    const events = safeArray(kyoku && kyoku.events);
    return events.find((event)=> {
      const payload = event && event.payload && typeof event.payload === "object" ? event.payload : null;
      return event && event.type === "riichi" && payload && Number(payload.seatIndex) === 0;
    }) || null;
  }

  function isPlayerAgariSettlement(settlement){
    if (!settlement || settlement.type !== "agari") return false;
    if (Number(settlement.winnerSeatIndex) === 0) return true;
    return safeArray(settlement.agariEntries).some((entry)=> Number(entry && entry.winnerSeatIndex) === 0);
  }

  function isPlayerHojuSettlement(settlement){
    if (!settlement || settlement.type !== "agari") return false;
    if (settlement.winType !== "ron") return false;
    if (Number(settlement.discarderSeatIndex) === 0) return true;
    return safeArray(settlement.agariEntries).some((entry)=> Number(entry && entry.discarderSeatIndex) === 0);
  }

  function getPlayerAgariPoint(settlement){
    if (!settlement || settlement.type !== "agari") return null;

    const findScoreInfo = ()=> {
      const direct = settlement.scoreInfo && typeof settlement.scoreInfo === "object" ? settlement.scoreInfo : null;
      if (direct && Number(settlement.winnerSeatIndex) === 0) return direct;

      const agariEntry = safeArray(settlement.agariEntries).find((entry)=> Number(entry && entry.winnerSeatIndex) === 0);
      if (agariEntry && agariEntry.scoreInfo && typeof agariEntry.scoreInfo === "object") return agariEntry.scoreInfo;

      const headEntry = settlement.headEntry && typeof settlement.headEntry === "object" ? settlement.headEntry : null;
      if (headEntry && Number(headEntry.winnerSeatIndex) === 0 && headEntry.scoreInfo && typeof headEntry.scoreInfo === "object") return headEntry.scoreInfo;

      return null;
    };

    const scoreInfo = findScoreInfo();
    if (!scoreInfo) return null;

    const candidates = [
      scoreInfo.totalPoint,
      scoreInfo.point,
      scoreInfo.basicPoint,
      scoreInfo.ronPoint,
      scoreInfo.displayPoint,
      scoreInfo.finalPoint
    ];

    for (const value of candidates){
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }

    const ko = Number(scoreInfo.tsumoPointKo);
    const oya = Number(scoreInfo.tsumoPointOya);
    if (Number.isFinite(ko) || Number.isFinite(oya)){
      return (Number.isFinite(ko) ? ko * 2 : 0) + (Number.isFinite(oya) ? oya : 0);
    }

    return null;
  }

  function getRiichiWaitInfo(riichiEvent){
    const payload = riichiEvent && riichiEvent.payload && typeof riichiEvent.payload === "object" ? riichiEvent.payload : {};
    const tenpai = payload.tenpai && typeof payload.tenpai === "object" ? payload.tenpai : {};
    const waitTypeKeys = Array.isArray(tenpai.waitTypeKeys) ? tenpai.waitTypeKeys.slice() : [];
    return {
      junme: safeNumber(payload.junme, 0),
      isRyanmenWait: !!tenpai.isRyanmenWait,
      waitTileCount: safeNumber(tenpai.waitTileCount, 0),
      waitTypeKeys,
      hasKnownWaitShape: waitTypeKeys.length > 0
    };
  }

  function matchesJunmeBand(junme, band){
    const n = safeNumber(junme, 0);
    if (band === "1-6") return n >= 1 && n <= 6;
    if (band === "7-9") return n >= 7 && n <= 9;
    if (band === "10+") return n >= 10;
    return true;
  }

  function matchesWaitShape(info, waitShape){
    if (waitShape === "ryanmen") return !!info.isRyanmenWait;
    if (waitShape === "non_ryanmen") return info.hasKnownWaitShape && !info.isRyanmenWait;
    if (waitShape === "known") return info.hasKnownWaitShape;
    return true;
  }

  function getFilteredLogs(logs, limit){
    const list = safeArray(logs);
    if (limit === "all") return list.slice();
    const n = Math.max(1, parseInt(limit, 10) || 0);
    return list.slice(0, n);
  }

  function buildAnalysisDataset(logs, filters){
    const selectedLogs = getFilteredLogs(logs, filters.limit);

    const out = {
      totalMatches: selectedLogs.length,
      totalKyokus: 0,
      totalRiichiKyokus: 0,
      totalAgariKyokus: 0,
      totalHojuKyokus: 0,
      filteredRiichiCount: 0,
      filteredRiichiAgariCount: 0,
      filteredRiichiPoints: [],
      filteredRiichiJunmes: [],
      filteredRyanmenCount: 0,
      filteredWaitTileCounts: [],
      matchModeCounts: {},
      dealerCounts: { dealer: 0, nondealer: 0 }
    };

    selectedLogs.forEach((log)=> {
      const matchMode = getMatchMode(log);
      out.matchModeCounts[matchMode] = (out.matchModeCounts[matchMode] || 0) + 1;
      if (filters.matchMode !== "all" && matchMode !== filters.matchMode) return;

      safeArray(log && log.kyokus).forEach((kyoku)=> {
        const start = kyoku && kyoku.start && typeof kyoku.start === "object" ? kyoku.start : {};
        const isDealer = Number(start.eastSeatIndex) === 0;
        const dealerKey = isDealer ? "dealer" : "nondealer";
        out.dealerCounts[dealerKey] += 1;
        if (filters.dealer === "dealer" && !isDealer) return;
        if (filters.dealer === "nondealer" && isDealer) return;

        out.totalKyokus += 1;

        const settlement = getSettlement(kyoku);
        if (isPlayerAgariSettlement(settlement)) out.totalAgariKyokus += 1;
        if (isPlayerHojuSettlement(settlement)) out.totalHojuKyokus += 1;

        const riichiEvent = findPlayerRiichiEvent(kyoku);
        if (!riichiEvent) return;

        out.totalRiichiKyokus += 1;
        const waitInfo = getRiichiWaitInfo(riichiEvent);
        if (!matchesJunmeBand(waitInfo.junme, filters.junmeBand)) return;
        if (!matchesWaitShape(waitInfo, filters.waitShape)) return;

        out.filteredRiichiCount += 1;
        if (waitInfo.isRyanmenWait) out.filteredRyanmenCount += 1;
        if (waitInfo.junme > 0) out.filteredRiichiJunmes.push(waitInfo.junme);
        if (waitInfo.waitTileCount > 0) out.filteredWaitTileCounts.push(waitInfo.waitTileCount);

        if (isPlayerAgariSettlement(settlement)){
          out.filteredRiichiAgariCount += 1;
          const point = getPlayerAgariPoint(settlement);
          if (Number.isFinite(point) && point > 0) out.filteredRiichiPoints.push(point);
        }
      });
    });

    return out;
  }

  function averageFrom(list){
    const arr = safeArray(list).map((value)=> Number(value)).filter((value)=> Number.isFinite(value));
    if (!arr.length) return null;
    return arr.reduce((sum, value)=> sum + value, 0) / arr.length;
  }

  function formatRate(numerator, denominator){
    const den = safeNumber(denominator, 0);
    if (den <= 0) return "—";
    return `${((safeNumber(numerator, 0) / den) * 100).toFixed(1)}%`;
  }

  function formatAverageNumber(value, digits = 2){
    if (!Number.isFinite(value)) return "—";
    return Number(value).toFixed(digits);
  }

  function formatAveragePoint(value){
    if (!Number.isFinite(value)) return "—";
    return `${Math.round(value).toLocaleString("ja-JP")}点`;
  }

  function buildMetric(label, value, hint){
    const item = document.createElement("div");
    item.className = "visitorAnalysisMetric";

    const labelEl = document.createElement("div");
    labelEl.className = "visitorAnalysisMetricLabel";
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.className = "visitorAnalysisMetricValue";
    valueEl.textContent = value;

    const hintEl = document.createElement("div");
    hintEl.className = "visitorAnalysisMetricHint";
    hintEl.textContent = hint || "";

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    item.appendChild(hintEl);
    return item;
  }

  function buildAnalysisLoadingCard(){
    const card = document.createElement("div");
    card.className = "visitorAnalysisResultCard";

    const title = document.createElement("div");
    title.className = "visitorAnalysisResultTitle";
    title.textContent = "分析結果";
    card.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "visitorAnalysisSub";
    sub.textContent = "保存済みログを読み込み中です。";
    card.appendChild(sub);

    const empty = document.createElement("div");
    empty.className = "visitorAnalysisEmpty";
    empty.textContent = "IndexedDB から条件に合うログを集計しています。";
    card.appendChild(empty);

    return card;
  }

  function buildAnalysisPanel(){
    const panel = document.createElement("section");
    panel.className = "visitorStatsTabPanel";
    panel.dataset.statsPanelKey = ANALYSIS_TAB_KEY;
    const inner = buildAnalysisPanelInner();
    panel.appendChild(inner);
    const resultHost = inner.querySelector("[data-analysis-result-host]");
    if (resultHost){
      renderAnalysisResultCardInto(resultHost).catch(()=> {
        resultHost.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "visitorAnalysisEmpty";
        empty.textContent = "分析結果の読み込みに失敗しました。";
        resultHost.appendChild(empty);
      });
    }
    return panel;
  }

  function buildAnalysisPanelInner(){
    const wrap = document.createElement("div");
    wrap.className = "visitorAnalysisPanel";

    const note = document.createElement("div");
    note.className = "visitorAnalysisNote";
    note.textContent = "保存済みログから、巡目・待ち形・親子・対局モードで切って見ます。まずはリーチ観点の分析入口です。";
    wrap.appendChild(note);

    const filterCard = document.createElement("div");
    filterCard.className = "visitorAnalysisFilterCard";

    const filterTitle = document.createElement("div");
    filterTitle.className = "visitorAnalysisSectionTitle";
    filterTitle.textContent = "条件";
    filterCard.appendChild(filterTitle);

    const grid = document.createElement("div");
    grid.className = "visitorAnalysisFilterGrid";

    const filterDefs = [
      {
        key: "limit",
        label: "対象半荘",
        options: [
          ["20", "最新20"],
          ["50", "最新50"],
          ["100", "最新100"],
          ["200", "最新200"],
          ["all", "すべて"]
        ]
      },
      {
        key: "matchMode",
        label: "対局モード",
        options: [
          ["all", "すべて"],
          ["normal", "通常"],
          ["batch", "自動対局"],
          ["unknown", "未分類"]
        ]
      },
      {
        key: "dealer",
        label: "親子",
        options: [
          ["all", "すべて"],
          ["dealer", "親"],
          ["nondealer", "子"]
        ]
      },
      {
        key: "junmeBand",
        label: "リーチ巡目",
        options: [
          ["all", "すべて"],
          ["1-6", "1〜6巡目"],
          ["7-9", "7〜9巡目"],
          ["10+", "10巡目以降"]
        ]
      },
      {
        key: "waitShape",
        label: "待ち形",
        options: [
          ["all", "すべて"],
          ["ryanmen", "両面のみ"],
          ["non_ryanmen", "非両面のみ"],
          ["known", "待ち形情報あり"]
        ]
      }
    ];

    filterDefs.forEach((def)=> {
      const field = document.createElement("label");
      field.className = "visitorAnalysisField";

      const label = document.createElement("span");
      label.className = "visitorAnalysisLabel";
      label.textContent = def.label;

      const select = document.createElement("select");
      select.className = "visitorAnalysisSelect";
      select.dataset.analysisFilterKey = def.key;

      def.options.forEach(([value, text])=> {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        if (analysisState.filters[def.key] === value) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener("change", ()=> {
        analysisState.filters[def.key] = String(select.value || "");
        analysisState.filters = normalizeFilters(analysisState.filters);
        saveFilters();
        rerenderAnalysisPanel().catch(()=>{});
      });

      field.appendChild(label);
      field.appendChild(select);
      grid.appendChild(field);
    });

    filterCard.appendChild(grid);
    wrap.appendChild(filterCard);

    const resultHost = document.createElement("div");
    resultHost.dataset.analysisResultHost = "1";
    resultHost.appendChild(buildAnalysisLoadingCard());
    wrap.appendChild(resultHost);

    return wrap;
  }

  function buildAnalysisResultCard(logs){
    const card = document.createElement("div");
    card.className = "visitorAnalysisResultCard";

    const title = document.createElement("div");
    title.className = "visitorAnalysisResultTitle";
    title.textContent = "分析結果";
    card.appendChild(title);

    const dataset = buildAnalysisDataset(logs, analysisState.filters);

    const sub = document.createElement("div");
    sub.className = "visitorAnalysisSub";
    sub.textContent = `対象半荘 ${dataset.totalMatches} / 対象局 ${dataset.totalKyokus} / 条件一致リーチ ${dataset.filteredRiichiCount}`;
    card.appendChild(sub);

    if (dataset.totalKyokus <= 0){
      const empty = document.createElement("div");
      empty.className = "visitorAnalysisEmpty";
      empty.textContent = "条件に合う局がありません。対局モードや親子条件を少し広げると出やすいです。";
      card.appendChild(empty);
      return card;
    }

    const kyokuGrid = document.createElement("div");
    kyokuGrid.className = "visitorAnalysisMetricGrid";
    kyokuGrid.appendChild(buildMetric("対象半荘", `${dataset.totalMatches}`, "ログ範囲"));
    kyokuGrid.appendChild(buildMetric("対象局数", `${dataset.totalKyokus}`, "親子/モード条件後"));
    kyokuGrid.appendChild(buildMetric("アガリ率", formatRate(dataset.totalAgariKyokus, dataset.totalKyokus), "局数基準"));
    kyokuGrid.appendChild(buildMetric("放銃率", formatRate(dataset.totalHojuKyokus, dataset.totalKyokus), "局数基準"));
    kyokuGrid.appendChild(buildMetric("リーチ率", formatRate(dataset.totalRiichiKyokus, dataset.totalKyokus), "局数基準"));
    kyokuGrid.appendChild(buildMetric("親局数", `${dataset.dealerCounts.dealer}`, "対象内"));
    kyokuGrid.appendChild(buildMetric("子局数", `${dataset.dealerCounts.nondealer}`, "対象内"));
    kyokuGrid.appendChild(buildMetric("両面率", formatRate(dataset.filteredRyanmenCount, dataset.filteredRiichiCount), "条件一致リーチ基準"));
    card.appendChild(kyokuGrid);

    const riichiTitle = document.createElement("div");
    riichiTitle.className = "visitorAnalysisSectionTitle";
    riichiTitle.textContent = "条件一致リーチ";
    card.appendChild(riichiTitle);

    if (dataset.filteredRiichiCount <= 0){
      const empty = document.createElement("div");
      empty.className = "visitorAnalysisEmpty";
      empty.textContent = "条件に合うリーチがまだありません。巡目帯や待ち形の条件を広げると出やすいです。";
      card.appendChild(empty);
      return card;
    }

    const riichiGrid = document.createElement("div");
    riichiGrid.className = "visitorAnalysisMetricGrid";
    riichiGrid.appendChild(buildMetric("リーチ件数", `${dataset.filteredRiichiCount}`, "条件一致"));
    riichiGrid.appendChild(buildMetric("和了率", formatRate(dataset.filteredRiichiAgariCount, dataset.filteredRiichiCount), "条件一致リーチ基準"));
    riichiGrid.appendChild(buildMetric("平均巡目", formatAverageNumber(averageFrom(dataset.filteredRiichiJunmes), 2), "条件一致リーチ"));
    riichiGrid.appendChild(buildMetric("平均待ち枚数", formatAverageNumber(averageFrom(dataset.filteredWaitTileCounts), 2), "残り枚数ベース"));
    riichiGrid.appendChild(buildMetric("平均打点", formatAveragePoint(averageFrom(dataset.filteredRiichiPoints)), "和了した分のみ"));
    riichiGrid.appendChild(buildMetric("両面率", formatRate(dataset.filteredRyanmenCount, dataset.filteredRiichiCount), "条件一致リーチ基準"));
    riichiGrid.appendChild(buildMetric("和了件数", `${dataset.filteredRiichiAgariCount}`, "条件一致リーチ内"));
    riichiGrid.appendChild(buildMetric("モード内訳", formatMatchModeSummary(dataset.matchModeCounts), "抽出前の半荘"));
    card.appendChild(riichiGrid);

    return card;
  }


  async function renderAnalysisResultCardInto(host){
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(buildAnalysisLoadingCard());

    const logs = await getStoredLogsAsync();
    host.innerHTML = "";
    host.appendChild(buildAnalysisResultCard(logs));
  }

  function formatMatchModeSummary(counts){
    const entries = Object.entries(counts || {}).filter(([, value])=> safeNumber(value, 0) > 0);
    if (!entries.length) return "—";
    const labelMap = {
      normal: "通常",
      batch: "自動",
      unknown: "未分類"
    };
    return entries.map(([key, value])=> `${labelMap[key] || key}:${value}`).join(" / ");
  }


function getReplayOverlay(){
  return document.getElementById("visitorReplayOverlay");
}

function getReplayHeaderTabs(){
  return document.getElementById("visitorReplayHeaderTabs");
}

function getReplayPanels(){
  const root = document.getElementById("visitorReplayRoot");
  if (!root) return null;
  return root.querySelector(".visitorStatsPanels");
}

  function setOverlayActiveTab(tabKey){
    const headerTabs = getReplayHeaderTabs();
    const panels = getReplayPanels();
    if (!headerTabs || !panels) return;

    const buttons = headerTabs.querySelectorAll("button[data-stats-tab-key]");
    buttons.forEach((btn)=> {
      const active = String(btn.dataset.statsTabKey || "") === tabKey;
      btn.classList.toggle("isActive", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    const panelList = panels.querySelectorAll(".visitorStatsTabPanel[data-stats-panel-key]");
    panelList.forEach((panel)=> {
      const active = String(panel.dataset.statsPanelKey || "") === tabKey;
      panel.classList.toggle("isActive", active);
    });

    analysisState.active = (tabKey === ANALYSIS_TAB_KEY);
  }

  async function rerenderAnalysisPanel(){
    const panels = getReplayPanels();
    if (!panels) return;
    const current = panels.querySelector(`.visitorStatsTabPanel[data-stats-panel-key="${ANALYSIS_TAB_KEY}"]`);
    if (!current) return;
    const next = buildAnalysisPanel();
    panels.replaceChild(next, current);
    if (analysisState.active) setOverlayActiveTab(ANALYSIS_TAB_KEY);
  }

  function ensureAnalysisTab(){
    const overlay = getReplayOverlay();
    const headerTabs = getReplayHeaderTabs();
    const panels = getReplayPanels();
    if (!overlay || !headerTabs || !panels) return;

    if (!headerTabs.dataset.analysisUiBound){
      headerTabs.dataset.analysisUiBound = "1";
      headerTabs.addEventListener("click", (ev)=> {
        const btn = ev.target && ev.target.closest ? ev.target.closest("button[data-stats-tab-key]") : null;
        if (!btn) return;
        const key = String(btn.dataset.statsTabKey || "");
        if (!key) return;
        if (key === ANALYSIS_TAB_KEY){
          ev.preventDefault();
          ev.stopPropagation();
          setOverlayActiveTab(ANALYSIS_TAB_KEY);
          return;
        }
        requestAnimationFrame(()=> setOverlayActiveTab(key));
      });
    }

    let tabBtn = headerTabs.querySelector(`button[data-stats-tab-key="${ANALYSIS_TAB_KEY}"]`);
    if (!tabBtn){
      tabBtn = document.createElement("button");
      tabBtn.type = "button";
      tabBtn.className = "visitorStatsHeaderTabBtn";
      tabBtn.textContent = "分析";
      tabBtn.dataset.statsTabKey = ANALYSIS_TAB_KEY;
      tabBtn.setAttribute("aria-selected", "false");
      headerTabs.appendChild(tabBtn);
    }

    let panel = panels.querySelector(`.visitorStatsTabPanel[data-stats-panel-key="${ANALYSIS_TAB_KEY}"]`);
    if (!panel){
      panel = buildAnalysisPanel();
      panels.appendChild(panel);
    }

    if (analysisState.active){
      setOverlayActiveTab(ANALYSIS_TAB_KEY);
    }
  }

  function bootAnalysisUi(){
    const observerTarget = document.body;
    if (!observerTarget) return;

    const ensureLater = ()=> requestAnimationFrame(ensureAnalysisTab);
    ensureLater();

    const observer = new MutationObserver(()=> ensureLater());
    observer.observe(observerTarget, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", bootAnalysisUi, { once: true });
  }else{
    bootAnalysisUi();
  }
})();
