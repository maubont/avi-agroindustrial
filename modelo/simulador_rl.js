// Evaluador RL cuantitativo (Reward Engine) para Ciclo de Aprendizaje por Refuerzo
// Lee propuestas JSON de simulacion_rl/ciclo_XX/..., valida reglas físicas y nutricionales duras,
// corre LP (F1 y F2) + Monte Carlo (N=500) + Precio Sombra FPKC + Punto de Equilibrio, y genera ranking.
'use strict';
const fs = require('fs');
const path = require('path');
const motor = require('./motor_lp');

const loadJson = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'datos', f), 'utf8'));

function cargarBaseAuditada() {
  const ING = loadJson('ingredientes_auditado.json');
  const REQ = loadJson('requerimientos_auditado.json');
  const ESC = loadJson('escenarios_auditado.json');
  const NEG = loadJson('negocio_auditado.json');
  return {
    datos: { nutrientes: ING.nutrientes, ingredientes: ING.ingredientes, requerimientos: REQ, negocio: NEG },
    escenarioBase: ESC.escenarios.find((e) => e.id === 'audit_fitasa')
  };
}

/**
 * Evalúa una PropuestaRL individual contra la línea base auditada.
 * Soporta:
 * - nuevos_ingredientes: [{ id, nombre, precio, min, max, max_F1, max_F2, ...nutrientes }]
 * - cambios_ingredientes: [{ id, precio?, min?, max?, max_F1?, max_F2?, nutrientes?: {...} }]
 * - cambios_fijos_kg_t: { id: kg_t }
 * - cambios_negocio: { empaque?, energia_molienda_mezcla?, flete_distribucion?, penalizacion_conversion_harina_pct?, precio_venta_bulto40?, ... }
 * - requerimientos_extra: { F1?: { min?: {...}, max?: {...}, deb_min?, deb_max? }, F2?: ... }
 * - capex_adicional_cop: number
 */
