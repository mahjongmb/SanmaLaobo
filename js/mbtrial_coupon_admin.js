(function(){
  "use strict";

  function $(id){
    return document.getElementById(id);
  }

  const LIST_LIMIT = 50;
  let currentCoupon = null;
  let currentCoupons = [];

  function formatDateTime(value){
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

  function getEffectiveStatus(status, expiresAt){
    if (status === "used") return "used";
    const expires = Date.parse(expiresAt || "");
    if (Number.isFinite(expires) && Date.now() > expires) return "expired";
    return "unused";
  }

  function getStatusLabel(status, expiresAt){
    const effective = getEffectiveStatus(status, expiresAt);
    if (effective === "used") return "使用済み";
    if (effective === "expired") return "期限切れ";
    return "未使用";
  }

  function getStatusClass(status, expiresAt){
    const effective = getEffectiveStatus(status, expiresAt);
    if (effective === "used") return "is-used";
    if (effective === "expired") return "is-expired";
    return "is-unused";
  }

  function escapeHtml(value){
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setMessage(text, isError){
    const el = $("couponAdminMessage");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function setBusy(busy){
    [
      $("couponCodeInput"),
      $("searchCouponBtn"),
      $("markCouponUsedBtn"),
      $("refreshCouponListBtn"),
      $("unusedOnlyCheckbox")
    ].forEach((el)=>{
      if (el) el.disabled = !!busy;
    });
  }

  function selectCoupon(code){
    const normalized = String(code || "").trim().toUpperCase();
    const found = currentCoupons.find((coupon)=> String(coupon.code || "").toUpperCase() === normalized) || null;
    currentCoupon = found;
    renderCoupon(found);
    const input = $("couponCodeInput");
    if (input && found) input.value = found.code;
    highlightSelectedRow(found ? found.code : "");
  }

  function highlightSelectedRow(code){
    const normalized = String(code || "").trim().toUpperCase();
    document.querySelectorAll("[data-admin-coupon-row]").forEach((row)=>{
      const rowCode = String(row.getAttribute("data-admin-coupon-row") || "").trim().toUpperCase();
      row.classList.toggle("is-selected", !!normalized && rowCode === normalized);
    });
  }

  function renderCoupon(coupon){
    const root = $("couponAdminResult");
    const markBtn = $("markCouponUsedBtn");
    if (!root || !markBtn) return;

    if (!coupon || !coupon.code){
      currentCoupon = null;
      root.innerHTML = `
        <div class="adminEmptyCard">
          <div class="adminEmptyTitle">クーポンを選択してください</div>
          <div class="adminEmptyText">コード検索をするか、下の一覧から1件選ぶと詳細が表示されます。</div>
        </div>
      `;
      markBtn.hidden = true;
      return;
    }

    currentCoupon = coupon;
    const statusLabel = getStatusLabel(coupon.status, coupon.expiresAt);
    const statusClass = getStatusClass(coupon.status, coupon.expiresAt);

    root.innerHTML = `
      <div class="adminCouponHero">
        <div>
          <div class="adminCouponRank">${escapeHtml(coupon.rankLabel || "—")}</div>
          <div class="adminCouponReward">${escapeHtml(coupon.rewardText || "—")}</div>
        </div>
        <div class="adminCouponStatus ${statusClass}">${statusLabel}</div>
      </div>

      <div class="adminCouponCodeBox">
        <div class="adminCouponCodeLabel">クーポンコード</div>
        <div class="adminCouponCodeValue">${escapeHtml(coupon.code || "—")}</div>
      </div>

      <div class="adminMetaGrid">
        <div class="adminMetaItem">
          <div class="adminMetaLabel">発行日</div>
          <div class="adminMetaValue">${formatDateTime(coupon.issuedAt)}</div>
        </div>
        <div class="adminMetaItem">
          <div class="adminMetaLabel">有効期限</div>
          <div class="adminMetaValue">${formatDateTime(coupon.expiresAt)}</div>
        </div>
        <div class="adminMetaItem">
          <div class="adminMetaLabel">端末ID</div>
          <div class="adminMetaValue adminMetaValueSmall">${escapeHtml(coupon.deviceId || "—")}</div>
        </div>
        <div class="adminMetaItem">
          <div class="adminMetaLabel">使用日時</div>
          <div class="adminMetaValue">${coupon.usedAt ? formatDateTime(coupon.usedAt) : "—"}</div>
        </div>
      </div>
    `;

    markBtn.hidden = false;
    markBtn.dataset.couponCode = coupon.code;
    markBtn.disabled = (getEffectiveStatus(coupon.status, coupon.expiresAt) !== "unused");
    highlightSelectedRow(coupon.code);
  }

  function renderCouponList(coupons){
    const root = $("couponAdminList");
    if (!root) return;

    if (!Array.isArray(coupons) || coupons.length <= 0){
      root.innerHTML = `
        <div class="adminListEmpty">
          条件に一致するクーポンはありません。
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="adminListTable">
        <div class="adminListHead">
          <div>コード</div>
          <div>着順</div>
          <div>特典</div>
          <div>発行日</div>
          <div>状態</div>
        </div>
        ${coupons.map((coupon)=>{
          const statusLabel = getStatusLabel(coupon.status, coupon.expiresAt);
          const statusClass = getStatusClass(coupon.status, coupon.expiresAt);
          return `
            <button type="button" class="adminListRow" data-admin-coupon-row="${escapeHtml(coupon.code || "")}">
              <div class="adminListCode">${escapeHtml(coupon.code || "—")}</div>
              <div class="adminListRank">${escapeHtml(coupon.rankLabel || "—")}</div>
              <div class="adminListReward">${escapeHtml(coupon.rewardText || "—")}</div>
              <div class="adminListIssued">${formatDateTime(coupon.issuedAt)}</div>
              <div><span class="adminCouponStatus ${statusClass}">${statusLabel}</span></div>
            </button>
          `;
        }).join("")}
      </div>
    `;

    root.querySelectorAll("[data-admin-coupon-row]").forEach((row)=>{
      row.addEventListener("click", ()=>{
        selectCoupon(row.getAttribute("data-admin-coupon-row") || "");
      });
    });

    highlightSelectedRow(currentCoupon ? currentCoupon.code : "");
  }

  async function loadCouponList(options){
    if (!window.MBTrialCouponApi || !window.MBTrialCouponApi.isConfigured()){
      setMessage("Supabase設定が未完了です。", true);
      renderCouponList([]);
      return;
    }

    const opts = (options && typeof options === "object") ? options : {};
    const onlyUnused = !!(($("unusedOnlyCheckbox") && $("unusedOnlyCheckbox").checked) || opts.onlyUnused);

    try{
      const result = await window.MBTrialCouponApi.fetchCouponList({
        onlyUnused,
        limit: LIST_LIMIT
      });
      if (result.error){
        setMessage(`一覧取得に失敗しました: ${result.error.message || result.error}`, true);
        renderCouponList([]);
        return;
      }

      currentCoupons = Array.isArray(result.coupons) ? result.coupons : [];
      renderCouponList(currentCoupons);

      if (currentCoupon && currentCoupon.code){
        const stillExists = currentCoupons.find((coupon)=> String(coupon.code || "").toUpperCase() === String(currentCoupon.code || "").toUpperCase());
        if (stillExists){
          renderCoupon(stillExists);
        } else {
          renderCoupon(null);
        }
      }
    }catch(error){
      setMessage(`一覧取得に失敗しました: ${error && error.message ? error.message : error}`, true);
      renderCouponList([]);
    }
  }

  async function searchCoupon(){
    const input = $("couponCodeInput");
    const code = String(input && input.value || "").trim().toUpperCase();
    if (!code){
      setMessage("クーポンコードを入力してください。", true);
      renderCoupon(null);
      return;
    }
    if (!window.MBTrialCouponApi || !window.MBTrialCouponApi.isConfigured()){
      setMessage("Supabase設定が未完了です。", true);
      return;
    }

    setBusy(true);
    setMessage("検索中...", false);
    try{
      const result = await window.MBTrialCouponApi.fetchCouponByCode(code);
      if (result.error){
        setMessage(`検索に失敗しました: ${result.error.message || result.error}`, true);
        renderCoupon(null);
        return;
      }
      if (!result.coupon){
        setMessage("クーポンが見つかりませんでした。", true);
        renderCoupon(null);
        return;
      }
      renderCoupon(result.coupon);
      setMessage("クーポンを読み込みました。", false);
      await loadCouponList();
    }catch(error){
      setMessage(`検索に失敗しました: ${error && error.message ? error.message : error}`, true);
      renderCoupon(null);
    }finally{
      setBusy(false);
    }
  }

  async function useCoupon(){
    const btn = $("markCouponUsedBtn");
    const code = String(btn && btn.dataset.couponCode || "").trim();
    if (!code){
      setMessage("先にクーポンを検索してください。", true);
      return;
    }
    if (!window.MBTrialCouponApi || !window.MBTrialCouponApi.isConfigured()){
      setMessage("Supabase設定が未完了です。", true);
      return;
    }

    setBusy(true);
    setMessage("使用済みに更新中...", false);
    try{
      const result = await window.MBTrialCouponApi.markCouponUsed(code);
      if (result.error){
        setMessage(`更新に失敗しました: ${result.error.message || result.error}`, true);
        return;
      }
      renderCoupon(result.coupon);
      setMessage("使用済みに更新しました。", false);
      await loadCouponList();
    }catch(error){
      setMessage(`更新に失敗しました: ${error && error.message ? error.message : error}`, true);
    }finally{
      setBusy(false);
    }
  }

  async function refreshList(){
    setBusy(true);
    setMessage("一覧を更新中...", false);
    try{
      await loadCouponList();
      setMessage("一覧を更新しました。", false);
    }finally{
      setBusy(false);
    }
  }

  function boot(){
    const searchBtn = $("searchCouponBtn");
    const useBtn = $("markCouponUsedBtn");
    const input = $("couponCodeInput");
    const refreshBtn = $("refreshCouponListBtn");
    const unusedOnly = $("unusedOnlyCheckbox");

    if (searchBtn) searchBtn.addEventListener("click", searchCoupon);
    if (useBtn) useBtn.addEventListener("click", useCoupon);
    if (refreshBtn) refreshBtn.addEventListener("click", refreshList);
    if (unusedOnly){
      unusedOnly.addEventListener("change", ()=>{
        void refreshList();
      });
    }
    if (input){
      input.addEventListener("keydown", (ev)=>{
        if (ev.key === "Enter"){
          ev.preventDefault();
          searchCoupon();
        }
      });
    }

    renderCoupon(null);
    void refreshList();
  }

  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  }else{
    boot();
  }
})();