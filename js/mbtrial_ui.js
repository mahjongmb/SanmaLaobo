(function(){
  "use strict";

  const MBTRIAL_SESSION_STORAGE_KEY = "mbsanma_mbtrial_active_session_v1";
  const MBTRIAL_DEVICE_ID_STORAGE_KEY = "mbsanma_mbtrial_device_id_v1";
  const MBTRIAL_COUPON_STORAGE_KEY = "mbsanma_mbtrial_coupon_v1";
  const MBTRIAL_USED_AT_STORAGE_KEY = "mbsanma_mbtrial_coupon_used_at_v1";

  let pendingHanchanCouponContext = null;

  injectMbTrialOverlayStyles();

  function generateRandomToken(length){
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const size = Math.max(1, length | 0);

    try{
      if (typeof crypto !== "undefined" && crypto.getRandomValues){
        const buf = new Uint32Array(size);
        crypto.getRandomValues(buf);
        let out = "";
        for (let i = 0; i < size; i++){
          out += chars[buf[i] % chars.length];
        }
        return out;
      }
    }catch(e){}

    let out = "";
    for (let i = 0; i < size; i++){
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
  }

  function getOrCreateDeviceId(){
    try{
      const existing = String(localStorage.getItem(MBTRIAL_DEVICE_ID_STORAGE_KEY) || "").trim();
      if (existing) return existing;
    }catch(e){}

    const deviceId = `MBT-${generateRandomToken(10)}`;
    try{ localStorage.setItem(MBTRIAL_DEVICE_ID_STORAGE_KEY, deviceId); }catch(e){}
    return deviceId;
  }

  function startMbTrialSession(){
    try{
      sessionStorage.setItem(MBTRIAL_SESSION_STORAGE_KEY, JSON.stringify({
        mode: "trial",
        startedAt: new Date().toISOString()
      }));
    }catch(e){}
  }

  function clearMbTrialSession(){
    try{ sessionStorage.removeItem(MBTRIAL_SESSION_STORAGE_KEY); }catch(e){}
  }

  function addMonths(date, months){
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + months);
    return next;
  }

  function toIsoStringSafe(value){
    try{
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      return d.toISOString();
    }catch(e){
      return "";
    }
  }

  function formatDateTimeLabel(value){
    try{
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
    }catch(e){
      return "—";
    }
  }

  function formatDateLabel(value){
    try{
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "—";
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}/${mm}/${dd}`;
    }catch(e){
      return "—";
    }
  }

  function formatSignedNumber(value, digits){
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const str = typeof digits === "number" ? n.toFixed(digits) : String(n);
    return `${n > 0 ? "+" : ""}${str}`;
  }

  function formatPoint(value){
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${Math.round(n).toLocaleString("ja-JP")}点`;
  }

  function formatChip(value){
    const n = Number(value) || 0;
    if (n > 0) return `+${n}枚`;
    if (n < 0) return `${n}枚`;
    return "0枚";
  }

  function normalizeCouponRecord(src){
    const next = (src && typeof src === "object") ? { ...src } : {};
    next.deviceId = String(next.deviceId || "");
    next.code = String(next.code || "");
    next.rankIndex = Number.isFinite(Number(next.rankIndex)) ? (Number(next.rankIndex) | 0) : 0;
    next.rankLabel = String(next.rankLabel || getRankLabel(next.rankIndex));
    next.rewardText = String(next.rewardText || getRewardText(next.rankIndex));
    next.issuedAt = String(next.issuedAt || "");
    next.expiresAt = String(next.expiresAt || "");
    next.status = String(next.status || "unused");
    next.point = Number.isFinite(Number(next.point)) ? Number(next.point) : null;
    next.finalScoreValue = Number.isFinite(Number(next.finalScoreValue)) ? Number(next.finalScoreValue) : null;
    next.chipCount = Number.isFinite(Number(next.chipCount)) ? Number(next.chipCount) : 0;
    next.reason = String(next.reason || "");
    next.usedAt = String(next.usedAt || next.used_at || "");
    next.updatedAt = String(next.updatedAt || next.updated_at || "");
    return next;
  }

  function loadCouponRecord(){
    try{
      const raw = localStorage.getItem(MBTRIAL_COUPON_STORAGE_KEY);
      if (!raw) return null;
      return normalizeCouponRecord(JSON.parse(raw));
    }catch(e){
      return null;
    }
  }

  function saveCouponRecord(record){
    const normalized = normalizeCouponRecord(record);
    try{ localStorage.setItem(MBTRIAL_COUPON_STORAGE_KEY, JSON.stringify(normalized)); }catch(e){}
    syncLocalUsedMarkerFromCoupon(normalized);
    return normalized;
  }

  function hasCouponApi(){
    return !!(window.MBTrialCouponApi && typeof window.MBTrialCouponApi.isConfigured === "function" && window.MBTrialCouponApi.isConfigured());
  }

  function clearLocalUsedMarker(){
    try{ localStorage.removeItem(MBTRIAL_USED_AT_STORAGE_KEY); }catch(e){}
  }

  function syncLocalUsedMarkerFromCoupon(record){
    const coupon = normalizeCouponRecord(record || null);
    if (!coupon.code){
      clearLocalUsedMarker();
      return;
    }

    if (coupon.status === "used" || coupon.usedAt){
      try{ localStorage.setItem(MBTRIAL_USED_AT_STORAGE_KEY, String(coupon.usedAt || new Date().toISOString())); }catch(e){}
      return;
    }

    clearLocalUsedMarker();
  }

  function getCouponStatus(record){
    const coupon = normalizeCouponRecord(record || loadCouponRecord());
    if (!coupon.code) return "none";

    const usedAt = coupon.usedAt || readCouponUsedAt();
    if (usedAt || coupon.status === "used") return "used";

    const expiresAt = Date.parse(coupon.expiresAt || "");
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt) return "expired";

    return "unused";
  }

  function readCouponUsedAt(){
    try{
      return String(localStorage.getItem(MBTRIAL_USED_AT_STORAGE_KEY) || "").trim();
    }catch(e){
      return "";
    }
  }

  async function fetchCouponRecordPreferRemote(){
    const cached = loadCouponRecord();
    if (!hasCouponApi()) return cached;

    try{
      const result = await window.MBTrialCouponApi.fetchCouponByDevice(getOrCreateDeviceId());
      if (result && !result.error && result.coupon && result.coupon.code){
        return saveCouponRecord(result.coupon);
      }
      if (result && result.error){
        console.warn("[mbtrial_ui] fetch coupon by device failed:", result.error.message || result.error);
      }
    }catch(error){
      console.warn("[mbtrial_ui] fetch coupon by device failed:", error);
    }

    return cached;
  }

  async function markCouponUsed(couponCode){
    const current = loadCouponRecord();
    const code = String(couponCode || (current && current.code) || "").trim();
    if (!code) return { coupon: current, error: null };

    if (!hasCouponApi()){
      try{ localStorage.setItem(MBTRIAL_USED_AT_STORAGE_KEY, new Date().toISOString()); }catch(e){}
      if (current){
        current.status = "used";
        current.usedAt = new Date().toISOString();
        saveCouponRecord(current);
      }
      return { coupon: current ? normalizeCouponRecord(current) : null, error: null };
    }

    try{
      const result = await window.MBTrialCouponApi.markCouponUsed(code);
      if (result && !result.error && result.coupon){
        return { coupon: saveCouponRecord(result.coupon), error: null };
      }
      return { coupon: current, error: result ? result.error : new Error("coupon_use_failed") };
    }catch(error){
      return { coupon: current, error: error instanceof Error ? error : new Error(String(error || "coupon_use_failed")) };
    }
  }

  function getRankLabel(rankIndex){
    if (rankIndex === 0) return "1着";
    if (rankIndex === 1) return "2着";
    return "3着";
  }

  function getRewardText(rankIndex){
    if (rankIndex === 0) return "2ゲームサービス";
    if (rankIndex === 1) return "1ゲームサービス";
    return "ドリンク代無料";
  }

  function getCouponStatusLabel(status){
    if (status === "used") return "使用済み";
    if (status === "expired") return "期限切れ";
    if (status === "unused") return "未使用";
    return "未発行";
  }

  function getCouponStatusClass(status){
    if (status === "used") return "is-used";
    if (status === "expired") return "is-expired";
    return "is-unused";
  }

  function buildCouponCode(deviceId){
    const tail = String(deviceId || "").replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase().padStart(4, "0");
    const stamp = new Date();
    const y = String(stamp.getFullYear()).slice(-2);
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    return `MB-${y}${m}${d}-${tail}-${generateRandomToken(4)}`;
  }

  function getFinalScoreArrayForCoupon(settlement){
    const base = (Array.isArray(settlement && settlement.afterScores) ? settlement.afterScores.slice(0, 3) : null)
      || (Array.isArray(window.scores) ? window.scores.slice(0, 3) : [0, 0, 0]);

    try{
      if (typeof getNoBustAdjustedScoresForSettlement === "function"){
        const adjusted = getNoBustAdjustedScoresForSettlement(base, settlement);
        if (Array.isArray(adjusted) && adjusted.length === 3) return adjusted.slice(0, 3);
      }
    }catch(e){}

    return base.slice(0, 3);
  }

  function getPlayerRankAndRows(afterScores){
    const scoresArr = Array.isArray(afterScores) ? afterScores.slice(0, 3) : [0, 0, 0];
    const rows = [0, 1, 2].map((seat)=> ({ seat, score: Number(scoresArr[seat]) || 0 }));
    rows.sort((a, b)=> b.score - a.score || a.seat - b.seat);
    const playerIndex = rows.findIndex((row)=> row.seat === 0);
    return { rows, playerIndex: playerIndex >= 0 ? playerIndex : 2 };
  }

  function getSeatStat(seatIndex, key){
    try{
      if (typeof getHanchanEndSeatStatNumber === "function"){
        const value = getHanchanEndSeatStatNumber(seatIndex, key);
        if (Number.isFinite(value)) return value | 0;
      }
    }catch(e){}
    return 0;
  }

  function buildCouponFromSettlement(endInfo, settlement){
    const finalScores = getFinalScoreArrayForCoupon(settlement);
    const rankInfo = getPlayerRankAndRows(finalScores);
    const rankIndex = rankInfo.playerIndex;
    const point = Number(finalScores[0]) || 0;
    const chipCount = getSeatStat(0, "chip");

    let finalScoreValue = null;
    try{
      if (typeof calcHanchanFinalScoreValue === "function"){
        finalScoreValue = calcHanchanFinalScoreValue(point, rankIndex, rankInfo.rows);
      }
    }catch(e){
      finalScoreValue = null;
    }

    const issuedAt = new Date();
    const expiresAt = addMonths(issuedAt, 1);

    return normalizeCouponRecord({
      deviceId: getOrCreateDeviceId(),
      code: buildCouponCode(getOrCreateDeviceId()),
      rankIndex,
      rankLabel: getRankLabel(rankIndex),
      rewardText: getRewardText(rankIndex),
      issuedAt: toIsoStringSafe(issuedAt),
      expiresAt: toIsoStringSafe(expiresAt),
      status: "unused",
      point,
      finalScoreValue,
      chipCount,
      reason: endInfo && endInfo.reason ? endInfo.reason : "半荘終了"
    });
  }

  async function issueCouponIfNeeded(endInfo, settlement){
    const existing = await fetchCouponRecordPreferRemote();
    if (existing && existing.code){
      return {
        coupon: normalizeCouponRecord(existing),
        newlyIssued: false
      };
    }

    const created = buildCouponFromSettlement(endInfo, settlement);

    if (!hasCouponApi()){
      return {
        coupon: saveCouponRecord(created),
        newlyIssued: true
      };
    }

    try{
      const result = await window.MBTrialCouponApi.issueCoupon(created);
      if (result && !result.error && result.coupon){
        return {
          coupon: saveCouponRecord(result.coupon),
          newlyIssued: !!result.newlyIssued
        };
      }
      console.warn("[mbtrial_ui] issue coupon failed:", result && result.error ? (result.error.message || result.error) : "issue_failed");
    }catch(error){
      console.warn("[mbtrial_ui] issue coupon failed:", error);
    }

    return {
      coupon: saveCouponRecord(created),
      newlyIssued: true
    };
  }

  function injectMbTrialOverlayStyles(){
    if (document.getElementById("mbTrialUiStyle")) return;
    const style = document.createElement("style");
    style.id = "mbTrialUiStyle";
    style.textContent = `
      .mbTrialOverlay{
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.58);
        z-index: 6000;
        box-sizing: border-box;
      }
      .mbTrialOverlay.isOpen{
        display: flex;
      }
      .mbTrialPanel{
        width: min(760px, 94vw);
        max-height: 88vh;
        overflow: auto;
        border-radius: 20px;
        border: 1px solid rgba(255,255,255,0.14);
        background: linear-gradient(180deg, rgba(20,32,26,0.98) 0%, rgba(12,18,15,0.98) 100%);
        box-shadow: 0 22px 56px rgba(0,0,0,0.42);
        color: #f5f7f4;
        padding: 20px;
        box-sizing: border-box;
      }
      .mbTrialPanelHeader{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .mbTrialPanelTitleWrap{
        display: grid;
        gap: 4px;
      }
      .mbTrialPanelTitle{
        font-size: 24px;
        font-weight: 900;
        line-height: 1.15;
      }
      .mbTrialPanelSub{
        font-size: 12px;
        line-height: 1.5;
        color: rgba(245,247,244,0.68);
      }
      .mbTrialPanelClose{
        appearance: none;
        border: 0;
        border-radius: 999px;
        min-width: 42px;
        height: 42px;
        padding: 0 14px;
        background: rgba(255,255,255,0.10);
        color: #ffffff;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .mbTrialGuideGrid,
      .mbTrialRuleCards,
      .mbTrialCouponSummary,
      .mbTrialCouponMeta,
      .mbTrialCouponNotes{
        display: grid;
        gap: 12px;
      }
      .mbTrialGuideCard,
      .mbTrialRuleCard,
      .mbTrialCouponCard,
      .mbTrialEmptyCard{
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(255,255,255,0.05);
        padding: 14px;
      }
      .mbTrialGuideCardTitle,
      .mbTrialRuleCardTitle,
      .mbTrialCouponCardTitle{
        font-size: 16px;
        font-weight: 900;
        margin-bottom: 8px;
      }
      .mbTrialGuideLine,
      .mbTrialRuleLine,
      .mbTrialCouponLine,
      .mbTrialEmptyText{
        font-size: 14px;
        line-height: 1.75;
        color: rgba(245,247,244,0.90);
      }
      .mbTrialRewardGrid{
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .mbTrialRewardCard{
        border-radius: 16px;
        padding: 14px 12px;
        border: 1px solid rgba(255,255,255,0.10);
        background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));
        text-align: center;
      }
      .mbTrialRewardRank{
        font-size: 15px;
        font-weight: 900;
        color: #fff3c5;
        margin-bottom: 6px;
      }
      .mbTrialRewardText{
        font-size: 18px;
        font-weight: 900;
        color: #ffffff;
        line-height: 1.35;
      }
      .mbTrialRuleTabs{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 14px;
      }
      .mbTrialRuleTabBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(255,255,255,0.04);
        color: rgba(245,247,244,0.78);
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
      }
      .mbTrialRuleTabBtn.isActive{
        background: linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06)), rgba(76, 119, 98, 0.78);
        border-color: rgba(182, 227, 201, 0.24);
        color: #ffffff;
      }
      .mbTrialRulePanel{
        display: none;
      }
      .mbTrialRulePanel.isActive{
        display: block;
      }
      .mbTrialRulePills,
      .mbTrialYakuList{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .mbTrialRulePill,
      .mbTrialYakuItem,
      .mbTrialCouponStatus{
        display: inline-flex;
        align-items: center;
        min-height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 800;
      }
      .mbTrialRulePill,
      .mbTrialYakuItem{
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .mbTrialCouponHero{
        border-radius: 18px;
        padding: 18px;
        border: 1px solid rgba(255,255,255,0.12);
        background: linear-gradient(180deg, rgba(29,48,41,0.96), rgba(15,25,21,0.94));
        display: grid;
        gap: 12px;
      }
      .mbTrialCouponTop{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .mbTrialCouponRank{
        font-size: 28px;
        font-weight: 900;
        color: #fff3c5;
        line-height: 1;
      }
      .mbTrialCouponReward{
        font-size: 24px;
        font-weight: 900;
        color: #ffffff;
        line-height: 1.2;
      }
      .mbTrialCouponCodeBox{
        border-radius: 16px;
        padding: 14px;
        background: rgba(0,0,0,0.20);
        border: 1px dashed rgba(255,255,255,0.16);
      }
      .mbTrialCouponCodeLabel{
        font-size: 12px;
        font-weight: 800;
        color: rgba(245,247,244,0.72);
        margin-bottom: 6px;
      }
      .mbTrialCouponCodeValue{
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 0.06em;
        color: #ffffff;
        word-break: break-all;
      }
      .mbTrialCouponMetaGrid{
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .mbTrialCouponMetaItem{
        border-radius: 14px;
        padding: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
      }
      .mbTrialCouponMetaLabel{
        font-size: 11px;
        font-weight: 800;
        color: rgba(245,247,244,0.70);
        margin-bottom: 4px;
      }
      .mbTrialCouponMetaValue{
        font-size: 16px;
        font-weight: 900;
        color: #ffffff;
      }
      .mbTrialCouponStatus.is-unused{
        background: rgba(118,214,170,0.14);
        border: 1px solid rgba(118,214,170,0.24);
        color: #eafff2;
      }
      .mbTrialCouponStatus.is-used{
        background: rgba(255,213,111,0.14);
        border: 1px solid rgba(255,213,111,0.26);
        color: #fff4c9;
      }
      .mbTrialCouponStatus.is-expired{
        background: rgba(255,132,132,0.12);
        border: 1px solid rgba(255,132,132,0.24);
        color: #ffdada;
      }
      .mbTrialCouponNotes{
        margin-top: 2px;
      }
      .mbTrialCouponNote{
        padding: 12px 13px;
        border-radius: 12px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 13px;
        line-height: 1.7;
        color: rgba(245,247,244,0.84);
      }
      .mbTrialCouponActions{
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 14px;
      }
      .mbTrialActionBtn{
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 999px;
        min-height: 42px;
        padding: 0 18px;
        background: rgba(255,255,255,0.05);
        color: #ffffff;
        font-size: 14px;
        font-weight: 800;
        cursor: pointer;
      }
      .mbTrialActionBtn.isPrimary{
        border-color: rgba(255,214,111,0.28);
        background: linear-gradient(180deg, rgba(255,214,111,0.20), rgba(255,214,111,0.10));
        color: #fff4c9;
      }
      .mbTrialRuleNotice,
      .mbTrialRuleFootnote{
        margin-top: 10px;
        font-size: 12px;
        line-height: 1.65;
        color: rgba(245,247,244,0.72);
      }
      @media (max-width: 640px){
        .mbTrialOverlay{
          padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom)) 10px;
          align-items: stretch;
        }
        .mbTrialPanel{
          width: 100%;
          max-height: none;
          height: 100%;
          border-radius: 16px;
          padding: 14px 12px 16px;
        }
        .mbTrialPanelHeader{
          align-items: flex-start;
        }
        .mbTrialPanelTitle{
          font-size: 20px;
        }
        .mbTrialPanelSub{
          font-size: 11px;
        }
        .mbTrialRuleTabs{
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .mbTrialRuleTabBtn{
          min-height: 40px;
          padding: 0 10px;
          font-size: 12px;
        }
        .mbTrialRewardGrid,
        .mbTrialCouponMetaGrid{
          grid-template-columns: 1fr;
        }
        .mbTrialCouponRank{
          font-size: 24px;
        }
        .mbTrialCouponReward{
          font-size: 20px;
        }
        .mbTrialCouponCodeValue{
          font-size: 18px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function makeOverlayShell(id, title, subtitle){
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "mbTrialOverlay";
    overlay.setAttribute("aria-hidden", "true");

    const panel = document.createElement("div");
    panel.className = "mbTrialPanel";
    panel.addEventListener("click", (ev)=> ev.stopPropagation());

    const header = document.createElement("div");
    header.className = "mbTrialPanelHeader";

    const titleWrap = document.createElement("div");
    titleWrap.className = "mbTrialPanelTitleWrap";

    const titleEl = document.createElement("div");
    titleEl.className = "mbTrialPanelTitle";
    titleEl.textContent = title;

    const subEl = document.createElement("div");
    subEl.className = "mbTrialPanelSub";
    subEl.textContent = subtitle || "";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mbTrialPanelClose";
    closeBtn.textContent = "閉じる";

    titleWrap.appendChild(titleEl);
    titleWrap.appendChild(subEl);
    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    overlay.appendChild(panel);

    overlay.addEventListener("click", ()=> closeOverlay(overlay));
    closeBtn.addEventListener("click", ()=> closeOverlay(overlay));

    document.body.appendChild(overlay);
    return { overlay, panel, closeBtn };
  }

  function openOverlay(overlay){
    if (!overlay) return;
    overlay.classList.add("isOpen");
    overlay.setAttribute("aria-hidden", "false");
  }

  function closeOverlay(overlay){
    if (!overlay) return;
    overlay.classList.remove("isOpen");
    overlay.setAttribute("aria-hidden", "true");
  }

  function ensureGuideOverlay(){
    let overlay = document.getElementById("mbTrialGuideOverlay");
    if (overlay) return overlay;

    const shell = makeOverlayShell(
      "mbTrialGuideOverlay",
      "チャレンジ案内",
      "1半荘チャレンジの流れと、クーポンの扱いです。"
    );

    const root = document.createElement("div");
    root.className = "mbTrialGuideGrid";
    root.innerHTML = `
      <div class="mbTrialGuideCard">
        <div class="mbTrialGuideCardTitle">このチャレンジについて</div>
        <div class="mbTrialGuideLine"><strong>当店のフリーと同じルール</strong>で遊べる、店外版の <strong>1半荘チャレンジ</strong> です。半荘終了後、着順に応じて来店特典クーポンを発行します。</div>
      </div>
      <div class="mbTrialGuideCard">
        <div class="mbTrialGuideCardTitle">着順ごとの特典</div>
        <div class="mbTrialRewardGrid">
          <div class="mbTrialRewardCard">
            <div class="mbTrialRewardRank">1着</div>
            <div class="mbTrialRewardText">2ゲームサービス</div>
          </div>
          <div class="mbTrialRewardCard">
            <div class="mbTrialRewardRank">2着</div>
            <div class="mbTrialRewardText">1ゲームサービス</div>
          </div>
          <div class="mbTrialRewardCard">
            <div class="mbTrialRewardRank">3着</div>
            <div class="mbTrialRewardText">ドリンク代無料</div>
          </div>
        </div>
      </div>
      <div class="mbTrialGuideCard">
        <div class="mbTrialGuideCardTitle">クーポン発行のルール</div>
        <div class="mbTrialGuideLine">クーポン発行は <strong>この端末で最初の1回だけ</strong> です。再プレイはできますが、新しいクーポンは発行されません。</div>
        <div class="mbTrialGuideLine">クーポンの有効期限は <strong>発行から1か月</strong>。店頭でクーポン画面をご提示ください。</div>
      </div>
      <div class="mbTrialGuideCard">
        <div class="mbTrialGuideCardTitle">クーポン表示とブラウザについて</div>
        <div class="mbTrialGuideLine">トップページとプレイ画面の <strong>取得クーポン</strong> ボタンから、いつでも現在のクーポンを再表示できます。</div>
        <div class="mbTrialGuideLine"><strong>クーポンは遊んだブラウザ内で保存されます。</strong> 途中でSafariや別ブラウザに切り替えると、取得済みクーポンが表示されない場合があります。できればホーム画面に追加して、同じ画面から最後まで遊んでください。</div>
      </div>
    `;

    shell.panel.appendChild(root);
    return shell.overlay;
  }

  function ensureRuleOverlay(){
    let overlay = document.getElementById("mbTrialRuleOverlay");
    if (overlay) return overlay;

    const shell = makeOverlayShell(
      "mbTrialRuleOverlay",
      "ルール",
      "MBの三麻ルールをプレイ画面から確認できます。"
    );
    overlay = shell.overlay;

    const tabData = [
      {
        key: "outline",
        label: "概要",
        cards: [
          {
            title: "ゲームの大枠",
            lines: [
              "東南戦",
              "35,000点持ち / 40,000点返し",
              "箱下精算なし",
              "80,000点以上でコールド終了",
              "0点ちょうどは飛び扱い",
              "1,000点ちょうどのリーチは可能"
            ]
          },
          {
            title: "レート・祝儀",
            lines: [
              "1000点100P",
              "一発・赤・裏 各200P",
              "役満祝儀 ツモ2,000Pオール / ロン3,000P"
            ]
          }
        ]
      },
      {
        key: "settlement",
        label: "点数・精算",
        cards: [
          {
            title: "順位ウマ",
            lines: [
              "通常時 1位 +15 / 2位 -5 / 3位 -10",
              "2着が40,000点以上の場合 1位 +10 / 2位 +5 / 3位 -15"
            ]
          },
          {
            title: "アガリ・供託まわり",
            lines: [
              "一本場 1,000点",
              "親は聴牌連荘",
              "形式聴牌あり"
            ]
          },
          {
            title: "ドラ・祝儀牌",
            pills: ["赤5索 × 2", "赤5筒 × 2", "北抜きドラ", "虹北 × 1"],
            notice: "虹北のみ、鳴き祝儀が1枚つきます。"
          }
        ]
      },
      {
        key: "basic",
        label: "基本",
        cards: [
          {
            title: "進行・アガリまわり",
            lines: [
              "親は聴牌連荘",
              "形式聴牌あり",
              "北抜きドラ / 喰いタン / 後付け / ツモピンあり",
              "虹北のみ鳴き祝儀1枚",
              "ツモ損なし",
              "符計算あり",
              "途中流局なし"
            ]
          },
          {
            title: "リーチ・山・終了条件",
            lines: [
              "リーチ後の見逃しあり",
              "フリテンリーチあり",
              "山は七トン残し",
              "80,000点以上でコールド終了",
              "ダブロンあり"
            ]
          }
        ]
      },
      {
        key: "supplement",
        label: "補足",
        cards: [
          {
            title: "役・アガリ関係",
            lines: [
              "数え役満あり（祝儀なし）",
              "ダブル役満あり",
              "大三元・四喜和のパオなし",
              "流し倍満あり",
              "人和は4翻役"
            ]
          },
          {
            title: "槓・リーチ関係",
            lines: [
              "大明槓の責任払いなし",
              "国士無双の暗槓ロンなし",
              "オープンリーチなし",
              "リーチ後の暗槓は待ちが変わらなければ可能",
              "全ての槓はドラ先めくり"
            ]
          },
          {
            title: "符・北について",
            lines: [
              "連風牌の雀頭は2符",
              "自摸番がなくてもリーチ可能",
              "北は抜きドラ",
              "北の手中利用には制限あり"
            ]
          }
        ]
      },
      {
        key: "yaku",
        label: "採用役",
        yakuGroups: [
          {
            title: "1翻役",
            items: ["立直", "一発", "門前清自摸和", "断么九", "平和", "一盃口", "役牌（白・發・中・場風・自風）", "海底摸月", "河底撈魚", "嶺上開花", "槍槓"]
          },
          {
            title: "2翻役",
            items: ["ダブル立直", "七対子", "対々和", "三暗刻", "三色同刻", "三槓子", "混全帯么九", "一気通貫", "混老頭", "小三元", "混一色"]
          },
          {
            title: "3翻以上",
            items: ["二盃口", "純全帯么九", "清一色", "人和（4翻役）"]
          },
          {
            title: "役満",
            items: ["国士無双", "四暗刻", "大三元", "字一色", "緑一色", "清老頭", "小四喜", "大四喜", "九蓮宝燈", "四槓子", "天和", "地和"]
          }
        ],
        footnote: "※ 北は役牌としては採用していません。※ 三色同順は三麻では基本的に出現しません。"
      }
    ];

    const tabs = document.createElement("div");
    tabs.className = "mbTrialRuleTabs";

    const panels = document.createElement("div");
    const tabButtons = [];
    const panelEls = [];

    const setActiveTab = (key)=>{
      tabButtons.forEach((btn)=> btn.classList.toggle("isActive", btn.dataset.ruleTabKey === key));
      panelEls.forEach((panel)=> panel.classList.toggle("isActive", panel.dataset.rulePanelKey === key));
    };

    tabData.forEach((tab)=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mbTrialRuleTabBtn";
      btn.textContent = tab.label;
      btn.dataset.ruleTabKey = tab.key;
      btn.addEventListener("click", ()=> setActiveTab(tab.key));
      tabButtons.push(btn);
      tabs.appendChild(btn);

      const panel = document.createElement("div");
      panel.className = "mbTrialRulePanel";
      panel.dataset.rulePanelKey = tab.key;

      if (Array.isArray(tab.cards) && tab.cards.length > 0){
        const list = document.createElement("div");
        list.className = "mbTrialRuleCards";
        tab.cards.forEach((cardData)=>{
          const card = document.createElement("div");
          card.className = "mbTrialRuleCard";
          const title = document.createElement("div");
          title.className = "mbTrialRuleCardTitle";
          title.textContent = cardData.title || "";
          card.appendChild(title);

          if (Array.isArray(cardData.lines) && cardData.lines.length > 0){
            cardData.lines.forEach((lineText)=>{
              const line = document.createElement("div");
              line.className = "mbTrialRuleLine";
              line.textContent = lineText;
              card.appendChild(line);
            });
          }

          if (Array.isArray(cardData.pills) && cardData.pills.length > 0){
            const pills = document.createElement("div");
            pills.className = "mbTrialRulePills";
            cardData.pills.forEach((pillText)=>{
              const pill = document.createElement("div");
              pill.className = "mbTrialRulePill";
              pill.textContent = pillText;
              pills.appendChild(pill);
            });
            card.appendChild(pills);
          }

          if (cardData.notice){
            const notice = document.createElement("div");
            notice.className = "mbTrialRuleNotice";
            notice.textContent = cardData.notice;
            card.appendChild(notice);
          }

          list.appendChild(card);
        });
        panel.appendChild(list);
      }

      if (Array.isArray(tab.yakuGroups) && tab.yakuGroups.length > 0){
        const groupWrap = document.createElement("div");
        groupWrap.className = "mbTrialRuleCards";
        tab.yakuGroups.forEach((group)=>{
          const card = document.createElement("div");
          card.className = "mbTrialRuleCard";
          const title = document.createElement("div");
          title.className = "mbTrialRuleCardTitle";
          title.textContent = group.title || "";
          card.appendChild(title);
          const list = document.createElement("div");
          list.className = "mbTrialYakuList";
          (group.items || []).forEach((itemText)=>{
            const item = document.createElement("div");
            item.className = "mbTrialYakuItem";
            item.textContent = itemText;
            list.appendChild(item);
          });
          card.appendChild(list);
          groupWrap.appendChild(card);
        });
        if (tab.footnote){
          const footnote = document.createElement("div");
          footnote.className = "mbTrialRuleFootnote";
          footnote.textContent = tab.footnote;
          groupWrap.appendChild(footnote);
        }
        panel.appendChild(groupWrap);
      }

      panelEls.push(panel);
      panels.appendChild(panel);
    });

    shell.panel.appendChild(tabs);
    shell.panel.appendChild(panels);
    if (tabData[0]) setActiveTab(tabData[0].key);
    return overlay;
  }

  function ensureCouponOverlay(){
    let overlay = document.getElementById("mbTrialCouponOverlay");
    if (overlay) return overlay;

    const shell = makeOverlayShell(
      "mbTrialCouponOverlay",
      "取得クーポン",
      "店頭でこの画面をご提示ください。"
    );

    const root = document.createElement("div");
    root.id = "mbTrialCouponRoot";
    shell.panel.appendChild(root);
    return shell.overlay;
  }

  function renderCouponLoadingState(message){
    const overlay = ensureCouponOverlay();
    const root = document.getElementById("mbTrialCouponRoot");
    if (!root) return overlay;
    root.innerHTML = `
      <div class="mbTrialEmptyCard">
        <div class="mbTrialCouponCardTitle">取得クーポン</div>
        <div class="mbTrialEmptyText">${message || "クーポン情報を読み込み中です..."}</div>
      </div>
    `;
    openOverlay(overlay);
    return overlay;
  }

  function renderCouponOverlay(options){
    const overlay = ensureCouponOverlay();
    const root = document.getElementById("mbTrialCouponRoot");
    if (!root) return overlay;

    const coupon = normalizeCouponRecord((options && options.coupon) || loadCouponRecord());
    const status = getCouponStatus(coupon);
    const newlyIssued = !!(options && options.newlyIssued);
    const fromEnd = !!(options && options.fromEnd);

    root.innerHTML = "";

    if (!coupon.code){
      const empty = document.createElement("div");
      empty.className = "mbTrialEmptyCard";
      empty.innerHTML = `
        <div class="mbTrialCouponCardTitle">まだクーポンはありません</div>
        <div class="mbTrialEmptyText">この端末では、1半荘チャレンジを最後まで遊ぶと初回のみクーポンが発行されます。</div>
      `;
      root.appendChild(empty);
      openOverlay(overlay);
      return overlay;
    }

    const hero = document.createElement("div");
    hero.className = "mbTrialCouponHero";
    hero.innerHTML = `
      <div class="mbTrialCouponTop">
        <div>
          <div class="mbTrialCouponRank">${coupon.rankLabel}</div>
          <div class="mbTrialCouponReward">${coupon.rewardText}</div>
        </div>
        <div class="mbTrialCouponStatus ${getCouponStatusClass(status)}">${getCouponStatusLabel(status)}</div>
      </div>
      <div class="mbTrialCouponCodeBox">
        <div class="mbTrialCouponCodeLabel">クーポンコード</div>
        <div class="mbTrialCouponCodeValue">${coupon.code}</div>
      </div>
    `;
    root.appendChild(hero);

    const summary = document.createElement("div");
    summary.className = "mbTrialCouponSummary";

    const infoCard = document.createElement("div");
    infoCard.className = "mbTrialCouponCard";
    infoCard.innerHTML = `
      <div class="mbTrialCouponCardTitle">クーポン情報</div>
      <div class="mbTrialCouponMetaGrid">
        <div class="mbTrialCouponMetaItem">
          <div class="mbTrialCouponMetaLabel">発行日</div>
          <div class="mbTrialCouponMetaValue">${formatDateLabel(coupon.issuedAt)}</div>
        </div>
        <div class="mbTrialCouponMetaItem">
          <div class="mbTrialCouponMetaLabel">有効期限</div>
          <div class="mbTrialCouponMetaValue">${formatDateLabel(coupon.expiresAt)}</div>
        </div>
        <div class="mbTrialCouponMetaItem">
          <div class="mbTrialCouponMetaLabel">最終持ち点</div>
          <div class="mbTrialCouponMetaValue">${formatPoint(coupon.point)}</div>
        </div>
        <div class="mbTrialCouponMetaItem">
          <div class="mbTrialCouponMetaLabel">最終スコア</div>
          <div class="mbTrialCouponMetaValue">${formatSignedNumber(coupon.finalScoreValue, 1)}</div>
        </div>
      </div>
    `;
    summary.appendChild(infoCard);

    const noteCard = document.createElement("div");
    noteCard.className = "mbTrialCouponCard";
    const notes = [];
    if (newlyIssued){
      notes.push("この端末での初回クーポンを発行しました。スクリーンショットを保存しておくとスムーズです。");
    } else if (fromEnd){
      notes.push("この端末ではすでにクーポン取得済みです。再プレイはできますが、新しいクーポンは発行されません。");
    }
    notes.push("店頭でこの画面をご提示ください。クーポンの有効期限は発行から1か月です。");
    notes.push("他サービスとの併用や運用の最終判断は店頭にてご確認ください。");
    noteCard.innerHTML = `<div class="mbTrialCouponCardTitle">案内</div>`;
    const notesWrap = document.createElement("div");
    notesWrap.className = "mbTrialCouponNotes";
    notes.forEach((text)=>{
      const item = document.createElement("div");
      item.className = "mbTrialCouponNote";
      item.textContent = text;
      notesWrap.appendChild(item);
    });
    noteCard.appendChild(notesWrap);
    summary.appendChild(noteCard);
    root.appendChild(summary);

    const actions = document.createElement("div");
    actions.className = "mbTrialCouponActions";
    if (fromEnd){
      const topBtn = document.createElement("button");
      topBtn.type = "button";
      topBtn.className = "mbTrialActionBtn isPrimary";
      topBtn.textContent = "トップへ戻る";
      topBtn.addEventListener("click", ()=>{
        clearMbTrialSession();
        location.href = "../public/index_mbtrial.html";
      });
      actions.appendChild(topBtn);
    }
    root.appendChild(actions);

    openOverlay(overlay);
    return overlay;
  }

  function openGuideOverlay(){
    openOverlay(ensureGuideOverlay());
  }

  function openRuleOverlay(){
    openOverlay(ensureRuleOverlay());
  }

  async function openCouponOverlay(options){
    const opts = options && typeof options === "object" ? { ...options } : {};
    renderCouponLoadingState("クーポン情報を読み込み中です...");

    let coupon = opts.coupon ? normalizeCouponRecord(opts.coupon) : null;
    if (!coupon || !coupon.code){
      coupon = await fetchCouponRecordPreferRemote();
    }

    renderCouponOverlay({
      ...opts,
      coupon
    });
  }

  function replaceButtonWithClone(btn){
    if (!btn || !btn.parentNode) return btn;
    const clone = btn.cloneNode(true);
    btn.parentNode.replaceChild(clone, btn);
    return clone;
  }

  function installTopPageButtons(){
    const startBtn = document.getElementById("startMbTrialBtn");
    if (startBtn){
      startBtn.addEventListener("click", ()=>{
        startMbTrialSession();
        location.href = "../trial/play_mbtrial.html";
      });
    }

    const guideBtn = document.getElementById("openMbTrialGuideBtn");
    if (guideBtn){
      guideBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        openGuideOverlay();
      });
    }

    const couponBtn = document.getElementById("openMbTrialCouponBtn");
    if (couponBtn){
      couponBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        openCouponOverlay({ fromEnd: false });
      });
    }
  }

  function installPlayTopButtons(){
    let guideBtn = document.getElementById("newBtn");
    guideBtn = replaceButtonWithClone(guideBtn);
    if (guideBtn){
      guideBtn.textContent = "チャレンジ案内";
      guideBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openGuideOverlay();
      }, true);
    }

    let ruleBtn = document.getElementById("debugOpenBtn");
    ruleBtn = replaceButtonWithClone(ruleBtn);
    if (ruleBtn){
      ruleBtn.textContent = "ルール";
      ruleBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openRuleOverlay();
      }, true);
    }

    let couponBtn = document.getElementById("settingsBtn");
    couponBtn = replaceButtonWithClone(couponBtn);
    if (couponBtn){
      couponBtn.textContent = "取得クーポン";
      couponBtn.addEventListener("click", (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        openCouponOverlay({ fromEnd: false });
      }, true);
    }
  }

  function installCouponReturnFlow(){
    const overlay = document.getElementById("hanchanEndOverlay");
    if (!overlay || overlay.__mbTrialCouponBound) return;
    overlay.__mbTrialCouponBound = true;

    overlay.addEventListener("click", ()=>{
      if (!pendingHanchanCouponContext) return;
      const context = pendingHanchanCouponContext;
      pendingHanchanCouponContext = null;
      window.setTimeout(async ()=>{
        try{
          const issueResult = await issueCouponIfNeeded(context.endInfo, context.settlement);
          await openCouponOverlay({
            coupon: issueResult.coupon,
            newlyIssued: issueResult.newlyIssued,
            fromEnd: true
          });
        }catch(error){
          console.warn("[mbtrial_ui] coupon overlay open failed:", error);
          await openCouponOverlay({ fromEnd: true });
        }
      }, 0);
    }, true);
  }

  function installSettlementHooks(){
    if (typeof showHanchanEndOverlay === "function" && !showHanchanEndOverlay.__mbTrialWrapped){
      const originalShow = showHanchanEndOverlay;
      const wrappedShow = function(endInfo, settlement){
        const result = originalShow.apply(this, arguments);
        pendingHanchanCouponContext = { endInfo, settlement };
        installCouponReturnFlow();
        return result;
      };
      wrappedShow.__mbTrialWrapped = true;
      showHanchanEndOverlay = wrappedShow;
    }
  }

  function installEscapeClose(){
    document.addEventListener("keydown", (ev)=>{
      if (!ev || ev.key !== "Escape") return;
      ["mbTrialGuideOverlay", "mbTrialRuleOverlay", "mbTrialCouponOverlay"].forEach((id)=>{
        const overlay = document.getElementById(id);
        if (overlay && overlay.classList.contains("isOpen")) closeOverlay(overlay);
      });
    });
  }

  function exposeDebugHelpers(){
    try{
      window.markMbTrialCouponUsed = async function(code){
        return markCouponUsed(code);
      };
      window.clearMbTrialCoupon = function(){
        try{ localStorage.removeItem(MBTRIAL_COUPON_STORAGE_KEY); }catch(e){}
        try{ localStorage.removeItem(MBTRIAL_USED_AT_STORAGE_KEY); }catch(e){}
      };
      window.refreshMbTrialCoupon = async function(){
        return fetchCouponRecordPreferRemote();
      };
    }catch(e){}
  }

  function boot(){
    getOrCreateDeviceId();
    ensureGuideOverlay();
    ensureRuleOverlay();
    ensureCouponOverlay();
    installTopPageButtons();
    installPlayTopButtons();
    installSettlementHooks();
    installEscapeClose();
    exposeDebugHelpers();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }else{
    boot();
  }
})();
