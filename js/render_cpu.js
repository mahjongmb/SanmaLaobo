// ========= render_cpu.js（CPU描画専用） =========
// 依存：cpuLeftHandEl, cpuRightHandEl, cpuLeftRiverEl, cpuRightRiverEl
//      cpuLeftHand13, cpuRightHand13, cpuLeftRiver, cpuRightRiver
//      makeHaimenImg(), makeImgByCode(), makeTileImg()

function renderOneCpuHand(handEl, hand13Ref, openHand, drawnTile, drawnPositionClass, showOpenBadge, sideClass){
  if (!handEl) return;

  handEl.innerHTML = "";
  handEl.classList.toggle("isCpuOpenRiichi", !!showOpenBadge);
  handEl.classList.toggle("cpuHandLeft", sideClass === "left");
  handEl.classList.toggle("cpuHandRight", sideClass === "right");

  const body = document.createElement("div");
  body.className = "cpuHandBody";

  const tiles = Array.isArray(hand13Ref) ? hand13Ref : [];
  for (const t of tiles){
    if (!t || !t.code) continue;
    body.appendChild(openHand ? makeTileImg(t) : makeHaimenImg());
  }

  if (drawnTile && drawnTile.code){
    const slot = document.createElement("div");
    slot.className = `cpuDrawnSlot ${drawnPositionClass || "cpuDrawnBottom"}`;

    const img = openHand ? makeTileImg(drawnTile) : makeHaimenImg();
    img.classList.add("cpuDrawnTile");

    slot.appendChild(img);
    body.appendChild(slot);
  }

  handEl.appendChild(body);

  if (showOpenBadge){
    const badge = document.createElement("span");
    badge.className = "cpuOpenBadge";
    badge.textContent = "オープン";
    handEl.appendChild(badge);
  }
}

function renderCpuHands(){
  const openAll = (typeof isCpuHandOpen !== "undefined") ? !!isCpuHandOpen : false;

  let winnerSeats = [];
  try{
    if (typeof window !== "undefined" && typeof window.getRonWinnerSeatIndexesFromQueue === "function"){
      winnerSeats = window.getRonWinnerSeatIndexesFromQueue();
    }
  }catch(e){}

  if (!Array.isArray(winnerSeats) || winnerSeats.length <= 0){
    winnerSeats =
      (typeof lastAgariWinnerSeatIndex !== "undefined" && lastAgariWinnerSeatIndex != null)
        ? [lastAgariWinnerSeatIndex]
        : [];
  }

  const ended =
    (typeof isEnded !== "undefined")
      ? !!isEnded
      : false;

  let ryukyokuTenpaiSeats = null;
  if (ended && lastAgariType === "ryukyoku"){
    try{
      if (typeof buildCurrentRoundSettlement === "function"){
        const settlement = buildCurrentRoundSettlement();
        if (settlement && Array.isArray(settlement.tenpaiSeats)){
          ryukyokuTenpaiSeats = settlement.tenpaiSeats.slice();
        }
      }
    }catch(e){}
  }

  const leftOpenRiichiActive = (typeof isCpuOpenRiichiSeat === "function") ? isCpuOpenRiichiSeat(2) : false;
  const rightOpenRiichiActive = (typeof isCpuOpenRiichiSeat === "function") ? isCpuOpenRiichiSeat(1) : false;

  const openLeft = openAll
    || leftOpenRiichiActive
    || (ended && Array.isArray(winnerSeats) && winnerSeats.includes(2))
    || (ended && lastAgariType === "ryukyoku" && Array.isArray(ryukyokuTenpaiSeats) && ryukyokuTenpaiSeats.includes(2));

  const openRight = openAll
    || rightOpenRiichiActive
    || (ended && Array.isArray(winnerSeats) && winnerSeats.includes(1))
    || (ended && lastAgariType === "ryukyoku" && Array.isArray(ryukyokuTenpaiSeats) && ryukyokuTenpaiSeats.includes(1));

  const leftDrawnTile =
    (typeof getCpuDrawnTileBySeat === "function")
      ? getCpuDrawnTileBySeat(2)
      : null;

  const rightDrawnTile =
    (typeof getCpuDrawnTileBySeat === "function")
      ? getCpuDrawnTileBySeat(1)
      : null;

  renderOneCpuHand(cpuLeftHandEl, cpuLeftHand13, openLeft, leftDrawnTile, "cpuDrawnBottom", leftOpenRiichiActive, "left");
  renderOneCpuHand(cpuRightHandEl, cpuRightHand13, openRight, rightDrawnTile, "cpuDrawnTop", rightOpenRiichiActive, "right");
}

