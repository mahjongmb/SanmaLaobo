(function(){
  "use strict";

  const CURRENT_LOGIN_ACCOUNT_STORAGE_KEY = "mbsanma_app_current_login_account_v1";
  const ACTIVE_SESSION_STORAGE_KEY = "mbsanma_app_active_session_v1";
  const LEGACY_ACTIVE_SESSION_STORAGE_KEY = "mbsanma_visitor_active_session_v1";

  const replayAccountBadge = document.getElementById("replayAccountBadge");
  const replayListRoot = document.getElementById("replayListRoot");
  const filterButtons = Array.from(document.querySelectorAll("[data-mode-filter]"));

  let activeFilter = "all";

  function normalizeAccountId(value){
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function writeActiveSessionSnapshot(mode, accountId){
    const payload = {
      mode: mode === "account" ? "account" : "local",
      accountId: mode === "account" ? normalizeAccountId(accountId) : ""
    };
    try{
      const serialized = JSON.stringify(payload);
      sessionStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, serialized);
      sessionStorage.setItem(LEGACY_ACTIVE_SESSION_STORAGE_KEY, serialized);
    }catch(e){}
    return payload;
  }

  function loadSessionLabel(){
    try{
      const loginId = normalizeAccountId(localStorage.getItem(CURRENT_LOGIN_ACCOUNT_STORAGE_KEY) || "");
      if (loginId){
        writeActiveSessionSnapshot("account", loginId);
        return loginId;
      }
    }catch(e){}

    const keys = [ACTIVE_SESSION_STORAGE_KEY, LEGACY_ACTIVE_SESSION_STORAGE_KEY];
    for (const key of keys){
      try{
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.mode === "account" && parsed.accountId){
          const accountId = normalizeAccountId(parsed.accountId);
          writeActiveSessionSnapshot("account", accountId);
          return accountId;
        }
        if (parsed && parsed.mode === "local"){
          writeActiveSessionSnapshot("local", "");
          return "ローカル";
        }
      }catch(e){}
    }

    writeActiveSessionSnapshot("local", "");
    return "ローカル";
  }

  function formatDateTime(value){
    try{
      const api = window.MBSanmaLogNormalizer;
      if (api && typeof api.formatDateTime === "function"){
        return api.formatDateTime(value);
      }
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

  function getRuleText(log){
    const modeText = getMatchModeText(log);
    return `三麻 / ${modeText}`;
  }

  function getSettlement(log){
    return log && log.summary && log.summary.settlement && typeof log.summary.settlement === "object"
      ? log.summary.settlement
      : null;
  }

  function getSortedRowsFromSettlement(settlement){
    const afterScores = Array.isArray(settlement && settlement.afterScores) ? settlement.afterScores.slice(0, 3) : [0, 0, 0];
    const rows = [0, 1, 2].map((seatIndex)=> ({
      seatIndex,
      name: getSeatLabel(seatIndex),
      score: Number(afterScores[seatIndex]) || 0
    }));
    rows.sort((a, b)=> b.score - a.score || a.seatIndex - b.seatIndex);
    return rows.map((row, index)=> ({ ...row, rank: index + 1 }));
  }

  function getResultText(settlement){
    if (!settlement) return "未精算";
    if (settlement.type === "agari"){
      return `${getSeatLabel(settlement.winnerSeatIndex)} ${settlement.winType === "tsumo" ? "ツモ" : "ロン"}`;
    }
    if (settlement.type === "ryukyoku") return "流局";
    return "精算済み";
  }

  function getSessionText(log){
    return log && log.session && log.session.mode === "account" && log.session.accountId
      ? normalizeAccountId(log.session.accountId)
      : "ローカル";
  }

  function getKyokuCount(log){
    return Array.isArray(log && log.kyokus) ? log.kyokus.length : 0;
  }

  function shouldIncludeByFilter(log){
    if (activeFilter === "all") return true;
    if (activeFilter === "local"){
      return !(log && log.session && log.session.mode === "account" && log.session.accountId);
    }
    return String(log && log.meta && log.meta.matchMode || "") === activeFilter;
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

  function buildRankCell(row){
    const cell = document.createElement("div");
    cell.className = `rankCell${row.seatIndex === 0 ? " isPlayer" : ""}`;

    const head = document.createElement("div");
    head.className = "rankHead";
    const rankLabel = document.createElement("div");
    rankLabel.className = "rankLabel";
    rankLabel.textContent = `${row.rank}位`;
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = row.name;
    head.appendChild(rankLabel);
    head.appendChild(name);

    const score = document.createElement("div");
    score.className = "score";
    score.textContent = `${row.score.toLocaleString("ja-JP")}`;

    const meta = document.createElement("div");
    meta.className = "subMeta";
    meta.textContent = row.seatIndex === 0 ? "自分の最終点数" : "CPUの最終点数";

    cell.appendChild(head);
    cell.appendChild(score);
    cell.appendChild(meta);
    return cell;
  }

  function openReplayView(matchId){
    if (!matchId) return;
    location.href = `replay_view_app.html?matchId=${encodeURIComponent(matchId)}`;
  }

  function buildMatchCard(log){
    const settlement = getSettlement(log);
    const rows = getSortedRowsFromSettlement(settlement);

    const card = document.createElement("section");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "cardHead";

    const titleWrap = document.createElement("div");
    titleWrap.className = "cardTitleWrap";
    const title = document.createElement("div");
    title.className = "cardTitle";
    title.textContent = getRuleText(log);
    const meta = document.createElement("div");
    meta.className = "cardMeta";
    meta.innerHTML = `${formatDateTime(log && log.startedAt)}<br>局数 ${getKyokuCount(log)} / matchId: ${log && log.matchId ? log.matchId : "—"}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);

    const metaLine = document.createElement("div");
    metaLine.className = "metaLine";
    const modeBadge = document.createElement("div");
    modeBadge.className = "modeBadge";
    modeBadge.textContent = getMatchModeText(log);
    const sessionBadge = document.createElement("div");
    sessionBadge.className = "sessionBadge";
    sessionBadge.textContent = getSessionText(log);
    const resultBadge = document.createElement("div");
    resultBadge.className = "resultBadge";
    resultBadge.textContent = getResultText(settlement);
    metaLine.appendChild(modeBadge);
    metaLine.appendChild(sessionBadge);
    metaLine.appendChild(resultBadge);

    head.appendChild(titleWrap);
    head.appendChild(metaLine);
    card.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "rankGrid";
    rows.forEach((row)=> grid.appendChild(buildRankCell(row)));
    card.appendChild(grid);

    const foot = document.createElement("div");
    foot.className = "cardFoot";
    const footText = document.createElement("div");
    footText.className = "footText";
    footText.textContent = "この半荘を選ぶと、東1局1手目から牌譜再生ページへ進みます。";
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "openBtn";
    openBtn.textContent = "再生する";
    openBtn.addEventListener("click", ()=> openReplayView(log && log.matchId));
    foot.appendChild(footText);
    foot.appendChild(openBtn);
    card.appendChild(foot);

    card.addEventListener("click", (ev)=>{
      const btn = ev.target && ev.target.closest ? ev.target.closest("button") : null;
      if (btn) return;
      openReplayView(log && log.matchId);
    });
    card.style.cursor = "pointer";
    return card;
  }

  function renderLoading(){
    if (!replayListRoot) return;
    replayListRoot.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "emptyCard";
    loading.textContent = "保存済み半荘ログを読み込み中です。";
    replayListRoot.appendChild(loading);
  }

  async function renderList(){
    if (!replayListRoot) return;
    renderLoading();

    const logs = await getStoredLogsAsync();

    const completedLogs = Array.isArray(logs)
      ? logs.filter((item)=> item && typeof item === "object" && item.endedAt)
      : [];

    const filtered = completedLogs.filter(shouldIncludeByFilter);

    replayListRoot.innerHTML = "";

    if (!filtered.length){
      const empty = document.createElement("div");
      empty.className = "emptyCard";
      empty.innerHTML = completedLogs.length
        ? "条件に合う半荘ログがありません。フィルタを変えると表示される場合があります。"
        : "まだ保存された半荘ログがありません。<br>半荘が終わると、その時点で一覧へ追加されます。";
      replayListRoot.appendChild(empty);
      return;
    }

    filtered.forEach((log)=> replayListRoot.appendChild(buildMatchCard(log)));
  }

  function syncFilterButtons(){
    filterButtons.forEach((btn)=>{
      const active = String(btn.dataset.modeFilter || "") === activeFilter;
      btn.classList.toggle("isActive", active);
    });
  }

  function boot(){
    if (replayAccountBadge) replayAccountBadge.textContent = loadSessionLabel();
    filterButtons.forEach((btn)=>{
      btn.addEventListener("click", ()=>{
        activeFilter = String(btn.dataset.modeFilter || "all");
        syncFilterButtons();
        renderList().catch(()=>{});
      });
    });
    syncFilterButtons();
    renderList().catch(()=>{});
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once:true });
  }else{
    boot();
  }
})();
