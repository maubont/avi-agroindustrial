'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const TwinEngine = require('../shared/causal-twin-engine');
const { createAvicolaServer } = require('../server/index');

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

function readPublic(file) {
  return fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
}

async function run() {
  const results = [];
  const check = (name, fn) => results.push({ name, fn });

  const indexHtml = readPublic('index.html');
  const stylesCss = readPublic('styles.css');
  const appJs = readPublic('app.js');

  check('1. Sintaxis JS frontend (app.js) válida + referencia window.CausalTwinEngine', async () => {
    new vm.Script(appJs, { filename: 'app.js' });
    assert.ok(
      appJs.includes('window.CausalTwinEngine'),
      'app.js debe enlazar window.CausalTwinEngine'
    );
  });

  check('2. Estructura IA-Nativa de 7 módulos, Workspace Ribbon, Scenario Cards y Modales', async () => {
    const requiredSections = [
      'resumen_ejecutivo',
      'simulador_whatif',
      'operacion_av2',
      'plan_av1',
      'bitacora_pesajes',
      'bodega_termica',
      'puente_antigravity'
    ];
    for (const sec of requiredSections) {
      assert.ok(
        indexHtml.includes(`data-section="${sec}"`),
        `Falta módulo data-section="${sec}"`
      );
    }
    const requiredIds = [
      'workspace-ribbon',
      'ambient-pulse-bar',
      'whatif-scenario-cards',
      'chart-ross-box',
      'chart-cashflow-box',
      'cashflow-hover-bar',
      'modal-council',
      'modal-cmd',
      'modal-credentials',
      'briefing-banner',
      'voice-orb-canvas',
      'copilot-dock',
      'btn-agent-identity',
      'panel-viajes-transporte',
      'panel-ventas-parciales',
      'btn-download-minuta',
      'hero-bridge-chart-box',
      'hero-bridge-tooltip',
      'modal-concil',
      'bodega-pipeline-container',
      'avi-chat-toggle-label'
    ];
    for (const id of requiredIds) {
      assert.ok(indexHtml.includes(`id="${id}"`), `Falta elemento id="${id}"`);
    }
    assert.ok(indexHtml.includes('Granja La Alejandra') && indexHtml.includes('Vereda La Alejandra'), 'index.html debe identificar Granja La Alejandra en Vereda La Alejandra (El Zulia)');
    assert.ok(!indexHtml.includes('Solicitar Mejora') && !indexHtml.includes('🤖') && !indexHtml.includes('🐔'), 'index.html no debe contener Solicitar Mejora ni emojis 🤖/🐔');
    // EXP-1: evitar siglas crípticas en headings visibles
    assert.ok(!/S\/SAC|C\/SAC/.test(indexHtml), 'No deben existir siglas crípticas S/SAC o C/SAC en index.html');
  });

  check('3. CSS Craft Dual-Theme (Obsidian + Solar Alabastro) y despeje Copilot Dock', async () => {
    assert.ok(stylesCss.includes('html[data-theme="solar"]'), 'Falta tema Solar Alabastro');
    assert.ok(stylesCss.includes('tabular-nums'), 'Falta alineación numérica tabular-nums');
    assert.ok(/padding-bottom:\s*(140|170)px/.test(stylesCss), 'Falta despeje inferior sobre dock');
    assert.ok(stylesCss.includes('.hero-bridge-panel') && stylesCss.includes('.solla-pipeline'), 'Faltan estilos Puente Módulo 1 y Pipeline Solla');
    assert.ok(stylesCss.includes('.council-grid') && stylesCss.includes('.briefing-banner'), 'Faltan estilos Ciclo 2');
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'avicola-p4-'));
  const dataDir = path.join(tmpRoot, 'data');
  const bridgeDir = path.join(tmpRoot, 'bridge');
  const exportsDir = path.join(tmpRoot, 'exports');
  const envFilePath = path.join(tmpRoot, '.env.test');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(bridgeDir, { recursive: true });
  fs.mkdirSync(exportsDir, { recursive: true });

  const srv = createAvicolaServer({
    dataDir,
    bridgeDir,
    exportsDir,
    envFilePath,
    supabaseUrl: '',
    supabaseKey: '',
    telegramToken: '',
    enableTelegram: false
  });
  const info = await srv.start(0, '127.0.0.1');
  const base = info.url;
  const extractCookie = (resp) => {
    const sc = typeof resp.headers.getSetCookie === 'function'
      ? resp.headers.getSetCookie()[0]
      : resp.headers.get('set-cookie');
    return sc ? sc.split(';')[0] : '';
  };
  const ownerLoginInit = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'mauricio', pin: '2026' })
  });
  assert.strictEqual(ownerLoginInit.status, 200, 'Login inicial Mauricio debe devolver 200');
  const ownerCookie = extractCookie(ownerLoginInit);
  assert.ok(ownerCookie.includes('avicola_session='), 'Mauricio debe obtener cookie de sesión');

  try {
    check('4. Activos estáticos HTTP 200 (/, /styles.css, /app.js, /shared/*)', async () => {
      for (const route of [
        '/',
        '/styles.css',
        '/app.js',
        '/shared/causal-twin-engine.js',
        '/shared/openai-models-config.js'
      ]) {
        const r = await fetch(`${base}${route}`);
        assert.strictEqual(r.status, 200, `Ruta ${route} devolvió ${r.status}`);
        const text = await r.text();
        assert.ok(text.length > 200, `Ruta ${route} devolvió cuerpo vacío`);
      }
    });

    check('5. Paridad Isomórfica Navegador vs Backend /api/twin/state ($0,00 desviación)', async () => {
      const r = await fetch(`${base}/api/twin/state`);
      assert.strictEqual(r.status, 200);
      const body = await r.json();
      const s = body.snapshot;
      assert.ok(s && s.state && s.computed);

      const clientCheck = TwinEngine.verifyZeroDivergence(s.computed);
      assert.ok(clientCheck.ok, `Divergencia detectada: ${JSON.stringify(clientCheck.mismatches)}`);

      assert.ok(Math.abs(s.computed.av2.lotes[0].utilidadCanal - 4677666) < 1, 'Utilidad Lote 1 inesperada');
      assert.ok(Math.abs(s.computed.av2.consolidado3Lotes.utilidadCanal - 20062243) < 1, 'Utilidad 3 Lotes inesperada');
      assert.ok(Math.abs(s.computed.av2.tesoreriaResumen.capitalTrabajoPicoSem7 - 31212600) < 1, 'Pico Sem 7 inesperado');
      assert.ok(Math.abs(s.computed.av1.anual12Meses.consolidado.utilidadCanal - 40274309) < 1, 'Anual 12m inesperado');
    });

    check('6. Simulación What-If 45d (2,72 kg canal) y Comparativa 42/45/48d', async () => {
      const r = await fetch(`${base}/api/twin/what-if`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edadGlobal: 45 })
      });
      assert.strictEqual(r.status, 200);
      const data = await r.json();
      assert.ok(data.simulation, 'Debe devolver objeto simulation');
      assert.strictEqual(data.simulation.comparativaEdades.length, 3);
      assert.ok(
        data.simulation.computed.av2.consolidado3Lotes.utilidadCanal > 22800000,
        'Simulación 45d debe superar $22,8M en 3 lotes'
      );
    });

    check('7. Ciclo Transaccional Evento + Rollback + RFC Puente Antigravity', async () => {
      const before = await (await fetch(`${base}/api/twin/state`)).json();
      const v0 = before.snapshot.version;

      const evRes = await fetch(`${base}/api/twin/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FEED_PURCHASE',
          sourceChannel: 'verify_phase4',
          payload: { fase: 'Nutrepollo Cr SP', bultos: 5 }
        })
      });
      assert.strictEqual(evRes.status, 200);
      const evJson = await evRes.json();
      assert.strictEqual(evJson.snapshot.version, v0 + 1);

      const rbRes = await fetch(`${base}/api/twin/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.strictEqual(rbRes.status, 200);
      const rbJson = await rbRes.json();
      assert.strictEqual(rbJson.snapshot.version, v0);
      assert.strictEqual(rbJson.snapshot.computed.av2.auditoriaBodegaLote1.faltantePpto.nutrepollo, 5);

      const anonRfc = await fetch(`${base}/api/bridge/rfcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: 'Anon Blocked', descripcion: 'Debe retornar 403' })
      });
      assert.strictEqual(anonRfc.status, 403, 'RFC anónimo debe retornar 403 (default-deny)');

      const rfcRes = await fetch(`${base}/api/bridge/rfcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          titulo: 'Test Verify Phase 4',
          descripcion: 'Validación end-to-end del puente RFC en Fase 4',
          sourceChannel: 'verify_phase4'
        })
      });
      assert.strictEqual(rfcRes.status, 201);
      const rfcData = await rfcRes.json();
      const approveRes = await fetch(`${base}/api/bridge/rfcs/${encodeURIComponent(rfcData.rfc.rfcCode)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ approvedBy: 'verify_phase4' })
      });
      assert.strictEqual(approveRes.status, 200);
    });

    check('8. Descarga Excel AV-1/AV-2 Vivo (.xlsx) & Round-trip Hydrate', async () => {
      const av1Anon = await fetch(`${base}/api/excel/download/AV1`);
      assert.strictEqual(av1Anon.status, 403, 'Descarga AV1 anónima debe bloquearse con 403');
      const av1 = await fetch(`${base}/api/excel/download/AV1`, { headers: { Cookie: ownerCookie } });
      assert.strictEqual(av1.status, 200);
      const av1Buf = Buffer.from(await av1.arrayBuffer());
      assert.strictEqual(av1Buf.slice(0, 2).toString('utf8'), 'PK', 'AV1 debe ser XLSX ZIP válido');
      assert.ok(av1Buf.length > 10000);

      const av2 = await fetch(`${base}/api/excel/download/AV2`);
      assert.strictEqual(av2.status, 200);
      const av2Buf = Buffer.from(await av2.arrayBuffer());
      assert.strictEqual(av2Buf.slice(0, 2).toString('utf8'), 'PK', 'AV2 debe ser XLSX ZIP válido');
      assert.ok(av2Buf.length > 10000);

      const form = new FormData();
      form.append(
        'file',
        new Blob([av2Buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        'AV2_roundtrip.xlsx'
      );
      const hyd = await fetch(`${base}/api/excel/hydrate`, { method: 'POST', body: form });
      assert.strictEqual(hyd.status, 200);
      const hydJson = await hyd.json();
      assert.strictEqual(hydJson.hydration.workbookKind, 'AV2');
    });

    check('9. Viajes/Odómetro (RFC-0001), Ventas Parciales (RFC-0002), Identidad Agente & Día 3', async () => {
      // Registrar nota Day 3 sin consumo numérico -> debe contar diasRegistrados = 1 y tieneNotaUsuario = true
      const d3Res = await fetch(`${base}/api/twin/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DAILY_LOG',
          payload: { dia: 3, observacion: 'Viaje a granja. Odómetro inicial 52.300.' }
        })
      });
      assert.strictEqual(d3Res.status, 200);
      const d3Json = await d3Res.json();
      assert.strictEqual(d3Json.snapshot.computed.av2.bitacora.diasRegistrados, 1);
      assert.strictEqual(d3Json.snapshot.computed.av2.bitacora.dias[2].tieneNotaUsuario, true);

      // Abrir y cerrar viaje (TRIP_LOG)
      const openTripRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'record_farm_trip',
          arguments: { action: 'open', diaCiclo: 3, odometroInicial: 52300, kmEstimado: 8, motivo: 'Visita Lote 1' }
        })
      });
      assert.strictEqual(openTripRes.status, 200);
      const openTripJson = await openTripRes.json();
      assert.strictEqual(openTripJson.output.transporte.viajesEnCurso, 1);

      const closeTripRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'record_farm_trip',
          arguments: { action: 'close', odometroFinal: 52318, combustibleCop: 28000 }
        })
      });
      assert.strictEqual(closeTripRes.status, 200);
      const closeTripJson = await closeTripRes.json();
      assert.strictEqual(closeTripJson.output.transporte.viajesEnCurso, 0);
      assert.strictEqual(closeTripJson.output.transporte.kmTotales, 18);
      assert.strictEqual(closeTripJson.output.transporte.costoTransporteTotalCop, 28000);

      // Registrar venta parcial en piezas/desposte (PARTIAL_SALE)
      const saleRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'record_partial_sale',
          arguments: { modalidad: 'piezas', cliente: 'Asadero Prueba', corteDetalle: 'Pechuga', cantidadAves: 20, pesoKg: 35, precioUnitarioKgCop: 14800 }
        })
      });
      assert.strictEqual(saleRes.status, 200);
      const saleJson = await saleRes.json();
      assert.strictEqual(saleJson.output.ventasParcialesResumen.totalIngresosCop, 518000);
      assert.ok(saleJson.output.ventasParcialesResumen.comparativaModalidadesLote1.piezas100.utilidadCop > 0);

      // Cambiar identidad de agente (set_agent_identity)
      const identRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'set_agent_identity', arguments: { nombre: 'Aurora IA' } })
      });
      assert.strictEqual(identRes.status, 200);
      const identJson = await identRes.json();
      assert.strictEqual(identJson.output.identidadAgente.nombre, 'Aurora IA');
    });

    check('10. Persistencia Conversación, Minuta PDF (RFC-0003), Export Spotlight & Normalización RFC', async () => {
      const logPost = await fetch(`${base}/api/conversation/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'user', channel: 'web_realtime', text: 'Prueba conversación persistente' })
      });
      assert.strictEqual(logPost.status, 201);

      const logGet = await fetch(`${base}/api/conversation/log`);
      assert.strictEqual(logGet.status, 200);
      const logData = await logGet.json();
      assert.ok(logData.entries.some((e) => e.text === 'Prueba conversación persistente'));

      const minHtml = await fetch(`${base}/api/minuta/export`);
      assert.strictEqual(minHtml.status, 200);
      const minText = await minHtml.text();
      assert.ok(minText.includes('Aurora IA') && minText.includes('Asadero Prueba'));
      assert.ok(minText.includes('La Alejandra') && !minText.includes('/api/excel/download/AV1'), 'Minuta pública/fundador debe omitir enlaces AV-1');

      const minJsonRes = await fetch(`${base}/api/minuta/export?format=json`);
      assert.strictEqual(minJsonRes.status, 200);
      const minJson = await minJsonRes.json();
      assert.strictEqual(minJson.identidadAgente.nombre, 'Aurora IA');
      assert.strictEqual((minJson.rfcs || []).length, 0, 'Minuta JSON sin sesión owner no debe filtrar RFCs');

      const minJsonOwner = await (await fetch(`${base}/api/minuta/export?format=json`, { headers: { Cookie: ownerCookie } })).json();
      assert.ok(Array.isArray(minJsonOwner.rfcs) && minJsonOwner.rfcs.length >= 1, 'Owner debe ver RFCs en minuta JSON');

      // Verificar normalización rutas reales en RFC y aprobación por voz (solo Owner)
      const anonProp = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'propose_structural_rfc',
          arguments: { titulo: 'Anon Test', descripcion: 'Debe retornar 403' }
        })
      });
      assert.strictEqual(anonProp.status, 403, 'Herramienta propose_structural_rfc anónima debe bloquearse con 403');

      const propRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({
          name: 'propose_structural_rfc',
          arguments: {
            titulo: 'RFC Ruta Real Test',
            descripcion: 'Probar mapeo de archivo sintético tsx a ruta real',
            archivosAfectados: ['src/components/FakeModal.tsx']
          }
        })
      });
      assert.strictEqual(propRes.status, 200);
      const propJson = await propRes.json();
      assert.ok(propJson.rfc.archivosAfectados.includes('avicola_app/public/app.js'));
      assert.ok(!propJson.rfc.archivosAfectados.some((f) => f.endsWith('.tsx')));

      const apprAll = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ name: 'approve_structural_rfc', arguments: { rfcCode: 'ALL' } })
      });
      assert.strictEqual(apprAll.status, 200);
      const apprJson = await apprAll.json();
      assert.ok(apprJson.output.approvedCount >= 1);

      const expTool = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'export_live_excel', arguments: { which: 'AV2' } })
      });
      assert.strictEqual(expTool.status, 200);
      const expJson = await expTool.json();
      assert.strictEqual(expJson.uiAction.section, 'puente_antigravity');
      assert.strictEqual(expJson.uiAction.triggerDownload, true);
      assert.strictEqual(expJson.output.downloadUrl, '/api/excel/download/AV2');
    });

    check('11. Auth Multi-Usuario RBAC, UI De-Jargon, Flujo Continuo 900, Cierre Mixto y Presencia Avi', async () => {
      const defState = TwinEngine.createDefaultTwinState();
      assert.strictEqual(defState.identidadAgente.nombre, 'Avi');
      assert.ok(!indexHtml.includes('id="view-mode-bar"'), 'index.html NO debe incluir #view-mode-bar');
      assert.ok(!indexHtml.includes('Simulador Isomórfico'), 'index.html NO debe contener jerga Simulador Isomórfico');
      assert.ok(!indexHtml.includes('Valle de Caja'), 'index.html NO debe contener jerga Valle de Caja');
      assert.ok(indexHtml.includes('Simulador de Proyecciones Dinámicas'), 'index.html debe incluir Simulador de Proyecciones Dinámicas');
      assert.ok(indexHtml.includes('id="auth-gate-overlay"'), 'index.html debe incluir #auth-gate-overlay');
      assert.ok(indexHtml.includes('id="btn-user-menu"'), 'index.html debe incluir #btn-user-menu');
      assert.ok(indexHtml.includes('id="modal-users"'), 'index.html debe incluir #modal-users');
      assert.ok(indexHtml.includes('id="btn-preset-mix-200"'), 'index.html debe incluir #btn-preset-mix-200');
      assert.ok(indexHtml.includes('id="btn-apply-cont-config"'), 'index.html debe incluir #btn-apply-cont-config');
      assert.ok(indexHtml.includes('id="btn-buy-nutre2"'), 'index.html debe incluir #btn-buy-nutre2');
      assert.ok(indexHtml.includes('id="desposte-split-calc"'), 'index.html debe incluir #desposte-split-calc');
      assert.ok(indexHtml.includes('id="btn-eval-100-pollos"'), 'index.html debe incluir #btn-eval-100-pollos');
      assert.ok(indexHtml.includes('id="btn-eval-50-pechugas"'), 'index.html debe incluir #btn-eval-50-pechugas');
      assert.ok(indexHtml.includes('id="btn-trip-timer-15m"'), 'index.html debe incluir #btn-trip-timer-15m');
      assert.ok(indexHtml.includes('Resumen Guiado'), 'Botón debe llamarse Resumen Guiado');
      assert.ok(!indexHtml.includes('⚡ Briefing'), 'No debe quedar texto ⚡ Briefing');
      assert.ok(appJs.includes('output_audio_transcript'), 'app.js debe capturar response.output_audio_transcript.*');
      assert.ok(appJs.includes('Master Pollito (Preiniciación Sem 1') && appJs.includes('Nutrepollo Cr SP (Iniciación Sem 2'), 'app.js debe mostrar orden correcto Preiniciación -> Iniciación');
      assert.ok(appJs.includes('updateThemeButtonLabel') && appJs.includes('hero-bridge-chart-box') && appJs.includes('flujoCajaDia1SoloPechugasCop'), 'app.js debe incluir label tema activo, puente SVG Módulo 1 y flujo Día 1 de desposte');

      const pollosRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'evaluate_commercial_opportunity',
          arguments: { tipo: 'pollos_adelantados', cantidadAves: 100, pesoVivoActualKg: 2.10, precioOfertaKgCop: 10000 }
        })
      });
      assert.strictEqual(pollosRes.status, 200);
      const pollosJson = await pollosRes.json();
      assert.strictEqual(pollosJson.output.tipo, 'pollos_adelantados');
      assert.ok(pollosJson.output.ingresoOfertaTotalCop > 0, 'Debe calcular ingresoOfertaTotalCop');
      assert.ok(pollosJson.output.precioMinimoKgParaIgualar42dCop > 10000, 'Debe calcular precio mínimo de equilibrio > 10000');
      assert.strictEqual(pollosJson.uiAction.section, 'operacion_av2');

      const pechRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'evaluate_commercial_opportunity',
          arguments: { tipo: 'venta_pechugas', cantidadPechugas: 100, precioPorPechugaCop: 14500 }
        })
      });
      assert.strictEqual(pechRes.status, 200);
      const pechJson = await pechRes.json();
      assert.strictEqual(pechJson.output.tipo, 'venta_pechugas');
      assert.strictEqual(pechJson.output.ingresoPechugasCop, 1450000);
      assert.ok(pechJson.output.ingresoRestoPresasCop > 0, 'Debe valorar el resto de presas');
      assert.ok(pechJson.output.restoPresasPorColocarKg > 0, 'Debe exponer kg restantes de pernil/alas/menudencias');
      assert.ok(pechJson.output.deficitCajaInicialSoloPechugasCop > 0, 'Debe advertir déficit de caja Día 1 si solo vende pechugas');

      const mixRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'set_lote_mixed_sale',
          arguments: { loteId: 'lote-1', tramoEspecialAves: 200, precioTramoEspecialKg: 13000, precioRestoKg: 11000 }
        })
      });
      assert.strictEqual(mixRes.status, 200);
      const mixJson = await mixRes.json();
      assert.strictEqual(mixJson.output.cierreLote.tramoEspecialAves, 200);
      assert.ok(mixJson.output.cierreLote.deltaVsBaseCop > 0, '200 @ $13.000 + 382 @ $11.000 supera la base de $11.500');
      await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'set_lote_mixed_sale',
          arguments: { loteId: 'lote-1', tramoEspecialAves: 0, precioRestoKg: null }
        })
      });

      const contRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'set_continuous_cycle_config',
          arguments: { avesPorLote: 900, cadenciaDias: 18, lotesAdicionales: 3 }
        })
      });
      assert.strictEqual(contRes.status, 200);
      const contJson = await contRes.json();
      assert.strictEqual(contJson.output.continuoResumen.lotesProyectados.length, 3);
      assert.ok(contJson.output.continuoResumen.semanasTotales >= 17, 'Flujo continuo debe extenderse mínimo hasta semana 17');

      const modeRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'set_workspace_mode', arguments: { mode: 'av2_only' } })
      });
      assert.strictEqual(modeRes.status, 200);
      const modeJson = await modeRes.json();
      assert.strictEqual(modeJson.uiAction.action, 'set_workspace_mode');
      assert.strictEqual(modeJson.uiAction.mode, 'av2_only');

      assert.ok(indexHtml.includes('id="avi-nebula-widget"'), 'index.html debe incluir #avi-nebula-widget');
      assert.ok(indexHtml.includes('id="avi-nebula-canvas"'), 'index.html debe incluir #avi-nebula-canvas');
      assert.ok(indexHtml.includes('id="btn-nebula-chat-toggle"'), 'index.html debe incluir #btn-nebula-chat-toggle');
      assert.ok(indexHtml.includes('class="copilot-dock dock-collapsed"'), '#copilot-dock debe iniciar colapsado y discreto');
      assert.ok(appJs.includes('setConversationDrawerOpen') && appJs.includes('moveAviPresence'), 'app.js debe controlar drawer y movimiento móvil de Avi');

      const moveRes = await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'move_avi_presence',
          arguments: { position: 'top-right', transcriptOpen: false }
        })
      });
      assert.strictEqual(moveRes.status, 200);
      const moveJson = await moveRes.json();
      assert.strictEqual(moveJson.uiAction.action, 'move_avi_presence');
      assert.strictEqual(moveJson.uiAction.position, 'top-right');
      assert.strictEqual(moveJson.uiAction.transcriptOpen, false);

      // Verificación RBAC Multi-Usuario Default-Deny: Anónimo vs David (Fundador / farm_partner) vs Mauricio (Administrador / owner)
      assert.strictEqual((await fetch(`${base}/api/auth/users`)).status, 403, 'GET /api/auth/users anónimo -> 403');
      assert.strictEqual((await fetch(`${base}/api/admin/template-blueprint`)).status, 403, 'blueprint anónimo -> 403');
      assert.strictEqual((await fetch(`${base}/api/bridge/rfcs`)).status, 403, 'GET /api/bridge/rfcs anónimo -> 403');
      assert.strictEqual((await fetch(`${base}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ OPENAI_API_KEY: 'sk-blocked' })
      })).status, 403, 'POST /api/credentials anónimo -> 403');
      assert.strictEqual((await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'rollback_last_event', arguments: {} })
      })).status, 403, 'rollback_last_event anónimo -> 403');

      const loginPartner = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'david', pin: '1234' })
      });
      assert.strictEqual(loginPartner.status, 200);
      const partnerCookie = extractCookie(loginPartner);
      assert.ok(partnerCookie.includes('avicola_session='), 'Login david debe emitir cookie de sesión');

      const partnerSess = await (await fetch(`${base}/api/auth/session`, { headers: { Cookie: partnerCookie } })).json();
      assert.strictEqual(partnerSess.authenticated, true);
      assert.strictEqual(partnerSess.user.username, 'david');
      assert.strictEqual(partnerSess.user.displayName, 'David Bonilla');
      assert.strictEqual(partnerSess.user.role, 'farm_partner');
      assert.strictEqual(partnerSess.user.titleBadge, 'Fundador');

      const loginLegacyAlias = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hermano', pin: '1234' })
      });
      assert.strictEqual(loginLegacyAlias.status, 200, 'Alias legado hermano debe mapear transparentemente a david');
      const aliasJson = await loginLegacyAlias.json();
      assert.strictEqual(aliasJson.user.username, 'david');

      assert.strictEqual((await fetch(`${base}/api/excel/download/AV1`, { headers: { Cookie: partnerCookie } })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/admin/template-blueprint`, { headers: { Cookie: partnerCookie } })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/bridge/rfcs`, { headers: { Cookie: partnerCookie } })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/bridge/rfcs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({ titulo: 'Test', descripcion: 'Blocked' })
      })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({ OPENAI_API_KEY: 'sk-blocked' })
      })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/auth/users`, { headers: { Cookie: partnerCookie } })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({ username: 'intruder', displayName: 'X', pin: '9999' })
      })).status, 403);
      assert.strictEqual((await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({ name: 'propose_structural_rfc', arguments: { titulo: 'X', descripcion: 'Y' } })
      })).status, 403);

      const pModeJson = await (await fetch(`${base}/api/realtime/tool-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({ name: 'set_workspace_mode', arguments: { mode: 'all' } })
      })).json();
      assert.strictEqual(pModeJson.uiAction.mode, 'av2_only', 'farm_partner debe quedarse fijado en av2_only');

      const bpRes = await fetch(`${base}/api/admin/template-blueprint`, { headers: { Cookie: ownerCookie } });
      assert.strictEqual(bpRes.status, 200);
      const bpJson = await bpRes.json();
      assert.strictEqual(bpJson.templateKind, 'avicola_standalone_blueprint');
      assert.strictEqual(bpJson.viajesTransporte, undefined, 'Blueprint limpio no debe exponer viajes privados del fundador');
      assert.strictEqual(bpJson.ventasParciales, undefined, 'Blueprint limpio no debe exponer ventas privadas del fundador');

      const updRes = await fetch(`${base}/api/auth/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({ username: 'david', displayName: 'David Bonilla', titleBadge: 'Fundador', role: 'farm_partner' })
      });
      assert.strictEqual(updRes.status, 200);

      // Verificación COP TTS normalizer + Briefing Estratégico Dinámico + No Redundancia UI + Movilidad Avi
      const { sanitizeSpeechTextForCop } = require('../server/openai-gateway');
      const spokenSample = sanitizeSpeechTextForCop('Pico -$31.212.600, Lote 1 $4.677.666 y Pechuga $14.500 COP');
      assert.ok(!spokenSample.includes('$'), 'TTS normalizado no debe contener signo $');
      assert.ok(!/d[oó]lares/i.test(spokenSample), 'TTS normalizado no debe decir dólares');
      assert.ok(spokenSample.includes('31 millones 212 mil 600 pesos'), 'Debe vocalizar millones/miles en pesos');

      const briefPartnerRes = await fetch(`${base}/api/agent/guided-briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: partnerCookie },
        body: JSON.stringify({})
      });
      assert.strictEqual(briefPartnerRes.status, 200);
      const briefPartner = await briefPartnerRes.json();
      assert.strictEqual(briefPartner.steps.length, 4);
      assert.ok(briefPartner.steps[1].title.includes('Kaplan'), 'Paso 2 debe incluir título Kaplan & Norton');
      assert.ok(briefPartner.steps[3].displayText.includes('Día 42') && briefPartner.steps[3].displayText.includes('Día 28'), 'Paso 4 debe describir plan base Día 42 y simulador flexible Día 28-49');
      assert.ok(!JSON.stringify(briefPartner.steps).includes('alimento balanceado propio'), 'Partner no debe recibir palanca interna AV-1 en briefing');
      for (const st of briefPartner.steps) {
        assert.ok(!st.speechText.includes('$') && !/d[oó]lares/i.test(st.speechText), 'speechText debe venir limpio sin $ ni dólares');
      }

      const briefOwnerRes = await fetch(`${base}/api/agent/guided-briefing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
        body: JSON.stringify({})
      });
      assert.strictEqual(briefOwnerRes.status, 200);
      const briefOwner = await briefOwnerRes.json();
      assert.ok(JSON.stringify(briefOwner.steps).includes('alimento balanceado propio'), 'Owner sí debe ver palanca futura alimento propio');

      assert.ok(!indexHtml.includes('antes de comprometer los siguientes lotes'), 'Módulo 1 no debe tener texto tentativo de espera');
      assert.ok(!appJs.includes('Validación Inicial'), 'app.js no debe tener Paso 1 · Validación Inicial');
      assert.ok(appJs.includes('estimateDayForTargetCutWeight') && appJs.includes('sanitizeSpeechForCop'), 'app.js debe incluir simulador flexible de peso/corte y sanitizeSpeechForCop');
    });

    for (const item of results) {
      await item.fn();
      console.log(`[PASS] ${item.name}`);
    }
    console.log(`\nVERIFICACION FASE 4 COMPLETA: ${results.length}/${results.length} PASS`);
  } finally {
    await srv.stop().catch(() => {});
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error('[FAIL] verify-phase4:', err);
  process.exit(1);
});