function renderCpuRivers(){
  const leftDeclareId =
    (typeof getCpuRiichiDisplayTileIdBySeat === "function")
      ? getCpuRiichiDisplayTileIdBySeat(2)
      : null;

  const rightDeclareId =
    (typeof getCpuRiichiDisplayTileIdBySeat === "function")
      ? getCpuRiichiDisplayTileIdBySeat(1)
      : null;

  // 左CPU 河
  if (cpuLeftRiverEl){
    cpuLeftRiverEl.innerHTML = "";
    if (Array.isArray(cpuLeftRiver)){
      for (const t of cpuLeftRiver){
        const img = makeTileImg(t);
        if (t && t.id === leftDeclareId){
          img.classList.add("riichiDeclare");
        }
        cpuLeftRiverEl.appendChild(img);
      }
    }
  }

  // 右CPU 河
  if (cpuRightRiverEl){
    cpuRightRiverEl.innerHTML = "";
    if (Array.isArray(cpuRightRiver)){
      for (const t of cpuRightRiver){
        const img = makeTileImg(t);
        if (t && t.id === rightDeclareId){
          img.classList.add("riichiDeclare");
        }
        cpuRightRiverEl.appendChild(img);
      }
    }
  }
}



function _cpuMeldWrapBase(){
  if (typeof _meldWrapBase === "function") return _meldWrapBase();

  const wrap = document.createElement("div");
  wrap.className = "meld";
  wrap.style.display = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.alignItems = "flex-end";
  wrap.style.gap = "0px";
  wrap.style.lineHeight = "0";
  return wrap;
}

function _cpuMeldTileLike(tile, fallbackCode = null){
  if (tile && tile.code){
    return {
      code: tile.code,
      imgCode: tile.imgCode || tile.code
    };
  }
  if (!fallbackCode) return null;
  return {
    code: fallbackCode,
    imgCode: fallbackCode
  };
}

function _cpuMeldTiles(m, count){
  if (m && Array.isArray(m.tiles) && m.tiles.length > 0){
    return m.tiles.map((tile)=> _cpuMeldTileLike(tile, m.code)).filter(Boolean);
  }

  const out = [];
  const code = m && m.code ? m.code : null;
  for (let i = 0; i < count; i++){
    const tile = _cpuMeldTileLike(null, code);
    if (tile) out.push(tile);
  }
  return out;
}

function _cpuMeldCalledIndex(m, tileCount){
  if (m && Number.isInteger(m.calledIndex) && m.calledIndex >= 0 && m.calledIndex < tileCount){
    return m.calledIndex;
  }
  if (m && m.from === "L") return 0;
  return Math.max(0, tileCount - 1);
}

