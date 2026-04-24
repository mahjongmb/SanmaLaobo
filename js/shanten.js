// ========= shanten.js（シャンテン/受け入れ） =========

// ===== 一般手（面子手）シャンテン =====
function calcShantenNormal(counts, fixedM = 0){
  let best = 8;

  const memo = new Map();
  const keyOf = (arr,m,t,p) => arr.join("") + "|" + m + "|" + t + "|" + (p?1:0);

  // ★ 牌種配列の並びが変わっても壊れないように、基準indexを動的に取る
  const BASE_P = TYPE_TO_IDX["1p"]; // 例：今は 2
  const BASE_S = TYPE_TO_IDX["1s"]; // 例：今は 11

  function updateBest(m, t, p){
    let tt = t;
    const maxT = 4 - m;
    if (tt > maxT) tt = maxT;
    const s = 8 - 2*m - tt - (p?1:0);
    if (s < best) best = s;
  }

  function dfs(arr, m, t, p){
    updateBest(m,t,p);
    if (best === -1) return;

    const k = keyOf(arr,m,t,p);
    const prevBest = memo.get(k);
    if (prevBest !== undefined && prevBest <= best) return;
    memo.set(k, best);

    let i = -1;
    for (let x=0; x<arr.length; x++){
      if (arr[x] > 0){ i = x; break; }
    }
    if (i === -1) return;

    const code = TILE_TYPES[i];
    const suit = code[1];

    // 刻子
    if (arr[i] >= 3){
      arr[i] -= 3;
      dfs(arr, m+1, t, p);
      arr[i] += 3;
    }

    // 順子（p/sのみ）
    if (suit === "p" || suit === "s"){
      const n = Number(code[0]);
      const pos = n - 1;

      if (pos <= 6){
        const base = (suit === "p") ? BASE_P : BASE_S;
        const a = base + pos;
        const b = base + pos + 1;
        const c = base + pos + 2;

        if (arr[a] > 0 && arr[b] > 0 && arr[c] > 0){
          arr[a]--; arr[b]--; arr[c]--;
          dfs(arr, m+1, t, p);
          arr[a]++; arr[b]++; arr[c]++;
        }
      }
    }

    // 対子 / ターツ
    if (arr[i] >= 2){
      arr[i] -= 2;
      if (!p) dfs(arr, m, t, true);
      dfs(arr, m, t+1, p);
      arr[i] += 2;
    }

    // 両面 / 嵌張（p/sのみ）
    if (suit === "p" || suit === "s"){
      const n = Number(code[0]);
      const pos = n - 1;
      const base = (suit === "p") ? BASE_P : BASE_S;

      // (n,n+1)
      if (pos <= 7){
        const a = base + pos;
        const b = base + pos + 1;
        if (arr[a] > 0 && arr[b] > 0){
          arr[a]--; arr[b]--;
          dfs(arr, m, t+1, p);
          arr[a]++; arr[b]++;
        }
      }

      // (n,n+2)
      if (pos <= 6){
        const a = base + pos;
        const c = base + pos + 2;
        if (arr[a] > 0 && arr[c] > 0){
          arr[a]--; arr[c]--;
          dfs(arr, m, t+1, p);
          arr[a]++; arr[c]++;
        }
      }
    }

    // 孤立牌
    arr[i]--;
    dfs(arr, m, t, p);
    arr[i]++;
  }

  dfs(counts.slice(), fixedM, 0, false);
  return best;
}

// ===== ルール読取（4枚使い七対子） =====
function getRuleValueForShanten(key, fallback){
  try{
    if (typeof window !== "undefined" && window.MBSanmaRulesConfig && typeof window.MBSanmaRulesConfig.getValue === "function"){
      return window.MBSanmaRulesConfig.getValue(key, fallback);
    }
  }catch(e){}
  return fallback;
}

function isChiitoi4MaiEnabledForShanten(){
  const raw = String(getRuleValueForShanten("basic-chiitoi-4mai", "on") || "").toLowerCase();
  if (raw === "off") return false;
  if (raw === "on") return true;
  return true;
}

// ===== 七対子シャンテン（★4枚使い対応） =====
//
// ローカルの「4枚使い七対子」は
//   - 同一牌4枚を「2対子」として認める
//   - 種類数(uniq)の縛りは無し
//
// よってシャンテンは「対子ユニット数(pairUnits)」だけで決まる：
//   pairUnits = Σ floor(count[i] / 2)（最大7）
//   shanten = 6 - pairUnits
//
function calcShantenChiitoi(counts){
  if (isChiitoi4MaiEnabledForShanten()){
    let pairUnits = 0;

    for (let i=0;i<counts.length;i++){
      const n = counts[i] | 0;
      if (n >= 2){
        pairUnits += Math.floor(n / 2); // 2->1, 3->1, 4->2
        if (pairUnits >= 7){
          pairUnits = 7;
          break;
        }
      }
    }

    return 6 - pairUnits;
  }

  let pairCount = 0;
  let uniqueCount = 0;

  for (let i=0;i<counts.length;i++){
    const n = counts[i] | 0;
    if (n > 0) uniqueCount++;
    if (n >= 2) pairCount++;
  }

  if (pairCount > 7) pairCount = 7;
  if (uniqueCount > 7) uniqueCount = 7;

  return 6 - pairCount + Math.max(0, 7 - uniqueCount);
}

