'use strict';

const fs = require('fs');
const path = require('path');
const { OPENAI_FRONTIER_CATALOG, pickBestAvailableModel } = require('../shared/openai-models-config');

function loadEnvSilently() {
  const candidates = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env')
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

async function main() {
  loadEnvSilently();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(JSON.stringify({ ok: false, reason: 'OPENAI_API_KEY missing in .env' }, null, 2));
    process.exit(1);
  }

  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  if (!res.ok) {
    console.log(JSON.stringify({ ok: false, status: res.status, statusText: res.statusText }, null, 2));
    process.exit(1);
  }

  const data = await res.json();
  const ids = (data.data || []).map((m) => m.id).sort();

  const relevantPatterns = [
    /realtime/i,
    /live/i,
    /audio/i,
    /transcribe/i,
    /tts/i,
    /whisper/i,
    /^gpt-4\.1/i,
    /^gpt-5/i,
    /^gpt-6/i,
    /^gpt-4o(?!.*realtime)/i,
    /^o[345]/i,
    /codex/i
  ];
  const matchedIds = ids.filter((id) => relevantPatterns.some((re) => re.test(id)));
  const otherIds = ids.filter((id) => !relevantPatterns.some((re) => re.test(id)));

  const recommendations = {
    realtimePrimary: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.realtime.primary.id,
      ...OPENAI_FRONTIER_CATALOG.realtime.primary.aliasFallbacks
    ]),
    realtimeMini: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.realtime.mini.id,
      ...OPENAI_FRONTIER_CATALOG.realtime.mini.aliasFallbacks
    ]),
    stt: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.audioAsync.sttPrimary.id,
      ...OPENAI_FRONTIER_CATALOG.audioAsync.sttPrimary.aliasFallbacks
    ]),
    tts: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.audioAsync.ttsPrimary.id,
      ...OPENAI_FRONTIER_CATALOG.audioAsync.ttsPrimary.aliasFallbacks
    ]),
    agenticMultimodal: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.agenticMultimodal.primary.id,
      ...OPENAI_FRONTIER_CATALOG.agenticMultimodal.primary.aliasFallbacks
    ]),
    agenticFast: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.agenticMultimodal.fast.id,
      ...OPENAI_FRONTIER_CATALOG.agenticMultimodal.fast.aliasFallbacks
    ]),
    reasoning: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.id,
      OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.flagshipAudit,
      ...OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.aliasFallbacks
    ]),
    flagshipAudit: pickBestAvailableModel(ids, [
      OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.flagshipAudit,
      OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.id,
      ...OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.aliasFallbacks
    ])
  };

  console.log(JSON.stringify({
    ok: true,
    totalModelsInAccount: ids.length,
    matchedCount: matchedIds.length,
    matchedIds,
    otherIds,
    recommendations
  }, null, 2));
}

main().catch((err) => {
  console.error('Error checking OpenAI models:', err.message);
  process.exit(1);
});
