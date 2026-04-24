// ========= render_stats.js（受け入れ/シャンテン表示：描画専用） =========
// 依存：statsEl, hand13, drawn, melds, isRiichi, isRiichiSelecting, riichiWait
//       countVisible(), countsFromTiles(), calcShanten(), calcImproveTilesFromCounts(), makeImgByCode()
//       isUkeireVisible（ON/OFFフラグ：core.js）

function _statsHide(){
  return (typeof isUkeireVisible !== "undefined" && !isUkeireVisible);
}

function _statsSetDisplay(isVisible){
  if (!statsEl) return;
  statsEl.style.display = isVisible ? "block" : "none";
}

function _statsSetRiichiPreviewMode(isActive){
  if (!statsEl) return;
  statsEl.classList.toggle("riichiPreviewMode", !!isActive);
}

function _statsClear(){
  if (!statsEl) return;
  statsEl.innerHTML = "";
  _statsSetDisplay(false);
}

function _statsShowIfNeeded(){
  if (!statsEl) return;
  const hasContent = (statsEl.innerHTML || "").trim() !== "";
  _statsSetDisplay(hasContent);
}

function _addLine(leftText, rightText){
  const line = document.createElement("div");
  line.className = "line";

  const a = document.createElement("span");
  const b = document.createElement("span");
  a.textContent = leftText || "";
  b.textContent = rightText || "";

  line.appendChild(a);
  line.appendChild(b);
  statsEl.appendChild(line);
}

function _buildTiles(list){
  const tiles = document.createElement("div");
  tiles.className = "tiles tiles4";

  for (const t of list){
    const chip = document.createElement("span");
    chip.className = "tileChip";

    const img = makeImgByCode(t.code);
    img.title = `${t.code}（残り${t.remain}枚）`;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = String(t.remain);

    chip.appendChild(img);
    chip.appendChild(badge);
    tiles.appendChild(chip);
  }

  return tiles;
}

function _formatRight(modeText, types, total){
  return `${modeText}:${types}種${total}枚`;
}

function _appendBlock(label, info, modeText){
  if (!info) return;
  if (!info.list || info.list.length === 0) return;

  const s = (typeof info.curShanten === "number") ? info.curShanten : "?";
  const types = (typeof info.types === "number") ? info.types : 0;
  const total = (typeof info.total === "number") ? info.total : 0;

  _addLine(`${label} Sh:${s}`, _formatRight(modeText, types, total));
  statsEl.appendChild(_buildTiles(info.list));
}

function _calcDualFromCounts(counts13, visible, fixedM){
  const curBest = calcShanten(counts13, fixedM);
  const mode = (curBest === 0) ? "machi" : "ukeire";
  const modeText = (mode === "machi") ? "待ち" : "受け入れ";

  const info = calcImproveTilesFromCounts(counts13, visible, mode, fixedM);
  const chi = info && info.breakdown ? (info.breakdown.chiitoi || null) : null;
  const nor = info && info.breakdown ? (info.breakdown.normal || null) : null;

  return { modeText, chi, nor };
}

function _tileSortIndex(code){
  if (typeof TYPE_TO_IDX !== "undefined" && TYPE_TO_IDX && TYPE_TO_IDX[code] != null){
    return TYPE_TO_IDX[code];
  }
  return code;
}

function _mergeTileInfoLists(lists){
  const map = new Map();

  for (const list of lists){
    if (!Array.isArray(list)) continue;
    for (const item of list){
      if (!item || !item.code) continue;
      const remain = Math.max(0, item.remain | 0);
      const prev = map.get(item.code) || 0;
      map.set(item.code, Math.max(prev, remain));
    }
  }

  return Array.from(map.entries())
    .map(([code, remain]) => ({ code, remain }))
    .sort((a, b)=>{
      const ai = _tileSortIndex(a.code);
      const bi = _tileSortIndex(b.code);
      if (ai < bi) return -1;
      if (ai > bi) return 1;
      return 0;
    });
}

function _buildRiichiWaitInfo(counts13, visible, fixedM){
  let info = null;
  try{
    info = calcImproveTilesFromCounts(counts13, visible, "machi", fixedM);
  }catch(e){
    info = null;
  }

  if (!info) return null;

  const lists = [];
  if (info.breakdown){
    if (info.breakdown.normal && Array.isArray(info.breakdown.normal.list)){
      lists.push(info.breakdown.normal.list);
    }
    if (info.breakdown.chiitoi && Array.isArray(info.breakdown.chiitoi.list)){
      lists.push(info.breakdown.chiitoi.list);
    }
  }
  if (lists.length <= 0 && Array.isArray(info.list)){
    lists.push(info.list);
  }

  const merged = _mergeTileInfoLists(lists);
  const total = merged.reduce((sum, t)=>sum + (t.remain | 0), 0);

  return {
    curShanten: 0,
    types: merged.length,
    total,
    list: merged
  };
}

