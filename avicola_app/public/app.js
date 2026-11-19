(function () {
  'use strict';

  const TwinEngine = window.CausalTwinEngine || window.TwinEngine;
  if (!TwinEngine) {
    console.error('CausalTwinEngine no cargado.');
    return;
  }

  // Estado central de la interfaz
  const appState = {
    officialSnapshot: null,
    officialState: TwinEngine.createDefaultTwinState(),
    officialComputed: null,
    whatIfOverrides: null,
    whatIfActive: false,
    rfcs: [],
    credentialsStatus: null,
    lastAssistantReply:
      'Avi lista en Granja La Alejandra (Vereda La Alejandra, El Zulia). Lote 1 de 600 aves en curso con Bodega JIT Solla, flujo continuo de 3 lotes + ciclos de 900 pollos y comparador Canal vs Desposte.',
    theme: localStorage.getItem('avicola_theme') || 'obsidian',
    workspaceMode: 'av2_only',
    layoutViewMode: localStorage.getItem('avicola_layout_mode') || 'paged',
    activePage: 'resumen_ejecutivo',
    focusedCard: null,
    focusedCardExpanded: false,
    currentUser: null,
    authProfiles: [],
    previewAsPartner: false,
    cashflowHorizon: 'continuo',
    heroCashMode: '3lotes',
    mixSelectedLote: 'lote-1',
    pendingImageBase64: null,
    pendingImageMime: 'image/jpeg',
    cmdSelectedIdx: 0,
    audioPlayback: null,
    aviPresence: {
      position: localStorage.getItem('avicola_avi_pos') || 'auto_follow',
      autoFollow: (localStorage.getItem('avicola_avi_pos') || 'auto_follow') === 'auto_follow',
      customXY: (() => {
        try {
          const raw = localStorage.getItem('avicola_avi_xy');
          return raw ? JSON.parse(raw) : null;
        } catch (_) {
          return null;
        }
      })(),
      drawerOpen: false,
      unreadCount: 0,
      whisperTimer: null,
      lastAutoSide: 'right'
    },
    voice: {
      connected: false,
      connecting: false,
      mode: 'idle', // idle | listening | thinking | speaking
      pc: null,
      dc: null,
      micStream: null,
      rawMicStream: null,
      remoteAudio: null,
      audioCtx: null,
      analyser: null,
      freqData: null,
      dspTimer: null,
      highpassNode: null,
      lowpassNode: null,
      gateGainNode: null,
      noiseFilterMode: localStorage.getItem('avicola_noise_filter') || 'galpon_estricto',
      autoSpeakExperts: localStorage.getItem('avicola_auto_speak_experts') !== 'false',
      assistantBuffer: '',
      baseInstructions: ''
    },
    wowSimulation: {
      activeSimId: 'sim_1_estirpes_thi',
      params: {
        sim_1_estirpes_thi: {
          estirpeSeleccionada: 'ROSS_308_AP',
          tempC: 29,
          humedadRelPct: 65,
          velocidadAireMs: 1.8,
          edadObjetivoDias: 42,
          loteAves: 800
        },
        sim_2_portafolio_b2b: {
          estirpe: 'ROSS_308_AP',
          volumenAves: 800,
          edadObjetivoDias: 42,
          colocacionRemanente48hPct: 90,
          clientesActivosActuales: 18
        },
        sim_3_nutricion_capex: {
          pdiPct: 90,
          finosPct: 9,
          granulometriaMaizUm: 850,
          balanceElectroliticoDebMeqKg: 235,
          loteAves: 800
        },
        sim_4_prefaena_frio: {
          horasAyunoTotal: 9.5,
          horaCaptura24h: 21,
          tempTransporteC: 27,
          tempCadenaFrioC: 2.5,
          loteAves: 800
        },
        sim_5_anual_toc: {
          avesPorLote: 900,
          cadenciaDias: 18,
          variacionPrecioAlimentoPct: 0,
          variacionPrecioCanalPct: 0
        }
      },
      lastResult: null,
      lastThiEfectivo: 76,
      lastDialogue: null,
      lastSpontaneous: null,
      lastBoard: null
    },
    growthTargetDay: 40,
    deferredPwaPrompt: null
  };

  appState.officialComputed = TwinEngine.computeFullTwin(appState.officialState);

  const $ = (id) => document.getElementById(id);

  function cop(val) {
    const n = Math.round(Number(val || 0));
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toLocaleString('es-CO')}`;
  }

  function copShort(val) {
    const n = Number(val || 0);
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1).replace('.0', '')}M`;
    if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`;
    return `${sign}$${Math.round(abs)}`;
  }

  function extractWeekTickLabel(wItem) {
    const etq = String((wItem && wItem.etiqueta) || '');
    const cobroMatch = etq.match(/COBRO\s+LOTE\s+\d+\s*\((\d{2}-[a-z]{3})/i);
    if (cobroMatch && cobroMatch[1]) return cobroMatch[1].toLowerCase();
    const paren = etq.match(/\(([^)]+)\)/);
    if (paren && paren[1]) {
      const inner = paren[1].trim();
      if (wItem && Number(wItem.semana) === 1 && /\s+a\s+/i.test(inner)) {
        return inner.split(/\s+a\s+/i)[0].trim().replace(/\s+/g, '-').toLowerCase();
      }
      const parts = inner.split(/\s+a\s+/i);
      const tail = parts[parts.length - 1].trim();
      const sameMonth = tail.match(/^(\d{2})-(\d{2})\s+([a-z]{3})$/i);
      if (sameMonth) return `${sameMonth[2]}-${sameMonth[3].toLowerCase()}`;
      return tail.replace(/\s+/g, '-').toLowerCase();
    }
    return `S${(wItem && wItem.semana) || ''}`;
  }

  function sanitizeSpeechForCop(text) {
    let out = String(text || '').trim();
    if (!out) return '';
    const wordsInt = (absInt) => {
      const n = Math.round(Math.abs(Number(absInt) || 0));
      if (!Number.isFinite(n) || n === 0) return '0';
      const mill = Math.floor(n / 1000000);
      const remM = n % 1000000;
      const miles = Math.floor(remM / 1000);
      const unid = remM % 1000;
      const parts = [];
      if (mill > 0) parts.push(mill === 1 ? '1 millón' : `${mill} millones`);
      if (miles > 0) parts.push(`${miles} mil`);
      if (unid > 0) parts.push(String(unid));
      return parts.join(' ');
    };
    out = out.replace(/([+-]?)\s*\$\s*(\d+(?:[.,]\d+)?)\s*[Mm]\b/g, (_m, sign, numStr) => {
      const prefix = sign === '-' ? 'menos ' : sign === '+' ? 'más ' : '';
      return `${prefix}${numStr} millones de pesos`;
    });
    out = out.replace(/([+-]?)\s*\$\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s*(?:pesos(?:\s+colombianos)?(?:\s+COP)?|COP))?/gi, (_m, sign, digits) => {
      const clean = Number(String(digits).replace(/[.,]/g, ''));
      const prefix = sign === '-' ? 'menos ' : sign === '+' ? 'más ' : '';
      const joiner = clean >= 1000000 && clean % 1000000 === 0 ? ' de ' : ' ';
      return `${prefix}${wordsInt(clean)}${joiner}pesos`;
    });
    return out
      .replace(/\b(?:pesos\s+){2,}(?:colombianos\s*)*/gi, 'pesos colombianos ')
      .replace(/\bCOP\b/g, 'pesos colombianos')
      .replace(/\bpesos\s+colombianos\s+pesos\b/gi, 'pesos colombianos')
      .replace(/\$/g, ' pesos ')
      .replace(/\/kg\b/gi, ' por kilo')
      .replace(/\/m[²2]/gi, ' por metro cuadrado')
      .replace(/\bd[oó]lares\b/gi, 'pesos colombianos')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDeltaPill(delta, suffix = '') {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1) return '';
    const cls = delta >= 0 ? 'positive' : 'negative';
    const prefix = delta >= 0 ? '+' : '';
    return `<span class="delta-pill ${cls}">${prefix}${cop(delta)}${suffix}</span>`;
  }

  function setActiveExpert(code) {
    document.querySelectorAll('#expert-council-badges .expert-chip').forEach((el) => {
      el.classList.toggle('active', el.dataset.expert === code);
    });
  }

  const seenTranscriptIds = new Set();

  function getAgentName() {
    return (
      (appState.officialState && appState.officialState.identidadAgente && appState.officialState.identidadAgente.nombre) ||
      (appState.officialComputed && appState.officialComputed.identidadAgente && appState.officialComputed.identidadAgente.nombre) ||
      'Avi'
    );
  }

  function updateAviUnreadBadge() {
    const badge = $('avi-unread-badge');
    if (!badge) return;
    const count = appState.aviPresence.unreadCount || 0;
    if (appState.aviPresence.drawerOpen || count <= 0) {
      badge.classList.add('hidden');
      badge.textContent = '0';
    } else {
      badge.classList.remove('hidden');
      badge.textContent = count > 99 ? '99+' : String(count);
    }
  }

  function showAviWhisper(text) {
    const el = $('avi-live-whisper');
    if (!el || appState.aviPresence.drawerOpen) return;
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    el.textContent = clean.length > 96 ? `${clean.slice(0, 93)}...` : clean;
    el.classList.remove('hidden');
    clearTimeout(appState.aviPresence.whisperTimer);
    appState.aviPresence.whisperTimer = setTimeout(() => {
      if ($('avi-live-whisper')) $('avi-live-whisper').classList.add('hidden');
    }, 5500);
  }

  function setConversationDrawerOpen(open) {
    const isOpen = Boolean(open);
    appState.aviPresence.drawerOpen = isOpen;
    const dock = $('copilot-dock');
    const transcript = $('dock-transcript');
    const toggleBtn = $('btn-nebula-chat-toggle');

    if (dock) {
      dock.classList.toggle('dock-collapsed', !isOpen);
    }
    if (transcript && isOpen) {
      transcript.classList.remove('hidden');
      transcript.scrollTop = transcript.scrollHeight;
    }
    if (isOpen) {
      appState.aviPresence.unreadCount = 0;
      if ($('avi-live-whisper')) $('avi-live-whisper').classList.add('hidden');
      clearTimeout(appState.aviPresence.whisperTimer);
    }
    updateAviUnreadBadge();
    if (toggleBtn) {
      const labelEl = $('avi-chat-toggle-label');
      const txt = isOpen ? 'Ocultar' : 'Charla';
      if (labelEl) {
        labelEl.textContent = txt;
      } else {
        const badgeEl = $('avi-unread-badge');
        if (!badgeEl) toggleBtn.textContent = txt;
      }
    }
  }

  function appendTranscript(role, text, opts = {}) {
    const box = $('dock-transcript');
    if (!box || !text) return;
    const entryId = opts.id || `cli-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (seenTranscriptIds.has(entryId)) return;
    seenTranscriptIds.add(entryId);

    const normRole = role === 'agent' ? 'assistant' : role;
    const labelMap = { user: 'Tú', assistant: getAgentName(), system: 'Sistema' };
    const line = document.createElement('div');
    line.className = 'msg-line';
    line.innerHTML = `<span class="msg-role ${normRole}">${escapeHtml(labelMap[normRole] || normRole)}</span><span>${escapeHtml(text)}</span>`;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;

    if (opts.persist !== false && (normRole === 'assistant' || normRole === 'user')) {
      if (!appState.aviPresence.drawerOpen) {
        appState.aviPresence.unreadCount += 1;
        updateAviUnreadBadge();
        showAviWhisper(`${normRole === 'assistant' ? `${getAgentName()}: ` : 'Tú: '}${text}`);
      }
    }

    if (opts.persist !== false) {
      fetch('/api/conversation/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entryId,
          role: normRole === 'assistant' ? 'agent' : normRole,
          channel: appState.voice.connected ? 'web_realtime' : 'web_ui',
          text
        })
      }).catch(() => {});
    }
  }

  // =========================================================================
  // Coreografía Visual (Spotlight + Scroll Suave + Presencia Móvil de Avi)
  // =========================================================================
  let spotlightTimer = null;
  let targetPulseTimer = null;
  let lastChoreographyKey = null;
  let lastChoreographyAt = 0;
  const recentExpertSpeakTimestamps = new Map();

  function markOrCheckRecentKey(key, windowMs = 15000) {
    const now = Date.now();
    const prev = recentExpertSpeakTimestamps.get(key);
    if (prev && now - prev < windowMs) return true;
    recentExpertSpeakTimestamps.set(key, now);
    if (recentExpertSpeakTimestamps.size > 40) {
      const oldestKey = recentExpertSpeakTimestamps.keys().next().value;
      recentExpertSpeakTimestamps.delete(oldestKey);
    }
    return false;
  }

  function appendWebCitationsCard(action) {
    const box = $('dock-transcript');
    if (!box || !action) return;
    const key = `web:${action.query}:${(action.citations || []).length}`;
    if (markOrCheckRecentKey(key, 8000)) return;
    const linksHtml = (action.citations || [])
      .map((c) => {
        const urlStr = String(c.url || '').trim();
        if (!/^https?:\/\//i.test(urlStr)) return '';
        const title = escapeHtml(c.title || urlStr);
        return `<a href="${escapeHtml(urlStr)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin:2px 6px 2px 0;padding:2px 7px;border-radius:999px;background:rgba(16,185,129,0.14);color:var(--emerald);font-size:0.72rem;text-decoration:none;">🌐 ${title}</a>`;
      })
      .filter(Boolean)
      .join('');
    if (!linksHtml) return;
    const div = document.createElement('div');
    div.className = 'msg-line';
    div.innerHTML = `<span class="msg-role system">Fuentes Web</span><div><div style="font-size:0.76rem;margin-bottom:4px;">Consulta: <strong>${escapeHtml(action.query || '')}</strong></div><div>${linksHtml}</div></div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function collectLiveUiContext() {
    const activeBtn = document.querySelector('.segmented-nav .seg-btn.active');
    const activeChip = document.querySelector('#expert-council-badges .expert-chip.active');
    const simState = appState.wowSimulation;
    const p1 = simState.params.sim_1_estirpes_thi;
    const p2 = simState.params.sim_2_portafolio_b2b;
    const p3 = simState.params.sim_3_nutricion_capex;
    const p4 = simState.params.sim_4_prefaena_frio;
    const p5 = simState.params.sim_5_anual_toc;
    const activeSim = getActiveSimulation();
    const computed = activeSim && activeSim.computed;
    const toc = computed && computed.av2 && computed.av2.restriccionTocActiva;
    const activeTab = (activeBtn && activeBtn.dataset && activeBtn.dataset.jump) || 'resumen_ejecutivo';

    const focusedCard = appState.focusedCard
      ? {
          id: appState.focusedCard.id,
          title: appState.focusedCard.title,
          metric: appState.focusedCard.metric,
          context: appState.focusedCard.context
        }
      : null;

    return {
      activeTab,
      activeModule: appState.workspaceMode || 'av2_only',
      layoutViewMode: appState.layoutViewMode || 'paged',
      focusedSection: activeTab,
      focusedCard,
      selectedSpecialist: (activeChip && activeChip.dataset && activeChip.dataset.expert) || 'EXP-1',
      activeSimulationId: simState.activeSimId,
      visibleAlertsCount: (computed && Array.isArray(computed.alertas) ? computed.alertas.length : 0),
      whatIfSliders: {
        edadObjetivoDias: $('rng-edad') ? Number($('rng-edad').value) : 42,
        precioCanalKg: $('rng-precio-canal') ? Number($('rng-precio-canal').value) : 12600,
        mortalidadPct: $('rng-mort') ? Number($('rng-mort').value) : 4.2,
        climaPct: $('rng-clima') ? Number($('rng-clima').value) : 0,
        areaGalponM2: $('rng-area') ? Number($('rng-area').value) : 120
      },
      wowMetrics: {
        thiEfectivo: Number(simState.lastThiEfectivo || 76),
        tempC: Number(p1.tempC),
        humedadRelPct: Number(p1.humedadRelPct),
        estirpeSeleccionada: p1.estirpeSeleccionada,
        colocacionRemanente48hPct: Number(p2.colocacionRemanente48hPct),
        finosPct: Number(p3.finosPct),
        pdiPct: Number(p3.pdiPct),
        horasAyunoTotal: Number(p4.horasAyunoTotal),
        tempCadenaFrioC: Number(p4.tempCadenaFrioC),
        cadenciaDias: Number(p5.cadenciaDias),
        avesPorLote: Number(p5.avesPorLote)
      },
      activeSummaryText: focusedCard
        ? `Usuario señalando tarjeta [${focusedCard.title}] (${focusedCard.metric}): ${focusedCard.context}`
        : (toc && toc.primaryConstraint
          ? `Pestaña ${activeTab} · Sim ${simState.activeSimId} · TOC: ${toc.primaryConstraint.titulo} · THI ${simState.lastThiEfectivo}`
          : `Pestaña ${activeTab} · Sim ${simState.activeSimId}`),
      visibleCards: Array.from(document.querySelectorAll('.interactive-focus-card')).map((el) => el.dataset.cardTitle).filter(Boolean)
    };
  }

  function applyVisionSpontaneousState(spont) {
    const banner = $('vision-spontaneous-banner');
    const copyEl = $('vision-spont-text');
    appState.wowSimulation.lastSpontaneous = spont || null;
    if (!banner || !copyEl) return;
    if (!spont || !spont.shouldInterveneSpontaneously) {
      banner.classList.add('hidden');
      return;
    }
    const sevBadge = spont.severity === 'alta' ? 'ALERTA ALTA' : 'SEÑAL ESTRATÉGICA';
    const reasonText = (spont.triggerReasons || [])[0] || spont.spontaneousHook || 'Visión detectó una variable crítica en el lienzo vivo.';
    copyEl.innerHTML = `<span class="pill ${spont.severity === 'alta' ? 'warn' : 'accent'}">${sevBadge}</span> <strong>Visión pide la palabra:</strong> ${escapeHtml(reasonText)}`;
    banner.classList.remove('hidden');
  }

  function renderAviVisionDialoguePreview(payload) {
    const box = $('avi-vision-dialogue-preview');
    if (!box) return;
    if (!payload || !Array.isArray(payload.turns) || !payload.turns.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const headerTag = payload.spontaneousIntervention
      ? '<span class="pill warn">Intervención Espontánea de Visión (Moderada por Avi)</span>'
      : '<span class="pill accent">Mesa Ejecutiva Avi ↔ Visión</span>';
    box.innerHTML = `
      <div class="dialogue-head">
        <div>${headerTag} · <strong>${escapeHtml(payload.topic || 'Estrategia en Tiempo Real')}</strong></div>
      </div>
      <div class="dialogue-turns-list">
        ${payload.turns
          .map((t) => {
            const isVision = t.speaker === 'Visión';
            return `
              <div class="avi-vision-turn ${isVision ? 'vision-turn' : 'avi-turn'}">
                <div class="turn-speaker">${escapeHtml(t.speaker)} · <small>${t.gender === 'M' ? 'Voz Masculina' : 'Voz Femenina'} (${escapeHtml(t.voice)})</small></div>
                <div class="turn-body">${escapeHtml(t.displayText)}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
    box.classList.remove('hidden');
  }

  async function playAviVisionDialogue(payload, forceSpeak = false) {
    if (!payload || !Array.isArray(payload.turns) || !payload.turns.length) return;
    const dedupeKey = `dialogue:${payload.topic || ''}:${payload.turns.map((t) => t.speechText || '').join('|').slice(0, 48)}`;
    if (markOrCheckRecentKey(dedupeKey, 8000)) return;

    appState.wowSimulation.lastDialogue = payload;
    setActiveExpert('EXP-VISION');
    renderAviVisionDialoguePreview(payload);
    if (payload.spontaneousTrigger) {
      applyVisionSpontaneousState(payload.spontaneousTrigger);
    }

    appState.lastAssistantReply = payload.speechText || payload.displayText || '';
    for (const turn of payload.turns) {
      const voiceBadge = turn.voice ? ` [${turn.gender === 'M' ? 'M' : 'F'}: ${turn.voice}]` : '';
      appendTranscript('assistant', `${turn.speaker}${voiceBadge}: ${turn.displayText}`, { persist: false });
    }

    const shouldSpeak = Boolean(forceSpeak || (payload.speakOutLoud !== false && appState.voice.autoSpeakExperts));
    if (shouldSpeak) {
      for (const turn of payload.turns) {
        await speakTextTts(turn.speechText || turn.displayText, {
          voice: turn.voice,
          speed: turn.speed,
          instructions: turn.instructions
        });
      }
    }
  }

  async function triggerAviVisionDialogue({ topic = '', spontaneous = false, speakOutLoud = true } = {}) {
    try {
      setConversationDrawerOpen(true);
      const uiContext = collectLiveUiContext();
      const res = await apiJson('/api/agent/avi-vision-dialogue', {
        method: 'POST',
        body: {
          topic: topic || uiContext.activeSummaryText,
          spontaneous,
          speakOutLoud,
          uiContext
        }
      });
      await playAviVisionDialogue({ ...res, speakOutLoud }, speakOutLoud);
    } catch (err) {
      appendTranscript('system', `Error en diálogo Avi ↔ Visión: ${err.message}`);
    }
  }

  async function runElephantGoldfishFromUi() {
    const box = $('elephant-goldfish-results');
    try {
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="board-loading">Ejecutando Junta Crítica Elephant–Goldfish (100% solo lectura)...</div>';
      }
      const uiContext = collectLiveUiContext();
      const res = await apiJson('/api/agent/elephant-goldfish', {
        method: 'POST',
        body: {
          consulta: `Auditoría integral del escenario en pantalla (${uiContext.activeSummaryText})`,
          uiContext
        }
      });
      appState.wowSimulation.lastBoard = res;
      if (box) {
        box.innerHTML = `
          <div class="board-head">
            <strong>🐘 Junta Crítica Elephant–Goldfish (Visión + Comité)</strong>
            <span class="pill accent">100% Solo Lectura</span>
          </div>
          <p class="board-verdict">${escapeHtml(res.dictamenFinal || '')}</p>
          <div class="board-columns">
            <div class="board-col">
              <h4>Tesis Elefante &amp; Cuello de Botella TOC</h4>
              <p>${escapeHtml((res.elephantThesis && (res.elephantThesis.resumen || res.elephantThesis.hipotesisPrincipal)) || res.tocConstraint?.titulo || '')}</p>
            </div>
            <div class="board-col">
              <h4>Crítica Goldfish &amp; Salvavidas Accionables</h4>
              <ul>${(res.salvavidasAccionables || res.goldfishCritiques || []).slice(0, 4).map((x) => `<li>${escapeHtml(typeof x === 'string' ? x : (x.accion || x.critica || JSON.stringify(x)))}</li>`).join('')}</ul>
            </div>
          </div>
        `;
      }
      setConversationDrawerOpen(true);
      await speakExpertIntervention({ ...res, especialista: 'gerencia_excelencia_operacional', speakOutLoud: appState.voice.autoSpeakExperts }, false);
    } catch (err) {
      if (box) box.innerHTML = `<div class="board-error">Error en Junta Crítica: ${escapeHtml(err.message)}</div>`;
      appendTranscript('system', `Error en Junta Crítica: ${err.message}`);
    }
  }

  async function speakExpertIntervention(payload, forceSpeak = false) {
    if (!payload || !payload.displayText) return;
    const dedupeKey = `exp:${payload.especialista || ''}:${String(payload.speechText || payload.displayText).slice(0, 72)}`;
    if (markOrCheckRecentKey(dedupeKey, 14000)) return;

    const genderLabel = payload.gender === 'M' ? 'Voz Masculina' : 'Voz Femenina';
    const voiceBadge = payload.voice ? ` [${genderLabel}: ${payload.voice}]` : '';
    const msgTitle = `${payload.title || payload.expertName || 'Especialista'}${voiceBadge}`;
    appState.lastAssistantReply = payload.speechText || payload.displayText;
    appendTranscript('assistant', `${msgTitle}\n${payload.displayText}`, { persist: false });
    if (payload.section || payload.focusSection) {
      focusSection(payload.section || payload.focusSection, payload.title || payload.expertName);
    }

    const shouldSpeak = Boolean(forceSpeak || (payload.speakOutLoud !== false && appState.voice.autoSpeakExperts));
    if (shouldSpeak && (payload.speechText || payload.displayText)) {
      await speakTextTts(payload.speechText || payload.displayText, {
        voice: payload.voice,
        speed: payload.voiceSpeed,
        instructions: payload.voiceInstructions
      }).catch(() => {});
    }
  }

  function getSafeHeaderBottom() {
    const hdr = document.querySelector('.cockpit-header');
    if (!hdr) return 82;
    const rect = hdr.getBoundingClientRect();
    return Math.max(76, Math.round(rect.bottom + 12));
  }

  function clampAviCoordinates(x, y, widgetEl) {
    const w = (widgetEl && widgetEl.offsetWidth) || 320;
    const h = (widgetEl && widgetEl.offsetHeight) || 74;
    const minY = getSafeHeaderBottom();
    const maxX = Math.max(12, window.innerWidth - w - 14);
    const maxY = Math.max(minY, window.innerHeight - h - 14);
    return {
      x: Math.round(Math.min(maxX, Math.max(12, Number(x) || 0))),
      y: Math.round(Math.min(maxY, Math.max(minY, Number(y) || 0)))
    };
  }

  function resolveNamedAviCoordinates(posName, widgetEl) {
    const w = (widgetEl && widgetEl.offsetWidth) || 320;
    const h = (widgetEl && widgetEl.offsetHeight) || 74;
    const padX = 20;
    const topY = getSafeHeaderBottom();
    const bottomY = Math.max(topY, window.innerHeight - h - 18);
    const rightX = Math.max(padX, window.innerWidth - w - padX);
    const centerY = Math.round(Math.max(topY, (window.innerHeight - h) / 2));

    switch (posName) {
      case 'top-left':
        return { x: padX, y: topY };
      case 'top-right':
        return { x: rightX, y: topY };
      case 'bottom-left':
        return { x: padX, y: bottomY };
      case 'center-right':
        return { x: rightX, y: centerY };
      case 'bottom-right':
      default:
        return { x: rightX, y: bottomY };
    }
  }

  function updateAviPosButtons() {
    const activeKey = appState.aviPresence.autoFollow ? 'auto_follow' : appState.aviPresence.position;
    document.querySelectorAll('[data-avi-pos]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.aviPos === activeKey);
    });
  }

  function moveAviPresence(targetPos, opts = {}) {
    const widget = $('avi-nebula-widget');
    if (!widget) return;

    if (targetPos && typeof targetPos === 'object' && Number.isFinite(Number(targetPos.x)) && Number.isFinite(Number(targetPos.y))) {
      const clamped = clampAviCoordinates(targetPos.x, targetPos.y, widget);
      widget.style.left = `${clamped.x}px`;
      widget.style.top = `${clamped.y}px`;
      if (!opts.fromAuto) {
        appState.aviPresence.autoFollow = false;
        appState.aviPresence.position = 'custom';
        appState.aviPresence.customXY = clamped;
        localStorage.setItem('avicola_avi_pos', 'custom');
        localStorage.setItem('avicola_avi_xy', JSON.stringify(clamped));
      }
      updateAviPosButtons();
      return;
    }

    const posKey = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center-right', 'auto_follow', 'custom'].includes(targetPos)
      ? targetPos
      : 'auto_follow';

    if (posKey === 'custom' && appState.aviPresence.customXY) {
      const clamped = clampAviCoordinates(appState.aviPresence.customXY.x, appState.aviPresence.customXY.y, widget);
      widget.style.left = `${clamped.x}px`;
      widget.style.top = `${clamped.y}px`;
      appState.aviPresence.autoFollow = false;
      appState.aviPresence.position = 'custom';
      updateAviPosButtons();
      return;
    }

    const isAuto = posKey === 'auto_follow';
    appState.aviPresence.autoFollow = isAuto;
    appState.aviPresence.position = isAuto ? 'auto_follow' : posKey;
    localStorage.setItem('avicola_avi_pos', appState.aviPresence.position);

    const coords = isAuto
      ? resolveNamedAviCoordinates(appState.aviPresence.lastAutoSide === 'left' ? 'bottom-left' : 'bottom-right', widget)
      : resolveNamedAviCoordinates(posKey, widget);
    const clamped = clampAviCoordinates(coords.x, coords.y, widget);
    widget.style.left = `${clamped.x}px`;
    widget.style.top = `${clamped.y}px`;
    updateAviPosButtons();
  }

  function moveAviAutoFollowForTarget(targetEl) {
    if (!appState.aviPresence.autoFollow) return;
    const widget = $('avi-nebula-widget');
    if (!widget || widget.classList.contains('dragging')) return;

    const activeInput = document.activeElement;
    if (activeInput && ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeInput.tagName)) {
      const rect = activeInput.getBoundingClientRect();
      const onRightHalf = rect.left + rect.width / 2 > window.innerWidth * 0.52;
      const inBottomZone = rect.bottom > window.innerHeight * 0.72;
      appState.aviPresence.lastAutoSide = onRightHalf ? 'left' : 'right';
      const named = inBottomZone
        ? (onRightHalf ? 'top-left' : 'bottom-left')
        : (onRightHalf ? 'bottom-left' : 'bottom-right');
      const coords = resolveNamedAviCoordinates(named, widget);
      moveAviPresence(coords, { fromAuto: true });
      return;
    }

    if (targetEl && typeof targetEl.getBoundingClientRect === 'function') {
      const rect = targetEl.getBoundingClientRect();
      const targetRight = rect.left + rect.width / 2 > window.innerWidth * 0.58;
      const named = targetRight ? 'bottom-left' : 'bottom-right';
      appState.aviPresence.lastAutoSide = targetRight ? 'left' : 'right';
      moveAviPresence(resolveNamedAviCoordinates(named, widget), { fromAuto: true });
    }
  }

  function handleLocalAviPresenceIntent(text) {
    const raw = String(text || '').trim();
    if (!raw) return false;
    if (/(abre|despliega|muestra|ver|ense[ñn]a).{0,24}(conversaci[oó]n|chat|hilo|historial)/i.test(raw)) {
      setConversationDrawerOpen(true);
      return true;
    }
    if (/(oculta|cierra|esconde|quita|minimiza|plega|pliega).{0,24}(conversaci[oó]n|chat|hilo|historial|caja|panel)/i.test(raw)) {
      setConversationDrawerOpen(false);
      return true;
    }
    const wantsRelocate = /(mu[eé]vete|ponte|ub[ií]cate|despl[aá]zate|baja|b[aá]jate|sube|s[uú]bete|m[oó]vete|c[aá]mbiate|qu[ií]tate|ap[aá]rtate|despeja|estorba|tapando|esquina|rinc[oó]n|lado)/i.test(raw);
    if (wantsRelocate) {
      if (/(sola|aut[oó]nom|auto|s[ií]gueme|libre)/i.test(raw)) {
        moveAviPresence('auto_follow');
        return true;
      }
      const widget = $('avi-nebula-widget');
      const wRect = widget ? widget.getBoundingClientRect() : null;
      const currentlyTop = wRect ? wRect.top < window.innerHeight * 0.45 : false;
      const currentlyRight = wRect ? wRect.left > window.innerWidth * 0.45 : true;

      if (/arriba|superior/i.test(raw) && /izquierd/i.test(raw)) {
        appState.aviPresence.lastAutoSide = 'left';
        moveAviPresence('top-left');
        return true;
      }
      if (/arriba|superior|sube|s[uú]bete/i.test(raw)) {
        appState.aviPresence.lastAutoSide = 'right';
        moveAviPresence('top-right');
        return true;
      }
      if (/abajo|baja|b[aá]jate|inferior/i.test(raw)) {
        const target = /izquierd/i.test(raw)
          ? 'bottom-left'
          : (/derech/i.test(raw) ? 'bottom-right' : (currentlyRight ? 'bottom-right' : 'bottom-left'));
        appState.aviPresence.lastAutoSide = target.includes('left') ? 'left' : 'right';
        moveAviPresence(target);
        return true;
      }
      if (/izquierd/i.test(raw)) {
        appState.aviPresence.lastAutoSide = 'left';
        moveAviPresence(currentlyTop ? 'top-left' : 'bottom-left');
        return true;
      }
      if (/derech/i.test(raw)) {
        appState.aviPresence.lastAutoSide = 'right';
        moveAviPresence('bottom-right');
        return true;
      }
      if (/centro/i.test(raw)) {
        moveAviPresence('center-right');
        return true;
      }
      if (/esquina|rinc[oó]n/i.test(raw)) {
        const target = currentlyRight && !currentlyTop ? 'bottom-left' : 'bottom-right';
        appState.aviPresence.lastAutoSide = target.includes('left') ? 'left' : 'right';
        moveAviPresence(target);
        return true;
      }
      const fallback = currentlyTop
        ? (currentlyRight ? 'bottom-right' : 'bottom-left')
        : (currentlyRight ? 'bottom-left' : 'bottom-right');
      appState.aviPresence.lastAutoSide = fallback.includes('left') ? 'left' : 'right';
      moveAviPresence(fallback);
      return true;
    }
    return false;
  }

  function isPartnerScope() {
    return Boolean((appState.currentUser && appState.currentUser.role === 'farm_partner') || appState.previewAsPartner);
  }

  function setWorkspaceViewMode(mode) {
    const isPartner = isPartnerScope();
    const requested = ['av2_only', 'all', 'av1_only'].includes(mode) ? mode : 'av2_only';
    const valid = isPartner ? 'av2_only' : requested;
    appState.workspaceMode = valid;
    if (!isPartner) {
      localStorage.setItem('avicola_owner_view', valid);
    }

    if ($('btn-owner-mode-real')) $('btn-owner-mode-real').classList.toggle('active', valid === 'av2_only');
    if ($('btn-owner-mode-all')) $('btn-owner-mode-all').classList.toggle('active', valid === 'all');

    const visibleMap = {
      av2_only: new Set(['resumen_ejecutivo', 'simulador_whatif', 'operacion_av2', 'bitacora_pesajes', 'bodega_termica', 'puente_antigravity']),
      av1_only: new Set(['resumen_ejecutivo', 'simulador_whatif', 'plan_av1', 'puente_antigravity']),
      all: new Set(['resumen_ejecutivo', 'simulador_whatif', 'operacion_av2', 'plan_av1', 'bitacora_pesajes', 'bodega_termica', 'puente_antigravity'])
    };
    const allowed = visibleMap[valid];

    document.querySelectorAll('[data-section]').forEach((sec) => {
      sec.classList.toggle('hidden', !allowed.has(sec.dataset.section));
    });
    document.querySelectorAll('.segmented-nav [data-jump]').forEach((btn) => {
      btn.classList.toggle('hidden', !allowed.has(btn.dataset.jump));
    });
    if (!allowed.has(appState.activePage)) {
      appState.activePage = 'resumen_ejecutivo';
    }
    applyLayoutViewMode();
  }

  function applyLayoutViewMode(modeOverride = null) {
    if (modeOverride === 'paged' || modeOverride === 'scroll') {
      appState.layoutViewMode = modeOverride;
      localStorage.setItem('avicola_layout_mode', modeOverride);
    }
    const isPaged = (appState.layoutViewMode || 'paged') === 'paged';
    if ($('btn-layout-paged')) $('btn-layout-paged').classList.toggle('active', isPaged);
    if ($('btn-layout-scroll')) $('btn-layout-scroll').classList.toggle('active', !isPaged);

    const visibleBtns = Array.from(document.querySelectorAll('.segmented-nav [data-jump]')).filter(
      (btn) => !btn.classList.contains('hidden')
    );
    const pageOrder = visibleBtns.map((btn) => ({ key: btn.dataset.jump, label: btn.textContent.trim() }));
    if (!pageOrder.some((p) => p.key === appState.activePage)) {
      appState.activePage = pageOrder[0]?.key || 'resumen_ejecutivo';
    }

    document.querySelectorAll('[data-section]').forEach((sec) => {
      const key = sec.dataset.section;
      const shouldHidePage = isPaged && !sec.classList.contains('hidden') && key !== appState.activePage;
      sec.classList.toggle('is-page-inactive', shouldHidePage);

      let stepper = sec.querySelector('.page-stepper-bar');
      if (isPaged && !sec.classList.contains('hidden') && !shouldHidePage) {
        const idx = pageOrder.findIndex((p) => p.key === key);
        const prev = idx > 0 ? pageOrder[idx - 1] : null;
        const next = idx >= 0 && idx < pageOrder.length - 1 ? pageOrder[idx + 1] : null;
        if (!stepper) {
          stepper = document.createElement('div');
          stepper.className = 'page-stepper-bar';
          sec.appendChild(stepper);
        }
        stepper.innerHTML = `
          <div>${prev ? `<button type="button" class="btn-xs" data-step-jump="${escapeHtml(prev.key)}">← ${escapeHtml(prev.label)}</button>` : '<span class="muted">Inicio del tablero</span>'}</div>
          <span class="muted num">Página ${Math.max(1, idx + 1)} de ${pageOrder.length} · <button type="button" class="inline-jump-link" data-switch-scroll="1">Ver todo en cascada</button></span>
          <div>${next ? `<button type="button" class="btn-xs btn-primary" data-step-jump="${escapeHtml(next.key)}">${escapeHtml(next.label)} →</button>` : '<span class="muted">Última página</span>'}</div>
        `;
        stepper.querySelectorAll('[data-step-jump]').forEach((b) => {
          b.addEventListener('click', () => focusSection(b.dataset.stepJump));
        });
        const swBtn = stepper.querySelector('[data-switch-scroll]');
        if (swBtn) swBtn.addEventListener('click', () => applyLayoutViewMode('scroll'));
      } else if (stepper) {
        stepper.remove();
      }
    });

    document.querySelectorAll('.segmented-nav .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.jump === appState.activePage);
    });
  }

  function applyRoleScopedUi() {
    const user = appState.currentUser;
    const partnerView = isPartnerScope();
    document.body.classList.toggle('role-farm-partner', partnerView);
    if ($('btn-user-menu')) {
      const shortName = user ? String(user.displayName || user.username).split(' ')[0] : 'Perfil';
      $('btn-user-menu').textContent = appState.previewAsPartner ? `Vista Dueño (${shortName})` : `👤 ${shortName}`;
    }
    if ($('btn-owner-preview-partner')) {
      $('btn-owner-preview-partner').textContent = appState.previewAsPartner ? '↩ Volver a Admin App' : 'Vista Dueño Avícola (David)';
    }
    if ($('user-session-summary')) {
      $('user-session-summary').innerHTML = user
        ? `<div class="kpi-card"><div class="kpi-label">Sesión Activa</div><div class="kpi-value" style="font-size:1.05rem;">${escapeHtml(user.displayName)} (${escapeHtml(user.username)})</div><div class="kpi-sub">Rol: <strong>${user.role === 'owner' ? 'Administrador de App y Desarrollo' : 'Dueño · Granja La Alejandra (Negocio y Operación Completa)'}</strong>${appState.previewAsPartner ? ' · Previsualizando vista Dueño Avícola (David)' : ''}</div></div>`
        : '<p class="muted">Sin sesión activa.</p>';
    }
    const targetMode = partnerView ? 'av2_only' : (localStorage.getItem('avicola_owner_view') || 'av2_only');
    setWorkspaceViewMode(targetMode);
    if (appState.officialComputed) renderWowSimulationsSuite(getActiveSimulation());
  }

  function renderCommercialOpportunityResult(ev) {
    const box = $('commercial-opportunity-result');
    if (!box || !ev) return;
    if (ev.tipo === 'venta_pechugas') {
      const d = ev.desgloseRestoPresas || {};
      const cls = ev.extraGanancia50PollosVsCanalCop >= 0 ? 'ok' : 'warn';
      const dia1Neg = (ev.flujoCajaDia1SoloPechugasCop || 0) < 0;
      box.innerHTML = `
        <div class="opp-verdict">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
            <strong>Desposte de ${ev.cantidadPechugas} Pechugas a ${cop(ev.precioPorPechugaCop)} c/u (${ev.pollosDespostados} pollos beneficiados)</strong>
            <span class="pill ${cls}">${ev.extraGanancia50PollosVsCanalCop >= 0 ? `+${cop(ev.extraGanancia50PollosVsCanalCop)} extra con todo colocado` : `${cop(ev.extraGanancia50PollosVsCanalCop)} vs canal`}</span>
          </div>
          <p style="margin:0 0 8px;">${escapeHtml(ev.recomendacion)}</p>
          <div class="opp-metrics-grid">
            <div class="kpi-card"><div class="kpi-label">Solo ${ev.cantidadPechugas} Pechugas (Día 1)</div><div class="kpi-value">${cop(ev.ingresoPechugasCop)}</div><div class="kpi-sub">~${ev.pesoPechugaAveKg.toFixed(2)} kg/ave · ${cop(ev.precioImplicitoPechugaKgCop)}/kg</div></div>
            <div class="kpi-card"><div class="kpi-label">Saldo Presas Restante (${(ev.restoPresasPorColocarKg || 0).toFixed(1)} kg)</div><div class="kpi-value">${cop(ev.ingresoRestoPresasCop)}</div><div class="kpi-sub">Pernil ${cop(d.ingresoPernilMusloCop)} · Alas ${cop(d.ingresoAlasCop)} · Menud/Esp ${cop((d.ingresoMenudenciasCop || 0) + (d.ingresoEspinazoCop || 0))}</div></div>
            <div class="kpi-card"><div class="kpi-label">Déficit Caja Día 1 (Solo Pechugas)</div><div class="kpi-value" style="color:${dia1Neg ? 'var(--rose)' : 'var(--emerald)'};">${cop(ev.flujoCajaDia1SoloPechugasCop)}</div><div class="kpi-sub">${ev.deficitCajaInicialSoloPechugasCop > 0 ? `Faltan ${cop(ev.ingresoBreakevenRestoCop)} por colocar en frío` : 'Cubre costo del lote en Día 1'}</div></div>
            <div class="kpi-card"><div class="kpi-label">Utilidad Neta Real (${ev.pollosDespostados} aves)</div><div class="kpi-value">${cop(ev.utilidadNeta50PollosDesposteCop)}</div><div class="kpi-sub">vs ${cop(ev.utilidad50PollosCanalEnteroCop)} canal entero · Lote 1: ${cop(ev.proyeccionLote1UtilidadDesposteCop)}</div></div>
          </div>
        </div>
      `;
      return;
    }

    const cls = ev.diferenciaVsEsperar42dCop >= 0 ? 'ok' : 'warn';
    box.innerHTML = `
      <div class="opp-verdict">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
          <strong>Venta Adelantada ${ev.cantidadAves} Pollos (${ev.pesoVivoActualKg.toFixed(2)} kg vivo ≈ ${ev.pesoCanalEstimadoAveKg.toFixed(2)} kg canal a ${cop(ev.precioOfertaKgCop)}/kg)</strong>
          <span class="pill ${cls}">${ev.diferenciaVsEsperar42dCop >= 0 ? `+${cop(ev.diferenciaVsEsperar42dCop)} vs Día 42` : `${cop(ev.diferenciaVsEsperar42dCop)} vs esperar Día 42`}</span>
        </div>
        <p style="margin:0 0 8px;">${escapeHtml(ev.recomendacion)}</p>
        <div class="opp-metrics-grid">
          <div class="kpi-card"><div class="kpi-label">Ingreso Oferta Hoy (${ev.kgCanalOfertaTotal.toFixed(1)} kg)</div><div class="kpi-value">${cop(ev.ingresoOfertaTotalCop)}</div><div class="kpi-sub">Costo etapa ~Dia ${ev.diaEquivalenteRoss}: ${cop(ev.costoAcumuladoEstimadoCop)}</div></div>
          <div class="kpi-card"><div class="kpi-label">Utilidad Neta Hoy</div><div class="kpi-value">${cop(ev.utilidadHoyCop)}</div><div class="kpi-sub">Incluye $1.500/ave sacrificio</div></div>
          <div class="kpi-card"><div class="kpi-label">Si Esperas a Día 42 (${ev.cantidadAves} aves)</div><div class="kpi-value">${cop(ev.utilidadSiEsperaMeta42dCop)}</div><div class="kpi-sub">Base meta Ross 42d</div></div>
          <div class="kpi-card"><div class="kpi-label">Precio Mínimo Empate Hoy</div><div class="kpi-value">${cop(ev.precioMinimoKgParaIgualar42dCop)}/kg</div><div class="kpi-sub">${cop(ev.precioMinimoAveParaIgualar42dCop)} por pollo</div></div>
        </div>
      </div>
    `;
  }

  function focusSection(sectionKey, highlightText = null) {
    if (isPartnerScope() && sectionKey === 'plan_av1') {
      sectionKey = 'operacion_av2';
    }
    const target = document.querySelector(`[data-section="${sectionKey}"]`);
    if (!target) return;
    if (target.classList.contains('hidden') && !isPartnerScope()) {
      setWorkspaceViewMode('all');
    }
    appState.activePage = sectionKey;
    applyLayoutViewMode();
    document.querySelectorAll('.canvas-section.spotlight-active').forEach((el) => {
      el.classList.remove('spotlight-active');
    });
    document.querySelectorAll('.segmented-nav .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.jump === sectionKey);
    });
    target.classList.add('spotlight-active');
    if ((appState.layoutViewMode || 'paged') === 'paged') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const expertMap = {
      resumen_ejecutivo: 'EXP-1',
      simulador_whatif: 'EXP-3',
      operacion_av2: 'BE-2',
      plan_av1: 'BE-2',
      bitacora_pesajes: 'EXP-4',
      bodega_termica: 'EXP-4',
      puente_antigravity: 'BE-2'
    };
    setActiveExpert(expertMap[sectionKey] || 'EXP-3');
    if (highlightText) {
      appendTranscript('system', `Foco visual en "${sectionKey}" (${highlightText}).`, { persist: false });
    }
    moveAviAutoFollowForTarget(target);
    clearTimeout(spotlightTimer);
    spotlightTimer = setTimeout(() => {
      target.classList.remove('spotlight-active');
    }, 4500);
  }

  function applyUiChoreography(action) {
    if (!action || typeof action !== 'object') return;
    const sig = JSON.stringify([action.action, action.section, action.highlightCard, action.highlightTarget, action.mode, action.position, action.transcriptOpen]);
    const now = Date.now();
    if (sig === lastChoreographyKey && now - lastChoreographyAt < 1200) {
      return;
    }
    lastChoreographyKey = sig;
    lastChoreographyAt = now;

    if (action.action === 'open_credentials_modal') {
      openCredentialsModal();
      return;
    }
    if (action.action === 'web_research_citations') {
      appendWebCitationsCard(action);
      return;
    }
    if (action.action === 'speak_expert_voice') {
      speakExpertIntervention(action, false).catch(() => {});
      return;
    }
    if (action.action === 'avi_vision_dialogue') {
      playAviVisionDialogue(action, Boolean(action.speakOutLoud)).catch(() => {});
      return;
    }
    if (action.action === 'set_workspace_mode' && action.mode) {
      setWorkspaceViewMode(action.mode);
      return;
    }
    if (action.action === 'move_avi_presence') {
      if (action.position) moveAviPresence(action.position);
      if (typeof action.transcriptOpen === 'boolean') setConversationDrawerOpen(action.transcriptOpen);
      return;
    }
    if (action.commercialEvaluation) {
      renderCommercialOpportunityResult(action.commercialEvaluation);
    }
    if (action.section) {
      focusSection(action.section, action.highlightCard || null);
    }
    if (action.action === 'update_what_if_slider' && action.overrides) {
      applySlidersFromOverrides(action.overrides);
    }
    const targetId = action.highlightTarget || (action.action === 'open_agent_identity' ? 'btn-agent-identity' : null);
    if (targetId && $(targetId)) {
      document.querySelectorAll('.download-spotlight-pulse').forEach((el) => el.classList.remove('download-spotlight-pulse'));
      const targetEl = $(targetId);
      targetEl.classList.add('download-spotlight-pulse');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      moveAviAutoFollowForTarget(targetEl);
      clearTimeout(targetPulseTimer);
      targetPulseTimer = setTimeout(() => {
        targetEl.classList.remove('download-spotlight-pulse');
      }, 6500);
    }
    if (action.triggerDownload && action.downloadUrl) {
      const fireDownload = (url) => {
        if (url.includes('/minuta/')) {
          window.open(url, '_blank', 'noopener');
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      };
      fireDownload(action.downloadUrl);
      if (action.secondaryDownloadUrl) {
        setTimeout(() => fireDownload(action.secondaryDownloadUrl), 450);
      }
    }
  }

  function getActiveSimulation() {
    if (!appState.whatIfActive || !appState.whatIfOverrides) {
      return {
        state: appState.officialState,
        computed: appState.officialComputed,
        comparativaEdades: TwinEngine.simulateWhatIf(appState.officialState, {}).comparativaEdades
      };
    }
    return TwinEngine.simulateWhatIf(appState.officialState, appState.whatIfOverrides);
  }

  // =========================================================================
  // Renderizadores de las 7 Secciones del Lienzo Vivo
  // =========================================================================
  function renderAmbientPulse(computed) {
    const bar = $('ambient-pulse-bar');
    if (!bar) return;
    const bod = computed.av2.auditoriaBodegaLote1;
    const alertas = computed.alertas || [];
    const sim45 = TwinEngine.simulateWhatIf(appState.officialState, { edadGlobal: 45 });
    const diff45 =
      sim45.computed.av1.comercial800.utilidadCanal - computed.av1.comercial800.utilidadCanal;

    const chips = [];
    const gov = (computed.av2 && computed.av2.gobiernoEjecutivo) || {};
    const estHoy = gov.estadoCampoHoy || {};
    if (estHoy.tieneCegueraOperativa) {
      chips.push({
        cls: 'alta',
        label: `📋 Sin reporte en galpón (${estHoy.diasSinReporte}/${estHoy.diasTranscurridos}d) → Registrar Día ${estHoy.diaCicloL1}`,
        action: 'open_bitacora'
      });
    }
    const trans = computed.av2.transporte || { viajes: [], viajesEnCurso: 0 };
    if (trans.viajesEnCurso > 0) {
      const openTrip = (trans.viajes || []).find((v) => v.estado === 'en_curso');
      const odoTxt = openTrip && openTrip.odometroInicial !== null ? `Odómetro ${openTrip.odometroInicial}` : 'Odómetro abierto';
      chips.push({
        cls: 'alta',
        label: `🚗 Viaje en curso (${odoTxt}) → Registrar regreso / combustible`,
        action: 'close_trip'
      });
    }
    const diaCicloHoy = estHoy.diaCicloL1 || 1;
    const jitPend = (bod.fisicaJit && bod.fisicaJit.porComprarJit) || { nutrepollo: 16, broiler: 48 };
    if (jitPend.nutrepollo > 0 && diaCicloHoy >= 4) {
      chips.push({
        cls: diaCicloHoy >= 6 ? 'alta' : '',
        label: diaCicloHoy >= 6
          ? `⚡ Pedir Nutrepollo Cr SP JIT (${jitPend.nutrepollo} bultos Sem 2–3) → Bodega`
          : `🌾 Próx. JIT Día 8 (20-nov): Nutrepollo Cr SP (${jitPend.nutrepollo} bultos Sem 2–3) → Ver`,
        action: 'buy_nutre'
      });
    }
    if (jitPend.broiler > 0 && diaCicloHoy >= 18) {
      chips.push({
        cls: diaCicloHoy >= 20 ? 'alta' : '',
        label: `📦 Plan JIT Engorde: Broiler I Dorado (${jitPend.broiler} bultos Sem 4–6) → Bodega`,
        action: 'buy_broiler'
      });
    }
    if (diff45 > 10000) {
      chips.push({
        cls: 'oportunidad',
        label: `📈 Opción 45d (2,72 kg): +${cop(diff45)}/lote (exige entresaca El Zulia) → Simular`,
        action: 'sim_45d'
      });
    }
    const picoRefTop = (gov.tesoreriaViva && gov.tesoreriaViva.picoReferenciaCorta) || '23-dic (Víspera 1.ª cosecha · D41 L1)';
    chips.push({
      cls: '',
      label: `💰 Tope caja ${picoRefTop}: ${cop(computed.av2.tesoreriaResumen.capitalTrabajoPicoSem7)} → Ver Flujo`,
      action: 'focus_caja'
    });
    for (const a of alertas.slice(0, 1)) {
      if (!a.codigo.includes('DEFICIT')) {
        chips.push({ cls: '', label: `💡 ${a.titulo}`, action: 'focus_whatif' });
      }
    }

    bar.innerHTML =
      '<span class="ambient-label">Prioridades hoy:</span>' +
      chips
        .map(
          (c, i) =>
            `<button type="button" class="pulse-chip ${c.cls}" data-pulse-idx="${i}" data-pulse-act="${c.action}">${escapeHtml(c.label)}</button>`
        )
        .join('');

    bar.querySelectorAll('[data-pulse-act]').forEach((btn) => {
      btn.addEventListener('click', () => handleAmbientAction(btn.dataset.pulseAct));
    });
  }

  async function handleAmbientAction(act) {
    if (act === 'open_bitacora') {
      focusSection('bitacora_pesajes', 'Reportar bitácora hoy');
      if ($('inp-obs')) setTimeout(() => $('inp-obs').focus(), 250);
    } else if (act === 'close_trip') {
      const trans = (appState.officialComputed && appState.officialComputed.av2 && appState.officialComputed.av2.transporte) || { viajes: [] };
      const openTrip = (trans.viajes || []).find((v) => v.estado === 'en_curso');
      if ($('inp-trip-action')) $('inp-trip-action').value = 'close';
      if (openTrip && openTrip.odometroInicial !== null && $('inp-trip-odo-ini')) {
        $('inp-trip-odo-ini').value = openTrip.odometroInicial;
      }
      focusSection('bodega_termica', 'Cerrar viaje en curso');
      if ($('inp-trip-odo-fin')) setTimeout(() => $('inp-trip-odo-fin').focus(), 250);
    } else if (act === 'buy_nutre') {
      focusSection('bodega_termica', 'Revisar pedido JIT Nutrepollo');
      if ($('btn-buy-nutre5')) $('btn-buy-nutre5').classList.add('download-spotlight-pulse');
    } else if (act === 'buy_broiler') {
      focusSection('bodega_termica', 'Revisar pedido JIT Broiler');
      if ($('btn-buy-broiler8')) $('btn-buy-broiler8').classList.add('download-spotlight-pulse');
    } else if (act === 'sim_45d') {
      applySlidersFromOverrides({ edadObjetivoDias: 45 });
      focusSection('simulador_whatif', 'Simulación 45d (2,72 kg)');
    } else if (act === 'focus_caja') {
      focusSection('operacion_av2', 'Tope caja 23-dic (Víspera cosecha L1)');
    } else {
      focusSection('simulador_whatif');
    }
  }

  function getCurrentCycleDay(state) {
    const fStr = String((state && state.lotes && state.lotes[0] && state.lotes[0].fechaIngreso) || '2026-11-13');
    const fy = Number(fStr.slice(0, 4)) || 2026;
    const fm = Number(fStr.slice(5, 7)) || 11;
    const fd = Number(fStr.slice(8, 10)) || 13;
    const msIngreso = Date.UTC(fy, fm - 1, fd, 5, 0, 0);
    return Math.max(1, Math.min(49, Math.floor((Date.now() - msIngreso) / 86400000) + 1));
  }

  function formatBultosHuman(n) {
    const val = Math.max(0, Number(n || 0));
    const rounded = Math.round(val);
    if (Math.abs(val - rounded) < 0.15) {
      return `~${rounded} ${rounded === 1 ? 'bulto' : 'bultos'}`;
    }
    return `~${val.toFixed(1).replace('.', ',')} bultos`;
  }

  let cardFocusSyncTimer = null;
  let lastVoiceAutoAckAt = 0;

  function buildLocalCardFocusInsight(cardId, activeComputed, activeState) {
    const c = activeComputed || getActiveSimulation().computed;
    const s = activeState || getActiveSimulation().state;
    const av2 = c.av2 || {};
    const lotes = av2.lotes || [];
    const l1 = lotes[0] || {};
    const cons3 = av2.consolidado3Lotes || {};
    const gov = av2.gobiernoEjecutivo || {};
    const est = gov.estadoCampoHoy || {};
    const tv = gov.tesoreriaViva || {};
    const ac = gov.escenarioAcido || {};
    const ry = gov.riesgosYDecisiones || {};
    const kpiInd = av2.kpiIndustriales || {};
    const pr = kpiInd.prorrateoKgCanal3Lotes || l1.prorrateoKgCanal || {};

    switch (cardId) {
      case 'truth-disciplina-galpon':
        return {
          question: `Estás mirando **Disciplina en Galpón Hoy** (${est.diasReportadosEnVentana ?? 0}/${est.diasTranscurridos ?? 4} días reportados · ${est.avesVivasReportadasHoy ?? 603} vivas reales). ¿Quieres registrar la ronda de hoy o revisar el detalle de aves recibidas vs compradas?`,
          detail: `Lote 1 compró 600 pollitos nominales ($4.500 c/u), pero en cajas ingresaron <strong>${est.avesRecibidasReales ?? 603} aves vivas reales</strong>. Mortalidad adicional reportada hoy: <strong>${est.bajasReportadasReales || 0} bajas</strong>. Para mantener el promedio sano en trópico cálido, registra agua/mortalidad diaria aunque el alimento sea a libre demanda.`
        };
      case 'truth-bodega-jit':
        return {
          question: `Estás revisando **Alimento en Bodega Hoy (Justo a Tiempo)**: quedan **${formatBultosHuman(est.bultosEtapaActivaRestantes ?? 2)}** de **${est.etapaActivaMaterial || 'Master Pollito'}**. ¿Tienes duda sobre cuándo hacer el siguiente pedido sin inmovilizar plata?`,
          detail: `En Sem 1 solo se compraron <strong>${est.bultosCompradosInicio ?? 3} bultos</strong> de Master Pollito ($${Number(s.preciosRegionales?.alimInicBulto || 106500).toLocaleString('es-CO')}/bulto). El consumo teórico de ${est.avesVivasReportadasHoy ?? 603} aves al Día ${est.diaCicloL1 || 4} es ${Number(est.consumoTeoricoAcumLoteKg || 39.8).toFixed(1).replace('.', ',')} kg. Los 16 bultos de Nutrepollo Cr SP se piden antes del 20-nov (Día 8) y los 48 de Broiler I desde el 04-dic (Sem 4).`
        };
      case 'truth-proximo-pesaje':
        return {
          question: `Estás viendo **Próximo Pesaje Obligatorio (Día ${est.proxPesajeDia || 7} · ${est.proxPesajeFecha || '2026-11-19'})**. ¿Amplío cómo tomar la muestra de 30 pollos para activar tu FCR e IEP reales?`,
          detail: `Hasta no pesar una muestra real de 30 pollos al azar (meta Día 7: <strong>${est.metaRossProxG || 201} g/ave = ${((est.metaRossProxG || 201) * 30 / 1000).toFixed(2)} kg los 30</strong>), la conversión (FCR) y el IEP mostrados siguen siendo de tabla genética Ross 308. Un primer pesaje semanal desbloquea la desviación real hacia la meta del 22-dic.`
        };
      case 'truth-preventa-lote2':
        return {
          question: `Estás revisando **Preventa Lote 1 y Entrada del Lote 2 (${est.lote2FechaEnt || '2026-11-23'})**. ¿Quieres revisar cuántos pollos faltan por comprometer para Navidad o los giros del Lote 2?`,
          detail: `Lote 1 tiene meta conservadora de ${ry.avesL1Objetivo ?? 582} aves a cosecha (${ry.avesPrevendidasL1 ?? 0} prevendidas hoy). Mientras tanto, Lote 2 (800 aves negociadas directo a $3.200/pollito) entra el <strong>${est.lote2FechaEnt || '2026-11-23'}</strong> ahorrando $1.040.000 frente al precio local.`
        };
      case 'hero-plata-giros':
        return {
          question: `Estás mirando **Plata Comprometida y Próximos Giros**. Llevas ${cop(tv.comprometidoArranqueRealCop)} de arranque + Sem 1 y el próximo giro fuerte es ${cop(tv.giroSem3Cop)} el 23-nov. ¿Tienes inquietudes sobre por qué el tope cae el 23-dic?`,
          detail: `<strong>Desglose de caja sin mezclas:</strong> Arriendo mes 1 ($750k) + Lote 1 pollito ($2,70M) + 70% insumos ($556,5k) + 3 bultos Master Sem 1 ($319,5k) = <strong>${cop(tv.comprometidoArranqueRealCop)}</strong>. Entre el 23-nov y el 23-dic salen pagos escalonados de Lotes 2 y 3, tocando tope negativo de <strong>-${cop(tv.picoSolo3LCop)}</strong> un día antes del primer cobro grande (24-dic). Payback 3L: ${tv.payback3LotesFechaCorta || '15-ene'}.`
        };
      case 'hero-retorno-real':
        return {
          question: `Estás mirando **Retorno Plan Base (${cop(cons3.utilidadCanal)} · ROI ${(Number(tv.roiSobrePico3LotesPct || 0.619) * 100).toFixed(1)}%)** vs **Simulación Estrés (${cop(ac.utilidadAcida3LCop)})**. ¿Quieres validar qué supuestos castigan esa contingencia?`,
          detail: `La utilidad real esperada de los 3 primeros lotes bajo precio meta ($11.500/kg canal) es <strong>${cop(cons3.utilidadCanal)}</strong> (${cop(kpiInd.utilidadPorAveFin3Lotes || 9401)}/ave). El piso de <strong>${cop(ac.utilidadAcida3LCop)}</strong> NO es un gasto real: simula qué pasaría si ocurrieran 4 castigos juntos (-1,5% merma en frío, -$500/kg descuento de precio, +$350/kg transporte refrigerado y +3% consumo extra de alimento).`
        };
      case 'hero-costo-equilibrio':
        return {
          question: `Estás revisando **Costo Real (${cop(ry.precioEquilibrioKgCanal3L)}/kg 3L · ${cop(l1.costoKgCanal)}/kg L1)** y la regla frente a venta en pie (**${cop(ry.precioPisoBatnaCanalKg)}/kg**). ¿Aclaro por qué aparecen ambas cifras?`,
          detail: `<strong>1) Costo real (0% pérdida):</strong> producir 1 kg en canal te cuesta <strong>${cop(l1.costoKgCanal)}</strong> en Lote 1 y baja a <strong>${cop(ry.precioEquilibrioKgCanal3L)}</strong> en los 3 lotes (Alimento ${cop(pr.alimento)} + Pollito ${cop(pr.pollito)} + Sacrificio/faena ${cop(pr.sacrificio)} + Insumos/Arriendo/Mano obra ${cop((pr.insumos || 0) + (pr.arriendo || 0) + (pr.manoObra || 0))}).<br><strong>2) Regla comercial ($9.577/kg):</strong> no es costo; equivale a vender vivo a $7.400/kg ($7.400 ÷ 0,825 rendimiento + $607 de sacrificio/faena). Entre $8.247 y $9.577 ganas plata sobre costo, pero conviene más vender en pie.`
        };
      case 'hero-capacidad-galpon':
        return {
          question: `Estás viendo **Capacidad del Galpón (3 Secciones · hasta ${ry.capacidadDeclaradaSeccionAves || 900} aves/secc.)**. ${ry.areaMedidaVerificada ? `Área verificada: ${ry.areaGalponM2} m².` : 'El metraje exacto sigue pendiente por medir en finca.'} ¿Quieres ingresar largo × ancho real o revisar la densidad?`,
          detail: `${ry.areaMedidaVerificada ? `Con <strong>${ry.areaGalponM2} m²</strong> medidos (${(ry.areaGalponM2 / 3).toFixed(1)} m²/secc.), 800 aves a 42d ocupan <strong>${Number(ry.densidad42dSeccionKgM2).toFixed(1)} kg/m²</strong> (límite tropical natural Ross 308: 20–25 kg/m²).` : `Por ahora trabajamos con la capacidad declarada de <strong>hasta 900 aves por sección</strong> (Lote 1 usa 603, Lotes 2–3 usan 800). No mostramos alerta roja artificial hasta que midan en finca largo × ancho de una sección y validen el límite térmico real (≤24–25 kg/m²).`}`
        };
      case 'decision-semana-1':
      case 'decision-semana-2':
      case 'decision-semana-3': {
        const idx = Number(cardId.split('-').pop()) - 1;
        const dec = (ry.top3DecisionesSemana && ry.top3DecisionesSemana[idx]) || {};
        return {
          question: `Estás enfocando **Decisión ${dec.prioridad || 1}: ${dec.titulo || ''}**. ¿Tienes alguna inquietud sobre esta acción antes del plazo **${dec.fechaLimite || 'hoy'}**?`,
          detail: `${dec.detalle || 'Revisa este hito operativo y confirma su ejecución en el módulo correspondiente.'}`
        };
      }
      case 'bsc-financiera':
        return {
          question: `Estás revisando **Perspectiva Financiera (Kaplan & Norton + FENAVI)**: **MOFC (Margen sobre Alimento) ${((kpiInd.mofc3LotesPct || 0.64) * 100).toFixed(1)}%**. ¿Deseas ver el peso del alimento sobre el costo?`,
          detail: `En Colombia (FENAVI), el concentrado pesa 60%–75% del costo. Aquí representa <strong>${((kpiInd.alimentoPctSobreCostoCanal3Lotes || 0.572) * 100).toFixed(1)}% del costo en canal</strong> y <strong>${((kpiInd.alimentoPctSobreCostoVivo3Lotes || 0.62) * 100).toFixed(1)}% en pie</strong>. El Margen sobre Alimento (MOFC) en 3 lotes asciende a <strong>${cop(kpiInd.mofc3LotesCop || 37435443)}</strong>.`
        };
      case 'bsc-cliente':
        return {
          question: `Estás revisando **Cliente y Mercado**: ancla **${cop(s.preciosRegionales?.precioCanalKg || 11500)}/kg canal** frente a costo **${cop(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695)}/kg**. ¿Deseas simular un cliente con peso especial o venta anticipada?`,
          detail: `Meta base de producto: pollo fresco en canal con menudencias (~2,47 kg a 42d ó ~2,30 kg al 22-dic Día 40). El desposte o pechugas sueltas es una decisión comercial aparte en Módulo 3.`
        };
      case 'bsc-procesos':
        return {
          question: `Estás revisando **Procesos Internos e IEP (Estándar Aviagen Ross 308)**: referencia **>320 Bueno / >360 Excelente**. ¿Tienes dudas sobre cómo suben tu FCR e IEP?`,
          detail: `Fórmula estándar europea: <strong>IEP = (Viabilidad % × Peso kg) ÷ (Edad días × FCR) × 100</strong>. Una mejora de apenas 0,05 en FCR (ej. de 1,65 a 1,60) o reducir 1% de mortalidad impacta de inmediato el costo por kilo vivo y canal.`
        };
      case 'bsc-aprendizaje':
        return {
          question: `Estás revisando **Aprendizaje y Disciplina de Campo**. ¿Quieres ver qué falta hoy para cerrar la bitácora y preparar el pesaje semanal?`,
          detail: `La trazabilidad diaria (mortalidad, temperatura, agua y pesaje cada 7 días) convierte proyecciones teóricas en mediciones auditables y permite detectar a tiempo cualquier desvío antes del 22-dic.`
        };
      default:
        return {
          question: 'Tarjeta seleccionada. ¿Tienes alguna inquietud sobre este indicador o quieres ampliar su desglose?',
          detail: 'Haz clic en "Ver desglose ejecutivo" para consultar el cálculo exacto y su impacto en el negocio.'
        };
    }
  }

  function renderAviFocusBar() {
    const bar = $('avi-focus-bar');
    if (!bar) return;
    const fc = appState.focusedCard;
    if (!fc) {
      bar.classList.remove('has-selection');
      bar.innerHTML = `<div class="avi-focus-head"><span>👁️ Toca cualquier tarjeta, cifra o decisión de abajo para resaltarla, ver su desglose ejecutivo o consultarla con <strong>Avi</strong>.</span></div>`;
      return;
    }
    const sim = getActiveSimulation();
    const insight = buildLocalCardFocusInsight(fc.id, sim.computed, sim.state);
    bar.classList.add('has-selection');
    bar.innerHTML = `
      <div class="avi-focus-head">
        <div>
          <span class="pill ok">👁️ Foco activo · Avi</span>
          <strong style="margin-left:6px;">${escapeHtml(fc.title)}</strong>
          <span class="muted num" style="margin-left:6px;">(${escapeHtml(fc.metric)})</span>
          <div style="margin-top:5px;">«${escapeHtml(insight.question.replace(/\*\*/g, ''))}»</div>
        </div>
        <button type="button" class="btn-xs" id="btn-clear-card-focus" title="Quitar selección">✕</button>
      </div>
      <div class="avi-focus-actions">
        <button type="button" class="btn-xs btn-emerald" id="btn-expand-focus-local">💡 ${appState.focusedCardExpanded ? 'Ocultar desglose ejecutivo' : 'Ver desglose ejecutivo'}</button>
        <button type="button" class="btn-xs" id="btn-send-focus-chat">💬 Consultar con Avi</button>
      </div>
      ${appState.focusedCardExpanded ? `<div class="avi-focus-detail">${insight.detail}</div>` : ''}
    `;

    if ($('btn-clear-card-focus')) {
      $('btn-clear-card-focus').addEventListener('click', () => {
        appState.focusedCard = null;
        appState.focusedCardExpanded = false;
        document.querySelectorAll('.interactive-focus-card.is-avi-focused').forEach((c) => c.classList.remove('is-avi-focused'));
        renderAviFocusBar();
      });
    }
    if ($('btn-expand-focus-local')) {
      $('btn-expand-focus-local').addEventListener('click', () => {
        appState.focusedCardExpanded = !appState.focusedCardExpanded;
        renderAviFocusBar();
      });
    }
    if ($('btn-send-focus-chat')) {
      $('btn-send-focus-chat').addEventListener('click', () => {
        setConversationDrawerOpen(true);
        const promptText = `Estoy revisando "${fc.title}" (${fc.metric}). ¿Qué debo vigilar aquí y cómo impacta el negocio?`;
        if ($('dock-chat-input')) {
          $('dock-chat-input').value = promptText;
        }
        const form = $('dock-chat-form');
        if (form && $('btn-send-chat') && !$('btn-send-chat').disabled) {
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          else $('btn-send-chat').click();
        } else {
          appendTranscript('assistant', `${insight.question.replace(/\*\*/g, '')}\n\n${insight.detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}`);
        }
      });
    }
  }

  function setCardVisualAndVoiceFocus(cardEl, shouldAutoPromptVoice = true) {
    if (!cardEl) return;
    document.querySelectorAll('.interactive-focus-card.is-avi-focused').forEach((c) => c.classList.remove('is-avi-focused'));
    cardEl.classList.add('is-avi-focused');
    const cardData = {
      id: cardEl.dataset.cardId || cardEl.id || 'card',
      title: cardEl.dataset.cardTitle || 'Indicador',
      metric: cardEl.dataset.cardMetric || '',
      context: cardEl.dataset.cardContext || ''
    };
    const isNewCard = !appState.focusedCard || appState.focusedCard.id !== cardData.id;
    appState.focusedCard = cardData;
    if (isNewCard) appState.focusedCardExpanded = false;
    renderAviFocusBar();

    // Sincronización en tiempo real vía DataChannel WebRTC si está conectado
    clearTimeout(cardFocusSyncTimer);
    cardFocusSyncTimer = setTimeout(() => {
      const dc = appState.voice && appState.voice.dc;
      if (dc && dc.readyState === 'open') {
        const focusNote = `\n\n[FOCO VISUAL ACTIVO DEL USUARIO]: Acaba de señalar la tarjeta "${cardData.title}" (${cardData.metric}). Detalle: ${cardData.context}. Si te pregunta "¿y esto?" o "¿tienes inquietud?", responde directo sobre esta tarjeta.`;
        const baseInst = appState.voice.baseInstructions || '';
        if (baseInst) {
          try {
            dc.send(JSON.stringify({
              type: 'session.update',
              session: { instructions: baseInst + focusNote }
            }));
          } catch (_) {}
        }
        const now = Date.now();
        if (shouldAutoPromptVoice && isNewCard && appState.voice.mode === 'listening' && now - lastVoiceAutoAckAt > 5000) {
          lastVoiceAutoAckAt = now;
          const insight = buildLocalCardFocusInsight(cardData.id, getActiveSimulation().computed, getActiveSimulation().state);
          try {
            dc.send(JSON.stringify({
              type: 'response.create',
              response: {
                instructions: `Di brevemente en máximo 1 o 2 frases amigables en español colombiano que ves que el usuario tocó "${cardData.title}": ${insight.question.replace(/\*\*/g, '')}`
              }
            }));
          } catch (_) {}
        }
      }
    }, 250);
  }

  function bindInteractiveFocusCards(container = document) {
    container.querySelectorAll('.interactive-focus-card').forEach((card) => {
      if (appState.focusedCard && appState.focusedCard.id === card.dataset.cardId) {
        card.classList.add('is-avi-focused');
      }
      card.addEventListener('click', (e) => {
        if (e.target.closest('button, a, input, select')) return;
        setCardVisualAndVoiceFocus(card, true);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setCardVisualAndVoiceFocus(card, true);
        }
      });
    });
  }

  function renderHeroBridge(activeComputed, activeState) {
    const off = appState.officialComputed;
    const lotes = activeComputed.av2.lotes || [];
    const l1 = lotes[0];
    const l2 = lotes[1];
    const l3 = lotes[2];
    const cons3 = activeComputed.av2.consolidado3Lotes;
    const tes = activeComputed.av2.tesoreriaResumen;
    const cierres = activeComputed.av2.cierresComercialesLotes || {};
    const cL1 = cierres['lote-1'] || { ingresoEfectivo: l1.ingresoCanal, utilidadEfectiva: l1.utilidadCanal, hasOverride: false };
    const cL2 = cierres['lote-2'] || { ingresoEfectivo: l2.ingresoCanal, utilidadEfectiva: l2.utilidadCanal, hasOverride: false };
    const cL3 = cierres['lote-3'] || { ingresoEfectivo: l3.ingresoCanal, utilidadEfectiva: l3.utilidadCanal, hasOverride: false };
    const util3LotesMix = cL1.utilidadEfectiva + cL2.utilidadEfectiva + cL3.utilidadEfectiva;
    const piezas100 = (activeComputed.av2.ventasParcialesResumen?.comparativaModalidadesLote1 || {}).piezas100 || { utilidadCop: 0, extraVsCanalCop: 0, precioKgCop: 0 };
    const contRes = activeComputed.av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18 }, loteModelo: { utilidadCanal: 0 }, flujoCajaContinuoSemanal: [], saldoFinalContinuo: tes.saldoFinalPost4m, semanasTotales: 11 };

    const offCierres = off.av2.cierresComercialesLotes || {};
    const offCL1 = offCierres['lote-1'] || { utilidadEfectiva: off.av2.lotes[0].utilidadCanal };
    const offUtil3Mix = (offCierres['lote-1']?.utilidadEfectiva ?? off.av2.lotes[0].utilidadCanal)
      + (offCierres['lote-2']?.utilidadEfectiva ?? off.av2.lotes[1].utilidadCanal)
      + (offCierres['lote-3']?.utilidadEfectiva ?? off.av2.lotes[2].utilidadCanal);

    $('hero-sim-status').innerHTML = appState.whatIfActive
      ? '<span class="pill warn">Simulación Activa (Sin guardar cambios permanentes)</span>'
      : '<span class="pill ok">Control en Vivo</span>';

    const gov = activeComputed.av2.gobiernoEjecutivo || {};
    const est = gov.estadoCampoHoy || {};
    const tv = gov.tesoreriaViva || {};
    const ac = gov.escenarioAcido || {};
    const ry = gov.riesgosYDecisiones || {};
    const isPartner = isPartnerScope();

    const hoyDia = est.diaCicloL1 || getCurrentCycleDay(activeState);
    const diasTrans = est.diasTranscurridos || hoyDia;
    const diasRep = est.diasReportadosEnVentana ?? 0;
    const sinRep = est.diasSinReporte ?? Math.max(0, diasTrans - diasRep);
    const avesNom = est.avesNominalesCompradas ?? l1.avesInic ?? 600;
    const vivosHoy = est.avesVivasReportadasHoy ?? est.avesRecibidasReales ?? 603;
    const bajasReal = est.bajasReportadasReales || 0;
    const bajasLabel = bajasReal === 1 ? '1 baja adicional' : `${bajasReal} bajas adicionales`;

    // 1A. Franja de Verdad Operativa Hoy (separa hecho auditado vs ceguera sin reporte)
    if ($('exec-truth-strip')) {
      const repCls = est.tieneCegueraOperativa ? 'is-danger' : (sinRep > 0 ? 'is-warn' : 'is-ok');
      const repBadge = est.tieneCegueraOperativa
        ? '<span class="pill danger">Sin reporte</span>'
        : (sinRep > 0 ? '<span class="pill warn">Atrasado</span>' : '<span class="pill ok">Al día</span>');
      const prevPct = Math.round((ry.pctPreventaL1 || 0) * 100);
      const prevCls = prevPct >= 70 ? 'is-ok' : (est.lote1SalidaEnDias <= 15 ? 'is-danger' : 'is-warn');
      const etapaBadge = est.etapaActivaBadge || `Día ${hoyDia}`;
      const etapaMaterial = est.etapaActivaMaterial || 'Master Pollito';
      const restEtapaNum = est.bultosEtapaActivaRestantes ?? est.masterRestantesPiso ?? 2;
      const restEtapaTxt = formatBultosHuman(restEtapaNum);
      const compHoyTotal = Number(est.bultosCompradosInicio ?? 3);
      const compEtapaNum = Number(est.bultosEtapaActivaComprados ?? compHoyTotal);
      const consKgStr = Number(est.consumoTeoricoAcumLoteKg || 39.8).toFixed(1).replace('.', ',');
      const proxJit = est.proximaCompraJit;
      const proxJitText = proxJit
        ? `Próx. compra JIT: ${proxJit.etapa} antes del ${proxJit.fechaCorta}`
        : `Plan JIT cubierto (${compHoyTotal} bultos)`;

      $('exec-truth-strip').innerHTML = `
        <div class="truth-chip-card interactive-focus-card ${repCls}" tabindex="0"
             data-card-id="truth-disciplina-galpon"
             data-card-title="Disciplina en Galpón Hoy"
             data-card-metric="${diasRep}/${diasTrans} días reportados · ${vivosHoy} vivas reales"
             data-card-context="${avesNom} compradas, ${vivosHoy} reales recibidas, ${bajasLabel}">
          <div class="truth-chip-label"><span>Disciplina en Galpón Hoy</span>${repBadge}</div>
          <div class="truth-chip-val">${diasRep}/${diasTrans} días reportados · Día ${hoyDia}/42</div>
          <div class="truth-chip-sub"><strong>${vivosHoy} vivas reales</strong> (${avesNom} compradas · ${bajasLabel}) · ${est.tieneCegueraOperativa ? 'Falta confirmar en galpón.' : 'Bitácora al día.'}</div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>
        <div class="truth-chip-card interactive-focus-card" tabindex="0"
             data-card-id="truth-bodega-jit"
             data-card-title="Alimento en Bodega Hoy (Justo a Tiempo)"
             data-card-metric="${escapeHtml(restEtapaTxt)} · ${escapeHtml(etapaMaterial)}"
             data-card-context="De ${compEtapaNum} bultos comprados en granja (${consKgStr} kg consumo teórico Ross). ${escapeHtml(proxJitText)}">
          <div class="truth-chip-label"><span>Alimento en Bodega Hoy (JIT)</span><span class="pill accent">${escapeHtml(etapaBadge)}</span></div>
          <div class="truth-chip-val">${restEtapaTxt} · ${escapeHtml(etapaMaterial)}</div>
          <div class="truth-chip-sub">De ${compEtapaNum} bultos en granja (${consKgStr} kg consumidos, ${est.consumoTeoricoAcumAveG || 66} g/ave) · ${escapeHtml(proxJitText)}.</div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>
        <div class="truth-chip-card interactive-focus-card ${est.pesajesVencidosSinMedir && est.pesajesVencidosSinMedir.length ? 'is-danger' : 'is-warn'}" id="card-truth-pesaje" tabindex="0"
             data-card-id="truth-proximo-pesaje"
             data-card-title="Próximo Pesaje Obligatorio"
             data-card-metric="Día ${est.proxPesajeDia || 7} · Meta ${est.metaRossProxG || 201} g/ave"
             data-card-context="Fecha ${est.proxPesajeFecha || '2026-11-19'}. Muestra 30 pollos meta ${((est.metaRossProxG || 201) * 30 / 1000).toFixed(2)} kg hacia cosecha 22-dic">
          <div class="truth-chip-label"><span>Próximo Pesaje Obligatorio</span><span class="pill warn">${est.proxPesajeFecha || '2026-11-19'}</span></div>
          <div class="truth-chip-val">Día ${est.proxPesajeDia || 7} · Meta ${est.metaRossProxG || 201} g/ave</div>
          <div class="truth-chip-sub">Pesar 30 pollos (meta ${((est.metaRossProxG || 201) * 30 / 1000).toFixed(2)} kg) · <button type="button" class="inline-jump-link" id="btn-jump-growth-curve">Ver curva Pre-Navidad 22-dic →</button></div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>
        <div class="truth-chip-card interactive-focus-card ${prevCls}" tabindex="0"
             data-card-id="truth-preventa-lote2"
             data-card-title="Preventa Lote 1 (24-Dic) y Entrada Lote 2"
             data-card-metric="${ry.avesPrevendidasL1 ?? 0}/${ry.avesL1Objetivo ?? l1.avesFin} aves (${prevPct}%)"
             data-card-context="Lote 2 de 800 aves a $3.200 entra el ${est.lote2FechaEnt || '2026-11-23'}">
          <div class="truth-chip-label"><span>Preventa L1 (24-Dic) y Lote 2</span><span class="pill accent">${est.lote1SalidaEnDias ?? 38}d cosecha</span></div>
          <div class="truth-chip-val">${ry.avesPrevendidasL1 ?? 0}/${ry.avesL1Objetivo ?? l1.avesFin} aves (${prevPct}%)</div>
          <div class="truth-chip-sub">Ingreso Lote 2 (800 aves @ $3.200): <strong>${est.lote2FechaEnt || '2026-11-23'}</strong> (${est.lote2IngresoEnDias >= 0 ? `en ${est.lote2IngresoEnDias} días` : 'activo'}).</div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>
      `;
      if ($('btn-jump-growth-curve')) {
        $('btn-jump-growth-curve').addEventListener('click', (e) => {
          e.stopPropagation();
          focusSection('bitacora_pesajes', 'Curva de Peso Pre-Navidad 22-dic');
          const el = $('growth-tracker-panel');
          if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 140);
        });
      }
      bindInteractiveFocusCards($('exec-truth-strip'));
    }

    // 1B. 4 Tarjetas Ejecutivas Reales Completas (Base clara vs Contingencia aparte, Costo Real primero, Capacidad sin datos inventados)
    const kpiInd = activeComputed.av2.kpiIndustriales || {};
    const picoRef = tv.picoReferenciaCorta || '23-dic (Víspera 1.ª cosecha · Día 41 L1)';
    const pb3F = tv.payback3LotesFechaCorta || '15-ene';
    const pbContF = tv.paybackContinuoFechaCorta || '06-feb';
    const finalContF = tv.cajaFinalContFechaCorta || '20-mar';

    const card1 = `
        <div class="hero-stage-card interactive-focus-card" tabindex="0"
             data-card-id="hero-plata-giros"
             data-card-title="1. Caja Real, Próximos Giros y Tope"
             data-card-metric="Próx. giro ${cop(tv.giroSem3Cop || 4674475)} (23-nov) · Tope -${cop(tv.picoSolo3LCop || tes.capitalTrabajoPicoSem7)}"
             data-card-context="Arranque + Sem 1: ${cop(tv.comprometidoArranqueRealCop || 4326000)}. Payback ${pb3F} (L1–L3) / ${pbContF} (Continuo).">
          <div class="hero-stage-step">
            <span>1. Caja Real, Próximos Giros y Tope</span>
            <span class="pill accent">Payback ${pb3F} (L1–L3)</span>
          </div>
          <div class="hero-stage-title">Inicio + Sem 1 (JIT): ${cop(tv.comprometidoArranqueRealCop || 4326000)} · Tope ${picoRef}: -${cop(tv.picoSolo3LCop || tes.capitalTrabajoPicoSem7)}</div>
          <div class="hero-stage-val">${cop(tv.giroSem3Cop || 4674475)} <small style="font-size:0.62em; font-weight:600;">próx. giro 23-nov (Lote 2)</small></div>
          <div class="hero-stage-meta">
            <strong>30-nov / 05-dic (Mes 2 + L3):</strong> ${cop(tv.giroSem4Cop || 7441485)} · <strong>06–23 dic (antes 1.er cobro 24-dic):</strong> ${cop(tv.giroSem5a7Solo3LCop || 14773045)} (Payback continuo ${pbContF}).
          </div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>`;

    const card2 = `
        <div class="hero-stage-card is-core interactive-focus-card" tabindex="0"
             data-card-id="hero-retorno-real"
             data-card-title="2. Retorno Plan Base vs Contingencia"
             data-card-metric="Base L1–L3: ${cop(util3LotesMix)} (ROI ${(Number(tv.roiSobrePico3LotesPct || 0.619) * 100).toFixed(1)}%)"
             data-card-context="Utilidad libre al 30-ene: ${cop(tes.saldoFinalPost4m)}. Contingencia estrés simulada: ${cop(ac.utilidadAcida3LCop || 14042301)}.">
          <div class="hero-stage-step">
            <span style="color:var(--emerald);">2. Retorno Plan Base vs Contingencia</span>
            <span class="pill ok">ROI s/tope ${(Number(tv.roiSobrePico3LotesPct || 0.619) * 100).toFixed(1)}%</span>
          </div>
          <div class="hero-stage-title">Plan Oficial 3 Lotes: +${cop(kpiInd.utilidadPorAveFin3Lotes || 9401)}/ave · ${cop(tes.saldoFinalPost4m)} libre al 30-ene</div>
          <div class="hero-stage-val" style="color:var(--emerald);">${cop(util3LotesMix)} <small style="font-size:0.62em; font-weight:600;">utilidad neta base</small></div>
          <div class="hero-stress-box">
            <strong>Simulación estrés (no realidad): ${cop(ac.utilidadAcida3LCop || 14042301)}</strong> si coincidieran -1,5% merma fría, -$500/kg precio, +$350/kg transporte refrigerado y +3% consumo alimento.
          </div>
          <div class="hero-stage-meta">
            <strong>Continuo 900 c/18d:</strong> +${cop(tv.utilLoteContNetoArr || 9069169)} neto/lote · Al ${finalContF}: ${cop(tv.cajaSem18ContinuoCop || 47295092)}.
          </div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>`;

    const costCanalBase3L = ry.precioEquilibrioKgCanal3L || cons3.costoKgCanal;
    const precioEquivPie = ry.precioPisoBatnaCanalKg || 9577;
    const card3 = `
        <div class="hero-stage-card interactive-focus-card" tabindex="0"
             data-card-id="hero-costo-equilibrio"
             data-card-title="3. Costo Real de Producción y Regla de Venta"
             data-card-metric="Costo canal ${cop(costCanalBase3L)}/kg (L1: ${cop(l1.costoKgCanal)}/kg) · Holgura ${((ry.colchonPrecioPct || 0.331) * 100).toFixed(1)}%"
             data-card-context="Equivalencia frente a vender pollo vivo ($7.400/kg) sumando $1.500/ave sacrificio y faenado: ${cop(precioEquivPie)}/kg.">
          <div class="hero-stage-step">
            <span>3. Costo Real y Regla Comercial</span>
            <span class="pill ok">Holgura s/costo ${((ry.colchonPrecioPct || 0.331) * 100).toFixed(1)}%</span>
          </div>
          <div class="hero-stage-title">Lote 1: ${cop(l1.costoKgCanal)}/kg canal · Lotes 2 y 3 bajan promedio a ${cop(costCanalBase3L)}/kg</div>
          <div class="hero-stage-val">${cop(costCanalBase3L)} <small style="font-size:0.62em; font-weight:600;">/ kg costo real canal</small></div>
          <div class="hero-stage-meta">
            <strong>Equivalencia vs pollo vivo ($7.400/kg): ${cop(precioEquivPie)}/kg</strong> (82,5% rendimiento + $1.500/ave sacrificio y faenado). Debajo de ${cop(precioEquivPie)} rinde más vender vivo; debajo de ${cop(costCanalBase3L)} pierdes. Alimento = <strong>${((ry.alimentoPctSobreCostoCanal || 0.572) * 100).toFixed(1)}%</strong> del costo.
          </div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>`;

    const areaVerif = Boolean(ry.areaMedidaVerificada);
    const capDeclarada = Number(ry.capacidadDeclaradaSeccionAves || 900);
    const areaActM2 = Number(ry.areaGalponM2 || activeState.parametrosGenerales?.areaGalponM2 || 280);
    const densCrit = Number(ry.densidad42dSeccionKgM2 || 24.9);
    const card4 = `
        <div class="hero-stage-card ${areaVerif && densCrit > 24 ? 'is-warn' : ''} interactive-focus-card" tabindex="0"
             data-card-id="hero-capacidad-galpon"
             data-card-title="4. Capacidad del Galpón (3 Secciones)"
             data-card-metric="${areaVerif ? `${densCrit.toFixed(1)} kg/m² en ${areaActM2} m²` : `Cupo OK hasta ${capDeclarada} aves/secc. (m² por medir)`}"
             data-card-context="Galpón de 3 secciones: L1 usa 603 aves, Lotes 2–3 usan 800 aves c/u. Sin mezclar desposte.">
          <div class="hero-stage-step">
            <span>4. Capacidad Física del Galpón</span>
            <span class="pill ${areaVerif ? (densCrit > 24 ? 'danger' : 'ok') : 'warn'}">${areaVerif ? `${densCrit.toFixed(1)} kg/m² secc.` : 'm² por medir'}</span>
          </div>
          <div class="hero-stage-title">3 secciones · Tope declarado: ${capDeclarada} aves/secc. (L1: 603 · L2–L3: 800)</div>
          <div class="hero-stage-val">${areaVerif ? `${densCrit.toFixed(1)} kg/m²` : 'Cupo físico OK'} <small style="font-size:0.62em; font-weight:600;">${areaVerif ? `en ${areaActM2} m² verificados` : `(hasta ${capDeclarada} aves/secc.)`}</small></div>
          <div class="hero-stage-meta">
            ${areaVerif
              ? `Meta clima cálido El Zulia ≤24–25 kg/m² (45 días sube a ${Number(ry.densidad45dSeccionKgM2 || 27.4).toFixed(1)} kg/m²). `
              : `Metraje exacto aún <strong>pendiente por medir en finca</strong> (ref. plantilla ${areaActM2} m² sin validar). Al medir largo × ancho se calcula densidad real en kg/m². `}
            <button type="button" class="inline-jump-link" id="btn-measure-galpon">📏 ${areaVerif ? 'Actualizar m²' : 'Ingresar medidas reales'}</button>
          </div>
          <span class="avi-focus-tag">👁️ En foco con Avi</span>
        </div>`;

    $('hero-kpi-grid').innerHTML = `${card1}${card2}${card3}${card4}`;
    if ($('btn-measure-galpon')) {
      $('btn-measure-galpon').addEventListener('click', async (e) => {
        e.stopPropagation();
        const raw = window.prompt('Ingresa el área total del galpón en m² o escribe "largo x ancho" (ej. 30x12 = 360):', String(areaActM2));
        if (!raw) return;
        let nextArea = NaN;
        const mult = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*[xX*]\s*(\d+(?:[.,]\d+)?)$/);
        if (mult) {
          nextArea = Number(mult[1].replace(',', '.')) * Number(mult[2].replace(',', '.'));
        } else {
          nextArea = Number(raw.replace(',', '.'));
        }
        if (!Number.isFinite(nextArea) || nextArea < 50 || nextArea > 5000) {
          appendTranscript('system', 'Medida inválida: ingresa un área entre 50 y 5000 m² o formato largo x ancho.');
          return;
        }
        nextArea = Math.round(nextArea);
        await postOperationalEvent({
          type: 'PARAM_UPDATE',
          sourceChannel: 'web_galpon_measure',
          payload: {
            parametrosGenerales: {
              areaGalponM2: nextArea,
              areaMedidaVerificada: true
            }
          }
        });
        appendTranscript('system', `Área verificada del galpón guardada: ${nextArea} m² (${(nextArea / 3).toFixed(1)} m² por sección).`);
      });
    }
    bindInteractiveFocusCards($('hero-kpi-grid'));

    // 1C. Top 3 Decisiones de Esta Semana
    if ($('exec-decisions-strip')) {
      const decs = Array.isArray(ry.top3DecisionesSemana) ? ry.top3DecisionesSemana : [];
      $('exec-decisions-strip').innerHTML = decs
        .map(
          (d) => `
          <div class="decision-card interactive-focus-card" tabindex="0"
               data-card-id="decision-semana-${d.prioridad}"
               data-card-title="Decisión ${d.prioridad}: ${escapeHtml(d.titulo || '')}"
               data-card-metric="Límite ${escapeHtml(d.fechaLimite || '')} · ${escapeHtml(d.badge || '')}"
               data-card-context="${escapeHtml(d.detalle || '')}">
            <div>
              <div class="decision-card-head">
                <span>DECISIÓN ${d.prioridad} · LÍMITE ${escapeHtml(d.fechaLimite || '')}</span>
                <span class="pill ${d.prioridad === 1 && est.tieneCegueraOperativa ? 'danger' : 'accent'}">${escapeHtml(d.badge || '')}</span>
              </div>
              <div class="decision-card-title">${escapeHtml(d.titulo || '')}</div>
              <div class="decision-card-detail">${escapeHtml(d.detalle || '')}</div>
            </div>
            <div class="decision-card-foot" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <button type="button" class="btn-xs" data-decision-jump="${escapeHtml(d.targetSection || 'operacion_av2')}">Ir a ejecutar →</button>
              <span class="avi-focus-tag" style="margin:0; padding:0;">👁️ En foco</span>
            </div>
          </div>
        `
        )
        .join('');
      $('exec-decisions-strip').querySelectorAll('[data-decision-jump]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          focusSection(btn.dataset.decisionJump, 'Ejecutar decisión semanal');
        });
      });
      bindInteractiveFocusCards($('exec-decisions-strip'));
    }

    // 1D. Curva Real de Tesorería Semanal dentro de #hero-bridge-chart-box (reemplaza las 6 barras heterogéneas)
    const cashMode = appState.heroCashMode === 'continuo' && (contRes.flujoCajaContinuoSemanal || []).length > 0 ? 'continuo' : '3lotes';
    if ($('btn-hero-cash-3l')) $('btn-hero-cash-3l').classList.toggle('active', cashMode === '3lotes');
    if ($('btn-hero-cash-cont')) $('btn-hero-cash-cont').classList.toggle('active', cashMode === 'continuo');

    const series = cashMode === 'continuo'
      ? (contRes.flujoCajaContinuoSemanal || [])
      : (activeComputed.av2.flujoCajaSemanal || []);

    const bridgeBox = $('hero-bridge-chart-box');
    if (bridgeBox && series.length > 0) {
      const w = 840;
      const h = 236;
      const padL = 58;
      const padR = 24;
      const padT = 24;
      const padB = 34;
      const plotW = w - padL - padR;
      const plotH = h - padT - padB;
      const vals = series.map((s) => Number(s.saldoAcumulado || 0));
      const maxVal = Math.max(1000000, ...vals);
      const minVal = Math.min(-1000000, ...vals);
      const span = Math.max(1, maxVal - minVal);
      const yOf = (v) => padT + ((maxVal - v) / span) * plotH;
      const yZero = yOf(0);
      const xOf = (idx) => padL + (series.length > 1 ? (idx / (series.length - 1)) * plotW : plotW / 2);

      let minIdx = 0;
      vals.forEach((v, i) => {
        if (v < vals[minIdx]) minIdx = i;
      });
      let breakEvenIdx = -1;
      for (let i = 0; i < vals.length; i++) {
        if (i > minIdx && vals[i] >= 0) {
          breakEvenIdx = i;
          break;
        }
      }

      const pointsAttr = series.map((s, i) => `${xOf(i).toFixed(1)},${yOf(s.saldoAcumulado).toFixed(1)}`).join(' ');
      const areaAttr = `${xOf(0).toFixed(1)},${yZero.toFixed(1)} ${pointsAttr} ${xOf(series.length - 1).toFixed(1)},${yZero.toFixed(1)}`;
      const barW = Math.max(10, Math.min(26, (plotW / Math.max(1, series.length)) * 0.56));

      const weekEls = series
        .map((s, idx) => {
          const cx = xOf(idx);
          const cy = yOf(s.saldoAcumulado);
          const neg = s.saldoAcumulado < 0;
          const bH = Math.max(2, Math.abs(cy - yZero));
          const bY = neg ? yZero : cy;
          const isPeak = idx === minIdx;
          const isBreak = idx === breakEvenIdx;
          const dotColor = isPeak ? 'var(--rose)' : isBreak ? 'var(--amber)' : neg ? '#f43f5e' : 'var(--emerald)';
          const rDot = isPeak || isBreak ? 5.5 : 3.5;
          const tickLbl = extractWeekTickLabel(s);
          const showTick = series.length <= 12 || idx % 2 === 0 || isPeak || isBreak || idx === series.length - 1;
          return `
            <g class="hero-bridge-col" data-week-idx="${idx}" tabindex="0" style="cursor:pointer;">
              <rect x="${(cx - barW / 2 - 4).toFixed(1)}" y="${padT}" width="${(barW + 8).toFixed(1)}" height="${plotH + 14}" fill="transparent" />
              <rect x="${(cx - barW / 2).toFixed(1)}" y="${bY.toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" rx="4" fill="${dotColor}" opacity="0.22" />
              <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rDot}" fill="${dotColor}" stroke="var(--bg-card)" stroke-width="1.5" />
              ${showTick ? `<text x="${cx.toFixed(1)}" y="${h - 10}" text-anchor="middle" fill="${isPeak ? 'var(--rose)' : isBreak ? 'var(--emerald)' : 'var(--text-muted)'}" font-size="${series.length > 13 ? '8.5' : '9'}" font-weight="${isPeak || isBreak ? '800' : '600'}">${escapeHtml(tickLbl)}</text>` : ''}
              ${isPeak ? `<text x="${cx.toFixed(1)}" y="${Math.min(h - 24, cy + 16).toFixed(1)}" text-anchor="middle" fill="var(--rose)" font-size="9.5" font-weight="800">${escapeHtml(tickLbl)} (D41): ${copShort(s.saldoAcumulado)}</text>` : ''}
              ${isBreak ? `<text x="${cx.toFixed(1)}" y="${Math.max(14, cy - 10).toFixed(1)}" text-anchor="middle" fill="var(--emerald)" font-size="9.5" font-weight="800">Payback ${escapeHtml(tickLbl)}</text>` : ''}
              ${idx === series.length - 1 ? `<text x="${(cx - 4).toFixed(1)}" y="${Math.max(14, cy - 10).toFixed(1)}" text-anchor="end" fill="var(--emerald)" font-size="10.5" font-weight="800">${escapeHtml(tickLbl)}: ${copShort(s.saldoAcumulado)}</text>` : ''}
            </g>
          `;
        })
        .join('');

      bridgeBox.innerHTML = `
        <svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva semanal real de caja desde Semana 1 hasta Semana ${series[series.length - 1].semana}">
          <line x1="${padL}" y1="${yZero.toFixed(1)}" x2="${w - padR}" y2="${yZero.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1.4" stroke-dasharray="4 3" />
          <text x="${padL - 6}" y="${(yZero + 3).toFixed(1)}" text-anchor="end" fill="var(--text-muted)" font-size="9.5" font-weight="700">$0</text>
          <text x="${padL - 6}" y="${padT + 4}" text-anchor="end" fill="var(--emerald)" font-size="9" font-weight="600">${copShort(maxVal)}</text>
          <text x="${padL - 6}" y="${padT + plotH}" text-anchor="end" fill="var(--rose)" font-size="9" font-weight="600">${copShort(minVal)}</text>
          <polygon points="${areaAttr}" fill="var(--accent)" opacity="0.08" />
          <polyline fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${pointsAttr}" />
          ${weekEls}
        </svg>
      `;

      const tipEl = $('hero-bridge-tooltip');
      bridgeBox.querySelectorAll('[data-week-idx]').forEach((el) => {
        const showWeek = () => {
          const item = series[Number(el.dataset.weekIdx)];
          if (!item || !tipEl) return;
          const egr = item.egresos !== undefined
            ? item.egresos
            : (Number(item.pollitosInsumos || 0) + Number(item.alimento || 0) + Number(item.fijosBenef || 0));
          tipEl.textContent = `${item.etiqueta} | Ingresos: ${cop(item.ingresos || 0)} | Egresos: -${cop(egr)} | Flujo sem: ${item.flujoNeto >= 0 ? '+' : ''}${cop(item.flujoNeto)} | Caja acumulada: ${cop(item.saldoAcumulado)}`;
        };
        el.addEventListener('mouseenter', showWeek);
        el.addEventListener('focus', showWeek);
        el.addEventListener('click', showWeek);
      });
    }

    renderBscScorecard(activeComputed, activeState);
    renderAviFocusBar();
  }

  function formatBscBadgeLabel(status, emptyText) {
    if (emptyText) return emptyText;
    if (status === 'verde') return '● Óptimo';
    if (status === 'rojo') return '● Alerta';
    return '● Seguimiento';
  }

  function renderBscScorecard(activeComputed, activeState) {
    const grid = $('bsc-scorecard-grid');
    if (!grid) return;
    const bsc = (activeComputed.av2 && activeComputed.av2.scorecardBsc) ||
      (TwinEngine.computeFarmScorecardKPIs ? TwinEngine.computeFarmScorecardKPIs(activeState, activeComputed) : null);
    if (!bsc) return;

    const fin = bsc.financiera;
    const cli = bsc.clienteMercado;
    const proc = bsc.procesosInternos;
    const apr = bsc.aprendizajeCampo;
    const kpiInd = activeComputed.av2.kpiIndustriales || {};
    const sem = bsc.resumenSemaforos || { verdes: 0, ambares: 0, rojos: 0 };

    if ($('bsc-scorecard-pill')) {
      $('bsc-scorecard-pill').textContent =
        `IEP ${proc.iepRealCampo || proc.iepRossTeorico} pts · ${apr.diasRegistrados}d reportados · ${sem.verdes} Verde / ${sem.ambares} Ámbar / ${sem.rojos} Alerta`;
    }

    const cliLabel = cli.hasRealSales === false ? '● Pend. ventas reales' : null;
    const aprLabel = apr.diasRegistrados === 0 ? '● Sin reporte campo' : null;

    const govBsc = (activeComputed.av2 && activeComputed.av2.gobiernoEjecutivo && activeComputed.av2.gobiernoEjecutivo.tesoreriaViva) || {};
    const picoBscLbl = govBsc.picoFechaCorta || '23-dic';
    const pbBscLbl = `${govBsc.paybackContinuoFechaCorta || '06-feb'} Cont. / ${govBsc.payback3LotesFechaCorta || '15-ene'} 3L`;
    const mofcPctStr = ((kpiInd.mofc3LotesPct || 0.62) * 100).toFixed(1);
    const ryBsc = (activeComputed.av2.gobiernoEjecutivo && activeComputed.av2.gobiernoEjecutivo.riesgosYDecisiones) || {};
    const areaOkBsc = Boolean(ryBsc.areaMedidaVerificada);

    grid.innerHTML = `
      <div class="bsc-card interactive-focus-card status-${fin.status}" tabindex="0"
           data-card-id="bsc-financiera"
           data-card-title="BSC 1. Financiera (FENAVI / Caja)"
           data-card-metric="Margen ${(fin.margenNeto3LotesPct * 100).toFixed(1)}% · MOFC ${mofcPctStr}%"
           data-card-context="Costo canal ${cop(fin.costoKgCanalLote1Cop)} a ${cop(fin.costoKgCanalContinuoCop)} · Alimento ${((kpiInd.alimentoPctSobreCostoCanal3Lotes || 0.572) * 100).toFixed(1)}% canal">
        <div class="bsc-card-head">
          <span>1. Financiera</span>
          <span class="bsc-dot ${fin.status}">${formatBscBadgeLabel(fin.status)}</span>
        </div>
        <div class="bsc-main-val">${(fin.margenNeto3LotesPct * 100).toFixed(1)}% margen neto · ${(Number(kpiInd.roiSobrePico3LotesPct || 0.619) * 100).toFixed(1)}% ROI</div>
        <div class="bsc-metric-list">
          <div class="bsc-metric-row"><span>Margen s/Alimento (MOFC)</span><strong>${cop(kpiInd.mofc3LotesCop || 37435443)} (${mofcPctStr}%)</strong></div>
          <div class="bsc-metric-row"><span>Costo kg Vivo / Canal 3L</span><strong>${cop(kpiInd.costoKgVivo3Lotes || 5848)} vivo / ${cop(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695)} canal</strong></div>
          <div class="bsc-metric-row"><span>Tope ${picoBscLbl} → Payback</span><strong>-${cop(kpiInd.picoCapitalContinuoSem7 || fin.picoCapitalSem7Cop)} (${pbBscLbl})</strong></div>
        </div>
        <span class="avi-focus-tag">👁️ En foco con Avi</span>
      </div>

      <div class="bsc-card interactive-focus-card status-${cli.status}" tabindex="0"
           data-card-id="bsc-cliente"
           data-card-title="BSC 2. Cliente y Mercado"
           data-card-metric="${cop(cli.ingresoPonderadoKg)}/kg meta canal"
           data-card-context="Equilibrio ${cop(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695)}/kg vs Equivalencia en pie ${cop(kpiInd.precioIndiferenciaCanalVsVivo || 9577)}/kg">
        <div class="bsc-card-head">
          <span>2. Cliente y Mercado</span>
          <span class="bsc-dot ${cli.status}">${formatBscBadgeLabel(cli.status, cliLabel)}</span>
        </div>
        <div class="bsc-main-val">${cop(cli.ingresoPonderadoKg)}/kg ${cli.hasRealSales ? 'venta real' : '(meta plan)'}</div>
        <div class="bsc-metric-list">
          <div class="bsc-metric-row"><span>Ventas hoy: Canal / Pie / Presas</span><strong>${cli.hasRealSales ? `${(cli.mixCanalPct * 100).toFixed(0)}% / ${(cli.mixPiePct * 100).toFixed(0)}% / ${(cli.mixDespostePct * 100).toFixed(0)}%` : '0 kg vendidos aún'}</strong></div>
          <div class="bsc-metric-row"><span>Costo Canal / Equiv. en Pie</span><strong>${cop(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695)} / ${cop(kpiInd.precioIndiferenciaCanalVsVivo || 9577)}/kg</strong></div>
          <div class="bsc-metric-row"><span>Meta Cosecha (Día ${cli.edadObjetivoDias || 42})</span><strong>${Number(cli.pesoCanalObjetivoKg || 2.47).toFixed(2)} kg canal (~${Math.round(Number(cli.pesoPechugaObjetivoKg || 0.84) * 1000)} g pech.)</strong></div>
        </div>
        <span class="avi-focus-tag">👁️ En foco con Avi</span>
      </div>

      <div class="bsc-card interactive-focus-card status-${proc.status}" tabindex="0"
           data-card-id="bsc-procesos"
           data-card-title="BSC 3. Procesos e IEP (Aviagen Ross 308)"
           data-card-metric="IEP ${proc.iepRealCampo || proc.iepRossTeorico} pts · FCR ${proc.fcrObjetivoTabla.toFixed(2)}"
           data-card-context="Estándar Aviagen >320 Bueno / >360 Excelente · GMD ${Number(kpiInd.gmdMetaRoss42dG || 70.3).toFixed(1)} g/día · Viabilidad meta ≥97%">
        <div class="bsc-card-head">
          <span>3. Procesos e IEP</span>
          <span class="bsc-dot ${proc.status}">${formatBscBadgeLabel(proc.status)}</span>
        </div>
        <div class="bsc-main-val">IEP ${proc.iepRealCampo || proc.iepRossTeorico} pts <small style="font-size:0.72em;">(Meta &gt;320 Bueno)</small></div>
        <div class="bsc-metric-list">
          <div class="bsc-metric-row"><span>FCR (Meta 1,57–1,65) / GMD</span><strong>${proc.fcrObjetivoTabla.toFixed(2)} / ${proc.fcrContinuo900.toFixed(2)} · ${Number(kpiInd.gmdMetaRoss42dG || 70.3).toFixed(1)} g/d</strong></div>
          <div class="bsc-metric-row"><span>Capacidad El Zulia</span><strong>${areaOkBsc ? `${proc.densidadSeccionKgM2.toFixed(1)} kg/m²` : 'Hasta 900 aves/secc. (m² por medir)'}</strong></div>
          <div class="bsc-metric-row"><span>Alimento hoy (${proc.bultosPisoLote1} en granja · ${proc.bultosFaltantesJit} JIT)</span><strong>Vacío san. ${kpiInd.vacioSanitarioActualDias ?? 12}d</strong></div>
        </div>
        <span class="avi-focus-tag">👁️ En foco con Avi</span>
      </div>

      <div class="bsc-card interactive-focus-card status-${apr.status}" tabindex="0"
           data-card-id="bsc-aprendizaje"
           data-card-title="BSC 4. Aprendizaje y Control en Campo"
           data-card-metric="${apr.diasRegistrados}/${apr.edadMetaDias}d bitácora · ${((1 - proc.mortalidadRealLote1Pct) * 100).toFixed(1)}% viabilidad"
           data-card-context="Pesajes medidos: ${apr.pesajesCount}. Transporte granja: ${apr.viajesCount} viajes (${apr.viajesAbiertos} en curso).">
        <div class="bsc-card-head">
          <span>4. Aprendizaje y Campo</span>
          <span class="bsc-dot ${apr.status}">${formatBscBadgeLabel(apr.status, aprLabel)}</span>
        </div>
        <div class="bsc-main-val">${apr.diasRegistrados}/${apr.edadMetaDias} d bitácora · ${((1 - proc.mortalidadRealLote1Pct) * 100).toFixed(1)}% viab.</div>
        <div class="bsc-metric-list">
          <div class="bsc-metric-row"><span>Pesajes semanales medidos</span><strong>${apr.pesajesCount} reg. (Meta D7: 19-nov)</strong></div>
          <div class="bsc-metric-row"><span>Transporte Granja</span><strong>${apr.viajesCount} viajes (${apr.viajesAbiertos} en curso)</strong></div>
          <div class="bsc-metric-row"><span>Acción hoy en galpón</span><strong>Día ${getCurrentCycleDay(activeState)}: reporte diario + agua</strong></div>
        </div>
        <span class="avi-focus-tag">👁️ En foco con Avi</span>
      </div>
    `;
    bindInteractiveFocusCards(grid);
  }

  function renderWhatIfSection(sim) {
    const cmp = sim.comparativaEdades || [];
    renderScenarioCards(cmp, sim);

    const rowsHtml = cmp
      .map(
        (r) => `
        <tr>
          <td><strong>${r.edadDias} días</strong></td>
          <td class="num-cell">${r.pesoVivoRossKg.toFixed(3)} kg</td>
          <td class="num-cell">${Number(r.fcrTeorico || 0).toFixed(2)}</td>
          <td class="num-cell">${r.pesoCanalConMenudKg.toFixed(3)} kg</td>
          <td class="num-cell">${r.pesoEvisceradoSecoKg.toFixed(3)} kg</td>
          <td class="num-cell">${cop(r.utilidad800)}</td>
          <td class="num-cell"><strong>${cop(r.utilidadConsolidada3Lotes)}</strong></td>
        </tr>
      `
      )
      .join('');
    $('tbody-ross-compare').innerHTML = rowsHtml;
    renderRossComparatorChart(cmp, sim);
    renderWowSimulationsSuite(sim);
  }

  function renderScenarioCards(cmp, sim) {
    const grid = $('whatif-scenario-cards');
    if (!grid || !cmp.length) return;
    const curEdad = Number(sim.state && sim.state.parametrosGenerales ? sim.state.parametrosGenerales.edadObjetivoGlobal : 42);
    const areaSecc = Math.max(1, Number(sim.state?.parametrosGenerales?.areaGalponM2 || 280) / 3);
    const climaFactor = 1 + Number(sim.state?.parametrosGenerales?.factorClimaCucutaPct || 0);
    const mortEsp = Number(sim.state?.parametrosGenerales?.mortalidadEsperadaPct ?? 0.03);
    const avesFin800 = Math.round(800 * (1 - mortEsp));
    const base42 = cmp.find((x) => x.edadDias === 42) || cmp[0];

    grid.innerHTML = cmp
      .map((r) => {
        const active = r.edadDias === curEdad;
        const diff3 = r.utilidadConsolidada3Lotes - base42.utilidadConsolidada3Lotes;
        const densSecc = (avesFin800 * (r.pesoVivoRossKg * climaFactor)) / areaSecc;
        const overCap = densSecc > 24;
        const badgeText =
          r.edadDias === 42
            ? `Meta Base (${densSecc.toFixed(1)} kg/m²)`
            : `${diff3 >= 0 ? '+' : ''}${cop(diff3)} · ${overCap ? `Exige entresaca (${densSecc.toFixed(1)} kg/m²)` : `${densSecc.toFixed(1)} kg/m²`}`;
        const badgeCls = r.edadDias === 42 ? 'accent' : (overCap ? 'warn' : 'ok');
        return `
          <button type="button" class="scenario-card ${active ? 'active' : ''}" data-scenario-age="${r.edadDias}">
            <div class="sc-top">
              <strong class="sc-age">${r.edadDias} días</strong>
              <span class="pill ${badgeCls}">${badgeText}</span>
            </div>
            <div class="sc-main num">${r.pesoCanalConMenudKg.toFixed(2)} kg canal · ${r.pesoVivoRossKg.toFixed(2)} kg vivo</div>
            <div class="sc-sub num">Lote 800: <strong>${cop(r.utilidad800)}</strong> · 3 Lotes: <strong>${cop(r.utilidadConsolidada3Lotes)}</strong></div>
          </button>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-scenario-age]').forEach((btn) => {
      btn.addEventListener('click', () => {
        applySlidersFromOverrides({ edadObjetivoDias: Number(btn.dataset.scenarioAge) });
      });
    });
  }

  function renderRossComparatorChart(cmp, sim) {
    const box = $('chart-ross-box');
    if (!box || !cmp.length) return;
    const curEdad = Number(sim.state && sim.state.parametrosGenerales ? sim.state.parametrosGenerales.edadObjetivoGlobal : 42);
    const maxUtil = Math.max(1, ...cmp.map((x) => x.utilidadConsolidada3Lotes));
    const maxKg = Math.max(1, ...cmp.map((x) => x.pesoCanalConMenudKg));
    const w = 520;
    const h = 190;
    const baseY = 148;
    const maxBarH = 98;

    const groups = cmp
      .map((r, idx) => {
        const x0 = 56 + idx * 148;
        const hUtil = Math.max(14, Math.round((r.utilidadConsolidada3Lotes / maxUtil) * maxBarH));
        const hKg = Math.max(14, Math.round((r.pesoCanalConMenudKg / maxKg) * (maxBarH * 0.88)));
        const isCur = r.edadDias === curEdad;
        const utilColor = isCur ? '#38bdf8' : '#10b981';
        const kgColor = isCur ? '#f59e0b' : 'rgba(148,163,184,0.55)';
        return `
          <g class="ross-bar-group" data-ross-age="${r.edadDias}" style="cursor:pointer;">
            ${isCur ? `<rect x="${x0 - 10}" y="18" width="112" height="148" rx="10" fill="rgba(56,189,248,0.08)" stroke="rgba(56,189,248,0.45)" stroke-dasharray="4 3" />` : ''}
            <rect x="${x0}" y="${baseY - hUtil}" width="40" height="${hUtil}" rx="6" fill="${utilColor}" opacity="0.92" />
            <text x="${x0 + 20}" y="${baseY - hUtil - 6}" text-anchor="middle" fill="currentColor" font-size="10.5" font-weight="700">$${(r.utilidadConsolidada3Lotes / 1e6).toFixed(1)}M</text>
            <rect x="${x0 + 48}" y="${baseY - hKg}" width="32" height="${hKg}" rx="6" fill="${kgColor}" opacity="0.9" />
            <text x="${x0 + 64}" y="${baseY - hKg - 6}" text-anchor="middle" fill="currentColor" font-size="10" font-weight="600">${r.pesoCanalConMenudKg.toFixed(2)}kg</text>
            <text x="${x0 + 40}" y="${h - 14}" text-anchor="middle" fill="currentColor" font-size="11.5" font-weight="${isCur ? '800' : '600'}">${r.edadDias} días${isCur ? ' ★' : ''}</text>
          </g>
        `;
      })
      .join('');

    box.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Comparativa Ross 308 utilidad y peso canal">
        <line x1="28" y1="${baseY}" x2="${w - 28}" y2="${baseY}" stroke="rgba(148,163,184,0.35)" stroke-width="1" />
        ${groups}
      </svg>
      <div class="ross-legend muted" style="display:flex; justify-content:space-between; font-size:0.74rem; padding:4px 8px 0;">
        <span>■ Barra izquierda: Utilidad 3 Lotes (M COP)</span>
        <span>■ Barra derecha: Canal c/Menud. (kg) · Haz clic para simular edad</span>
      </div>
    `;

    box.querySelectorAll('[data-ross-age]').forEach((g) => {
      g.addEventListener('click', () => {
        applySlidersFromOverrides({ edadObjetivoDias: Number(g.dataset.rossAge) });
      });
    });
  }

  const WOW_SIM_CONFIGS = {
    sim_1_estirpes_thi: {
      fields: [
        { key: 'estirpeSeleccionada', label: 'Estirpe Genética', type: 'select', options: [
          { value: 'ROSS_308_AP', label: 'Ross 308 AP (Raza Base)' },
          { value: 'COBB_500', label: 'Cobb 500 (Pechuga)' },
          { value: 'HUBBARD_EFFICIENCY_PLUS', label: 'Hubbard Efficiency+' }
        ] },
        { key: 'tempC', label: 'Temp Galpón (°C)', type: 'range', min: 24, max: 37, step: 0.5, unit: ' °C' },
        { key: 'humedadRelPct', label: 'Humedad Relativa (%)', type: 'range', min: 50, max: 90, step: 1, unit: '%' },
        { key: 'velocidadAireMs', label: 'Velocidad Aire (m/s)', type: 'range', min: 0.3, max: 3.0, step: 0.1, unit: ' m/s' },
        { key: 'edadObjetivoDias', label: 'Edad Salida (d)', type: 'range', min: 38, max: 48, step: 1, unit: ' d' }
      ]
    },
    sim_2_portafolio_b2b: {
      fields: [
        { key: 'estirpe', label: 'Estirpe Base', type: 'select', options: [
          { value: 'ROSS_308_AP', label: 'Ross 308 AP' },
          { value: 'COBB_500', label: 'Cobb 500' }
        ] },
        { key: 'volumenAves', label: 'Volumen Lote (aves)', type: 'range', min: 600, max: 1200, step: 50, unit: ' aves' },
        { key: 'edadObjetivoDias', label: 'Edad Salida (d)', type: 'range', min: 38, max: 48, step: 1, unit: ' d' },
        { key: 'colocacionRemanente48hPct', label: 'Colocación Remanente <48h (%)', type: 'range', min: 50, max: 100, step: 5, unit: '%' },
        { key: 'clientesActivosActuales', label: 'Clientes B2B Activos', type: 'range', min: 6, max: 40, step: 1, unit: ' cli.' }
      ]
    },
    sim_3_nutricion_capex: {
      fields: [
        { key: 'pdiPct', label: 'Durabilidad Pellet PDI (%)', type: 'range', min: 76, max: 96, step: 1, unit: '%' },
        { key: 'finosPct', label: 'Porcentaje Finos (%)', type: 'range', min: 3, max: 24, step: 1, unit: '%' },
        { key: 'granulometriaMaizUm', label: 'Molienda Maíz (µm)', type: 'range', min: 650, max: 1150, step: 25, unit: ' µm' },
        { key: 'balanceElectroliticoDebMeqKg', label: 'Balance DEB (mEq/kg)', type: 'range', min: 180, max: 280, step: 5, unit: ' mEq' }
      ]
    },
    sim_4_prefaena_frio: {
      fields: [
        { key: 'horasAyunoTotal', label: 'Ayuno Total (horas)', type: 'range', min: 5, max: 15, step: 0.5, unit: ' h' },
        { key: 'horaCaptura24h', label: 'Hora Captura (24h)', type: 'range', min: 0, max: 23, step: 1, unit: 'h' },
        { key: 'tempTransporteC', label: 'Temp Transporte (°C)', type: 'range', min: 20, max: 35, step: 1, unit: ' °C' },
        { key: 'tempCadenaFrioC', label: 'Temp Cadena Frío (°C)', type: 'range', min: 0, max: 7, step: 0.5, unit: ' °C' }
      ]
    },
    sim_5_anual_toc: {
      fields: [
        { key: 'avesPorLote', label: 'Aves por Lote Continuo', type: 'range', min: 600, max: 1200, step: 50, unit: ' aves' },
        { key: 'cadenciaDias', label: 'Cadencia Ingreso (días)', type: 'range', min: 12, max: 25, step: 1, unit: ' d' },
        { key: 'variacionPrecioAlimentoPct', label: 'Estrés Alimento (%)', type: 'range', min: -10, max: 20, step: 2, unit: '%' },
        { key: 'variacionPrecioCanalPct', label: 'Estrés Precio Canal (%)', type: 'range', min: -18, max: 20, step: 2, unit: '%' }
      ]
    }
  };

  function buildWowKpiCards(simId, res, partnerScope) {
    if (simId === 'sim_1_estirpes_thi') {
      const sel = res.resultadoSeleccionado;
      const mc = res.microclimaElZulia;
      return [
        { k: 'Estirpe Seleccionada', v: sel.nombre, sub: `${sel.avesCosechadas} aves · ${sel.densidadSeccionKgM2.toFixed(1)} kg/m²` },
        { k: 'THI Efectivo El Zulia', v: `${mc.thiEfectivo} (${mc.estadoTermico})`, sub: `${mc.tempEfectivaAveC}°C efect. · Agua: ${mc.relacionAguaAlimentoEsperada}`, warn: mc.thiEfectivo >= 78 },
        { k: 'Peso & FCR Proyectado', v: `${sel.pesoVivoFinalKg.toFixed(2)} kg vivo`, sub: `${sel.pesoCanalAveKg.toFixed(2)} kg canal · FCR ${sel.fcrAjustado.toFixed(2)} · Mort ${sel.mortalidadPct}%` },
        { k: 'Utilidad Neta Lote', v: cop(sel.utilidadNetaCanalCop), sub: `Plus Pechuga: +${cop(sel.plusPotencialPechugaCop)} | ${mc.recomendacionVentilacion}` }
      ];
    }
    if (simId === 'sim_2_portafolio_b2b') {
      const ks = res.matrizKasavanaSmith || [];
      const estrella = ks[0] || {};
      const gg = res.precioOptimoGaborGranger || {};
      const eb = res.cienciaEhrenbergBass95_5 || {};
      return [
        { k: 'Corte Estrella (Kasavana-Smith)', v: `${estrella.nombre || 'Canal Entero'}`, sub: `${estrella.cuadranteKasavanaSmith || 'Estrella'} · Margen ${cop(estrella.margenTotalEfectivoCop || 0)}` },
        { k: 'Óptimo Gabor-Granger', v: `${cop(gg.precioKgCop || 12200)}/kg`, sub: `Probabilidad B2B: ${gg.probabilidadCompraB2BPct || 0}% · Utilidad esp. ${cop(gg.utilidadEsperadaCop || 0)}` },
        { k: 'Ehrenberg-Bass 95/5', v: `${eb.compradoresRequeridosPorLote || 0} cli./cosecha`, sub: `Activos: ${eb.clientesActivosActuales || 0} · Radar 95/5: ${eb.prospectosTotalesEnRadar95_5 || 0} · ${eb.proporcionBinetFieldB2B || ''}` },
        { k: 'Category Entry Points', v: '3 CEPs Activos', sub: (eb.categoryEntryPointsCEPs || []).slice(0, 2).join(' | '), warn: Number(appState.wowSimulation.params.sim_2_portafolio_b2b.colocacionRemanente48hPct) < 85 }
      ];
    }
    if (simId === 'sim_3_nutricion_capex') {
      const imp = res.impactoZootecnicoGalpon || {};
      const cards = [
        { k: 'FCR Proyectado en Galpón', v: `${Number(imp.fcrProyectadoGalpon || 0).toFixed(3)}`, sub: `Tabla Base: ${Number(imp.fcrBaseTabla || 0).toFixed(2)} · Delta ${Number(imp.deltaFcrTotal || 0).toFixed(3)}` },
        { k: 'Impacto Económico Proceso', v: cop(imp.ahorroOSobrecostoAlimentoLoteCop || 0), sub: `${Number(imp.diferenciaAlimentoKgLote || 0).toFixed(1)} kg alimento/lote` },
        { k: 'Calidad Física (PDI / Finos)', v: Number(appState.wowSimulation.params.sim_3_nutricion_capex.finosPct) > 15 ? 'ALERTA FINOS' : 'ÓPTIMO', sub: imp.diagnosticoCalidadFisica || '', warn: Number(appState.wowSimulation.params.sim_3_nutricion_capex.finosPct) > 15 },
        { k: 'Balance Electrolítico DEB', v: `${appState.wowSimulation.params.sim_3_nutricion_capex.balanceElectroliticoDebMeqKg} mEq/kg`, sub: imp.diagnosticoElectroliticoTermico || '' }
      ];
      if (!partnerScope && res.capexPlantaReservadoOwner) {
        const cx = res.capexPlantaReservadoOwner;
        cards.push({
          k: 'Proyección Privada CapEx (Owner)',
          v: `Payback ${cx.lotesEquivalentesPayback} lotes`,
          sub: `Ahorro/bulto ${cop(cx.ahorroNetoPorBulto40KgCop)} · Punto equilibrio ${cx.bultosPuntoEquilibrioCapex} bultos`
        });
      }
      return cards;
    }
    if (simId === 'sim_4_prefaena_frio') {
      const pf = res.evaluacionPrefaena || {};
      const cf = res.inocuidadYCadenaFrio || {};
      return [
        { k: 'Ventana de Ayuno Pre-Faena', v: pf.ventanaOptima ? 'ÓPTIMA (8-11,5h)' : 'DESVIADA', sub: pf.estadoAyuno || '', warn: !pf.ventanaOptima },
        { k: 'Merma & Pérdida Evitable', v: `${pf.mermaCarcasaVendiblePct || 0}% · ${pf.kgPerdidosPorMermaYDoa || 0} kg`, sub: `Impacto lote: -${cop(pf.perdidaEconomicaEvitableCop || 0)} · DOA ${pf.mortalidadTransporteDoaPct || 0}%` },
        { k: 'Riesgo Fecal / PSE', v: `Fecal ${pf.riesgoContaminacionFecalPct || 0}% · PSE ${pf.riesgoCarnePsePct || 0}%`, sub: `Hora captura ${appState.wowSimulation.params.sim_4_prefaena_frio.horaCaptura24h}:00h` },
        { k: 'Cadena de Frío ICA 3652', v: cf.cumpleNormaInocuidad0a4C ? `CUMPLE (${cf.tempCadenaFrioC}°C)` : `FUERA RANGO (${cf.tempCadenaFrioC}°C)`, sub: `Vida útil ~${cf.vidaUtilEstimadaDias || 0}d · ${cf.controlRiesgoMicrobiologico || ''}`, warn: !cf.cumpleNormaInocuidad0a4C }
      ];
    }
    const e52 = res.escenarios52Semanas || {};
    const est = e52.pesimistaEstres || {};
    const base = e52.baseEsperado || {};
    const pm = (res.preMortemGaryKlein || [])[0] || {};
    const tocStage = Array.isArray(res.mapaCuellosDeBotellaAnualTOC) ? res.mapaCuellosDeBotellaAnualTOC[0] : null;
    return [
      { k: 'Caja 52 Sem (Escenario Base)', v: cop(base.cajaAcumuladaSem52Cop || 0), sub: `${base.avesIniciadasAnual || 0} aves/año · Régimen estacionario ${cop(base.utilidadAnualRegimenEstacionarioCop || 0)}/año` },
      { k: 'Caja 52 Sem (Estrés Mercado)', v: cop(est.cajaAcumuladaSem52Cop || 0), sub: `${est.descripcion || ''} · Pico ${cop(est.picoCapitalMaximoCop || 0)}`, warn: !est.resilientePositivo },
      { k: 'Resiliencia TOC 12 Meses', v: est.resilientePositivo ? 'POSITIVA' : 'RIESGO CAJA', sub: (tocStage && `${tocStage.etapa}: ${tocStage.restriccionDominante}`) || 'Flujo semanal continuo', warn: Number(appState.wowSimulation.params.sim_5_anual_toc.cadenciaDias) <= 15 },
      { k: 'Pre-Mortem Prioritario', v: pm.fallaHipotetica || 'Vacío Sanitario', sub: `Gatillo: ${pm.gatilloAlertaTemprana || ''} · Hoy: ${pm.accionPreventivaHoy || ''}` }
    ];
  }

  function renderWowSimControls(simId) {
    const host = $('wow-sim-controls');
    if (!host) return;
    if (host.dataset.renderedSim === simId) return;
    host.dataset.renderedSim = simId;

    const cfg = WOW_SIM_CONFIGS[simId] || WOW_SIM_CONFIGS.sim_1_estirpes_thi;
    const params = appState.wowSimulation.params[simId];

    host.innerHTML = cfg.fields
      .map((f) => {
        const val = params[f.key];
        if (f.type === 'select') {
          return `
            <label class="wow-ctrl-item">
              <span>${escapeHtml(f.label)}</span>
              <select data-wow-key="${f.key}">
                ${f.options.map((o) => `<option value="${escapeHtml(o.value)}" ${val === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
              </select>
            </label>
          `;
        }
        return `
          <label class="wow-ctrl-item">
            <span>${escapeHtml(f.label)}: <strong data-wow-val="${f.key}">${val}${escapeHtml(f.unit || '')}</strong></span>
            <input type="range" data-wow-key="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" />
          </label>
        `;
      })
      .join('');

    host.querySelectorAll('[data-wow-key]').forEach((el) => {
      const evName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evName, () => {
        const key = el.dataset.wowKey;
        const fieldCfg = cfg.fields.find((x) => x.key === key);
        const parsed = el.tagName === 'SELECT' ? el.value : Number(el.value);
        appState.wowSimulation.params[simId][key] = parsed;
        const valBadge = host.querySelector(`[data-wow-val="${key}"]`);
        if (valBadge) valBadge.textContent = `${parsed}${(fieldCfg && fieldCfg.unit) || ''}`;
        runAndRenderWowSimulation(simId, getActiveSimulation());
      });
    });
  }

  function runAndRenderWowSimulation(simId, sim) {
    const activeSim = sim || getActiveSimulation();
    const state = activeSim.state;
    const computed = activeSim.computed;
    const partnerScope = isPartnerScope();
    const params = appState.wowSimulation.params[simId] || {};

    let res = null;
    if (simId === 'sim_1_estirpes_thi') {
      res = TwinEngine.simulateStrainAndClimateScenario(state, params);
      appState.wowSimulation.lastThiEfectivo = Number(res.microclimaElZulia?.thiEfectivo || 76);
    } else if (simId === 'sim_2_portafolio_b2b') {
      res = TwinEngine.simulatePortfolioAndPricingB2B(state, params);
    } else if (simId === 'sim_3_nutricion_capex') {
      res = TwinEngine.simulateFeedPlantAndNutritionCapex(state, { ...params, isOwner: !partnerScope });
    } else if (simId === 'sim_4_prefaena_frio') {
      res = TwinEngine.simulatePreSlaughterAndColdChain(state, params);
    } else {
      res = TwinEngine.simulateAnnualTocAndMarketRisk(state, {
        ...params,
        variacionPrecioAlimentoPct: Number(params.variacionPrecioAlimentoPct || 0) / 100,
        variacionPrecioCanalPct: Number(params.variacionPrecioCanalPct || 0) / 100
      });
    }
    appState.wowSimulation.lastResult = res;

    const grid = $('wow-sim-results-grid');
    if (grid) {
      const cards = buildWowKpiCards(simId, res, partnerScope);
      grid.innerHTML = cards
        .map((c) => `
          <div class="kpi-card ${c.warn ? 'wow-card-warn' : ''}">
            <div class="k">${escapeHtml(c.k)}</div>
            <div class="v">${escapeHtml(String(c.v))}</div>
            <div class="s">${escapeHtml(String(c.sub || ''))}</div>
          </div>
        `)
        .join('');
    }

    const toc = (computed && computed.av2 && computed.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, computed);
    if ($('vision-toc-active-pill') && toc && toc.primaryConstraint) {
      $('vision-toc-active-pill').textContent = `TOC Activa: ${toc.primaryConstraint.titulo} (~${cop(toc.throughputAccounting.throughputDiarioSistemaCop)}/día · ${cop(toc.throughputAccounting.throughputPorM2SeccionCop)}/m²)`;
    }

    const layersHost = $('vision-layers-grid');
    if (layersHost && toc && toc.capasEstrategicasVision) {
      const capas = Object.values(toc.capasEstrategicasVision);
      layersHost.innerHTML = capas
        .map((c) => `
          <div class="vision-layer-item">
            <div class="layer-title">${escapeHtml(c.capa || '')}</div>
            <div class="layer-body">${escapeHtml(c.diagnosticoVivo || '')}</div>
          </div>
        `)
        .join('');
    }

    const capHost = $('vision-learning-capsule');
    if (capHost) {
      const simCap = res && res.capsulaAprendizajeGerencial;
      const tocCap = toc && toc.capsulaAprendizajeGerencial;
      const capAuthor = (simCap && simCap.autor) || (tocCap && tocCap.concepto) || 'Visión · Excelencia Operacional';
      const capLesson = (simCap && simCap.leccion) || (tocCap && tocCap.explicacionPractica) || '';
      capHost.innerHTML = `
        <div class="capsule-title">🎓 Cápsula de Aprendizaje Gerencial · ${escapeHtml(capAuthor)}</div>
        <div class="capsule-body">${escapeHtml(capLesson)}</div>
      `;
    }

    // Detección local instantánea para señal espontánea de Visión en el lienzo vivo
    const liveReasons = [];
    const p1 = appState.wowSimulation.params.sim_1_estirpes_thi;
    const p2 = appState.wowSimulation.params.sim_2_portafolio_b2b;
    const p3 = appState.wowSimulation.params.sim_3_nutricion_capex;
    const p4 = appState.wowSimulation.params.sim_4_prefaena_frio;
    const p5 = appState.wowSimulation.params.sim_5_anual_toc;
    if (Number(appState.wowSimulation.lastThiEfectivo) >= 78) {
      liveReasons.push(`THI proyectado ${appState.wowSimulation.lastThiEfectivo} en El Zulia (${p1.tempC}°C / ${p1.humedadRelPct}% HR): riesgo de jadeo y menor conversión.`);
    }
    if (Number(p2.colocacionRemanente48hPct) < 85) {
      liveReasons.push(`Colocación de remanente <48h en ${p2.colocacionRemanente48hPct}%: peligro de congestión de frío del 66% fuera de pechuga.`);
    }
    if (Number(p3.finosPct) > 15) {
      liveReasons.push(`Exceso de finos (${p3.finosPct}%) en alimento: pérdida silenciosa de FCR en tolva.`);
    }
    if (Number(p4.horasAyunoTotal) < 8 || Number(p4.horasAyunoTotal) > 11.5) {
      liveReasons.push(`Ayuno pre-faena en ${p4.horasAyunoTotal}h (fuera de ventana 8–11,5h): riesgo directo de merma o contaminación fecal.`);
    }
    if (Number(p5.cadenciaDias) <= 15) {
      liveReasons.push(`Cadencia acelerada cada ${p5.cadenciaDias} días: vigilar vacío sanitario >=7 días entre camadas.`);
    }
    if (liveReasons.length > 0) {
      applyVisionSpontaneousState({
        shouldInterveneSpontaneously: true,
        severity: liveReasons.some((r) => /THI|Colocación|Cadencia/.test(r)) ? 'alta' : 'media',
        triggerReasons: liveReasons
      });
    } else if (!appState.wowSimulation.lastSpontaneous || !appState.wowSimulation.lastSpontaneous.fromBackend) {
      applyVisionSpontaneousState(null);
    }
  }

  function renderWowSimulationsSuite(sim) {
    const activeSimId = appState.wowSimulation.activeSimId || 'sim_1_estirpes_thi';
    document.querySelectorAll('#wow-sim-tabs .wow-sim-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.wowSim === activeSimId);
    });
    renderWowSimControls(activeSimId);
    runAndRenderWowSimulation(activeSimId, sim);
  }

  function renderAv2Operations(activeComputed) {
    const lotes = activeComputed.av2.lotes || [];
    const tes = activeComputed.av2.tesoreriaResumen;
    const cierres = activeComputed.av2.cierresComercialesLotes || {};
    const cont = activeComputed.av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18, lotesAdicionales: 3 }, lotesProyectados: [], flujoCajaContinuoSemanal: [], saldoFinalContinuo: tes.saldoFinalPost4m, semanasTotales: 11 };
    const isCont = appState.cashflowHorizon === 'continuo' && (cont.flujoCajaContinuoSemanal || []).length > 0;
    const util3Mix = (cierres['lote-1']?.utilidadEfectiva ?? lotes[0].utilidadCanal)
      + (cierres['lote-2']?.utilidadEfectiva ?? lotes[1].utilidadCanal)
      + (cierres['lote-3']?.utilidadEfectiva ?? lotes[2].utilidadCanal);

    const gov = activeComputed.av2.gobiernoEjecutivo || {};
    const ac = gov.escenarioAcido || {};
    const tv = gov.tesoreriaViva || {};
    const ry = gov.riesgosYDecisiones || {};
    const cons3Ref = activeComputed.av2.consolidado3Lotes || {};

    const kpiInd = activeComputed.av2.kpiIndustriales || {};
    const picoMostrar = isCont ? (kpiInd.picoCapitalContinuoSem7 || tes.capitalTrabajoPicoSem7) : tes.capitalTrabajoPicoSem7;
    const picoFechaM3 = tv.picoReferenciaCorta || '23-dic (Víspera 1.ª cosecha · D41 L1)';
    const pbFechaM3 = isCont ? (tv.paybackContinuoFechaCorta || '06-feb') : (tv.payback3LotesFechaCorta || '15-ene');
    const finalFechaM3 = tv.cajaFinalContFechaCorta || '20-mar';
    $('av2-summary-badges').innerHTML = `
      <span class="pill ok">Utilidad 3 Lotes: ${cop(util3Mix)}</span>
      <span class="pill accent">${isCont ? `Caja Continua (al ${finalFechaM3}): ${cop(cont.saldoFinalContinuo)}` : `Caja Libre Post-4m (30-ene): ${cop(tes.saldoFinalPost4m)}`}</span>
    `;
    $('cashflow-peak-pill').textContent = `Tope caja ${picoFechaM3}: -${cop(picoMostrar)} (Payback ${pbFechaM3})`;

    if ($('radiografia-costos-grid')) {
      const pr = kpiInd.prorrateoKgCanal3Lotes || lotes[0].prorrateoKgCanal || {};
      if ($('radiografia-pe-pill')) {
        $('radiografia-pe-pill').textContent = `Equilibrio: ${cop(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695)}/kg · Piso en Pie: ${cop(kpiInd.precioIndiferenciaCanalVsVivo || 9577)}/kg`;
      }
      const neto3Pct = (Number(cons3Ref.margenCanal || 0.331) * 100).toFixed(1);
      $('radiografia-costos-grid').innerHTML = `
        <div class="kpi-card">
          <div class="kpi-label">Costo Vivo vs Canal (3 Lotes)</div>
          <div class="kpi-value">${cop(kpiInd.costoKgVivo3Lotes || 5848)} → ${cop(kpiInd.costoKgCanal3Lotes || 7695)}</div>
          <div class="kpi-sub">Lote 1 canal: ${cop(lotes[0].costoKgCanal)}/kg · Cont. 900: ${cop(cont.loteModelo?.costoKgCanal || 7021)}/kg</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">% Alimento (KPI Rey Avícola)</div>
          <div class="kpi-value">${((kpiInd.alimentoPctSobreCostoCanal3Lotes || 0.572) * 100).toFixed(1)}% canal</div>
          <div class="kpi-sub">${((kpiInd.alimentoPctSobreCostoVivo3Lotes || 0.62) * 100).toFixed(1)}% sobre costo vivo · Pollito + Insumos: ${cop((pr.pollito || 0) + (pr.insumos || 0))}/kg</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Prorrateo $/kg Canal (3 Lotes)</div>
          <div class="kpi-value">${cop(pr.alimento || 4398)} alim.</div>
          <div class="kpi-sub">Pollito ${cop(pr.pollito || 1483)} · Beneficio ${cop(pr.sacrificio || 607)} · Arriendo+MO ${cop((pr.arriendo || 427) + (pr.manoObra || 226))}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Margen y Utilidad / Pollo (Base vs Ácido)</div>
          <div class="kpi-value">+${cop(kpiInd.utilidadPorAveFin3Lotes || 9401)}/ave</div>
          <div class="kpi-sub">Bruto: ${((kpiInd.margenBruto3LotesPct || 0.388) * 100).toFixed(1)}% · Neto: ${neto3Pct}% · Piso ácido 3L: <strong>${cop(ac.utilidadAcida3LCop || 14041918)}</strong> · P.E. fijos: ~${kpiInd.puntoEquilibrioMensualAvesFijos || 145} aves/mes</div>
        </div>
      `;
    }

    if ($('btn-flow-horizon-cont')) $('btn-flow-horizon-cont').classList.toggle('active', isCont);
    if ($('btn-flow-horizon-11')) $('btn-flow-horizon-11').classList.toggle('active', !isCont);
    if ($('cashflow-panel-title')) {
      $('cashflow-panel-title').textContent = isCont
        ? `Flujo de Caja Semanal Continuo (Semanas 1 a ${cont.semanasTotales} · Lotes 1–3 + Lotes 4–${3 + (cont.lotesProyectados || []).length} de ${cont.config.avesPorLote} aves)`
        : 'Flujo de Caja Semanal Acumulado (Primeros 3 Lotes · Semanas 1 a 11)';
    }

    const activeMixId = appState.mixSelectedLote || 'lote-1';
    const curMix = cierres[activeMixId] || cierres['lote-1'];
    const rawMixCfg = (appState.officialState?.ajustesVentaLotes && appState.officialState.ajustesVentaLotes[activeMixId]) || {};
    if ($('sel-mix-lote') && document.activeElement !== $('sel-mix-lote')) $('sel-mix-lote').value = activeMixId;
    if ($('inp-mix-aves') && document.activeElement !== $('inp-mix-aves')) $('inp-mix-aves').value = rawMixCfg.tramoEspecialAves || 0;
    if ($('inp-mix-precio-esp') && document.activeElement !== $('inp-mix-precio-esp')) $('inp-mix-precio-esp').value = rawMixCfg.precioTramoEspecialKg || 13000;
    if ($('inp-mix-precio-resto') && document.activeElement !== $('inp-mix-precio-resto')) $('inp-mix-precio-resto').value = rawMixCfg.precioRestoKg || '';
    if ($('mix-closure-summary') && curMix) {
      $('mix-closure-summary').innerHTML = curMix.hasOverride
        ? `<strong>${escapeHtml(activeMixId.toUpperCase())}:</strong> ${curMix.tramoEspecialAves} pollos @ ${cop(curMix.precioTramoEspecialKg)}/kg + ${curMix.avesResto} pollos @ ${cop(curMix.precioRestoKg)}/kg -> Ingreso ${cop(curMix.ingresoEfectivo)} | <strong>Utilidad neta ${cop(curMix.utilidadEfectiva)}</strong> (${curMix.deltaVsBaseCop >= 0 ? `+${cop(curMix.deltaVsBaseCop)}` : cop(curMix.deltaVsBaseCop)} vs base).`
        : `<strong>${escapeHtml(activeMixId.toUpperCase())} en precio uniforme (${cop(curMix.precioPromedioRealKg)}/kg):</strong> ${curMix.avesFin} pollos -> Utilidad neta <strong>${cop(curMix.utilidadEfectiva)}</strong>. Escribe un tramo especial arriba para simular precios mixtos.`;
    }

    if ($('inp-cont-aves') && document.activeElement !== $('inp-cont-aves')) $('inp-cont-aves').value = cont.config.avesPorLote;
    if ($('inp-cont-cadencia') && document.activeElement !== $('inp-cont-cadencia')) $('inp-cont-cadencia').value = cont.config.cadenciaDias;
    if ($('inp-cont-lotes') && document.activeElement !== $('inp-cont-lotes')) $('inp-cont-lotes').value = cont.config.lotesAdicionales;
    if ($('cont-cycle-summary')) {
      const lpFirst = (cont.lotesProyectados || [])[0];
      const lpLast = (cont.lotesProyectados || [])[(cont.lotesProyectados || []).length - 1];
      const vacioSan = (3 * Number(cont.config.cadenciaDias || 18)) - Number(cont.config.edadObjetivoDias || 42);
      const dens900 = Number(ry.densidad900SeccionKgM2 || 28.0);
      const vacioTxt = vacioSan < 7
        ? `<strong style="color:var(--rose);">Vacío san.: ${vacioSan}d (&lt;7d ALERTA)</strong>`
        : `<strong>Vacío san.: ${vacioSan}d</strong>`;
      const densTxt = dens900 > 24
        ? `<strong style="color:var(--amber);"> · ${dens900.toFixed(1)} kg/m² (entresaca ${ry.avesEntresaca900 || 187} aves)</strong>`
        : ` · ${dens900.toFixed(1)} kg/m²`;
      const anualFarmM3 = TwinEngine.simulateAnnualTocAndMarketRisk
        ? TwinEngine.simulateAnnualTocAndMarketRisk(appState.officialState, { avesPorLote: cont.config.avesPorLote || 900, cadenciaDias: cont.config.cadenciaDias || 18 })
        : null;
      const caja52M3 = anualFarmM3?.proyeccion52Semanas?.saldoCajaNetoSemana52Cop;
      const regAnualM3 = anualFarmM3?.proyeccion52Semanas?.utilidadEstacionariaAnualCop;
      const netoArrTxt = tv.utilLoteContNetoArr ? ` · Neto c/arriendo: <strong>${cop(tv.utilLoteContNetoArr)}/lote</strong>` : '';
      const anualTxt = caja52M3 ? ` · <strong>Proy. 12m granja (52 sem):</strong> ${cop(caja52M3)} (${cop(regAnualM3)}/año reg.)` : '';
      $('cont-cycle-summary').innerHTML = lpFirst && lpLast
        ? `${vacioTxt}${densTxt}${netoArrTxt} · Cierre ${lpLast.nombre}: ${lpLast.fechaSalida} · Caja al ${finalFechaM3}: ${cop(cont.saldoFinalContinuo)}${anualTxt}`
        : '';
    }

    const baseRows = lotes.map((l) => {
      const cMix = cierres[l.id] || { ingresoEfectivo: l.ingresoCanal, utilidadEfectiva: l.utilidadCanal, hasOverride: false };
      return `
        <div class="lot-row">
          <div>
            <strong>${escapeHtml(l.nombre)}${cMix.hasOverride ? ' <span class="pill accent">Mixto</span>' : ''}</strong>
            <div class="muted" style="font-size:0.78rem;">${l.fechaIngreso} → ${l.fechaSalida} (${l.edadDias} días · ${escapeHtml(l.programaAlimento)})</div>
          </div>
          <div>
            <div class="muted" style="font-size:0.74rem;">Aves Finales / Carne</div>
            <div class="num"><strong>${l.avesFin}</strong> / ${l.kgCanalVend.toFixed(0)} kg</div>
          </div>
          <div>
            <div class="muted" style="font-size:0.74rem;">Inversión Canal</div>
            <div class="num">${cop(l.costoCanalTot)}</div>
          </div>
          <div>
            <div class="muted" style="font-size:0.74rem;">Utilidad Neta</div>
            <div class="num" style="color:var(--emerald); font-weight:700;">${cop(cMix.utilidadEfectiva)}</div>
          </div>
        </div>
      `;
    });

    const arrProrrCont = Number(tv.arriendoProrrateadoContCop || 591781);
    const dens900Cont = Number(ry.densidad900SeccionKgM2 || 28.0);
    const contRows = isCont
      ? (cont.lotesProyectados || []).map((lp) => {
          const netoConArr = lp.utilidadBrutaPreArriendo - arrProrrCont;
          return `
          <div class="lot-row" style="border-style:dashed; opacity:0.92;">
            <div>
              <strong>${escapeHtml(lp.nombre)} <span class="pill ${dens900Cont > 24 ? 'warn' : 'ok'}">c/${cont.config.cadenciaDias}d · ${dens900Cont.toFixed(1)} kg/m²</span></strong>
              <div class="muted" style="font-size:0.78rem;">${lp.fechaIngreso} (Sem ${lp.semanaIngreso}) → ${lp.fechaSalida} (Sem ${lp.semanaSalida})</div>
            </div>
            <div>
              <div class="muted" style="font-size:0.74rem;">Aves Finales / Carne</div>
              <div class="num"><strong>${lp.avesFin}</strong> / ${lp.kgCanalVend.toFixed(0)} kg</div>
            </div>
            <div>
              <div class="muted" style="font-size:0.74rem;">Costo Directo (+Arr. prorr.)</div>
              <div class="num">${cop(lp.costoDirectoSinArriendo)} (+${copShort(arrProrrCont)})</div>
            </div>
            <div>
              <div class="muted" style="font-size:0.74rem;">Neto Est. (c/Arriendo prorr.)</div>
              <div class="num" style="color:var(--emerald); font-weight:700;">${cop(netoConArr)} <small class="muted" style="font-weight:400;">(${cop(lp.utilidadBrutaPreArriendo)} pre-arr.)</small></div>
            </div>
          </div>
        `;
        })
      : [];

    $('lots-timeline-list').innerHTML = [...baseRows, ...contRows].join('');

    // SVG Flujo de Caja Semanal (Dinámico: 11 Semanas o Continuo Lotes 4-6+)
    const weeks = isCont ? (cont.flujoCajaContinuoSemanal || []) : (activeComputed.av2.flujoCajaSemanal || []);
    const maxAbs = Math.max(
      1,
      ...weeks.map((w) => Math.abs(w.saldoAcumulado))
    );
    const colW = weeks.length > 14 ? 44 : 72;
    const barWidth = weeks.length > 14 ? 30 : 46;
    const svgW = Math.max(880, 72 + weeks.length * colW);
    const svgH = 228;
    const midY = 122;
    const maxH = 88;

    const weekEls = weeks
      .map((w, idx) => {
        const x = 36 + idx * colW;
        const val = w.saldoAcumulado;
        const barH = Math.max(6, Math.round((Math.abs(val) / maxAbs) * maxH));
        const y = val >= 0 ? midY - barH : midY;
        const isPeak = w.semana === 7;
        const fill = isPeak ? '#f59e0b' : val >= 0 ? '#10b981' : '#f43f5e';
        const shortM = `${val < 0 ? '-' : '+'}${(Math.abs(val) / 1e6).toFixed(1)}M`;
        const tickDate = extractWeekTickLabel(w);
        const tickLabel = weeks.length > 14 && idx % 2 === 1 && !isPeak && idx !== weeks.length - 1 ? `S${w.semana}` : tickDate;
        return `
          <g class="cf-bar-group" data-week-idx="${idx}" style="cursor:pointer;">
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="5" fill="${fill}" opacity="0.88" />
            <text x="${x + barWidth / 2}" y="${val >= 0 ? y - 5 : y + barH + 12}" text-anchor="middle" fill="currentColor" font-size="${weeks.length > 14 ? '9.2' : '10.5'}" font-weight="700">${shortM}</text>
            <text x="${x + barWidth / 2}" y="${svgH - 6}" text-anchor="middle" fill="${isPeak ? '#f59e0b' : '#94a3b8'}" font-weight="${isPeak ? '800' : '600'}" font-size="${weeks.length > 14 ? '8.2' : '9.2'}">${escapeHtml(tickLabel)}</text>
          </g>
        `;
      })
      .join('');

    $('chart-cashflow-box').innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="Flujo de caja acumulado semanal">
        <line x1="20" y1="${midY}" x2="${svgW - 20}" y2="${midY}" stroke="rgba(148,163,184,0.45)" stroke-width="1.2" />
        ${weekEls}
      </svg>
    `;

    $('chart-cashflow-box')
      .querySelectorAll('.cf-bar-group')
      .forEach((g) => {
        const show = () => {
          $('chart-cashflow-box')
            .querySelectorAll('.cf-bar-group.active')
            .forEach((el) => el.classList.remove('active'));
          g.classList.add('active');
          const w = weeks[Number(g.dataset.weekIdx)];
          if (!w) return;
          $('cashflow-hover-bar').innerHTML = `
            <strong>${escapeHtml(w.etiqueta)}</strong>
            <span class="num">Ingresos: ${cop(w.ingresos)} · Pollitos/Insumos: ${cop(w.pollitosInsumos)} · Alimento: ${cop(w.alimento)} · Fijos/Benef: ${cop(w.fijosBenef)} · <strong>Saldo Acumulado: ${cop(w.saldoAcumulado)}</strong></span>
          `;
        };
        g.addEventListener('mouseenter', show);
        g.addEventListener('click', show);
      });
  }

  function renderAv1AnnualAndPropio(activeComputed) {
    const pte = activeComputed.av2.puenteAlimentoPropio;
    const anual = activeComputed.av1.anual12Meses;
    const cons = anual.consolidado;

    const utilCostAnual = cons.costoCanalTot > 0 ? (cons.utilidadCanal / cons.costoCanalTot) * 100 : 0;
    $('ahorro-propio-pill').textContent = `Ahorro +${cop(activeComputed.av1.ahorroPropioVsComercialCop)} / lote`;
    $('anual-roi-pill').textContent = `ROI Pico Rot.: ${(cons.roiAnualSobrePico * 100).toFixed(1)}% · Margen ${(cons.margenAnual * 100).toFixed(1)}%`;

    $('puente-alimento-cards').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Concentrado Comercial</div>
        <div class="kpi-value">${cop(pte.precioComercialKg)}/kg</div>
        <div class="kpi-sub">Bulto 40 kg en granja</div>
      </div>
      <div class="kpi-card highlight">
        <div class="kpi-label">Harina Propia Ajustada (+3,8%)</div>
        <div class="kpi-value">${cop(pte.harinaEfectivaKg)}/kg</div>
        <div class="kpi-sub">Ahorro neto: <strong>${(pte.ahorroNetoPropioPct * 100).toFixed(1)}%</strong> (${cop(pte.ahorroPorBultoEquivCop)}/bulto equiv.)</div>
      </div>
    `;

    $('anual-summary-cards').innerHTML = `
      <div class="kpi-card highlight">
        <div class="kpi-label">Utilidad Neta 12 Meses</div>
        <div class="kpi-value">${cop(cons.utilidadCanal)}</div>
        <div class="kpi-sub">${cons.avesInic.toLocaleString('es-CO')} aves inic. / ${cons.avesFin.toLocaleString('es-CO')} vendidas · s/costo ${utilCostAnual.toFixed(1)}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Capital Pico Rotativo (1 Camada)</div>
        <div class="kpi-value">${cop(cons.capitalPicoRotativo)}</div>
        <div class="kpi-sub">Gasto total año: ${cop(cons.costoCanalTot)} · Ingresos: ${cop(cons.ingresoCanal)} · Arr: ${cop(cons.arriendoTotal)}</div>
      </div>
    `;

    $('tbody-anual-camadas').innerHTML = (anual.camadas || [])
      .map(
        (c) => `
        <tr>
          <td><strong>${escapeHtml(c.nombre)}</strong></td>
          <td class="num-cell">${c.avesInic}</td>
          <td>${escapeHtml(c.dieta)}</td>
          <td class="num-cell">${c.mesesArriendo}m</td>
          <td class="num-cell">${cop(c.costoCanalTot)}</td>
          <td class="num-cell">${cop(c.ingresoCanal)}</td>
          <td class="num-cell" style="color:var(--emerald); font-weight:700;">${cop(c.utilidadCanal)}</td>
          <td class="num-cell">${cop(c.utilidadAcumuladaAnio)}</td>
        </tr>
      `
      )
      .join('');
  }

  function renderBitacoraAndPesajes(activeComputed) {
    const bit = activeComputed.av2.bitacora;
    const est = (activeComputed.av2.gobiernoEjecutivo && activeComputed.av2.gobiernoEjecutivo.estadoCampoHoy) || {};
    const diaHoy = est.diaCicloL1 || getCurrentCycleDay(appState.officialState);
    if ($('bitacora-dia-actual-pill')) {
      $('bitacora-dia-actual-pill').textContent = `Hoy: Día ${diaHoy} / 42`;
    }
    if ($('inp-dia') && document.activeElement !== $('inp-dia') && !appState.dailyDiaTouched) {
      $('inp-dia').value = String(diaHoy);
    }
    const diasRep = est.diasReportadosEnVentana ?? bit.diasRegistrados;
    const diasTrans = est.diasTranscurridos ?? diaHoy;
    const sinRep = est.diasSinReporte ?? Math.max(0, diasTrans - diasRep);
    $('bitacora-kpi-pills').innerHTML = `
      <span class="pill ${sinRep > 0 ? 'danger' : 'ok'}">${sinRep > 0 ? `⚠️ ${diasRep}/${diasTrans}d reportados` : `✓ ${diasRep}/${diasTrans}d al día`}</span>
      <span class="pill accent">Vivos hoy: ${bit.avesVivasRealesHoy} (recib. ${bit.avesRecibidasReales ?? 603} · comp. ${bit.avesNominalesCompradas ?? 600}) · Cons. teór. ${Number(est.consumoTeoricoAcumLoteKg || 39.8).toFixed(1).replace('.', ',')} kg</span>
      <span class="pill ${bit.bajasAcumReales > 18 ? 'danger' : 'ok'}">Bajas: ${bit.bajasAcumReales} / 18 meta</span>
      <span class="pill accent">Proy. 42d (${bit.fechaSacrificio}): ${bit.avesFinEfectivas}</span>
      ${bit.ratioAguaPromedio !== null ? `<span class="pill accent">Agua:Alim ${bit.ratioAguaPromedio.toFixed(2)} L/kg</span>` : ''}
    `;

    $('tbody-pesajes').innerHTML = (bit.pesajes || [])
      .map((p) => {
        const hasReal = p.pesoRealG !== null && p.pesoRealG !== undefined;
        return `
          <tr>
            <td><strong>D${p.dia}</strong> (${p.fecha})</td>
            <td class="num-cell">${p.metaRossG} g</td>
            <td class="num-cell">${hasReal ? `${p.pesoRealG.toFixed(0)} g` : '—'}</td>
            <td class="num-cell">${hasReal && p.difVsRossPct !== null ? `${(p.difVsRossPct * 100).toFixed(1)}%` : '—'}</td>
            <td class="num-cell">${p.fcrReal !== null ? `${p.fcrReal.toFixed(2)}${p.iep ? ` · IEP ${Math.round(p.iep)}` : ''}` : `Pend. (meta ${p.fcrMetaRoss.toFixed(2)})`}</td>
          </tr>
        `;
      })
      .join('');

    const keyDays = new Set([1, 7, 14, 21, 28, 35, 40, 42, 45, 48, 49]);
    const rows = (bit.dias || []).filter(
      (d) =>
        d.dia <= diaHoy ||
        keyDays.has(d.dia) ||
        d.tieneRegistro ||
        d.tieneNotaUsuario ||
        d.alimRealKg !== null ||
        (d.mortalidad || 0) > 0 ||
        (d.descarte || 0) > 0 ||
        d.tempC !== null ||
        d.aguaL !== null
    );

    $('tbody-bitacora').innerHTML = rows
      .map((d) => {
        const missingElapsed = d.dia <= diaHoy && !d.tieneRegistro;
        const obsTxt = d.observacion
          ? escapeHtml(d.observacion)
          : (missingElapsed ? '<span class="pill danger">⚠️ Sin reporte</span>' : '');
        const obsFinal = missingElapsed && d.observacion
          ? `<span class="pill danger" style="margin-right:4px;">Sin reporte</span>${escapeHtml(d.observacion)}`
          : obsTxt;
        return `
        <tr>
          <td><strong>D${d.dia}</strong>${d.dia === diaHoy ? ' <span class="pill accent">Hoy</span>' : ''} · ${d.fecha}</td>
          <td>${escapeHtml(d.etapa)}</td>
          <td class="num-cell">${d.avesVivas}</td>
          <td class="num-cell">${missingElapsed ? '—' : Number(d.mortalidad || 0) + Number(d.descarte || 0)}</td>
          <td class="num-cell">${d.pesoRossG} g / ${d.estHatoKg.toFixed(1)} kg</td>
          <td class="num-cell">${d.alimRealKg !== null ? `${d.alimRealKg.toFixed(1)} kg` : '—'}</td>
          <td class="num-cell">${d.tempC !== null ? `${d.tempC}°C` : '—'} / ${d.aguaL !== null ? `${d.aguaL}L` : '—'}</td>
          <td>${obsFinal}</td>
        </tr>
      `;
      })
      .join('');

    renderPreChristmasGrowthCurve(activeComputed);
  }

  function renderPreChristmasGrowthCurve(activeComputed) {
    const chartBox = $('growth-curve-chart-box');
    const kpiBox = $('growth-curve-kpis');
    if (!chartBox || !kpiBox) return;

    const targetDay = Number(appState.growthTargetDay || 40);
    const maxDay = Math.max(42, targetDay);
    const bit = (activeComputed.av2 && activeComputed.av2.bitacora) || { dias: [], pesajes: [], ultimoPesoReal: null };
    const est = (activeComputed.av2 && activeComputed.av2.gobiernoEjecutivo && activeComputed.av2.gobiernoEjecutivo.estadoCampoHoy) || {};
    const diaHoy = Math.max(1, Math.min(42, Number(est.diaCicloL1 || 4)));
    const daysArr = Array.isArray(bit.dias) ? bit.dias : [];
    const climaFactor = 1 + Number((appState.officialState?.parametrosGenerales?.factorClimaCucutaPct) || 0);
    const rendCanalPct = Number((appState.officialState?.parametrosGenerales?.rendimientoCanalConMenudPct) || 0.825);
    const rossArr = (TwinEngine && Array.isArray(TwinEngine.ROSS_PESO_G)) ? TwinEngine.ROSS_PESO_G : [];

    const points = [];
    for (let d = 1; d <= maxDay; d++) {
      const refRow = daysArr[d - 1] || {};
      const fecha = refRow.fecha || `D${d}`;
      const metaG = Math.round((rossArr[d] || refRow.pesoRossG || 60) * climaFactor);
      points.push({ dia: d, fecha, metaG });
    }

    const pesajesMap = new Map();
    (bit.pesajes || []).forEach((p) => {
      if (p.pesoRealG !== null && p.pesoRealG !== undefined) {
        pesajesMap.set(Number(p.dia), p);
      }
    });

    const metaHoyObj = points[diaHoy - 1] || { metaG: 118, fecha: '2026-11-16' };
    const targetObj = points[targetDay - 1] || { metaG: 2792, fecha: '2026-12-22' };
    const diasRestantes = Math.max(0, targetDay - diaHoy);
    const ultimoReal = bit.ultimoPesoReal;
    const ratioVsRoss = ultimoReal && rossArr[ultimoReal.diaCiclo]
      ? ultimoReal.pesoPromedioG / Math.max(1, rossArr[ultimoReal.diaCiclo] * climaFactor)
      : 1;
    const desvPctStr = ultimoReal
      ? `${((ratioVsRoss - 1) * 100) >= 0 ? '+' : ''}${((ratioVsRoss - 1) * 100).toFixed(1)}% vs meta`
      : 'Sin pesaje real aún';
    const proyCierreG = Math.round(targetObj.metaG * ratioVsRoss);
    const canalTargetKg = ((targetObj.metaG / 1000) * rendCanalPct).toFixed(2);
    const fechaMetaLbl = targetDay === 40 ? '22-dic (Pre-Navidad)' : '24-dic (6 sem)';

    if ($('btn-target-dec22')) $('btn-target-dec22').classList.toggle('active', targetDay === 40);
    if ($('btn-target-dec24')) $('btn-target-dec24').classList.toggle('active', targetDay === 42);

    kpiBox.innerHTML = `
      <div class="growth-kpi-tile">
        <div class="gk-lbl">Hoy · Día ${diaHoy}/${targetDay} (${escapeHtml(metaHoyObj.fecha)})</div>
        <div class="gk-val">Meta hoy: ${metaHoyObj.metaG} g/ave</div>
        <div class="gk-sub">Faltan <strong>${diasRestantes} días</strong> a ${fechaMetaLbl}</div>
      </div>
      <div class="growth-kpi-tile">
        <div class="gk-lbl">Meta Sacrificio (${fechaMetaLbl})</div>
        <div class="gk-val">${(targetObj.metaG / 1000).toFixed(2)} kg vivo · ${canalTargetKg} kg canal</div>
        <div class="gk-sub">Con menudencias · Muestra 30 aves: ${((targetObj.metaG * 30) / 1000).toFixed(1)} kg</div>
      </div>
      <div class="growth-kpi-tile">
        <div class="gk-lbl">Último Pesaje Real vs Curva</div>
        <div class="gk-val" style="color:${ultimoReal ? (ratioVsRoss >= 0.97 ? 'var(--emerald)' : 'var(--rose)') : 'var(--amber)'};">${ultimoReal ? `${Math.round(ultimoReal.pesoPromedioG)} g (D${ultimoReal.diaCiclo})` : 'Pend. D7 (19-nov)'}</div>
        <div class="gk-sub">${ultimoReal ? `${desvPctStr} · Proy. D${targetDay}: ${(proyCierreG / 1000).toFixed(2)} kg` : 'Primer pesaje 30 pollos meta 6,03 kg (201 g/ave)'}</div>
      </div>
      <div class="growth-kpi-tile">
        <div class="gk-lbl">Guía Manejo Meta 22-Dic</div>
        <div class="gk-val">Agua fresca + alimento nocturno</div>
        <div class="gk-sub">Electrolitos/Vit C en calor; si usas melaza en agua, lavar líneas diario.</div>
      </div>
    `;

    const w = 840;
    const h = 232;
    const padL = 56;
    const padR = 28;
    const padT = 24;
    const padB = 34;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const maxY = Math.max(3200, targetObj.metaG * 1.12, proyCierreG * 1.05);
    const xOf = (d) => padL + ((d - 1) / Math.max(1, maxDay - 1)) * plotW;
    const yOf = (g) => padT + ((maxY - g) / Math.max(1, maxY)) * plotH;

    const curvePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${xOf(p.dia).toFixed(1)},${yOf(p.metaG).toFixed(1)}`).join(' ');
    const areaPath = `${curvePath} L${xOf(maxDay).toFixed(1)},${(padT + plotH).toFixed(1)} L${xOf(1).toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

    const measuredPts = [];
    pesajesMap.forEach((p, d) => {
      if (d <= maxDay) measuredPts.push({ dia: d, fecha: p.fecha, pesoG: Math.round(p.pesoRealG), metaG: Math.round(p.metaRossG), difPct: p.difVsRossPct });
    });
    measuredPts.sort((a, b) => a.dia - b.dia);
    const realLinePath = measuredPts.length
      ? [`M${xOf(1).toFixed(1)},${yOf(points[0].metaG).toFixed(1)}`, ...measuredPts.map((m) => `L${xOf(m.dia).toFixed(1)},${yOf(m.pesoG).toFixed(1)}`)].join(' ')
      : '';

    const hitos = [1, 7, 14, 21, 28, 35, 40, 42];
    const gridYs = [500, 1000, 1500, 2000, 2500, 3000].filter((v) => v <= maxY);

    chartBox.innerHTML = `
      <svg class="chart-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva diaria de peso objetivo Ross 308 hasta Pre-Navidad">
        <defs>
          <linearGradient id="growthAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(56,189,248,0.28)" />
            <stop offset="100%" stop-color="rgba(56,189,248,0.02)" />
          </linearGradient>
        </defs>
        ${gridYs.map((yv) => `
          <line x1="${padL}" y1="${yOf(yv).toFixed(1)}" x2="${w - padR}" y2="${yOf(yv).toFixed(1)}" stroke="rgba(148,163,184,0.16)" stroke-dasharray="3 3" />
          <text x="${padL - 8}" y="${(yOf(yv) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8">${(yv / 1000).toFixed(1)}kg</text>
        `).join('')}
        <path d="${areaPath}" fill="url(#growthAreaGrad)" />
        <path d="${curvePath}" fill="none" stroke="#38bdf8" stroke-width="2.4" stroke-dasharray="6 4" />
        ${realLinePath ? `<path d="${realLinePath}" fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}

        <!-- Línea vertical HOY -->
        <line x1="${xOf(diaHoy).toFixed(1)}" y1="${padT}" x2="${xOf(diaHoy).toFixed(1)}" y2="${padT + plotH}" stroke="#f59e0b" stroke-width="1.6" stroke-dasharray="3 3" />
        <text x="${Math.max(padL + 30, xOf(diaHoy)).toFixed(1)}" y="${padT - 6}" text-anchor="middle" font-size="9" font-weight="700" fill="#fbbf24">HOY D${diaHoy} (${metaHoyObj.metaG}g)</text>

        <!-- Línea vertical Meta Sacrificio (22-dic o 24-dic) -->
        <line x1="${xOf(targetDay).toFixed(1)}" y1="${padT}" x2="${xOf(targetDay).toFixed(1)}" y2="${padT + plotH}" stroke="#10b981" stroke-width="2" />
        <text x="${Math.min(w - padR - 4, xOf(targetDay)).toFixed(1)}" y="${padT + 11}" text-anchor="end" font-size="9" font-weight="800" fill="#34d399">META ${targetDay === 40 ? '22-DIC D40' : '24-DIC D42'} · ${(targetObj.metaG / 1000).toFixed(2)}kg</text>

        <!-- Hitos semanales interactivos -->
        ${hitos.map((hd) => {
          const p = points[hd - 1];
          if (!p) return '';
          const realRec = pesajesMap.get(hd);
          const x = xOf(hd);
          const yMeta = yOf(p.metaG);
          const isTarget = hd === targetDay;
          return `
            <g class="growth-node" data-gd="${hd}" style="cursor:pointer;" tabindex="0">
              <line x1="${x.toFixed(1)}" y1="${padT + plotH}" x2="${x.toFixed(1)}" y2="${padT + plotH + 4}" stroke="#64748b" />
              <text x="${x.toFixed(1)}" y="${h - 16}" text-anchor="middle" font-size="8.5" font-weight="${isTarget ? '800' : '600'}" fill="${isTarget ? '#34d399' : '#94a3b8'}">D${hd}</text>
              <text x="${x.toFixed(1)}" y="${h - 6}" text-anchor="middle" font-size="7.5" fill="#64748b">${escapeHtml(String(p.fecha).slice(5))}</text>
              <circle cx="${x.toFixed(1)}" cy="${yMeta.toFixed(1)}" r="${isTarget ? 5.5 : 4.2}" fill="${isTarget ? '#10b981' : '#0b1220'}" stroke="#38bdf8" stroke-width="2" />
              ${realRec ? `<circle cx="${x.toFixed(1)}" cy="${yOf(realRec.pesoRealG).toFixed(1)}" r="5.5" fill="#10b981" stroke="#fff" stroke-width="1.5" />` : ''}
            </g>
          `;
        }).join('')}
      </svg>
    `;

    const tipEl = $('growth-curve-tooltip');
    if (tipEl) {
      chartBox.querySelectorAll('.growth-node').forEach((g) => {
        const showNode = () => {
          const hd = Number(g.dataset.gd);
          const p = points[hd - 1];
          const realRec = pesajesMap.get(hd);
          if (!p) return;
          const m30 = ((p.metaG * 30) / 1000).toFixed(2);
          const canalKg = ((p.metaG / 1000) * rendCanalPct).toFixed(2);
          tipEl.textContent = realRec
            ? `Día ${hd} (${p.fecha}): Meta Ross ${p.metaG} g | REAL MEDIDO ${Math.round(realRec.pesoRealG)} g (${((realRec.difVsRossPct || 0) * 100).toFixed(1)}% vs meta) · Canal est. ${((realRec.pesoRealG / 1000) * rendCanalPct).toFixed(2)} kg.`
            : `Día ${hd} (${p.fecha}): Meta ${p.metaG} g/ave (${canalKg} kg canal c/menud.) · Para 30 pollos de muestra: pesar ${m30} kg.`;
        };
        g.addEventListener('mouseenter', showNode);
        g.addEventListener('click', showNode);
        g.addEventListener('focus', showNode);
      });
    }
  }

  function renderBodegaAndThermal(activeComputed) {
    const bod = activeComputed.av2.auditoriaBodegaLote1;
    const jit = bod.fisicaJit || {
      compradoHoy: { masterpollito: 3, nutrepollo: 0, broiler: 0, totalBultos: 3, costoCop: 319500 },
      porComprarJit: { masterpollito: 0, nutrepollo: 16, broiler: 48, totalBultos: 64, costoAdicionalCop: 6022400 }
    };
    const comp = jit.compradoHoy;
    const falt = jit.porComprarJit;
    const pct = (have, need) => Math.min(100, Math.round((have / Math.max(1, need)) * 100));

    const phases = [
      {
        stage: 'Etapa 1 · Arranque',
        shortName: 'Master Pollito',
        days: 'Días 1–7',
        name: '1 · Master Pollito (Preiniciación Sem 1, días 1–7)',
        have: comp.masterpollito,
        miss: falt.masterpollito,
        need: comp.masterpollito + falt.masterpollito,
        ropHint: falt.masterpollito === 0 ? 'Etapa arranque cubierta (3 bultos)' : `Faltan ${falt.masterpollito} bultos de arranque`
      },
      {
        stage: 'Etapa 2 · Crecimiento',
        shortName: 'Nutrepollo Cr SP',
        days: 'Días 8–21',
        name: '2 · Nutrepollo Cr SP (Iniciación Sem 2–3, días 8–21)',
        have: comp.nutrepollo,
        miss: falt.nutrepollo,
        need: comp.nutrepollo + falt.nutrepollo,
        ropHint: 'Kanban JIT: pedir antes del Día 8 (20-nov)'
      },
      {
        stage: 'Etapa 3 · Finalización',
        shortName: 'Broiler I Dorado',
        days: 'Días 22–42',
        name: '3 · Broiler I Dorado (Engorde Sem 4–6, días 22+)',
        have: comp.broiler,
        miss: falt.broiler,
        need: comp.broiler + falt.broiler,
        ropHint: 'Kanban JIT: pedir desde Sem 4 sin congelar capital'
      }
    ];

    $('bodega-faltante-pill').className = `pill ${falt.totalBultos > 0 ? 'warn' : 'ok'}`;
    $('bodega-faltante-pill').textContent =
      falt.totalBultos > 0
        ? `Plan JIT Sem 2–6: ${falt.totalBultos} bultos (${cop(falt.costoAdicionalCop)})`
        : 'Ciclo 100% Cubierto';

    if ($('bodega-pipeline-container')) {
      const estBod = (activeComputed.av2.gobiernoEjecutivo && activeComputed.av2.gobiernoEjecutivo.estadoCampoHoy) || {};
      const restEtapaTxt = formatBultosHuman(estBod.bultosEtapaActivaRestantes ?? estBod.masterRestantesPiso ?? 2);
      const totalPisoTxt = formatBultosHuman(estBod.bultosRestantesPisoHoy ?? 2);
      const matActual = estBod.etapaActivaMaterial || 'Master Pollito';
      const consKgFmt = Number(estBod.consumoTeoricoAcumLoteKg || 39.8).toFixed(1).replace('.', ',');
      $('bodega-pipeline-container').innerHTML = `
        <div class="solla-pipeline">
          ${phases
            .map(
              (ph) => `
            <div class="solla-stage ${ph.miss > 0 ? 'is-low' : 'is-ok'}">
              <div class="solla-stage-head">
                <span>${escapeHtml(ph.shortName)}</span>
                <span class="pill ${ph.miss > 0 ? 'warn' : 'ok'}">${ph.miss > 0 ? `${ph.miss} JIT` : 'OK'}</span>
              </div>
              <div class="solla-stage-days">${escapeHtml(ph.stage)} · ${escapeHtml(ph.days)}</div>
              <div class="num" style="font-size:0.82rem; font-weight:700;">${ph.have} / ${ph.need} bultos</div>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="muted num" style="font-size:0.75rem; margin-bottom:10px; padding:6px 10px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border);">
          <strong>Existencia real estimada hoy (Día ${estBod.diaCicloL1 || 4}):</strong> de ${comp.totalBultos} bultos comprados en granja (${cop(comp.costoCop)}), el consumo teórico acumulado es ${consKgFmt} kg → quedan <strong>${restEtapaTxt} de ${escapeHtml(matActual)}</strong> en piso (${totalPisoTxt} totales comprados). Las etapas Sem 2–6 (${falt.totalBultos} bultos) se compran Justo a Tiempo.
        </div>
      `;
    }

    $('bodega-bars-container').innerHTML = phases
      .map((ph) => {
        const w = pct(ph.have, ph.need);
        return `
          <div class="bodega-bar-wrap">
            <div class="bodega-bar-meta">
              <span class="muted" style="font-size:0.74rem;">${escapeHtml(ph.ropHint)}</span>
              <span class="num" style="font-size:0.78rem;">${w}% cubierto (${ph.have}/${ph.need})</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${ph.miss > 0 ? 'warn' : ''}" style="width:${w}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    const term = activeComputed.av2.capacidadTermica;
    const secDens = Number(term.densidadPicoSeccionKgM2 || term.densidadPicoKgM2 || 0);
    const critDens = Number(term.densidadCriticaElZuliaKgM2 || secDens || term.densidadPicoKgM2 || 0);
    const densPct = Math.min(100, Math.round((critDens / 28) * 100));
    const isDanger = critDens > 24;
    const isWarn = !isDanger && critDens > 20;
    const avesPorM2 = Number(term.densidadAvesM2Seccion || 8.6);

    $('termica-estado-pill').className = `pill ${isDanger ? 'danger' : isWarn ? 'warn' : 'ok'}`;
    $('termica-estado-pill').textContent = `${secDens.toFixed(2)} kg/m² · ${avesPorM2.toFixed(1)} aves/m²`;

    $('termica-gauge-body').innerHTML = `
      <div class="kpi-grid" style="grid-template-columns:1fr 1fr; margin-bottom:12px;">
        <div class="kpi-card">
          <div class="kpi-label">Peso Total de Pollos en Pico (24-Dic)</div>
          <div class="kpi-value">${Number(term.biomasaMaxSeccionKg || term.biomasaPicoKg).toFixed(0)} kg secc.</div>
          <div class="kpi-sub">Total galpón traslapado: ${term.biomasaPicoKg.toFixed(0)} kg (${term.picoAvesSimultaneas.toLocaleString('es-CO')} pollos vivos)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Espacio en Piso · El Zulia (Meta ≤20 / Alerta &gt;24 kg/m²)</div>
          <div class="kpi-value">${secDens.toFixed(2)} kg/m²</div>
          <div class="kpi-sub">${avesPorM2.toFixed(1)} aves/m² · Secc. ${Number(term.areaPorSeccionM2 || 93.33).toFixed(1)} m² · Global ${term.densidadPicoKgM2.toFixed(2)} kg/m² · ${escapeHtml(term.estadoTermico)}</div>
        </div>
      </div>
      <div class="progress-track" style="height:14px;">
        <div class="progress-fill ${isDanger ? 'danger' : isWarn ? 'warn' : ''}" style="width:${densPct}%"></div>
      </div>
      ${isDanger ? '<div class="muted" style="font-size:0.74rem; margin-top:8px; color:var(--amber);"><strong>Acción recomendada:</strong> si sube de 24 kg/m² en El Zulia, abrir malla del corral vecino antes de la semana 5 o despachar venta parcial en pie.</div>' : ''}
    `;
  }

  function renderTransporteAndVentas(activeComputed) {
    const trans = activeComputed.av2.transporte || { viajes: [], viajesEnCurso: 0, kmTotales: 0, costoTransporteTotalCop: 0 };
    if ($('viajes-resumen-pill')) {
      const perKg = Number(trans.costoTransporteLote1PorKgCanalCop || 0);
      $('viajes-resumen-pill').className = `pill ${trans.viajesEnCurso > 0 ? 'warn' : 'ok'}`;
      $('viajes-resumen-pill').textContent = `${trans.viajes.length} viajes · ${Number(trans.kmTotales || 0).toFixed(1)} km · ${cop(trans.costoTransporteTotalCop)}${perKg > 0 ? ` · ${cop(perKg)}/kg canal` : ''}`;
    }
    if ($('tbody-viajes-transporte')) {
      const rows = trans.viajes || [];
      $('tbody-viajes-transporte').innerHTML = rows.length
        ? rows
            .map(
              (v) => `
          <tr>
            <td><strong>${escapeHtml(v.id)}</strong></td>
            <td>${escapeHtml(v.fecha)}</td>
            <td class="num">${v.odometroInicial ?? '—'} → ${v.odometroFinal ?? 'Pend.'}</td>
            <td class="num-cell">${Number(v.kmRecorridos || 0).toFixed(1)} km</td>
            <td class="num-cell">${cop(v.costoAplicadoCop)}</td>
            <td><span class="pill ${v.estado === 'en_curso' ? 'warn' : 'ok'}">${escapeHtml(v.estado)}</span> ${escapeHtml(v.observacion || v.motivo)}</td>
            <td>${v.estado === 'en_curso' ? `<button type="button" class="btn-xs btn-emerald" data-close-trip="${escapeHtml(v.id)}" data-odo-ini="${v.odometroInicial ?? ''}">Cerrar viaje</button>` : '—'}</td>
          </tr>
        `
            )
            .join('')
        : '<tr><td colspan="7" class="muted">Sin desplazamientos registrados aún.</td></tr>';

      $('tbody-viajes-transporte').querySelectorAll('[data-close-trip]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if ($('inp-trip-action')) $('inp-trip-action').value = 'close';
          if ($('inp-trip-odo-ini') && btn.dataset.odoIni) $('inp-trip-odo-ini').value = btn.dataset.odoIni;
          if ($('inp-trip-odo-fin')) $('inp-trip-odo-fin').focus();
        });
      });
    }

    const vRes = activeComputed.av2.ventasParcialesResumen || {
      ventas: [],
      totalAvesVendidas: 0,
      totalKgVendidos: 0,
      totalIngresosCop: 0,
      totalMargenCop: 0,
      comparativaModalidadesLote1: {}
    };
    if ($('ventas-parciales-pill')) {
      $('ventas-parciales-pill').textContent = `${vRes.ventas.length} ventas · ${Number(vRes.totalKgVendidos || 0).toFixed(1)} kg · Margen ${cop(vRes.totalMargenCop)}`;
    }
    if ($('comparativa-modalidades-grid')) {
      const cmp = vRes.comparativaModalidadesLote1 || {};
      const items = [
        { data: cmp.canal100, ref: false, badge: 'Objetivo Principal' },
        { data: cmp.piezas100, ref: false, badge: 'Alto Valor (Presas)' },
        { data: cmp.enPie100, ref: true, badge: 'Solo ref. interna' }
      ].filter((x) => Boolean(x.data));
      $('comparativa-modalidades-grid').innerHTML = items
        .map(
          ({ data: m, ref, badge }) => `
          <div class="kpi-card ${ref ? 'muted-ref-card' : 'highlight'}">
            <div class="kpi-label"><span>${escapeHtml(m.modalidad)}</span><span class="pill ${ref ? '' : 'ok'}">${badge}</span></div>
            <div class="kpi-value">${cop(m.utilidadCop)}</div>
            <div class="kpi-sub">${Number(m.kgVendibles || 0).toFixed(0)} kg · ${cop(m.precioKgCop)}/kg · Margen ${((m.margenPct || 0) * 100).toFixed(1)}%</div>
          </div>
        `
        )
        .join('');
    }
    renderDesposteSplitCalc(activeComputed);
    if ($('tbody-ventas-parciales')) {
      const sRows = vRes.ventas || [];
      $('tbody-ventas-parciales').innerHTML = sRows.length
        ? sRows
            .map(
              (s) => `
          <tr>
            <td>${escapeHtml(s.fecha)}</td>
            <td>${escapeHtml(s.cliente)}</td>
            <td><strong>${escapeHtml(s.modalidad)}</strong> (${escapeHtml(s.corteDetalle)})</td>
            <td class="num-cell">${s.cantidadAves}</td>
            <td class="num-cell">${Number(s.pesoKg || 0).toFixed(1)} kg</td>
            <td class="num-cell">${cop(s.ingresoTotalCop)}</td>
            <td class="num-cell">${cop(s.costoProrrateadoCop)}</td>
            <td class="num-cell"><strong>${cop(s.margenBrutoCop)}</strong> (${(s.margenPct * 100).toFixed(1)}%)</td>
          </tr>
        `
            )
            .join('')
        : '<tr><td colspan="8" class="muted">Aún no hay salidas o ventas parciales registradas.</td></tr>';
    }
  }

  function renderRfcs() {
    const rfcs = appState.rfcs || [];
    const pill = $('rfc-counts-pill');
    const pend = rfcs.filter((r) => r.estado === 'pendiente_aprobacion').length;
    const appr = rfcs.filter((r) => r.estado === 'aprobado').length;
    pill.textContent = `${rfcs.length} RFCs (${pend} pend · ${appr} aprob)`;

    const container = $('rfc-list-container');
    if (rfcs.length === 0) {
      container.innerHTML =
        '<p class="muted" style="margin:0; font-size:0.82rem;">Sin mejoras estructurales en cola. Pide una por voz o en el formulario de arriba.</p>';
      return;
    }

    container.innerHTML = rfcs
      .map((r) => {
        const badgeCls =
          r.estado === 'ejecutado'
            ? 'ok'
            : r.estado === 'aprobado'
              ? 'accent'
              : r.estado === 'rechazado'
                ? 'danger'
                : 'warn';
        return `
          <div class="rfc-card">
            <div class="rfc-head">
              <div>
                <strong>${escapeHtml(r.rfcCode)}</strong> · ${escapeHtml(r.titulo)}
              </div>
              <span class="pill ${badgeCls}">${escapeHtml(r.estado)}</span>
            </div>
            <p class="muted" style="margin:6px 0 8px; font-size:0.8rem;">${escapeHtml(r.descripcion)}</p>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${r.estado === 'pendiente_aprobacion' ? `<button type="button" class="btn-xs btn-emerald" data-rfc-approve="${escapeHtml(r.rfcCode)}">✓ Aprobar para Antigravity</button>` : ''}
              ${r.estado === 'aprobado' ? `<button type="button" class="btn-xs btn-primary" data-rfc-exec="${escapeHtml(r.rfcCode)}">✓ Marcar Ejecutado</button>` : ''}
              ${r.estado === 'pendiente_aprobacion' ? `<button type="button" class="btn-xs" data-rfc-reject="${escapeHtml(r.rfcCode)}">✕ Rechazar</button>` : ''}
              <button type="button" class="btn-xs btn-ghost" data-rfc-copy="${escapeHtml(r.rfcCode)}">📋 Copiar Orden Antigravity</button>
            </div>
          </div>
        `;
      })
      .join('');

    container.querySelectorAll('[data-rfc-approve]').forEach((b) =>
      b.addEventListener('click', () => handleRfcAction(b.dataset.rfcApprove, 'approve'))
    );
    container.querySelectorAll('[data-rfc-exec]').forEach((b) =>
      b.addEventListener('click', () => handleRfcAction(b.dataset.rfcExec, 'execute'))
    );
    container.querySelectorAll('[data-rfc-reject]').forEach((b) =>
      b.addEventListener('click', () => handleRfcAction(b.dataset.rfcReject, 'reject'))
    );
    container.querySelectorAll('[data-rfc-copy]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = rfcs.find((x) => x.rfcCode === b.dataset.rfcCopy);
        if (item && navigator.clipboard) {
          await navigator.clipboard.writeText(item.antigravityPrompt || item.descripcion).catch(() => {});
          b.textContent = '✓ Copiado';
          setTimeout(() => {
            b.textContent = '📋 Copiar Orden Antigravity';
          }, 1800);
        }
      })
    );
  }

  function syncDesposteCalcInputs(computed) {
    const cfg = (computed && computed.av2?.ventasParcialesResumen?.desposteConfig) || (appState.officialState && appState.officialState.desposteConfig) || {};
    const l1 = computed && computed.av2?.lotes?.[0];
    if ($('calc-desp-aves') && !appState.desposteCalcEditedAves && l1) {
      $('calc-desp-aves').value = l1.avesFin;
    }
    const map = [
      ['calc-desp-p-pechuga', cfg.precioPechugaKg || 14800],
      ['calc-desp-p-pernil', cfg.precioPernilMusloKg || 12500],
      ['calc-desp-p-alas', cfg.precioAlasKg || 13500],
      ['calc-desp-p-menud', cfg.precioMenudenciasKg || 6000],
      ['calc-desp-p-espinazo', cfg.precioEspinazoKg || 4500]
    ];
    map.forEach(([id, val]) => {
      const el = $(id);
      if (el && !appState.desposteCalcTouched && document.activeElement !== el) {
        el.value = val;
      }
    });
  }

  function renderDesposteSplitCalc(activeComputed) {
    const box = $('desposte-split-result');
    if (!box) return;
    syncDesposteCalcInputs(activeComputed);
    const l1 = activeComputed.av2.lotes[0];
    const cfg = activeComputed.av2.ventasParcialesResumen?.desposteConfig || {};
    const aves = Math.max(1, Number($('calc-desp-aves')?.value || l1.avesFin || 582));
    const pechVend = Math.max(0, Math.min(aves, Number($('calc-desp-pechugas-vend')?.value || 0)));
    const pPech = Number($('calc-desp-p-pechuga')?.value || cfg.precioPechugaKg || 14800);
    const pPern = Number($('calc-desp-p-pernil')?.value || cfg.precioPernilMusloKg || 12500);
    const pAlas = Number($('calc-desp-p-alas')?.value || cfg.precioAlasKg || 13500);
    const pMen = Number($('calc-desp-p-menud')?.value || cfg.precioMenudenciasKg || 6000);
    const pEsp = Number($('calc-desp-p-espinazo')?.value || cfg.precioEspinazoKg || 4500);

    const pesoCanalAve = l1.pesoCanalAveKg || 2.47;
    const kgTot = aves * pesoCanalAve;
    const kgPechTotal = kgTot * (cfg.pechugaPct || 0.34);
    const kgPechVend = (kgPechTotal / aves) * pechVend;
    const kgPechRest = Math.max(0, kgPechTotal - kgPechVend);
    const kgPernil = kgTot * (cfg.pernilMusloPct || 0.31);
    const kgAlas = kgTot * (cfg.alasPct || 0.11);
    const kgMen = kgTot * (cfg.menudenciasPct || 0.08);
    const kgEsp = kgTot * (cfg.espinazoSubproductoPct || 0.16);

    const targetCorte = $('calc-desp-target-corte')?.value || 'pechuga';
    const defaultKgCorte = targetCorte === 'vivo' ? 3.00 : (targetCorte === 'canal' ? 2.47 : 0.84);
    const targetPechKg = Math.max(0.25, Number($('calc-desp-target-pechuga')?.value || defaultKgCorte));
    const hitoPech = TwinEngine.estimateDayForTargetCutWeight
      ? TwinEngine.estimateDayForTargetCutWeight(appState.officialState, { corte: targetCorte, targetKg: targetPechKg, avesInic: aves })
      : null;
    if ($('desposte-pechuga-hito') && hitoPech) {
      const cutLabel = targetCorte === 'vivo' ? 'pollo vivo' : (targetCorte === 'canal' ? 'canal c/m' : 'pechuga');
      const valCorte = targetCorte === 'vivo' ? hitoPech.pesoVivoKg : (targetCorte === 'canal' ? hitoPech.pesoCanalKg : hitoPech.pesoPechugaKg);
      const deltaBultosTxt = hitoPech.bultosExtraVs42 >= 0 ? `+${hitoPech.bultosExtraVs42}` : `${hitoPech.bultosExtraVs42}`;
      $('desposte-pechuga-hito').textContent =
        `Día ${hitoPech.edadRecomendadaDias}: ${valCorte.toFixed(2)} kg ${cutLabel} (${hitoPech.pesoVivoKg.toFixed(2)} kg vivo · ${hitoPech.pesoCanalKg.toFixed(2)} kg canal · FCR ${hitoPech.fcrTeorico.toFixed(2)} · ${deltaBultosTxt} bultos vs 42d)${hitoPech.requiereEntresaca ? ' · Requiere entresaca El Zulia' : ''}`;
    }

    const ingPechVend = kgPechVend * pPech;
    const ingResto = kgPechRest * pPech + kgPernil * pPern + kgAlas * pAlas + kgMen * pMen + kgEsp * pEsp;
    const ingTotalDesp = ingPechVend + ingResto;
    const ingCanalEquiv = kgTot * (appState.officialState?.preciosRegionales?.precioCanalKg || 11500);
    const extraVsCanal = ingTotalDesp - ingCanalEquiv;
    const kgRestoTotal = kgPechRest + kgPernil + kgAlas + kgMen + kgEsp;
    const precioEquilibrioResto = kgRestoTotal > 0 ? Math.max(0, (ingCanalEquiv - ingPechVend) / kgRestoTotal) : 0;

    box.innerHTML = `
      <div class="opp-verdict">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
          <strong>Escenario ${aves} pollos (${kgTot.toFixed(0)} kg en presas) · ${pechVend} pechugas ya vendidas</strong>
          <span class="pill ${extraVsCanal >= 0 ? 'ok' : 'warn'}">${extraVsCanal >= 0 ? `+${cop(extraVsCanal)} extra sobre canal entero` : `${cop(extraVsCanal)} vs canal entero`}</span>
        </div>
        <div class="opp-metrics-grid">
          <div class="kpi-card"><div class="kpi-label">Pechugas Ya Vendidas (${pechVend})</div><div class="kpi-value">${cop(ingPechVend)}</div><div class="kpi-sub">${kgPechVend.toFixed(1)} kg @ ${cop(pPech)}/kg</div></div>
          <div class="kpi-card"><div class="kpi-label">Saldo por Colocar en Mercados</div><div class="kpi-value">${cop(ingResto)}</div><div class="kpi-sub">Pernil/Muslo ${kgPernil.toFixed(0)} kg · Alas ${kgAlas.toFixed(0)} kg · Pech rest ${kgPechRest.toFixed(0)} kg · Men/Esp ${(kgMen + kgEsp).toFixed(0)} kg</div></div>
          <div class="kpi-card highlight"><div class="kpi-label">Ingreso Total Combinado</div><div class="kpi-value">${cop(ingTotalDesp)}</div><div class="kpi-sub">vs ${cop(ingCanalEquiv)} vendiendo todo en canal entero</div></div>
          <div class="kpi-card"><div class="kpi-label">Mínimo Empate Presas Restantes</div><div class="kpi-value">${cop(precioEquilibrioResto)}/kg</div><div class="kpi-sub">Promedio mínimo de los ${kgRestoTotal.toFixed(0)} kg sobrantes para empatar al canal</div></div>
        </div>
        <div class="muted" style="font-size:0.75rem; margin-top:8px;">
          <strong>Flexibilidad por talla y corte (Ross 308 · 34% pechuga sobre canal c/m):</strong> Nuestro plan base es <strong>Día ${appState.officialState?.parametrosGenerales?.edadObjetivoGlobal || 42}</strong> (~2,47 kg canal / ~840 g pechuga); cambia arriba el corte y el peso deseado para simular al instante el día exacto, bultos extra y alertas de densidad térmica en El Zulia.
        </div>
      </div>
    `;
  }

  function renderAll() {
    const sim = getActiveSimulation();
    renderAmbientPulse(appState.officialComputed);
    renderHeroBridge(sim.computed, sim.state);
    renderWhatIfSection(sim);
    renderAv2Operations(sim.computed);
    renderAv1AnnualAndPropio(sim.computed);
    renderBitacoraAndPesajes(sim.computed);
    renderBodegaAndThermal(sim.computed);
    renderTransporteAndVentas(sim.computed);
    renderRfcs();
  }

  // =========================================================================
  // Sliders What-If Sincronizados (60 fps)
  // =========================================================================
  function syncSlidersToState(state) {
    const g = state.parametrosGenerales;
    const p = state.preciosRegionales;
    $('rng-edad').value = g.edadObjetivoGlobal;
    $('val-edad').textContent = `${g.edadObjetivoGlobal} d`;
    $('rng-precio-canal').value = p.precioCanalKg;
    $('val-precio-canal').textContent = cop(p.precioCanalKg);
    $('rng-precio-vivo').value = p.precioVivoKg;
    $('val-precio-vivo').textContent = cop(p.precioVivoKg);
    $('rng-mort').value = (g.mortalidadEsperadaPct * 100).toFixed(1);
    $('val-mort').textContent = `${(g.mortalidadEsperadaPct * 100).toFixed(1)}%`;
    $('rng-clima').value = (g.factorClimaCucutaPct * 100).toFixed(1);
    $('val-clima').textContent = `${(g.factorClimaCucutaPct * 100).toFixed(1)}%`;
    $('rng-area').value = g.areaGalponM2;
    $('val-area').textContent = `${g.areaGalponM2} m²`;
    $('toggle-alimento-propio').checked =
      state.lotes && state.lotes[1] && state.lotes[1].programaAlimento === 'Mixto Propio';
  }

  function readOverridesFromSliders() {
    return {
      edadGlobal: Number($('rng-edad').value),
      mortalidadPct: Number($('rng-mort').value) / 100,
      programaAlimentoLotes23: $('toggle-alimento-propio').checked ? 'Mixto Propio' : '100% Comercial',
      preciosRegionales: {
        precioCanalKg: Number($('rng-precio-canal').value),
        precioVivoKg: Number($('rng-precio-vivo').value)
      },
      parametrosGenerales: {
        factorClimaCucutaPct: Number($('rng-clima').value) / 100,
        areaGalponM2: Number($('rng-area').value)
      }
    };
  }

  function onSliderInput() {
    $('val-edad').textContent = `${$('rng-edad').value} d`;
    $('val-precio-canal').textContent = cop($('rng-precio-canal').value);
    $('val-precio-vivo').textContent = cop($('rng-precio-vivo').value);
    $('val-mort').textContent = `${Number($('rng-mort').value).toFixed(1)}%`;
    $('val-clima').textContent = `${Number($('rng-clima').value).toFixed(1)}%`;
    $('val-area').textContent = `${$('rng-area').value} m²`;

    appState.whatIfOverrides = readOverridesFromSliders();
    appState.whatIfActive = true;
    renderAll();
  }

  function applySlidersFromOverrides(ov) {
    if (!ov) return;
    if (ov.edadObjetivoDias !== undefined) $('rng-edad').value = ov.edadObjetivoDias;
    if (ov.precioCanalKg !== undefined) $('rng-precio-canal').value = ov.precioCanalKg;
    if (ov.precioVivoKg !== undefined) $('rng-precio-vivo').value = ov.precioVivoKg;
    if (ov.mortalidadEsperadaPct !== undefined) $('rng-mort').value = (ov.mortalidadEsperadaPct * 100).toFixed(1);
    if (ov.factorClimaCucutaPct !== undefined) $('rng-clima').value = (ov.factorClimaCucutaPct * 100).toFixed(1);
    if (ov.areaGalponM2 !== undefined) $('rng-area').value = ov.areaGalponM2;
    onSliderInput();
  }

  // =========================================================================
  // Comunicación con Backend REST & SSE
  // =========================================================================
  async function apiJson(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
      body: opts.body && typeof opts.body === 'object' ? JSON.stringify(opts.body) : opts.body
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  let lastSyncedVoiceVersion = null;

  function buildLiveVoiceInstructions(snapshot) {
    const st = (snapshot && snapshot.state) || {};
    const c = (snapshot && snapshot.computed) || {};
    const ident = st.identidadAgente || c.identidadAgente || { nombre: 'Avi', rol: 'Copiloto Operativo y Financiero Avícola', estilo: 'Directo, cálido y 100% en pesos colombianos' };
    const partnerView = isPartnerScope();
    const av2Cons = (c.av2 && c.av2.consolidado3Lotes) || {};
    const av2Bit = (c.av2 && c.av2.bitacora) || {};
    const trans = (c.av2 && c.av2.transporte) || { viajes: [], viajesEnCurso: 0, kmTotales: 0, costoTransporteTotalCop: 0 };
    const vRes = (c.av2 && c.av2.ventasParcialesResumen) || { ventas: [], totalIngresosCop: 0, comparativaModalidadesLote1: {} };
    const cont = (c.av2 && c.av2.continuoResumen) || { config: { avesPorLote: 900, cadenciaDias: 18 }, saldoFinalContinuo: 0, semanasTotales: 11 };
    const l1 = (c.av2 && c.av2.lotes && c.av2.lotes[0]) || {};
    return [
      `Eres "${ident.nombre}" (${ident.rol}), estilo: ${ident.estilo}. Si el usuario te da un nombre o te pide cambiarlo, llama set_agent_identity.`,
      'MONEDA ESTRICTA: TODAS las cifras están en PESOS COLOMBIANOS (COP). Di siempre "pesos" o "pesos colombianos"; NUNCA digas "dólares".',
      'CERO JERGA: Nunca digas "AV-1", "AV-2", "Valle de Caja" ni "Isomórfico". Ya estamos comprometidos en operación continua (NO digas "antes de comprometer los siguientes lotes"): Lote 1 (600 aves) enlaza directo con Lotes 2 y 3 (800 c/u) con pollito directo sin intermediario a $3.200 pesos y ciclos continuos de 900 pollos cada 18 días.',
      partnerView ? 'MODO FUNDADOR ESTRICTO (David Bonilla): Solo habla de Granja La Alejandra (El Zulia). Nunca menciones RFCs ni plantillas internas.' : 'Foco por defecto en Granja La Alejandra (El Zulia).',
      'SUBAGENTES ACTIVOS EN AVI (siempre modulados por Avi): Visión (Gerencia & Excelencia Operacional 5 Capas · Voz Masculina Verse · único con permiso de intervención espontánea con criterio), Kaplan & Norton (BSC KPIs), Michael Porter (5 Fuerzas & costo directo), Philip Kotler (canales/canal vs desposte), Chris Voss + Harvard/Gates (negociación), Zootecnia PhD Ross 308 + Innovación Práctica, Dra. Camila (Sanidad & ICA 3652 · Voz F) y Dr. Andrés (Nutrición SID & Peleteo · Voz M).',
      'MOVIMIENTO VISUAL: Si te dicen "desplázate hacia abajo", "me estás tapando", "ubícate a la derecha/izquierda/esquina" o hablan de un gráfico superior, llama move_avi_presence para apartarte sin tapar barras o tarjetas.',
      `ESTADO ACTUALIZADO (${snapshot.version} ${snapshot.version === 1 ? 'reg.' : 'regs.'}): Utilidad 3 Lotes=${cop(av2Cons.utilidadCanal)} | Lote 1=${cop(l1.utilidadCanal)} | Continuidad ${cont.config.avesPorLote} pollos cada ${cont.config.cadenciaDias}d (Sem ${cont.semanasTotales}: ${cop(cont.saldoFinalContinuo)}) | Días bitácora=${av2Bit.diasRegistrados || 0}.`,
      `Transporte Terios: Viajes=${(trans.viajes || []).length} (en curso=${trans.viajesEnCurso || 0}), Km=${Number(trans.kmTotales || 0).toFixed(1)}, Costo=${cop(trans.costoTransporteTotalCop)}.`,
      `Ventas Parciales: ${(vRes.ventas || []).length} registradas (${cop(vRes.totalIngresosCop)}) | 100% Presas/Desposte L1=${cop(vRes.comparativaModalidadesLote1?.piezas100?.utilidadCop || 0)}.`
    ].join('\n');
  }

  const CONCIL_LABELS = {
    AV2_Cons3_Utilidad: 'Utilidad Consolidada 3 Lotes',
    AV2_Cons3_CapPicoSem7: 'Tope Caja 23-Dic (Víspera Cosecha L1 · Corte 7)',
    AV2_Cons3_SaldoPost4m: 'Saldo Libre Post 4 Meses Arriendo',
    AV2_Cons3_BiomasaPicoKg: 'Biomasa Máxima Simultánea (kg)',
    AV1_800Com_Utilidad: 'Modelo Base 800 Aves (Comercial)',
    AV1_800Com_CostKgCanal: 'Costo por kg Canal (800 Aves)',
    AV1_800Com_CostKgVivo: 'Costo por kg Vivo (800 Aves)',
    AV1_800Com_Bultos: 'Bultos Totales (800 Aves)',
    AV1_800Prop_Utilidad: 'Modelo Base 800 Aves (Alimento Propio)',
    AV1_800Prop_Ahorro: 'Ahorro Alimento Propio vs Comercial',
    AV1_600L1_Utilidad: 'Utilidad Lote 1 Base (600 Aves)',
    AV1_600L1_BultosPpto: 'Bultos Presupuestados Lote 1',
    AV1_600L1_BultosBodega: 'Bultos Comprados en Bodega Lote 1',
    AV1_Anual_CapPico: 'Capital Rotativo Anual (12 Meses)',
    AV1_Anual_Utilidad12m: 'Utilidad Neta Anual (12 Meses)'
  };

  function applyOfficialSnapshot(snapshot) {
    if (!snapshot) return;
    appState.officialSnapshot = snapshot;
    appState.officialState = snapshot.state;
    appState.officialComputed = snapshot.computed;
    $('twin-version-pill').textContent = `${snapshot.version} ${snapshot.version === 1 ? 'reg.' : 'regs.'}`;

    const agentName = getAgentName();
    if ($('btn-agent-identity')) {
      $('btn-agent-identity').textContent = `✦ ${agentName}`;
    }
    document.querySelectorAll('.js-agent-name-inline').forEach((el) => {
      el.textContent = agentName;
    });
    updateVoiceButtonUi();

    const concil = TwinEngine.verifyZeroDivergence(snapshot.computed);
    const concilPill = $('sync-concil-pill');
    if (concilPill) {
      concilPill.className = `pill-btn ${concil.ok ? 'ok' : 'warn'}`;
      concilPill.textContent = concil.ok ? '✓ Cuentas Cuadradas' : '⚠ Revisar Cuentas';
    }
    if ($('concil-checks-list')) {
      const visibleChecks = (concil.checks || []).filter((chk) =>
        !isPartnerScope() || chk.metric.startsWith('AV2_') || chk.metric === 'AV1_600L1_Utilidad'
      );
      const rows = visibleChecks
        .map(
          (chk) => `
          <div style="display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-bottom:1px solid var(--border); font-size:0.78rem;">
            <span>${escapeHtml(CONCIL_LABELS[chk.metric] || chk.metric)}</span>
            <span class="num">${Number(chk.actual).toLocaleString('es-CO', { maximumFractionDigits: 2 })} <span class="muted">(dif ${Number(chk.diff).toFixed(4)})</span></span>
          </div>
        `
        )
        .join('');
      $('concil-checks-list').innerHTML = `
        <div style="margin-bottom:8px;"><strong>Estado contable:</strong> ${concil.ok ? `Cuadre exacto (desviación máx. ${Number(concil.maxDiff || 0).toFixed(6)})` : 'Diferencia detectada'}</div>
        ${rows}
      `;
    }

    const cloud = snapshot.persistence && snapshot.persistence.supabaseConfigured;
    $('cloud-status-text').textContent = cloud ? 'Guardado en nube' : 'Guardado local';

    if (!appState.whatIfActive) {
      syncSlidersToState(snapshot.state);
    }
    renderAll();

    if (
      appState.voice &&
      appState.voice.connected &&
      appState.voice.dc &&
      appState.voice.dc.readyState === 'open' &&
      lastSyncedVoiceVersion !== snapshot.version
    ) {
      lastSyncedVoiceVersion = snapshot.version;
      try {
        appState.voice.dc.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              instructions: buildLiveVoiceInstructions(snapshot)
            }
          })
        );
      } catch (_) {}
    }
  }

  async function showAuthGate() {
    try {
      const profRes = await apiJson('/api/auth/session');
      appState.authProfiles = profRes.profiles || [];
    } catch (_) {
      appState.authProfiles = [];
    }
    const grid = $('auth-profiles-grid');
    const selectedInp = $('auth-selected-username');
    if (grid) {
      const profiles = appState.authProfiles.length
        ? appState.authProfiles
        : [
            { username: 'david', displayName: 'David Bonilla', titleBadge: 'Fundador', role: 'farm_partner' },
            { username: 'mauricio', displayName: 'Mauricio Bonilla', titleBadge: 'Administrador', role: 'owner' }
          ];
      const defaultUser = profiles[0].username;
      if (selectedInp && !selectedInp.value) selectedInp.value = defaultUser;
      grid.innerHTML = profiles
        .map(
          (pr) => `
          <button type="button" class="auth-profile-card ${(selectedInp?.value || defaultUser) === pr.username ? 'selected' : ''}" data-auth-user="${escapeHtml(pr.username)}">
            <div style="font-weight:700; font-size:0.9rem;">${escapeHtml(pr.displayName)}</div>
            <div class="muted" style="font-size:0.75rem; margin-top:2px;">${pr.role === 'owner' ? 'Admin App y Desarrollo' : 'Dueño Avícola · Granja La Alejandra'}</div>
          </button>
        `
        )
        .join('');
      grid.querySelectorAll('[data-auth-user]').forEach((btn) => {
        btn.addEventListener('click', () => {
          grid.querySelectorAll('[data-auth-user]').forEach((b) => b.classList.remove('selected'));
          btn.classList.add('selected');
          if (selectedInp) selectedInp.value = btn.dataset.authUser;
          if ($('auth-pin-input')) $('auth-pin-input').focus();
        });
      });
    }
    if ($('auth-login-error')) $('auth-login-error').textContent = '';
    if ($('auth-gate-overlay')) $('auth-gate-overlay').classList.remove('hidden');
  }

  async function renderAdminUsersList() {
    const box = $('users-list-admin');
    if (!box || !appState.currentUser || appState.currentUser.role !== 'owner') return;
    try {
      const res = await apiJson('/api/auth/users');
      const users = res.users || [];
      box.innerHTML = users.length
        ? `<div class="muted" style="font-size:0.76rem; margin-bottom:4px;">Usuarios configurados:</div>` +
          users
            .map(
              (u) =>
                `<div class="lot-row" style="padding:6px 10px;"><strong>${escapeHtml(u.displayName)}</strong><span class="muted">@${escapeHtml(u.username)}</span><span class="pill ${u.role === 'owner' ? 'accent' : 'ok'}">${escapeHtml(u.role)}</span></div>`
            )
            .join('')
        : '';
    } catch (_) {
      box.innerHTML = '';
    }
  }

  async function refreshAllFromServer() {
    const authRes = await apiJson('/api/auth/session');
    appState.authProfiles = authRes.profiles || [];
    if (!authRes.authenticated || !authRes.user) {
      appState.currentUser = null;
      await showAuthGate();
      return;
    }

    appState.currentUser = authRes.user;
    if ($('auth-gate-overlay')) $('auth-gate-overlay').classList.add('hidden');
    applyRoleScopedUi();

    const isOwner = authRes.user.role === 'owner';
    const [stRes, rfcRes, credRes, logRes] = await Promise.all([
      apiJson('/api/twin/state'),
      isOwner ? apiJson('/api/bridge/rfcs').catch(() => ({ rfcs: [] })) : Promise.resolve({ rfcs: [] }),
      isOwner ? apiJson('/api/credentials/status').catch(() => ({ status: null })) : Promise.resolve({ status: null }),
      apiJson('/api/conversation/log?limit=60').catch(() => ({ entries: [] }))
    ]);
    applyOfficialSnapshot(stRes.snapshot);
    appState.rfcs = rfcRes.rfcs || [];
    appState.credentialsStatus = credRes.status;
    if (credRes.status) updateCredentialsUi();
    renderRfcs();
    if (isOwner) renderAdminUsersList();
    if (logRes && Array.isArray(logRes.entries) && logRes.entries.length > 0) {
      for (const entry of logRes.entries) {
        appendTranscript(entry.role, entry.text, { persist: false, id: entry.id });
      }
    }
  }

  async function postOperationalEvent(evt) {
    const res = await apiJson('/api/twin/event', {
      method: 'POST',
      body: evt
    });
    appState.whatIfActive = false;
    appState.whatIfOverrides = null;
    applyOfficialSnapshot(res.snapshot);
    return res;
  }

  async function handleRfcAction(code, action) {
    await apiJson(`/api/bridge/rfcs/${encodeURIComponent(code)}/${action}`, {
      method: 'POST',
      body: { approvedBy: 'Mauricio Bonilla', channel: 'web' }
    });
    const rfcRes = await apiJson('/api/bridge/rfcs');
    appState.rfcs = rfcRes.rfcs || [];
    renderRfcs();
  }

  function connectSse() {
    const es = new EventSource('/api/events/stream');
    es.addEventListener('connected', () => {
      $('sse-status-text').textContent = 'En línea';
    });
    es.addEventListener('state_updated', (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.snapshot) applyOfficialSnapshot(data.snapshot);
      } catch (_) {}
    });
    es.addEventListener('ui_choreography', (ev) => {
      try {
        applyUiChoreography(JSON.parse(ev.data));
      } catch (_) {}
    });
    es.addEventListener('rfc_updated', async () => {
      const rfcRes = await apiJson('/api/bridge/rfcs').catch(() => null);
      if (rfcRes) {
        appState.rfcs = rfcRes.rfcs || [];
        renderRfcs();
      }
    });
    es.addEventListener('credentials_updated', (ev) => {
      try {
        appState.credentialsStatus = JSON.parse(ev.data);
        updateCredentialsUi();
      } catch (_) {}
    });
    es.addEventListener('conversation_logged', (ev) => {
      try {
        const entry = JSON.parse(ev.data);
        if (entry && entry.text) {
          appendTranscript(entry.role, entry.text, { persist: false, id: entry.id });
        }
      } catch (_) {}
    });
    es.onerror = () => {
      $('sse-status-text').textContent = 'Reconectando...';
    };
  }

  // =========================================================================
  // Excel Drag & Drop + Hidratación Causal
  // =========================================================================
  async function handleExcelFileUpload(file) {
    const form = new FormData();
    form.append('file', file);
    $('excel-diff-report').innerHTML = '<span class="muted">Analizando fórmulas y diferencias en Excel...</span>';
    const res = await fetch('/api/excel/hydrate', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      $('excel-diff-report').innerHTML = `<span style="color:var(--rose);">${escapeHtml(data.error)}</span>`;
      return;
    }
    const h = data.hydration;
    if (data.snapshot) {
      appState.whatIfActive = false;
      applyOfficialSnapshot(data.snapshot);
    }
    const diffs = Array.isArray(h.diffChanges) ? h.diffChanges : [];
    const diffRowsHtml = diffs.length
      ? `
        <div class="table-wrap" style="margin-top:8px;">
          <table class="diff-table">
            <thead>
              <tr>
                <th>Parámetro / Celda</th>
                <th class="num-cell">Antes</th>
                <th class="num-cell">Después</th>
              </tr>
            </thead>
            <tbody>
              ${diffs
                .slice(0, 14)
                .map(
                  (d) => `
                  <tr>
                    <td><strong>${escapeHtml(d.field || d.campo || d.label || 'Celda')}</strong></td>
                    <td class="num-cell muted">${escapeHtml(String(d.before ?? '—'))}</td>
                    <td class="num-cell" style="color:var(--emerald); font-weight:700;">${escapeHtml(String(d.after ?? '—'))}</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      : '<div class="muted" style="font-size:0.78rem; margin-top:6px;">Sin diferencias de celdas amarillas respecto al estado vivo actual.</div>';

    $('excel-diff-report').innerHTML = `
      <div class="panel-box" style="margin-top:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <strong>Archivo ${escapeHtml(h.workbookKind)} actualizado desde Excel (${h.changesCount} cambios detectados)</strong>
          <button type="button" class="btn-xs" id="btn-revert-excel-hydrate">↩ Revertir Importación</button>
        </div>
        <div class="muted num" style="font-size:0.8rem; margin-top:4px;">
          Delta Lote 1: <strong>${cop(h.financialImpact.deltaUtilidadLote1Cop)}</strong> ·
          Delta 3 Lotes: <strong>${cop(h.financialImpact.deltaUtilidad3LotesCop)}</strong> ·
          Delta Anual 12m: <strong>${cop(h.financialImpact.deltaAnual12mCop)}</strong>
        </div>
        ${diffRowsHtml}
      </div>
    `;
    const btnRev = $('btn-revert-excel-hydrate');
    if (btnRev) {
      btnRev.addEventListener('click', () => $('btn-undo').click());
    }
    focusSection('puente_antigravity', `Excel ${h.workbookKind} (+${h.changesCount} cambios)`);
  }

  // =========================================================================
  // Orbe & Nébula Acústica WebAudio + Sesión WebRTC OpenAI Realtime (gpt-realtime-2.1)
  // =========================================================================
  function paintNebulaCanvas(canvas, t, energy, mode, connected) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    ctx.clearRect(0, 0, w, h);

    const palettes = {
      speaking: ['#10b981', '#38bdf8', '#22d3ee', '#6366f1'],
      listening: ['#38bdf8', '#0ea5e9', '#818cf8', '#2dd4bf'],
      thinking: ['#f59e0b', '#a855f7', '#38bdf8', '#fb7185'],
      idle: connected
        ? ['#0ea5e9', '#6366f1', '#10b981', '#38bdf8']
        : ['#38bdf8', '#6366f1', '#14b8a6', '#8b5cf6']
    };
    const cols = palettes[mode] || palettes.idle;
    const baseR = Math.min(w, h) * 0.25;
    const speed = mode === 'speaking' ? 1.85 : mode === 'listening' ? 1.35 : mode === 'thinking' ? 2.1 : 0.72;
    const tt = t * speed;

    // Halo exterior respirante
    const haloR = baseR * (1.75 + energy * 0.42 + 0.08 * Math.sin(tt * 0.9));
    const halo = ctx.createRadialGradient(cx, cy, baseR * 0.25, cx, cy, haloR);
    halo.addColorStop(0, `${cols[0]}66`);
    halo.addColorStop(0.55, `${cols[1]}28`);
    halo.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();

    // Lóbulos orgánicos superpuestos estilo Nébula ChatGPT
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i += 1) {
      const ang = tt * (0.7 + i * 0.23) + (i * Math.PI) / 2;
      const orbit = baseR * (0.18 + energy * 0.34);
      const lx = cx + Math.cos(ang) * orbit;
      const ly = cy + Math.sin(ang * 1.15) * orbit;
      const lr = baseR * (0.98 + energy * 0.44 + 0.12 * Math.sin(tt + i * 1.4));
      const lg = ctx.createRadialGradient(lx, ly, lr * 0.08, lx, ly, lr);
      lg.addColorStop(0, `${cols[i]}dd`);
      lg.addColorStop(0.55, `${cols[i]}55`);
      lg.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(lx, ly, lr, 0, Math.PI * 2);
      ctx.fillStyle = lg;
      ctx.fill();
    }
    ctx.restore();

    // Núcleo irisado central
    const coreR = baseR * (0.58 + energy * 0.22);
    const core = ctx.createRadialGradient(cx - coreR * 0.2, cy - coreR * 0.2, 1, cx, cy, coreR * 1.1);
    core.addColorStop(0, '#ffffffea');
    core.addColorStop(0.45, cols[0]);
    core.addColorStop(1, `${cols[1]}00`);
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = core;
    ctx.fill();
  }

  function startOrbAnimation() {
    const headerCanvas = $('voice-orb-canvas');
    const nebulaCanvas = $('avi-nebula-canvas');
    if (!headerCanvas && !nebulaCanvas) return;
    let t = 0;

    function draw() {
      t += 0.045;
      let energy = 0.1;
      if (appState.voice.analyser && appState.voice.freqData) {
        appState.voice.analyser.getByteFrequencyData(appState.voice.freqData);
        const sum = appState.voice.freqData.reduce((a, b) => a + b, 0);
        energy = Math.min(1, sum / (appState.voice.freqData.length * 140));
      } else if (appState.voice.mode === 'speaking') {
        energy = 0.42 + 0.28 * Math.sin(t * 2.6);
      } else if (appState.voice.mode === 'listening') {
        energy = 0.24 + 0.14 * Math.sin(t * 1.7);
      } else if (appState.voice.mode === 'thinking') {
        energy = 0.3 + 0.16 * Math.sin(t * 3.1);
      }

      paintNebulaCanvas(headerCanvas, t, energy, appState.voice.mode, appState.voice.connected);
      paintNebulaCanvas(nebulaCanvas, t, energy, appState.voice.mode, appState.voice.connected);
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }

  function updateVoiceButtonUi() {
    const btn = $('btn-voice-toggle');
    const lbl = $('voice-btn-label');
    const ico = $('voice-btn-icon');
    const txt = $('realtime-status-text');
    const nebBtn = $('avi-nebula-orb-btn');
    const nebDot = $('avi-nebula-state-dot');
    const nebTxt = $('avi-nebula-state-text');
    const name = getAgentName();

    if (nebDot) {
      nebDot.className = `avi-nebula-state-dot ${appState.voice.mode || 'idle'}`;
    }
    if (nebBtn) {
      nebBtn.classList.toggle('live', Boolean(appState.voice.connected));
    }
    if (nebTxt) {
      nebTxt.textContent = appState.voice.connecting
        ? `${name} · Conectando...`
        : appState.voice.mode === 'speaking'
          ? `${name} · Hablando`
          : appState.voice.mode === 'listening'
            ? `${name} · Escuchando`
            : appState.voice.mode === 'thinking'
              ? `${name} · Pensando`
              : appState.voice.connected
                ? `${name} · En vivo`
                : `${name} · Lista`;
    }

    if (appState.voice.connected) {
      btn.classList.add('live');
      ico.textContent = '⏹';
      lbl.textContent = 'Finalizar Voz';
      txt.textContent = `Voz WebRTC EN VIVO · gpt-realtime-2.1 (${appState.voice.mode})`;
    } else if (appState.voice.connecting) {
      ico.textContent = '⏳';
      lbl.textContent = 'Conectando...';
      txt.textContent = 'Abriendo túnel WebRTC gpt-realtime-2.1...';
    } else {
      btn.classList.remove('live');
      ico.textContent = '🎙️';
      lbl.textContent = 'Hablar';
      txt.textContent = 'Voz lista · Vereda La Alejandra, El Zulia';
    }
  }

  async function stopRealtimeVoice() {
    const v = appState.voice;
    if (v.dspTimer) {
      clearInterval(v.dspTimer);
      v.dspTimer = null;
    }
    try { if (v.dc) v.dc.close(); } catch (_) {}
    try { if (v.pc) v.pc.close(); } catch (_) {}
    if (v.micStream) {
      v.micStream.getTracks().forEach((tr) => tr.stop());
    }
    if (v.rawMicStream && v.rawMicStream !== v.micStream) {
      v.rawMicStream.getTracks().forEach((tr) => tr.stop());
    }
    try { if (v.audioCtx) await v.audioCtx.close(); } catch (_) {}
    if (v.remoteAudio) {
      v.remoteAudio.srcObject = null;
      v.remoteAudio.remove();
    }
    v.connected = false;
    v.connecting = false;
    v.mode = 'idle';
    v.pc = null;
    v.dc = null;
    v.micStream = null;
    v.rawMicStream = null;
    v.audioCtx = null;
    v.analyser = null;
    v.freqData = null;
    v.highpassNode = null;
    v.lowpassNode = null;
    v.gateGainNode = null;
    v.remoteAudio = null;
    updateVoiceButtonUi();
  }

  function getNoiseFilterParams(mode) {
    const strict = (mode || 'galpon_estricto') !== 'oficina';
    return strict
      ? { mode: 'galpon_estricto', hpHz: 115, lpHz: 3850, rmsThreshold: 0.025, holdMs: 340, floorGain: 0.018 }
      : { mode: 'oficina', hpHz: 70, lpHz: 6800, rmsThreshold: 0.009, holdMs: 420, floorGain: 0.06 };
  }

  function updateNoiseAndCouncilButtonsUi() {
    const strict = appState.voice.noiseFilterMode !== 'oficina';
    if ($('btn-noise-filter')) {
      $('btn-noise-filter').textContent = strict ? '🛡 Ruido: Galpón' : '🎙 Ruido: Oficina';
    }
    if ($('btn-voice-council-toggle')) {
      $('btn-voice-council-toggle').textContent = appState.voice.autoSpeakExperts ? '🔊 Consejo: Voz ON' : '🔇 Consejo: Voz OFF';
    }
  }

  function toggleNoiseFilterMode() {
    const next = appState.voice.noiseFilterMode === 'oficina' ? 'galpon_estricto' : 'oficina';
    appState.voice.noiseFilterMode = next;
    localStorage.setItem('avicola_noise_filter', next);
    updateNoiseAndCouncilButtonsUi();
    const p = getNoiseFilterParams(next);
    const v = appState.voice;
    if (v.highpassNode && v.audioCtx) {
      v.highpassNode.frequency.setValueAtTime(p.hpHz, v.audioCtx.currentTime);
    }
    if (v.lowpassNode && v.audioCtx) {
      v.lowpassNode.frequency.setValueAtTime(p.lpHz, v.audioCtx.currentTime);
    }
    if (v.dc && v.dc.readyState === 'open') {
      const strict = next !== 'oficina';
      v.dc.send(JSON.stringify({
        type: 'session.update',
        session: {
          audio: {
            input: {
              noise_reduction: { type: strict ? 'near_field' : 'far_field' },
              turn_detection: {
                type: 'semantic_vad',
                eagerness: strict ? 'low' : 'medium',
                create_response: true,
                interrupt_response: true
              }
            }
          }
        }
      }));
    }
    appendTranscript('system', next === 'galpon_estricto'
      ? 'Filtro acústico estricto (Galpón/Viento) activo: corte 115–3850 Hz + puerta -32 dB + near_field.'
      : 'Filtro acústico moderado (Oficina) activo: far_field.');
  }

  function buildNoiseFilteredMicPipeline(audioCtx, rawStream) {
    const srcNode = audioCtx.createMediaStreamSource(rawStream);
    const params = getNoiseFilterParams(appState.voice.noiseFilterMode);

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = params.hpHz;
    highpass.Q.value = 0.9;

    const lowpass = audioCtx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = params.lpHz;
    lowpass.Q.value = 0.7;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.12;

    const gateAnalyser = audioCtx.createAnalyser();
    gateAnalyser.fftSize = 256;
    const orbAnalyser = audioCtx.createAnalyser();
    orbAnalyser.fftSize = 64;

    const gateGain = audioCtx.createGain();
    gateGain.gain.value = 1;

    srcNode.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(gateAnalyser);
    gateAnalyser.connect(gateGain);
    gateGain.connect(orbAnalyser);

    let outboundStream = rawStream;
    let dspTimer = null;
    if (typeof audioCtx.createMediaStreamDestination === 'function') {
      const dest = audioCtx.createMediaStreamDestination();
      gateGain.connect(dest);
      outboundStream = dest.stream;

      const timeBuf = new Float32Array(gateAnalyser.fftSize);
      let lastSpeechMs = 0;
      gateGain.gain.value = params.floorGain;
      dspTimer = setInterval(() => {
        if (!appState.voice.audioCtx || appState.voice.ttsMutedMic) {
          gateGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
          return;
        }
        const cfg = getNoiseFilterParams(appState.voice.noiseFilterMode);
        gateAnalyser.getFloatTimeDomainData(timeBuf);
        let sumSq = 0;
        for (let i = 0; i < timeBuf.length; i += 1) sumSq += timeBuf[i] * timeBuf[i];
        const rms = Math.sqrt(sumSq / timeBuf.length);
        const nowMs = performance.now();
        if (rms >= cfg.rmsThreshold) {
          lastSpeechMs = nowMs;
          gateGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.015);
        } else if (nowMs - lastSpeechMs > cfg.holdMs) {
          gateGain.gain.setTargetAtTime(cfg.floorGain, audioCtx.currentTime, 0.075);
        }
      }, 25);
    }

    return {
      outboundStream,
      orbAnalyser,
      highpass,
      lowpass,
      gateGain,
      dspTimer
    };
  }

  async function handleRealtimeServerEvent(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'input_audio_buffer.speech_started') {
      appState.voice.mode = 'listening';
      updateVoiceButtonUi();
    } else if (ev.type === 'conversation.item.input_audio_transcription.completed' && ev.transcript) {
      const cleanTx = String(ev.transcript || '').trim();
      const hasNonLatinScript = /[\u0400-\u052F\u0600-\u06FF\u0900-\u097F\u0D80-\u0DFF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/.test(cleanTx);
      const plainLen = cleanTx.replace(/[\s.,!?¡¿"'。、]+/g, '').length;
      if (hasNonLatinScript || plainLen < 2) {
        return;
      }
      appendTranscript('user', cleanTx);
      handleLocalAviPresenceIntent(cleanTx);
      appState.voice.mode = 'thinking';
      updateVoiceButtonUi();
    } else if ((ev.type === 'response.audio_transcript.delta' || ev.type === 'response.output_audio_transcript.delta') && ev.delta) {
      appState.voice.mode = 'speaking';
      appState.voice.assistantBuffer += ev.delta;
      updateVoiceButtonUi();
    } else if (ev.type === 'response.audio_transcript.done' || ev.type === 'response.output_audio_transcript.done') {
      const full = ev.transcript || appState.voice.assistantBuffer;
      appState.voice.assistantBuffer = '';
      if (full) {
        appState.lastAssistantReply = full;
        appendTranscript('assistant', full);
      }
      appState.voice.mode = 'listening';
      updateVoiceButtonUi();
    } else if (ev.type === 'response.function_call_arguments.done') {
      try {
        const res = await apiJson('/api/realtime/tool-call', {
          method: 'POST',
          body: { name: ev.name, arguments: ev.arguments, sourceChannel: 'web_realtime', uiContext: collectLiveUiContext() }
        });
        if (res.snapshot) {
          appState.whatIfActive = false;
          applyOfficialSnapshot(res.snapshot);
        }
        if (res.uiAction && res.uiAction.action === 'speak_expert_voice' && res.uiAction.speakOutLoud) {
          await speakExpertIntervention(res.uiAction, false);
        } else if (res.uiAction && res.uiAction.action === 'avi_vision_dialogue') {
          await playAviVisionDialogue(res.uiAction, Boolean(res.uiAction.speakOutLoud));
        } else if (res.uiAction) {
          applyUiChoreography(res.uiAction);
        }
        if (appState.voice.dc && appState.voice.dc.readyState === 'open') {
          appState.voice.dc.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: ev.call_id,
                output: JSON.stringify(res.output || { ok: true })
              }
            })
          );
          appState.voice.dc.send(JSON.stringify({ type: 'response.create' }));
        }
      } catch (err) {
        appendTranscript('system', `Error ejecutando herramienta ${ev.name}: ${err.message}`);
      }
    }
  }

  async function startRealtimeVoice() {
    if (appState.voice.connecting || appState.voice.connected) return;
    if (appState.voice.pc || appState.voice.dc) {
      await stopRealtimeVoice().catch(() => {});
    }
    appState.voice.connecting = true;
    updateVoiceButtonUi();

    try {
      const sessionRes = await apiJson('/api/realtime/session', {
        method: 'POST',
        body: { noiseProfile: appState.voice.noiseFilterMode, uiContext: collectLiveUiContext() }
      });
      const rawMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dsp = buildNoiseFilteredMicPipeline(audioCtx, rawMicStream);
      const micStream = dsp.outboundStream;
      const analyser = dsp.orbAnalyser;

      const pc = new RTCPeerConnection();
      const remoteAudio = document.createElement('audio');
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
      Object.assign(appState.voice, {
        pc,
        micStream,
        rawMicStream,
        remoteAudio,
        audioCtx,
        dspTimer: dsp.dspTimer,
        highpassNode: dsp.highpass,
        lowpassNode: dsp.lowpass,
        gateGainNode: dsp.gateGain,
        baseInstructions: sessionRes.instructions || ''
      });
      pc.ontrack = (e) => {
        remoteAudio.srcObject = e.streams[0];
      };
      micStream.getTracks().forEach((tr) => pc.addTrack(tr, micStream));

      const dc = pc.createDataChannel('oai-events');
      appState.voice.dc = dc;
      dc.addEventListener('message', (msgEv) => {
        try {
          handleRealtimeServerEvent(JSON.parse(msgEv.data));
        } catch (_) {}
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(sessionRes.webrtcCallsUrl || 'https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionRes.clientSecret}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });
      if (!sdpRes.ok) {
        const err429 = sdpRes.status === 429;
        const msg = err429
          ? 'OpenAI Realtime rechazó WebRTC SDP (429: límite temporal de sesiones/cuota). Usa el chat de texto abajo: sigue activo con gpt-6.1-sol y voz TTS.'
          : `OpenAI Realtime rechazó WebRTC SDP (${sdpRes.status})`;
        const err = new Error(msg);
        err.isRateLimit = err429;
        throw err;
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      Object.assign(appState.voice, {
        connected: true,
        connecting: false,
        mode: 'listening',
        pc,
        dc,
        micStream,
        rawMicStream,
        remoteAudio,
        audioCtx,
        analyser,
        freqData: new Uint8Array(analyser.frequencyBinCount),
        dspTimer: dsp.dspTimer,
        highpassNode: dsp.highpass,
        lowpassNode: dsp.lowpass,
        gateGainNode: dsp.gateGain,
        baseInstructions: sessionRes.instructions || ''
      });
      updateVoiceButtonUi();
      const filterDesc = appState.voice.noiseFilterMode === 'oficina' ? 'Filtro Oficina' : 'Filtro Galpón Exigente';
      appendTranscript('system', `Voz Realtime WebRTC conectada (${filterDesc} · Moderadora Avi marin 1.18x + expertos multi-voz).`);
    } catch (err) {
      await stopRealtimeVoice();
      appendTranscript('system', `No se pudo iniciar voz WebRTC: ${err.message}`);
      if (err.isRateLimit || /429/i.test(String(err.message || ''))) {
        setConversationDrawerOpen(true);
        if ($('dock-chat-input')) $('dock-chat-input').focus();
      }
    }
  }

  function setMicTracksMuted(muted) {
    for (const stream of [appState.voice?.micStream, appState.voice?.rawMicStream]) {
      if (stream && typeof stream.getAudioTracks === 'function') {
        stream.getAudioTracks().forEach((track) => {
          try { track.enabled = !muted; } catch (_) {}
        });
      }
    }
    const remote = appState.voice && appState.voice.remoteAudio;
    if (remote) {
      try { remote.muted = Boolean(muted); } catch (_) {}
    }
    if (appState.voice) {
      appState.voice.ttsMutedMic = Boolean(muted);
    }
  }

  async function fetchTtsAudioBlob(text, opts = {}) {
    const cleanSpeech = sanitizeSpeechForCop(text);
    if (!cleanSpeech) return null;
    const body = { text: cleanSpeech };
    if (opts.voice) body.voice = opts.voice;
    if (opts.speed !== undefined) body.speed = opts.speed;
    if (opts.instructions) body.instructions = opts.instructions;
    const res = await fetch('/api/agent/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { cleanSpeech, blob: await res.blob() };
  }

  async function speakTextTts(text, opts = {}) {
    const cleanSpeech = sanitizeSpeechForCop(text);
    if (!cleanSpeech) return;
    if (appState.audioPlayback) {
      try { appState.audioPlayback.pause(); } catch (_) {}
      appState.audioPlayback = null;
    }
    appState.voice.mode = 'speaking';
    updateVoiceButtonUi();
    setMicTracksMuted(true);
    try {
      const payload = opts.blobPromise
        ? await opts.blobPromise
        : await fetchTtsAudioBlob(cleanSpeech, opts);
      if (!payload || !payload.blob) return;
      if (opts.isAborted && opts.isAborted()) return;

      const url = URL.createObjectURL(payload.blob);
      const audio = new Audio(url);
      appState.audioPlayback = audio;
      const playbackTimeoutMs = Math.max(30000, Math.min(90000, Math.ceil((cleanSpeech.length / 8) * 1000) + 15000));
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (appState.audioPlayback === audio) appState.audioPlayback = null;
          try { URL.revokeObjectURL(url); } catch (_) {}
          resolve();
        };
        const timer = setTimeout(finish, playbackTimeoutMs);
        audio.onended = finish;
        audio.onpause = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
      });
    } finally {
      if (!opts.keepMicMuted) {
        setMicTracksMuted(false);
      }
      appState.voice.mode = appState.voice.connected ? 'listening' : 'idle';
      updateVoiceButtonUi();
    }
  }

  // =========================================================================
  // Paleta Ctrl+K & Modal de Credenciales
  // =========================================================================
  const COMMAND_LIST = [
    { label: 'Iniciar o detener Voz en Vivo', hint: 'Voz Avi', run: () => (appState.voice.connected ? stopRealtimeVoice() : startRealtimeVoice()) },
    { label: 'Ejecutar Resumen Guiado Audible', hint: 'Tour Avi', run: () => runGuidedBriefing() },
    { label: 'Simular Salida a 45 Días (Meta 2,72 kg canal)', hint: 'Proyecciones', run: () => { applySlidersFromOverrides({ edadObjetivoDias: 45 }); focusSection('simulador_whatif'); } },
    { label: 'Simular Alimento Propio en Lotes 2 y 3', hint: 'Ahorro', ownerOnly: true, run: () => { $('toggle-alimento-propio').checked = true; onSliderInput(); focusSection('plan_av1'); } },
    { label: 'Descargar Excel Granja En Vivo (.xlsx)', hint: 'Excel', run: () => { window.location.href = '/api/excel/download/AV2'; } },
    { label: 'Cambiar Usuario / Perfil', hint: 'Sesión', run: () => $('btn-user-menu')?.click() },
    { label: 'Revertir Último Evento Operativo', hint: 'Deshacer', run: () => $('btn-undo').click() },
    { label: 'Alternar Tema Oscuro / Claro', hint: 'Apariencia', run: () => toggleTheme() },
    { label: 'Configuración de Credenciales e Integraciones', hint: 'Admin', ownerOnly: true, run: () => openCredentialsModal() },
    { label: 'Ir a Reportes y Actas PDF', hint: 'Reportes', run: () => focusSection('puente_antigravity') }
  ];

  function openCmdPalette() {
    $('modal-cmd').classList.remove('hidden');
    $('cmd-search-input').value = '';
    appState.cmdSelectedIdx = 0;
    renderCmdResults('');
    setTimeout(() => $('cmd-search-input').focus(), 20);
  }

  function closeCmdPalette() {
    $('modal-cmd').classList.add('hidden');
  }

  function renderCmdResults(query) {
    const q = String(query || '').toLowerCase();
    const isPartner = isPartnerScope();
    const filtered = COMMAND_LIST.filter((c) => !(isPartner && c.ownerOnly) && (c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q)));
    appState.cmdSelectedIdx = Math.min(appState.cmdSelectedIdx, Math.max(0, filtered.length - 1));
    $('cmd-results').innerHTML = filtered
      .map(
        (c, i) => `
        <button type="button" class="cmd-item ${i === appState.cmdSelectedIdx ? 'selected' : ''}" data-cmd-idx="${i}">
          <span>${escapeHtml(c.label)}</span>
          <span class="pill">${escapeHtml(c.hint)}</span>
        </button>
      `
      )
      .join('');
    $('cmd-results').querySelectorAll('[data-cmd-idx]').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        closeCmdPalette();
        filtered[i].run();
      });
    });
  }

  function updateCredentialsUi() {
    const st = appState.credentialsStatus;
    if (!st) return;
    $('credentials-status-badges').innerHTML = `
      <span class="pill ${st.openai.configured ? 'ok' : 'danger'}">OpenAI: ${st.openai.configured ? `${st.openai.realtimeModel} OK` : 'Falta Key'}</span>
      <span class="pill ${st.supabase.configured ? 'ok' : 'warn'}">Supabase: ${st.supabase.configured ? 'Conectado' : 'Modo Local'}</span>
      <span class="pill ${st.telegram.running ? 'ok' : 'warn'}">Telegram: ${st.telegram.running ? `@${st.telegram.botUsername}` : 'En espera de Token'}</span>
    `;
    $('cred-voice-name').value = st.openai.voice || 'marin';
    $('cred-voice-speed').value = st.openai.speed || 1.18;
  }

  function openCredentialsModal() {
    updateCredentialsUi();
    $('modal-credentials').classList.remove('hidden');
  }

  function openCouncilModal() {
    $('modal-council').classList.remove('hidden');
  }

  function closeCouncilModal() {
    $('modal-council').classList.add('hidden');
  }

  function updateThemeButtonLabel() {
    const btn = $('btn-theme');
    if (!btn) return;
    btn.textContent = appState.theme === 'solar' ? 'Tema: Claro' : 'Tema: Oscuro';
  }

  function toggleTheme() {
    appState.theme = appState.theme === 'solar' ? 'obsidian' : 'solar';
    document.documentElement.setAttribute('data-theme', appState.theme);
    localStorage.setItem('avicola_theme', appState.theme);
    updateThemeButtonLabel();
  }

  // Briefing Guiado Ciclo 2: coreografía Spotlight + subtítulo vivo + voz 1.18x no bloqueante
  let briefingAbort = false;
  let briefingInFlight = false;

  function renderBriefingBanner(stepIdx, total, title, text) {
    const banner = $('briefing-banner');
    if (!banner) return;
    if (stepIdx < 0) {
      banner.classList.add('hidden');
      banner.innerHTML = '';
      return;
    }
    const pct = Math.round(((stepIdx + 1) / total) * 100);
    banner.classList.remove('hidden');
    banner.innerHTML = `
      <div class="briefing-top">
        <div>
          <span class="pill accent">Briefing Ejecutivo 1.18x · Paso ${stepIdx + 1}/${total}</span>
          <strong style="margin-left:8px;">${escapeHtml(title)}</strong>
        </div>
        <button type="button" class="btn-xs" id="btn-stop-briefing">⏹ Detener</button>
      </div>
      <div class="briefing-text">${escapeHtml(text)}</div>
      <div class="briefing-progress"><span style="width:${pct}%"></span></div>
    `;
    const stopBtn = $('btn-stop-briefing');
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        briefingAbort = true;
        if (appState.audioPlayback) {
          try { appState.audioPlayback.pause(); } catch (_) {}
          appState.audioPlayback = null;
        }
        setMicTracksMuted(false);
        renderBriefingBanner(-1);
      });
    }
  }

  async function runGuidedBriefing() {
    if (briefingInFlight) return;
    const c = appState.officialComputed;
    if (!c) return;
    briefingInFlight = true;
    briefingAbort = false;
    const l1 = c.av2.lotes[0];
    const bod = c.av2.auditoriaBodegaLote1;
    const tes = c.av2.tesoreriaResumen;
    const cont = c.av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18 }, saldoFinalContinuo: tes.saldoFinalPost4m, semanasTotales: 18 };
    const piezas100 = c.av2.ventasParcialesResumen?.comparativaModalidadesLote1?.piezas100 || { utilidadCop: 0, extraVsCanalCop: 0 };

    let steps = [];
    try {
      const remote = await apiJson('/api/agent/guided-briefing', {
        method: 'POST',
        body: {}
      });
      if (remote && Array.isArray(remote.steps) && remote.steps.length > 0) {
        steps = remote.steps;
      }
    } catch (_) {}

    if (steps.length === 0) {
      const fallbackSteps = [
        {
          section: 'resumen_ejecutivo',
          title: '1 · Estrategia & Foco Comercial (Jobs · Porter)',
          displayText: `Operación continua comprometida: Lote 1 (${l1.avesInic} aves) deja ${cop(l1.utilidadCanal)} en canal con menudencias y enlaza con Lotes 2–3 (${cop((c.av2.lotes[1]?.utilidadCanal || 0) + (c.av2.lotes[2]?.utilidadCanal || 0))}) ya asegurados en compra directa a $3.200/pollito (-28,9%). El desposte es opcional (+${cop(piezas100.extraVsCanalCop)}) sujeto a rotación en frío.`,
          speechText: `Paso 1. Operación continua comprometida. El Lote 1 de ${l1.avesInic} aves deja ${cop(l1.utilidadCanal)} pesos y enlaza con Lotes 2 y 3 con pollito directo a 3 mil 200 pesos.`
        },
        {
          section: 'operacion_av2',
          title: '2 · Cuadro de Mando KPIs (Kaplan & Norton)',
          displayText: `Utilidad 3 lotes: ${cop(c.av2.consolidado3Lotes.utilidadCanal)} | Tope caja 23-dic (víspera cosecha L1): -${cop(tes.capitalTrabajoPicoSem7)} | Ciclos continuos ${cont.config.avesPorLote} c/${cont.config.cadenciaDias}d acumulan ${cop(cont.saldoFinalContinuo)} al corte ${cont.semanasTotales}.`,
          speechText: `Paso 2, Cuadro de Mando Integral. El tope de inversión ocurre el 23 de diciembre, un día antes del primer cobro, por ${cop(tes.capitalTrabajoPicoSem7)} pesos, pero la continuidad lleva la caja a ${cop(cont.saldoFinalContinuo)} pesos.`
        },
        {
          section: 'bodega_termica',
          title: '3 · Bodega Solla JIT & Postura Negociadora (Kotler · Voss)',
          displayText: `${(bod.fisicaJit?.compradoHoy?.totalBultos ?? 3)} bultos comprados en piso (plan JIT Sem 2–6: ${bod.fisicaJit?.porComprarJit?.nutrepollo ?? 16} Nutrepollo y ${bod.fisicaJit?.porComprarJit?.broiler ?? 48} Broiler sin inmovilizar capital). Con compradores aplicamos postura firme sobre volumen continuo sin regalar margen ni caer en descalce por pechugas sueltas.`,
          speechText: `Paso 3, Bodega Justo a Tiempo Solla y Negociación Táctica. Tenemos ${bod.fisicaJit?.compradoHoy?.totalBultos ?? 3} bultos comprados para el arranque actual y compraremos escalonado ${bod.fisicaJit?.porComprarJit?.nutrepollo ?? 16} bultos de iniciación y ${bod.fisicaJit?.porComprarJit?.broiler ?? 48} de engorde conforme cambien de etapa.`
        },
        {
          section: 'simulador_whatif',
          title: '4 · Curva Ross 308 & Escenarios Flexibles de Talla',
          displayText: `Plan base Día 42: ~3,00 kg vivo / 2,47 kg canal (~840 g pechuga, FCR 1,63). El simulador proyecta dinámicamente el día exacto para cualquier peso objetivo en pie, canal o pechuga entre Día 28 y Día 49 vigilando densidad en El Zulia.`,
          speechText: `Paso 4, Curva Ross 308 flexible. El plan base apunta a Día 42 con 2,47 kilos en canal, y puedes simular en segundos cualquier escenario de talla especial por corte vigilando entresaca térmica en El Zulia.`
        }
      ];
      steps = fallbackSteps;
    }

    $('realtime-status-text').textContent = 'Resumen Estratégico Avi en curso...';
    const stepSpeech = (st) => (st ? (st.speechText || st.displayText || st.text || '') : '');
    let currentAudioPromise = steps.length > 0
      ? fetchTtsAudioBlob(stepSpeech(steps[0])).catch(() => null)
      : null;

    setMicTracksMuted(true);
    try {
      for (let i = 0; i < steps.length; i += 1) {
        if (briefingAbort) break;
        const st = steps[i];
        const shownText = st.displayText || st.text || '';
        const spokenText = stepSpeech(st);
        const nextAudioPromise = i + 1 < steps.length
          ? fetchTtsAudioBlob(stepSpeech(steps[i + 1])).catch(() => null)
          : null;

        focusSection(st.section, st.title);
        renderBriefingBanner(i, steps.length, st.title, shownText);
        appendTranscript('assistant', `${st.title}\n${shownText}`);
        await speakTextTts(spokenText, {
          blobPromise: currentAudioPromise,
          isAborted: () => briefingAbort,
          keepMicMuted: i + 1 < steps.length
        }).catch(() => {});
        currentAudioPromise = nextAudioPromise;
        if (!briefingAbort && i + 1 < steps.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } finally {
      briefingInFlight = false;
      setMicTracksMuted(false);
    }
    if (!briefingAbort) {
      setTimeout(() => renderBriefingBanner(-1), 2600);
    }
    updateVoiceButtonUi();
  }

  // =========================================================================
  // Inicialización y Listeners
  // =========================================================================
  function bindEvents() {
    document.documentElement.setAttribute('data-theme', appState.theme);
    updateThemeButtonLabel();

    if ($('sync-concil-pill')) {
      $('sync-concil-pill').addEventListener('click', () => {
        $('modal-concil')?.classList.remove('hidden');
      });
    }
    if ($('btn-close-concil')) {
      $('btn-close-concil').addEventListener('click', () => {
        $('modal-concil')?.classList.add('hidden');
      });
    }
    if ($('modal-concil')) {
      $('modal-concil').addEventListener('click', (e) => {
        if (e.target === $('modal-concil')) $('modal-concil').classList.add('hidden');
      });
    }

    $('btn-theme').addEventListener('click', toggleTheme);
    $('btn-voice-toggle').addEventListener('click', () => (appState.voice.connected ? stopRealtimeVoice() : startRealtimeVoice()));
    $('orb-trigger').addEventListener('click', () => (appState.voice.connected ? stopRealtimeVoice() : startRealtimeVoice()));
    $('btn-briefing').addEventListener('click', () => runGuidedBriefing());
    $('btn-cmd-palette').addEventListener('click', openCmdPalette);
    $('btn-close-cmd').addEventListener('click', closeCmdPalette);
    $('btn-council').addEventListener('click', openCouncilModal);
    $('btn-close-council').addEventListener('click', closeCouncilModal);
    $('modal-council').addEventListener('click', (e) => {
      if (e.target === $('modal-council')) closeCouncilModal();
    });
    $('btn-credentials').addEventListener('click', openCredentialsModal);
    $('btn-close-credentials').addEventListener('click', () => $('modal-credentials').classList.add('hidden'));

    document.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => focusSection(btn.dataset.jump));
    });
    if ($('btn-layout-paged')) {
      $('btn-layout-paged').addEventListener('click', () => applyLayoutViewMode('paged'));
    }
    if ($('btn-layout-scroll')) {
      $('btn-layout-scroll').addEventListener('click', () => applyLayoutViewMode('scroll'));
    }

    if ($('btn-hero-cash-3l')) {
      $('btn-hero-cash-3l').addEventListener('click', () => {
        appState.heroCashMode = '3lotes';
        renderHeroBridge(getActiveSimulation().computed, getActiveSimulation().state);
      });
    }
    if ($('btn-hero-cash-cont')) {
      $('btn-hero-cash-cont').addEventListener('click', () => {
        appState.heroCashMode = 'continuo';
        renderHeroBridge(getActiveSimulation().computed, getActiveSimulation().state);
      });
    }

    ['rng-edad', 'rng-precio-canal', 'rng-precio-vivo', 'rng-mort', 'rng-clima', 'rng-area', 'toggle-alimento-propio'].forEach((id) => {
      $(id).addEventListener('input', onSliderInput);
      $(id).addEventListener('change', onSliderInput);
    });

    document.querySelectorAll('[data-age]').forEach((btn) => {
      btn.addEventListener('click', () => applySlidersFromOverrides({ edadObjetivoDias: Number(btn.dataset.age) }));
    });

    $('btn-reset-whatif').addEventListener('click', () => {
      appState.whatIfActive = false;
      appState.whatIfOverrides = null;
      syncSlidersToState(appState.officialState);
      renderAll();
    });

    $('btn-commit-whatif').addEventListener('click', async () => {
      const ov = readOverridesFromSliders();
      const nextLotes = (appState.officialState.lotes || []).map((l, idx) => ({
        ...l,
        edadObjetivoDias: ov.edadGlobal,
        mortalidadEsperadaPct: ov.mortalidadPct,
        programaAlimento: idx >= 1 ? ov.programaAlimentoLotes23 : l.programaAlimento
      }));
      await postOperationalEvent({
        type: 'PARAM_UPDATE',
        sourceChannel: 'web_whatif_commit',
        payload: {
          preciosRegionales: ov.preciosRegionales,
          parametrosGenerales: {
            ...ov.parametrosGenerales,
            edadObjetivoGlobal: ov.edadGlobal,
            mortalidadEsperadaPct: ov.mortalidadPct
          },
          lotes: nextLotes
        }
      });
      appendTranscript('system', 'Parámetros What-If fijados como nuevo estado oficial del Gemelo Digital.');
    });

    $('btn-undo').addEventListener('click', async () => {
      try {
        const rolled = await apiJson('/api/twin/rollback', { method: 'POST', body: {} });
        appState.whatIfActive = false;
        applyOfficialSnapshot(rolled.snapshot);
        appendTranscript('system', `Evento ${rolled.revertedType} revertido. Estado actual: ${rolled.snapshot.version} ${rolled.snapshot.version === 1 ? 'reg.' : 'regs.'}.`);
      } catch (err) {
        appendTranscript('system', `Rollback: ${err.message}`);
      }
    });

    $('form-daily-log').addEventListener('submit', async (e) => {
      e.preventDefault();
      await postOperationalEvent({
        type: 'DAILY_LOG',
        sourceChannel: 'web_form',
        payload: {
          dia: Number($('inp-dia').value),
          mortalidad: Number($('inp-mort').value || 0),
          descarte: Number($('inp-desc').value || 0),
          alimRealKg: $('inp-alim').value ? Number($('inp-alim').value) : null,
          tempC: $('inp-temp').value ? Number($('inp-temp').value) : null,
          aguaL: $('inp-agua').value ? Number($('inp-agua').value) : null,
          observacion: $('inp-obs').value || ''
        }
      });
      appendTranscript('system', `Registrado Día ${$('inp-dia').value} en bitácora del Lote 1.`);
    });

    $('form-weighing').addEventListener('submit', async (e) => {
      e.preventDefault();
      await postOperationalEvent({
        type: 'SAMPLE_WEIGHING',
        sourceChannel: 'web_form',
        payload: {
          dia: Number($('inp-pes-dia').value),
          muestraAves: Number($('inp-pes-aves').value),
          pesoMuestraKg: Number($('inp-pes-kg').value)
        }
      });
      appendTranscript('system', `Registrado pesaje Día ${$('inp-pes-dia').value} (${$('inp-pes-kg').value} kg).`);
    });

    if ($('btn-buy-nutre2')) {
      $('btn-buy-nutre2').addEventListener('click', () =>
        postOperationalEvent({ type: 'FEED_PURCHASE', sourceChannel: 'web_quick_jit', payload: { fase: 'Nutrepollo Cr SP', bultos: 2 } })
      );
    }
    $('btn-buy-nutre5').addEventListener('click', () =>
      postOperationalEvent({ type: 'FEED_PURCHASE', sourceChannel: 'web_quick', payload: { fase: 'Nutrepollo Cr SP', bultos: 5 } })
    );
    $('btn-buy-broiler8').addEventListener('click', () =>
      postOperationalEvent({ type: 'FEED_PURCHASE', sourceChannel: 'web_quick', payload: { fase: 'Broiler I Dorado', bultos: 8 } })
    );

    // Flujo Semanal: Horizonte + Cierre Mixto + Continuidad 900
    if ($('btn-flow-horizon-cont')) {
      $('btn-flow-horizon-cont').addEventListener('click', () => {
        appState.cashflowHorizon = 'continuo';
        renderAv2Operations(getActiveSimulation().computed);
      });
    }
    if ($('btn-flow-horizon-11')) {
      $('btn-flow-horizon-11').addEventListener('click', () => {
        appState.cashflowHorizon = 'initial11';
        renderAv2Operations(getActiveSimulation().computed);
      });
    }
    if ($('sel-mix-lote')) {
      $('sel-mix-lote').addEventListener('change', (e) => {
        appState.mixSelectedLote = e.target.value || 'lote-1';
        renderAv2Operations(getActiveSimulation().computed);
      });
    }
    if ($('btn-apply-mix-sale')) {
      $('btn-apply-mix-sale').addEventListener('click', async () => {
        const loteId = $('sel-mix-lote')?.value || 'lote-1';
        const edadVal = $('sel-mix-edad')?.value ? Number($('sel-mix-edad').value) : undefined;
        await postOperationalEvent({
          type: 'LOTE_MIXED_SALE_CONFIG',
          sourceChannel: 'web_mix_sim',
          payload: {
            loteId,
            tramoEspecialAves: Number($('inp-mix-aves')?.value || 0),
            precioTramoEspecialKg: Number($('inp-mix-precio-esp')?.value || 13000),
            precioRestoKg: $('inp-mix-precio-resto')?.value ? Number($('inp-mix-precio-resto').value) : null,
            edadObjetivoDias: edadVal
          }
        });
      });
    }
    if ($('btn-preset-mix-200')) {
      $('btn-preset-mix-200').addEventListener('click', async () => {
        appState.mixSelectedLote = 'lote-1';
        if ($('sel-mix-lote')) $('sel-mix-lote').value = 'lote-1';
        if ($('inp-mix-aves')) $('inp-mix-aves').value = 200;
        if ($('inp-mix-precio-esp')) $('inp-mix-precio-esp').value = 13000;
        if ($('inp-mix-precio-resto')) $('inp-mix-precio-resto').value = 11000;
        await postOperationalEvent({
          type: 'LOTE_MIXED_SALE_CONFIG',
          sourceChannel: 'web_mix_preset',
          payload: { loteId: 'lote-1', tramoEspecialAves: 200, precioTramoEspecialKg: 13000, precioRestoKg: 11000 }
        });
      });
    }
    if ($('btn-reset-mix-sale')) {
      $('btn-reset-mix-sale').addEventListener('click', async () => {
        const loteId = $('sel-mix-lote')?.value || 'lote-1';
        if ($('inp-mix-aves')) $('inp-mix-aves').value = 0;
        if ($('inp-mix-precio-resto')) $('inp-mix-precio-resto').value = '';
        await postOperationalEvent({
          type: 'LOTE_MIXED_SALE_CONFIG',
          sourceChannel: 'web_mix_reset',
          payload: { loteId, tramoEspecialAves: 0, precioRestoKg: null }
        });
      });
    }
    if ($('btn-apply-cont-config')) {
      $('btn-apply-cont-config').addEventListener('click', async () => {
        appState.cashflowHorizon = 'continuo';
        await postOperationalEvent({
          type: 'CONTINUOUS_CYCLE_CONFIG',
          sourceChannel: 'web_cont_sim',
          payload: {
            avesPorLote: Number($('inp-cont-aves')?.value || 900),
            cadenciaDias: Number($('inp-cont-cadencia')?.value || 18),
            lotesAdicionales: Number($('inp-cont-lotes')?.value || 3)
          }
        });
      });
    }

    // Calculadora reactiva Desposte / Presas en 3 Mercados + Simulador flexible por corte objetivo
    ['calc-desp-aves', 'calc-desp-pechugas-vend', 'calc-desp-p-pechuga', 'calc-desp-p-pernil', 'calc-desp-p-alas', 'calc-desp-p-menud', 'calc-desp-p-espinazo', 'calc-desp-target-pechuga', 'calc-desp-target-corte'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const evtName = id === 'calc-desp-target-corte' ? 'change' : 'input';
      el.addEventListener(evtName, () => {
        if (id === 'calc-desp-aves') appState.desposteCalcEditedAves = true;
        else if (id === 'calc-desp-target-corte') {
          const defVal = el.value === 'vivo' ? '3.00' : (el.value === 'canal' ? '2.47' : '0.84');
          if ($('calc-desp-target-pechuga')) $('calc-desp-target-pechuga').value = defVal;
        } else if (id !== 'calc-desp-target-pechuga') {
          appState.desposteCalcTouched = true;
        }
        renderDesposteSplitCalc(getActiveSimulation().computed);
      });
    });
    document.querySelectorAll('[data-pechuga-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if ($('calc-desp-target-corte') && btn.dataset.simCorte) {
          $('calc-desp-target-corte').value = btn.dataset.simCorte;
        }
        if ($('calc-desp-target-pechuga')) {
          $('calc-desp-target-pechuga').value = Number(btn.dataset.pechugaTarget).toFixed(2);
        }
        renderDesposteSplitCalc(getActiveSimulation().computed);
      });
    });
    if ($('btn-save-desposte-prices')) {
      $('btn-save-desposte-prices').addEventListener('click', async () => {
        await postOperationalEvent({
          type: 'PARTIAL_SALE',
          sourceChannel: 'web_desposte_cfg',
          payload: {
            desposteConfig: {
              precioPechugaKg: Number($('calc-desp-p-pechuga')?.value || 14800),
              precioPernilMusloKg: Number($('calc-desp-p-pernil')?.value || 12500),
              precioAlasKg: Number($('calc-desp-p-alas')?.value || 13500),
              precioMenudenciasKg: Number($('calc-desp-p-menud')?.value || 6000),
              precioEspinazoKg: Number($('calc-desp-p-espinazo')?.value || 4500)
            }
          }
        });
        appendTranscript('system', 'Precios de desposte / presas guardados en el estado oficial.');
      });
    }

    // Excel Dropzone y Global Drag & Drop
    $('btn-select-excel').addEventListener('click', () => $('excel-file-input').click());
    $('excel-file-input').addEventListener('change', (e) => {
      if (e.target.files[0]) handleExcelFileUpload(e.target.files[0]);
    });

    const dz = $('excel-dropzone');
    dz.addEventListener('dragover', (e) => {
      e.preventDefault();
      dz.classList.add('dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      dz.classList.remove('dragover');
      if (e.dataTransfer.files[0]) handleExcelFileUpload(e.dataTransfer.files[0]);
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      $('global-drop-overlay').classList.remove('hidden');
    });
    window.addEventListener('dragleave', (e) => {
      if (!e.relatedTarget) $('global-drop-overlay').classList.add('hidden');
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      $('global-drop-overlay').classList.add('hidden');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (/\.xlsx$/i.test(file.name)) {
        handleExcelFileUpload(file);
      } else if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          appState.pendingImageBase64 = reader.result;
          appState.pendingImageMime = file.type;
          appendTranscript('system', `Imagen ${file.name} adjuntada. Escribe una instrucción o pulsa "Enviar a gpt-6.1-sol".`);
        };
        reader.readAsDataURL(file);
      }
    });

    // Bridge Antigravity RFC form
    $('form-new-rfc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await apiJson('/api/bridge/rfcs', {
        method: 'POST',
        body: {
          titulo: $('inp-rfc-title').value,
          descripcion: $('inp-rfc-desc').value,
          sourceChannel: 'web'
        }
      });
      $('inp-rfc-title').value = '';
      $('inp-rfc-desc').value = '';
      const rfcRes = await apiJson('/api/bridge/rfcs');
      appState.rfcs = rfcRes.rfcs || [];
      renderRfcs();
      appendTranscript('system', `Propuesta ${res.rfc.rfcCode} creada. Apruébala cuando quieras enviarla a ANTIGRAVITY_INBOX.md.`);
    });

    // Dock Multimodal Chat & Presencia Nébula Móvil
    if ($('btn-nebula-chat-toggle')) {
      $('btn-nebula-chat-toggle').addEventListener('click', () => {
        setConversationDrawerOpen(!appState.aviPresence.drawerOpen);
      });
    }
    if ($('btn-nebula-mini-toggle')) {
      $('btn-nebula-mini-toggle').addEventListener('click', () => {
        const w = $('avi-nebula-widget');
        if (!w) return;
        const collapsed = w.classList.toggle('mobile-mini');
        $('btn-nebula-mini-toggle').textContent = collapsed ? '▴' : '▾';
        moveAviPresence(appState.aviPresence.position);
      });
    }
    document.querySelectorAll('[data-specialist]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const spec = btn.dataset.specialist;
        try {
          setConversationDrawerOpen(true);
          const res = await apiJson('/api/agent/specialist', {
            method: 'POST',
            body: { especialista: spec, uiContext: collectLiveUiContext() }
          });
          if (spec === 'gerencia_excelencia_operacional') setActiveExpert('EXP-VISION');
          if (spec === 'sanidad_bioseguridad_ica') setActiveExpert('EXP-ICA');
          if (spec === 'nutricion_planta_concentrados') setActiveExpert('EXP-NUTRI');
          await speakExpertIntervention({ ...res, speakOutLoud: appState.voice.autoSpeakExperts }, false);
        } catch (err) {
          appendTranscript('system', `Error subagente: ${err.message}`);
        }
      });
    });
    if ($('btn-avi-vision-dialogue')) {
      $('btn-avi-vision-dialogue').addEventListener('click', () => {
        triggerAviVisionDialogue({ spontaneous: false, speakOutLoud: appState.voice.autoSpeakExperts });
      });
    }
    if ($('btn-sim-avi-vision-duo')) {
      $('btn-sim-avi-vision-duo').addEventListener('click', () => {
        triggerAviVisionDialogue({ spontaneous: false, speakOutLoud: appState.voice.autoSpeakExperts });
      });
    }
    if ($('btn-vision-spontaneous-hear')) {
      $('btn-vision-spontaneous-hear').addEventListener('click', () => {
        const spont = appState.wowSimulation.lastSpontaneous;
        const reason = (spont && spont.triggerReasons && spont.triggerReasons[0]) || '';
        triggerAviVisionDialogue({ topic: reason, spontaneous: true, speakOutLoud: appState.voice.autoSpeakExperts });
      });
    }
    if ($('btn-run-elephant-goldfish')) {
      $('btn-run-elephant-goldfish').addEventListener('click', () => {
        runElephantGoldfishFromUi();
      });
    }
    if ($('wow-sim-tabs')) {
      $('wow-sim-tabs').addEventListener('click', (e) => {
        const btn = e.target.closest('.wow-sim-tab');
        if (!btn) return;
        const nextSim = btn.dataset.wowSim;
        if (!nextSim) return;
        appState.wowSimulation.activeSimId = nextSim;
        if ($('wow-sim-controls')) $('wow-sim-controls').dataset.renderedSim = '';
        renderWowSimulationsSuite(getActiveSimulation());
      });
    }
    if ($('btn-prep-negociacion')) {
      $('btn-prep-negociacion').addEventListener('click', async () => {
        try {
          setConversationDrawerOpen(true);
          const simCorte = $('calc-desp-target-corte')?.value || 'pechuga';
          const simKg = Number($('calc-desp-target-pechuga')?.value || 0);
          const customPechugaScenario = simCorte === 'pechuga' && simKg > 0.86;
          const res = await apiJson('/api/agent/negotiation-playbook', {
            method: 'POST',
            body: customPechugaScenario
              ? {
                  contraparte: 'Comprador Comercial',
                  tipoOperacion: 'venta_pechuga_desposte',
                  corteOProducto: `Pechuga de ${simKg.toFixed(2)} kg`,
                  volumenAves: Number($('calc-desp-aves')?.value || 582),
                  precioOfertadoKg: Number($('calc-desp-p-pechuga')?.value || 14800)
                }
              : {
                  contraparte: 'Comprador Comercial',
                  tipoOperacion: 'venta_canal',
                  corteOProducto: 'Pollo fresco en canal con menudencias',
                  volumenAves: Number($('calc-desp-aves')?.value || 582),
                  precioOfertadoKg: Number(appState.officialState?.preciosRegionales?.precioCanalKg || 11500)
                }
          });
          await speakExpertIntervention({
            ...res,
            section: 'operacion_av2',
            title: `${res.expertName || 'Chris Voss'} · Guion Táctico Voss · BATNA`,
            speakOutLoud: appState.voice.autoSpeakExperts
          }, false);
        } catch (err) {
          appendTranscript('system', `Error preparación negociación: ${err.message}`);
        }
      });
    }
    if ($('btn-noise-filter')) {
      $('btn-noise-filter').addEventListener('click', toggleNoiseFilterMode);
    }
    if ($('btn-voice-council-toggle')) {
      $('btn-voice-council-toggle').addEventListener('click', () => {
        appState.voice.autoSpeakExperts = !appState.voice.autoSpeakExperts;
        localStorage.setItem('avicola_auto_speak_experts', String(appState.voice.autoSpeakExperts));
        updateNoiseAndCouncilButtonsUi();
      });
    }
    if ($('btn-pwa-install')) {
      $('btn-pwa-install').addEventListener('click', async () => {
        if (appState.deferredPwaPrompt) {
          appState.deferredPwaPrompt.prompt();
          await appState.deferredPwaPrompt.userChoice.catch(() => {});
          appState.deferredPwaPrompt = null;
          $('btn-pwa-install').classList.add('hidden');
        } else {
          appendTranscript('system', 'Para instalar en iPhone/iPad: toca Compartir [↑] en Safari y elige "Agregar a pantalla de inicio". En Android/Chrome usa el menú ⋮ -> "Instalar aplicación".');
          setConversationDrawerOpen(true);
        }
      });
    }
    if ($('btn-close-dock')) {
      $('btn-close-dock').addEventListener('click', () => setConversationDrawerOpen(false));
    }
    document.querySelectorAll('[data-avi-pos]').forEach((btn) => {
      btn.addEventListener('click', () => moveAviPresence(btn.dataset.aviPos));
    });

    // Arrastre libre Pointer Events sobre Avi Nébula (clic corto en orb = Voz Realtime)
    const nebWidget = $('avi-nebula-widget');
    const nebOrbBtn = $('avi-nebula-orb-btn');
    if (nebWidget) {
      let dragState = null;
      const startDrag = (e, fromOrb) => {
        if (!fromOrb && e.target.closest('button, a, input, select')) return;
        const rect = nebWidget.getBoundingClientRect();
        dragState = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          origX: rect.left,
          origY: rect.top,
          moved: false,
          fromOrb
        };
        if (e.currentTarget.setPointerCapture) {
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
        }
      };
      const onMove = (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        if (!dragState.moved && Math.hypot(dx, dy) >= 6) {
          dragState.moved = true;
          nebWidget.classList.add('dragging');
        }
        if (dragState.moved) {
          const clamped = clampAviCoordinates(dragState.origX + dx, dragState.origY + dy, nebWidget);
          nebWidget.style.left = `${clamped.x}px`;
          nebWidget.style.top = `${clamped.y}px`;
        }
      };
      const endDrag = (e) => {
        if (!dragState || e.pointerId !== dragState.pointerId) return;
        const st = dragState;
        dragState = null;
        nebWidget.classList.remove('dragging');
        if (st.moved) {
          const dx = e.clientX - st.startX;
          const dy = e.clientY - st.startY;
          moveAviPresence({ x: st.origX + dx, y: st.origY + dy });
        } else if (st.fromOrb) {
          appState.voice.connected ? stopRealtimeVoice() : startRealtimeVoice();
        }
      };
      if (nebOrbBtn) {
        nebOrbBtn.addEventListener('pointerdown', (e) => startDrag(e, true));
        nebOrbBtn.addEventListener('pointermove', onMove);
        nebOrbBtn.addEventListener('pointerup', endDrag);
        nebOrbBtn.addEventListener('pointercancel', () => {
          dragState = null;
          nebWidget.classList.remove('dragging');
        });
      }
      const nebCap = $('avi-nebula-capsule');
      if (nebCap) {
        nebCap.addEventListener('pointerdown', (e) => startDrag(e, false));
        nebCap.addEventListener('pointermove', onMove);
        nebCap.addEventListener('pointerup', endDrag);
        nebCap.addEventListener('pointercancel', () => {
          dragState = null;
          nebWidget.classList.remove('dragging');
        });
      }
    }

    document.addEventListener('focusin', (e) => {
      if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName) && !e.target.closest('#copilot-dock')) {
        moveAviAutoFollowForTarget(e.target);
      }
    });
    window.addEventListener('resize', () => moveAviPresence(appState.aviPresence.position));

    $('btn-toggle-transcript').addEventListener('click', () => {
      $('dock-transcript').classList.toggle('hidden');
    });
    $('btn-attach-image').addEventListener('click', () => $('dock-image-input').click());
    $('dock-image-input').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        appState.pendingImageBase64 = reader.result;
        appState.pendingImageMime = file.type || 'image/jpeg';
        appendTranscript('system', `Foto "${file.name}" lista para enviar a visión multimodal gpt-6.1-sol.`);
      };
      reader.readAsDataURL(file);
    });

    $('dock-chat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('dock-chat-input').value.trim();
      if (!msg && !appState.pendingImageBase64) return;
      $('dock-chat-input').value = '';
      appendTranscript('user', msg || '[Imagen adjunta]');
      handleLocalAviPresenceIntent(msg);
      appState.voice.mode = 'thinking';
      updateVoiceButtonUi();
      $('btn-send-chat').disabled = true;

      try {
        const res = await apiJson('/api/agent/chat', {
          method: 'POST',
          body: {
            message: msg || 'Analiza esta imagen del proyecto avícola.',
            imageBase64: appState.pendingImageBase64,
            imageMimeType: appState.pendingImageMime,
            sourceChannel: 'web_chat',
            uiContext: collectLiveUiContext()
          }
        });
        appState.pendingImageBase64 = null;
        appState.lastAssistantReply = res.replyText;
        appendTranscript('assistant', res.replyText);
        if (res.snapshot) applyOfficialSnapshot(res.snapshot);
        for (const ui of res.uiActions || []) applyUiChoreography(ui);
        if (res.visionSpontaneous) {
          applyVisionSpontaneousState({ ...res.visionSpontaneous, fromBackend: true });
          const hasDialogue = (res.uiActions || []).some((u) => u.action === 'avi_vision_dialogue');
          if (res.visionSpontaneous.shouldInterveneSpontaneously && !hasDialogue) {
            const hookMsg = res.visionSpontaneous.spontaneousHook || res.visionSpontaneous.triggerReasons?.[0] || 'Visión solicita intervenir un momento.';
            appendTranscript('system', `🧠 Visión pide la palabra (${res.visionSpontaneous.severity}): ${hookMsg}`, { persist: false });
            if (res.visionSpontaneous.severity === 'alta') {
              triggerAviVisionDialogue({ topic: msg, spontaneous: true, speakOutLoud: appState.voice.autoSpeakExperts }).catch(() => {});
            }
          }
        }
      } catch (err) {
        if (appState.focusedCard) {
          const simNow = getActiveSimulation();
          const insight = buildLocalCardFocusInsight(appState.focusedCard.id, simNow.computed, simNow.state);
          const cleanDetail = insight.detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          appendTranscript('assistant', `${insight.question.replace(/\*\*/g, '')}\n\n${cleanDetail}`);
        } else {
          appendTranscript('system', `No fue posible completar la consulta en línea en este momento (${err.message}). Puedes tocar cualquier tarjeta del tablero para consultar su desglose ejecutivo.`);
        }
      } finally {
        $('btn-send-chat').disabled = false;
        appState.voice.mode = appState.voice.connected ? 'listening' : 'idle';
        updateVoiceButtonUi();
      }
    });

    $('btn-speak-last').addEventListener('click', () => speakTextTts(appState.lastAssistantReply));

    // Identidad del Copiloto IA (Hallazgo #10)
    if ($('btn-agent-identity')) {
      $('btn-agent-identity').addEventListener('click', async () => {
        const current = getAgentName();
        const nextName = window.prompt('Personaliza el nombre de tu Copiloto Agente IA:', current);
        if (!nextName || !nextName.trim()) return;
        await postOperationalEvent({
          type: 'AGENT_IDENTITY_UPDATE',
          sourceChannel: 'web_header',
          payload: { nombre: nextName.trim() }
        });
        appendTranscript('system', `Identidad del copiloto actualizada a "${nextName.trim()}".`);
      });
    }

    // Campo rápido Bitácora & Preview Pesaje & Modo Terios
    if ($('inp-dia')) {
      $('inp-dia').addEventListener('input', () => {
        appState.dailyDiaTouched = true;
      });
    }
    if ($('btn-quick-visita-ok')) {
      $('btn-quick-visita-ok').addEventListener('click', async () => {
        await postOperationalEvent({
          type: 'DAILY_LOG',
          sourceChannel: 'web_quick_btn',
          payload: {
            dia: getCurrentCycleDay(appState.officialState),
            mortalidad: 0,
            descarte: 0,
            observacion: 'Visita rápida en galpón: lotes sin novedad (0 bajas)'
          }
        });
        appendTranscript('system', 'Visita sin novedad (0 bajas) guardada en bitácora.');
      });
    }
    if ($('btn-quick-libre-demanda')) {
      $('btn-quick-libre-demanda').addEventListener('click', async () => {
        await postOperationalEvent({
          type: 'DAILY_LOG',
          sourceChannel: 'web_quick_btn',
          payload: {
            dia: getCurrentCycleDay(appState.officialState),
            mortalidad: 0,
            descarte: 0,
            observacion: 'Alimento suministrado a libre demanda (sin pesaje)'
          }
        });
        appendTranscript('system', 'Registro de alimento a libre demanda guardado en bitácora.');
      });
    }
    if ($('btn-quick-baja')) {
      $('btn-quick-baja').addEventListener('click', () => {
        if ($('inp-dia')) $('inp-dia').value = String(getCurrentCycleDay(appState.officialState));
        if ($('inp-mort')) {
          $('inp-mort').value = '1';
          $('inp-mort').focus();
        }
        if ($('inp-obs') && !$('inp-obs').value) {
          $('inp-obs').value = 'Baja reportada en ronda de galpón';
        }
      });
    }
    const updateWeighingPreview = () => {
      const aves = Number($('inp-pes-aves')?.value || 0);
      const kg = Number($('inp-pes-kg')?.value || 0);
      if ($('weighing-avg-preview')) {
        $('weighing-avg-preview').textContent = aves > 0 && kg > 0
          ? `Promedio: ${Math.round((kg * 1000) / aves)} g/pollo`
          : 'Promedio: — g/pollo';
      }
    };
    if ($('inp-pes-aves')) $('inp-pes-aves').addEventListener('input', updateWeighingPreview);
    if ($('inp-pes-kg')) $('inp-pes-kg').addEventListener('input', updateWeighingPreview);
    if ($('btn-target-dec22')) {
      $('btn-target-dec22').addEventListener('click', () => {
        appState.growthTargetDay = 40;
        renderPreChristmasGrowthCurve(getActiveSimulation().computed);
      });
    }
    if ($('btn-target-dec24')) {
      $('btn-target-dec24').addEventListener('click', () => {
        appState.growthTargetDay = 42;
        renderPreChristmasGrowthCurve(getActiveSimulation().computed);
      });
    }

    if ($('btn-trip-mode-open')) {
      $('btn-trip-mode-open').addEventListener('click', () => {
        if ($('inp-trip-action')) $('inp-trip-action').value = 'open';
        if ($('inp-trip-odo-ini')) $('inp-trip-odo-ini').focus();
      });
    }
    if ($('btn-trip-mode-close')) {
      $('btn-trip-mode-close').addEventListener('click', () => {
        if ($('inp-trip-action')) $('inp-trip-action').value = 'close';
        const trans = (appState.officialComputed && appState.officialComputed.av2 && appState.officialComputed.av2.transporte) || { viajes: [] };
        const openTrip = (trans.viajes || []).find((v) => v.estado === 'en_curso');
        if (openTrip && openTrip.odometroInicial !== null && $('inp-trip-odo-ini')) {
          $('inp-trip-odo-ini').value = openTrip.odometroInicial;
        }
        if ($('inp-trip-odo-fin')) $('inp-trip-odo-fin').focus();
      });
    }

    // Viajes & Odómetro a Granja (Terios)
    if ($('form-farm-trip')) {
      $('form-farm-trip').addEventListener('submit', async (e) => {
        e.preventDefault();
        await postOperationalEvent({
          type: 'TRIP_LOG',
          sourceChannel: 'web_form',
          payload: {
            action: $('inp-trip-action').value,
            motivo: $('inp-trip-motivo').value || 'Viaje a granja',
            odometroInicial: $('inp-trip-odo-ini').value ? Number($('inp-trip-odo-ini').value) : null,
            odometroFinal: $('inp-trip-odo-fin').value ? Number($('inp-trip-odo-fin').value) : null,
            kmEstimado: $('inp-trip-km-est').value ? Number($('inp-trip-km-est').value) : 0,
            combustibleCop: Number($('inp-trip-comb').value || 0),
            peajesCop: Number($('inp-trip-peajes').value || 0),
            observacion: $('inp-trip-obs').value || ''
          }
        });
        appendTranscript('system', 'Viaje / kilometraje guardado en Granja La Alejandra.');
      });
    }

    // Salidas y Ventas Parciales (Desposte y Cortes)
    if ($('form-partial-sale')) {
      $('form-partial-sale').addEventListener('submit', async (e) => {
        e.preventDefault();
        await postOperationalEvent({
          type: 'PARTIAL_SALE',
          sourceChannel: 'web_form',
          payload: {
            modalidad: $('inp-sale-modalidad').value,
            cliente: $('inp-sale-cliente').value,
            corteDetalle: $('inp-sale-corte').value || '',
            cantidadAves: Number($('inp-sale-aves').value || 0),
            pesoKg: Number($('inp-sale-kg').value || 0),
            precioUnitarioKgCop: Number($('inp-sale-precio').value || 0)
          }
        });
        $('inp-sale-cliente').value = '';
        $('inp-sale-kg').value = '';
        appendTranscript('system', 'Salida / venta parcial registrada con margen prorrateado.');
      });
    }

    // Aprobar todos los RFCs pendientes desde Módulo 7
    if ($('btn-approve-all-rfcs')) {
      $('btn-approve-all-rfcs').addEventListener('click', async () => {
        const pending = (appState.rfcs || []).filter((r) => r.estado === 'pendiente_aprobacion');
        for (const r of pending) {
          await handleRfcAction(r.rfcCode, 'approve');
        }
        appendTranscript('system', `Aprobados ${pending.length} RFCs hacia Antigravity.`);
      });
    }

    // Auth Gate, Perfil y Controles Privados del Propietario
    if ($('btn-user-menu')) {
      $('btn-user-menu').addEventListener('click', () => {
        renderAdminUsersList();
        $('modal-users')?.classList.remove('hidden');
      });
    }
    if ($('btn-close-users')) {
      $('btn-close-users').addEventListener('click', () => $('modal-users')?.classList.add('hidden'));
    }
    if ($('form-auth-login')) {
      $('form-auth-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = $('auth-selected-username')?.value || 'david';
        const pin = $('auth-pin-input')?.value || '';
        try {
          await apiJson('/api/auth/login', { method: 'POST', body: { username, pin } });
          if ($('auth-pin-input')) $('auth-pin-input').value = '';
          appState.previewAsPartner = false;
          await refreshAllFromServer();
        } catch (err) {
          if ($('auth-login-error')) $('auth-login-error').textContent = err.message;
        }
      });
    }
    if ($('btn-auth-logout')) {
      $('btn-auth-logout').addEventListener('click', async () => {
        await apiJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
        appState.currentUser = null;
        appState.previewAsPartner = false;
        $('modal-users')?.classList.add('hidden');
        await showAuthGate();
      });
    }
    if ($('btn-owner-mode-real')) {
      $('btn-owner-mode-real').addEventListener('click', () => {
        appState.previewAsPartner = false;
        setWorkspaceViewMode('av2_only');
        applyRoleScopedUi();
      });
    }
    if ($('btn-owner-mode-all')) {
      $('btn-owner-mode-all').addEventListener('click', () => {
        appState.previewAsPartner = false;
        setWorkspaceViewMode('all');
        applyRoleScopedUi();
      });
    }
    if ($('btn-owner-preview-partner')) {
      $('btn-owner-preview-partner').addEventListener('click', () => {
        appState.previewAsPartner = !appState.previewAsPartner;
        applyRoleScopedUi();
      });
    }
    if ($('btn-export-clean-blueprint')) {
      $('btn-export-clean-blueprint').addEventListener('click', () => {
        window.location.href = '/api/admin/template-blueprint';
      });
    }
    if ($('form-upsert-user')) {
      $('form-upsert-user').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          username: $('inp-user-username')?.value,
          displayName: $('inp-user-displayname')?.value,
          role: $('inp-user-role')?.value,
          pin: $('inp-user-pin')?.value || undefined
        };
        await apiJson('/api/auth/users', { method: 'POST', body: payload });
        if ($('inp-user-pin')) $('inp-user-pin').value = '';
        await renderAdminUsersList();
        appendTranscript('system', `Usuario ${payload.username} actualizado.`);
      });
    }

    // Botones rápidos de evaluación comercial en caliente
    if ($('btn-eval-100-pollos')) {
      $('btn-eval-100-pollos').addEventListener('click', () => {
        const res = TwinEngine.evaluateCommercialOpportunity(appState.officialState, {
          tipo: 'pollos_adelantados',
          cantidadAves: 100,
          pesoVivoActualKg: 2.10,
          precioOfertaKgCop: 10000
        });
        renderCommercialOpportunityResult(res);
      });
    }
    if ($('btn-eval-50-pechugas')) {
      $('btn-eval-50-pechugas').addEventListener('click', () => {
        const res = TwinEngine.evaluateCommercialOpportunity(appState.officialState, {
          tipo: 'venta_pechugas',
          cantidadPechugas: 100,
          precioPorPechugaCop: 14500
        });
        renderCommercialOpportunityResult(res);
      });
    }

    // Temporizador 15 minutos para recordar odómetro final Terios al llegar a la granja
    let teriosTimerInterval = null;
    if ($('btn-trip-timer-15m')) {
      $('btn-trip-timer-15m').addEventListener('click', () => {
        clearInterval(teriosTimerInterval);
        const badge = $('trip-timer-status');
        let remainingSec = 15 * 60;
        if (badge) {
          badge.classList.remove('hidden', 'ok');
          badge.classList.add('warn');
          badge.textContent = '⏱️ 15:00 restante';
        }
        appendTranscript('system', 'Recordatorio Terios activado: en 15 minutos te aviso para apuntar odómetro final y combustible.');
        teriosTimerInterval = setInterval(() => {
          remainingSec -= 1;
          if (remainingSec <= 0) {
            clearInterval(teriosTimerInterval);
            if (badge) {
              badge.classList.remove('warn');
              badge.classList.add('ok');
              badge.textContent = '🔔 ¡Apuntar odómetro final Terios!';
            }
            const reminderMsg = 'Recordatorio Terios: han pasado 15 minutos. Antes de bajarte, anota el odómetro final y combustible en Módulo 6.';
            appendTranscript('assistant', reminderMsg);
            if ($('inp-trip-action')) $('inp-trip-action').value = 'close';
            focusSection('bodega_termica', 'Cerrar viaje Terios');
            if ($('inp-trip-odo-fin')) {
              $('inp-trip-odo-fin').classList.add('download-spotlight-pulse');
              $('inp-trip-odo-fin').focus();
            }
            speakTextTts(reminderMsg).catch(() => {});
            return;
          }
          if (badge) {
            const m = String(Math.floor(remainingSec / 60)).padStart(2, '0');
            const s = String(remainingSec % 60).padStart(2, '0');
            badge.textContent = `⏱️ ${m}:${s} restante`;
          }
        }, 1000);
      });
    }

    // Credenciales form
    $('form-credentials').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        OPENAI_API_KEY: $('cred-openai-key').value,
        OPENAI_VOICE_NAME: $('cred-voice-name').value,
        OPENAI_VOICE_SPEED: $('cred-voice-speed').value,
        SUPABASE_URL: $('cred-supa-url').value,
        SUPABASE_SERVICE_ROLE_KEY: $('cred-supa-key').value,
        TELEGRAM_BOT_TOKEN: $('cred-tg-token').value,
        TELEGRAM_ALLOWED_CHAT_IDS: $('cred-tg-chats').value
      };
      const out = await apiJson('/api/credentials', { method: 'POST', body: payload });
      appState.credentialsStatus = out.status;
      updateCredentialsUi();
      $('modal-credentials').classList.add('hidden');
      appendTranscript('system', `Integraciones actualizadas (${out.updatedKeys.join(', ') || 'sin cambios'}).`);
      await refreshAllFromServer();
    });

    // Ctrl+K & Esc
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdPalette();
      } else if (e.key === 'Escape') {
        closeCmdPalette();
        closeCouncilModal();
        $('modal-credentials').classList.add('hidden');
        $('modal-users')?.classList.add('hidden');
      }
    });
    $('cmd-search-input').addEventListener('input', (e) => renderCmdResults(e.target.value));
  }

  function initSmartVisualContextObserver() {
    // Avi solo sigue foco de inputs (focusin) o comandos explícitos; no salta al pasar el mouse.
    if (window.innerWidth <= 540 && $('avi-nebula-widget')) {
      $('avi-nebula-widget').classList.add('mobile-mini');
      if ($('btn-nebula-mini-toggle')) $('btn-nebula-mini-toggle').textContent = '▴';
    }
  }

  function registerPwaServiceWorker() {
    if ('serviceWorker' in navigator && (window.isSecureContext || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      appState.deferredPwaPrompt = e;
      if ($('btn-pwa-install')) $('btn-pwa-install').classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {
      appState.deferredPwaPrompt = null;
      if ($('btn-pwa-install')) $('btn-pwa-install').classList.add('hidden');
    });
    const isIosSafari = /iphone|ipad|ipod/i.test(navigator.userAgent || '') && !window.navigator.standalone;
    if (isIosSafari && $('btn-pwa-install')) {
      $('btn-pwa-install').classList.remove('hidden');
    }
  }

  bindEvents();
  initSmartVisualContextObserver();
  registerPwaServiceWorker();
  setConversationDrawerOpen(false);
  moveAviPresence(appState.aviPresence.position);
  updateVoiceButtonUi();
  updateNoiseAndCouncilButtonsUi();
  applyRoleScopedUi();
  syncSlidersToState(appState.officialState);
  renderAll();
  startOrbAnimation();
  connectSse();
  refreshAllFromServer().catch((err) => {
    console.warn('Carga inicial API:', err.message);
  });
})();