function prepararPropuestaContexto(propuesta, baseCtx = null) {
  const ctx = baseCtx || cargarBaseAuditada();
  const datos = motor.clone(ctx.datos);
  const esc = motor.clone(ctx.escenarioBase);

  // Blindaje anti-trampa: no se permite bajar mínimos esenciales de Ross 2022 (EM, Lys, MC, Met, Thr, Val, Ile, Arg, Trp, Ca, Pd, Na, Col)
  const protegidos = ['EM', 'Lys', 'MC', 'Met', 'Thr', 'Val', 'Ile', 'Arg', 'Trp', 'Ca', 'Pd', 'Na', 'Col'];
  if (propuesta.requerimientos_extra) {
    for (const dId of ['F1', 'F2']) {
      const reqD = datos.requerimientos.dietas.find((d) => d.id === dId);
      const ex = propuesta.requerimientos_extra[dId];
      if (!ex || !reqD) continue;
      if (ex.min) {
        for (const [k, v] of Object.entries(ex.min)) {
          if (protegidos.includes(k) && v < reqD.min[k] - 1e-6) {
            return { ok: false, error: { id: propuesta.id_propuesta, factible: false, reward: -9999, motivo: `Trampa detectada: intenta bajar mínimo Ross de ${k} en ${dId}` } };
          }
          reqD.min[k] = v;
        }
      }
      if (ex.max) {
        for (const [k, v] of Object.entries(ex.max)) reqD.max[k] = v;
      }
      if (ex.deb_min !== undefined) reqD.deb_min = Math.max(200, ex.deb_min);
      if (ex.deb_max !== undefined) reqD.deb_max = Math.min(280, ex.deb_max);
    }
  }

  // Aplica nuevos ingredientes (con tope máximo obligatorio en harina <= 25% salvo cereales/soya)
  if (Array.isArray(propuesta.nuevos_ingredientes)) {
    for (const ni of propuesta.nuevos_ingredientes) {
      if (!ni.id || ni.precio === undefined) continue;
      if (datos.ingredientes.some((i) => i.id === ni.id)) continue;
      const obj = { ...ni };
      if (obj.max === undefined) obj.max = 0.15;
      if (obj.max_F1 === undefined) obj.max_F1 = Math.min(obj.max, 0.12);
      if (obj.max_F2 === undefined) obj.max_F2 = Math.min(obj.max, 0.18);
      datos.ingredientes.push(obj);
      esc.permitir = [...(esc.permitir || []), ni.id];
    }
  }

  // Modifica ingredientes existentes
  if (Array.isArray(propuesta.cambios_ingredientes)) {
    for (const ci of propuesta.cambios_ingredientes) {
      const target = datos.ingredientes.find((i) => i.id === ci.id);
      if (!target) continue;
      if (ci.precio !== undefined) target.precio = ci.precio;
      if (ci.min !== undefined) target.min = ci.min;
      if (ci.max !== undefined) target.max = ci.max;
      if (ci.max_F1 !== undefined) target.max_F1 = ci.max_F1;
      if (ci.max_F2 !== undefined) target.max_F2 = ci.max_F2;
      if (ci.max_permitido_F1 !== undefined) target.max_permitido_F1 = ci.max_permitido_F1;
      if (ci.max_permitido_F2 !== undefined) target.max_permitido_F2 = ci.max_permitido_F2;
      if (ci.permitir && !(esc.permitir || []).includes(ci.id)) esc.permitir.push(ci.id);
      if (ci.nutrientes) Object.assign(target, ci.nutrientes);
    }
  }

  if (propuesta.cambios_fijos_kg_t) {
    esc.fijos = { ...(esc.fijos || {}), ...propuesta.cambios_fijos_kg_t };
  }

  if (propuesta.cambios_negocio) {
    const cn = propuesta.cambios_negocio;
    for (const k of ['empaque', 'energia_molienda_mezcla', 'merma_pct_materias_primas', 'flete_distribucion', 'comision_ventas_pct']) {
      if (cn[k] !== undefined) datos.negocio.costos_variables_cop_kg[k] = cn[k];
    }
    for (const k of ['penalizacion_conversion_harina_pct', 'precio_venta_bulto40', 'precio_comercial_bulto40']) {
      if (cn[k] !== undefined) datos.negocio.mercado[k] = cn[k];
    }
    for (const k of ['consumo_F1_kg_ave', 'consumo_F2_kg_ave']) {
      if (cn[k] !== undefined) datos.negocio.pollo[k] = cn[k];
    }
    if (cn.costos_fijos_extra_mes) {
      datos.negocio.costos_fijos_mensuales.extra_propuesta = cn.costos_fijos_extra_mes;
    }
  }

  if (propuesta.capex_adicional_cop > 0) {
    datos.negocio.inversion.equipos_fase1 += propuesta.capex_adicional_cop;
  }

  return { ok: true, ctx, datos, esc };
}

