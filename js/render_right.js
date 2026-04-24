// ========= render_right.js（右エリア：北/副露描画専用） =========
// 依存：peisEl, meldsEl, peis, melds, makeImgByCode(), makeTileImg(), makeHaimenImg()

function renderPeis(){
  if (!peisEl) return;
  peisEl.innerHTML = "";

  for (const t of peis){
    const img = makeTileImg(t);
    peisEl.appendChild(img);
  }
}

/* =========================================================
   ★ 副露表示：詰め・下端揃え用ヘルパ
   - 縦牌同士は「隙間ゼロ」
   - 横向き牌は bounding box 都合で「少し余白＋Y補正」
========================================================= */

function _meldWrapBase(){
  const wrap = document.createElement("div");
  wrap.className = "meld";

  // ★ JS側で確実に制御（CSS差に依存しない）
  wrap.style.display = "flex";
  wrap.style.flexDirection = "row";
  wrap.style.alignItems = "flex-end"; // ★下端揃え（box下端）
  wrap.style.gap = "0px";             // ★縦牌間の隙間ゼロ
  wrap.style.lineHeight = "0";
  return wrap;
}

function _meldTileLike(tile, fallbackCode = null){
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

function _meldTiles(m, count){
  if (m && Array.isArray(m.tiles) && m.tiles.length > 0){
    return m.tiles.map((tile)=> _meldTileLike(tile, m.code)).filter(Boolean);
  }

  const out = [];
  const code = m && m.code ? m.code : null;
  for (let i = 0; i < count; i++){
    const tile = _meldTileLike(null, code);
    if (tile) out.push(tile);
  }
  return out;
}

function _meldCalledIndex(m, tileCount){
  if (m && Number.isInteger(m.calledIndex) && m.calledIndex >= 0 && m.calledIndex < tileCount){
    return m.calledIndex;
  }
  if (m && m.from === "L") return 0;
  return Math.max(0, tileCount - 1);
}

function _uprightImg(tile, fallbackCode = null){
  const tileLike = _meldTileLike(tile, fallbackCode);
  const img = tileLike ? makeTileImg(tileLike) : makeImgByCode(fallbackCode || "1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  return img;
}

function _haimenImg(){
  if (typeof makeHaimenImg === "function"){
    const img = makeHaimenImg();
    img.style.display = "block";
    img.style.margin = "0";
    img.style.padding = "0";
    return img;
  }
  // 保険：裏画像生成が無い場合は表で代替（落とさない）
  const img = makeImgByCode("1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";
  img.style.opacity = "0.35";
  return img;
}

function _calledRotatedImg(tile, fallbackCode = null){
  const tileLike = _meldTileLike(tile, fallbackCode);
  const img = tileLike ? makeTileImg(tileLike) : makeImgByCode(fallbackCode || "1z");
  img.style.display = "block";
  img.style.margin = "0";
  img.style.padding = "0";

  // ★横向き（回転）
  img.style.transform = "rotate(90deg)";
  img.style.transformOrigin = "center center";

  // ======================================================
  // ★ かぶり対策：
  //   回転牌はbounding boxの都合で横幅が食い込みやすいので
  //   「横向き牌だけ」左右に最小の余白を入れる
  //   ※ 縦牌同士は隙間ゼロのまま
  // ======================================================
  img.style.marginLeft = "6px";
  img.style.marginRight = "6px";

  // ======================================================
  // ★ 見た目下端揃え（視覚補正）：
  //   さっきの 3px だとまだ少し高い → もう少しだけ下げる
  // ======================================================
  img.style.translate = "0 5px";

  return img;
}

// ★ 副露表現：
// - ポン：3枚のうち「鳴いた牌」を90度（右から→一番右 / 左から→一番左）
// - 明槓：縦向きの牌を横に3枚並べ、鳴いた横向き1枚を（左から→左端 / 右から→右端）に付ける
// - 加槓：ポンの「横向き牌」の上部に、横向きで“横に置く”
// - 暗槓：両端を裏向きにして（裏・表・表・裏）、隙間を詰める
//
// melds の想定形：
//   pon   : { type:"pon",    code, from:"L"|"R" }
//   minkan: { type:"minkan", code, from:"L"|"R" }
//   kakan : { type:"kakan",  code, from:"L"|"R" }  // 「上に置く」表現
//   ankan : { type:"ankan",  code }                 // or 旧形式 {code}（typeなし）
function renderMelds(){
  if (!meldsEl) return;
  meldsEl.innerHTML = "";

  for (const m of melds){
    const type = (m && m.type) ? m.type : "ankan"; // 旧形式 {code} は暗槓扱い
    const code = m && m.code ? m.code : null;
    if (!code) continue;

    if (type === "pon"){
      const wrap = _meldWrapBase();
      const tiles = _meldTiles(m, 3);
      const calledIndex = _meldCalledIndex(m, tiles.length || 3);

      for (let i = 0; i < 3; i++){
        const tile = tiles[i] || _meldTileLike(null, code);
        wrap.appendChild(i === calledIndex ? _calledRotatedImg(tile, code) : _uprightImg(tile, code));
      }

      meldsEl.appendChild(wrap);
      continue;
    }

    if (type === "minkan"){
      const wrap = _meldWrapBase();
      const tiles = _meldTiles(m, 4);
      const calledIndex = _meldCalledIndex(m, tiles.length || 4);

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "row";
      row.style.alignItems = "flex-end";
      row.style.gap = "0px";
      row.style.lineHeight = "0";

      for (let i = 0; i < 4; i++){
        if (i === calledIndex) continue;
        row.appendChild(_uprightImg(tiles[i], code));
      }

      const called = _calledRotatedImg(tiles[calledIndex], code);

      if (calledIndex === 0){
        wrap.appendChild(called);
        wrap.appendChild(row);
      } else {
        wrap.appendChild(row);
        wrap.appendChild(called);
      }

      meldsEl.appendChild(wrap);
      continue;
    }

    if (type === "kakan"){
      const wrap = _meldWrapBase();
      const tiles = _meldTiles(m, 3);
      const calledIndex = _meldCalledIndex(m, tiles.length || 3);
      const addedTile = _meldTileLike(m && m.addedTile ? m.addedTile : null, code);

      for (let i = 0; i < 3; i++){
        const tile = tiles[i] || _meldTileLike(null, code);

        if (i !== calledIndex){
          wrap.appendChild(_uprightImg(tile, code));
          continue;
        }

        const stack = document.createElement("span");
        stack.style.position = "relative";
        stack.style.display = "inline-block";
        stack.style.lineHeight = "0";
        stack.style.margin = "0";
        stack.style.padding = "0";

        const baseCalled = _calledRotatedImg(tile, code);

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

      meldsEl.appendChild(wrap);
      continue;
    }

    {
      const wrap = _meldWrapBase();
      const tiles = _meldTiles(m, 4);

      wrap.appendChild(_haimenImg());
      wrap.appendChild(_uprightImg(tiles[1], code));
      wrap.appendChild(_uprightImg(tiles[2], code));
      wrap.appendChild(_haimenImg());

      meldsEl.appendChild(wrap);
      continue;
    }
  }
}
