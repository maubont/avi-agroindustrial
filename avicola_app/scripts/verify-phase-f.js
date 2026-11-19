'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const TwinEngine = require('../shared/causal-twin-engine');
const { createAvicolaServer } = require('../server/index');

const APP_ROOT = path.resolve(__dirname, '..');

async function run() {
  const results = [];
  const check = (name, fn) => results.push({ name, fn });

  check('1. Fase F1 Engine: BSC KPIs (IEP 424, ROI 63.8%) + Simulador Flexible por Corte/Peso + Zero Divergence', async () => {
    const state = TwinEngine.createDefaultTwinState();
    const computed = TwinEngine.computeFullTwin(state);
    const div = TwinEngine.verifyZeroDivergence(computed);
    assert.ok(div.ok && div.maxDiff < 0.001, `Divergencia debe ser <0.001, fue ${div.maxDiff}`);

    const bsc = computed.av2.scorecardBsc;
    assert.ok(bsc && bsc.financiera && bsc.clienteMercado && bsc.procesosInternos && bsc.aprendizajeCampo, 'Faltan perspectivas BSC');
    assert.strictEqual(bsc.procesosInternos.iepRossTeorico, 424, `IEP Ross 42d esperado 424, obtenido ${bsc.procesosInternos.iepRossTeorico}`);
    assert.ok(bsc.financiera.roiCicloContinuoPct > 0.60, 'ROI ciclo continuo debe superar 60%');
    assert.strictEqual(bsc.clienteMercado.edadObjetivoDias, 42, 'BSC Cliente por defecto debe reflejar meta real Día 42');
    assert.ok(bsc.clienteMercado.pesoCanalObjetivoKg > 2.4 && bsc.clienteMercado.pesoCanalObjetivoKg < 2.5, 'Peso objetivo base debe ser ~2,47 kg canal');

    // Escenarios variables de cliente (pechuga 950g, pechuga 1kg, canal 2.70kg, vivo 2.50kg)
    const esc950 = TwinEngine.estimateDayForTargetCutWeight(state, { corte: 'pechuga', targetKg: 0.95 });
    assert.ok(esc950.edadRecomendadaDias >= 45 && esc950.edadRecomendadaDias <= 47 && esc950.pesoPechugaKg >= 0.95);
    const esc1kg = TwinEngine.estimateDayForTargetCutWeight(state, { corte: 'pechuga', targetKg: 1.0 });
    assert.strictEqual(esc1kg.edadRecomendadaDias, 48);
    assert.strictEqual(esc1kg.requiereEntresaca, true, 'Escenario extendido Dia 48 en El Zulia debe exigir entresaca previa');
    const escCanal = TwinEngine.estimateDayForTargetCutWeight(state, { corte: 'canal', targetKg: 2.70 });
    assert.strictEqual(escCanal.edadRecomendadaDias, 45);
    const escVivo = TwinEngine.estimateDayForTargetCutWeight(state, { corte: 'vivo', targetKg: 2.50 });
    assert.ok(escVivo.edadRecomendadaDias < 42 && escVivo.pesoVivoKg >= 2.50);
  });

  check('2. Artefactos Cloud Railway, Plantillas Excel Embotelladas y PWA Mobile presentes', async () => {
    const requiredFiles = [
      'railway.json',
      '.railwayignore',
      'templates/AV1_Plan_Financiero_Avicola.xlsx',
      'templates/AV2_Operacion_Granja_Lotes_1_a_3.xlsx',
      'public/manifest.json',
      'public/sw.js',
      'public/icons/avi-icon.svg'
    ];
    for (const rel of requiredFiles) {
      assert.ok(fs.existsSync(path.join(APP_ROOT, rel)), `Falta archivo requerido: ${rel}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/manifest.json'), 'utf8'));
    assert.strictEqual(manifest.display, 'standalone');
  });

  check('3. UI Fase F1/F2/F3: BSC Cards, Simulador Flexible Corte/Peso, Subagentes y Mini-Orbe Movil', async () => {
    const html = fs.readFileSync(path.join(APP_ROOT, 'public/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(APP_ROOT, 'public/styles.css'), 'utf8');
    const appJs = fs.readFileSync(path.join(APP_ROOT, 'public/app.js'), 'utf8');

    assert.ok(html.includes('id="bsc-scorecard-grid"'), 'Falta #bsc-scorecard-grid');
    assert.ok(html.includes('id="calc-desp-target-corte"'), 'Falta selector #calc-desp-target-corte');
    assert.ok(html.includes('id="calc-desp-target-pechuga"'), 'Falta #calc-desp-target-pechuga');
    assert.ok(!html.includes('id="btn-meta-pechuga-1kg"'), 'No debe quedar boton fijo por defecto de pechuga 1 kg');
    assert.ok(html.includes('id="dock-specialists-bar"'), 'Falta #dock-specialists-bar');
    assert.ok(html.includes('id="btn-prep-negociacion"'), 'Falta #btn-prep-negociacion');
    assert.ok(html.includes('id="btn-nebula-mini-toggle"'), 'Falta #btn-nebula-mini-toggle');
    assert.ok(html.includes('rel="manifest"'), 'Falta link manifest PWA');

    assert.ok(css.includes('.bsc-grid') && css.includes('scrollbar-width: none') && css.includes('.mobile-mini'), 'Faltan estilos Fase F');
    assert.ok(appJs.includes('renderBscScorecard') && appJs.includes('estimateDayForTargetCutWeight') && appJs.includes('/api/agent/negotiation-playbook'), 'Falta lógica JS Fase F');
    assert.ok(!appJs.includes('Meta Pechuga ~1,00 kg Ross'), 'BSC UI no debe mostrar pechuga 1 kg como meta por defecto');
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'avicola-pf-'));
  const dataDir = path.join(tmpRoot, 'data');
  const bridgeDir = path.join(tmpRoot, 'bridge');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(bridgeDir, { recursive: true });

  const srv = createAvicolaServer({
    dataDir,
    bridgeDir,
    envFilePath: path.join(tmpRoot, '.env.empty'),
    supabaseUrl: '',
    supabaseKey: '',
    enableTelegram: false
  });

  try {
    const info = await srv.start(0, '127.0.0.1');
    const base = info.url;

    const loginAs = async (username, pin) => {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin })
      });
      assert.strictEqual(res.status, 200);
      return (res.headers.get('set-cookie') || '').split(';')[0];
    };

    check('4. Cloud /health + PWA static endpoints con Content-Type correcto', async () => {
      const healthRes = await fetch(`${base}/health`);
      assert.strictEqual(healthRes.status, 200);
      const hJson = await healthRes.json();
      assert.strictEqual(hJson.ok, true);
      assert.strictEqual(hJson.service, 'avi-granja-la-alejandra');

      const manRes = await fetch(`${base}/manifest.json`);
      assert.strictEqual(manRes.status, 200);
      assert.ok((manRes.headers.get('content-type') || '').includes('application/json'));

      const swRes = await fetch(`${base}/sw.js`);
      assert.strictEqual(swRes.status, 200);

      const iconRes = await fetch(`${base}/icons/avi-icon.svg`);
      assert.strictEqual(iconRes.status, 200);
      assert.ok((iconRes.headers.get('content-type') || '').includes('image/svg+xml'));
    });

    check('5. Mesa de 5 Subagentes Avi + Playbook Chris Voss/Harvard/Gates (RBAC + 0$ TTS)', async () => {
      const davidCookie = await loginAs('david', '1234');
      const mauCookie = await loginAs('mauricio', '2026');

      const specs = [
        'bsc_kaplan_norton',
        'porter_estrategia',
        'kotler_mercadotecnia',
        'negociador_voss_harvard_gates',
        'zootecnia_innovacion_phd'
      ];
      for (const spec of specs) {
        const res = await fetch(`${base}/api/agent/specialist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
          body: JSON.stringify({ especialista: spec })
        });
        assert.strictEqual(res.status, 200, `Fallo subagente ${spec}`);
        const json = await res.json();
        assert.ok(json.displayText.length > 40, `Respuesta vacia subagente ${spec}`);
        assert.ok(!json.speechText.includes('$') && !/d[oó]lares/i.test(json.speechText), `TTS subagente ${spec} debe venir sin $ ni dolares`);
        assert.ok(!/Administrador:|harina propia|AV-1/i.test(json.displayText), `Partner david no debe ver datos admin en ${spec}`);
      }

      const mauPorter = await (await fetch(`${base}/api/agent/specialist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: mauCookie },
        body: JSON.stringify({ especialista: 'porter_estrategia' })
      })).json();
      assert.ok(mauPorter.displayText.includes('Administrador'), 'Owner mauricio debe conservar nota de palanca futura');

      const pbRes = await fetch(`${base}/api/agent/negotiation-playbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({
          contraparte: 'Asadero Norte',
          tipoOperacion: 'venta_pechuga_desposte',
          corteOProducto: 'Pechuga de 950 g',
          volumenAves: 100,
          precioOfertadoKg: 14500
        })
      });
      assert.strictEqual(pbRes.status, 200);
      const pb = await pbRes.json();
      assert.ok(pb.edadRecomendadaDias >= 45 && pb.edadRecomendadaDias <= 47, `Playbook escenario pechuga 950g debe proyectar Día 46 (~${pb.edadRecomendadaDias})`);
      assert.ok(pb.batna && pb.estrategiaGates && pb.tacticasChrisVoss.preguntasCalibradas.length >= 2);
      assert.ok(!pb.speechText.includes('$') && !/d[oó]lares/i.test(pb.speechText));
      assert.ok(!/Nota Administrador/i.test(pb.displayText), 'Playbook para david debe omitir datos admin');

      const pbCanalDefault = await (await fetch(`${base}/api/agent/negotiation-playbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({ contraparte: 'Mayorista Centro', tipoOperacion: 'venta_canal', volumenAves: 582, precioOfertadoKg: 11500 })
      })).json();
      assert.strictEqual(pbCanalDefault.edadRecomendadaDias, 42, 'Playbook canal por defecto debe mantenerse en Día 42');

      // También via /api/realtime/tool-call (herramienta expuesta a gpt-realtime-2.1)
      const toolPbRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({
          name: 'prepare_negotiation_playbook',
          arguments: { contraparte: 'Restaurante Zulia', tipoOperacion: 'venta_canal', volumenAves: 300, precioOfertadoKg: 10000 }
        })
      });
      assert.strictEqual(toolPbRes.status, 200);
      const toolPb = await toolPbRes.json();
      assert.strictEqual(toolPb.output.ofertaSostenible, false, 'Oferta de $10.000/kg en canal debe disparar alerta de piso minimo');
    });

    check('6. Compilacion Excel AV-2 en modo autocontenido usando templates/', async () => {
      const mauCookie = await loginAs('mauricio', '2026');
      const dlRes = await fetch(`${base}/api/excel/download/AV2`, {
        headers: { Cookie: mauCookie }
      });
      assert.strictEqual(dlRes.status, 200);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      assert.ok(buf.length > 20000, 'Archivo .xlsx generado debe pesar >20 KB');
    });

    check('7. Proyeccion Anual Solo Lectura (52 sem), Voz Realtime ES, Briefing Coherente y Audio Sin Recorte', async () => {
      const baseState = TwinEngine.createDefaultTwinState();
      const sim52 = TwinEngine.simulateContinuousHorizon(baseState, {
        avesPorLote: 900,
        cadenciaDias: 15,
        semanasHorizonte: 52,
        demandaSemanalAvesCliente: 200
      });
      assert.strictEqual(sim52.readOnlySimulation, true);
      assert.strictEqual(baseState.continuoConfig.cadenciaDias, 18, 'simulateContinuousHorizon no debe mutar el estado');
      assert.strictEqual(sim52.horizonteRealDesdeInicio.semanasTotales, 52);
      assert.ok(sim52.horizonteRealDesdeInicio.lotesContinuosIngresados >= 15, '52 semanas a 15d deben proyectar >=15 lotes continuos');
      assert.ok(sim52.capacidadSemanal.coberturaDemandaCliente.cubreDemanda === true, '900 c/15d (~407 cosechadas/sem) debe cubrir 200/sem');
      assert.strictEqual(sim52.auditoriaGalponYClima.diasVacioSanitarioPorSeccion, 3, '900 c/15d deja 3d de vacio sanitario por seccion');
      assert.ok(sim52.auditoriaGalponYClima.alertasOperativas.length >= 1, 'Debe emitir alerta de vacio sanitario ajustado');

      const { resolveRealtimeSessionConfig } = require('../shared/openai-models-config');
      assert.strictEqual(resolveRealtimeSessionConfig().turnDetection.eagerness, 'medium', 'VAD semantico debe usar eagerness medium');
      const gwSrc = fs.readFileSync(path.join(APP_ROOT, 'server/openai-gateway.js'), 'utf8');
      assert.ok(gwSrc.includes("transcription: { model: 'gpt-4o-transcribe', language: 'es' }"), 'Realtime debe fijar transcripcion en español (es)');

      const appJs = fs.readFileSync(path.join(APP_ROOT, 'public/app.js'), 'utf8');
      assert.ok(appJs.includes('setMicTracksMuted(true)') && appJs.includes('echoCancellation: true'), 'Cliente WebRTC debe silenciar mic en TTS y exigir AEC');
      assert.ok(!appJs.includes('setTimeout(r, 14500)'), 'Briefing no debe cortar TTS a los 14.5s');

      const davidCookie = await loginAs('david', '1234');
      const mauCookie = await loginAs('mauricio', '2026');
      const vBefore = (await (await fetch(`${base}/api/twin/state`, { headers: { Cookie: davidCookie } })).json()).version;
      const simToolRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({
          name: 'simulate_continuous_horizon',
          arguments: { avesPorLote: 900, cadenciaDias: 15, mesesHorizonte: 12, demandaSemanalAvesCliente: 200 }
        })
      });
      assert.strictEqual(simToolRes.status, 200);
      const simToolJson = await simToolRes.json();
      assert.strictEqual(simToolJson.stateChanged, false, 'Tool simulate_continuous_horizon no debe mutar estado');
      const vAfter = (await (await fetch(`${base}/api/twin/state`, { headers: { Cookie: davidCookie } })).json()).version;
      assert.strictEqual(vAfter, vBefore, 'Version del estado debe permanecer intacta tras simulacion');

      // Cambiar cadencia temporalmente a 15d y verificar coherencia absoluta Paso 2 = Paso 3 + TTS limpio
      await fetch(`${base}/api/twin/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: mauCookie },
        body: JSON.stringify({ type: 'CONTINUOUS_CYCLE_CONFIG', payload: { cadenciaDias: 15 } })
      });
      const briefRes = await fetch(`${base}/api/agent/guided-briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({})
      });
      assert.strictEqual(briefRes.status, 200);
      const brief = await briefRes.json();
      assert.ok(brief.steps[1].displayText.includes('cada 15 días'), 'Paso 2 debe reflejar cadencia activa 15 dias');
      assert.ok(brief.steps[2].displayText.includes('cada 15 días'), 'Paso 3 no debe hardcodear 18 dias cuando es 15 dias');
      for (const st of brief.steps) {
        assert.ok(!/pesos\s+pesos/i.test(st.speechText), `TTS sin "pesos pesos": ${st.speechText}`);
      }
      await fetch(`${base}/api/twin/rollback`, { method: 'POST', headers: { Cookie: mauCookie } });
    });

    check('8. PWA Completa, Voces M/F por Experto, Avi Moderadora, Web Search, Filtro Ruido y Telegram /start', async () => {
      const icon192 = path.join(APP_ROOT, 'public/icons/avi-icon-192.png');
      const icon512 = path.join(APP_ROOT, 'public/icons/avi-icon-512.png');
      assert.ok(fs.existsSync(icon192) && fs.statSync(icon192).size > 4000, 'Icono PWA 192 PNG debe existir');
      assert.ok(fs.existsSync(icon512) && fs.statSync(icon512).size > 8000, 'Icono PWA 512 PNG debe existir');

      const manifest = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'public/manifest.json'), 'utf8'));
      assert.ok(manifest.icons.some((i) => i.src === '/icons/avi-icon-192.png' && i.type === 'image/png'));
      assert.ok(manifest.icons.some((i) => i.src === '/icons/avi-icon-512.png' && i.type === 'image/png'));
      assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2, 'manifest.json debe definir shortcuts PWA');

      const swSrc = fs.readFileSync(path.join(APP_ROOT, 'public/sw.js'), 'utf8');
      assert.ok(swSrc.includes('avi-alejandra-shell-v2') && swSrc.includes('/shared/causal-twin-engine.js'), 'Service Worker v2 debe cachear app shell completo');

      const {
        EXPERT_VOICE_PROFILES,
        resolveExpertVoiceProfile,
        resolveRealtimeNoiseConfig
      } = require('../shared/openai-models-config');
      assert.strictEqual(EXPERT_VOICE_PROFILES.avi_moderadora.voice, 'marin');
      assert.strictEqual(EXPERT_VOICE_PROFILES.bsc_kaplan_norton.voice, 'onyx');
      assert.strictEqual(EXPERT_VOICE_PROFILES.bsc_kaplan_norton.gender, 'M');
      assert.strictEqual(EXPERT_VOICE_PROFILES.porter_estrategia.voice, 'ash');
      assert.strictEqual(EXPERT_VOICE_PROFILES.kotler_mercadotecnia.voice, 'coral');
      assert.strictEqual(EXPERT_VOICE_PROFILES.kotler_mercadotecnia.gender, 'F');
      assert.strictEqual(EXPERT_VOICE_PROFILES.zootecnia_avicola.voice, 'sage');
      assert.strictEqual(EXPERT_VOICE_PROFILES.innovacion_phd.voice, 'echo');
      assert.strictEqual(EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.voice, 'cedar');
      assert.strictEqual(resolveExpertVoiceProfile('zootecnia_innovacion_phd').voice, 'sage');

      const strictNoise = resolveRealtimeNoiseConfig('galpon_estricto');
      assert.strictEqual(strictNoise.noiseReduction.type, 'near_field');
      assert.strictEqual(strictNoise.turnDetection.eagerness, 'low');
      const officeNoise = resolveRealtimeNoiseConfig('oficina');
      assert.strictEqual(officeNoise.noiseReduction.type, 'far_field');
      assert.strictEqual(officeNoise.turnDetection.eagerness, 'medium');

      const davidCookie = await loginAs('david', '1234');
      const phdRes = await fetch(`${base}/api/agent/specialist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({ especialista: 'innovacion_phd', consulta: 'Sensores de galpon' })
      });
      assert.strictEqual(phdRes.status, 200);
      const phdJson = await phdRes.json();
      assert.strictEqual(phdJson.voice, 'echo');
      assert.strictEqual(phdJson.gender, 'M');

      const zooRes = await fetch(`${base}/api/agent/specialist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({ especialista: 'zootecnia_avicola', consulta: 'Consumo alimento' })
      });
      assert.strictEqual(zooRes.status, 200);
      const zooJson = await zooRes.json();
      assert.strictEqual(zooJson.voice, 'sage');
      assert.strictEqual(zooJson.gender, 'F');

      const modRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: davidCookie },
        body: JSON.stringify({
          name: 'consult_avi_specialist',
          arguments: { especialista: 'bsc_kaplan_norton', consulta: 'Evalua utilidad neta', speakOutLoud: true }
        })
      });
      assert.strictEqual(modRes.status, 200);
      const modJson = await modRes.json();
      assert.strictEqual(modJson.output.spokenByExpertDirectly, true);
      const speakAction = modJson.uiAction;
      assert.ok(speakAction && speakAction.action === 'speak_expert_voice' && speakAction.voice === 'onyx' && speakAction.gender === 'M', 'Debe emitir uiAction speak_expert_voice con voz masculina');

      const gwSrc = fs.readFileSync(path.join(APP_ROOT, 'server/openai-gateway.js'), 'utf8');
      assert.ok(gwSrc.includes('consult_live_web'), 'Gateway debe incluir tool consult_live_web');
      const tgSrc = fs.readFileSync(path.join(APP_ROOT, 'server/telegram-bot.js'), 'utf8');
      assert.ok(tgSrc.includes('Tu Chat ID de Telegram es:'), 'Telegram /start debe reportar Chat ID');
      const appJs = fs.readFileSync(path.join(APP_ROOT, 'public/app.js'), 'utf8');
      assert.ok(appJs.includes('buildNoiseFilteredMicPipeline') && appJs.includes('beforeinstallprompt'), 'Cliente debe implementar filtro DSP galpon y PWA install');
    });

    check('9. Fase G: Visión (5 Capas + Espontáneo), Dúo Avi ↔ Visión, 9 Manifestaciones, 5 Simulaciones WOW, Junta Elephant-Goldfish y Conciencia uiContext', async () => {
      const { EXPERT_VOICE_PROFILES, resolveExpertVoiceProfile } = require('../shared/openai-models-config');
      assert.strictEqual(Object.keys(EXPERT_VOICE_PROFILES).length, 10, 'Catalogo debe tener Avi moderadora + 9 manifestaciones');
      assert.strictEqual(EXPERT_VOICE_PROFILES.gerencia_excelencia_operacional.voice, 'verse');
      assert.strictEqual(EXPERT_VOICE_PROFILES.gerencia_excelencia_operacional.gender, 'M');
      assert.strictEqual(EXPERT_VOICE_PROFILES.sanidad_bioseguridad_ica.voice, 'coral');
      assert.strictEqual(EXPERT_VOICE_PROFILES.sanidad_bioseguridad_ica.gender, 'F');
      assert.strictEqual(EXPERT_VOICE_PROFILES.nutricion_planta_concentrados.voice, 'ash');
      assert.strictEqual(EXPERT_VOICE_PROFILES.nutricion_planta_concentrados.gender, 'M');
      assert.strictEqual(resolveExpertVoiceProfile('vision').voice, 'verse');

      const postApi = async (pathname, body, cookie) => {
        const res = await fetch(`${base}${pathname}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: JSON.stringify(body || {})
        });
        assert.strictEqual(res.status, 200, `${pathname} debe responder 200`);
        return res.json();
      };
      const assertRbacAndTts = (displayText, speechText, label) => {
        assert.ok(!/Administrador:|harina propia|AV-1|CapEx.*planta|ahorro.*alimento propio/i.test(displayText || ''), `${label}: fuga RBAC para partner`);
        assert.ok(speechText && speechText.length > 20, `${label}: speechText vacio`);
        assert.ok(!/\$|d[oó]lares/i.test(speechText), `${label}: speechText contiene $ o dolares`);
      };

      const davidCookie = await loginAs('david', '1234');
      const mauCookie = await loginAs('mauricio', '2026');
      const vBefore = (await (await fetch(`${base}/api/twin/state`, { headers: { Cookie: davidCookie } })).json()).version;

      // Dúo Avi <-> Visión bajo demanda y espontáneo
      const dlgDemand = await postApi('/api/agent/avi-vision-dialogue', {
        topic: 'Estrategia comercial El Zulia',
        spontaneous: false,
        uiContext: { activeTab: 'simulador_whatif', wowMetrics: { thiEfectivo: 76, colocacionRemanente48hPct: 90 } }
      }, davidCookie);
      assert.strictEqual(dlgDemand.protocol, 'avi-vision-modulated-dialogue');
      assert.strictEqual(dlgDemand.turns.length, 3, 'Dúo debe tener 3 turnos Avi -> Visión -> Avi');
      assert.strictEqual(dlgDemand.turns[0].speaker, 'Avi');
      assert.strictEqual(dlgDemand.turns[0].voice, 'marin');
      assert.strictEqual(dlgDemand.turns[0].gender, 'F');
      assert.strictEqual(dlgDemand.turns[1].speaker, 'Visión');
      assert.strictEqual(dlgDemand.turns[1].voice, 'verse');
      assert.strictEqual(dlgDemand.turns[1].gender, 'M');
      assert.strictEqual(dlgDemand.turns[2].speaker, 'Avi');
      ['peterDrucker', 'ritaMcGrath', 'alexOsterwalder', 'amyEdmondson', 'ethanMollick'].forEach((k) => {
        assert.ok(dlgDemand.capasEstrategicasVision && dlgDemand.capasEstrategicasVision[k], `Falta capa ${k}`);
      });
      assertRbacAndTts(dlgDemand.displayText, dlgDemand.speechText, 'Dialogue demand');
      dlgDemand.turns.forEach((t, i) => assertRbacAndTts(t.displayText, t.speechText, `Dialogue turn ${i}`));

      const dlgSpont = await postApi('/api/agent/avi-vision-dialogue', {
        topic: 'Control mediodia en galpon',
        spontaneous: false,
        uiContext: { activeTab: 'simulador_whatif', wowMetrics: { thiEfectivo: 81, colocacionRemanente48hPct: 90 } }
      }, davidCookie);
      assert.strictEqual(dlgSpont.spontaneousIntervention, true);
      assert.strictEqual(dlgSpont.spontaneousTrigger.exclusivelyAuthorizedForSpontaneousIntervention, true);
      assert.strictEqual(dlgSpont.spontaneousTrigger.severity, 'alta');

      // Especialistas Fase G
      const visRes = await postApi('/api/agent/specialist', { especialista: 'gerencia_excelencia_operacional' }, davidCookie);
      ['Drucker', 'McGrath', 'Osterwalder', 'Edmondson', 'Mollick'].forEach((k) => {
        assert.ok(visRes.displayText.includes(k), `Visión displayText debe incluir ${k}`);
      });
      assertRbacAndTts(visRes.displayText, visRes.speechText, 'Visión specialist');

      const visAlias = await postApi('/api/agent/specialist', { especialista: 'vision' }, mauCookie);
      assert.strictEqual(visAlias.voice, 'verse');

      const icaRes = await postApi('/api/agent/specialist', { especialista: 'sanidad_bioseguridad_ica' }, davidCookie);
      assert.strictEqual(icaRes.voice, 'coral');
      assert.strictEqual(icaRes.gender, 'F');
      assertRbacAndTts(icaRes.displayText, icaRes.speechText, 'Dra. Camila ICA');

      const nutRes = await postApi('/api/agent/specialist', { especialista: 'nutricion_planta_concentrados' }, davidCookie);
      assert.strictEqual(nutRes.voice, 'ash');
      assert.strictEqual(nutRes.gender, 'M');
      assertRbacAndTts(nutRes.displayText, nutRes.speechText, 'Dr. Andrés Nutrición');

      // Decisions eval + frontera lexica + no-spam en rutina
      const evalRoutine = await postApi('/api/agent/decisions-eval', {
        message: 'cuales son las ventas de hoy',
        uiContext: { wowMetrics: { thiEfectivo: 76, colocacionRemanente48hPct: 90, horasAyunoTotal: 9.5, finosPct: 9, cadenciaDias: 18 } }
      }, davidCookie);
      assert.strictEqual(evalRoutine.visionSpontaneous.shouldInterveneSpontaneously, false);

      const evalRisk = await postApi('/api/agent/decisions-eval', {
        message: 'demos credito a 30 dias y bajemos canal a 10000'
      }, davidCookie);
      assert.strictEqual(evalRisk.visionSpontaneous.shouldInterveneSpontaneously, true);
      assert.strictEqual(evalRisk.visionSpontaneous.severity, 'alta');

      const evalBoundary = await postApi('/api/agent/decisions-eval', {
        message: 'Explica seguridad psicologica y universidad sin mencionar normativa sanitaria'
      }, davidCookie);
      assert.strictEqual(evalBoundary.turnEval.questions.primary_manifestation.choice, 'gerencia_excelencia_operacional');

      // Junta Elephant-Goldfish & 5 Simulaciones WOW sin mutar estado
      const boardRes = await postApi('/api/agent/elephant-goldfish', {
        consulta: 'Evaluar cadencia continua y desposte selectivo'
      }, davidCookie);
      assert.ok(boardRes.dictamenFinal && boardRes.elephantThesis && Array.isArray(boardRes.salvavidasAccionables));
      assertRbacAndTts(boardRes.displayText, boardRes.speechText, 'Elephant-Goldfish board');

      const simAll = await postApi('/api/agent/simulations', { simulationId: 'todas' }, davidCookie);
      assert.ok(simAll.data && simAll.data.sim_1_estirpes_thi && simAll.data.sim_2_portafolio_b2b && simAll.data.sim_4_ayuno_cadena_frio && simAll.data.sim_5_anual_toc);

      const simDavid = await postApi('/api/agent/simulations', { simulationId: 'sim_3_nutricion_planta' }, davidCookie);
      assert.strictEqual(simDavid.data.capexPlantaReservadoOwner, null, 'CapEx debe estar oculto para partner david');

      const simMau = await postApi('/api/agent/simulations', { simulationId: 'sim_3_nutricion_planta' }, mauCookie);
      assert.ok(simMau.data.capexPlantaReservadoOwner && simMau.data.capexPlantaReservadoOwner.capexEstimadoLineaInicialCop > 0, 'CapEx visible para owner mauricio');

      // Verificar calibracion THI Celsius vs escala zootecnica 77.5/80 y separación vivos reales (600) vs proyectados (582)
      const simComfort = TwinEngine.simulateStrainAndClimateScenario(TwinEngine.createDefaultTwinState(), { tempC: 29, humedadRelPct: 65, velocidadAireMs: 1.8 });
      assert.strictEqual(simComfort.microclimaElZulia.estadoTermico, 'CONFORT_OPERATIVO');
      assert.ok(simComfort.microclimaElZulia.thiEfectivo < 77.5);
      const simHeat = TwinEngine.simulateStrainAndClimateScenario(TwinEngine.createDefaultTwinState(), { tempC: 36, humedadRelPct: 68, velocidadAireMs: 1.5 });
      assert.strictEqual(simHeat.microclimaElZulia.estadoTermico, 'ESTRES_SEVERO');
      assert.ok(simHeat.microclimaElZulia.thiEfectivo >= 80, '36C en El Zulia debe superar THI 80 y disparar estres severo');

      const stSnap = await (await fetch(`${base}/api/twin/state`, { headers: { Cookie: davidCookie } })).json();
      assert.strictEqual(stSnap.snapshot.computed.av2.bitacora.avesNominalesCompradas, 600, 'Aves nominales compradas debe ser 600');
      assert.strictEqual(stSnap.snapshot.computed.av2.bitacora.avesRecibidasReales, 603, 'Aves reales recibidas en cajas debe ser 603');
      assert.strictEqual(stSnap.snapshot.computed.av2.bitacora.avesVivasRealesHoy, 603, 'Sin bajas adicionales en bitacora, aves vivas reales hoy debe ser 603');
      assert.strictEqual(stSnap.snapshot.computed.av2.bitacora.avesFinEfectivas, 582, 'Proyeccion financiera esperada a cosecha debe conservar 582');
      assert.strictEqual(stSnap.snapshot.computed.av2.bitacora.pesajesRealesCount, 0, 'Inicialmente pesajesRealesCount debe ser 0');
      const kpiInd = stSnap.snapshot.computed.av2.kpiIndustriales;
      assert.ok(kpiInd && kpiInd.precioIndiferenciaCanalVsVivo > 9000 && kpiInd.alimentoPctSobreCostoCanal3Lotes > 0.5 && kpiInd.utilidadPorAveFin3Lotes > 8000, 'kpiIndustriales CFO completo');
      const gov = stSnap.snapshot.computed.av2.gobiernoEjecutivo;
      assert.ok(gov && gov.estadoCampoHoy && gov.tesoreriaViva && gov.escenarioAcido && gov.riesgosYDecisiones, 'Fase H1 gobiernoEjecutivo completo');
      assert.strictEqual(gov.estadoCampoHoy.diasReportadosEnVentana, 0, 'Sin registros en campo, diasReportadosEnVentana debe ser 0');
      assert.strictEqual(gov.estadoCampoHoy.bultosCompradosInicio, 3, 'Bajo JIT real, en Sem 1 solo hay 3 bultos Master Pollito comprados (no 54)');
      assert.ok(gov.estadoCampoHoy.bultosRestantesPisoHoy > 1.5 && gov.estadoCampoHoy.bultosRestantesPisoHoy < 3, `Existencia fisica hoy debe ser ~2 bultos, no 53 (${gov.estadoCampoHoy.bultosRestantesPisoHoy})`);
      assert.strictEqual(gov.tesoreriaViva.comprometidoArranqueRealCop, 4326000, 'Arranque real + bodega Sem 1 (3 bultos Master) debe sumar $4.326.000');
      assert.ok(gov.tesoreriaViva.giroSem3Cop > 4000000 && gov.escenarioAcido.utilidadAcida3LCop > 10000000, 'Tesorería Viva y Escenario Ácido válidos');
      assert.strictEqual(gov.tesoreriaViva.picoFechaCorta, '23-dic', 'Tope caja debe tener fecha explícita 23-dic');
      assert.strictEqual(gov.tesoreriaViva.payback3LotesFechaCorta, '15-ene', 'Payback 3L debe tener fecha 15-ene');
      assert.strictEqual(gov.tesoreriaViva.paybackContinuoFechaCorta, '06-feb', 'Payback Continuo debe tener fecha 06-feb');
      assert.strictEqual(gov.riesgosYDecisiones.top3DecisionesSemana.length, 3, 'Debe emitir exactamente 3 decisiones priorizadas de la semana');
      assert.strictEqual(stSnap.snapshot.computed.av2.scorecardBsc.clienteMercado.hasRealSales, false, 'Sin ventas parciales hasRealSales debe ser false');
      assert.notStrictEqual(stSnap.snapshot.computed.av2.scorecardBsc.clienteMercado.status, 'verde', 'Sin ventas reales Cliente/Mercado no debe ponerse en verde');

      // Verificar que registrar un pesaje desbloquea iepRealCampo y fcrRealCampo en Scorecard
      const pesRes = await postApi('/api/twin/event', {
        type: 'SAMPLE_WEIGHING',
        sourceChannel: 'verify_script',
        payload: { dia: 14, avesMuestra: 30, pesoTotalKg: 14.55 }
      }, davidCookie);
      assert.ok(pesRes.snapshot.computed.av2.bitacora.pesajesRealesCount >= 1 && pesRes.snapshot.computed.av2.scorecardBsc.procesosInternos.iepRealCampo > 200, 'SAMPLE_WEIGHING debe desbloquear iepRealCampo');
      await fetch(`${base}/api/twin/rollback`, { method: 'POST', headers: { Cookie: mauCookie } });

      const qualLog = await postApi('/api/realtime/tool-call', {
        name: 'record_daily_log',
        arguments: { observacion: 'Visita nocturna alimento a libre demanda sin pesaje' }
      }, davidCookie);
      assert.strictEqual(qualLog.output.ok !== false && qualLog.stateChanged, true, 'record_daily_log cualitativo sin dia ni kilos debe funcionar');
      await fetch(`${base}/api/twin/rollback`, { method: 'POST', headers: { Cookie: mauCookie } });

      const vAfter = (await (await fetch(`${base}/api/twin/state`, { headers: { Cookie: davidCookie } })).json()).version;
      assert.strictEqual(vAfter, vBefore, 'Estado oficial debe volver intacto tras consultas, simulaciones WOW y rollback');

      // Activos Frontend G.4 & Auditoria Operativa
      const idxHtml = await (await fetch(`${base}/`)).text();
      const idxJs = await (await fetch(`${base}/app.js`)).text();
      const idxCss = await (await fetch(`${base}/styles.css`)).text();
      ['wow-simulations-suite-box', 'sim_1_estirpes_thi', 'sim_2_portafolio_b2b', 'sim_3_nutricion_capex', 'sim_4_prefaena_frio', 'sim_5_anual_toc', 'vision-spontaneous-banner', 'vision-layers-grid', 'avi-vision-dialogue-preview', 'radiografia-costos-grid', 'btn-quick-visita-ok', 'weighing-avg-preview', 'btn-trip-mode-close', 'exec-truth-strip', 'exec-decisions-strip', 'btn-hero-cash-3l', 'bsc-details-wrap', 'growth-tracker-panel', 'growth-curve-chart-box', 'btn-target-dec22', 'btn-target-dec24', 'avi-focus-bar', 'btn-layout-paged', 'btn-layout-scroll'].forEach((tok) => {
        assert.ok(idxHtml.includes(tok), `index.html falta ${tok}`);
      });
      ['collectLiveUiContext', 'playAviVisionDialogue', 'WOW_SIM_CONFIGS', 'renderWowSimulationsSuite', 'renderPreChristmasGrowthCurve', 'applyLayoutViewMode', 'setCardVisualAndVoiceFocus', 'buildLocalCardFocusInsight'].forEach((tok) => {
        assert.ok(idxJs.includes(tok), `app.js falta ${tok}`);
      });
      assert.strictEqual(TwinEngine.ROSS_PESO_G[40], 2792, 'Peso Ross Dia 40 (22-dic) debe ser 2792 g');
      const simD40 = TwinEngine.simulateWhatIf(TwinEngine.createDefaultTwinState(), { edadGlobal: 40 });
      assert.strictEqual(simD40.computed.av2.lotes[0].fechaSalida, '2026-12-22', 'Dia 40 Lote 1 debe caer el 2026-12-22');
      assert.ok(kpiInd.mofc3LotesCop > 30000000 && kpiInd.mofc3LotesPct > 0.5, 'kpiIndustriales debe incluir MOFC (Margen sobre Alimento)');
      assert.strictEqual(gov.riesgosYDecisiones.areaMedidaVerificada, false, 'Area de galpon debe iniciar marcada como no verificada en campo hasta medir m2');
      assert.ok(idxCss.includes('.wow-sim-tab') && idxCss.includes('.vision-layers-grid') && idxCss.includes('.growth-curve-kpis') && idxCss.includes('.is-page-inactive') && idxCss.includes('.avi-focus-bar'), 'styles.css debe incluir estilos G.4, paginacion y foco interactivo');
    });

    for (const item of results) {
      await item.fn();
      console.log(`[PASS] ${item.name}`);
    }
    console.log(`\nVERIFICACION FASE F COMPLETA: ${results.length}/${results.length} PASS`);
  } finally {
    await srv.stop().catch(() => {});
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[FAIL] verify-phase-f:', err);
  process.exit(1);
});