function evaluarPropuestaRL(propuesta, baseCtx = null) {
  const prep = prepararPropuestaContexto(propuesta, baseCtx);
  if (!prep.ok) return prep.error;
  const { ctx, datos, esc } = prep;

  const baseEval = motor.evaluarCadenaCompleta(ctx.datos, ctx.escenarioBase, { restriccionesFisiologicas: true, monteCarloRuns: 500 });
  const propEval = motor.evaluarCadenaCompleta(datos, esc, { restriccionesFisiologicas: true, monteCarloRuns: 500 });

  if (!propEval.factible) {
    return {
      id: propuesta.id_propuesta,
      agente: propuesta.agente_id || '',
      titulo: propuesta.titulo || '',
      factible: false,
      reward: -5000,
      motivo: propEval.motivo
    };
  }

  const dF2 = datos.requerimientos.dietas.find((d) => d.id === 'F2');
  const sombraFpkcBase = motor.calcularPrecioSombra('fpkc', ctx.datos.requerimientos.dietas[1], ctx.escenarioBase, ctx.datos, { restriccionesFisiologicas: true, maxInclusionKg: 100 });
  const sombraFpkcProp = motor.calcularPrecioSombra('fpkc', dF2, esc, datos, { restriccionesFisiologicas: true, maxInclusionKg: 100 });

  const ahorroMpKg = Math.round((baseEval.mp_ponderado_cop_kg - propEval.mp_ponderado_cop_kg) * 10) / 10;
  const ahorroFabKg = Math.round((baseEval.costo_fab_autoconsumo_cop_kg - propEval.costo_fab_autoconsumo_cop_kg) * 10) / 10;
  const ahorroVivoKg = Math.round(baseEval.costo_kg_vivo_auto_cop - propEval.costo_kg_vivo_auto_cop);
  const mejoraSombraFpkc = Math.round((sombraFpkcProp.precio_umbral_cop_kg - sombraFpkcBase.precio_umbral_cop_kg) * 10) / 10;
  const deltaPE = (propEval.punto_equilibrio_t_mes !== null && baseEval.punto_equilibrio_t_mes !== null)
    ? Math.round((baseEval.punto_equilibrio_t_mes - propEval.punto_equilibrio_t_mes) * 10) / 10
    : -999;

  // Penalización si cae la robustez Monte Carlo por debajo de la base
  const penMC = Math.max(0, baseEval.mc_F2.prob_cumplimiento_conjunto_pct - propEval.mc_F2.prob_cumplimiento_conjunto_pct) * 2.0;
  // Recompensa compuesta (COP/kg MP + impacto en kg vivo + 0.15*mejora Sombra FPKC + mejora PE - penalización MC)
  const reward = Math.round((ahorroMpKg * 1.0 + ahorroFabKg * 0.8 + (ahorroVivoKg * 0.25) + Math.max(0, mejoraSombraFpkc) * 0.15 + deltaPE * 1.5 - penMC) * 10) / 10;

  return {
    id: propuesta.id_propuesta,
    agente: propuesta.agente_id || '',
    titulo: propuesta.titulo || '',
    factible: true,
    reward,
    mp_ponderado_cop_kg: propEval.mp_ponderado_cop_kg,
    ahorro_mp_cop_kg: ahorroMpKg,
    costo_fab_cop_kg: propEval.costo_fab_autoconsumo_cop_kg,
    costo_kg_vivo_cop: propEval.costo_kg_vivo_auto_cop,
    ahorro_vivo_cop_kg: ahorroVivoKg,
    punto_equilibrio_t_mes: propEval.punto_equilibrio_t_mes,
    sombra_fpkc_f2_cop_kg: sombraFpkcProp.precio_umbral_cop_kg,
    mejora_sombra_fpkc: mejoraSombraFpkc,
    mc_cumpl_f1_pct: propEval.mc_F1.prob_cumplimiento_conjunto_pct,
    mc_cumpl_f2_pct: propEval.mc_F2.prob_cumplimiento_conjunto_pct,
    inclusion_fpkc_kg_t: `${(propEval.F1.kg.fpkc || 0).toFixed(1)} / ${(propEval.F2.kg.fpkc || 0).toFixed(1)}`,
    supuesto_clave: propuesta.supuesto_clave_a_validar || ''
  };
}

function evaluarCarpeta(dirPath, outJsonPath) {
  const ctx = cargarBaseAuditada();
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  const resultados = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
      const lista = Array.isArray(raw) ? raw : [raw];
      for (const prop of lista) resultados.push(evaluarPropuestaRL(prop, ctx));
    } catch (err) {
      resultados.push({ id: f, factible: false, reward: -9999, motivo: `JSON inválido: ${err.message}` });
    }
  }
  resultados.sort((a, b) => b.reward - a.reward);
  if (outJsonPath) fs.writeFileSync(outJsonPath, JSON.stringify(resultados, null, 2));
  return resultados;
}

if (require.main === module) {
  const dir = process.argv[2];
  const out = process.argv[3];
  if (!dir) {
    console.log('Uso: node simulador_rl.js <carpeta_propuestas_json> [salida_ranking.json]');
    process.exit(0);
  }
  const res = evaluarCarpeta(dir, out);
  console.table(res.map((r) => ({
    id: r.id, ok: r.factible, R: r.reward, MP: r.mp_ponderado_cop_kg, dMP: r.ahorro_mp_cop_kg,
    Vivo: r.costo_kg_vivo_cop, PE: r.punto_equilibrio_t_mes, SombraFPKC: r.sombra_fpkc_f2_cop_kg,
    MC_F2: r.mc_cumpl_f2_pct, nota: r.motivo || ''
  })));
}

module.exports = { cargarBaseAuditada, prepararPropuestaContexto, evaluarPropuestaRL, evaluarCarpeta };
