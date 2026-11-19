// Núcleo puro de optimización lineal, dualidad, Chance-Constrained, Monte Carlo y evaluación de cadena
// Sin efectos secundarios, sin exceljs y sin process.exit(1), apto para worker_threads y ciclos RL.
'use strict';
const solver = require('javascript-lp-solver');

const escala = (id) => (id === 'EM' || id === 'Col' ? 1000 : 1);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Redondeo compensado a N decimales garantizando que sum(kg) === 1000.000
 * Ajusta el residuo microscópico en el ingrediente mayoritario (o maíz) para no romper micro-dosis.
 */
function redondearCompensado(kgRaw, decimales = 3) {
  const factor = Math.pow(10, decimales);
  const out = {};
  let sum = 0;
  let mayorId = null;
  let mayorVal = -1;
  for (const [id, val] of Object.entries(kgRaw)) {
    const r = Math.round((val || 0) * factor) / factor;
    out[id] = r;
    sum += r;
    if (r > mayorVal && id !== 'antiox' && id !== 'fitasa' && id !== 'premix') {
      mayorVal = r;
      mayorId = id;
    }
  }
  const diff = Math.round((1000 - sum) * factor) / factor;
  if (mayorId && Math.abs(diff) > 0 && out[mayorId] + diff >= 0) {
    out[mayorId] = Math.round((out[mayorId] + diff) * factor) / factor;
  }
  return out;
}

function calcularNutrientes(kg, ingredientes, nutrientesDef) {
  const mapIng = Object.fromEntries(ingredientes.map((i) => [i.id, i]));
  const out = {};
  for (const n of nutrientesDef) {
    out[n.id] = ingredientes.reduce((s, ing) => s + (kg[ing.id] || 0) * (ing[n.id] || 0), 0) / 1000;
  }
  out.costo_t = ingredientes.reduce((s, ing) => s + (kg[ing.id] || 0) * (ing.precio || 0), 0);
  out.Ca_Pd = out.Pd > 0 ? out.Ca / out.Pd : 0;
  out.DEB = (out.Na || 0) * 10000 / 23 + (out.K || 0) * 10000 / 39.1 - (out.Cl || 0) * 10000 / 35.45;
  out.aceite_pct = (kg.aceite || 0) / 10;
  out._map = mapIng ? undefined : undefined;
  return out;
}

/**
 * Resuelve un LP de dieta única sin mutar datos de entrada.
 */
