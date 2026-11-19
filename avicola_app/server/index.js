'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const TwinEngine = require('../shared/causal-twin-engine');
const { HybridTwinStore, loadEnvFiles } = require('./state-store');
const { compileTwinToWorkbooks, hydrateTwinFromWorkbook } = require('./excel-transubstantiator');
const { AntigravityBridge } = require('./antigravity-bridge');
const { CredentialsManager } = require('./credentials-manager');
const { OpenAIGateway, executeTwinToolCall } = require('./openai-gateway');
const { TelegramOmnichannelBot } = require('./telegram-bot');
const { UserAuthStore } = require('./auth-users');

const MAX_BODY_BYTES = 15 * 1024 * 1024;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function readRequestBuffer(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error(`Payload excede el límite de ${Math.round(maxBytes / (1024 * 1024))} MB.`));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRequestBuffer(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (err) {
    throw new Error(`JSON inválido en solicitud: ${err.message}`);
  }
}

function parseMultipartBuffer(rawBuf, contentType) {
  const match = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
  if (!match) {
    throw new Error('Header Content-Type multipart/form-data sin boundary.');
  }
  const boundary = match[1] || match[2];
  const delim = Buffer.from(`--${boundary}`);
  const crlfPair = Buffer.from('\r\n\r\n');
  const files = [];
  const fields = {};

  let pos = rawBuf.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (rawBuf.subarray(start, start + 2).toString('utf8') === '--') break;
    const partStart = rawBuf.subarray(start, start + 2).toString('utf8') === '\r\n' ? start + 2 : start;
    const nextDelim = rawBuf.indexOf(delim, partStart);
    if (nextDelim === -1) break;

    let partEnd = nextDelim;
    if (partEnd >= 2 && rawBuf[partEnd - 2] === 13 && rawBuf[partEnd - 1] === 10) {
      partEnd -= 2;
    }

    const part = rawBuf.subarray(partStart, partEnd);
    const headerEnd = part.indexOf(crlfPair);
    if (headerEnd !== -1) {
      const headersText = part.subarray(0, headerEnd).toString('utf8');
      const bodySlice = part.subarray(headerEnd + 4);
      const dispMatch = headersText.match(/name="([^"]+)"/);
      const fileMatch = headersText.match(/filename="([^"]*)"/);
      const fieldName = dispMatch ? dispMatch[1] : 'file';

      if (fileMatch) {
        const typeMatch = headersText.match(/Content-Type:\s*([^\r\n]+)/i);
        files.push({
          fieldName,
          filename: path.basename(fileMatch[1] || 'archivo.xlsx'),
          contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
          buffer: bodySlice
        });
      } else {
        fields[fieldName] = bodySlice.toString('utf8');
      }
    }

    pos = nextDelim;
  }

  return { files, fields };
}

function sendJson(res, statusCode, data) {
  const payload = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function serveStaticFile(res, baseDir, relPath) {
  const cleanRel = relPath === '/' ? 'index.html' : relPath.replace(/^\/+/, '');
  const resolvedBase = path.resolve(baseDir);
  const fullPath = path.resolve(resolvedBase, cleanRel);
  if (!fullPath.startsWith(resolvedBase)) {
    sendJson(res, 403, { ok: false, error: 'Acceso denegado.' });
    return true;
  }
  if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    return false;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const data = fs.readFileSync(fullPath);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Content-Length': data.length,
    'Cache-Control': 'no-cache'
  });
  res.end(data);
  return true;
}

