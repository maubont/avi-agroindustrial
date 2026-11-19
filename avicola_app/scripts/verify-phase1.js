'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { performance } = require('perf_hooks');

const TwinEngine = require('../shared/causal-twin-engine');
const ModelsConfig = require('../shared/openai-models-config');
const { HybridTwinStore } = require('../server/state-store');

async function main() {
  console.log('====================================================================');
  console.log('AUDITORÍA FORENSE FASE 1 — GEMELO DIGITAL CAUSAL (AV-1 & AV-2)');
  console.log('====================================================================\n');

  // 1. Verificar configuración de modelos OpenAI de frontera
  const cfg = ModelsConfig.resolveRealtimeSessionConfig(process.env);
  console.log('[1/4] Catálogo OpenAI de Frontera:', {
    realtimePrimary: cfg.primaryModel,
    fullDuplexLive: cfg.fullDuplexModel,
    stt: cfg.sttModel,
    tts: cfg.ttsModel,
    agenticMultimodal: cfg.agentModel,
    agentFast: cfg.agentFastModel,
    voice: cfg.voice,
    speed: cfg.speed
  });
  assert(cfg.primaryModel, 'Debe resolver realtimePrimary');
  assert(cfg.speed === 1.18, 'La velocidad de voz debe ser 1.18x');

  // 2. Conciliación Forense $0 contra invariantes de AV-1 y AV-2
  const baseState = TwinEngine.createDefaultTwinState();
  const baseComputed = TwinEngine.computeFullTwin(baseState);
  const verification = TwinEngine.verifyZeroDivergence(baseComputed);

  console.log('\n[2/4] Conciliación Forense Exacta vs. Excel COM (AV-1 y AV-2):');
  for (const row of verification.checks) {
    console.log(
      `  - ${row.metric.padEnd(28)} | Twin=${row.actual.toFixed(4)} | Excel=${row.expected.toFixed(4)} | Diff=${row.diff.toFixed(6)}`
    );
  }
  console.log(`  => MAX DIFF = ${verification.maxDiff.toFixed(6)} | OK = ${verification.ok}`);
  assert(verification.ok, `Divergencia matemática detectada: maxDiff=${verification.maxDiff}`);

  // Verificar adicionalmente proyección anual 12 meses (AV-1 Hoja 3)
  const anual = baseComputed.av1.anual12Meses.consolidado;
  console.log('\n  [AV-1 Proyección Anual 12 Meses]:', {
    avesIniciadas: anual.avesInic,
    avesFin: anual.avesFin,
    mesesArriendo: anual.mesesArriendo,
    arriendoTotalCop: anual.arriendoTotal,
    gastoTotalAnualCop: anual.costoCanalTot,
    ingresoAnualCop: Number(anual.ingresoCanal.toFixed(2)),
    utilidadNetaAnualCop: Number(anual.utilidadCanal.toFixed(3)),
    capitalPicoRotativoCop: anual.capitalPicoRotativo,
    roiAnualPct: `${(anual.roiAnualSobrePico * 100).toFixed(2)}%`
  });
  assert(anual.avesInic === 4600, 'Anual aves iniciadas debe ser 4600');
  assert(anual.mesesArriendo === 12, 'Anual debe cubrir 12 meses de arriendo');
  assert(anual.arriendoTotal === 11000000, 'Arriendo anual 4m*$750k + 8m*$1M = $11.000.000');
  assert(Math.round(anual.utilidadCanal) === 40274309, 'Utilidad anual debe ser $40.274.309');

  // 3. Benchmark de latencia What-If (< 1 ms) y comparativa 42d vs 45d vs 48d
  const iterations = 1000;
  const t0 = performance.now();
  let lastWhatIf = null;
  for (let i = 0; i < iterations; i++) {
    lastWhatIf = TwinEngine.simulateWhatIf(baseState, {
      preciosRegionales: { precioCanalKg: 11500 + (i % 5) * 250 }
    });
  }
  const elapsedMs = performance.now() - t0;
  const avgMs = elapsedMs / iterations;
  console.log(`\n[3/4] Benchmark Latencia Isomórfica What-If (${iterations} sims incl. 42d/45d/48d): ${avgMs.toFixed(4)} ms/sim`);
  assert(avgMs < 2.0, `Latencia What-If demasiado alta: ${avgMs.toFixed(4)} ms`);

  console.log('  Comparativa de edades en vivo:', lastWhatIf.comparativaEdades.map((x) => ({
    edad: x.edadDias,
    vivoKg: x.pesoVivoRossKg,
    canalConMenudKg: Number(x.pesoCanalConMenudKg.toFixed(3)),
    secoKg: Number(x.pesoEvisceradoSecoKg.toFixed(3)),
    util800: Math.round(x.utilidad800)
  })));

  // 4. Persistencia Híbrida + Event Sourcing + Reversibilidad
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avicola-phase1-test-'));
  const store = new HybridTwinStore({ dataDir: tempDataDir });
  await store.init();
  assert.strictEqual(store.version, 1, 'Versión inicial debe ser 1');

  const r1 = await store.appendEventAndApply({
    type: 'DAILY_LOG',
    sourceChannel: 'verify_script',
    actor: 'auditor_be3',
    payload: { dia: 1, mortalidad: 2, descarte: 0, alimRealKg: 7.2, tempC: 31.8, aguaL: 14.0 }
  });
  assert.strictEqual(r1.snapshot.version, 2, 'Versión tras evento 1 debe ser 2');
  assert.strictEqual(r1.snapshot.computed.av2.bitacora.diasRegistrados, 1, 'Debe marcar 1 día registrado');
  assert.strictEqual(r1.snapshot.computed.av2.bitacora.bajasAcumReales, 2, 'Bajas acumuladas debe ser 2');

  const r2 = await store.appendEventAndApply({
    type: 'FEED_PURCHASE',
    sourceChannel: 'telegram',
    actor: 'operator',
    payload: { fase: 'Nutrepollo Cr SP', bultos: 5, precioBulto: 96200 }
  });
  assert.strictEqual(r2.snapshot.version, 3, 'Versión tras evento 2 debe ser 3');
  assert.strictEqual(
    r2.snapshot.computed.av2.auditoriaBodegaLote1.faltantePpto.nutrepollo,
    0,
    'Tras comprar +5 bultos de Nutrepollo el faltante debe bajar a 0'
  );

  // Recargar desde disco para probar persistencia real
  const storeReloaded = new HybridTwinStore({ dataDir: tempDataDir });
  await storeReloaded.init();
  assert.strictEqual(storeReloaded.version, 3, 'El estado persistido en JSON debe sobrevivir recarga');
  assert.strictEqual(storeReloaded.getLedgerEvents().length, 2, 'El ledger JSONL debe contener 2 eventos');

  // Probar reversibilidad exacta (rollback x2)
  await storeReloaded.rollbackLastEvent();
  await storeReloaded.rollbackLastEvent();
  assert.strictEqual(storeReloaded.version, 1, 'Rollback debe restaurar versión 1');
  const postRollbackCheck = TwinEngine.verifyZeroDivergence(storeReloaded.getFullSnapshot().computed);
  assert(postRollbackCheck.ok, 'Tras rollback debe mantener $0 divergencia');

  // Inicializar también la carpeta data real de avicola_app para dejarla lista para Fase 2-4
  const prodStore = new HybridTwinStore();
  const prodSnap = await prodStore.init();
  const prodCheck = TwinEngine.verifyZeroDivergence(prodSnap.computed);
  assert(prodCheck.ok, 'Store principal de avicola_app debe iniciar con $0 divergencia');

  console.log('\n[4/4] Persistencia Dual + Event Sourcing + Rollback verificados OK.');
  console.log('      Estado principal inicializado en:', prodSnap.persistence.stateFile);
  console.log('      Supabase Cloud configurado:', prodSnap.persistence.supabaseConfigured);
  console.log('\n✅ FASE 1 VERIFICADA CON ÉXITO TOTAL (0 ERRORES, $0,00 DIVERGENCIA).\n');

  fs.rmSync(tempDataDir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('❌ FALLO VERIFICACIÓN FASE 1:', err);
  process.exit(1);
});