function optimizarDieta(dieta, esc = {}, datos, opts = {}) {
  const {
    decimales = 3,
    restriccionesFisiologicas = false,
    tolerancia = 1e-9,
    overridesMin = null
  } = opts;

  const NUT = datos.nutrientes;
  const ingsBase = datos.ingredientes;
  const overridesPrecios = esc.precios || {};
  const overridesMatriz = esc.matriz_ing || {};
  const overridesLim = esc.limites || {};
  const fijos = esc.fijos || {};
  const permitir = esc.permitir || [];

  // Pre-chequeo de fijos
  let sumFijos = 0;
  for (const [id, kgFijo] of Object.entries(fijos)) {
    if (kgFijo < 0) return { factible: false, motivo: `Fijo negativo en ${id}` };
    sumFijos += kgFijo / 1000;
  }
  if (sumFijos > 1 + 1e-6) {
    return { factible: false, motivo: `Suma de ingredientes fijos (${(sumFijos * 1000).toFixed(2)} kg/t) > 1000` };
  }

  const model = {
    optimize: 'costo',
    opType: 'min',
    tolerance: tolerancia,
    constraints: { total: { equal: 1 } },
    variables: {}
  };

  for (const [n, v] of Object.entries(dieta.min || {})) {
    const valMin = overridesMin && overridesMin[n] !== undefined ? overridesMin[n] : v;
    model.constraints[n] = { ...(model.constraints[n] || {}), min: valMin / escala(n) };
  }
  for (const [n, v] of Object.entries(dieta.max || {})) {
    model.constraints[n] = { ...(model.constraints[n] || {}), max: v / escala(n) };
  }

  if (restriccionesFisiologicas) {
    const debMin = dieta.deb_min ?? 220;
    const debMax = dieta.deb_max ?? 260;
    const caPdMin = dieta.ca_pd_min ?? 1.75;
    const caPdMax = dieta.ca_pd_max ?? 2.10;
    model.constraints.DEB_band = { min: debMin, max: debMax };
    model.constraints.CaPd_min = { min: 0 };
    model.constraints.CaPd_max = { max: 0 };
    // Referencia explícita
    void caPdMin; void caPdMax;
  }

  const ingsEval = ingsBase.map((ing) => {
    const m = overridesMatriz[ing.id] ? { ...ing, ...overridesMatriz[ing.id] } : { ...ing };
    if (overridesPrecios[ing.id] !== undefined) m.precio = overridesPrecios[ing.id];
    return m;
  });

  for (const ing of ingsEval) {
    let min = ing.min || 0;
    // Soporta topes por etapa (max_F1 / max_F2) si están definidos y no desactivados por opts
    const maxDieta = opts.ignorarMaxEtapa ? ing.max : (ing[`max_${dieta.id}`] !== undefined ? ing[`max_${dieta.id}`] : ing.max);
    let max = maxDieta !== undefined ? maxDieta : 1;

    if (permitir.includes(ing.id)) {
      // Corrección del bug clásico: si existe max_permitido o max_F1/F2, respétalo; solo usa 1 si el usuario no definió tope
      const maxPerm = ing[`max_permitido_${dieta.id}`] ?? ing.max_permitido ?? (maxDieta > 0 ? maxDieta : 1);
      max = opts.permitirLegacy100 ? 1 : maxPerm;
    }

    if (overridesLim[ing.id]) {
      if (overridesLim[ing.id].min !== undefined) min = overridesLim[ing.id].min / 1000;
      if (overridesLim[ing.id].max !== undefined) max = overridesLim[ing.id].max / 1000;
    }
    if (fijos[ing.id] !== undefined) {
      const fv = fijos[ing.id] / 1000;
      if (!opts.permitirFijoSobreMax && max > 0 && fv > max + 1e-6) {
        return { factible: false, motivo: `Fijo ${ing.id}=${fijos[ing.id]} kg/t excede max=${(max * 1000).toFixed(1)}` };
      }
      min = max = fv;
    }

    if (min > max + 1e-9) {
      return { factible: false, motivo: `Conflicto min > max en ${ing.id}` };
    }
    if (min === 0 && max === 0) continue; // Evita crear restricciones muertas en Simplex

    const v = { costo: ing.precio, total: 1 };
    for (const n of NUT) {
      if (ing[n.id]) v[n.id] = ing[n.id] / escala(n.id);
    }

    if (restriccionesFisiologicas) {
      const caPdMin = dieta.ca_pd_min ?? 1.75;
      const caPdMax = dieta.ca_pd_max ?? 2.10;
      v.DEB_band = (ing.Na || 0) * 10000 / 23 + (ing.K || 0) * 10000 / 39.1 - (ing.Cl || 0) * 10000 / 35.45;
      v.CaPd_min = (ing.Ca || 0) - caPdMin * (ing.Pd || 0);
      v.CaPd_max = (ing.Ca || 0) - caPdMax * (ing.Pd || 0);
    }

    if (min > 0 || max < 1) {
      v['b_' + ing.id] = 1;
      model.constraints['b_' + ing.id] = (min === max) ? { equal: min } : { min, max };
    }
    model.variables[ing.id] = v;
  }

  const r = solver.Solve(model);
  if (!r.feasible || !r.bounded) {
    return { factible: false, motivo: !r.feasible ? 'LP infactible con las restricciones actuales' : 'LP no acotado' };
  }

  const kgRaw = {};
  for (const ing of ingsEval) kgRaw[ing.id] = (r[ing.id] || 0) * 1000;
  const kg = opts.redondeoLegacy2Dec
    ? Object.fromEntries(ingsEval.map((i) => [i.id, Math.round((r[i.id] || 0) * 1000 * 100) / 100]))
    : redondearCompensado(kgRaw, decimales);

  const nutExact = calcularNutrientes(kgRaw, ingsEval, NUT);
  const nutRound = calcularNutrientes(kg, ingsEval, NUT);

  const incumplimientos = [];
  for (const [n, mn] of Object.entries(dieta.min || {})) {
    if (nutRound[n] < mn - 1e-4) incumplimientos.push({ nutriente: n, tipo: 'min', valor: nutRound[n], meta: mn });
  }
  for (const [n, mx] of Object.entries(dieta.max || {})) {
    if (nutRound[n] > mx + 1e-4) incumplimientos.push({ nutriente: n, tipo: 'max', valor: nutRound[n], meta: mx });
  }

  return {
    factible: true,
    costo_t_exacto: r.result * 1000,
    costo_t: nutRound.costo_t,
    costo_kg: nutRound.costo_t / 1000,
    kg_raw: kgRaw,
    kg,
    nutrientes_exact: nutExact,
    nutrientes: nutRound,
    incumplimientos
  };
}

