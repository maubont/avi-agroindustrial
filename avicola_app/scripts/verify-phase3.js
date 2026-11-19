'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const { createAvicolaServer } = require('../server/index');

function loadExcelJS() {
  const candidates = [
    'exceljs',
    path.resolve(__dirname, '../node_modules/exceljs'),
    path.resolve(__dirname, '../../modelo/node_modules/exceljs')
  ];
  for (const modPath of candidates) {
    try {
      return require(modPath);
    } catch (_) {
      // intenta siguiente
    }
  }
  throw new Error('No se encontró ExcelJS');
}

const ExcelJS = loadExcelJS();

function connectSseClient(sseUrl) {
  return new Promise((resolve, reject) => {
    const events = [];
    let buffer = '';
    let settled = false;

    const req = http.get(sseUrl, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let idx;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let evtName = 'message';
          const dataLines = [];
          for (const line of frame.split(/\r?\n/)) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) evtName = line.slice(6).trim();
            if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length > 0) {
            let parsed = dataLines.join('\n');
            try {
              parsed = JSON.parse(parsed);
            } catch (_) {
              // texto plano
            }
            events.push({ event: evtName, data: parsed });
            if (!settled && evtName === 'connected') {
              settled = true;
              resolve({ req, res, events });
            }
          }
        }
      });
      res.on('error', (err) => {
        if (!settled) reject(err);
      });
    });
    req.on('error', (err) => {
      if (!settled) reject(err);
    });
  });
}