function createAvicolaServer(options = {}) {
  loadEnvFiles(options.envFilePath ? [options.envFilePath] : []);

  const publicDir = options.publicDir || path.resolve(__dirname, '../public');
  const sharedDir = options.sharedDir || path.resolve(__dirname, '../shared');

  const store = new HybridTwinStore({
    dataDir: options.dataDir,
    supabaseUrl: options.supabaseUrl,
    supabaseKey: options.supabaseKey
  });
  const exportsDir = options.exportsDir || path.join(store.dataDir, 'exports');
  const bridge = new AntigravityBridge({
    bridgeDir: options.bridgeDir,
    supabaseUrl: options.supabaseUrl,
    supabaseKey: options.supabaseKey
  });
  const credentialsManager = new CredentialsManager({
    envFilePath: options.envFilePath
  });
  const authUsers = new UserAuthStore({ dataDir: store.dataDir });
  const openaiGateway = new OpenAIGateway();
  const transcriptFile = path.join(store.dataDir, 'conversation_transcript.jsonl');

  const readTranscriptEntries = (limit = 200) => {
    if (!fs.existsSync(transcriptFile)) return [];
    const lines = fs.readFileSync(transcriptFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    return lines
      .slice(-Math.max(1, Number(limit) || 200))
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
  };

  const appendTranscriptEntry = (raw = {}) => {
    fs.mkdirSync(path.dirname(transcriptFile), { recursive: true });
    const entry = {
      id: raw.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: raw.ts || new Date().toISOString(),
      channel: String(raw.channel || 'web'),
      role: String(raw.role || 'user'),
      text: String(raw.text || '').trim(),
      meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : undefined
    };
    if (!entry.text) return null;
    fs.appendFileSync(transcriptFile, JSON.stringify(entry) + '\n', 'utf8');
    return entry;
  };

  const sseClients = new Set();
  const emitSse = (eventName, payload) => {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const clientRes of sseClients) {
      try {
        clientRes.write(frame);
      } catch (_) {
        sseClients.delete(clientRes);
      }
    }
  };

  const telegramBot = new TelegramOmnichannelBot({
    store,
    bridge,
    openaiGateway,
    emitSse,
    token: options.telegramToken
  });

  const keepAliveTimer = setInterval(() => {
    for (const clientRes of sseClients) {
      try {
        clientRes.write(': ping\n\n');
      } catch (_) {
        sseClients.delete(clientRes);
      }
    }
  }, 25000);
  if (typeof keepAliveTimer.unref === 'function') keepAliveTimer.unref();

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,x-realtime-secret');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(reqUrl.pathname);
    const sessionUser = authUsers.verifySessionFromRequest(req);
    const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
    const isRestrictedPartner = Boolean(sessionUser && sessionUser.role === 'farm_partner');

    try {
      // Healthcheck público para balanceadores Cloud / Railway / PWA
      if (req.method === 'GET' && pathname === '/health') {
        const snap = store.getFullSnapshot();
        const intStatus = credentialsManager.getIntegrationsStatus({ store, telegramBot });
        return sendJson(res, 200, {
          ok: true,
          service: 'avi-granja-la-alejandra',
          version: snap.version,
          timestamp: new Date().toISOString(),
          openaiConfigured: intStatus.openai.configured,
          supabaseConfigured: intStatus.supabase.configured
        });
      }

      // ---------------------------------------------------------------------
      // Autenticación Multiusuario & Separación de Entornos (RBAC)
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/auth/session') {
        return sendJson(res, 200, {
          ok: true,
          authenticated: Boolean(sessionUser),
          user: sessionUser,
          profiles: authUsers.listPublicProfiles()
        });
      }

      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const body = await readJsonBody(req);
        const secret = body.password !== undefined ? body.password : body.pin;
        const authRes = authUsers.authenticate(body.username, secret);
        if (!authRes) {
          return sendJson(res, 401, { ok: false, error: 'Usuario o PIN/contraseña incorrectos.' });
        }
        const payload = Buffer.from(
          JSON.stringify({ ok: true, user: authRes.user, sessionToken: authRes.sessionToken }),
          'utf8'
        );
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length,
          'Set-Cookie': authUsers.buildSessionCookieHeader(authRes.sessionToken),
          'Cache-Control': 'no-store'
        });
        res.end(payload);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/auth/logout') {
        const payload = Buffer.from(JSON.stringify({ ok: true }), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': payload.length,
          'Set-Cookie': authUsers.buildClearCookieHeader(),
          'Cache-Control': 'no-store'
        });
        res.end(payload);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/auth/users') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Solo el Propietario Administrador puede listar cuentas.' });
        }
        const profiles = authUsers.listPublicProfiles();
        return sendJson(res, 200, { ok: true, profiles, users: profiles });
      }

      if (req.method === 'POST' && pathname === '/api/auth/users') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Se requiere sesión de Propietario para crear o editar usuarios.' });
        }
        const body = await readJsonBody(req);
        const userPayload = Object.assign({}, body || {}, {
          password: body && body.password !== undefined ? body.password : body?.pin
        });
        const updatedUser = authUsers.upsertUser(userPayload, sessionUser);
        const profiles = authUsers.listPublicProfiles();
        emitSse('users_updated', { profiles });
        return sendJson(res, 200, { ok: true, user: updatedUser, profiles, users: profiles });
      }

      if (req.method === 'GET' && pathname === '/api/admin/template-blueprint') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Acceso reservado para Propietario Administrador.' });
        }
        const st = store.getState();
        const sanitizedPrecios = Object.assign({}, st.preciosRegionales, {
          arriendoIniMes: 1200000,
          arriendoRegMes: 1200000,
          colaboradorLote: 600000
        });
        const blueprint = {
          schemaVersion: '1.0.0',
          templateKind: 'avicola_standalone_blueprint',
          generatedAt: new Date().toISOString(),
          notes: 'Plantilla financiera y biológica de referencia genérica (sin acuerdos privados de Granja La Alejandra ni viajes reales), lista para nuevos proyectos.',
          preciosRegionales: sanitizedPrecios,
          parametrosGenerales: Object.assign({}, st.parametrosGenerales),
          curvasBiologicas: {
            pesosRoss308G: TwinEngine.ROSS_PESO_G,
            consumoAcumRoss308G: TwinEngine.ROSS_CONS_ACUM_G
          },
          loteModeloInicial: {
            nombre: 'Lote 1 (Nuevo Proyecto)',
            avesIniciadas: 800,
            edadObjetivoDias: 42,
            mortalidadEsperadaPct: 0.03,
            programaAlimento: '100% Comercial'
          }
        };
        const buf = Buffer.from(JSON.stringify(blueprint, null, 2), 'utf8');
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="Plantilla_Negocio_Avicola_Base.json"',
          'Content-Length': buf.length
        });
        res.end(buf);
        return;
      }

      // ---------------------------------------------------------------------
      // SSE Tiempo Real
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/events/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive'
        });
        res.write('retry: 3000\n');
        res.write(
          `event: connected\ndata: ${JSON.stringify({ ok: true, version: store.version, ts: new Date().toISOString() })}\n\n`
        );
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      // ---------------------------------------------------------------------
      // Health & Twin State
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'avicola-digital-twin-server',
          version: store.version,
          integrations: credentialsManager.getIntegrationsStatus({ store, telegramBot }),
          uptimeSec: Math.round(process.uptime())
        });
      }

      if (req.method === 'GET' && pathname === '/api/twin/state') {
        const snapshot = store.getFullSnapshot();
        return sendJson(res, 200, {
          ok: true,
          snapshot,
          zeroDivergence: TwinEngine.verifyZeroDivergence(snapshot.computed)
        });
      }

      if (req.method === 'POST' && pathname === '/api/twin/event') {
        const body = await readJsonBody(req);
        if (!body || !body.type) {
          return sendJson(res, 400, { ok: false, error: 'El campo type es obligatorio en /api/twin/event.' });
        }
        const applied = await store.appendEventAndApply({
          type: body.type,
          sourceChannel: body.sourceChannel || 'web',
          actor: body.actor || 'operator',
          payload: body.payload || {}
        });
        emitSse('state_updated', {
          version: applied.snapshot.version,
          event: applied.event,
          snapshot: applied.snapshot
        });
        return sendJson(res, 200, { ok: true, ...applied });
      }

      if (req.method === 'POST' && pathname === '/api/twin/what-if') {
        const body = await readJsonBody(req);
        const simulation = TwinEngine.simulateWhatIf(store.getState(), body || {});
        return sendJson(res, 200, { ok: true, simulation });
      }

      if (req.method === 'POST' && pathname === '/api/twin/rollback') {
        const rolled = await store.rollbackLastEvent();
        emitSse('state_updated', {
          version: rolled.snapshot.version,
          event: { type: 'ROLLBACK', revertedEventId: rolled.revertedEventId },
          snapshot: rolled.snapshot
        });
        return sendJson(res, 200, { ok: true, ...rolled });
      }

      // ---------------------------------------------------------------------
      // Transustanciación Excel AV-1 & AV-2
      // ---------------------------------------------------------------------
      if (req.method === 'POST' && pathname === '/api/excel/compile') {
        const body = await readJsonBody(req);
        const compiled = await compileTwinToWorkbooks(store.getState(), {
          exportsDir,
          rfcs: bridge.listRfcs(),
          updateCanonical: Boolean(body && body.updateCanonical === true)
        });
        return sendJson(res, 200, {
          ok: true,
          compiledAt: compiled.compiledAt,
          downloads: {
            AV1: '/api/excel/download/AV1',
            AV2: '/api/excel/download/AV2'
          },
          files: compiled.files
        });
      }

      const dlMatch = pathname.match(/^\/api\/excel\/download\/([^/]+)$/);
      if (req.method === 'GET' && dlMatch) {
        const kind = dlMatch[1].toUpperCase();
        if (kind !== 'AV1' && kind !== 'AV2') {
          return sendJson(res, 400, { ok: false, error: 'Tipo de libro debe ser AV1 o AV2.' });
        }
        if (!isOwner && kind === 'AV1') {
          return sendJson(res, 403, { ok: false, error: 'Acceso restringido: este perfil opera únicamente con Granja Real.' });
        }
        const compiled = await compileTwinToWorkbooks(store.getState(), {
          exportsDir,
          rfcs: bridge.listRfcs()
        });
        const targetPath = kind === 'AV1' ? compiled.files.av1Path : compiled.files.av2Path;
        const buf = fs.readFileSync(targetPath);
        const filename = path.basename(targetPath);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buf.length
        });
        res.end(buf);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/excel/hydrate') {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        let fileBuffer = null;
        let applyEvents = true;

        if (ct.includes('multipart/form-data')) {
          const rawBuf = await readRequestBuffer(req);
          const parsed = parseMultipartBuffer(rawBuf, req.headers['content-type']);
          if (!parsed.files.length) {
            return sendJson(res, 400, { ok: false, error: 'No se adjuntó ningún archivo .xlsx.' });
          }
          fileBuffer = parsed.files[0].buffer;
          if (parsed.fields.applyEvents === 'false') applyEvents = false;
        } else {
          const body = await readJsonBody(req);
          if (!body.fileBase64) {
            return sendJson(res, 400, { ok: false, error: 'Envía multipart/form-data o fileBase64 en JSON.' });
          }
          const cleanB64 = String(body.fileBase64).replace(/^data:[^;]+;base64,/, '');
          fileBuffer = Buffer.from(cleanB64, 'base64');
          if (body.applyEvents === false) applyEvents = false;
        }

        const hydration = await hydrateTwinFromWorkbook(fileBuffer, store.getState());
        let appliedEventsCount = 0;
        if (applyEvents && hydration.generatedEvents.length > 0) {
          for (const evt of hydration.generatedEvents) {
            await store.appendEventAndApply({
              ...evt,
              sourceChannel: 'web_excel_upload',
              actor: 'excel_hydration'
            });
            appliedEventsCount++;
          }
          const snap = store.getFullSnapshot();
          emitSse('state_updated', {
            version: snap.version,
            event: { type: 'EXCEL_HYDRATION', changesCount: hydration.changesCount },
            snapshot: snap
          });
        }

        return sendJson(res, 200, {
          ok: true,
          hydration: {
            workbookKind: hydration.workbookKind,
            changesCount: hydration.changesCount,
            diffChanges: hydration.diffChanges,
            financialImpact: hydration.financialImpact,
            generatedEventsCount: hydration.generatedEvents.length
          },
          appliedEventsCount,
          snapshot: store.getFullSnapshot()
        });
      }

      // ---------------------------------------------------------------------
      // OpenAI Realtime WebRTC + Agente Multimodal + TTS
      // ---------------------------------------------------------------------
      if (req.method === 'POST' && pathname === '/api/realtime/session') {
        const body = await readJsonBody(req);
        const sessionRes = await openaiGateway.createRealtimeEphemeralSession({
          store,
          bridge,
          sessionUser,
          customVoice: body.voice || null,
          customSpeed: body.speed !== undefined ? body.speed : null,
          customModel: body.model || null,
          noiseProfile: body.noiseProfile || 'galpon_estricto',
          uiContext: body.uiContext || null
        });
        return sendJson(res, 200, sessionRes);
      }

      if (req.method === 'POST' && pathname === '/api/realtime/sdp') {
        const ct = String(req.headers['content-type'] || '').toLowerCase();
        let sdpOffer = '';
        let clientSecret = req.headers['x-realtime-secret'] || reqUrl.searchParams.get('clientSecret') || '';

        if (ct.includes('application/sdp') || ct.includes('text/plain')) {
          sdpOffer = (await readRequestBuffer(req)).toString('utf8');
        } else {
          const body = await readJsonBody(req);
          sdpOffer = body.sdpOffer || body.sdp || '';
          clientSecret = body.clientSecret || clientSecret;
        }

        const out = await openaiGateway.exchangeRealtimeSdp({ sdpOffer, clientSecret });
        if (String(req.headers.accept || '').includes('application/sdp')) {
          const buf = Buffer.from(out.sdpAnswer, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/sdp', 'Content-Length': buf.length });
          res.end(buf);
          return;
        }
        return sendJson(res, 200, out);
      }

      if (req.method === 'POST' && pathname === '/api/realtime/tool-call') {
        const body = await readJsonBody(req);
        const toolName = body.name || body.toolName;
        if (!toolName) {
          return sendJson(res, 400, { ok: false, error: 'Falta name o toolName en tool-call.' });
        }
        const toolOut = await executeTwinToolCall(toolName, body.arguments ?? body.args ?? {}, {
          store,
          bridge,
          sessionUser,
          uiContext: body.uiContext || null,
          sourceChannel: body.sourceChannel || 'web_realtime',
          actor: (sessionUser && sessionUser.displayName) || body.actor || 'gpt-realtime-2.1',
          emitSse
        });
        if (toolOut && toolOut.forbidden) {
          return sendJson(res, 403, {
            ...toolOut,
            snapshot: store.getFullSnapshot()
          });
        }
        return sendJson(res, 200, {
          ...toolOut,
          snapshot: store.getFullSnapshot()
        });
      }

      if (req.method === 'POST' && pathname === '/api/agent/chat') {
        const body = await readJsonBody(req);
        if (!body.message && !body.imageBase64) {
          return sendJson(res, 400, { ok: false, error: 'Envía message o imageBase64.' });
        }
        const chatRes = await openaiGateway.runAgenticTurn({
          message: body.message,
          imageBase64: body.imageBase64 || null,
          imageMimeType: body.imageMimeType || 'image/jpeg',
          sourceChannel: body.sourceChannel || 'web_chat',
          actor: (sessionUser && sessionUser.displayName) || body.actor || 'usuario_web',
          store,
          bridge,
          sessionUser,
          uiContext: body.uiContext || null,
          emitSse
        });
        return sendJson(res, 200, chatRes);
      }

      if (req.method === 'POST' && pathname === '/api/agent/tts') {
        const body = await readJsonBody(req);
        if (!body.text || !String(body.text).trim()) {
          return sendJson(res, 400, { ok: false, error: 'El campo text es obligatorio para TTS.' });
        }
        const tts = await openaiGateway.synthesizeSpeechBuffer(body.text, {
          voice: body.voice,
          speed: body.speed,
          model: body.model
        });
        res.writeHead(200, {
          'Content-Type': tts.contentType,
          'Content-Length': tts.buffer.length,
          'X-TTS-Model': tts.model
        });
        res.end(tts.buffer);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/agent/guided-briefing') {
        const result = await openaiGateway.generateStrategicGuidedBriefing({
          store,
          sessionUser
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'POST' && pathname === '/api/agent/specialist') {
        const body = await readJsonBody(req);
        const advice = openaiGateway.consultSpecialist({
          store,
          sessionUser,
          especialista: body.especialista || 'bsc_kaplan_norton',
          consulta: body.consulta || '',
          uiContext: body.uiContext || null
        });
        emitSse('ui_choreography', {
          type: 'ui_choreography',
          action: 'focus_section',
          section: advice.focusSection,
          ts: new Date().toISOString()
        });
        return sendJson(res, 200, advice);
      }

      if (req.method === 'POST' && pathname === '/api/agent/negotiation-playbook') {
        const body = await readJsonBody(req);
        const playbook = openaiGateway.generateNegotiationPlaybook({
          store,
          sessionUser,
          params: body || {}
        });
        emitSse('ui_choreography', {
          type: 'ui_choreography',
          action: 'focus_section',
          section: 'operacion_av2',
          highlightCard: 'panel-ventas-parciales',
          ts: new Date().toISOString()
        });
        return sendJson(res, 200, playbook);
      }

      if (req.method === 'POST' && pathname === '/api/agent/simulations') {
        const body = await readJsonBody(req);
        const simRes = openaiGateway.runWowSimulation({
          store,
          sessionUser,
          simulationId: body.simulationId || 'todas',
          options: body.options || {}
        });
        emitSse('ui_choreography', {
          type: 'ui_choreography',
          action: 'focus_section',
          section: 'simulador_whatif',
          ts: new Date().toISOString()
        });
        return sendJson(res, 200, simRes);
      }

      if (req.method === 'POST' && pathname === '/api/agent/elephant-goldfish') {
        const body = await readJsonBody(req);
        const board = await openaiGateway.runElephantGoldfish({
          store,
          sessionUser,
          proposal: body.proposal || body.consulta || '',
          uiContext: body.uiContext || null
        });
        emitSse('ui_choreography', {
          type: 'ui_choreography',
          action: 'focus_section',
          section: 'simulador_whatif',
          ts: new Date().toISOString()
        });
        return sendJson(res, 200, board);
      }

      if (req.method === 'POST' && pathname === '/api/agent/decisions-eval') {
        const body = await readJsonBody(req);
        const evalRes = await openaiGateway.evaluateDecisions({
          store,
          sessionUser,
          message: body.message || '',
          mediaDescription: body.mediaDescription || '',
          domain: body.domain || 'sanidad_bioseguridad_ica',
          uiContext: body.uiContext || null
        });
        return sendJson(res, 200, evalRes);
      }

      if (req.method === 'POST' && pathname === '/api/agent/avi-vision-dialogue') {
        const body = await readJsonBody(req);
        const dialogue = await openaiGateway.runAviVisionDialogue({
          store,
          sessionUser,
          topic: body.topic || body.consulta || body.message || '',
          uiContext: body.uiContext || null,
          spontaneous: Boolean(body.spontaneous)
        });
        emitSse('ui_choreography', {
          type: 'ui_choreography',
          action: 'avi_vision_dialogue',
          section: 'simulador_whatif',
          highlightTarget: 'vision-layers-card',
          ...dialogue,
          speakOutLoud: Boolean(body.speakOutLoud !== false)
        });
        return sendJson(res, 200, dialogue);
      }

      // ---------------------------------------------------------------------
      // Puente REST Antigravity (RFCs)
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/bridge/rfcs') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'El historial técnico RFC está reservado para el Propietario Administrador.' });
        }
        const estado = reqUrl.searchParams.get('estado') || null;
        const rfcs = bridge.listRfcs(estado);
        const all = estado ? bridge.listRfcs() : rfcs;
        return sendJson(res, 200, {
          ok: true,
          rfcs,
          inboxPath: bridge.inboxPath,
          counts: {
            total: all.length,
            pendientes: all.filter((r) => r.estado === 'pendiente_aprobacion').length,
            aprobados: all.filter((r) => r.estado === 'aprobado').length,
            ejecutados: all.filter((r) => r.estado === 'ejecutado').length,
            rechazados: all.filter((r) => r.estado === 'rechazado').length
          }
        });
      }

      if (req.method === 'POST' && pathname === '/api/bridge/rfcs') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Los cambios estructurales (RFC) están reservados para el Administrador.' });
        }
        const body = await readJsonBody(req);
        const rfc = await bridge.createRfcProposal(body || {});
        emitSse('rfc_updated', { action: 'created', rfc });
        return sendJson(res, 201, { ok: true, rfc });
      }

      const rfcApproveMatch = pathname.match(/^\/api\/bridge\/rfcs\/(RFC-\d{4})\/approve$/i);
      if (req.method === 'POST' && rfcApproveMatch) {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Aprobación de RFC reservada para el Administrador.' });
        }
        const body = await readJsonBody(req);
        const code = rfcApproveMatch[1].toUpperCase();
        const rfc = await bridge.approveRfc(code, {
          approvedBy: body.approvedBy || 'Mauricio Bonilla',
          channel: body.channel || 'web'
        });
        emitSse('rfc_updated', { action: 'approved', rfc });
        return sendJson(res, 200, { ok: true, rfc });
      }

      const rfcRejectMatch = pathname.match(/^\/api\/bridge\/rfcs\/(RFC-\d{4})\/reject$/i);
      if (req.method === 'POST' && rfcRejectMatch) {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Operación solo permitida para el administrador (owner).' });
        }
        const body = await readJsonBody(req);
        const code = rfcRejectMatch[1].toUpperCase();
        const rfc = await bridge.rejectRfc(code, {
          rejectedBy: body.rejectedBy || 'Mauricio Bonilla',
          reason: body.reason || 'Descartado desde interfaz'
        });
        emitSse('rfc_updated', { action: 'rejected', rfc });
        return sendJson(res, 200, { ok: true, rfc });
      }

      const rfcExecMatch = pathname.match(/^\/api\/bridge\/rfcs\/(RFC-\d{4})\/execute$/i);
      if (req.method === 'POST' && rfcExecMatch) {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'Operación solo permitida para el administrador (owner).' });
        }
        const body = await readJsonBody(req);
        const code = rfcExecMatch[1].toUpperCase();
        const rfc = await bridge.markRfcExecuted(code, {
          notes: body.notes || 'Ejecutado y verificado desde Antigravity'
        });
        emitSse('rfc_updated', { action: 'executed', rfc });
        return sendJson(res, 200, { ok: true, rfc });
      }

      // ---------------------------------------------------------------------
      // Persistencia de Conversación IA & Minuta / Acta Ejecutiva (RFC-0003)
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/conversation/log') {
        const limit = Number(reqUrl.searchParams.get('limit') || 200);
        const entries = readTranscriptEntries(limit);
        return sendJson(res, 200, { ok: true, entries, count: entries.length });
      }

      if (req.method === 'POST' && pathname === '/api/conversation/log') {
        const body = await readJsonBody(req);
        const entry = appendTranscriptEntry(body);
        if (!entry) {
          return sendJson(res, 400, { ok: false, error: 'Se requiere campo text no vacío.' });
        }
        emitSse('conversation_logged', entry);
        return sendJson(res, 201, { ok: true, entry });
      }

      if (req.method === 'GET' && pathname === '/api/minuta/export') {
        const snap = store.getFullSnapshot();
        const rfcs = bridge.listRfcs();
        const transcript = readTranscriptEntries(150);
        const c = snap.computed;
        const st = snap.state;
        const ident = st.identidadAgente || c.identidadAgente || { nombre: 'Avi', rol: 'Copiloto Gerencial y Zootécnico' };
        const trans = c.av2.transporte || { viajes: [], kmTotales: 0, costoTransporteTotalCop: 0, utilidadLote1PostTransporteCop: 0 };
        const ventasRes = c.av2.ventasParcialesResumen || { ventas: [], totalAvesVendidas: 0, totalKgVendidos: 0, totalIngresosCop: 0, totalMargenCop: 0, comparativaModalidadesLote1: {} };
        const diasBit = (c.av2.bitacora?.dias || []).filter((d) => d.tieneRegistro);
        const format = String(reqUrl.searchParams.get('format') || '').toLowerCase();
        if (format === 'json') {
          return sendJson(res, 200, {
            ok: true,
            generatedAt: new Date().toISOString(),
            identidadAgente: ident,
            snapshotVersion: snap.version,
            transporte: trans,
            ventasParcialesResumen: ventasRes,
            bitacoraActiva: diasBit,
            rfcs: isOwner ? rfcs : [],
            transcript
          });
        }

        const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const cop = (n) => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`;
        const cmp = ventasRes.comparativaModalidadesLote1 || {};

        const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Acta & Minuta Ejecutiva — Avi · Granja La Alejandra (El Zulia)</title>
<style>
  :root { --bg:#0f172a; --card:#ffffff; --ink:#111827; --muted:#475569; --line:#e2e8f0; --accent:#0d9488; }
  *{ box-sizing:border-box; }
  body{ font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif; margin:0; padding:24px; color:var(--ink); background:#f8fafc; line-height:1.45; }
  .toolbar{ display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; background:var(--bg); color:#fff; padding:14px 18px; border-radius:10px; margin-bottom:20px; }
  .toolbar button, .toolbar a{ border:none; background:#14b8a6; color:#042f2e; font-weight:700; padding:9px 14px; border-radius:8px; cursor:pointer; text-decoration:none; font-size:13px; }
  .toolbar a.alt{ background:#334155; color:#f8fafc; }
  .sheet{ max-width:1020px; margin:0 auto; background:var(--card); padding:28px 32px; border-radius:12px; border:1px solid var(--line); box-shadow:0 8px 24px rgba(15,23,42,.06); }
  h1{ margin:0 0 6px; font-size:22px; }
  h2{ margin:24px 0 10px; font-size:15px; text-transform:uppercase; letter-spacing:.04em; color:var(--accent); border-bottom:1px solid var(--line); padding-bottom:4px; }
  .meta{ color:var(--muted); font-size:13px; margin-bottom:18px; }
  .kpis{ display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:14px 0; }
  .kpi{ border:1px solid var(--line); border-radius:8px; padding:10px 12px; background:#f8fafc; }
  .kpi .lbl{ font-size:11px; color:var(--muted); text-transform:uppercase; }
  .kpi .val{ font-size:17px; font-weight:700; margin-top:3px; }
  table{ width:100%; border-collapse:collapse; font-size:12.5px; margin-top:8px; }
  th,td{ border:1px solid var(--line); padding:7px 9px; text-align:left; vertical-align:top; }
  th{ background:#f1f5f9; font-weight:700; }
  .msg{ padding:6px 10px; border-left:3px solid #cbd5e1; margin-bottom:6px; background:#f8fafc; font-size:12.5px; }
  .msg.user{ border-left-color:#2563eb; } .msg.agent{ border-left-color:#0d9488; }
  @media print { body{ background:#fff; padding:0; } .toolbar{ display:none; } .sheet{ box-shadow:none; border:none; padding:10px; } }
</style>
</head>
<body>
  <div class="toolbar">
    <div><strong>Acta / Minuta Ejecutiva · Granja La Alejandra</strong> · Estado Reg. #${snap.version}</div>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()">Imprimir / Guardar PDF</button>
      <a class="alt" href="/api/excel/download/AV2">Descargar Excel Granja</a>
      ${isOwner ? '<a class="alt" href="/api/excel/download/AV1">Descargar Excel Plantilla</a>' : ''}
    </div>
  </div>
  <div class="sheet">
    <h1>Granja La Alejandra (El Zulia) — Minuta Operativa y Financiera</h1>
    <div class="meta">Asistente Activo: <strong>${esc(ident.nombre)}</strong> (${esc(ident.rol)}) · Vereda La Alejandra, El Zulia · Emitida: ${esc(new Date().toLocaleString('es-CO'))} · Reg. Hash: <code>${esc(snap.stateHash)}</code></div>

    <div class="kpis">
      <div class="kpi"><div class="lbl">Utilidad 3 Lotes Granja</div><div class="val">${cop(c.av2.consolidado3Lotes.utilidadCanal)}</div></div>
      <div class="kpi"><div class="lbl">Capital Pico Sem 7</div><div class="val">${cop(c.av2.tesoreriaResumen.capitalTrabajoPicoSem7)}</div></div>
      <div class="kpi"><div class="lbl">Costo Transporte (${trans.viajes.length} viajes)</div><div class="val">${cop(trans.costoTransporteTotalCop)}</div></div>
      <div class="kpi"><div class="lbl">Ref. L1 100% Desposte</div><div class="val">${cop(cmp.piezas100?.utilidadCop || 0)}</div></div>
    </div>

    <h2>1. Control de Viajes, Kilometraje & Odómetro</h2>
    <table>
      <thead><tr><th>ID</th><th>Fecha</th><th>Lote</th><th>Odómetro</th><th>Km</th><th>Costo Aplicado</th><th>Estado / Nota</th></tr></thead>
      <tbody>${trans.viajes.length ? trans.viajes.map((v) => `<tr><td>${esc(v.id)}</td><td>${esc(v.fecha)}</td><td>${esc(v.loteId)}</td><td>${v.odometroInicial ?? '-'} → ${v.odometroFinal ?? 'Pendiente'}</td><td>${v.kmRecorridos} km</td><td>${cop(v.costoAplicadoCop)}</td><td><strong>${esc(v.estado)}</strong> · ${esc(v.observacion || v.motivo)}</td></tr>`).join('') : '<tr><td colspan="7">Sin viajes registrados.</td></tr>'}</tbody>
    </table>

    <h2>2. Salidas Parciales & Comparativa de Modalidades</h2>
    <table>
      <thead><tr><th>Modalidad Lote 1 (Simulación 100%)</th><th>Kg Vendibles</th><th>Precio/Kg</th><th>Ingreso</th><th>Costo Total</th><th>Utilidad Neta</th><th>Margen</th></tr></thead>
      <tbody>${[cmp.enPie100, cmp.canal100, cmp.piezas100].filter(Boolean).map((m) => `<tr><td>${esc(m.modalidad)}</td><td>${Number(m.kgVendibles || 0).toFixed(1)} kg</td><td>${cop(m.precioKgCop)}</td><td>${cop(m.ingresoCop)}</td><td>${cop(m.costoCop)}</td><td><strong>${cop(m.utilidadCop)}</strong></td><td>${((m.margenPct || 0) * 100).toFixed(1)}%</td></tr>`).join('')}</tbody>
    </table>
    <table>
      <thead><tr><th>Venta</th><th>Fecha</th><th>Cliente</th><th>Modalidad</th><th>Aves</th><th>Kg</th><th>Ingreso</th><th>Margen Bruto</th></tr></thead>
      <tbody>${ventasRes.ventas.length ? ventasRes.ventas.map((s) => `<tr><td>${esc(s.id)}</td><td>${esc(s.fecha)}</td><td>${esc(s.cliente)}</td><td>${esc(s.modalidad)} (${esc(s.corteDetalle)})</td><td>${s.cantidadAves}</td><td>${Number(s.pesoKg).toFixed(1)}</td><td>${cop(s.ingresoTotalCop)}</td><td>${cop(s.margenBrutoCop)}</td></tr>`).join('') : '<tr><td colspan="8">Sin ventas parciales registradas aún.</td></tr>'}</tbody>
    </table>

    <h2>3. Bitácora de Campo Lote 1 (${diasBit.length} días registrados)</h2>
    <table>
      <thead><tr><th>Día</th><th>Fecha</th><th>Aves Vivas</th><th>Bajas</th><th>Alim. Real (kg)</th><th>Observación</th></tr></thead>
      <tbody>${diasBit.length ? diasBit.map((d) => `<tr><td>Día ${d.dia}</td><td>${esc(d.fecha)}</td><td>${d.avesVivas}</td><td>${d.mortalidad + d.descarte}</td><td>${d.alimRealKg ?? '-'}</td><td>${esc(d.observacion)}</td></tr>`).join('') : '<tr><td colspan="6">Sin registros diarios aún.</td></tr>'}</tbody>
    </table>

    ${isOwner ? `<h2>4. Puente de Cambios Técnicos (${rfcs.length})</h2>
    <table>
      <thead><tr><th>Código</th><th>Estado</th><th>Categoría</th><th>Título</th><th>Archivos</th></tr></thead>
      <tbody>${rfcs.map((r) => `<tr><td>${esc(r.rfcCode)}</td><td>${esc(r.estado)}</td><td>${esc(r.categoria)}</td><td>${esc(r.titulo)}</td><td><code>${esc((r.archivosAfectados || []).join(', '))}</code></td></tr>`).join('')}</tbody>
    </table>` : ''}

    <h2>${isOwner ? '5' : '4'}. Historial Persistido de Conversación (${transcript.length})</h2>
    ${transcript.length ? transcript.map((m) => `<div class="msg ${esc(m.role)}"><strong>[${esc(m.role.toUpperCase())} · ${esc(m.channel)}]</strong> ${esc(m.text)} <small style="color:#64748b">(${esc(m.ts)})</small></div>`).join('') : '<p class="meta">Sin mensajes registrados.</p>'}
  </div>
</body>
</html>`;
        const buf = Buffer.from(html, 'utf8');
        const headers = {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': buf.length,
          'Cache-Control': 'no-cache'
        };
        if (reqUrl.searchParams.get('download') === '1') {
          headers['Content-Disposition'] = 'attachment; filename="Minuta_Granja_La_Alejandra.html"';
        }
        res.writeHead(200, headers);
        res.end(buf);
        return;
      }

      // ---------------------------------------------------------------------
      // Credenciales (Sin exponer secretos)
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname === '/api/credentials/status') {
        return sendJson(res, 200, {
          ok: true,
          status: credentialsManager.getIntegrationsStatus({ store, telegramBot })
        });
      }

      if (req.method === 'POST' && pathname === '/api/credentials') {
        if (!isOwner) {
          return sendJson(res, 403, { ok: false, error: 'La gestión de credenciales está reservada al Administrador.' });
        }
        const body = await readJsonBody(req);
        const result = await credentialsManager.updateCredentials(body || {}, {
          store,
          telegramBot,
          bridge
        });
        emitSse('credentials_updated', result.status);
        return sendJson(res, 200, result);
      }

      // ---------------------------------------------------------------------
      // Archivos Estáticos (/shared/* y public/*)
      // ---------------------------------------------------------------------
      if (req.method === 'GET' && pathname.startsWith('/shared/')) {
        const served = serveStaticFile(res, sharedDir, pathname.slice('/shared/'.length));
        if (served) return;
      }

      if (req.method === 'GET' && !pathname.startsWith('/api/')) {
        const served = serveStaticFile(res, publicDir, pathname);
        if (served) return;
      }

      return sendJson(res, 404, { ok: false, error: `Ruta no encontrada: ${pathname}` });
    } catch (err) {
      const msg = err && err.message ? err.message : 'Error interno del servidor.';
      const status = /no existe|desconocida|inválido|obligatorio/i.test(msg) ? 400 : 500;
      return sendJson(res, status, { ok: false, error: msg });
    }
  });

  async function start(listenPort = null, listenHost = null) {
    await store.init();
    authUsers.init();
    bridge.init();
    fs.mkdirSync(exportsDir, { recursive: true });

    if (options.enableTelegram !== false) {
      await telegramBot.start();
    }

    const targetPort =
      listenPort !== null && listenPort !== undefined ? Number(listenPort) : Number(options.port ?? process.env.PORT ?? 3400);
    const isCloudEnv = Boolean(process.env.PORT || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production');
    const targetHost = listenHost || options.host || process.env.HOST || (isCloudEnv ? '0.0.0.0' : '127.0.0.1');

    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(targetPort, targetHost, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    const addr = server.address();
    const actualPort = typeof addr === 'object' && addr ? addr.port : targetPort;
    return {
      host: targetHost,
      port: actualPort,
      url: `http://${targetHost}:${actualPort}`,
      store,
      bridge,
      credentialsManager,
      openaiGateway,
      telegramBot
    };
  }

  async function stop() {
    clearInterval(keepAliveTimer);
    await telegramBot.stop();
    for (const clientRes of sseClients) {
      try {
        clientRes.end();
      } catch (_) {
        // ignora
      }
    }
    sseClients.clear();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return {
    server,
    store,
    bridge,
    credentialsManager,
    openaiGateway,
    telegramBot,
    emitSse,
    start,
    stop
  };
}

if (require.main === module) {
  const app = createAvicolaServer();
  app
    .start()
    .then((info) => {
      const st = info.credentialsManager.getIntegrationsStatus({
        store: info.store,
        telegramBot: info.telegramBot
      });
      console.log(`Servidor Avicola Digital Twin escuchando en ${info.url}`);
      console.log(
        `OpenAI=${st.openai.configured ? st.openai.realtimeModel : 'PENDIENTE'} | Supabase=${st.supabase.configured} | Telegram=${st.telegram.running}`
      );
    })
    .catch((err) => {
      console.error('Error iniciando servidor Avícola:', err);
      process.exit(1);
    });
}

module.exports = {
  createAvicolaServer,
  parseMultipartBuffer
};