/**
 * Búsqueda binaria paramétrica exacta para hallar el Precio Sombra (umbral de entrada en COP/kg)
 * de cualquier ingrediente, garantizando precisión < tolCop sin depender de degeneración dual.
 */
function calcularPrecioSombra(ingId, dieta, esc = {}, datos, opts = {}) {
  const tolCop = opts.tolCop ?? 1;
  const maxInclusionKg = opts.maxInclusionKg ?? 100;
  let lo = 0;
  let hi = opts.maxPrecio ?? 15000;

  const escTest = clone(esc);
  escTest.limites = { ...(escTest.limites || {}), [ingId]: { min: 0, max: maxInclusionKg } };
  escTest.precios = { ...(escTest.precios || {}) };

  // Verifica si entra a precio 0
  escTest.precios[ingId] = 0;
  const r0 = optimizarDieta(dieta, escTest, datos, opts);
  if (!r0.factible || (r0.kg_raw[ingId] || 0) < 0.05) {
    return { entra: false, precio_umbral_cop_kg: 0, inclusion_max_kg_t: 0 };
  }

  for (let it = 0; it < 20 && (hi - lo) > tolCop; it++) {
    const mid = (lo + hi) / 2;
    escTest.precios[ingId] = mid;
    const rm = optimizarDieta(dieta, escTest, datos, opts);
    if (rm.factible && (rm.kg_raw[ingId] || 0) > 0.05) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  escTest.precios[ingId] = Math.floor(lo);
  const rEnter = optimizarDieta(dieta, escTest, datos, opts);
  return {
    entra: true,
    precio_umbral_cop_kg: Math.round(lo * 10) / 10,
    inclusion_a_umbral_kg_t: rEnter.factible ? Math.round((rEnter.kg_raw[ingId] || 0) * 100) / 100 : 0,
    inclusion_a_costo_cero_kg_t: Math.round((r0.kg_raw[ingId] || 0) * 100) / 100
  };
}

/**
 * Formulación Chance-Constrained en 2 pasadas: agrega margen z * sigma_j a nutrientes críticos
 * (excepto aquellos donde un cuello estructural como Ile vs K_max volvería infactible el LP).
 */
function optimizarChanceConstrained(dieta, esc = {}, datos, z = 0.8, opts = {}) {
  const base = optimizarDieta(dieta, esc, datos, opts);
  if (!base.factible) return base;

  const cvDefault = {
    EM: 0.02, PC: 0.04, EE: 0.04, FC: 0.06, Ca: 0.03, Pd: 0.05,
    Na: 0.03, Cl: 0.03, K: 0.04, Lin: 0.04,
    Lys: 0.04, Met: 0.04, MC: 0.04, Thr: 0.04, Trp: 0.04, Val: 0.04, Ile: 0.04, Arg: 0.04, Col: 0.04
  };
  const cvIng = {
    maiz: { EM: 0.025, PC: 0.07, Lys: 0.07, MC: 0.07, Thr: 0.07, Val: 0.07, Pd: 0.10, hum: 0.009 },
    soya: { EM: 0.025, PC: 0.035, Lys: 0.035, MC: 0.035, Thr: 0.035, Val: 0.035, Pd: 0.06, hum: 0.008 },
    aceite: { EM: 0.02, hum: 0.003 },
    fitasa: { Ca: 0.12, Pd: 0.12 },
    fpkc: { EM: 0.08, PC: 0.08, Lys: 0.15, MC: 0.15, Thr: 0.15, Val: 0.15, Pd: 0.15, hum: 0.01 }
  };

  const mapIng = Object.fromEntries(datos.ingredientes.map((i) => [i.id, i]));
  const overridesMin = { ...(dieta.min || {}) };
  const nutrientesBlindados = ['EM', 'Lys', 'MC', 'Thr', 'Val', 'Pd', 'Col'];

  for (const n of nutrientesBlindados) {
    if (overridesMin[n] === undefined) continue;
    let varSum = 0;
    for (const [id, kgVal] of Object.entries(base.kg_raw)) {
      if (kgVal <= 0 || !mapIng[id]) continue;
      const frac = kgVal / 1000;
      const mu = mapIng[id][n] || 0;
      if (mu <= 0) continue;
      const cIng = cvIng[id] || {};
      const cvN = cIng[n] !== undefined ? cIng[n] : (cvDefault[n] || 0.03);
      const cvHum = cIng.hum || 0.005;
      const sig = mu * Math.sqrt(cvN * cvN + cvHum * cvHum);
      varSum += (frac * sig) * (frac * sig);
    }
    overridesMin[n] = overridesMin[n] + z * Math.sqrt(varSum);
  }

  // Intenta blindar; si resulta infactible (e.g. cerca de K max), reduce z progresivamente
  for (const zTry of [z, z * 0.6, z * 0.3, 0]) {
    if (zTry < z) {
      for (const n of nutrientesBlindados) {
        if ((dieta.min || {})[n] !== undefined) {
          const delta = overridesMin[n] - dieta.min[n];
          overridesMin[n] = dieta.min[n] + (z > 0 ? delta * (zTry / z) : 0);
        }
      }
    }
    const rob = optimizarDieta(dieta, esc, datos, { ...opts, overridesMin });
    if (rob.factible) {
      return { ...rob, z_aplicado: zTry, costo_extra_robustez_kg: rob.costo_kg - base.costo_kg };
    }
  }
  return base;
}

// PRNG determinista rápido (Mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNorm(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Simulación Monte Carlo ligera (<50 MB RAM): evalúa cumplimiento nutricional (>=98% min Ross)
 * y distribución de costo ante volatilidad de TRM, aceite y matrices reales.
 */
function simularMonteCarlo(kg, dieta, datos, cfg = {}) {
  const nRuns = cfg.n ?? 1000;
  const rng = mulberry32(cfg.seed ?? 42);
  const umbralCumpl = cfg.umbral ?? 0.98;
  const ings = datos.ingredientes;
  const criticos = ['EM', 'Lys', 'MC', 'Thr', 'Val', 'Ile', 'Pd', 'Ca', 'Col'].filter((n) => dieta.min && dieta.min[n]);

  const costos = new Float64Array(nRuns);
  const failCounts = Object.fromEntries(criticos.map((c) => [c, 0]));
  let jointPass = 0;

  for (let r = 0; r < nRuns; r++) {
    const fTRM = 1 + 0.08 * randNorm(rng);
    const fPalma = 1 + 0.12 * randNorm(rng);
    const fMaizHum = 1 + 0.009 * randNorm(rng);
    const fMaizAA = 1 + 0.07 * randNorm(rng);
    const fMaizEM = 1 + 0.025 * randNorm(rng);
    const fSoyaHum = 1 + 0.008 * randNorm(rng);
    const fSoyaAA = 1 + 0.035 * randNorm(rng);
    const fSoyaEM = 1 + 0.025 * randNorm(rng);
    const fFpkc = 1 + 0.12 * randNorm(rng);
    const fFitasa = 1 + 0.12 * randNorm(rng);

    let costoT = 0;
    const sumNut = {};
    for (const c of criticos) sumNut[c] = 0;

    for (const ing of ings) {
      const k = kg[ing.id] || 0;
      if (k <= 0) continue;

      let pMult = 1;
      const esImportadoTRM = ['maiz', 'soya', 'soya_ext', 'soya_ff', 'lys', 'lys_sulf', 'met', 'hmtba_ca', 'thr', 'val', 'ile', 'arg', 'mcp', 'dcp', 'premix', 'nucleo_premix', 'colina', 'fitasa', 'proteasa', 'lisolecitina', 'gaa', 'secuest', 'antiox', 'ddgs', 'canola'].includes(ing.id) || ing.id.startsWith('enz_') || ing.id.startsWith('betaina');
      if (esImportadoTRM) pMult = fTRM;
      else if (ing.id === 'aceite') pMult = fPalma;
      else pMult = 1 + 0.06 * randNorm(rng);
      costoT += k * (ing.precio || 0) * Math.max(0.5, pMult);

      for (const n of criticos) {
        let m = ing[n] || 0;
        if (m === 0) continue;
        if (ing.id === 'maiz') {
          m *= fMaizHum * (n === 'EM' ? fMaizEM : fMaizAA);
        } else if (ing.id === 'soya' || ing.id === 'soya_ext' || ing.id === 'soya_ff') {
          m *= fSoyaHum * (n === 'EM' ? fSoyaEM : fSoyaAA);
        } else if (ing.id === 'fitasa' || ing.id === 'nucleo_premix' || ing.id === 'proteasa' || ing.id === 'lisolecitina' || ing.id === 'gaa' || ing.id.startsWith('enz_')) {
          m *= fFitasa;
        } else if (ing.id.startsWith('fpkc') || ing.id.startsWith('pulidura') || ing.id.startsWith('h_visceras') || ing.id.startsWith('hch')) {
          m *= fFpkc;
        } else if (ing.id === 'aceite') {
          m *= (1 + 0.02 * randNorm(rng));
        } else {
          m *= (1 + 0.04 * randNorm(rng));
        }
        sumNut[n] += k * m / 1000;
      }
    }

    costos[r] = costoT / 1000;
    let allOk = true;
    for (const c of criticos) {
      if (sumNut[c] < dieta.min[c] * umbralCumpl) {
        failCounts[c]++;
        allOk = false;
      }
    }
    if (allOk) jointPass++;
  }

  costos.sort();
  let sumC = 0;
  for (let i = 0; i < nRuns; i++) sumC += costos[i];
  const media = sumC / nRuns;
  const p50 = costos[Math.floor(nRuns * 0.50)];
  const p90 = costos[Math.floor(nRuns * 0.90)];
  let cvarSum = 0;
  const idx90 = Math.floor(nRuns * 0.90);
  for (let i = idx90; i < nRuns; i++) cvarSum += costos[i];
  const cvar90 = cvarSum / (nRuns - idx90);

  const cumplimientoPorNutriente = {};
  for (const c of criticos) cumplimientoPorNutriente[c] = Math.round((1 - failCounts[c] / nRuns) * 1000) / 10;

  return {
    n: nRuns,
    prob_cumplimiento_conjunto_pct: Math.round((jointPass / nRuns) * 1000) / 10,
    cumplimiento_por_nutriente_pct: cumplimientoPorNutriente,
    costo_media_kg: Math.round(media * 10) / 10,
    costo_p50_kg: Math.round(p50 * 10) / 10,
    costo_p90_kg: Math.round(p90 * 10) / 10,
    cvar90_kg: Math.round(cvar90 * 10) / 10,
    costo_robusto_J_kg: Math.round((0.75 * media + 0.25 * cvar90) * 10) / 10
  };
}

/**
 * Evalúa toda la cadena (F1 + F2 ponderado, costo por pollo y por kg vivo ganado d21-42, y negocio).
 */
function evaluarCadenaCompleta(datos, esc = {}, opts = {}) {
  const dF1 = datos.requerimientos.dietas.find((d) => d.id === 'F1');
  const dF2 = datos.requerimientos.dietas.find((d) => d.id === 'F2');

  const rF1 = opts.chanceZ ? optimizarChanceConstrained(dF1, esc, datos, opts.chanceZ, opts) : optimizarDieta(dF1, esc, datos, opts);
  const rF2 = opts.chanceZ ? optimizarChanceConstrained(dF2, esc, datos, opts.chanceZ, opts) : optimizarDieta(dF2, esc, datos, opts);

  if (!rF1.factible || !rF2.factible) {
    return {
      factible: false,
      motivo: !rF1.factible ? `F1: ${rF1.motivo}` : `F2: ${rF2.motivo}`,
      F1: rF1,
      F2: rF2
    };
  }

  const neg = datos.negocio;
  const c1 = neg.pollo.consumo_F1_kg_ave;
  const c2 = neg.pollo.consumo_F2_kg_ave;
  const cTot = c1 + c2;
  const penPct = neg.mercado.penalizacion_conversion_harina_pct;
  const cv = neg.costos_variables_cop_kg;
  const mermaFactor = 1 + (cv.merma_pct_materias_primas || 0) / 100;

  const mpPondKg = (c1 * rF1.costo_kg + c2 * rF2.costo_kg) / cTot;
  const costoFabAutoKg = mpPondKg * mermaFactor + cv.empaque + cv.energia_molienda_mezcla;
  const gananciaVivoKg = neg.pollo.ganancia_peso_d21_42_kg || 1.76; // Ross mixto ~0.92 kg a 2.68 kg = 1.76 kg ganados

  const costoAlimAveAuto = (c1 * (rF1.costo_kg * mermaFactor + cv.empaque + cv.energia_molienda_mezcla) +
    c2 * (rF2.costo_kg * mermaFactor + cv.empaque + cv.energia_molienda_mezcla)) * (1 + penPct / 100);
  const costoKgVivoAuto = costoAlimAveAuto / gananciaVivoKg;

  const kComercialKg = neg.mercado.precio_comercial_bulto40 / (neg.mercado.kg_bulto || 40);
  const costoAlimAveComercial = cTot * kComercialKg;
  const costoKgVivoComercial = costoAlimAveComercial / gananciaVivoKg;

  const ivaAlim = 1 + (neg.impuestos?.iva_alimento_pct ?? 0) / 100;
  const pvSinIva = neg.mercado.precio_venta_bulto40 / (neg.mercado.kg_bulto || 40);
  const pvConIva = pvSinIva * ivaAlim;
  const costoVarTercero = mpPondKg * mermaFactor + cv.empaque + cv.energia_molienda_mezcla + cv.flete_distribucion + pvSinIva * (cv.comision_ventas_pct / 100);
  const margenContribucionKg = pvSinIva - costoVarTercero;

  const cfCash = Object.values(neg.costos_fijos_mensuales).reduce((a, b) => a + b, 0);
  const capexConIva = (neg.inversion.equipos_fase1 || 0) * (1 + (neg.impuestos?.iva_equipos_pct ?? 0) / 100) +
    (neg.inversion.adecuaciones_locativas || 0) + (neg.inversion.registro_y_legal || 0);
  const depMes = ((neg.inversion.equipos_fase1 || 0) + (neg.inversion.adecuaciones_locativas || 0)) / (neg.inversion.vida_util_meses || 120);
  const cfTotalMes = cfCash + depMes;
  const peTonMes = margenContribucionKg > 0 ? cfTotalMes / (margenContribucionKg * 1000) : Infinity;

  let mcF1 = null;
  let mcF2 = null;
  if (opts.monteCarloRuns > 0) {
    mcF1 = simularMonteCarlo(rF1.kg, dF1, datos, { n: opts.monteCarloRuns, seed: 101 });
    mcF2 = simularMonteCarlo(rF2.kg, dF2, datos, { n: opts.monteCarloRuns, seed: 202 });
  }

  return {
    factible: true,
    F1: rF1,
    F2: rF2,
    mp_ponderado_cop_kg: Math.round(mpPondKg * 10) / 10,
    costo_fab_autoconsumo_cop_kg: Math.round(costoFabAutoKg * 10) / 10,
    costo_alim_ave_auto_cop: Math.round(costoAlimAveAuto),
    costo_kg_vivo_auto_cop: Math.round(costoKgVivoAuto),
    costo_kg_vivo_comercial_cop: Math.round(costoKgVivoComercial),
    ahorro_pct_vs_comercial: Math.round((1 - costoKgVivoAuto / costoKgVivoComercial) * 1000) / 10,
    precio_venta_con_iva_cop_kg: Math.round(pvConIva),
    margen_contribucion_cop_kg: Math.round(margenContribucionKg * 10) / 10,
    punto_equilibrio_t_mes: Number.isFinite(peTonMes) ? Math.round(peTonMes * 10) / 10 : null,
    capex_caja_inicial_cop: Math.round(capexConIva),
    mc_F1: mcF1,
    mc_F2: mcF2
  };
}

module.exports = {
  escala,
  clone,
  redondearCompensado,
  calcularNutrientes,
  optimizarDieta,
  calcularPrecioSombra,
  optimizarChanceConstrained,
  simularMonteCarlo,
  evaluarCadenaCompleta
};
