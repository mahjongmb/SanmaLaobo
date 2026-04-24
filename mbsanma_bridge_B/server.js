#!/usr/bin/env node
'use strict';

// MBsanma ローカル橋渡しAPI
// 役割:
// - ブラウザ側から送られた CPU副露候補snapshot / CPU打牌候補snapshot を受け取る
// - OpenAI Responses API に問い合わせる
// - open-call は pass / pon / minkan / auto を返す
// - discard は discard / auto を返す
// - OpenAI が失敗したら auto（=内部AIへフォールバック）を返す

const http = require('http');
const https = require('https');
const url = require('url');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 1024 * 1024; // 1MB
const HISTORY_LIMIT = 100;
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-5.4').trim();
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 12000);
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();

let lastOpenCallRequest = null;
let lastDiscardRequest = null;
const openCallHistory = [];
const discardHistory = [];

function nowIso(){
  return new Date().toISOString();
}

function setCorsHeaders(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, payload){
  setCorsHeaders(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload, null, 2));
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function truncate(value, maxLength){
  const text = String(value == null ? '' : value);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function rememberHistory(list, record){
  list.push(record);
  if (list.length > HISTORY_LIMIT){
    list.splice(0, list.length - HISTORY_LIMIT);
  }
}

function readJsonBody(req){
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES){
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try{
        const raw = Buffer.concat(chunks).toString('utf8');
        const data = raw ? JSON.parse(raw) : {};
        resolve(data);
      }catch(err){
        reject(new Error('invalid_json'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

function extractOutputText(responseJson){
  if (!responseJson || typeof responseJson !== 'object') return '';
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim()){
    return responseJson.output_text.trim();
  }

  const output = safeArray(responseJson.output);
  const parts = [];
  for (const item of output){
    const content = safeArray(item && item.content);
    for (const part of content){
      if (part && part.type === 'output_text' && typeof part.text === 'string'){
        parts.push(part.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function postJsonHttps(targetUrl, body, headers, timeoutMs){
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const payload = JSON.stringify(body);

    const req = https.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...headers
      },
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawText = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try{ json = rawText ? JSON.parse(rawText) : null; }catch(e){ json = null; }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          rawText,
          json
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function callResponsesApi(requestBody){
  if (!OPENAI_API_KEY){
    return Promise.resolve({
      ok: false,
      error: 'missing_openai_api_key',
      debug: {
        error: 'missing_openai_api_key'
      }
    });
  }

  return postJsonHttps(OPENAI_API_URL, requestBody, {
    Authorization: `Bearer ${OPENAI_API_KEY}`
  }, OPENAI_TIMEOUT_MS)
    .then((response) => ({ ok: true, response }))
    .catch((err) => ({
      ok: false,
      error: String(err && err.message ? err.message : err),
      debug: {
        error: String(err && err.message ? err.message : err),
        requestBodyPreview: {
          model: requestBody.model,
          max_output_tokens: requestBody.max_output_tokens,
          inputPreview: truncate(requestBody.input, 600)
        }
      }
    }));
}

function buildOpenAiRequestBody(instructions, input){
  return {
    model: OPENAI_MODEL,
    instructions,
    input,
    max_output_tokens: 32,
    text: {
      format: { type: 'text' }
    }
  };
}

function pushReasonTag(out, tag){
  const normalized = String(tag || '').trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_');
  if (!normalized) return;
  if (!out.includes(normalized)) out.push(normalized);
}

function getOpenCallHints(snapshot, action){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === 'object' ? snapshot.self : {};
  const callAnalysis = snapshot && snapshot.callAnalysis && typeof snapshot.callAnalysis === 'object' ? snapshot.callAnalysis : {};
  const analysis = action === 'pon' ? callAnalysis.pon : action === 'minkan' ? callAnalysis.minkan : null;
  const out = [];

  const push = (value)=>{
    if (typeof value !== 'string' || !value.trim()) return;
    if (!out.includes(value.trim())) out.push(value.trim());
  };

  safeArray(selfInfo.valuePlanHints).forEach(push);
  if (analysis && Array.isArray(analysis.valuePlanHintsAfterCall)){
    analysis.valuePlanHintsAfterCall.forEach(push);
  }

  return out;
}

function hasOpenCallHint(hints, name){
  return Array.isArray(hints) && hints.includes(name);
}

function inferOpenCallReasonTags(snapshot, action){
  const table = snapshot && snapshot.table && typeof snapshot.table === 'object' ? snapshot.table : {};
  const callAnalysis = snapshot && snapshot.callAnalysis && typeof snapshot.callAnalysis === 'object' ? snapshot.callAnalysis : {};
  const analysis = action === 'pon' ? callAnalysis.pon : action === 'minkan' ? callAnalysis.minkan : null;
  const hints = getOpenCallHints(snapshot, action);
  const out = [];

  if (action === 'pass'){
    if (table.anyRiichi) pushReasonTag(out, 'riichi_danger_pass');
    if (!analysis || (!analysis.discardedTileIsYakuhaiForSelf && !analysis.advancesShanten && !analysis.keepsTenpai && !hasOpenCallHint(hints, 'honitsu_like') && !hasOpenCallHint(hints, 'toitoi_like') && !hasOpenCallHint(hints, 'tanyao_like'))){
      pushReasonTag(out, 'no_value_pass');
    }
    if (out.length <= 0) pushReasonTag(out, 'pass_eval');
    return out;
  }

  if (action === 'pon'){
    if (analysis && analysis.discardedTileIsYakuhaiForSelf){
      pushReasonTag(out, analysis.keepsTenpai ? 'yakuhai_tenpai' : 'yakuhai_speed');
    }
    if (analysis && analysis.keepsTenpai) pushReasonTag(out, 'tenpai_keep');
    if (analysis && analysis.advancesShanten) pushReasonTag(out, 'shanten_up_value');
    if (hasOpenCallHint(hints, 'honitsu_like')) pushReasonTag(out, 'honitsu_speed');
    if (hasOpenCallHint(hints, 'toitoi_like')) pushReasonTag(out, 'toitoi_speed');
    if (hasOpenCallHint(hints, 'tanyao_like')) pushReasonTag(out, 'tanyao_speed');
    if (out.length <= 0) pushReasonTag(out, 'call_push');
    return out;
  }

  if (action === 'minkan'){
    if (analysis && analysis.keepsTenpai) pushReasonTag(out, 'minkan_tenpai');
    if (analysis && analysis.discardedTileIsYakuhaiForSelf) pushReasonTag(out, 'minkan_yakuhai');
    if (hasOpenCallHint(hints, 'honitsu_like') || hasOpenCallHint(hints, 'toitoi_like')) pushReasonTag(out, 'minkan_value');
    if (out.length <= 0) pushReasonTag(out, 'minkan_push');
    return out;
  }

  pushReasonTag(out, 'decision_recorded');
  return out;
}

function summarizeOpenCallEnvelope(envelope){
  const snapshot = envelope && envelope.snapshot && typeof envelope.snapshot === 'object' ? envelope.snapshot : {};
  const legalActions = snapshot.legalActions && typeof snapshot.legalActions === 'object' ? snapshot.legalActions : {};
  const selfInfo = snapshot.self && typeof snapshot.self === 'object' ? snapshot.self : {};

  return {
    kind: envelope && envelope.kind || null,
    sentAt: envelope && envelope.sentAt || null,
    snapshotId: snapshot.snapshotId ?? null,
    candidateSeatIndex: snapshot.candidateSeatIndex ?? snapshot.seatIndex ?? null,
    discarderSeatIndex: snapshot.discarderSeatIndex ?? null,
    sourceType: snapshot.sourceType || null,
    discardedTile: snapshot.discardedTile || null,
    score: selfInfo.score ?? null,
    riichi: !!selfInfo.riichi,
    currentShanten: selfInfo.currentShanten ?? null,
    tenpaiWaitTypeCount: selfInfo.tenpaiWaitTypeCount ?? null,
    hand13Count: safeArray(selfInfo.hand13).length,
    meldCount: safeArray(selfInfo.melds).length,
    peiCount: safeArray(selfInfo.peis).length,
    legalActions: {
      pon: !!legalActions.pon,
      minkan: !!legalActions.minkan
    },
    currentPolicyDecision: snapshot.currentPolicyDecision || null,
    receivedAt: nowIso()
  };
}

function buildCompactOpenCallSnapshot(snapshot){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === 'object' ? snapshot.self : {};
  const round = snapshot && snapshot.round && typeof snapshot.round === 'object' ? snapshot.round : {};
  const table = snapshot && snapshot.table && typeof snapshot.table === 'object' ? snapshot.table : {};
  const visibleCounts = snapshot && snapshot.visibleCounts && typeof snapshot.visibleCounts === 'object' ? snapshot.visibleCounts : {};
  const callAnalysis = snapshot && snapshot.callAnalysis && typeof snapshot.callAnalysis === 'object' ? snapshot.callAnalysis : {};

  return {
    snapshotId: snapshot.snapshotId ?? null,
    sourceType: snapshot.sourceType || null,
    candidateSeatIndex: snapshot.candidateSeatIndex ?? snapshot.seatIndex ?? null,
    discarderSeatIndex: snapshot.discarderSeatIndex ?? null,
    discardedTile: snapshot.discardedTile || null,
    round: {
      roundWind: round.roundWind || null,
      roundNumber: round.roundNumber ?? null,
      honba: round.honba ?? null,
      eastSeatIndex: round.eastSeatIndex ?? null,
      doraIndicators: safeArray(round.doraIndicators),
      tilesLeftInWall: round.tilesLeftInWall ?? null,
      tilesLeftInDeadWall: round.tilesLeftInDeadWall ?? null
    },
    externalStyle: normalizeDiscardExternalStyle(snapshot.externalStyle),
    self: {
      seatIndex: selfInfo.seatIndex ?? null,
      seatWind: selfInfo.seatWind || null,
      isDealer: !!selfInfo.isDealer,
      score: selfInfo.score ?? null,
      riichi: !!selfInfo.riichi,
      hand13: safeArray(selfInfo.hand13),
      melds: safeArray(selfInfo.melds),
      peis: safeArray(selfInfo.peis),
      river: safeArray(selfInfo.river),
      currentShanten: selfInfo.currentShanten ?? null,
      improveCount: selfInfo.improveCount ?? null,
      tenpaiWaitTypeCount: selfInfo.tenpaiWaitTypeCount ?? null,
      valuePlanHints: safeArray(selfInfo.valuePlanHints)
    },
    callAnalysis: {
      pon: callAnalysis.pon || null,
      minkan: callAnalysis.minkan || null
    },
    legalActions: {
      pon: !!(snapshot.legalActions && snapshot.legalActions.pon),
      minkan: !!(snapshot.legalActions && snapshot.legalActions.minkan)
    },
    currentPolicyDecision: snapshot.currentPolicyDecision || null,
    table: {
      anyRiichi: !!table.anyRiichi,
      riichiSeatIndexes: safeArray(table.riichiSeatIndexes),
      seats: table.seats || null,
      scores: table.scores || null,
      riichi: table.riichi || null,
      rivers: table.rivers || null,
      melds: table.melds || null,
      peis: table.peis || null
    },
    visibleCounts
  };
}

const OPEN_CALL_INSTRUCTIONS = [
  'You are the open-call judge for a Japanese 3-player mahjong browser game.',
  'Decide only whether the CPU should call the just-discarded tile right now.',
  'Return exactly one lowercase word and nothing else: pass, pon, or minkan.',
  'Never choose an illegal action.',
  'If legalActions.pon is false, do not output pon.',
  'If legalActions.minkan is false, do not output minkan.',
  'Be conservative. Default to pass unless there is a clear reason to call.',
  'The hand should usually not call without a plausible yaku or value plan after the call.',
  'Use the provided valuePlanHints and callAnalysis fields heavily.',
  'If any opponent is already in riichi, become much more conservative and prefer pass unless there is clear speed plus clear value.',
  'Yakuhai-like plans are strong reasons to call.',
  'Honitsu-like or toitoi-like plans are valid reasons to call if the call also helps speed or keeps tenpai.',
  'A non-yakuhai call with no valuePlanHintsAfterCall should usually be pass.',
  'Do not make a role-less open call just because shape becomes slightly better.',
  'For non-yakuhai pon, require both a speed reason and a value reason.',
  'For minkan: be very strict.',
  'Usually choose pass for minkan unless the hand is already tenpai or very close, the call keeps or improves winning speed, and there is also a clear value plan after the call.',
  'If the situation is close or unclear, choose pass.',
  'Focus only on this move. No explanation.'
].join('\n');

function buildOpenCallUserPrompt(snapshot){
  const compact = buildCompactOpenCallSnapshot(snapshot);
  return [
    'Decide the action for this CPU open-call candidate.',
    'Use a conservative sanma open-call policy.',
    'Prefer pass unless speed and value are both reasonably supported.',
    'Avoid role-less open calls.',
    'Return exactly one word: pass, pon, or minkan.',
    'Snapshot JSON:',
    JSON.stringify(compact)
  ].join('\n\n');
}

function parseOpenCallDecisionText(text, legalActions){
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return null;

  let action = null;
  if (/\bminkan\b/.test(normalized)) action = 'minkan';
  else if (/\bpon\b/.test(normalized)) action = 'pon';
  else if (/\bpass\b/.test(normalized)) action = 'pass';

  if (!action) return null;
  if (action === 'minkan' && !(legalActions && legalActions.minkan)) return { action: 'pass', note: 'illegal_minkan_demoted_to_pass' };
  if (action === 'pon' && !(legalActions && legalActions.pon)) return { action: 'pass', note: 'illegal_pon_demoted_to_pass' };
  return { action, note: 'openai_text' };
}

function attachOpenCallReasonTags(snapshot, decision, debug){
  if (!decision || typeof decision !== 'object') return decision;
  const tags = inferOpenCallReasonTags(snapshot, decision.action);
  if (tags.length > 0){
    decision.reasonTag = tags[0];
    decision.reasonTags = tags;
  }
  decision.meta = {
    ...(decision.meta && typeof decision.meta === 'object' ? decision.meta : {}),
    model: debug && debug.model ? debug.model : OPENAI_MODEL
  };
  return decision;
}

async function requestOpenCallDecision(snapshot){
  const requestBody = buildOpenAiRequestBody(OPEN_CALL_INSTRUCTIONS, buildOpenCallUserPrompt(snapshot));
  const apiResult = await callResponsesApi(requestBody);

  if (!apiResult.ok){
    return {
      ok: false,
      decision: { action: 'auto', note: apiResult.error || 'openai_request_error' },
      debug: apiResult.debug || null
    };
  }

  const response = apiResult.response;
  if (!response.ok){
    return {
      ok: false,
      decision: { action: 'auto', note: `openai_http_${response.status}` },
      debug: {
        httpStatus: response.status,
        errorJson: response.json,
        errorText: truncate(response.rawText, 1200)
      }
    };
  }

  const outputText = extractOutputText(response.json);
  const parsedDecision = parseOpenCallDecisionText(outputText, snapshot && snapshot.legalActions);
  if (!parsedDecision){
    return {
      ok: false,
      decision: { action: 'auto', note: 'openai_invalid_text' },
      debug: {
        httpStatus: response.status,
        outputText,
        usage: response.json && response.json.usage || null
      }
    };
  }

  attachOpenCallReasonTags(snapshot, parsedDecision, {
    model: response.json && response.json.model || OPENAI_MODEL
  });

  return {
    ok: true,
    decision: parsedDecision,
    debug: {
      httpStatus: response.status,
      outputText,
      usage: response.json && response.json.usage || null,
      model: response.json && response.json.model || OPENAI_MODEL,
      responseId: response.json && response.json.id || null,
      status: response.json && response.json.status || null
    }
  };
}


function clampDiscardStyleBias(value){
  const n = Number(value) || 0;
  if (n < -2) return -2;
  if (n > 2) return 2;
  return Math.round(n);
}

function normalizeDiscardExternalStyle(style){
  const src = style && typeof style === 'object' ? style : {};
  const out = {
    key: typeof src.key === 'string' && src.key.trim() ? src.key.trim() : 'balanced',
    label: typeof src.label === 'string' && src.label.trim() ? src.label.trim() : 'Balanced',
    pushPullBias: clampDiscardStyleBias(src.pushPullBias),
    speedShapeBias: clampDiscardStyleBias(src.speedShapeBias),
    meldRiichiBias: clampDiscardStyleBias(src.meldRiichiBias),
    winValueBias: clampDiscardStyleBias(src.winValueBias),
    situationalFlexBias: clampDiscardStyleBias(src.situationalFlexBias)
  };

  if (src.policyText && typeof src.policyText === 'object'){
    out.policyText = {
      pushPull: src.policyText.pushPull || '',
      speedShape: src.policyText.speedShape || '',
      meldRiichi: src.policyText.meldRiichi || '',
      winValue: src.policyText.winValue || '',
      situationalFlex: src.policyText.situationalFlex || ''
    };
  }

  return out;
}

function buildDiscardStylePromptLines(styleLike){
  const style = normalizeDiscardExternalStyle(styleLike);
  const policyText = style.policyText && typeof style.policyText === 'object' ? style.policyText : {};

  const lines = [
    `Style profile key: ${style.key}`,
    `- push/pull bias: ${style.pushPullBias} (${policyText.pushPull || 'standard push-pull judgment'})`,
    `- speed/shape bias: ${style.speedShapeBias} (${policyText.speedShape || 'balanced between speed and final shape'})`,
    `- meld/riichi bias: ${style.meldRiichiBias} (${policyText.meldRiichi || 'balanced between meld route and riichi route'})`,
    `- win-rate/value bias: ${style.winValueBias} (${policyText.winValue || 'balanced between win rate and value'})`,
    `- situational flexibility: ${style.situationalFlexBias} (${policyText.situationalFlex || 'standard adaptation to score, round, dealer, and danger pressure'})`,
    'Interpretation rules:',
    '- Higher push/pull means continue attacking more often with tenpai, good waits, useful value, dealer advantage, or comeback pressure.',
    '- Lower push/pull means fold more readily against danger, poor waits, cheap hands, and late-turn pressure.',
    '- Higher speed/shape means prioritize fast progress and broad acceptance.',
    '- Lower speed/shape means prioritize better final wait quality and shape stability.',
    '- Lower meld/riichi means preserve routes that work well with calling and open-hand speed.',
    '- Higher meld/riichi means preserve menzen value and riichi quality.',
    '- Lower win-rate/value means prefer cheaper but easier winning routes.',
    '- Higher win-rate/value means preserve dora, red, and higher-value routes.',
    '- Higher situational flexibility means let score, round, dealer seat, and danger pressure shift your choice more strongly.'
  ];

  return lines;
}

function summarizeDiscardEnvelope(envelope){
  const snapshot = envelope && envelope.snapshot && typeof envelope.snapshot === 'object' ? envelope.snapshot : {};
  const selfInfo = snapshot.self && typeof snapshot.self === 'object' ? snapshot.self : {};
  const candidates = safeArray(snapshot.candidateSummaries || snapshot.candidates);

  return {
    kind: envelope && envelope.kind || null,
    sentAt: envelope && envelope.sentAt || null,
    snapshotId: snapshot.snapshotId ?? null,
    seatIndex: snapshot.seatIndex ?? null,
    sourceType: snapshot.sourceType || null,
    score: selfInfo.score ?? null,
    riichi: !!selfInfo.riichi,
    currentShanten: selfInfo.currentShanten ?? null,
    hand13Count: safeArray(selfInfo.hand13).length,
    meldCount: safeArray(selfInfo.melds).length,
    peiCount: safeArray(selfInfo.peis).length,
    drawnTile: selfInfo.drawnTile || null,
    externalStyle: normalizeDiscardExternalStyle(snapshot.externalStyle),
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      discardTileId: candidate && candidate.discardTileId != null ? candidate.discardTileId : (candidate && candidate.discardTile && candidate.discardTile.id != null ? candidate.discardTile.id : null),
      discardCode: candidate && candidate.discardCode ? candidate.discardCode : (candidate && candidate.discardTile && candidate.discardTile.code ? candidate.discardTile.code : null),
      discardIndex: candidate && candidate.discardIndex != null ? candidate.discardIndex : null,
      shantenAfter: candidate && candidate.shantenAfter != null ? candidate.shantenAfter : null,
      improveCount: candidate && candidate.improveCount != null ? candidate.improveCount : null,
      isDrawnDiscard: !!(candidate && candidate.isDrawnDiscard),
      willRiichi: !!(candidate && candidate.willRiichi)
    })),
    receivedAt: nowIso()
  };
}

function buildCompactDiscardSnapshot(snapshot){
  const selfInfo = snapshot && snapshot.self && typeof snapshot.self === 'object' ? snapshot.self : {};
  const round = snapshot && snapshot.round && typeof snapshot.round === 'object' ? snapshot.round : {};
  const table = snapshot && snapshot.table && typeof snapshot.table === 'object' ? snapshot.table : {};
  const candidates = safeArray(snapshot.candidateSummaries || snapshot.candidates).map((candidate) => ({
    discardTileId: candidate && candidate.discardTileId != null ? candidate.discardTileId : (candidate && candidate.discardTile && candidate.discardTile.id != null ? candidate.discardTile.id : null),
    discardCode: candidate && candidate.discardCode ? candidate.discardCode : (candidate && candidate.discardTile && candidate.discardTile.code ? candidate.discardTile.code : null),
    discardIndex: candidate && candidate.discardIndex != null ? candidate.discardIndex : null,
    shantenAfter: candidate && candidate.shantenAfter != null ? candidate.shantenAfter : null,
    improveCount: candidate && candidate.improveCount != null ? candidate.improveCount : null,
    isDrawnDiscard: !!(candidate && candidate.isDrawnDiscard),
    willRiichi: !!(candidate && candidate.willRiichi)
  }));

  return {
    snapshotId: snapshot.snapshotId ?? null,
    sourceType: snapshot.sourceType || null,
    seatIndex: snapshot.seatIndex ?? null,
    round: {
      roundWind: round.roundWind || null,
      roundNumber: round.roundNumber ?? null,
      honba: round.honba ?? null,
      eastSeatIndex: round.eastSeatIndex ?? null,
      doraIndicators: safeArray(round.doraIndicators),
      uraDoraIndicators: safeArray(round.uraDoraIndicators),
      kyotakuCount: round.kyotakuCount ?? null,
      tilesLeftInWall: round.tilesLeftInWall ?? null,
      tilesLeftInDeadWall: round.tilesLeftInDeadWall ?? null
    },
    externalStyle: normalizeDiscardExternalStyle(snapshot.externalStyle),
    self: {
      seatIndex: selfInfo.seatIndex ?? null,
      seatWind: selfInfo.seatWind || null,
      isDealer: !!selfInfo.isDealer,
      score: selfInfo.score ?? null,
      riichi: !!selfInfo.riichi,
      hand13: safeArray(selfInfo.hand13),
      drawnTile: selfInfo.drawnTile || null,
      melds: safeArray(selfInfo.melds),
      peis: safeArray(selfInfo.peis),
      river: safeArray(selfInfo.river),
      fixedMeldCount: selfInfo.fixedMeldCount ?? null,
      currentShanten: selfInfo.currentShanten ?? null
    },
    table: {
      anyRiichi: !!table.anyRiichi,
      riichiSeatIndexes: safeArray(table.riichiSeatIndexes),
      scores: table.scores || null,
      rivers: table.rivers || null,
      melds: table.melds || null,
      peis: table.peis || null
    },
    candidates
  };
}

const DISCARD_INSTRUCTIONS = [
  'You are the discard judge for a Japanese 3-player mahjong browser game.',
  'Decide which single candidate tile the CPU should discard right now.',
  'Use only the listed candidates. Never invent a tile.',
  'Return exactly one token and nothing else.',
  'The format must be either: tile:<discardTileId> or auto.',
  'Prefer lower shanten first. Among same shanten, prefer higher improveCount.',
  'Favor candidates that keep clear value, keep dora, and preserve riichi options.',
  'If a candidate reaches tenpai or obvious riichi-ready shape, value that strongly.',
  'Do not prefer a candidate merely because it is tsumogiri.',
  'Apply defense in the same spirit as the internal evaluator.',
  'When any opponent is already in riichi, compare candidate safety in this order when the attack value is close: genbutsu first, then suji, then one-chance-like safety, then dangerous tiles.',
  'When an opponent already has open melds, be careful about releasing live yakuhai or obviously dangerous honor tiles into that hand.',
  'Use the externalStyle profile to shape your choice.',
  'Treat externalStyle.pushPullBias as attack-vs-fold pressure.',
  'Treat externalStyle.speedShapeBias as fast progress vs final wait quality.',
  'Treat externalStyle.meldRiichiBias as open-hand route preservation vs menzen/riichi route preservation.',
  'Treat externalStyle.winValueBias as cheap win rate vs dora/red/value preservation.',
  'Treat externalStyle.situationalFlexBias as how strongly score, round, dealer seat, and danger should bend the choice.',
  'If two options are effectively tied, prefer the safer candidate. If safety is also tied, prefer the lower discardCode.',
  'If the snapshot is unclear or malformed, return auto.',
  'No explanation.'
].join('\n');

function buildDiscardUserPrompt(snapshot){
  const compact = buildCompactDiscardSnapshot(snapshot);
  const styleLines = buildDiscardStylePromptLines(compact.externalStyle);

  return [
    'Decide the discard for this CPU turn.',
    'Return exactly one token: tile:<discardTileId> or auto.',
    'Only choose from the listed candidates.',
    'Use the style profile below to shape the discard choice.',
    'Style profile:',
    styleLines.join('\n'),
    'Snapshot JSON:',
    JSON.stringify(compact)
  ].join('\n\n');
}

function parseDiscardDecisionText(text, snapshot){
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'auto') return { action: 'auto', note: 'openai_text' };

  let match = normalized.match(/tile\s*:\s*(\d+)/);
  if (match){
    const discardTileId = Number(match[1]);
    if (Number.isInteger(discardTileId)){
      return { action: 'discard', discardTileId, note: 'openai_text' };
    }
  }

  match = normalized.match(/index\s*:\s*(\d+)/);
  if (match){
    const discardIndex = Number(match[1]);
    if (Number.isInteger(discardIndex)){
      return { action: 'discard', discardIndex, note: 'openai_text' };
    }
  }

  const candidates = safeArray(snapshot && (snapshot.candidateSummaries || snapshot.candidates));
  const codeHit = candidates.filter((candidate) => {
    const code = candidate && candidate.discardCode ? candidate.discardCode : (candidate && candidate.discardTile && candidate.discardTile.code ? candidate.discardTile.code : null);
    return code === normalized;
  });
  if (codeHit.length === 1){
    const only = codeHit[0];
    return {
      action: 'discard',
      discardTileId: only.discardTileId != null ? only.discardTileId : (only.discardTile ? only.discardTile.id : null),
      discardIndex: only.discardIndex != null ? only.discardIndex : null,
      discardCode: only.discardCode || (only.discardTile ? only.discardTile.code : null),
      note: 'openai_text'
    };
  }

  return null;
}

function findDiscardCandidateForDecision(snapshot, decision){
  const candidates = safeArray(snapshot && (snapshot.candidateSummaries || snapshot.candidates));
  return candidates.find((item) => {
    const tileId =
      item && item.discardTileId != null
        ? item.discardTileId
        : (item && item.discardTile ? item.discardTile.id : null);

    if (decision.discardTileId != null && tileId === decision.discardTileId) return true;
    return decision.discardIndex != null && item && item.discardIndex === decision.discardIndex;
  }) || null;
}

function hydrateDiscardDecision(snapshot, decision){
  if (!decision || typeof decision !== 'object') return decision;
  if (decision.action !== 'discard') return decision;

  const candidate = findDiscardCandidateForDecision(snapshot, decision);
  if (!candidate) return decision;

  if (decision.discardTileId == null){
    decision.discardTileId =
      candidate.discardTileId != null
        ? candidate.discardTileId
        : (candidate.discardTile ? candidate.discardTile.id : null);
  }

  if (decision.discardIndex == null && candidate.discardIndex != null){
    decision.discardIndex = candidate.discardIndex;
  }

  if (!decision.discardCode || !String(decision.discardCode).trim()){
    const code =
      candidate.discardCode ||
      (candidate.discardTile ? candidate.discardTile.code : null);

    if (typeof code === 'string' && code.trim()){
      decision.discardCode = code.trim();
    }
  }

  return decision;
}

function inferDiscardReasonTags(snapshot, decision){
  const out = [];
  const push = (tag)=> pushReasonTag(out, tag);

  if (!decision || decision.action === 'auto'){
    push('discard_auto');
    return out;
  }

  const candidates = safeArray(snapshot && (snapshot.candidateSummaries || snapshot.candidates));
  const candidate = candidates.find((item) => {
    const tileId = item && item.discardTileId != null ? item.discardTileId : (item && item.discardTile ? item.discardTile.id : null);
    if (decision.discardTileId != null && tileId === decision.discardTileId) return true;
    return decision.discardIndex != null && item && item.discardIndex === decision.discardIndex;
  }) || null;

  if (!candidate){
    push('discard_pick');
    return out;
  }

  if (candidate.willRiichi) push('riichi_ready');
  if (candidate.isDrawnDiscard) push('tsumogiri');
  if (candidate.shantenAfter === 0) push('tenpai_keep');
  if (candidate.shantenAfter >= 1) push('speed_shape');
  if (candidate.improveCount >= 18) push('wide_improve');
  if (out.length <= 0) push('discard_pick');
  return out;
}

function attachDiscardReasonTags(snapshot, decision, debug){
  if (!decision || typeof decision !== 'object') return decision;
  const tags = inferDiscardReasonTags(snapshot, decision);
  if (tags.length > 0){
    decision.reasonTag = tags[0];
    decision.reasonTags = tags;
  }
  decision.meta = {
    ...(decision.meta && typeof decision.meta === 'object' ? decision.meta : {}),
    model: debug && debug.model ? debug.model : OPENAI_MODEL
  };
  return decision;
}

async function requestDiscardDecision(snapshot){
  const requestBody = buildOpenAiRequestBody(DISCARD_INSTRUCTIONS, buildDiscardUserPrompt(snapshot));
  const apiResult = await callResponsesApi(requestBody);

  if (!apiResult.ok){
    return {
      ok: false,
      decision: { action: 'auto', note: apiResult.error || 'openai_request_error' },
      debug: apiResult.debug || null
    };
  }

  const response = apiResult.response;
  if (!response.ok){
    return {
      ok: false,
      decision: { action: 'auto', note: `openai_http_${response.status}` },
      debug: {
        httpStatus: response.status,
        errorJson: response.json,
        errorText: truncate(response.rawText, 1200)
      }
    };
  }

  const outputText = extractOutputText(response.json);
  const parsedDecision = parseDiscardDecisionText(outputText, snapshot);
  if (!parsedDecision){
    return {
      ok: false,
      decision: { action: 'auto', note: 'openai_invalid_text' },
      debug: {
        httpStatus: response.status,
        outputText,
        usage: response.json && response.json.usage || null
      }
    };
  }

  hydrateDiscardDecision(snapshot, parsedDecision);

  attachDiscardReasonTags(snapshot, parsedDecision, {
    model: response.json && response.json.model || OPENAI_MODEL
  });

  return {
    ok: true,
    decision: parsedDecision,
    debug: {
      httpStatus: response.status,
      outputText,
      usage: response.json && response.json.usage || null,
      model: response.json && response.json.model || OPENAI_MODEL,
      responseId: response.json && response.json.id || null,
      status: response.json && response.json.status || null
    }
  };
}

async function handleOpenCallDecision(req, res){
  let envelope;
  try{
    envelope = await readJsonBody(req);
  }catch(err){
    const code = err && err.message === 'body_too_large' ? 413 : 400;
    return sendJson(res, code, {
      ok: false,
      error: err && err.message ? err.message : 'read_error',
      stage: 'D3',
      receivedAt: nowIso()
    });
  }

  if (!envelope || typeof envelope !== 'object'){
    return sendJson(res, 400, { ok: false, error: 'invalid_envelope', stage: 'D3', receivedAt: nowIso() });
  }
  if (!envelope.snapshot || typeof envelope.snapshot !== 'object'){
    return sendJson(res, 400, { ok: false, error: 'missing_snapshot', stage: 'D3', receivedAt: nowIso() });
  }

  const summary = summarizeOpenCallEnvelope(envelope);
  const openAiResult = await requestOpenCallDecision(envelope.snapshot);
  const decision = openAiResult && openAiResult.decision ? openAiResult.decision : { action: 'auto', note: 'openai_unknown' };

  const record = {
    summary,
    decision,
    openAiDebug: openAiResult && openAiResult.debug || null,
    rawEnvelope: envelope,
    loggedAt: nowIso()
  };
  lastOpenCallRequest = record;
  rememberHistory(openCallHistory, record);

  try{
    console.log('[bridge:D3] open-call snapshot received');
    console.log(JSON.stringify(summary, null, 2));
    console.log('[bridge:D3] open-call decision');
    console.log(JSON.stringify(decision, null, 2));
  }catch(e){}

  return sendJson(res, 200, {
    ok: true,
    stage: 'D3',
    decision,
    summary,
    openAiDebug: openAiResult && openAiResult.debug || null,
    respondedAt: nowIso()
  });
}

async function handleDiscardDecision(req, res){
  let envelope;
  try{
    envelope = await readJsonBody(req);
  }catch(err){
    const code = err && err.message === 'body_too_large' ? 413 : 400;
    return sendJson(res, code, {
      ok: false,
      error: err && err.message ? err.message : 'read_error',
      stage: 'D3',
      receivedAt: nowIso()
    });
  }

  if (!envelope || typeof envelope !== 'object'){
    return sendJson(res, 400, { ok: false, error: 'invalid_envelope', stage: 'D3', receivedAt: nowIso() });
  }
  if (!envelope.snapshot || typeof envelope.snapshot !== 'object'){
    return sendJson(res, 400, { ok: false, error: 'missing_snapshot', stage: 'D3', receivedAt: nowIso() });
  }

  const summary = summarizeDiscardEnvelope(envelope);
  const openAiResult = await requestDiscardDecision(envelope.snapshot);
  const decision = openAiResult && openAiResult.decision ? openAiResult.decision : { action: 'auto', note: 'openai_unknown' };

  const record = {
    summary,
    decision,
    openAiDebug: openAiResult && openAiResult.debug || null,
    rawEnvelope: envelope,
    loggedAt: nowIso()
  };
  lastDiscardRequest = record;
  rememberHistory(discardHistory, record);

  try{
    console.log('[bridge:D3] discard snapshot received');
    console.log(JSON.stringify(summary, null, 2));
    console.log('[bridge:D3] discard decision');
    console.log(JSON.stringify(decision, null, 2));
  }catch(e){}

  return sendJson(res, 200, {
    ok: true,
    stage: 'D3',
    decision,
    summary,
    openAiDebug: openAiResult && openAiResult.debug || null,
    respondedAt: nowIso()
  });
}

function handleHealth(_req, res){
  return sendJson(res, 200, {
    ok: true,
    stage: 'D3',
    service: 'MBsanma local bridge API',
    host: HOST,
    port: PORT,
    decisionMode: 'openai',
    hasOpenAiKey: !!OPENAI_API_KEY,
    openAiModel: OPENAI_MODEL,
    now: nowIso()
  });
}

function handleDebugConfig(_req, res){
  return sendJson(res, 200, {
    ok: true,
    stage: 'D3',
    host: HOST,
    port: PORT,
    openAiModel: OPENAI_MODEL,
    hasOpenAiKey: !!OPENAI_API_KEY,
    openAiTimeoutMs: OPENAI_TIMEOUT_MS,
    endpoints: {
      openCall: '/cpu/open-call-decision',
      discard: '/cpu/discard-decision'
    }
  });
}

function handleDebugLastOpenCall(_req, res){
  return sendJson(res, 200, { ok: true, stage: 'D3', lastOpenCallRequest });
}

function handleDebugOpenCallHistory(_req, res){
  const items = openCallHistory.map((item) => ({
    summary: item.summary,
    decision: item.decision,
    openAiDebug: item.openAiDebug,
    loggedAt: item.loggedAt
  }));
  return sendJson(res, 200, { ok: true, stage: 'D3', count: items.length, items });
}

function handleDebugLastDiscard(_req, res){
  return sendJson(res, 200, { ok: true, stage: 'D3', lastDiscardRequest });
}

function handleDebugDiscardHistory(_req, res){
  const items = discardHistory.map((item) => ({
    summary: item.summary,
    decision: item.decision,
    openAiDebug: item.openAiDebug,
    loggedAt: item.loggedAt
  }));
  return sendJson(res, 200, { ok: true, stage: 'D3', count: items.length, items });
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS'){
    res.statusCode = 204;
    return res.end();
  }

  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';

  if (req.method === 'GET' && pathname === '/health') return handleHealth(req, res);
  if (req.method === 'GET' && pathname === '/debug/config') return handleDebugConfig(req, res);
  if (req.method === 'GET' && pathname === '/debug/last-open-call') return handleDebugLastOpenCall(req, res);
  if (req.method === 'GET' && pathname === '/debug/open-call-history') return handleDebugOpenCallHistory(req, res);
  if (req.method === 'GET' && pathname === '/debug/last-discard') return handleDebugLastDiscard(req, res);
  if (req.method === 'GET' && pathname === '/debug/discard-history') return handleDebugDiscardHistory(req, res);
  if (req.method === 'POST' && pathname === '/cpu/open-call-decision') return handleOpenCallDecision(req, res);
  if (req.method === 'POST' && pathname === '/cpu/discard-decision') return handleDiscardDecision(req, res);

  return sendJson(res, 404, {
    ok: false,
    error: 'not_found',
    method: req.method,
    path: pathname,
    stage: 'D3',
    now: nowIso()
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge:D3] listening on http://${HOST}:${PORT}`);
  console.log('[bridge:D3] decision mode: openai');
  console.log(`[bridge:D3] has OPENAI_API_KEY: ${!!OPENAI_API_KEY}`);
  console.log(`[bridge:D3] openai model: ${OPENAI_MODEL}`);
  console.log('[bridge:D3] health            : GET  /health');
  console.log('[bridge:D3] config            : GET  /debug/config');
  console.log('[bridge:D3] open-call endpoint: POST /cpu/open-call-decision');
  console.log('[bridge:D3] discard endpoint  : POST /cpu/discard-decision');
});