function _cpuUprightImg(tile, fallbackCode = null){
  if (typeof _uprightImg === "function") return _uprightImg(tile, fallbackCode);

  const tileLike = _cpuMeldTileLike(tile, fallbackCode);
  const img = tileLike ? makeTileImg(tileLike) : makeImgByCode(fallbackCode || "1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _cpuHaimenImg(){
  if (typeof _haimenImg === "function") return _haimenImg();

  const img = (typeof makeHaimenImg === "function") ? makeHaimenImg() : makeImgByCode("1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _cpuCalledRotatedImg(tile, fallbackCode = null){
  if (typeof _calledRotatedImg === "function") return _calledRotatedImg(tile, fallbackCode);

  const tileLike = _cpuMeldTileLike(tile, fallbackCode);
  const img = tileLike ? makeTileImg(tileLike) : makeImgByCode(fallbackCode || "1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.transform = "rotate(90deg)";
  img.style.transformOrigin = "center center";
  img.style.marginLeft = "6px";
  img.style.marginRight = "6px";
  img.style.translate = "0 5px";
  return img;
}

function buildCpuMeldNode(m){
  if (!m || !m.code) return null;

  const type = m.type || "ankan";
  const code = m.code;

  if (type === "pon"){
    const wrap = _cpuMeldWrapBase();
    const tiles = _cpuMeldTiles(m, 3);
    const calledIndex = _cpuMeldCalledIndex(m, tiles.length || 3);

    for (let i = 0; i < 3; i++){
      const tile = tiles[i] || _cpuMeldTileLike(null, code);
      wrap.appendChild(i === calledIndex ? _cpuCalledRotatedImg(tile, code) : _cpuUprightImg(tile, code));
    }
    return wrap;
  }

  if (type === "minkan"){
    const wrap = _cpuMeldWrapBase();
    const tiles = _cpuMeldTiles(m, 4);
    const calledIndex = _cpuMeldCalledIndex(m, tiles.length || 4);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexDirection = "row";
    row.style.alignItems = "flex-end";
    row.style.gap = "0px";
    row.style.lineHeight = "0";

    for (let i = 0; i < 4; i++){
      if (i === calledIndex) continue;
      row.appendChild(_cpuUprightImg(tiles[i], code));
    }

    const called = _cpuCalledRotatedImg(tiles[calledIndex], code);

    if (calledIndex === 0){
      wrap.appendChild(called);
      wrap.appendChild(row);
    } else {
      wrap.appendChild(row);
      wrap.appendChild(called);
    }

    return wrap;
  }

  if (type === "kakan"){
    const wrap = _cpuMeldWrapBase();
    const tiles = _cpuMeldTiles(m, 3);
    const calledIndex = _cpuMeldCalledIndex(m, tiles.length || 3);
    const addedTile = _cpuMeldTileLike(m && m.addedTile ? m.addedTile : null, code);

    for (let i = 0; i < 3; i++){
      const tile = tiles[i] || _cpuMeldTileLike(null, code);
      if (i !== calledIndex){
        wrap.appendChild(_cpuUprightImg(tile, code));
        continue;
      }

      const stack = document.createElement("span");
      stack.style.position = "relative";
      stack.style.display = "inline-block";
      stack.style.lineHeight = "0";
      stack.style.margin = "0";
      stack.style.padding = "0";

      const baseCalled = _cpuCalledRotatedImg(tile, code);

      const top = addedTile ? makeTileImg(addedTile) : makeImgByCode(code);
      top.style.position = "absolute";
      top.style.display = "block";
      top.style.margin = "0";
      top.style.padding = "0";
      top.style.left = "50%";
      top.style.top = "-28px";
      top.style.transform = "translateX(-50%) rotate(90deg)";
      top.style.transformOrigin = "center center";
      top.style.zIndex = "2";
      top.style.pointerEvents = "none";

      stack.appendChild(baseCalled);
      stack.appendChild(top);

      wrap.appendChild(stack);
    }

    return wrap;
  }

  const wrap = _cpuMeldWrapBase();
  const tiles = _cpuMeldTiles(m, 4);
  wrap.appendChild(_cpuHaimenImg());
  wrap.appendChild(_cpuUprightImg(tiles[1], code));
  wrap.appendChild(_cpuUprightImg(tiles[2], code));
  wrap.appendChild(_cpuHaimenImg());
  return wrap;
}

function renderCpuMelds(){
  if (cpuLeftMeldsEl){
    cpuLeftMeldsEl.innerHTML = "";
    if (Array.isArray(cpuLeftMelds)){
      for (const m of cpuLeftMelds){
        const node = buildCpuMeldNode(m);
        if (node) cpuLeftMeldsEl.appendChild(node);
      }
    }
  }

  if (cpuRightMeldsEl){
    cpuRightMeldsEl.innerHTML = "";
    if (Array.isArray(cpuRightMelds)){
      for (const m of cpuRightMelds){
        const node = buildCpuMeldNode(m);
        if (node) cpuRightMeldsEl.appendChild(node);
      }
    }
  }
}

function renderCpuPeis(){
  if (cpuLeftPeisEl){
    cpuLeftPeisEl.innerHTML = "";
    if (Array.isArray(cpuLeftPeis)){
      for (const t of cpuLeftPeis){
        cpuLeftPeisEl.appendChild(makeTileImg(t));
      }
    }
  }

  if (cpuRightPeisEl){
    cpuRightPeisEl.innerHTML = "";
    if (Array.isArray(cpuRightPeis)){
      for (const t of cpuRightPeis){
        cpuRightPeisEl.appendChild(makeTileImg(t));
      }
    }
  }
}

function renderCpu(){
  renderCpuHands();
  renderCpuRivers();
  renderCpuPeis();
  renderCpuMelds();
}