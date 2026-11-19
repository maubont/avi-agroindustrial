'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const formulador = require('./formulador');
const motor = require('./motor_lp');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', f), 'utf8'));

test('Importar formulador.js no dispara efectos secundarios ni process.exit', () => {
  assert.equal(typeof formulador.optimizarDieta, 'function');
  assert.equal(typeof formulador.calcularPrecioSombra, 'function');
});

test('Paridad histórica exacta contra resultados previos (base y fitasa)', () => {
  const ING = load('ingredientes.json');
  const REQ = load('requerimientos.json');
  const ESC = load('escenarios.json');
  const NEG = load('negocio.json');
  const datos = { nutrientes: ING.nutrientes, ingredientes: ING.ingredientes, requerimientos: REQ, negocio: NEG };

  const f1Base = motor.optimizarDieta(REQ.dietas[0], ESC.escenarios[0], datos, { ignorarMaxEtapa: true, permitirLegacy100: true, permitirFijoSobreMax: true, redondeoLegacy2Dec: true });
  const f2Base = motor.optimizarDieta(REQ.dietas[1], ESC.escenarios[0], datos, { ignorarMaxEtapa: true, permitirLegacy100: true, permitirFijoSobreMax: true, redondeoLegacy2Dec: true });
  const f1Fit = motor.optimizarDieta(REQ.dietas[0], ESC.escenarios[1], datos, { ignorarMaxEtapa: true, permitirLegacy100: true, permitirFijoSobreMax: true, redondeoLegacy2Dec: true });
  const f2Fit = motor.optimizarDieta(REQ.dietas[1], ESC.escenarios[1], datos, { ignorarMaxEtapa: true, permitirLegacy100: true, permitirFijoSobreMax: true, redondeoLegacy2Dec: true });

  assert.equal(Math.round(f1Base.costo_kg), 1925);
  assert.equal(Math.round(f2Base.costo_kg), 1882);
  assert.equal(Math.round(f1Fit.costo_kg), 1896);
  assert.equal(Math.round(f2Fit.costo_kg), 1853);
});

test('Redondeo compensado garantiza suma exacta de 1000.000 kg/t y respeta topes al permitir', () => {
  const ING = load('ingredientes_auditado.json');
  const REQ = load('requerimientos_auditado.json');
  const ESC = load('escenarios_auditado.json');
  const NEG = load('negocio_auditado.json');
  const datos = { nutrientes: ING.nutrientes, ingredientes: ING.ingredientes, requerimientos: REQ, negocio: NEG };

  const resF1 = motor.optimizarDieta(REQ.dietas[0], ESC.escenarios[2], datos, { restriccionesFisiologicas: true });
  const resF2 = motor.optimizarDieta(REQ.dietas[1], ESC.escenarios[2], datos, { restriccionesFisiologicas: true });
  assert.equal(resF1.factible, true);
  assert.equal(resF2.factible, true);

  const sumF1 = Object.values(resF1.kg).reduce((a, b) => a + b, 0);
  const sumF2 = Object.values(resF2.kg).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumF1 - 1000) < 1e-6);
  assert.ok(Math.abs(sumF2 - 1000) < 1e-6);
  assert.ok((resF1.kg.fpkc || 0) <= 50.001, 'FPKC F1 no puede exceder 5%');
  assert.ok((resF2.kg.fpkc || 0) <= 100.001, 'FPKC F2 no puede exceder 10%');
  assert.ok(resF1.nutrientes.Cl <= 0.2305, `Cl F1=${resF1.nutrientes.Cl} viola max 0.23%`);
  assert.ok(resF1.nutrientes.DEB >= 219.9 && resF1.nutrientes.DEB <= 260.1);
});

test('Manejo seguro de infactibilidad sin lanzar excepción ni process.exit y presupuesto de memoria', () => {
  const ING = load('ingredientes_auditado.json');
  const REQ = load('requerimientos_auditado.json');
  const NEG = load('negocio_auditado.json');
  const datos = { nutrientes: ING.nutrientes, ingredientes: ING.ingredientes, requerimientos: REQ, negocio: NEG };

  const inf = motor.optimizarDieta(REQ.dietas[0], { fijos: { maiz: 990 } }, datos, { restriccionesFisiologicas: true });
  assert.equal(inf.factible, false);

  const rssMB = process.memoryUsage().rss / (1024 * 1024);
  assert.ok(rssMB < 220, `RSS demasiado alto: ${rssMB.toFixed(1)} MB`);
});

test('Política óptima RL (L09) cumple factibilidad, metas de Ciclo 1 y límites fisiológicos', () => {
  const sim = require('./simulador_rl');
  const l09 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'simulacion_rl', 'ciclo_01', 'fase3_lideres', 'L09.json'), 'utf8'));
  const res = sim.evaluarPropuestaRL(l09);
  assert.equal(res.factible, true);
  assert.ok(res.mp_ponderado_cop_kg <= 1785, `MP ${res.mp_ponderado_cop_kg} excede meta 1785`);
  assert.ok(res.costo_kg_vivo_cop <= 3950, `Vivo ${res.costo_kg_vivo_cop} excede meta 3950`);
  assert.ok(res.punto_equilibrio_t_mes <= 55, `PE ${res.punto_equilibrio_t_mes} excede meta 55`);
  assert.ok(res.sombra_fpkc_f2_cop_kg >= 850, `Sombra ${res.sombra_fpkc_f2_cop_kg} debajo de meta 850`);
});
