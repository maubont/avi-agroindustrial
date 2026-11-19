'use strict';

const fs = require('fs');
const path = require('path');
const { compileTwinToWorkbooks, hydrateTwinFromWorkbook } = require('./excel-transubstantiator');

const TELEGRAM_API = 'https://api.telegram.org';

function cop(val) {
  return `$${Math.round(Number(val || 0)).toLocaleString('es-CO')}`;
}

function parseAllowedChats(raw) {
  const s = String(raw || '').trim();
  if (!s) return new Set();
  return new Set(
    s
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
  );
}

/**
 * Canal omnicanal directo para Telegram (@BotFather) sin dependencias intermedias.
 * Soporta comandos, texto, notas de voz (STT -> Agente -> TTS 1.18x), fotos de facturas/galpón,
 * carga/descarga de Excel AV-1/AV-2 y aprobación de tarjetas RFC con botones inline.
 */
class TelegramOmnichannelBot {
  constructor(options = {}) {
    this.store = options.store;
    this.bridge = options.bridge;
    this.openaiGateway = options.openaiGateway;
    this.emitSse = options.emitSse || (() => {});
    this.token = (options.token ?? process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    this.allowedChatIds = parseAllowedChats(
      options.allowedChatIds ?? process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? ''
    );
    this.running = false;
    this.botUsername = null;
    this.offset = 0;
    this.pollAbort = null;
    this.pollTimer = null;
  }

  isRunning() {
    return this.running;
  }

  reloadAllowedChats(rawList) {
    this.allowedChatIds = parseAllowedChats(rawList);
  }

  async #tgCall(method, body = null, isForm = false) {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN no configurado.');
    const url = `${TELEGRAM_API}/bot${this.token}/${method}`;
    const opts = { method: 'POST' };
    if (body) {
      if (isForm) {
        opts.body = body;
      } else {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify(body);
      }
    }
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!json.ok) {
      throw new Error(`Telegram ${method} falló: ${json.description || res.status}`);
    }
    return json.result;
  }

  async #downloadTelegramFile(fileId) {
    const fileInfo = await this.#tgCall('getFile', { file_id: fileId });
    const fileUrl = `${TELEGRAM_API}/file/bot${this.token}/${fileInfo.file_path}`;
    const res = await fetch(fileUrl);
    if (!res.ok) {
      throw new Error(`No se pudo descargar archivo de Telegram (${res.status})`);
    }
    const arr = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arr),
      filePath: fileInfo.file_path || ''
    };
  }

  async sendMessage(chatId, text, extra = {}) {
    const safeText = String(text || '').slice(0, 4000);
    return this.#tgCall('sendMessage', {
      chat_id: chatId,
      text: safeText,
      ...extra
    });
  }

  async sendDocument(chatId, filePathOrBuffer, filename, caption = '') {
    const buf = Buffer.isBuffer(filePathOrBuffer)
      ? filePathOrBuffer
      : fs.readFileSync(filePathOrBuffer);
    const form = new FormData();
    form.append('chat_id', String(chatId));
    if (caption) form.append('caption', String(caption).slice(0, 1024));
    form.append(
      'document',
      new Blob([buf], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }),
      filename
    );
    return this.#tgCall('sendDocument', form, true);
  }

  async sendAudioReply(chatId, audioBuffer, filename = 'respuesta_copiloto.mp3') {
    const form = new FormData();
    form.append('chat_id', String(chatId));
    form.append('audio', new Blob([audioBuffer], { type: 'audio/mpeg' }), filename);
    form.append('title', 'Copiloto Avícola');
    return this.#tgCall('sendAudio', form, true);
  }

  #isChatAllowed(chatId) {
    if (this.allowedChatIds.size === 0) return true;
    return this.allowedChatIds.has(String(chatId));
  }

  async start() {
    if (!this.token) {
      this.running = false;
      this.botUsername = null;
      return { started: false, reason: 'missing_token' };
    }

    try {
      const me = await this.#tgCall('getMe');
      this.botUsername = me.username || null;
      this.running = true;
      this.#scheduleNextPoll(150);
      return { started: true, botUsername: this.botUsername };
    } catch (err) {
      this.running = false;
      return { started: false, reason: err.message };
    }
  }

  async stop() {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.pollAbort) {
      try {
        this.pollAbort.abort();
      } catch (_) {
        // ignora aborto limpio
      }
      this.pollAbort = null;
    }
  }

  async restart(newToken) {
    await this.stop();
    this.token = String(newToken || '').trim();
    this.offset = 0;
    return this.start();
  }

  #scheduleNextPoll(delayMs = 500) {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      this.#pollOnce().catch(() => {});
    }, delayMs);
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref();
  }

  async #pollOnce() {
    if (!this.running || !this.token) return;
    this.pollAbort = new AbortController();
    try {
      const url = `${TELEGRAM_API}/bot${this.token}/getUpdates`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offset: this.offset,
          timeout: 25,
          allowed_updates: ['message', 'callback_query']
        }),
        signal: this.pollAbort.signal
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const upd of data.result) {
          this.offset = Math.max(this.offset, Number(upd.update_id) + 1);
          await this.processIncomingUpdate(upd).catch(() => {});
        }
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        this.#scheduleNextPoll(3000);
        return;
      }
    } finally {
      this.pollAbort = null;
    }
    this.#scheduleNextPoll(200);
  }

  async #handleCommand(chatId, cmd, fromName) {
    const snap = this.store.getFullSnapshot();
    const c = snap.computed;

    if (cmd.startsWith('/start')) {
      const welcome = [
        `Avi · Granja La Alejandra (El Zulia) conectada para ${fromName}.`,
        `Tu Chat ID de Telegram es: ${chatId}`,
        '(Para mayor seguridad, regístralo en Ajustes -> Telegram Allowed Chat IDs).',
        '',
        'Comandos disponibles:',
        '/resumen - Utilidad consolidada, caja pico y proyección 52 semanas',
        '/lote1 - Estado vivo del Lote 1 (600 pollos)',
        '/bodega - Auditoría de bultos Solla JIT comprados vs faltantes',
        '/excel - Recibir libro Excel operativo vivo de la granja',
        '',
        'También puedes enviarme notas de voz, fotos de facturas/galpón o un archivo .xlsx editado.'
      ].join('\n');
      await this.sendMessage(chatId, welcome);
      return { handled: true, command: '/start' };
    }

    if (cmd.startsWith('/resumen')) {
      const sim52 = c.av2?.continuoResumen?.config
        ? this.store && require('../shared/causal-twin-engine').simulateContinuousHorizon(snap.state, {
            avesPorLote: c.av2.continuoResumen.config.avesPorLote,
            cadenciaDias: c.av2.continuoResumen.config.cadenciaDias,
            semanasHorizonte: 52
          })
        : null;
      const msg = [
        `RESUMEN VIVO GRANJA LA ALEJANDRA (v${snap.version})`,
        `- Lote 1 (600 aves): Utilidad canal = ${cop(c.av2.lotes[0].utilidadCanal)}`,
        `- Consolidado 3 Lotes (2.200 aves): Utilidad canal = ${cop(c.av2.consolidado3Lotes.utilidadCanal)}`,
        `- Capital trabajo pico Sem 7: ${cop(c.av2.tesoreriaResumen.capitalTrabajoPicoSem7)}`,
        `- Saldo final post 4 meses arriendo: ${cop(c.av2.tesoreriaResumen.saldoFinalPost4m)}`,
        sim52
          ? `- Proyección continua 52 sem (${sim52.parametrosEscenario.avesPorLote} c/${sim52.parametrosEscenario.cadenciaDias}d): Caja Año 1 = ${cop(sim52.horizonteRealDesdeInicio.saldoCajaNetoAlCierreHorizonteCop)} | Estacionario anual = ${cop(sim52.regimenEstacionarioAnual.utilidadNetaPostArriendoAnualCop)}`
          : null,
        `- Densidad térmica galpón: ${c.av2.capacidadTermica.densidadPicoKgM2.toFixed(2)} kg/m² (${c.av2.capacidadTermica.estadoTermico})`
      ]
        .filter(Boolean)
        .join('\n');
      await this.sendMessage(chatId, msg);
      return { handled: true, command: '/resumen' };
    }

    if (cmd.startsWith('/lote1')) {
      const bit = c.av2.bitacora;
      const l1 = c.av2.lotes[0];
      const msg = [
        'ESTADO EN VIVO LOTE 1 (600 POLLOS):',
        `- Días registrados: ${bit.diasRegistrados} / 49`,
        `- Bajas acumuladas reales: ${bit.bajasAcumReales} aves`,
        `- Pollos proyectados al beneficio: ${bit.avesFinEfectivas}`,
        `- Fecha meta sacrificio: ${bit.fechaSacrificio}`,
        `- Utilidad proyectada en canal (con $1.500 sacrificio): ${cop(l1.utilidadCanal)}`
      ].join('\n');
      await this.sendMessage(chatId, msg);
      return { handled: true, command: '/lote1' };
    }

    if (cmd.startsWith('/bodega')) {
      const bod = c.av2.auditoriaBodegaLote1;
      const msg = [
        'BODEGA ALIMENTO LOTE 1:',
        `- Comprado inicial (${bod.compradoInicial.totalBultos} bultos): Master ${bod.compradoInicial.masterpollito} | Nutrepollo ${bod.compradoInicial.nutrepollo} | Broiler ${bod.compradoInicial.broiler}`,
        `- Faltante para 6 semanas (${bod.faltantePpto.totalBultos} bultos): Master ${bod.faltantePpto.masterpollito} | Nutrepollo ${bod.faltantePpto.nutrepollo} | Broiler ${bod.faltantePpto.broiler}`,
        `- Presupuesto faltante: ${cop(bod.faltantePpto.costoAdicionalCop)}`
      ].join('\n');
      await this.sendMessage(chatId, msg);
      return { handled: true, command: '/bodega' };
    }

    if (cmd.startsWith('/rfcs')) {
      const rfcs = this.bridge.listRfcs();
      if (rfcs.length === 0) {
        await this.sendMessage(chatId, 'No hay tarjetas RFC registradas en Antigravity Bridge todavía.');
        return { handled: true, command: '/rfcs' };
      }
      for (const r of rfcs.slice(0, 5)) {
        const text = `${r.rfcCode} [${r.estado}]\n${r.titulo}\n${r.descripcion}`;
        const replyMarkup =
          r.estado === 'pendiente_aprobacion'
            ? {
                inline_keyboard: [
                  [
                    { text: `Aprobar ${r.rfcCode}`, callback_data: `approve_rfc:${r.rfcCode}` },
                    { text: 'Rechazar', callback_data: `reject_rfc:${r.rfcCode}` }
                  ]
                ]
              }
            : undefined;
        await this.sendMessage(chatId, text, replyMarkup ? { reply_markup: replyMarkup } : {});
      }
      return { handled: true, command: '/rfcs' };
    }

    if (cmd.startsWith('/excel')) {
      const compiled = await compileTwinToWorkbooks(this.store.getState());
      await this.sendDocument(
        chatId,
        compiled.files.av1Path,
        path.basename(compiled.files.av1Path),
        `AV-1 Plan Maestro Financiero (v${snap.version})`
      );
      await this.sendDocument(
        chatId,
        compiled.files.av2Path,
        path.basename(compiled.files.av2Path),
        `AV-2 Operación Granja Lotes 1 a 3 (v${snap.version})`
      );
      return { handled: true, command: '/excel' };
    }

    return { handled: false };
  }

  async #replyFromAgentTurn(chatId, turnResult, sendVoiceReply = false) {
    const createdRfcs = (turnResult.toolResults || [])
      .filter((t) => t.ok && t.toolName === 'propose_structural_rfc' && t.rfc)
      .map((t) => t.rfc);

    let extra = {};
    if (createdRfcs.length > 0) {
      const lastRfc = createdRfcs[createdRfcs.length - 1];
      extra = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: `Aprobar ${lastRfc.rfcCode} para Antigravity`, callback_data: `approve_rfc:${lastRfc.rfcCode}` },
              { text: 'Rechazar', callback_data: `reject_rfc:${lastRfc.rfcCode}` }
            ]
          ]
        }
      };
    }

    await this.sendMessage(chatId, turnResult.replyText, extra);

    if (sendVoiceReply && process.env.OPENAI_API_KEY) {
      try {
        const tts = await this.openaiGateway.synthesizeSpeechBuffer(turnResult.replyText);
        if (tts && tts.buffer && tts.buffer.length > 0) {
          await this.sendAudioReply(chatId, tts.buffer);
        }
      } catch (_) {
        // El texto ya fue enviado; no falla el turno si TTS tiene error temporal
      }
    }
  }

  async processIncomingUpdate(update) {
    if (!update) return { ignored: true };

    // 1. Aprobación o rechazo de RFC vía botones inline
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      if (chatId && !this.#isChatAllowed(chatId)) return { ignored: true, reason: 'unauthorized_chat' };

      const data = String(cq.data || '');
      const fromName = [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || cq.from?.username || 'Telegram User';
      const [action, rfcCode] = data.split(':');

      if (action === 'approve_rfc' && rfcCode) {
        const rfc = await this.bridge.approveRfc(rfcCode, { approvedBy: fromName, channel: 'telegram' });
        this.emitSse('rfc_updated', { action: 'approved', rfc });
        await this.#tgCall('answerCallbackQuery', {
          callback_query_id: cq.id,
          text: `${rfcCode} aprobado y enviado a Antigravity.`
        }).catch(() => {});
        if (chatId) {
          await this.sendMessage(
            chatId,
            `${rfc.rfcCode} APROBADO por ${fromName} y escrito en ANTIGRAVITY_INBOX.md para ejecución.`
          );
        }
        return { ok: true, action: 'approve_rfc', rfcCode };
      }

      if (action === 'reject_rfc' && rfcCode) {
        const rfc = await this.bridge.rejectRfc(rfcCode, {
          rejectedBy: fromName,
          reason: 'Rechazado desde Telegram'
        });
        this.emitSse('rfc_updated', { action: 'rejected', rfc });
        await this.#tgCall('answerCallbackQuery', {
          callback_query_id: cq.id,
          text: `${rfcCode} rechazado.`
        }).catch(() => {});
        if (chatId) {
          await this.sendMessage(chatId, `${rfc.rfcCode} rechazado por ${fromName}.`);
        }
        return { ok: true, action: 'reject_rfc', rfcCode };
      }

      return { ignored: true };
    }

    const msg = update.message;
    if (!msg || !msg.chat) return { ignored: true };
    const chatId = msg.chat.id;
    if (!this.#isChatAllowed(chatId)) {
      await this.sendMessage(chatId, 'Chat no autorizado en TELEGRAM_ALLOWED_CHAT_IDS.').catch(() => {});
      return { ignored: true, reason: 'unauthorized_chat' };
    }

    const fromName =
      [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') ||
      msg.from?.username ||
      `tg_${chatId}`;

    // 2. Comandos slash
    if (typeof msg.text === 'string' && msg.text.startsWith('/')) {
      const cmdRes = await this.#handleCommand(chatId, msg.text.trim(), fromName);
      if (cmdRes.handled) return cmdRes;
    }

    // 3. Documento .xlsx enviado por Telegram -> Hidratación inversa al Gemelo
    if (msg.document && /\.xlsx$/i.test(msg.document.file_name || '')) {
      const { buffer } = await this.#downloadTelegramFile(msg.document.file_id);
      const hydration = await hydrateTwinFromWorkbook(buffer, this.store.getState());
      for (const evt of hydration.generatedEvents) {
        await this.store.appendEventAndApply({
          ...evt,
          sourceChannel: 'telegram_excel',
          actor: fromName
        });
      }
      const latestSnap = this.store.getFullSnapshot();
      if (hydration.generatedEvents.length > 0) {
        this.emitSse('state_updated', {
          version: latestSnap.version,
          event: { type: 'EXCEL_HYDRATION', changesCount: hydration.changesCount },
          snapshot: latestSnap
        });
      }
      await this.sendMessage(
        chatId,
        [
          `Excel ${msg.document.file_name} (${hydration.workbookKind}) procesado:`,
          `- Cambios detectados: ${hydration.changesCount}`,
          `- Impacto Utilidad Lote 1: ${cop(hydration.financialImpact.deltaUtilidadLote1Cop)}`,
          `- Impacto Consolidado 3 Lotes: ${cop(hydration.financialImpact.deltaUtilidad3LotesCop)}`
        ].join('\n')
      );
      return { ok: true, kind: 'document_xlsx', changesCount: hydration.changesCount };
    }

    // 4. Nota de voz / audio -> STT -> Agente -> Texto + Nota de voz TTS
    if (msg.voice || msg.audio) {
      const fileObj = msg.voice || msg.audio;
      const { buffer, filePath } = await this.#downloadTelegramFile(fileObj.file_id);
      const ext = path.extname(filePath) || '.ogg';
      const stt = await this.openaiGateway.transcribeAudioBuffer(
        buffer,
        `voz${ext}`,
        fileObj.mime_type || 'audio/ogg'
      );
      const turn = await this.openaiGateway.runAgenticTurn({
        message: stt.text || 'Resume el estado actual del proyecto avícola.',
        sourceChannel: 'telegram_voice',
        actor: fromName,
        store: this.store,
        bridge: this.bridge,
        emitSse: this.emitSse
      });
      await this.#replyFromAgentTurn(chatId, turn, true);
      return { ok: true, kind: 'voice', transcription: stt.text };
    }

    // 5. Foto (facturas, bitácora manual, galpón) -> Visión Multimodal gpt-6.1-sol
    if (Array.isArray(msg.photo) && msg.photo.length > 0) {
      const largest = msg.photo[msg.photo.length - 1];
      const { buffer } = await this.#downloadTelegramFile(largest.file_id);
      const b64 = buffer.toString('base64');
      const turn = await this.openaiGateway.runAgenticTurn({
        message: msg.caption || 'Analiza esta imagen del proyecto avícola y registra los datos pertinentes.',
        imageBase64: b64,
        imageMimeType: 'image/jpeg',
        sourceChannel: 'telegram_photo',
        actor: fromName,
        store: this.store,
        bridge: this.bridge,
        emitSse: this.emitSse
      });
      await this.#replyFromAgentTurn(chatId, turn, false);
      return { ok: true, kind: 'photo' };
    }

    // 6. Texto conversacional libre
    if (typeof msg.text === 'string' && msg.text.trim()) {
      const turn = await this.openaiGateway.runAgenticTurn({
        message: msg.text.trim(),
        sourceChannel: 'telegram',
        actor: fromName,
        store: this.store,
        bridge: this.bridge,
        emitSse: this.emitSse
      });
      await this.#replyFromAgentTurn(chatId, turn, false);
      return { ok: true, kind: 'text' };
    }

    return { ignored: true };
  }
}

module.exports = {
  TelegramOmnichannelBot
};