function updateStatsDefault(){
  if (!statsEl) return;

  const selectedPreview = (typeof getSelectedTilePreviewState === "function")
    ? getSelectedTilePreviewState()
    : null;
  const hasValidSelectedPreview = !!(
    selectedPreview &&
    selectedPreview.tileId != null &&
    (
      selectedPreview.isDrawn
        ? !!(drawn && drawn.id === selectedPreview.tileId)
        : Array.isArray(hand13) && hand13.some(t => t && t.id === selectedPreview.tileId)
    )
  );

  // リーチ選択中は受け入れ表示OFFでも見せる
  if (_statsHide() && !isRiichiSelecting){
    _statsSetRiichiPreviewMode(false);
    _statsClear();
    return;
  }

  if (hasValidSelectedPreview && (!isRiichi || isRiichiSelecting)){
    updateStatsBySelection(selectedPreview.tileId, !!selectedPreview.isDrawn);
    return;
  }

  _statsClear();
  _statsSetRiichiPreviewMode(!!isRiichiSelecting);

  if (isRiichiSelecting){
    _addLine("リーチ選択中", "候補牌を選択");
    _addLine("操作", "選択牌の待ちを表示");
    _statsShowIfNeeded();
    return;
  }

  if (isRiichi){
    if (typeof riichiWait !== "undefined" && riichiWait){
      _addLine("リーチ中", "選択待ち");
    } else {
      _addLine("リーチ中", "基本ツモ切り");
    }
    _statsShowIfNeeded();
    return;
  }

  const fixedM = (Array.isArray(melds) ? melds.length : 0);
  const visible = countVisible();
  const base13 = hand13.slice();
  const counts13 = countsFromTiles(base13);
  const dual = _calcDualFromCounts(counts13, visible, fixedM);

  _appendBlock("七対子", dual.chi, dual.modeText);
  _appendBlock("一般手", dual.nor, dual.modeText);

  if (statsEl.innerHTML.trim() === ""){
    const curS = calcShanten(countsFromTiles(base13), fixedM);
    _addLine(`Sh:${curS}`, "（表示なし）");
  }

  _statsShowIfNeeded();
}

function updateStatsBySelection(tileId, isDrawn){
  if (!statsEl) return;

  // リーチ選択中は受け入れ表示OFFでも見せる
  if (_statsHide() && !isRiichiSelecting){
    _statsSetRiichiPreviewMode(false);
    _statsClear();
    return;
  }

  if (isRiichi && !isRiichiSelecting){
    updateStatsDefault();
    return;
  }

  const fixedM = (Array.isArray(melds) ? melds.length : 0);
  const visible = countVisible();

  let after13 = [];
  let cutCode = "";
  let riichiKey = "";

  if (isDrawn){
    if (!drawn || drawn.id !== tileId){
      updateStatsDefault();
      return;
    }
    after13 = hand13.slice();
    cutCode = drawn.code;
    riichiKey = "D:" + drawn.id;
  } else {
    const idx = hand13.findIndex(t => t.id === tileId);
    if (idx < 0){
      updateStatsDefault();
      return;
    }

    after13 = hand13.filter(t => t.id !== tileId);
    cutCode = hand13[idx].code;
    riichiKey = "H:" + hand13[idx].id;

    if (drawn) after13.push(drawn);
  }

  if (isRiichiSelecting && riichiCandidates && !riichiCandidates.has(riichiKey)){
    updateStatsDefault();
    return;
  }

  const counts13 = countsFromTiles(after13);

  _statsClear();
  _statsSetRiichiPreviewMode(!!isRiichiSelecting);

  if (isRiichiSelecting){
    const waitInfo = _buildRiichiWaitInfo(counts13, visible, fixedM);
    const types = waitInfo ? waitInfo.types : 0;
    const total = waitInfo ? waitInfo.total : 0;

    _addLine(`切り:${cutCode}`, `待ち:${types}種${total}枚`);

    if (waitInfo && Array.isArray(waitInfo.list) && waitInfo.list.length > 0){
      statsEl.appendChild(_buildTiles(waitInfo.list));
    } else {
      _addLine("待ち", "表示なし");
    }

    _statsShowIfNeeded();
    return;
  }

  const dual = _calcDualFromCounts(counts13, visible, fixedM);

  _addLine(`切り:${cutCode}`, "");
  _appendBlock("七対子", dual.chi, dual.modeText);
  _appendBlock("一般手", dual.nor, dual.modeText);

  if (statsEl.innerHTML.trim() === ""){
    const curS = calcShanten(counts13, fixedM);
    _addLine(`切り:${cutCode}`, `Sh:${curS}`);
  }

  _statsShowIfNeeded();
}


function updateStatsByHover(tileId, isDrawn){
  updateStatsBySelection(tileId, isDrawn);
}