async function waitForSseEvent(events, predicate, timeoutMs = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const found = events.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timeout esperando evento SSE (${events.map((e) => e.event).join(', ')})`);
}

async function jsonFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (body && typeof body === 'object' && !(body instanceof FormData) && !Buffer.isBuffer(body)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(url, { ...options, headers, body });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (_) {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json, rawText: text };
}

async function runPhase3Verification() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'avicola-phase3-'));
  const dataDir = path.join(tempRoot, 'data');
  const bridgeDir = path.join(tempRoot, 'bridge');
  const exportsDir = path.join(tempRoot, 'exports');
  const envFilePath = path.join(tempRoot, '.env.test');

  const app = createAvicolaServer({
    dataDir,
    bridgeDir,
    exportsDir,
    envFilePath,
    supabaseUrl: '',
    supabaseKey: '',
    telegramToken: '',
    enableTelegram: false
  });

  let sseConn = null;

  try {
    console.log('=== VERIFICACION FASE 3: SERVIDOR MULTIMODAL, REALTIME WEBRTC, CHAT GPT-6.1-SOL Y BRIDGE REST ===\n');

    const info = await app.start(0, '127.0.0.1');
    const baseUrl = info.url;
    console.log(`[1/9] Servidor Avícola escuchando en ${baseUrl}`);

    // -----------------------------------------------------------------------
    // 2. Conexión SSE Tiempo Real
    // -----------------------------------------------------------------------
    sseConn = await connectSseClient(`${baseUrl}/api/events/stream`);
    assert(sseConn.events.some((e) => e.event === 'connected'), 'Debe recibir evento inicial connected por SSE');
    console.log('[2/9] Stream SSE /api/events/stream conectado (evento connected recibido).');

    // -----------------------------------------------------------------------
    // 3. Health y Twin State (Conciliación $0)
    // -----------------------------------------------------------------------
    const health = await jsonFetch(`${baseUrl}/api/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.ok, true);
    assert.strictEqual(health.data.integrations.openai.configured, true, 'OPENAI_API_KEY debe estar configurada en entorno');

    const twinStateRes = await jsonFetch(`${baseUrl}/api/twin/state`);
    assert.strictEqual(twinStateRes.status, 200);
    assert.strictEqual(twinStateRes.data.zeroDivergence.ok, true);
    assert(
      twinStateRes.data.zeroDivergence.maxDiff < 1e-6,
      `maxDiff debe ser ~0 (actual=${twinStateRes.data.zeroDivergence.maxDiff})`
    );
    const vInit = twinStateRes.data.snapshot.version;
    console.log(`[3/9] /api/health y /api/twin/state verificados (v=${vInit}, maxDiff=0).`);

    // -----------------------------------------------------------------------
    // 4. What-If sin mutación + Event Sourcing + Rollback
    // -----------------------------------------------------------------------
    const whatIfRes = await jsonFetch(`${baseUrl}/api/twin/what-if`, {
      method: 'POST',
      body: {
        edadGlobal: 45,
        preciosRegionales: { precioCanalKg: 12000 }
      }
    });
    assert.strictEqual(whatIfRes.status, 200);
    assert(
      whatIfRes.data.simulation.computed.av1.comercial800.utilidadCanal >
        twinStateRes.data.snapshot.computed.av1.comercial800.utilidadCanal,
      'Simulación 45d + $12.000/kg debe aumentar utilidad'
    );
    const afterSimState = await jsonFetch(`${baseUrl}/api/twin/state`);
    assert.strictEqual(afterSimState.data.snapshot.version, vInit, 'What-If no debe mutar la versión oficial');

    const evtRes = await jsonFetch(`${baseUrl}/api/twin/event`, {
      method: 'POST',
      body: {
        type: 'DAILY_LOG',
        sourceChannel: 'verify_phase3',
        payload: { dia: 1, mortalidad: 1, alimRealKg: 6.8, tempC: 31.5 }
      }
    });
    assert.strictEqual(evtRes.status, 200);
    assert.strictEqual(evtRes.data.snapshot.version, vInit + 1);
    await waitForSseEvent(sseConn.events, (e) => e.event === 'state_updated' && e.data?.version === vInit + 1);

    const rollbackRes = await jsonFetch(`${baseUrl}/api/twin/rollback`, { method: 'POST', body: {} });
    assert.strictEqual(rollbackRes.status, 200);
    assert.strictEqual(rollbackRes.data.snapshot.version, vInit);
    console.log('[4/9] What-If no destructivo, POST /api/twin/event (+SSE) y Rollback verificados.');

    // -----------------------------------------------------------------------
    // 5. Compilación Excel, Descarga Buffer e Hidratación Multipart Real
    // -----------------------------------------------------------------------
    const compileRes = await jsonFetch(`${baseUrl}/api/excel/compile`, { method: 'POST', body: {} });
    assert.strictEqual(compileRes.status, 200);
    assert.strictEqual(compileRes.data.ok, true);

    const dlRes = await fetch(`${baseUrl}/api/excel/download/AV2`);
    assert.strictEqual(dlRes.status, 200);
    const av2Buf = Buffer.from(await dlRes.arrayBuffer());
    assert(av2Buf.length > 10000, 'AV2 descargado debe pesar > 10 KB');
    assert.strictEqual(av2Buf.slice(0, 2).toString('utf8'), 'PK', 'Archivo .xlsx debe tener cabecera ZIP PK');

    const wbEdit = new ExcelJS.Workbook();
    await wbEdit.xlsx.load(av2Buf);
    wbEdit.getWorksheet('0_Tablero_Gerencial').getCell('B17').value = 12250;
    const editedBuf = Buffer.from(await wbEdit.xlsx.writeBuffer());

    const uploadForm = new FormData();
    uploadForm.append(
      'file',
      new Blob([editedBuf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      'AV2_Editado.xlsx'
    );
    const hydrateHttp = await fetch(`${baseUrl}/api/excel/hydrate`, {
      method: 'POST',
      body: uploadForm
    });
    const hydrateData = await hydrateHttp.json();
    assert.strictEqual(hydrateHttp.status, 200);
    assert.strictEqual(hydrateData.ok, true);
    assert.strictEqual(hydrateData.hydration.workbookKind, 'AV2');
    assert(hydrateData.hydration.changesCount > 0, 'Debe detectar cambio de precioCanalKg=12250');
    assert(hydrateData.appliedEventsCount > 0, 'Debe aplicar evento al store');
    assert.strictEqual(hydrateData.snapshot.state.preciosRegionales.precioCanalKg, 12250);

    // Regresa al valor base con rollback limpio
    await jsonFetch(`${baseUrl}/api/twin/rollback`, { method: 'POST', body: {} });
    console.log('[5/9] Excel compile -> download Buffer -> multipart upload hydrate verificados.');

    // -----------------------------------------------------------------------
    // 6. Live OpenAI Realtime Client Secret (gpt-realtime-2.1, marin, 1.18x)
    // -----------------------------------------------------------------------
    const rtSessionRes = await jsonFetch(`${baseUrl}/api/realtime/session`, { method: 'POST', body: {} });
    assert.strictEqual(rtSessionRes.status, 200, `Fallo /api/realtime/session: ${rtSessionRes.rawText}`);
    assert.strictEqual(rtSessionRes.data.ok, true);
    assert(typeof rtSessionRes.data.clientSecret === 'string' && rtSessionRes.data.clientSecret.length > 10);
    assert.strictEqual(rtSessionRes.data.model, 'gpt-realtime-2.1');
    assert.strictEqual(rtSessionRes.data.voice, 'marin');
    assert.strictEqual(rtSessionRes.data.speed, 1.18);
    assert.strictEqual(rtSessionRes.data.session.tools.length, 10, 'Deben registrarse las 10 herramientas');
    console.log(
      `[6/9] Sesión efímera OpenAI Realtime en vivo OK (model=${rtSessionRes.data.model}, voice=${rtSessionRes.data.voice}, speed=${rtSessionRes.data.speed}, tools=10).`
    );

    // -----------------------------------------------------------------------
    // 7. Ejecución directa de Tool Calls (Coreografía + Bitácora + RFC) + SSE
    // -----------------------------------------------------------------------
    const tcFocus = await jsonFetch(`${baseUrl}/api/realtime/tool-call`, {
      method: 'POST',
      body: { name: 'focus_section', arguments: { section: 'simulador_whatif', highlightCard: 'kpi-3-lotes' } }
    });
    assert.strictEqual(tcFocus.status, 200);
    assert.strictEqual(tcFocus.data.uiAction.section, 'simulador_whatif');
    await waitForSseEvent(
      sseConn.events,
      (e) => e.event === 'ui_choreography' && e.data?.section === 'simulador_whatif'
    );

    const tcLog = await jsonFetch(`${baseUrl}/api/realtime/tool-call`, {
      method: 'POST',
      body: {
        name: 'record_daily_log',
        arguments: { dia: 3, mortalidad: 1, alimRealKg: 10.5, tempC: 31.2, aguaL: 21.0, observacion: 'Bitácora vía voz' }
      }
    });
    assert.strictEqual(tcLog.status, 200);
    assert.strictEqual(tcLog.data.output.diasRegistrados, 1);

    const tcRfc = await jsonFetch(`${baseUrl}/api/realtime/tool-call`, {
      method: 'POST',
      body: {
        name: 'propose_structural_rfc',
        arguments: {
          titulo: 'Indicador de eficiencia europea en tablero',
          descripcion: 'Mostrar IEP semanal directamente en la tarjeta de Lote 1.',
          categoria: 'ux_frontend',
          archivosAfectados: ['avicola_app/public/app.js']
        }
      }
    });
    assert.strictEqual(tcRfc.status, 200);
    const createdRfcCode = tcRfc.data.output.rfcCode;
    assert.strictEqual(createdRfcCode, 'RFC-0001');
    await waitForSseEvent(
      sseConn.events,
      (e) => e.event === 'rfc_updated' && e.data?.rfc?.rfcCode === 'RFC-0001'
    );
    console.log('[7/9] Tool calls Realtime (focus_section, record_daily_log, propose_structural_rfc) y SSE verificados.');

    // -----------------------------------------------------------------------
    // 8. Live OpenAI Agente gpt-6.1-sol + TTS gpt-4o-mini-tts-2025-12-15
    // -----------------------------------------------------------------------
    const chatRes = await jsonFetch(`${baseUrl}/api/agent/chat`, {
      method: 'POST',
      body: {
        message: 'Según el estado vivo actual de AV-1, ¿cuántos bultos requiere el estándar comercial de 800 aves? Responde en máximo 20 palabras.'
      }
    });
    assert.strictEqual(chatRes.status, 200, `Fallo /api/agent/chat: ${chatRes.rawText}`);
    assert.strictEqual(chatRes.data.ok, true);
    assert(chatRes.data.replyText && chatRes.data.replyText.length > 5, 'Chat debe responder texto no vacío');
    assert(chatRes.data.replyText.includes('89'), `Se esperaba cifra 89 bultos en respuesta: ${chatRes.data.replyText}`);

    const ttsRes = await fetch(`${baseUrl}/api/agent/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Resumen verificado: el lote estándar de 800 pollos requiere 89 bultos.'
      })
    });
    assert.strictEqual(ttsRes.status, 200);
    assert((ttsRes.headers.get('content-type') || '').includes('audio/'), 'TTS debe devolver content-type audio');
    const ttsBuf = Buffer.from(await ttsRes.arrayBuffer());
    assert(ttsBuf.length > 5000, `Audio MP3 debe superar 5000 bytes (actual=${ttsBuf.length})`);
    console.log(
      `[8/9] Agente en vivo (${chatRes.data.model}) y TTS (${ttsRes.headers.get('x-tts-model')}, ${ttsBuf.length} bytes MP3) verificados.`
    );

    // -----------------------------------------------------------------------
    // 9. Ciclo REST completo Bridge Antigravity + Credenciales sin filtrar secretos
    // -----------------------------------------------------------------------
    const appRes = await jsonFetch(`${baseUrl}/api/bridge/rfcs/${createdRfcCode}/approve`, {
      method: 'POST',
      body: { approvedBy: 'Mauricio Bonilla', channel: 'web' }
    });
    assert.strictEqual(appRes.status, 200);
    assert.strictEqual(appRes.data.rfc.estado, 'aprobado');

    const exeRes = await jsonFetch(`${baseUrl}/api/bridge/rfcs/${createdRfcCode}/execute`, {
      method: 'POST',
      body: { notes: 'Verificado Fase 3' }
    });
    assert.strictEqual(exeRes.status, 200);
    assert.strictEqual(exeRes.data.rfc.estado, 'ejecutado');

    const rfc2Create = await jsonFetch(`${baseUrl}/api/bridge/rfcs`, {
      method: 'POST',
      body: { titulo: 'RFC para prueba reject', descripcion: 'Prueba de rechazo REST' }
    });
    assert.strictEqual(rfc2Create.status, 201);
    const rejRes = await jsonFetch(`${baseUrl}/api/bridge/rfcs/${rfc2Create.data.rfc.rfcCode}/reject`, {
      method: 'POST',
      body: { reason: 'No requerido' }
    });
    assert.strictEqual(rejRes.status, 200);
    assert.strictEqual(rejRes.data.rfc.estado, 'rechazado');

    const listRes = await jsonFetch(`${baseUrl}/api/bridge/rfcs`);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.data.counts.total, 2);
    assert.strictEqual(listRes.data.counts.ejecutados, 1);
    assert.strictEqual(listRes.data.counts.rechazados, 1);

    const credStatusBefore = await jsonFetch(`${baseUrl}/api/credentials/status`);
    assert.strictEqual(credStatusBefore.status, 200);
    assert(!credStatusBefore.rawText.includes('sk-'), 'El endpoint de credenciales nunca debe filtrar API keys');

    const credUpdate = await jsonFetch(`${baseUrl}/api/credentials`, {
      method: 'POST',
      body: { OPENAI_VOICE_SPEED: '1.18' }
    });
    assert.strictEqual(credUpdate.status, 200);
    assert.strictEqual(credUpdate.data.ok, true);
    assert(!credUpdate.rawText.includes('sk-'), 'La actualización de credenciales nunca debe filtrar API keys');
    assert(fs.existsSync(envFilePath), 'CredentialsManager debe escribir en el envFilePath temporal');

    console.log('[9/9] Ciclo REST Antigravity Bridge y CredentialsManager (0 fugas de secretos) verificados.');
    console.log('\n=== FASE 3 VERIFICADA CON 0 ERRORES ===');
  } finally {
    if (sseConn && sseConn.req) {
      try {
        sseConn.req.destroy();
      } catch (_) {
        // ignora
      }
    }
    await app.stop().catch(() => {});
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

runPhase3Verification().catch((err) => {
  console.error('ERROR EN VERIFICACION FASE 3:', err);
  process.exit(1);
});