// =========================================================
// ★ 国士無双シャンテン（アガリ/テンパイ判定に使う）
// - 副露がある（fixedM>0）場合は対象外
// - シャンテン定義：
//     sh = 13 - unique(么九13種のうち持ってる種類数) - (hasPair?1:0)
//   例）
//     unique=13, hasPair=true  -> -1（和了）
//     unique=13, hasPair=false -> 0 （国士13面待ちテンパイ）
//     unique=12, hasPair=true  -> 0 （単騎待ちテンパイ）
// - total枚数に強い制約はかけない（13枚/14枚どちらで呼ばれてもOK）
// =========================================================
function calcShantenKokushi(counts, fixedM = 0){
  try{
    if (fixedM > 0) return 99;
    if (!counts || !Array.isArray(counts)) return 99;
    if (typeof TYPE_TO_IDX === "undefined") return 99;

    const yaochuCodes = [
      "1m","9m",
      "1p","9p",
      "1s","9s",
      "1z","2z","3z","4z","5z","6z","7z"
    ];

    let unique = 0;
    let hasPair = false;

    for (const code of yaochuCodes){
      const idx = TYPE_TO_IDX[code];
      if (idx === undefined) return 99; // 定義が無いなら判定不可（安全側）
      const n = counts[idx] | 0;
      if (n > 0) unique++;
      if (n >= 2) hasPair = true;
    }

    return 13 - unique - (hasPair ? 1 : 0);
  }catch(e){
    return 99;
  }
}

// ===== 表示用：最小シャンテン =====
function calcShanten(counts, fixedM = 0){
  const normal = calcShantenNormal(counts, fixedM);

  // 副露あり：七対子/国士は見ない
  if (fixedM > 0) return normal;

  // 七対子：3シャンテン以上は無視（現行方針）
  const chi = calcShantenChiitoi(counts);
  const chiOk = (chi <= 2);

  // 国士：テンパイ(0)とアガリ(-1)に効けばOK（過剰に優先しない）
  const kokushi = calcShantenKokushi(counts, fixedM);

  let best = normal;

  if (chiOk) best = Math.min(best, chi);

  // ★ kokushi は「0以下（テンパイ/アガリ）」のときだけ混ぜる
  //   これで国士の“途中シャンテン表示”や受け入れに余計な影響を出さない
  if (kokushi <= 0){
    best = Math.min(best, kokushi);
  }

  return best;
}

// ===== 受け入れ計算 =====
function calcImproveTilesFromCounts(handCounts13, visibleCounts, mode, fixedM){
  const normalCur = calcShantenNormal(handCounts13, fixedM);

  const useChiitoi =
    fixedM === 0 &&
    calcShantenChiitoi(handCounts13) <= 2;

  const chiCur = useChiitoi ? calcShantenChiitoi(handCounts13) : null;
  const bestCur = useChiitoi ? Math.min(normalCur, chiCur) : normalCur;

  const normalList = [];
  const chiitoiList = [];

  for (let i=0;i<TILE_TYPES.length;i++){
    if (handCounts13[i] >= 4) continue;
    const remain = 4 - visibleCounts[i];
    if (remain <= 0) continue;

    const next = handCounts13.slice();
    next[i]++;

    // 一般手
    const nNext = calcShantenNormal(next, fixedM);
    if (mode === "machi"){
      if (normalCur === 0 && nNext === -1){
        normalList.push({ code: TILE_TYPES[i], remain });
      }
    } else if (nNext < normalCur){
      normalList.push({ code: TILE_TYPES[i], remain });
    }

    // 七対子（有効時のみ）
    if (useChiitoi){
      const cNext = calcShantenChiitoi(next);
      if (mode === "machi"){
        if (chiCur === 0 && cNext === -1){
          chiitoiList.push({ code: TILE_TYPES[i], remain });
        }
      } else if (cNext < chiCur){
        chiitoiList.push({ code: TILE_TYPES[i], remain });
      }
    }
  }

  // ★ mも含める
  const suitOrder = { m:0, p:1, s:2, z:3 };
  const sort = (arr)=>arr.sort((A,B)=>{
    const a=A.code, b=B.code;
    if (suitOrder[a[1]] !== suitOrder[b[1]]) return suitOrder[a[1]]-suitOrder[b[1]];
    return Number(a[0]) - Number(b[0]);
  });
  sort(normalList);
  sort(chiitoiList);

  // 合算
  const map = new Map();
  for (const x of normalList){
    map.set(x.code, (map.get(x.code)||0) + x.remain);
  }
  for (const x of chiitoiList){
    map.set(x.code, (map.get(x.code)||0) + x.remain);
  }
  const merged = Array.from(map.entries()).map(([code,remain])=>({code,remain}));
  sort(merged);

  const res = {
    curShanten: bestCur,
    list: merged,
    types: merged.length,
    total: merged.reduce((s,x)=>s+x.remain,0),
    breakdown: {
      normal: {
        curShanten: normalCur,
        list: normalList,
        types: normalList.length,
        total: normalList.reduce((s,x)=>s+x.remain,0)
      }
    }
  };

  if (useChiitoi){
    res.breakdown.chiitoi = {
      curShanten: chiCur,
      list: chiitoiList,
      types: chiitoiList.length,
      total: chiitoiList.reduce((s,x)=>s+x.remain,0)
    };
  }

  return res;
}