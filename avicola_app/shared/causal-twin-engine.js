(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CausalTwinEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * ============================================================================
   * GEMELO DIGITAL CAUSAL ISOMÓRFICO (AV-1 & AV-2) — NÚCLEO DETERMINISTA
   * ============================================================================
   * Diseñado bajo conciliación forense [BE-2] (CFO Agroindustrial) y [BE-3]
   * (Ingeniero Zootecnista Senior) para ejecutar en <1 ms tanto en Node.js
   * como en el navegador (What-If a 60 FPS), garantizando $0,00 de divergencia
   * contra AV1_Plan_Financiero_Avicola.xlsx y AV2_Operacion_Granja_Lotes_1_a_3.xlsx.
   */

  // Curva oficial Ross 308 AP (2021) Mixto: Días 0..49 (g/ave y consumo g/ave)
  const ROSS_PESO_G = Object.freeze([
    44, // d0
    60, 77, 96, 118, 143, 170, 201,
    235, 272, 313, 357, 404, 455, 510,
    568, 629, 694, 762, 833, 907, 984,
    1064, 1147, 1232, 1319, 1408, 1500, 1593,
    1688, 1784, 1882, 1981, 2080, 2181, 2282,
    2384, 2486, 2588, 2690, 2792, 2894, 2995,
    3096, 3197, 3297, 3396, 3494, 3591, 3687
  ]);

  const ROSS_CONS_DIA_G = Object.freeze([
    // d1..d49
    11, 14, 18, 22, 27, 31, 35,
    40, 45, 49, 54, 59, 64, 69,
    75, 80, 85, 91, 96, 102, 108,
    113, 119, 124, 130, 136, 141, 147,
    152, 157, 163, 168, 173, 178, 183,
    187, 192, 197, 201, 205, 209, 213,
    217, 221, 224, 227, 231, 234, 237
  ]);

  const ROSS_CONS_ACUM_G = Object.freeze([
    // d1..d49
    11, 25, 43, 66, 92, 123, 158,
    198, 243, 292, 346, 406, 470, 539,
    614, 694, 780, 871, 967, 1069, 1177,
    1290, 1409, 1533, 1663, 1799, 1940, 2086,
    2238, 2395, 2558, 2726, 2899, 3076, 3259,
    3447, 3639, 3835, 4036, 4242, 4451, 4664,
    4881, 5102, 5326, 5553, 5784, 6018, 6254
  ]);

  // Plan semanal oficial "Consumo Pollo" (6 semanas = 4.445 g/ave)
  const CONSUMO_POLLO_6_SEM = Object.freeze([
    { semana: 1, dias: [1, 7], etapa: 'Preiniciación', material: 'Master Pollito', gramosAveSem: 175 },
    { semana: 2, dias: [8, 14], etapa: 'Iniciación', material: 'Nutrepollo Cr SP', gramosAveSem: 385 },
    { semana: 3, dias: [15, 21], etapa: 'Iniciación', material: 'Nutrepollo Cr SP', gramosAveSem: 644 },
    { semana: 4, dias: [22, 28], etapa: 'Engorde', material: 'Broiler I Pel SP', gramosAveSem: 931 },
    { semana: 5, dias: [29, 35], etapa: 'Engorde', material: 'Broiler I Pel SP', gramosAveSem: 1050 },
    { semana: 6, dias: [36, 42], etapa: 'Engorde', material: 'Broiler I Pel SP', gramosAveSem: 1260 }
  ]);

  // Rendimiento eviscerado seco exacto PDF Ross 308 AP 2021 (págs. 12-13, promedio M/H)
  const REND_SECO_EXACTO = Object.freeze([
    { pesoVivoKg: 2.8, edadRef: 'Día 40', pctSeco: 0.7452 },
    { pesoVivoKg: 3.0, edadRef: 'Día 42 (Meta 6 sem)', pctSeco: 0.7475 },
    { pesoVivoKg: 3.2, edadRef: 'Día 44', pctSeco: 0.7501 },
    { pesoVivoKg: 3.3, edadRef: 'Día 45 (Meta 2,72 kg c/m)', pctSeco: 0.7514 },
    { pesoVivoKg: 3.4, edadRef: 'Día 46', pctSeco: 0.7527 },
    { pesoVivoKg: 3.59, edadRef: 'Día 48 (2,71 kg seco)', pctSeco: 0.7551 }
  ]);

  const HITOS_BITACORA = Object.freeze({
    1: 'Recepción 600 comprados / 603 reales en galpón (13-nov) | Agua+electrolitos | 32-33°C',
    7: 'Fin Sem 1 Preiniciación Master Pollito (~175 g/ave) | Sug. Vacuna Newcastle + Bronquitis | Pesaje S1',
    8: 'Cambio a Iniciación Nutrepollo Cr SP (ICA 3054 AL) desde 20-nov | Sem 2-3',
    11: '23-nov: Ingreso programado Lote 2 (800 pollos @ $3.200 en sección aislada)',
    14: 'Fin Sem 2 | Sug. Vacuna Gumboro (IBD) | Pesaje Semana 2',
    21: 'Último día Iniciación Nutrepollo Cr SP (~984 g vivo Ross) | Pesaje S3 | Retiro gradual de criadora y ventilación natural El Zulia (~24-26°C piso)',
    22: '04-dic: Inicio Engorde Broiler I Dorado (Sem 4-6, pelet 3 mm)',
    23: '05-dic: Ingreso programado Lote 3 (800 pollos) para salir 15-ene-2027 (42 días)',
    28: 'Pesaje Semana 4 (~1,59 kg vivo)',
    35: 'Pesaje Semana 5 (~2,28 kg vivo) | Vigilar estrés calórico El Zulia (~220 msnm, agua fresca)',
    42: '24-dic META 6 SEMANAS LOTE 1 | ~3,00 kg vivo (~2,47 kg c/menud.; ayuno 10-12h antes)',
    45: '27-dic Opción +3d | ~3,30 kg vivo (~2,72 kg con menudencias si cliente exige 2,70 kg)',
    48: '30-dic | ~3,59 kg vivo (~2,71 kg eviscerado seco sin menudencias)',
    49: '31-dic | Cierre máximo tabla (~3,69 kg vivo)'
  });

  // Invariantes forenses auditadas en Excel COM (AV-1 y AV-2 a 42 días)
  const AUDIT_INVARIANTS_42D = Object.freeze({
    av1: {
      lote800Comercial: {
        avesFin: 776,
        pesoVivoTot: 2324.12,
        bultosTot: 89,
        costoVivoTot: 13193800,
        costoKgVivo: 5676.901364817652,
        costoSacrificio: 1164000,
        costoCanalTot: 14357800,
        kgCanalVend: 1917.399,
        costoKgCanal: 7488.164956798245,
        ingresoCanal: 22050088.5,
        utilidadCanal: 7692288.5,
        utilidadVivo: 4004688,
        extraCanal: 3687600.5,
        precioIndiferenciaCanal: 9576.873671051252
      },
      lote800Propio: {
        avesFin: 776,
        bultosTot: 91,
        costoVivoTot: 12285000,
        costoKgVivo: 5285.871641739669,
        costoCanalTot: 13449000,
        costoKgCanal: 7014.189534885541,
        utilidadCanal: 8601088.5,
        ahorroVsComercial: 908800
      },
      lote1Ref600: {
        avesFin: 582,
        pesoVivoTot: 1743.09,
        bultosTot: 67,
        bultosBodega0Bajas: 68,
        costoAlimentoPpto: 6341900,
        costoVivoTot: 10986900,
        costoKgVivo: 6303.116878646542,
        costoSacrificio: 873000,
        costoCanalTot: 11859900,
        kgCanalVend: 1438.04925,
        costoKgCanal: 8247.21392542709,
        ingresoCanal: 16537566.375,
        utilidadCanal: 4677666.375
      },
      anual12Meses: {
        avesInicTot: 4600,
        avesFinTot: 4462,
        costoCrianzaTot: 79820700,
        costoSacrificioTot: 6693000,
        gastoTotalAnual: 86513700,
        kgCanalTot: 11024.9835,
        ingresoAnual: 126787310.25,
        capitalPicoRotativo: 15107800,
        utilidadNetaAnual: 40274308.875
      }
    },
    av2: {
      consolidado3Lotes: {
        avesInic: 2200,
        avesFin: 2134,
        pesoVivoTot: 6391.33,
        bultosTot: 245,
        costoVivoTot: 37374500,
        costoSacrificio: 3201000,
        costoCanalTot: 40575500,
        kgCanalVend: 5272.84725,
        ingresoCanal: 60637743.375,
        utilidadCanal: 20062243.375,
        capitalTrabajoPicoSem7: 31212600,
        saldoFinalPost4MesesArriendo: 19312243.375,
        biomasaMaximaSimultaneaKg: 3984.178,
        densidadKgM2Base280: 14.229207142857143
      }
    }
  });

  function roundUp(value) {
    // Evita ruido binario IEEE-754 antes de aplicar ROUNDUP(..., 0)
    const normalized = Math.round(value * 1e10) / 1e10;
    return Math.ceil(normalized);
  }

  function clampEdad(edad) {
    const n = Number(edad);
    if (!Number.isFinite(n)) return 42;
    return Math.max(28, Math.min(49, Math.round(n)));
  }

  const ADD_DAYS_CACHE = new Map();

  function addDaysIso(isoDate, deltaDays) {
    const key = `${isoDate}|${deltaDays}`;
    const cached = ADD_DAYS_CACHE.get(key);
    if (cached !== undefined) return cached;
    const [y, m, d] = String(isoDate).split('-').map(Number);
    const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + Number(deltaDays || 0)));
    const out = utc.toISOString().slice(0, 10);
    if (ADD_DAYS_CACHE.size < 2000) ADD_DAYS_CACHE.set(key, out);
    return out;
  }

  function diffDaysIso(fromIso, toIso) {
    const [y1, m1, d1] = String(fromIso).split('-').map(Number);
    const [y2, m2, d2] = String(toIso).split('-').map(Number);
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / 86400000);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function createDefaultTwinState() {
    const bitacoraInicial = [];
    for (let d = 1; d <= 49; d++) {
      bitacoraInicial.push({
        dia: d,
        mortalidad: null,
        descarte: null,
        alimRealKg: null,
        tempC: null,
        aguaL: null,
        observacion: HITOS_BITACORA[d] || ''
      });
    }

    return {
      schemaVersion: '1.0.0',
      projectName: 'Proyecto Avícola Cúcuta (AV-1 & AV-2)',
      updatedAt: new Date().toISOString(),
      identidadAgente: {
        nombre: 'Avi',
        rol: 'Copiloto Operativo y Financiero Avícola',
        estilo: 'Directo, cálido, 100% en pesos colombianos (COP) y enfocado en granja real AV-2'
      },
      desposteConfig: {
        valorKmEstimadoCop: 1200,
        pechugaPct: 0.34,
        precioPechugaKg: 14800,
        pernilMusloPct: 0.31,
        precioPernilMusloKg: 12500,
        alasPct: 0.11,
        precioAlasKg: 13500,
        menudenciasPct: 0.08,
        precioMenudenciasKg: 6000,
        espinazoSubproductoPct: 0.16,
        precioEspinazoKg: 4500,
        costoDesposteKg: 0
      },
      viajesTransporte: [],
      ventasParciales: [],
      ajustesVentaLotes: {
        'lote-1': { tramoEspecialAves: 0, precioTramoEspecialKg: 13000, precioRestoKg: null, notas: '' },
        'lote-2': { tramoEspecialAves: 0, precioTramoEspecialKg: 13000, precioRestoKg: null, notas: '' },
        'lote-3': { tramoEspecialAves: 0, precioTramoEspecialKg: 13000, precioRestoKg: null, notas: '' }
      },
      continuoConfig: {
        habilitado: true,
        avesPorLote: 900,
        cadenciaDias: 18,
        lotesAdicionales: 3,
        edadObjetivoDias: 42
      },
      preciosRegionales: {
        pollitoLocal: 4500,
        pollitoBmanga: 3200,
        alimInicBulto: 106500,      // Solla Masterpollito Elite 40kg
        alimPreBulto: 96200,        // Solla Nutrepollo Cr SP 40kg
        alimEngComBulto: 93400,     // Solla Broiler I Dorado 40kg
        alimEngPropioBulto: 73000,  // Planta propia harina ($1.825/kg * 40)
        fletePigmentoBulto: 3800,   // $3.000 flete + $800 pigmento xantofila
        extraHarinaPct: 0.038,      // +3,8% consumo físico harina vs pelet
        camaAve: 300,
        gasAve: 425,
        vacunasAve: 400,
        energiaAve: 200,
        sacrificioAve: 1500,
        logisticaCanalKg: 0,
        arriendoIniMes: 750000,
        arriendoRegMes: 1000000,
        mesesArriendoPorLote: 1.0,
        colaboradorLote: 400000,
        precioCanalKg: 11500,
        precioVivoKg: 7400
      },
      parametrosGenerales: {
        edadObjetivoGlobal: 42,
        mortalidadEsperadaPct: 0.03,
        factorClimaCucutaPct: 0.0,
        pesoComercialMetaKg: 2.70,
        rendimientoCanalConMenudPct: 0.825,
        rendimientoEviscSecoPct: 0.7475,
        mermaTransportePct: 0.0,
        areaGalponM2: 280,
        areaMedidaVerificada: false,
        capacidadDeclaradaSeccionAves: 900,
        equipamientoAdicionalCop: 0,
        pctEnsayoAlimentoPropioLote1: 0.0
      },
      bodegaInicialLote1: {
        masterpollitoBultos: 3,
        nutrepolloBultos: 11,
        broilerBultos: 40
      },
      // Bodega física real bajo compra escalonada Justo a Tiempo (JIT)
      bodegaFisicaJitLote1: {
        masterpollitoBultos: 3,
        nutrepolloBultos: 0,
        broilerBultos: 0
      },
      lotes: [
        {
          id: 'lote-1',
          nombre: 'Lote 1 (Real en Curso)',
          avesIniciadas: 600,
          avesRecibidasReales: 603,
          fechaIngreso: '2026-11-13',
          edadObjetivoDias: 42,
          mortalidadEsperadaPct: 0.03,
          origenPollito: 'local', // $4.500
          mesesArriendo: 1.0,
          programaAlimento: '100% Comercial',
          estado: 'en_granja'
        },
        {
          id: 'lote-2',
          nombre: 'Lote 2 (+10 Días)',
          avesIniciadas: 800,
          desfaseDiasDespuesLote1: 10,
          fechaIngreso: '2026-11-23',
          edadObjetivoDias: 42,
          mortalidadEsperadaPct: 0.03,
          origenPollito: 'bucaramanga', // $3.200
          mesesArriendo: 1.0,
          programaAlimento: '100% Comercial',
          estado: 'programado'
        },
        {
          id: 'lote-3',
          nombre: 'Lote 3 (Meta 15-Ene)',
          avesIniciadas: 800,
          fechaMetaSacrificio: '2027-01-15',
          edadObjetivoDias: 42,
          mortalidadEsperadaPct: 0.03,
          origenPollito: 'bucaramanga', // $3.200
          mesesArriendo: 1.0,
          programaAlimento: '100% Comercial',
          estado: 'por_reservar'
        }
      ],
      bitacoraDiariaLote1: bitacoraInicial,
      pesajesSemanalesLote1: [
        { dia: 7, muestraAves: 30, pesoMuestraKg: null },
        { dia: 14, muestraAves: 30, pesoMuestraKg: null },
        { dia: 21, muestraAves: 30, pesoMuestraKg: null },
        { dia: 28, muestraAves: 30, pesoMuestraKg: null },
        { dia: 35, muestraAves: 30, pesoMuestraKg: null },
        { dia: 42, muestraAves: 30, pesoMuestraKg: null },
        { dia: 45, muestraAves: 30, pesoMuestraKg: null },
        { dia: 48, muestraAves: 30, pesoMuestraKg: null }
      ],
      liquidacionPlantaLote1: {
        pollosRecibidos: null,
        pesoVivoPlantaKg: null,
        pesoCanalFriaSinMenudKg: null,
        pesoMenudenciasKg: null
      },
      proyeccionAnualConfig: {
        camadas: [
          { numero: 1, nombre: 'Camada 1 (Real)', aves: 600, dieta: '100% Comercial', mesesArriendo: 2.0, esTarifaInicial: true },
          { numero: 2, nombre: 'Camada 2', aves: 800, dieta: '100% Comercial', mesesArriendo: 2.0, esTarifaInicial: true },
          { numero: 3, nombre: 'Camada 3', aves: 800, dieta: 'Mixto Propio', mesesArriendo: 2.0, esTarifaInicial: false },
          { numero: 4, nombre: 'Camada 4', aves: 800, dieta: 'Mixto Propio', mesesArriendo: 2.0, esTarifaInicial: false },
          { numero: 5, nombre: 'Camada 5', aves: 800, dieta: 'Mixto Propio', mesesArriendo: 2.0, esTarifaInicial: false },
          { numero: 6, nombre: 'Camada 6', aves: 800, dieta: 'Mixto Propio', mesesArriendo: 2.0, esTarifaInicial: false }
        ]
      }
    };
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Calcula cierre comercial flexible por lote permitiendo venta parcial de tramo especial
   * (ej. 200 pollos a $13.000/kg) y resto a otro precio (ej. $11.000/kg) manteniendo paridad si no hay override.
   */
  function computeMixedBatchClosure(loteRes, loteId, ajustesMap, precioGlobalCanalKg) {
    const cfg = (ajustesMap && ajustesMap[loteId]) || {};
    const avesEsp = Math.max(0, Math.min(loteRes.avesFin, Math.round(Number(cfg.tramoEspecialAves) || 0)));
    const precioEsp = Number(cfg.precioTramoEspecialKg) > 0 ? Number(cfg.precioTramoEspecialKg) : precioGlobalCanalKg;
    const rawResto = (cfg.precioRestoKg !== null && cfg.precioRestoKg !== undefined && cfg.precioRestoKg !== '')
      ? Number(cfg.precioRestoKg)
      : null;
    const precioResto = Number.isFinite(rawResto) && rawResto > 0 ? rawResto : precioGlobalCanalKg;
    const hasOverride = avesEsp > 0 || (Number.isFinite(rawResto) && rawResto > 0 && Math.abs(rawResto - precioGlobalCanalKg) > 0.01);

    if (!hasOverride) {
      return {
        loteId,
        hasOverride: false,
        avesFin: loteRes.avesFin,
        tramoEspecialAves: 0,
        precioTramoEspecialKg: precioEsp,
        avesResto: loteRes.avesFin,
        precioRestoKg: precioGlobalCanalKg,
        precioPromedioRealKg: precioGlobalCanalKg,
        ingresoEfectivo: loteRes.ingresoCanal,
        utilidadEfectiva: loteRes.utilidadCanal,
        deltaVsBaseCop: 0,
        notas: cfg.notas || ''
      };
    }

    const kgPorAve = loteRes.avesFin > 0 ? (loteRes.kgCanalVend / loteRes.avesFin) : loteRes.pesoCanalAveKg;
    const avesResto = Math.max(0, loteRes.avesFin - avesEsp);
    const ingresoEsp = avesEsp * kgPorAve * precioEsp;
    const ingresoResto = avesResto * kgPorAve * precioResto;
    const ingresoEfectivo = ingresoEsp + ingresoResto;
    const utilidadEfectiva = ingresoEfectivo - loteRes.costoCanalTot;
    const precioPromedioRealKg = loteRes.kgCanalVend > 0 ? ingresoEfectivo / loteRes.kgCanalVend : precioGlobalCanalKg;

    return {
      loteId,
      hasOverride: true,
      avesFin: loteRes.avesFin,
      tramoEspecialAves: avesEsp,
      precioTramoEspecialKg: precioEsp,
      avesResto,
      precioRestoKg: precioResto,
      precioPromedioRealKg,
      ingresoEfectivo,
      utilidadEfectiva,
      deltaVsBaseCop: ingresoEfectivo - loteRes.ingresoCanal,
      notas: cfg.notas || ''
    };
  }

  function weekIndexForContinuousTimeline(isoDate) {
    if (isoDate <= '2026-11-06') return 0;
    if (isoDate <= '2026-11-19') return 1;
    if (isoDate <= '2026-11-29') return 2;
    if (isoDate <= '2026-12-05') return 3;
    if (isoDate <= '2026-12-12') return 4;
    if (isoDate <= '2026-12-19') return 5;
    if (isoDate <= '2026-12-23') return 6;
    if (isoDate <= '2026-12-31') return 7;
    if (isoDate <= '2027-01-07') return 8;
    if (isoDate <= '2027-01-15') return 9;
    if (isoDate <= '2027-01-30') return 10;
    const extraDays = Math.max(0, diffDaysIso('2027-01-31', isoDate));
    return 11 + Math.floor(extraDays / 7);
  }

  function formatShortDateEs(isoDate) {
    const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const parts = String(isoDate).split('-').map(Number);
    const dd = String(parts[2] || 1).padStart(2, '0');
    const mm = meses[(parts[1] || 1) - 1] || 'mes';
    return `${dd}-${mm}`;
  }

  function rentDateForMonth(monthNum) {
    const totalMonthsFromZero = 2026 * 12 + 9 + Math.max(0, monthNum - 1);
    const year = Math.floor(totalMonthsFromZero / 12);
    const m1 = (totalMonthsFromZero % 12) + 1;
    const dd = m1 === 2 ? '28' : '30';
    return `${year}-${String(m1).padStart(2, '0')}-${dd}`;
  }

  /**
   * Constructor único para flujo de caja continuo (Post-Lote 3) compartido entre computeFullTwin y simulateContinuousHorizon.
   */
  function buildContinuousProjectionTimeline({
    rawWeeks,
    l3FechaEnt,
    loteModelo,
    contAves,
    contCadencia,
    contEdad,
    precios,
    lotesCount = null,
    horizonWeeks = 18,
    clipAtHorizon = false
  }) {
    const lotesProyectados = [];
    const maxK = lotesCount != null ? lotesCount : Math.max(1, Math.ceil((horizonWeeks * 7) / Math.max(7, contCadencia)) + 2);
    for (let k = 1; k <= maxK; k++) {
      const numero = 3 + k;
      const fechaIngreso = addDaysIso(l3FechaEnt, k * contCadencia);
      const fechaSalida = addDaysIso(fechaIngreso, contEdad - 1);
      const semanaIngreso = weekIndexForContinuousTimeline(fechaIngreso) + 1;
      const semanaSalida = weekIndexForContinuousTimeline(fechaSalida) + 1;
      if (lotesCount == null && semanaIngreso > horizonWeeks) break;
      lotesProyectados.push({
        id: `lote-${numero}`,
        nombre: `Lote ${numero} (${contAves} pollos)`,
        avesInic: contAves,
        avesFin: loteModelo.avesFin,
        fechaIngreso,
        fechaSalida,
        semanaIngreso,
        semanaSalida,
        edadDias: contEdad,
        kgCanalVend: loteModelo.kgCanalVend,
        ingresoCanal: loteModelo.ingresoCanal,
        costoDirectoSinArriendo: loteModelo.costoCanalTot,
        utilidadBrutaPreArriendo: loteModelo.utilidadCanal
      });
    }

    const lastSalidaWeek = lotesProyectados.length
      ? Math.max(...lotesProyectados.map((lp) => lp.semanaSalida))
      : 11;
    const maxContWeeks = clipAtHorizon
      ? Math.max(11, horizonWeeks)
      : Math.max(11, lastSalidaWeek, horizonWeeks);

    const contBuckets = [];
    for (let i = 0; i < maxContWeeks; i++) {
      if (i < rawWeeks.length) {
        contBuckets.push({
          semana: rawWeeks[i].semana,
          baseEtiqueta: rawWeeks[i].etiqueta,
          eventos: [],
          ingresos: rawWeeks[i].ingresos,
          pollitosInsumos: rawWeeks[i].pollitosInsumos,
          alimento: rawWeeks[i].alimento,
          fijosBenef: rawWeeks[i].fijosBenef
        });
      } else {
        const wsIso = addDaysIso('2027-01-31', (i - 11) * 7);
        const weIso = addDaysIso(wsIso, 6);
        contBuckets.push({
          semana: i + 1,
          baseEtiqueta: `Sem ${i + 1} (${formatShortDateEs(wsIso)} a ${formatShortDateEs(weIso)})`,
          eventos: [],
          ingresos: 0,
          pollitosInsumos: 0,
          alimento: 0,
          fijosBenef: 0
        });
      }
    }

    const feedWeights = [0.05, 0.15, 0.25, 0.25, 0.20, 0.10];
    const insWeights = [0.70, 0.15, 0.15];
    lotesProyectados.forEach((lp) => {
      const ingIdx = lp.semanaIngreso - 1;
      const salIdx = lp.semanaSalida - 1;
      if (contBuckets[ingIdx]) {
        contBuckets[ingIdx].pollitosInsumos += loteModelo.costoPollito;
        contBuckets[ingIdx].eventos.push(`Ingreso Lote ${lp.id.replace('lote-', '')} (${contAves})`);
      }
      insWeights.forEach((w, offset) => {
        const b = contBuckets[ingIdx + offset];
        if (b) b.pollitosInsumos += w * loteModelo.costoInsumos;
      });
      feedWeights.forEach((w, offset) => {
        const b = contBuckets[ingIdx + offset];
        if (b) b.alimento += w * loteModelo.costoAlimento;
      });
      if (contBuckets[salIdx]) {
        contBuckets[salIdx].ingresos += loteModelo.ingresoCanal;
        contBuckets[salIdx].fijosBenef += loteModelo.costoSacrificio + loteModelo.costoComercializacion + precios.colaboradorLote;
        contBuckets[salIdx].eventos.push(`COBRO LOTE ${lp.id.replace('lote-', '')} (${contAves})`);
      }
    });

    // Arriendos mensuales regulares Mes 5+ ($1.000.000) que caigan dentro de la ventana continua
    const maxMonths = Math.max(8, Math.ceil(maxContWeeks / 4.2) + 5);
    for (let mNum = 5; mNum <= maxMonths; mNum++) {
      const idx = weekIndexForContinuousTimeline(rentDateForMonth(mNum));
      if (idx >= contBuckets.length) break;
      if (contBuckets[idx]) {
        contBuckets[idx].fijosBenef += precios.arriendoRegMes;
        contBuckets[idx].eventos.push(`Arriendo Mes ${mNum}`);
      }
    }

    let saldoContAcum = 0;
    const flujoCajaContinuoSemanal = contBuckets.map((b) => {
      const egresos = b.pollitosInsumos + b.alimento + b.fijosBenef;
      const flujoNeto = b.ingresos - egresos;
      saldoContAcum += flujoNeto;
      const etiqueta = b.eventos.length
        ? `${b.baseEtiqueta} · ${b.eventos.join(' + ')}`
        : b.baseEtiqueta;
      return {
        semana: b.semana,
        etiqueta,
        eventos: b.eventos,
        ingresos: b.ingresos,
        pollitosInsumos: b.pollitosInsumos,
        alimento: b.alimento,
        fijosBenef: b.fijosBenef,
        egresos,
        flujoNeto,
        saldoAcumulado: saldoContAcum
      };
    });

    const minSaldoContinuo = Math.min(...flujoCajaContinuoSemanal.map((w) => w.saldoAcumulado));
    return {
      lotesProyectados,
      flujoCajaContinuoSemanal,
      semanasTotales: flujoCajaContinuoSemanal.length,
      capitalTrabajoPicoContinuo: minSaldoContinuo < 0 ? Math.abs(minSaldoContinuo) : 0,
      saldoFinalContinuo: flujoCajaContinuoSemanal[flujoCajaContinuoSemanal.length - 1].saldoAcumulado
    };
  }

  /**
   * Calcula rendimiento eviscerado seco de referencia según peso vivo Ross 308 AP.
   */
  function getRendimientoSecoRoss(pesoVivoKg) {
    if (pesoVivoKg <= REND_SECO_EXACTO[0].pesoVivoKg) return REND_SECO_EXACTO[0].pctSeco;
    for (let i = 1; i < REND_SECO_EXACTO.length; i++) {
      const a = REND_SECO_EXACTO[i - 1];
      const b = REND_SECO_EXACTO[i];
      if (pesoVivoKg <= b.pesoVivoKg) {
        const t = (pesoVivoKg - a.pesoVivoKg) / (b.pesoVivoKg - a.pesoVivoKg);
        return a.pctSeco + t * (b.pctSeco - a.pctSeco);
      }
    }
    return REND_SECO_EXACTO[REND_SECO_EXACTO.length - 1].pctSeco;
  }

  /**
   * Calcula indicadores biológicos y económicos completos para un lote unitario.
   */
  function computeSingleLot(opts) {
    const {
      avesInic,
      edad,
      mortalidadPct,
      precioPollito,
      usaAlimentoPropio,
      mesesArriendo,
      canonMensualArriendo,
      precios,
      params,
      avesFinOverride
    } = opts;

    const e = clampEdad(edad);
    const bajasTeoricas = Math.round(avesInic * mortalidadPct);
    const avesFin = Number.isFinite(avesFinOverride) ? avesFinOverride : (avesInic - bajasTeoricas);
    const mortEfectiva = avesInic > 0 ? (1 - avesFin / avesInic) : mortalidadPct;

    const pesoVivoRossKg = ROSS_PESO_G[e] / 1000;
    const pesoVivoAveKg = pesoVivoRossKg * (1 + params.factorClimaCucutaPct);
    const consAcumRossKg = ROSS_CONS_ACUM_G[e - 1] / 1000;
    const consTeoricoKg = 4.445 + (consAcumRossKg - 4.664);
    const consEngordeKg = consTeoricoKg - 1.204;

    const bultosInic = roundUp((avesInic * 0.175 * (1 - 0.25 * mortEfectiva)) / 40);
    const bultosPre = roundUp((avesInic * 1.029 * (1 - 0.55 * mortEfectiva)) / 40);
    const factorHarina = usaAlimentoPropio ? (1 + precios.extraHarinaPct) : 1;
    const bultosEng = roundUp((avesInic * consEngordeKg * (1 - 0.80 * mortEfectiva) * factorHarina) / 40);
    const bultosTot = bultosInic + bultosPre + bultosEng;

    // Reserva física en bodega (0% bajas)
    const bodegaInic = roundUp((avesInic * 0.175) / 40);
    const bodegaPre = roundUp((avesInic * 1.029) / 40);
    const bodegaEng = roundUp((avesInic * consEngordeKg * factorHarina) / 40);
    const bodegaTot = bodegaInic + bodegaPre + bodegaEng;

    const precioEngAplicado = usaAlimentoPropio
      ? (precios.alimEngPropioBulto + precios.fletePigmentoBulto)
      : precios.alimEngComBulto;

    const costoAlimInic = bultosInic * precios.alimInicBulto;
    const costoAlimPre = bultosPre * precios.alimPreBulto;
    const costoAlimEng = bultosEng * precioEngAplicado;
    const costoAlimento = costoAlimInic + costoAlimPre + costoAlimEng;

    const pesoVivoTot = avesFin * pesoVivoAveKg;
    const fcrReal = pesoVivoTot > 0 ? (bultosTot * 40) / pesoVivoTot : 0;

    const costoPollito = avesInic * precioPollito;
    const insumosPorAve = precios.camaAve + precios.gasAve + precios.vacunasAve + precios.energiaAve;
    const costoInsumos = avesInic * insumosPorAve;
    const costoArriendo = canonMensualArriendo * mesesArriendo;
    const costoColaborador = precios.colaboradorLote;
    const costoFijos = costoArriendo + costoColaborador;

    const costoVivoTot = costoPollito + costoAlimento + costoInsumos + costoFijos;
    const costoKgVivo = pesoVivoTot > 0 ? costoVivoTot / pesoVivoTot : 0;

    const ingresoVivo = pesoVivoTot * precios.precioVivoKg;
    const utilidadVivo = ingresoVivo - costoVivoTot;

    const costoSacrificio = avesFin * precios.sacrificioAve;
    const kgCanalVend = pesoVivoTot * params.rendimientoCanalConMenudPct * (1 - params.mermaTransportePct);
    const kgCanalSeco = pesoVivoTot * params.rendimientoEviscSecoPct * (1 - params.mermaTransportePct);
    const pesoCanalAveKg = pesoVivoAveKg * params.rendimientoCanalConMenudPct * (1 - params.mermaTransportePct);
    const costoComercializacion = kgCanalVend * precios.logisticaCanalKg;

    const costoCanalTot = costoVivoTot + costoSacrificio + costoComercializacion;
    const costoKgCanal = kgCanalVend > 0 ? costoCanalTot / kgCanalVend : 0;
    const costoKgSeco = kgCanalSeco > 0 ? costoCanalTot / kgCanalSeco : 0;

    const ingresoCanal = kgCanalVend * precios.precioCanalKg;
    const utilidadCanal = ingresoCanal - costoCanalTot;
    const margenCanal = ingresoCanal > 0 ? utilidadCanal / ingresoCanal : 0;
    const roiCiclo = costoCanalTot > 0 ? utilidadCanal / costoCanalTot : 0;
    const extraCanalVsVivo = utilidadCanal - utilidadVivo;
    const precioIndiferenciaCanal = kgCanalVend > 0
      ? (ingresoVivo + costoSacrificio + costoComercializacion) / kgCanalVend
      : 0;
    const pctAlimentoSobreCostoVivo = costoVivoTot > 0 ? costoAlimento / costoVivoTot : 0;
    const pctAlimentoSobreCostoCanal = costoCanalTot > 0 ? costoAlimento / costoCanalTot : 0;
    const costosVariablesCanal = costoPollito + costoAlimento + costoInsumos + costoSacrificio + costoComercializacion;
    const margenBrutoPct = ingresoCanal > 0 ? (ingresoCanal - costosVariablesCanal) / ingresoCanal : 0;
    const costoPorAveVivo = avesFin > 0 ? costoVivoTot / avesFin : 0;
    const costoPorAveCanal = avesFin > 0 ? costoCanalTot / avesFin : 0;
    const utilidadPorAveInic = avesInic > 0 ? utilidadCanal / avesInic : 0;
    const utilidadPorAveFin = avesFin > 0 ? utilidadCanal / avesFin : 0;
    const margenContribPorAve = avesFin > 0 ? (ingresoCanal - costosVariablesCanal) / avesFin : 0;
    const puntoEquilibrioAvesFijos = margenContribPorAve > 0 ? Math.ceil(costoFijos / margenContribPorAve) : 0;
    const ingresoPorAveCanal = avesFin > 0 ? ingresoCanal / avesFin : 0;
    const puntoEquilibrioAvesTotales = ingresoPorAveCanal > 0 ? Math.ceil(costoCanalTot / ingresoPorAveCanal) : 0;
    const prorrateoKgCanal = kgCanalVend > 0 ? {
      alimento: Math.round(costoAlimento / kgCanalVend),
      pollito: Math.round(costoPollito / kgCanalVend),
      insumos: Math.round(costoInsumos / kgCanalVend),
      sacrificio: Math.round(costoSacrificio / kgCanalVend),
      arriendo: Math.round(costoArriendo / kgCanalVend),
      manoObra: Math.round(costoColaborador / kgCanalVend)
    } : { alimento: 0, pollito: 0, insumos: 0, sacrificio: 0, arriendo: 0, manoObra: 0 };

    return {
      avesInic,
      bajas: avesInic - avesFin,
      avesFin,
      mortEfectiva,
      edadDias: e,
      pesoVivoAveKg,
      pesoCanalAveKg,
      pesoVivoTot,
      consTeoricoKg,
      bultosInic,
      bultosPre,
      bultosEng,
      bultosTot,
      bodegaInic,
      bodegaPre,
      bodegaEng,
      bodegaTot,
      fcrReal,
      precioPollito,
      costoPollito,
      costoAlimInic,
      costoAlimPre,
      costoAlimEng,
      costoAlimento,
      costoInsumos,
      costoArriendo,
      costoColaborador,
      costoFijos,
      costoVivoTot,
      costoKgVivo,
      ingresoVivo,
      utilidadVivo,
      costoSacrificio,
      costoComercializacion,
      kgCanalVend,
      kgCanalSeco,
      costoCanalTot,
      costoKgCanal,
      costoKgSeco,
      ingresoCanal,
      utilidadCanal,
      margenCanal,
      margenBrutoPct,
      roiCiclo,
      extraCanalVsVivo,
      precioIndiferenciaCanal,
      pctAlimentoSobreCostoVivo,
      pctAlimentoSobreCostoCanal,
      costoPorAveVivo,
      costoPorAveCanal,
      utilidadPorAveInic,
      utilidadPorAveFin,
      margenContribPorAve,
      puntoEquilibrioAvesFijos,
      puntoEquilibrioAvesTotales,
      prorrateoKgCanal
    };
  }

  /**
   * Normaliza campos de operación física real (aves recibidas 603 y bodega JIT)
   * sobre snapshots persistidos de versiones anteriores sin alterar proyecciones base.
   */
  function normalizeStateDefaults(state) {
    if (!state || typeof state !== 'object') return state;
    if (!state.bodegaFisicaJitLote1) {
      state.bodegaFisicaJitLote1 = {
        masterpollitoBultos: Number(state.bodegaInicialLote1?.masterpollitoBultos ?? 3),
        nutrepolloBultos: 0,
        broilerBultos: 0
      };
    }
    if (Array.isArray(state.lotes) && state.lotes[0]) {
      const l1 = state.lotes[0];
      if (!Number.isFinite(Number(l1.avesRecibidasReales))) {
        l1.avesRecibidasReales = (l1.id === 'lote-1' && Number(l1.avesIniciadas) === 600)
          ? 603
          : Number(l1.avesIniciadas || 600);
      }
    }
    return state;
  }

  function resolveLote1PhysicalCounts(lote1) {
    const avesNominales = Math.max(0, Math.round(Number(lote1?.avesIniciadas || 600)));
    const rawReal = Number(lote1?.avesRecibidasReales);
    const avesRecibidasReales = Number.isFinite(rawReal) && rawReal > 0
      ? Math.round(rawReal)
      : ((lote1?.id === 'lote-1' && avesNominales === 600) ? 603 : avesNominales);
    return {
      avesNominales,
      avesRecibidasReales,
      avesExtrasLlegada: Math.max(0, avesRecibidasReales - avesNominales)
    };
  }

  /**
   * Evalúa la bitácora diaria de 49 días del Lote 1 y sus alertas en campo.
   */
  function computeBitacoraLote1(state, liteCompare = false) {
    const lote1 = state.lotes[0];
    const edad = clampEdad(lote1.edadObjetivoDias || state.parametrosGenerales.edadObjetivoGlobal);
    const mortEsp = lote1.mortalidadEsperadaPct ?? state.parametrosGenerales.mortalidadEsperadaPct;
    const counts = resolveLote1PhysicalCounts(lote1);

    let avesVivas = counts.avesRecibidasReales;
    if (liteCompare) {
      for (let i = 0; i < edad; i++) {
        const raw = (state.bitacoraDiariaLote1 && state.bitacoraDiariaLote1[i]) || {};
        const mort = Number.isFinite(raw.mortalidad) ? raw.mortalidad : 0;
        const desc = Number.isFinite(raw.descarte) ? raw.descarte : 0;
        avesVivas = Math.max(0, avesVivas - mort - desc);
      }
      const avesFinTeorico = counts.avesNominales - Math.round(counts.avesNominales * mortEsp);
      const avesFinEfectivas = Math.min(avesVivas, avesFinTeorico);
      return {
        dias: [],
        diasRegistrados: 0,
        bajasAcumReales: 0,
        avesNominalesCompradas: counts.avesNominales,
        avesRecibidasReales: counts.avesRecibidasReales,
        avesExtrasLlegada: counts.avesExtrasLlegada,
        avesVivasRealesHoy: avesVivas,
        fechaSacrificio: '',
        avesFinEfectivas,
        mortEfectivaPct: counts.avesNominales > 0 ? 1 - avesFinEfectivas / counts.avesNominales : mortEsp,
        desvioAlimentoRealKg: 0,
        ratioAguaPromedio: null,
        pesajes: []
      };
    }
    let alimAcumKg = 0;
    let alimRealDiasKg = 0;
    let alimTeoricoDiasKg = 0;
    let diasRegistrados = 0;
    let bajasAcumReales = 0;
    let sumRatioAgua = 0;
    let countRatioAgua = 0;

    const dias = [];
    for (let i = 0; i < 49; i++) {
      const d = i + 1;
      const raw = (state.bitacoraDiariaLote1 && state.bitacoraDiariaLote1[i]) || {};
      const mort = Number.isFinite(raw.mortalidad) ? raw.mortalidad : 0;
      const desc = Number.isFinite(raw.descarte) ? raw.descarte : 0;
      avesVivas = Math.max(0, avesVivas - mort - desc);
      bajasAcumReales += mort + desc;

      const consRossDiaG = ROSS_CONS_DIA_G[i];
      const estHatoKg = (avesVivas * consRossDiaG) / 1000;
      const alimRealKg = Number.isFinite(raw.alimRealKg) ? raw.alimRealKg : null;
      const desvioKg = alimRealKg !== null ? alimRealKg - estHatoKg : null;
      const defaultHito = HITOS_BITACORA[d] || '';
      const rawObs = typeof raw.observacion === 'string' ? raw.observacion.trim() : '';
      const tieneNotaUsuario = Boolean(rawObs && rawObs !== defaultHito);
      const tieneRegistro = alimRealKg !== null || mort > 0 || desc > 0 || raw.tempC != null || raw.aguaL != null || tieneNotaUsuario;

      if (alimRealKg !== null) {
        diasRegistrados++;
        alimRealDiasKg += alimRealKg;
        alimTeoricoDiasKg += estHatoKg;
      } else if (tieneRegistro) {
        diasRegistrados++;
      }

      alimAcumKg += alimRealKg !== null ? alimRealKg : estHatoKg;
      const aguaL = Number.isFinite(raw.aguaL) ? raw.aguaL : null;
      const ratioAgua = aguaL !== null && alimRealKg !== null && alimRealKg > 0 ? aguaL / alimRealKg : null;
      if (ratioAgua !== null) {
        sumRatioAgua += ratioAgua;
        countRatioAgua++;
      }

      dias.push({
        dia: d,
        fecha: addDaysIso(lote1.fechaIngreso, d - 1),
        etapa: d <= 7 ? 'Preiniciación (d1-7 · S1)' : (d <= 21 ? 'Iniciación (d8-21 · S2-3)' : 'Engorde (d22+ · S4-6)'),
        pesoRossG: ROSS_PESO_G[i + 1],
        consRossDiaG,
        consRossAcumG: ROSS_CONS_ACUM_G[i],
        mortalidad: raw.mortalidad ?? null,
        descarte: raw.descarte ?? null,
        avesVivas,
        estHatoKg,
        alimRealKg,
        desvioKg,
        acumLoteKg: alimAcumKg,
        bultosAcum: alimAcumKg / 40,
        tempC: raw.tempC ?? null,
        aguaL,
        ratioAgua,
        tieneNotaUsuario,
        tieneRegistro,
        observacion: rawObs || defaultHito || ''
      });
    }

    const rowAtEdad = dias[edad - 1];
    const avesFinTeorico = counts.avesNominales - Math.round(counts.avesNominales * mortEsp);
    const avesFinEfectivas = Math.min(rowAtEdad.avesVivas, avesFinTeorico);
    const mortEfectivaPct = counts.avesNominales > 0 ? 1 - avesFinEfectivas / counts.avesNominales : mortEsp;

    // Pesajes semanales + IEP + GMD
    let ultimoPesoReal = null;
    let consumoAcumRealKg = 0;
    let pesajesRealesCount = 0;
    const tieneAlimReal = dias.some((d) => d.alimRealKg !== null);

    const pesajes = (state.pesajesSemanalesLote1 || []).map((p) => {
      const refDia = dias[Math.max(0, Math.min(48, p.dia - 1))];
      const pesoRealG = p.pesoMuestraKg && p.muestraAves > 0 ? (p.pesoMuestraKg / p.muestraAves) * 1000 : null;
      const difVsRossPct = pesoRealG !== null ? (pesoRealG - refDia.pesoRossG) / refDia.pesoRossG : null;
      const gmdRealG = pesoRealG !== null && p.dia > 0 ? (pesoRealG - ROSS_PESO_G[0]) / p.dia : null;
      const gmdMetaG = p.dia > 0 ? (refDia.pesoRossG - ROSS_PESO_G[0]) / p.dia : null;
      const fcrReal = pesoRealG !== null && pesoRealG > 0
        ? refDia.acumLoteKg / ((refDia.avesVivas * pesoRealG) / 1000)
        : null;
      const fcrMetaRoss = refDia.consRossAcumG / refDia.pesoRossG;
      const iep = fcrReal !== null && fcrReal > 0
        ? (((refDia.avesVivas / Math.max(1, counts.avesRecibidasReales)) * 100 * (pesoRealG / 1000)) / (p.dia * fcrReal)) * 100
        : null;
      if (pesoRealG !== null) {
        pesajesRealesCount += 1;
        ultimoPesoReal = {
          diaCiclo: p.dia,
          pesoPromedioKg: pesoRealG / 1000,
          pesoPromedioG: pesoRealG,
          gmdRealG,
          fcrReal,
          fcrMetaRoss,
          iep
        };
        if (tieneAlimReal) {
          consumoAcumRealKg = refDia.acumLoteKg;
        }
      }
      return {
        ...p,
        fecha: refDia.fecha,
        metaRossG: refDia.pesoRossG,
        pesoRealG,
        difVsRossPct,
        gmdRealG,
        gmdMetaG,
        acumLoteKg: refDia.acumLoteKg,
        avesVivas: refDia.avesVivas,
        fcrReal,
        fcrMetaRoss,
        iep
      };
    });

    const avesVivasRealesHoy = Math.max(0, counts.avesRecibidasReales - bajasAcumReales);

    return {
      dias,
      diasRegistrados,
      bajasAcumReales,
      avesNominalesCompradas: counts.avesNominales,
      avesRecibidasReales: counts.avesRecibidasReales,
      avesExtrasLlegada: counts.avesExtrasLlegada,
      avesVivasRealesHoy,
      pesajesRealesCount,
      ultimoPesoReal,
      consumoAcumRealKg,
      fechaSacrificio: rowAtEdad.fecha,
      avesFinEfectivas,
      mortEfectivaPct,
      desvioAlimentoRealKg: alimRealDiasKg - alimTeoricoDiasKg,
      ratioAguaPromedio: countRatioAgua > 0 ? sumRatioAgua / countRatioAgua : null,
      pesajes
    };
  }

  /**
   * Calcula la totalidad del Gemelo Digital Causal (AV-1 + AV-2 + Bodega + Flujo 11 Semanas + Anual).
   */
  function computeFullTwin(inputState, internalOpts = {}) {
    const state = inputState || createDefaultTwinState();
    const precios = state.preciosRegionales;
    const params = state.parametrosGenerales;
    const liteCompare = Boolean(internalOpts && internalOpts.liteCompare);

    // 1. Bitácora Lote 1 y estado vivo en galpón
    const bitacora = computeBitacoraLote1(state, liteCompare);

    // 2. Bloque AV-1: Comparativo Estándar 800 Comercial vs Propio d22+ vs Ref Lote 1 (600)
    const edadAV1 = clampEdad(params.edadObjetivoGlobal);
    const av1Comercial800 = computeSingleLot({
      avesInic: 800,
      edad: edadAV1,
      mortalidadPct: params.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: false,
      mesesArriendo: precios.mesesArriendoPorLote,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params
    });

    const av1Propio800 = liteCompare ? av1Comercial800 : computeSingleLot({
      avesInic: 800,
      edad: edadAV1,
      mortalidadPct: params.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: true,
      mesesArriendo: precios.mesesArriendoPorLote,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params
    });

    const av1RefLote1 = liteCompare ? av1Comercial800 : computeSingleLot({
      avesInic: 600,
      edad: edadAV1,
      mortalidadPct: params.mortalidadEsperadaPct,
      precioPollito: precios.pollitoLocal,
      usaAlimentoPropio: false,
      mesesArriendo: precios.mesesArriendoPorLote,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params
    });

    // 3. Bloque AV-1 Proyección Anual (6 camadas · 12 meses reales)
    let utilAcum = 0;
    const camadasAnuales = liteCompare ? [] : (state.proyeccionAnualConfig.camadas || []).map((cm, idx) => {
      const res = computeSingleLot({
        avesInic: cm.aves,
        edad: edadAV1,
        mortalidadPct: params.mortalidadEsperadaPct,
        precioPollito: idx === 0 ? precios.pollitoLocal : precios.pollitoBmanga,
        usaAlimentoPropio: cm.dieta === 'Mixto Propio',
        mesesArriendo: cm.mesesArriendo,
        canonMensualArriendo: cm.esTarifaInicial ? precios.arriendoIniMes : precios.arriendoRegMes,
        precios,
        params
      });
      utilAcum += res.utilidadCanal;
      return {
        numero: cm.numero,
        nombre: cm.nombre,
        dieta: cm.dieta,
        mesesArriendo: cm.mesesArriendo,
        canonMensual: cm.esTarifaInicial ? precios.arriendoIniMes : precios.arriendoRegMes,
        ...res,
        utilidadAcumuladaAnio: utilAcum
      };
    });

    const sumAnual = camadasAnuales.reduce((acc, c) => {
      acc.avesInic += c.avesInic;
      acc.avesFin += c.avesFin;
      acc.pesoVivoTot += c.pesoVivoTot;
      acc.costoVivoTot += c.costoVivoTot;
      acc.costoSacrificio += c.costoSacrificio;
      acc.costoComercializacion += c.costoComercializacion;
      acc.costoCanalTot += c.costoCanalTot;
      acc.kgCanalVend += c.kgCanalVend;
      acc.ingresoCanal += c.ingresoCanal;
      acc.utilidadCanal += c.utilidadCanal;
      acc.arriendoTotal += c.costoArriendo;
      acc.mesesArriendo += c.mesesArriendo;
      return acc;
    }, {
      avesInic: 0, avesFin: 0, pesoVivoTot: 0, costoVivoTot: 0, costoSacrificio: 0,
      costoComercializacion: 0, costoCanalTot: 0, kgCanalVend: 0, ingresoCanal: 0,
      utilidadCanal: 0, arriendoTotal: 0, mesesArriendo: 0
    });

    const capitalPicoAnual = Math.max(...camadasAnuales.map((c) => c.costoCanalTot));
    const roiAnualSobrePico = capitalPicoAnual > 0 ? sumAnual.utilidadCanal / capitalPicoAnual : 0;
    const margenAnual = sumAnual.ingresoCanal > 0 ? sumAnual.utilidadCanal / sumAnual.ingresoCanal : 0;
    const costoKgCanalAnual = sumAnual.kgCanalVend > 0 ? sumAnual.costoCanalTot / sumAnual.kgCanalVend : 0;

    // 4. Bloque AV-2: Operación Activa 3 Lotes
    const l1Cfg = state.lotes[0];
    const l2Cfg = state.lotes[1];
    const l3Cfg = state.lotes[2];

    const l1FechaEnt = l1Cfg.fechaIngreso;
    const l1Edad = clampEdad(l1Cfg.edadObjetivoDias);
    const l1FechaSal = addDaysIso(l1FechaEnt, l1Edad - 1);

    const l2Edad = clampEdad(l2Cfg.edadObjetivoDias);
    const l2FechaEnt = addDaysIso(l1FechaEnt, l2Cfg.desfaseDiasDespuesLote1 ?? 10);
    const l2FechaSal = addDaysIso(l2FechaEnt, l2Edad - 1);

    const l3Edad = clampEdad(l3Cfg.edadObjetivoDias);
    const l3FechaSal = l3Cfg.fechaMetaSacrificio || '2027-01-15';
    const l3FechaEnt = addDaysIso(l3FechaSal, -(l3Edad - 1));
    const l3FechaPedidoMax = addDaysIso(l3FechaEnt, -10);

    const l1Res = computeSingleLot({
      avesInic: l1Cfg.avesIniciadas,
      edad: l1Edad,
      mortalidadPct: l1Cfg.mortalidadEsperadaPct,
      precioPollito: precios.pollitoLocal,
      usaAlimentoPropio: l1Cfg.programaAlimento === 'Mixto Propio',
      mesesArriendo: l1Cfg.mesesArriendo,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params,
      avesFinOverride: bitacora.avesFinEfectivas
    });

    const l2Res = computeSingleLot({
      avesInic: l2Cfg.avesIniciadas,
      edad: l2Edad,
      mortalidadPct: l2Cfg.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: l2Cfg.programaAlimento === 'Mixto Propio',
      mesesArriendo: l2Cfg.mesesArriendo,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params
    });

    const l3Res = computeSingleLot({
      avesInic: l3Cfg.avesIniciadas,
      edad: l3Edad,
      mortalidadPct: l3Cfg.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: l3Cfg.programaAlimento === 'Mixto Propio',
      mesesArriendo: l3Cfg.mesesArriendo,
      canonMensualArriendo: precios.arriendoIniMes,
      precios,
      params
    });

    const lotesDetallados = [
      {
        ...l1Cfg,
        fechaIngreso: l1FechaEnt,
        fechaInicioEngorde: addDaysIso(l1FechaEnt, 21),
        fechaSalida: l1FechaSal,
        ...l1Res
      },
      {
        ...l2Cfg,
        fechaIngreso: l2FechaEnt,
        fechaInicioEngorde: addDaysIso(l2FechaEnt, 21),
        fechaSalida: l2FechaSal,
        ...l2Res
      },
      {
        ...l3Cfg,
        fechaIngreso: l3FechaEnt,
        fechaIngresoConAyunoPrevio: addDaysIso(l3FechaEnt, -1),
        fechaPedidoLimite: l3FechaPedidoMax,
        fechaInicioEngorde: addDaysIso(l3FechaEnt, 21),
        fechaSalida: l3FechaSal,
        ...l3Res
      }
    ];

    const consolidado3Lotes = {
      avesInic: l1Res.avesInic + l2Res.avesInic + l3Res.avesInic,
      avesFin: l1Res.avesFin + l2Res.avesFin + l3Res.avesFin,
      pesoVivoTot: l1Res.pesoVivoTot + l2Res.pesoVivoTot + l3Res.pesoVivoTot,
      bultosTot: l1Res.bultosTot + l2Res.bultosTot + l3Res.bultosTot,
      bodegaTot: l1Res.bodegaTot + l2Res.bodegaTot + l3Res.bodegaTot,
      costoPollito: l1Res.costoPollito + l2Res.costoPollito + l3Res.costoPollito,
      costoAlimento: l1Res.costoAlimento + l2Res.costoAlimento + l3Res.costoAlimento,
      costoInsumos: l1Res.costoInsumos + l2Res.costoInsumos + l3Res.costoInsumos,
      costoFijos: l1Res.costoFijos + l2Res.costoFijos + l3Res.costoFijos,
      costoVivoTot: l1Res.costoVivoTot + l2Res.costoVivoTot + l3Res.costoVivoTot,
      costoSacrificio: l1Res.costoSacrificio + l2Res.costoSacrificio + l3Res.costoSacrificio,
      costoComercializacion: l1Res.costoComercializacion + l2Res.costoComercializacion + l3Res.costoComercializacion,
      costoCanalTot: l1Res.costoCanalTot + l2Res.costoCanalTot + l3Res.costoCanalTot,
      kgCanalVend: l1Res.kgCanalVend + l2Res.kgCanalVend + l3Res.kgCanalVend,
      ingresoCanal: l1Res.ingresoCanal + l2Res.ingresoCanal + l3Res.ingresoCanal,
      utilidadCanal: l1Res.utilidadCanal + l2Res.utilidadCanal + l3Res.utilidadCanal
    };
    consolidado3Lotes.costoKgVivo = consolidado3Lotes.pesoVivoTot > 0
      ? consolidado3Lotes.costoVivoTot / consolidado3Lotes.pesoVivoTot : 0;
    consolidado3Lotes.costoKgCanal = consolidado3Lotes.kgCanalVend > 0
      ? consolidado3Lotes.costoCanalTot / consolidado3Lotes.kgCanalVend : 0;
    consolidado3Lotes.margenCanal = consolidado3Lotes.ingresoCanal > 0
      ? consolidado3Lotes.utilidadCanal / consolidado3Lotes.ingresoCanal : 0;

    // 5. Auditoría de Inventario Bodega Lote 1 (Referencia AV-2 + Realidad Física JIT en Granja)
    const bod = state.bodegaInicialLote1;
    const totalInicial54 = bod.masterpollitoBultos + bod.nutrepolloBultos + bod.broilerBultos;
    const costoInicial54 =
      bod.masterpollitoBultos * precios.alimInicBulto +
      bod.nutrepolloBultos * precios.alimPreBulto +
      bod.broilerBultos * precios.alimEngComBulto;

    const bodJit = state.bodegaFisicaJitLote1 || {
      masterpollitoBultos: Number(bod.masterpollitoBultos ?? 3),
      nutrepolloBultos: 0,
      broilerBultos: 0
    };
    const jitMaster = Math.max(0, Number(bodJit.masterpollitoBultos || 0));
    const jitNutre = Math.max(0, Number(bodJit.nutrepolloBultos || 0));
    const jitBroiler = Math.max(0, Number(bodJit.broilerBultos || 0));
    const jitTotal = jitMaster + jitNutre + jitBroiler;
    const jitCostoComprado =
      jitMaster * precios.alimInicBulto +
      jitNutre * precios.alimPreBulto +
      jitBroiler * precios.alimEngComBulto;
    const jitPendMaster = Math.max(0, l1Res.bultosInic - jitMaster);
    const jitPendNutre = Math.max(0, l1Res.bultosPre - jitNutre);
    const jitPendBroiler = Math.max(0, l1Res.bultosEng - jitBroiler);
    const jitPendCosto =
      jitPendMaster * precios.alimInicBulto +
      jitPendNutre * precios.alimPreBulto +
      jitPendBroiler * precios.alimEngComBulto;

    const auditoriaBodegaLote1 = {
      compradoInicial: {
        masterpollito: bod.masterpollitoBultos,
        nutrepollo: bod.nutrepolloBultos,
        broiler: bod.broilerBultos,
        totalBultos: totalInicial54,
        costoCop: costoInicial54
      },
      faltantePpto: {
        masterpollito: l1Res.bultosInic - bod.masterpollitoBultos,
        nutrepollo: l1Res.bultosPre - bod.nutrepolloBultos,
        broiler: l1Res.bultosEng - bod.broilerBultos,
        totalBultos: l1Res.bultosTot - totalInicial54,
        costoAdicionalCop: l1Res.costoAlimento - costoInicial54
      },
      faltanteBodega0Bajas: {
        masterpollito: l1Res.bodegaInic - bod.masterpollitoBultos,
        nutrepollo: l1Res.bodegaPre - bod.nutrepolloBultos,
        broiler: l1Res.bodegaEng - bod.broilerBultos,
        totalBultos: l1Res.bodegaTot - totalInicial54
      },
      fisicaJit: {
        compradoHoy: {
          masterpollito: jitMaster,
          nutrepollo: jitNutre,
          broiler: jitBroiler,
          totalBultos: jitTotal,
          costoCop: jitCostoComprado
        },
        porComprarJit: {
          masterpollito: jitPendMaster,
          nutrepollo: jitPendNutre,
          broiler: jitPendBroiler,
          totalBultos: jitPendMaster + jitPendNutre + jitPendBroiler,
          costoAdicionalCop: jitPendCosto
        }
      },
      tablaSemanal6Sem: CONSUMO_POLLO_6_SEM.map((row) => {
        const gramosTot = row.gramosAveSem * l1Cfg.avesIniciadas;
        return {
          ...row,
          gramosTot,
          bultosExactos: gramosTot / 40000
        };
      })
    };

    // 6. Auditoría de Capacidad y Estrés Térmico en Galpón (Cúcuta)
    const traslapeSimultaneo = l2FechaEnt <= l1FechaSal && l3FechaEnt <= l1FechaSal && l3FechaEnt <= l2FechaSal;
    const picoAvesSimultaneas = traslapeSimultaneo
      ? l1Res.avesInic + l2Res.avesInic + l3Res.avesInic
      : Math.max(l1Res.avesInic, l2Res.avesInic, l3Res.avesInic);

    // Biomasa exacta al día de salida de Lote 1 (24-dic = d42 L1, d32 L2, d20 L3)
    const diaL2AlCierreL1 = Math.max(0, Math.min(49, diffDaysIso(l2FechaEnt, l1FechaSal) + 1));
    const diaL3AlCierreL1 = Math.max(0, Math.min(49, diffDaysIso(l3FechaEnt, l1FechaSal) + 1));
    const pesoL2EnPicoKg = (ROSS_PESO_G[diaL2AlCierreL1] / 1000) * (1 + params.factorClimaCucutaPct);
    const pesoL3EnPicoKg = (ROSS_PESO_G[diaL3AlCierreL1] / 1000) * (1 + params.factorClimaCucutaPct);
    const biomasaPicoKg =
      l1Res.avesFin * l1Res.pesoVivoAveKg +
      l2Res.avesFin * pesoL2EnPicoKg +
      l3Res.avesFin * pesoL3EnPicoKg;

    const areaM2 = Math.max(1, params.areaGalponM2 || 280);
    const areaPorSeccionM2 = areaM2 / 3;
    const biomasaMaxSeccionKg = Math.max(
      l1Res.avesFin * l1Res.pesoVivoAveKg,
      l2Res.avesFin * l2Res.pesoVivoAveKg,
      l3Res.avesFin * l3Res.pesoVivoAveKg
    );
    const densidadPicoKgM2 = biomasaPicoKg / areaM2;
    const densidadPicoSeccionKgM2 = biomasaMaxSeccionKg / Math.max(1, areaPorSeccionM2);
    const densidadCriticaElZuliaKgM2 = Math.max(densidadPicoKgM2, densidadPicoSeccionKgM2);
    const estadoTermico = densidadCriticaElZuliaKgM2 > 24
      ? 'ALERTA EL ZULIA (>24 kg/m² por sección): Exige ventilación forzada, cortinas y cosecha escalonada'
      : (densidadCriticaElZuliaKgM2 > 20
        ? 'PRECAUCIÓN EL ZULIA (20–24 kg/m²): Clima cálido (~220 msnm) requiere ventiladores continuos'
        : 'ÓPTIMO ≤20 kg/m² para clima cálido de Vereda La Alejandra (El Zulia)');

    // 7. Flujo de Caja Semanal Real (3 Lotes Iniciales + Extension Continua Lotes 4, 5, 6...)
    const ajustesVentaMap = state.ajustesVentaLotes || {};
    const cierresComercialesLotes = {
      'lote-1': computeMixedBatchClosure(l1Res, 'lote-1', ajustesVentaMap, precios.precioCanalKg),
      'lote-2': computeMixedBatchClosure(l2Res, 'lote-2', ajustesVentaMap, precios.precioCanalKg),
      'lote-3': computeMixedBatchClosure(l3Res, 'lote-3', ajustesVentaMap, precios.precioCanalKg)
    };

    const rawWeeks = [
      {
        semana: 1,
        etiqueta: 'Sem 1 (30-oct a 06-nov) · Arriendo Mes 1',
        ingresos: 0,
        pollitosInsumos: 0,
        alimento: 0,
        fijosBenef: precios.arriendoIniMes
      },
      {
        semana: 2,
        etiqueta: 'Sem 2 (13-nov) · Ingreso Lote 1 (600 aves @ $4.500)',
        ingresos: 0,
        pollitosInsumos: l1Res.costoPollito + 0.7 * l1Res.costoInsumos,
        alimento: 0.05 * l1Res.costoAlimento,
        fijosBenef: params.equipamientoAdicionalCop || 0
      },
      {
        semana: 3,
        etiqueta: 'Sem 3 (23-nov) · Ingreso Lote 2 (800 aves @ $3.200)',
        ingresos: 0,
        pollitosInsumos: l2Res.costoPollito + 0.7 * l2Res.costoInsumos,
        alimento: 0.15 * l1Res.costoAlimento + 0.05 * l2Res.costoAlimento,
        fijosBenef: 0
      },
      {
        semana: 4,
        etiqueta: 'Sem 4 (30-nov a 05-dic) · Arriendo Mes 2 + Ingreso Lote 3 (800)',
        ingresos: 0,
        pollitosInsumos: l3Res.costoPollito + 0.7 * l3Res.costoInsumos + 0.15 * l1Res.costoInsumos,
        alimento: 0.25 * l1Res.costoAlimento + 0.15 * l2Res.costoAlimento + 0.05 * l3Res.costoAlimento,
        fijosBenef: precios.arriendoIniMes
      },
      {
        semana: 5,
        etiqueta: 'Sem 5 (06-12 dic) · Engorde Lote 1 + Levante Lotes 2 y 3',
        ingresos: 0,
        pollitosInsumos: 0.15 * l2Res.costoInsumos + 0.15 * l3Res.costoInsumos,
        alimento: 0.25 * l1Res.costoAlimento + 0.20 * l2Res.costoAlimento + 0.15 * l3Res.costoAlimento,
        fijosBenef: 0
      },
      {
        semana: 6,
        etiqueta: 'Sem 6 (13-19 dic) · Pico consumo paralelo 3 lotes',
        ingresos: 0,
        pollitosInsumos: 0.15 * l1Res.costoInsumos + 0.15 * l2Res.costoInsumos,
        alimento: 0.20 * l1Res.costoAlimento + 0.25 * l2Res.costoAlimento + 0.20 * l3Res.costoAlimento,
        fijosBenef: 0
      },
      {
        semana: 7,
        etiqueta: 'Sem 7 (20-23 dic) · Víspera cierre Lote 1 (PICO DE CAJA)',
        ingresos: 0,
        pollitosInsumos: 0.15 * l3Res.costoInsumos,
        alimento: 0.10 * l1Res.costoAlimento + 0.20 * l2Res.costoAlimento + 0.25 * l3Res.costoAlimento,
        fijosBenef: 0
      },
      {
        semana: 8,
        etiqueta: cierresComercialesLotes['lote-1'].hasOverride
          ? 'Sem 8 (24-31 dic) · COBRO MIXTO LOTE 1 + Arriendo Mes 3'
          : 'Sem 8 (24-31 dic) · COBRO LOTE 1 (24-dic) + Arriendo Mes 3',
        ingresos: cierresComercialesLotes['lote-1'].ingresoEfectivo,
        pollitosInsumos: 0,
        alimento: 0.15 * l2Res.costoAlimento + 0.20 * l3Res.costoAlimento,
        fijosBenef: precios.arriendoIniMes + l1Res.costoSacrificio + l1Res.costoComercializacion + precios.colaboradorLote
      },
      {
        semana: 9,
        etiqueta: cierresComercialesLotes['lote-2'].hasOverride
          ? 'Sem 9 (01-07 ene) · COBRO MIXTO LOTE 2 (03-ene)'
          : 'Sem 9 (01-07 ene) · COBRO LOTE 2 (03-ene) + Liquidación Lote 2',
        ingresos: cierresComercialesLotes['lote-2'].ingresoEfectivo,
        pollitosInsumos: 0,
        alimento: 0.15 * l3Res.costoAlimento,
        fijosBenef: l2Res.costoSacrificio + l2Res.costoComercializacion + precios.colaboradorLote
      },
      {
        semana: 10,
        etiqueta: cierresComercialesLotes['lote-3'].hasOverride
          ? 'Sem 10 (08-15 ene) · COBRO MIXTO LOTE 3 (15-ene)'
          : 'Sem 10 (08-15 ene) · COBRO LOTE 3 (15-ene) + Liquidación Lote 3',
        ingresos: cierresComercialesLotes['lote-3'].ingresoEfectivo,
        pollitosInsumos: 0,
        alimento: 0,
        fijosBenef: l3Res.costoSacrificio + l3Res.costoComercializacion + precios.colaboradorLote
      },
      {
        semana: 11,
        etiqueta: 'Sem 11 (30-ene) · Pago Mes 4 Contrato Arriendo ($750k cierre 4m)',
        ingresos: 0,
        pollitosInsumos: 0,
        alimento: 0,
        fijosBenef: precios.arriendoIniMes
      }
    ];

    let saldoAcum = 0;
    const flujoCajaSemanal = rawWeeks.map((w) => {
      const flujoNeto = w.ingresos - (w.pollitosInsumos + w.alimento + w.fijosBenef);
      saldoAcum += flujoNeto;
      return { ...w, flujoNeto, saldoAcumulado: saldoAcum };
    });

    const minSaldo = Math.min(...flujoCajaSemanal.map((w) => w.saldoAcumulado));
    const capitalTrabajoPicoSem7 = minSaldo < 0 ? Math.abs(minSaldo) : 0;
    const saldoFinalPost4m = flujoCajaSemanal[flujoCajaSemanal.length - 1].saldoAcumulado;

    // 7B. Flujo de Caja Continuo Post-Lote 3 (Lote 4, 5, 6... de 900 pollos cada 15-20 días)
    const rawContCfg = state.continuoConfig || {};
    const contAves = Math.max(100, Math.min(3000, Math.round(Number(rawContCfg.avesPorLote) || 900)));
    const contCadencia = Math.max(12, Math.min(35, Math.round(Number(rawContCfg.cadenciaDias) || 18)));
    const contLotesN = Math.max(1, Math.min(6, Math.round(Number(rawContCfg.lotesAdicionales) || 3)));
    const contEdad = clampEdad(rawContCfg.edadObjetivoDias || params.edadObjetivoGlobal);
    const usaPropioCont = String(l3Cfg.programaAlimento || '').toLowerCase().includes('propio');

    const loteModelo900 = computeSingleLot({
      avesInic: contAves,
      edad: contEdad,
      mortalidadPct: params.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: usaPropioCont,
      mesesArriendo: 0,
      canonMensualArriendo: 0,
      precios,
      params
    });

    const contTimeline = liteCompare ? { lotesProyectados: [], flujoCajaContinuoSemanal: [], saldoFinalContinuo: 0, semanasTotales: 11 } : buildContinuousProjectionTimeline({
      rawWeeks,
      l3FechaEnt,
      loteModelo: loteModelo900,
      contAves,
      contCadencia,
      contEdad,
      precios,
      lotesCount: contLotesN,
      horizonWeeks: 18,
      clipAtHorizon: false
    });

    const continuoResumen = {
      config: {
        habilitado: rawContCfg.habilitado !== false,
        avesPorLote: contAves,
        cadenciaDias: contCadencia,
        lotesAdicionales: contLotesN,
        edadObjetivoDias: contEdad
      },
      loteModelo: loteModelo900,
      ...contTimeline
    };

    // 8. Puente Alimento Propio (AV-2 Hoja 3)
    const precioComercialKg = precios.alimEngComBulto / 40;
    const plantaHarinaKg = precios.alimEngPropioBulto / 40;
    const fletePigmentoKg = precios.fletePigmentoBulto / 40;
    const harinaEnGalponKg = plantaHarinaKg + fletePigmentoKg;
    const harinaEfectivaKg = harinaEnGalponKg * (1 + precios.extraHarinaPct);
    const ahorroNetoPropioPct = precioComercialKg > 0 ? 1 - harinaEfectivaKg / precioComercialKg : 0;
    const ahorroPorBultoEquivCop = (precioComercialKg - harinaEfectivaKg) * 40;
    const bultosSustituidosLote1 = Math.round((params.pctEnsayoAlimentoPropioLote1 || 0) * l1Res.bultosEng);

    // 9. Alertas Activas Inteligentes (Triada BE-2 / BE-3)
    const alertas = [];
    const jitPlan = auditoriaBodegaLote1.fisicaJit;
    if (jitPlan.porComprarJit.nutrepollo > 0) {
      alertas.push({
        nivel: 'alta',
        codigo: 'DEFICIT_NUTREPOLLO',
        titulo: `Plan JIT Nutrepollo Cr SP: ${jitPlan.porComprarJit.nutrepollo} bultos para Sem 2–3`,
        detalle: `Sem 2–3 (desde Día 8) requieren ${l1Res.bultosPre} bultos; hay ${jitPlan.compradoHoy.nutrepollo} en granja y ${jitPlan.porComprarJit.nutrepollo} por pedir escalonados (+$${(jitPlan.porComprarJit.nutrepollo * precios.alimPreBulto).toLocaleString('es-CO')} COP).`
      });
    }
    if (jitPlan.porComprarJit.broiler > 0) {
      alertas.push({
        nivel: 'media',
        codigo: 'DEFICIT_BROILER',
        titulo: `Plan JIT Broiler I Dorado: ${jitPlan.porComprarJit.broiler} bultos desde Sem 4`,
        detalle: `Engorde d22–d${l1Edad} requiere ${l1Res.bultosEng} bultos; hay ${jitPlan.compradoHoy.broiler} en bodega para evitar inmovilizar capital antes de tiempo.`
      });
    }
    if (densidadCriticaElZuliaKgM2 > 20) {
      alertas.push({
        nivel: densidadCriticaElZuliaKgM2 > 24 ? 'critica' : 'media',
        codigo: 'DENSIDAD_TERMICA_CUCUTA',
        titulo: estadoTermico,
        detalle: `Global simultáneo: ${densidadPicoKgM2.toFixed(1)} kg/m² (${areaM2} m²). Máx. por sección (${areaPorSeccionM2.toFixed(1)} m²): ${densidadPicoSeccionKgM2.toFixed(1)} kg/m² (${biomasaMaxSeccionKg.toFixed(0)} kg en salida 800 aves).`
      });
    }
    if (l1Res.pesoCanalAveKg < params.pesoComercialMetaKg) {
      alertas.push({
        nivel: 'info',
        codigo: 'PESO_42D_VS_270KG',
        titulo: `Meta ${l1Edad}d entrega ${l1Res.pesoCanalAveKg.toFixed(2)} kg canal c/menudencias`,
        detalle: `Para entregar >=${params.pesoComercialMetaKg.toFixed(2)} kg con menudencias se requieren ~45 días (~${(ROSS_PESO_G[45] / 1000 * params.rendimientoCanalConMenudPct).toFixed(2)} kg).`
      });
    }

    // 9B. Transporte & Kilometraje AV-2 (RFC-0001)
    const desposteCfg = Object.assign({
      valorKmEstimadoCop: 1200,
      pechugaPct: 0.34,
      precioPechugaKg: 14800,
      pernilMusloPct: 0.31,
      precioPernilMusloKg: 12500,
      alasPct: 0.11,
      precioAlasKg: 13500,
      menudenciasPct: 0.08,
      precioMenudenciasKg: 6000,
      espinazoSubproductoPct: 0.16,
      precioEspinazoKg: 4500,
      costoDesposteKg: 0
    }, state.desposteConfig || {});

    const viajes = (Array.isArray(state.viajesTransporte) ? state.viajesTransporte : []).map((v, idx) => {
      const kmInicial = Number.isFinite(Number(v.odometroInicial)) && v.odometroInicial !== null
        ? Number(v.odometroInicial) : null;
      const kmFinal = Number.isFinite(Number(v.odometroFinal)) && v.odometroFinal !== null
        ? Number(v.odometroFinal) : null;
      const kmRecorridos = kmInicial !== null && kmFinal !== null && kmFinal >= kmInicial
        ? kmFinal - kmInicial
        : (Number(v.kmEstimado) || 0);
      const estado = v.estado || (kmFinal !== null ? 'cerrado' : 'en_curso');
      const combustibleCop = Number(v.combustibleCop || 0);
      const peajesCop = Number(v.peajesCop || 0);
      const otrosGastosCop = Number(v.otrosGastosCop || 0);
      const costoManualCop = Number(v.costoManualCop || 0);
      const tarifaKmCop = Number(v.tarifaKmCop) || desposteCfg.valorKmEstimadoCop;
      const costoRealCop = costoManualCop > 0 ? costoManualCop : (combustibleCop + peajesCop + otrosGastosCop);
      const costoEstimadoCop = Math.round(kmRecorridos * tarifaKmCop);
      const costoAplicadoCop = costoRealCop > 0 ? costoRealCop : costoEstimadoCop;
      return {
        id: v.id || `viaje-${idx + 1}`,
        fecha: v.fecha || todayIso(),
        loteId: v.loteId || 'lote-1',
        diaCiclo: v.diaCiclo ?? null,
        motivo: v.motivo || 'Desplazamiento operativo granja',
        odometroInicial: kmInicial,
        odometroFinal: kmFinal,
        kmEstimado: Number(v.kmEstimado) || 0,
        kmRecorridos,
        estado,
        combustibleCop,
        peajesCop,
        otrosGastosCop,
        tarifaKmCop,
        costoRealCop,
        costoEstimadoCop,
        costoAplicadoCop,
        observacion: v.observacion || ''
      };
    });

    const viajesEnCurso = viajes.filter((v) => v.estado === 'en_curso').length;
    const kmTotales = viajes.reduce((acc, v) => acc + v.kmRecorridos, 0);
    const costoTransporteTotalCop = viajes.reduce((acc, v) => acc + v.costoAplicadoCop, 0);
    const costoTransporteLote1Cop = viajes
      .filter((v) => !v.loteId || v.loteId === 'lote-1')
      .reduce((acc, v) => acc + v.costoAplicadoCop, 0);
    const costoTransportePorKgCanalCop = consolidado3Lotes.kgCanalVend > 0
      ? costoTransporteTotalCop / consolidado3Lotes.kgCanalVend
      : 0;

    // 9C. Ventas Parciales & Desposte AV-2 (RFC-0002)
    const ventas = (Array.isArray(state.ventasParciales) ? state.ventasParciales : []).map((s, idx) => {
      const modalidad = String(s.modalidad || 'canal').toLowerCase();
      const cantidadAves = Number(s.cantidadAves || 0);
      const pesoPromedioUnit = modalidad === 'en_pie' ? l1Res.pesoVivoAveKg : l1Res.pesoCanalAveKg;
      const pesoKg = Number(s.pesoKg) > 0
        ? Number(s.pesoKg)
        : (cantidadAves > 0 ? cantidadAves * pesoPromedioUnit : 0);
      const defaultPrecioKg = modalidad === 'en_pie'
        ? precios.precioVivoKg
        : (modalidad === 'piezas' ? desposteCfg.precioPechugaKg : precios.precioCanalKg);
      const precioUnitarioKgCop = Number(s.precioUnitarioKgCop) > 0 ? Number(s.precioUnitarioKgCop) : defaultPrecioKg;
      const ingresoTotalCop = Number(s.ingresoTotalCop) > 0
        ? Number(s.ingresoTotalCop)
        : Math.round(pesoKg * precioUnitarioKgCop);
      const costoUnitarioBaseKg = modalidad === 'en_pie' ? l1Res.costoKgVivo : l1Res.costoKgCanal;
      const costoProrrateadoCop = Math.round(pesoKg * costoUnitarioBaseKg);
      const margenBrutoCop = ingresoTotalCop - costoProrrateadoCop;
      const margenPct = ingresoTotalCop > 0 ? margenBrutoCop / ingresoTotalCop : 0;
      return {
        id: s.id || `venta-${idx + 1}`,
        fecha: s.fecha || todayIso(),
        loteId: s.loteId || 'lote-1',
        cliente: s.cliente || 'Cliente Directo Cúcuta',
        modalidad,
        corteDetalle: s.corteDetalle || (modalidad === 'piezas' ? 'Desposte mixto' : modalidad === 'en_pie' ? 'Pollo en pie' : 'Canal con menudencias'),
        cantidadAves,
        pesoKg,
        precioUnitarioKgCop,
        ingresoTotalCop,
        costoProrrateadoCop,
        margenBrutoCop,
        margenPct,
        estadoPago: s.estadoPago || 'contado',
        observacion: s.observacion || ''
      };
    });

    const totalAvesVendidas = ventas.reduce((acc, s) => acc + s.cantidadAves, 0);
    const totalKgVendidos = ventas.reduce((acc, s) => acc + s.pesoKg, 0);
    const totalIngresosParcialesCop = ventas.reduce((acc, s) => acc + s.ingresoTotalCop, 0);
    const totalCostoProrrateadoCop = ventas.reduce((acc, s) => acc + s.costoProrrateadoCop, 0);
    const totalMargenParcialCop = totalIngresosParcialesCop - totalCostoProrrateadoCop;

    const precioPonderadoDesposteKg =
      desposteCfg.pechugaPct * desposteCfg.precioPechugaKg +
      desposteCfg.pernilMusloPct * desposteCfg.precioPernilMusloKg +
      desposteCfg.alasPct * desposteCfg.precioAlasKg +
      desposteCfg.menudenciasPct * desposteCfg.precioMenudenciasKg +
      desposteCfg.espinazoSubproductoPct * desposteCfg.precioEspinazoKg;
    const ingresoPiezas100 = l1Res.kgCanalVend * precioPonderadoDesposteKg;
    const costoDesposteAdicCop = (Number(desposteCfg.costoDesposteKg) || 0) * l1Res.kgCanalVend;
    const utilidadPiezas100 = ingresoPiezas100 - l1Res.costoCanalTot - costoDesposteAdicCop;

    const comparativaModalidadesLote1 = {
      enPie100: {
        modalidad: '100% En Pie',
        kgVendibles: l1Res.pesoVivoTot,
        precioKgCop: precios.precioVivoKg,
        ingresoCop: l1Res.ingresoVivo,
        costoCop: l1Res.costoVivoTot,
        utilidadCop: l1Res.utilidadVivo,
        margenPct: l1Res.ingresoVivo > 0 ? l1Res.utilidadVivo / l1Res.ingresoVivo : 0
      },
      canal100: {
        modalidad: '100% Canal Entero',
        kgVendibles: l1Res.kgCanalVend,
        precioKgCop: precios.precioCanalKg,
        ingresoCop: l1Res.ingresoCanal,
        costoCop: l1Res.costoCanalTot,
        utilidadCop: l1Res.utilidadCanal,
        margenPct: l1Res.margenCanal
      },
      piezas100: {
        modalidad: '100% Presas / Desposte',
        kgVendibles: l1Res.kgCanalVend,
        precioKgCop: precioPonderadoDesposteKg,
        ingresoCop: ingresoPiezas100,
        costoCop: l1Res.costoCanalTot + costoDesposteAdicCop,
        utilidadCop: utilidadPiezas100,
        extraVsCanalCop: utilidadPiezas100 - l1Res.utilidadCanal,
        margenPct: ingresoPiezas100 > 0 ? utilidadPiezas100 / ingresoPiezas100 : 0
      }
    };

    const densidadAvesM2Seccion = areaPorSeccionM2 > 0
      ? Math.max(l1Res.avesInic, l2Res.avesInic, l3Res.avesInic) / areaPorSeccionM2
      : 0;
    const vacioSanitarioActualDias = (3 * contCadencia) - contEdad;
    const gmdMetaRoss42dG = (ROSS_PESO_G[l1Edad] - ROSS_PESO_G[0]) / Math.max(1, l1Edad);
    const picoCapitalContinuoSem7 = Number(contTimeline.capitalTrabajoPicoContinuo || capitalTrabajoPicoSem7);
    const costoAlim3 = l1Res.costoAlimento + l2Res.costoAlimento + l3Res.costoAlimento;
    const costoPollito3 = l1Res.costoPollito + l2Res.costoPollito + l3Res.costoPollito;
    const costoInsumos3 = l1Res.costoInsumos + l2Res.costoInsumos + l3Res.costoInsumos;
    const costoArriendo3 = l1Res.costoArriendo + l2Res.costoArriendo + l3Res.costoArriendo;
    const costoColab3 = l1Res.costoColaborador + l2Res.costoColaborador + l3Res.costoColaborador;
    const breakEvenCaja3LotesSem = (() => {
      for (let i = 0; i < flujoCajaSemanal.length; i++) {
        if (flujoCajaSemanal.slice(i).every((w) => w.saldoAcumulado >= 0)) return flujoCajaSemanal[i].semana;
      }
      return 10;
    })();
    const kpiIndustriales = liteCompare ? null : {
      alimentoPctSobreCostoVivo3Lotes: consolidado3Lotes.costoVivoTot > 0 ? costoAlim3 / consolidado3Lotes.costoVivoTot : 0,
      alimentoPctSobreCostoCanal3Lotes: consolidado3Lotes.costoCanalTot > 0 ? costoAlim3 / consolidado3Lotes.costoCanalTot : 0,
      mofc3LotesCop: consolidado3Lotes.ingresoCanal - costoAlim3,
      mofc3LotesPct: consolidado3Lotes.ingresoCanal > 0 ? (consolidado3Lotes.ingresoCanal - costoAlim3) / consolidado3Lotes.ingresoCanal : 0,
      costoKgVivo3Lotes: consolidado3Lotes.pesoVivoTot > 0 ? consolidado3Lotes.costoVivoTot / consolidado3Lotes.pesoVivoTot : 0,
      costoKgCanal3Lotes: consolidado3Lotes.kgCanalVend > 0 ? consolidado3Lotes.costoCanalTot / consolidado3Lotes.kgCanalVend : 0,
      margenBruto3LotesPct: consolidado3Lotes.ingresoCanal > 0
        ? (consolidado3Lotes.ingresoCanal - (costoPollito3 + costoAlim3 + costoInsumos3 + consolidado3Lotes.costoSacrificio)) / consolidado3Lotes.ingresoCanal
        : 0,
      utilidadPorAveFinLote1: l1Res.avesFin > 0 ? l1Res.utilidadCanal / l1Res.avesFin : 0,
      utilidadPorAveFin3Lotes: consolidado3Lotes.avesFin > 0 ? consolidado3Lotes.utilidadCanal / consolidado3Lotes.avesFin : 0,
      utilidadPorAveCont900: loteModelo900.avesFin > 0 ? loteModelo900.utilidadCanal / loteModelo900.avesFin : 0,
      precioIndiferenciaCanalVsVivo: l1Res.precioIndiferenciaCanal,
      puntoEquilibrioKgCanal3Lotes: consolidado3Lotes.kgCanalVend > 0 ? consolidado3Lotes.costoCanalTot / consolidado3Lotes.kgCanalVend : 0,
      puntoEquilibrioMensualAvesFijos: loteModelo900.margenContribPorAve > 0
        ? Math.ceil((precios.arriendoRegMes + (precios.colaboradorLote * (30 / contCadencia))) / loteModelo900.margenContribPorAve)
        : 0,
      picoCapitalSolo3LotesSem7: capitalTrabajoPicoSem7,
      picoCapitalContinuoSem7,
      roiSobrePico3LotesPct: capitalTrabajoPicoSem7 > 0 ? saldoFinalPost4m / capitalTrabajoPicoSem7 : 0,
      roiSobrePicoContinuoSem18Pct: Math.abs(picoCapitalContinuoSem7) > 0 ? Number(contTimeline.saldoFinalContinuo || 0) / Math.abs(picoCapitalContinuoSem7) : 0,
      breakEvenCaja3LotesSem,
      breakEvenCajaContinuoSem: contTimeline.semanaPuntoEquilibrioCajaDefinitivo || 12,
      densidadAvesM2Seccion,
      vacioSanitarioActualDias,
      gmdMetaRoss42dG,
      prorrateoKgCanalLote1: l1Res.prorrateoKgCanal,
      prorrateoKgCanal3Lotes: consolidado3Lotes.kgCanalVend > 0 ? {
        alimento: Math.round(costoAlim3 / consolidado3Lotes.kgCanalVend),
        pollito: Math.round(costoPollito3 / consolidado3Lotes.kgCanalVend),
        insumos: Math.round(costoInsumos3 / consolidado3Lotes.kgCanalVend),
        sacrificio: Math.round(consolidado3Lotes.costoSacrificio / consolidado3Lotes.kgCanalVend),
        arriendo: Math.round(costoArriendo3 / consolidado3Lotes.kgCanalVend),
        manoObra: Math.round(costoColab3 / consolidado3Lotes.kgCanalVend)
      } : l1Res.prorrateoKgCanal
    };

    const identidadAgente = Object.assign({
      nombre: 'Avi',
      rol: 'Copiloto Operativo y Financiero Avícola',
      estilo: 'Directo, cálido, 100% en pesos colombianos (COP) y enfocado en granja real AV-2'
    }, state.identidadAgente || {});

    const baseComputed = {
      meta: {
        updatedAt: state.updatedAt,
        edadObjetivoGlobal: edadAV1,
        pesoMetaComercialKg: params.pesoComercialMetaKg,
        identidadAgente
      },
      identidadAgente,
      av1: {
        comercial800: av1Comercial800,
        propio800: av1Propio800,
        ahorroPropioVsComercialCop: av1Propio800.utilidadCanal - av1Comercial800.utilidadCanal,
        refLote1_600: av1RefLote1,
        anual12Meses: {
          camadas: camadasAnuales,
          consolidado: {
            ...sumAnual,
            costoKgVivo: sumAnual.pesoVivoTot > 0 ? sumAnual.costoVivoTot / sumAnual.pesoVivoTot : 0,
            costoKgCanal: costoKgCanalAnual,
            margenAnual,
            capitalPicoRotativo: capitalPicoAnual,
            roiAnualSobrePico
          }
        }
      },
      av2: {
        lotes: lotesDetallados,
        consolidado3Lotes,
        auditoriaBodegaLote1,
        capacidadTermica: {
          areaGalponM2: areaM2,
          areaPorSeccionM2,
          traslapeSimultaneo,
          picoAvesSimultaneas,
          biomasaPicoKg,
          biomasaMaxSeccionKg,
          densidadPicoKgM2,
          densidadPicoSeccionKgM2,
          densidadCriticaElZuliaKgM2,
          densidadAvesM2Seccion,
          vacioSanitarioActualDias,
          estadoTermico
        },
        kpiIndustriales,
        flujoCajaSemanal,
        cierresComercialesLotes,
        continuoResumen,
        tesoreriaResumen: {
          capitalTrabajoPicoSem7,
          saldoFinalPost4m,
          mes4ArriendoNoCubiertoPorLotes: precios.arriendoIniMes
        },
        puenteAlimentoPropio: {
          precioComercialKg,
          plantaHarinaKg,
          fletePigmentoKg,
          harinaEnGalponKg,
          harinaEfectivaKg,
          ahorroNetoPropioPct,
          ahorroPorBultoEquivCop,
          bultosSustituidosLote1,
          ahorroEnsayoLote1Cop: bultosSustituidosLote1 * ahorroPorBultoEquivCop
        },
        bitacora,
        transporte: {
          viajes,
          viajesEnCurso,
          kmTotales,
          costoTransporteTotalCop,
          costoTransporteLote1Cop,
          costoTransporteLote1PorKgCanalCop: l1Res.kgCanalVend > 0 ? costoTransporteLote1Cop / l1Res.kgCanalVend : 0,
          costoTransportePorKgCanalCop,
          utilidadLote1PostTransporteCop: l1Res.utilidadCanal - costoTransporteLote1Cop
        },
        ventasParcialesResumen: {
          desposteConfig: desposteCfg,
          ventas,
          totalAvesVendidas,
          totalKgVendidos,
          totalIngresosCop: totalIngresosParcialesCop,
          totalCostoProrrateadoCop,
          totalMargenCop: totalMargenParcialCop,
          comparativaModalidadesLote1
        }
      },
      alertas
    };

    if (!liteCompare) {
      baseComputed.av2.scorecardBsc = computeFarmScorecardKPIs(state, baseComputed);
      baseComputed.av2.restriccionTocActiva = computeActiveSystemConstraint(state, baseComputed);
      baseComputed.av2.gobiernoEjecutivo = computeExecutiveGovernance(state, baseComputed);
    }
    return baseComputed;
  }

  /**
   * Simulador What-If instantáneo (<1 ms) incluyendo comparativa 42d vs 45d vs 48d.
   */
  function simulateWhatIf(baseState, overrides = {}) {
    const next = deepClone(baseState || createDefaultTwinState());
    if (overrides.preciosRegionales) {
      Object.assign(next.preciosRegionales, overrides.preciosRegionales);
    }
    if (overrides.parametrosGenerales) {
      Object.assign(next.parametrosGenerales, overrides.parametrosGenerales);
    }
    if (overrides.edadGlobal !== undefined) {
      const e = clampEdad(overrides.edadGlobal);
      next.parametrosGenerales.edadObjetivoGlobal = e;
      next.lotes.forEach((l) => { l.edadObjetivoDias = e; });
    }
    if (overrides.mortalidadPct !== undefined) {
      const m = Math.max(0, Math.min(0.25, Number(overrides.mortalidadPct)));
      next.parametrosGenerales.mortalidadEsperadaPct = m;
      next.lotes.forEach((l) => { l.mortalidadEsperadaPct = m; });
    }
    if (overrides.programaAlimentoLotes23) {
      next.lotes[1].programaAlimento = overrides.programaAlimentoLotes23;
      next.lotes[2].programaAlimento = overrides.programaAlimentoLotes23;
    }

    const simulated = computeFullTwin(next);

    const compareAges = [42, 45, 48].map((edad) => {
      const tmp = deepClone(next);
      tmp.parametrosGenerales.edadObjetivoGlobal = edad;
      tmp.lotes.forEach((l) => { l.edadObjetivoDias = edad; });
      const res = computeFullTwin(tmp, { liteCompare: true });
      return {
        edadDias: edad,
        pesoVivoRossKg: ROSS_PESO_G[edad] / 1000,
        consAcumKg: ROSS_CONS_ACUM_G[edad] / 1000,
        fcrTeorico: ROSS_PESO_G[edad] > 0 ? ROSS_CONS_ACUM_G[edad] / ROSS_PESO_G[edad] : 0,
        pesoCanalConMenudKg: res.av1.comercial800.pesoCanalAveKg,
        pesoEvisceradoSecoKg: (ROSS_PESO_G[edad] / 1000) * getRendimientoSecoRoss(ROSS_PESO_G[edad] / 1000),
        bultosLote800Comercial: res.av1.comercial800.bultosTot,
        costoKgCanal800: res.av1.comercial800.costoKgCanal,
        utilidad800: res.av1.comercial800.utilidadCanal,
        utilidadConsolidada3Lotes: res.av2.consolidado3Lotes.utilidadCanal,
        capitalPicoSem7: res.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
        biomasaPicoKg: res.av2.capacidadTermica.biomasaPicoKg
      };
    });

    return {
      state: next,
      computed: simulated,
      comparativaEdades: compareAges
    };
  }

  /**
   * Event Sourcing determinista: aplica eventos operativos y mutaciones al estado vivo.
   */
  function applyOperationalEvent(currentState, event) {
    const next = deepClone(currentState || createDefaultTwinState());
    const evt = event || {};
    const payload = evt.payload || {};

    switch (evt.type) {
      case 'DAILY_LOG': {
        const dia = Math.max(1, Math.min(49, Math.round(Number(payload.dia || 1))));
        const row = next.bitacoraDiariaLote1[dia - 1];
        if (payload.mortalidad !== undefined) row.mortalidad = payload.mortalidad === null ? null : Number(payload.mortalidad);
        if (payload.descarte !== undefined) row.descarte = payload.descarte === null ? null : Number(payload.descarte);
        if (payload.alimRealKg !== undefined) row.alimRealKg = payload.alimRealKg === null ? null : Number(payload.alimRealKg);
        if (payload.tempC !== undefined) row.tempC = payload.tempC === null ? null : Number(payload.tempC);
        if (payload.aguaL !== undefined) row.aguaL = payload.aguaL === null ? null : Number(payload.aguaL);
        if (payload.observacion !== undefined) row.observacion = String(payload.observacion);
        break;
      }
      case 'SAMPLE_WEIGHING': {
        const dia = Math.round(Number(payload.dia || 7));
        let item = next.pesajesSemanalesLote1.find((p) => p.dia === dia);
        if (!item) {
          item = { dia, muestraAves: 30, pesoMuestraKg: null };
          next.pesajesSemanalesLote1.push(item);
        }
        const mAves = payload.muestraAves ?? payload.avesMuestra;
        const mKg = payload.pesoMuestraKg ?? payload.pesoTotalKg;
        if (mAves !== undefined) item.muestraAves = Number(mAves);
        if (mKg !== undefined) item.pesoMuestraKg = Number(mKg);
        break;
      }
      case 'FEED_PURCHASE': {
        const fase = String(payload.fase || '').toLowerCase();
        const bultos = Number(payload.bultos || 0);
        if (!next.bodegaFisicaJitLote1) {
          next.bodegaFisicaJitLote1 = {
            masterpollitoBultos: Number(next.bodegaInicialLote1?.masterpollitoBultos ?? 3),
            nutrepolloBultos: 0,
            broilerBultos: 0
          };
        }
        if (fase.includes('master') || fase.includes('preinic')) {
          next.bodegaInicialLote1.masterpollitoBultos += bultos;
          next.bodegaFisicaJitLote1.masterpollitoBultos = Math.max(0, Number(next.bodegaFisicaJitLote1.masterpollitoBultos || 0) + bultos);
        } else if (fase.includes('nutre') || (fase.includes('inic') && !fase.includes('preinic'))) {
          next.bodegaInicialLote1.nutrepolloBultos += bultos;
          next.bodegaFisicaJitLote1.nutrepolloBultos = Math.max(0, Number(next.bodegaFisicaJitLote1.nutrepolloBultos || 0) + bultos);
        } else if (fase.includes('broiler') || fase.includes('eng')) {
          next.bodegaInicialLote1.broilerBultos += bultos;
          next.bodegaFisicaJitLote1.broilerBultos = Math.max(0, Number(next.bodegaFisicaJitLote1.broilerBultos || 0) + bultos);
        }
        if (Number.isFinite(payload.precioBulto) && payload.precioBulto > 0) {
          if (fase.includes('master') || fase.includes('preinic')) next.preciosRegionales.alimInicBulto = payload.precioBulto;
          else if (fase.includes('nutre') || (fase.includes('inic') && !fase.includes('preinic'))) next.preciosRegionales.alimPreBulto = payload.precioBulto;
          else if (fase.includes('broiler') || fase.includes('eng')) next.preciosRegionales.alimEngComBulto = payload.precioBulto;
        }
        break;
      }
      case 'PARAM_UPDATE': {
        if (payload.preciosRegionales) Object.assign(next.preciosRegionales, payload.preciosRegionales);
        if (payload.parametrosGenerales) Object.assign(next.parametrosGenerales, payload.parametrosGenerales);
        if (payload.bodegaFisicaJitLote1) {
          normalizeStateDefaults(next);
          Object.assign(next.bodegaFisicaJitLote1, payload.bodegaFisicaJitLote1);
        }
        if (payload.lotes && Array.isArray(payload.lotes)) {
          payload.lotes.forEach((patch) => {
            const target = next.lotes.find((l) => l.id === patch.id);
            if (target) Object.assign(target, patch);
          });
        }
        break;
      }
      case 'HARVEST_LIQUIDATION': {
        Object.assign(next.liquidacionPlantaLote1, payload);
        break;
      }
      case 'TRIP_LOG': {
        if (!Array.isArray(next.viajesTransporte)) next.viajesTransporte = [];
        const action = String(payload.action || '').toLowerCase();
        const loteId = payload.loteId || 'lote-1';
        let target = null;
        if (payload.id) {
          target = next.viajesTransporte.find((v) => v.id === payload.id);
        } else if (action === 'close' || payload.odometroFinal != null) {
          target = [...next.viajesTransporte].reverse().find((v) => v.estado === 'en_curso' && (!payload.loteId || v.loteId === loteId));
        }
        if (!target) {
          target = {
            id: payload.id || `viaje-${next.viajesTransporte.length + 1}`,
            fecha: payload.fecha || todayIso(),
            loteId,
            diaCiclo: payload.diaCiclo ?? null,
            motivo: payload.motivo || 'Desplazamiento a granja',
            odometroInicial: payload.odometroInicial != null ? Number(payload.odometroInicial) : null,
            odometroFinal: payload.odometroFinal != null ? Number(payload.odometroFinal) : null,
            kmEstimado: payload.kmEstimado != null ? Number(payload.kmEstimado) : 0,
            combustibleCop: Number(payload.combustibleCop || 0),
            peajesCop: Number(payload.peajesCop || 0),
            otrosGastosCop: Number(payload.otrosGastosCop || 0),
            tarifaKmCop: payload.tarifaKmCop != null ? Number(payload.tarifaKmCop) : undefined,
            costoManualCop: payload.costoManualCop != null ? Number(payload.costoManualCop) : 0,
            estado: payload.odometroFinal != null ? 'cerrado' : (payload.estado || 'en_curso'),
            observacion: payload.observacion || ''
          };
          next.viajesTransporte.push(target);
        } else {
          if (payload.fecha !== undefined) target.fecha = payload.fecha;
          if (payload.loteId !== undefined) target.loteId = payload.loteId;
          if (payload.diaCiclo !== undefined) target.diaCiclo = payload.diaCiclo;
          if (payload.motivo !== undefined) target.motivo = payload.motivo;
          if (payload.odometroInicial !== undefined && payload.odometroInicial !== null) target.odometroInicial = Number(payload.odometroInicial);
          if (payload.odometroFinal !== undefined && payload.odometroFinal !== null) target.odometroFinal = Number(payload.odometroFinal);
          if (payload.kmEstimado !== undefined) target.kmEstimado = Number(payload.kmEstimado);
          if (payload.combustibleCop !== undefined) target.combustibleCop = Number(payload.combustibleCop);
          if (payload.peajesCop !== undefined) target.peajesCop = Number(payload.peajesCop);
          if (payload.otrosGastosCop !== undefined) target.otrosGastosCop = Number(payload.otrosGastosCop);
          if (payload.tarifaKmCop !== undefined) target.tarifaKmCop = Number(payload.tarifaKmCop);
          if (payload.costoManualCop !== undefined) target.costoManualCop = Number(payload.costoManualCop);
          if (payload.observacion !== undefined) target.observacion = payload.observacion;
          target.estado = payload.estado || (target.odometroFinal != null ? 'cerrado' : 'en_curso');
        }
        break;
      }
      case 'PARTIAL_SALE': {
        if (!Array.isArray(next.ventasParciales)) next.ventasParciales = [];
        if (payload.desposteConfig && typeof payload.desposteConfig === 'object') {
          next.desposteConfig = Object.assign({
            valorKmEstimadoCop: 1200,
            pechugaPct: 0.34,
            precioPechugaKg: 14800,
            pernilMusloPct: 0.31,
            precioPernilMusloKg: 12500,
            alasPct: 0.11,
            precioAlasKg: 13500,
            menudenciasPct: 0.08,
            precioMenudenciasKg: 6000,
            espinazoSubproductoPct: 0.16,
            precioEspinazoKg: 4500,
            costoDesposteKg: 0
          }, next.desposteConfig || {}, payload.desposteConfig);
        }
        if (payload.modalidad || payload.pesoKg || payload.cantidadAves || payload.cliente || payload.ingresoTotalCop) {
          next.ventasParciales.push({
            id: payload.id || `venta-${next.ventasParciales.length + 1}`,
            fecha: payload.fecha || todayIso(),
            loteId: payload.loteId || 'lote-1',
            cliente: payload.cliente || 'Cliente Directo Cúcuta',
            modalidad: String(payload.modalidad || 'canal').toLowerCase(),
            corteDetalle: payload.corteDetalle || '',
            cantidadAves: Number(payload.cantidadAves || 0),
            pesoKg: Number(payload.pesoKg || 0),
            precioUnitarioKgCop: payload.precioUnitarioKgCop != null ? Number(payload.precioUnitarioKgCop) : null,
            ingresoTotalCop: payload.ingresoTotalCop != null ? Number(payload.ingresoTotalCop) : null,
            estadoPago: payload.estadoPago || 'contado',
            observacion: payload.observacion || ''
          });
        }
        break;
      }
      case 'AGENT_IDENTITY_UPDATE': {
        next.identidadAgente = Object.assign({
          nombre: 'Avi',
          rol: 'Copiloto Operativo y Financiero Avícola',
          estilo: 'Directo, cálido, 100% en pesos colombianos (COP) y enfocado en granja real'
        }, next.identidadAgente || {}, payload || {});
        break;
      }
      case 'LOTE_MIXED_SALE_CONFIG': {
        const loteId = payload.loteId || 'lote-1';
        if (!next.ajustesVentaLotes || typeof next.ajustesVentaLotes !== 'object') {
          next.ajustesVentaLotes = {};
        }
        const prev = next.ajustesVentaLotes[loteId] || {
          tramoEspecialAves: 0,
          precioTramoEspecialKg: 13000,
          precioRestoKg: null,
          notas: ''
        };
        next.ajustesVentaLotes[loteId] = {
          tramoEspecialAves: payload.tramoEspecialAves !== undefined ? Math.max(0, Math.round(Number(payload.tramoEspecialAves) || 0)) : prev.tramoEspecialAves,
          precioTramoEspecialKg: payload.precioTramoEspecialKg !== undefined ? Number(payload.precioTramoEspecialKg) : prev.precioTramoEspecialKg,
          precioRestoKg: payload.precioRestoKg !== undefined ? (payload.precioRestoKg === null || payload.precioRestoKg === '' ? null : Number(payload.precioRestoKg)) : prev.precioRestoKg,
          notas: payload.notas !== undefined ? String(payload.notas) : prev.notas
        };
        if (payload.edadObjetivoDias !== undefined) {
          const targetLot = next.lotes.find((l) => l.id === loteId);
          if (targetLot) targetLot.edadObjetivoDias = clampEdad(payload.edadObjetivoDias);
        }
        break;
      }
      case 'CONTINUOUS_CYCLE_CONFIG': {
        next.continuoConfig = Object.assign({
          habilitado: true,
          avesPorLote: 900,
          cadenciaDias: 18,
          lotesAdicionales: 3,
          edadObjetivoDias: 42
        }, next.continuoConfig || {}, payload || {});
        break;
      }
      default:
        throw new Error(`Tipo de evento operativo no soportado: ${evt.type}`);
    }

    next.updatedAt = new Date().toISOString();
    return next;
  }

  /**
   * Evaluador financiero rápido de oportunidades comerciales (pollos adelantados o venta parcial de pechugas/presas).
   */
  function evaluateCommercialOpportunity(stateInput, params = {}) {
    const state = stateInput || createDefaultTwinState();
    const computed = computeFullTwin(state);
    const precios = state.preciosRegionales;
    const g = state.parametrosGenerales;
    const l1Cfg = state.lotes[0];
    const l1Res = computed.av2.lotes[0];
    const desposteCfg = (computed.av2.ventasParcialesResumen && computed.av2.ventasParcialesResumen.desposteConfig) || {
      pechugaPct: 0.34,
      precioPechugaKg: 14800,
      pernilMusloPct: 0.31,
      precioPernilMusloKg: 12500,
      alasPct: 0.11,
      precioAlasKg: 13500,
      menudenciasPct: 0.08,
      precioMenudenciasKg: 6000,
      espinazoSubproductoPct: 0.16,
      precioEspinazoKg: 4500,
      costoDesposteKg: 0
    };

    const tipo = String(
      params.tipo || ((params.cantidadPechugas || params.precioPorPechugaCop) ? 'venta_pechugas' : 'pollos_adelantados')
    ).toLowerCase();

    const costoCanalPorAve42d = l1Res.costoCanalTot / Math.max(1, l1Res.avesFin);
    const utilidadPorAve42d = l1Res.utilidadCanal / Math.max(1, l1Res.avesFin);

    if (tipo === 'venta_pechugas') {
      const cantidadPechugas = Math.max(1, Math.round(Number(params.cantidadPechugas || 50)));
      const precioPorPechugaCop = Number(params.precioPorPechugaCop || 14500);
      const pesoCanalAveKg = Number(params.pesoCanalAveKg || l1Res.pesoCanalAveKg);
      const pollosDespostados = cantidadPechugas;

      const pesoPechugaAveKg = pesoCanalAveKg * desposteCfg.pechugaPct;
      const precioImplicitoPechugaKgCop = pesoPechugaAveKg > 0 ? precioPorPechugaCop / pesoPechugaAveKg : 0;
      const ingresoPechugasCop = cantidadPechugas * precioPorPechugaCop;

      const pernilMusloKg = pollosDespostados * pesoCanalAveKg * desposteCfg.pernilMusloPct;
      const alasKg = pollosDespostados * pesoCanalAveKg * desposteCfg.alasPct;
      const menudenciasKg = pollosDespostados * pesoCanalAveKg * desposteCfg.menudenciasPct;
      const espinazoKg = pollosDespostados * pesoCanalAveKg * desposteCfg.espinazoSubproductoPct;

      const ingresoPernilMusloCop = pernilMusloKg * desposteCfg.precioPernilMusloKg;
      const ingresoAlasCop = alasKg * desposteCfg.precioAlasKg;
      const ingresoMenudenciasCop = menudenciasKg * desposteCfg.precioMenudenciasKg;
      const ingresoEspinazoCop = espinazoKg * desposteCfg.precioEspinazoKg;
      const ingresoRestoPresasCop = ingresoPernilMusloCop + ingresoAlasCop + ingresoMenudenciasCop + ingresoEspinazoCop;

      const ingresoTotal50PollosDespostadosCop = ingresoPechugasCop + ingresoRestoPresasCop;
      const ingreso50PollosCanalEnteroCop = pollosDespostados * pesoCanalAveKg * precios.precioCanalKg;
      const costoDesposteUnitKg = params.costoDesposteKg !== undefined
        ? Math.max(0, Number(params.costoDesposteKg) || 0)
        : (Number(desposteCfg.costoDesposteKg) || 0);
      const costoDesposteTotalCop = pollosDespostados * pesoCanalAveKg * costoDesposteUnitKg;
      const costo50PollosCanalCop = pollosDespostados * costoCanalPorAve42d + costoDesposteTotalCop;

      const utilidadNeta50PollosDesposteCop = ingresoTotal50PollosDespostadosCop - costo50PollosCanalCop;
      const utilidad50PollosCanalEnteroCop = ingreso50PollosCanalEnteroCop - (pollosDespostados * costoCanalPorAve42d);
      const extraGanancia50PollosVsCanalCop = utilidadNeta50PollosDesposteCop - utilidad50PollosCanalEnteroCop;
      const extraPorAveCop = extraGanancia50PollosVsCanalCop / pollosDespostados;

      const restoPresasPorColocarKg = pernilMusloKg + alasKg + menudenciasKg + espinazoKg;
      const flujoCajaDia1SoloPechugasCop = ingresoPechugasCop - costo50PollosCanalCop;
      const deficitCajaInicialSoloPechugasCop = flujoCajaDia1SoloPechugasCop < 0 ? Math.abs(flujoCajaDia1SoloPechugasCop) : 0;
      const ingresoBreakevenRestoCop = Math.max(0, costo50PollosCanalCop - ingresoPechugasCop);

      const avesLote1 = l1Res.avesFin;
      const proyeccionLote1UtilidadDesposteCop = l1Res.utilidadCanal + extraPorAveCop * avesLote1;

      const recomendacionBase = extraGanancia50PollosVsCanalCop >= 0
        ? `Solo vendiendo las ${cantidadPechugas} pechugas recibes $${Math.round(ingresoPechugasCop).toLocaleString('es-CO')} frente a un costo de $${Math.round(costo50PollosCanalCop).toLocaleString('es-CO')} (déficit de caja Día 1 de -$${Math.round(deficitCajaInicialSoloPechugasCop).toLocaleString('es-CO')}). Los +$${Math.round(extraGanancia50PollosVsCanalCop).toLocaleString('es-CO')} extra vs vender canal entero solo se materializan si colocas rápidamente en frío los ${restoPresasPorColocarKg.toFixed(1)} kg restantes (pernil/muslo, alas, menudencias y espinazo).`
        : 'El precio por pechuga sumado al resto de presas no supera la venta en canal entero; prioriza vender el pollo beneficiado completo.';

      return {
        tipo: 'venta_pechugas',
        moneda: 'COP',
        cantidadPechugas,
        pollosDespostados,
        precioPorPechugaCop,
        pesoCanalAveKg,
        pesoPechugaAveKg,
        precioImplicitoPechugaKgCop,
        ingresoPechugasCop,
        desgloseRestoPresas: {
          pernilMusloKg,
          ingresoPernilMusloCop,
          alasKg,
          ingresoAlasCop,
          menudenciasKg,
          ingresoMenudenciasCop,
          espinazoKg,
          ingresoEspinazoCop
        },
        ingresoRestoPresasCop,
        restoPresasPorColocarKg,
        flujoCajaDia1SoloPechugasCop,
        deficitCajaInicialSoloPechugasCop,
        ingresoBreakevenRestoCop,
        costoDesposteTotalCop,
        ingresoTotal50PollosDespostadosCop,
        ingreso50PollosCanalEnteroCop,
        costo50PollosCanalCop,
        utilidadNeta50PollosDesposteCop,
        utilidad50PollosCanalEnteroCop,
        extraGanancia50PollosVsCanalCop,
        proyeccionLote1UtilidadDesposteCop,
        recomendacion: recomendacionBase
      };
    }

    // Modo A: pollos adelantados antes del día 42
    const cantidadAves = Math.max(1, Math.round(Number(params.cantidadAves || 100)));
    const pesoVivoActualKg = Number(params.pesoVivoActualKg || 2.10);
    const pesoCanalEstimadoAveKg = pesoVivoActualKg * g.rendimientoCanalConMenudPct;
    const kgCanalOfertaTotal = cantidadAves * pesoCanalEstimadoAveKg;

    const precioOfertaKgCop = params.precioOfertaKgCop != null
      ? Number(params.precioOfertaKgCop)
      : (params.precioOfertaAveCop != null ? Number(params.precioOfertaAveCop) / Math.max(0.01, pesoCanalEstimadoAveKg) : 10000);
    const ingresoOfertaTotalCop = params.precioOfertaAveCop != null
      ? cantidadAves * Number(params.precioOfertaAveCop)
      : kgCanalOfertaTotal * precioOfertaKgCop;

    const edadMeta = clampEdad(l1Cfg.edadObjetivoDias || g.edadObjetivoGlobal);
    const metaIdx = Math.max(0, Math.min(48, edadMeta - 1));
    const targetWeightG = pesoVivoActualKg * 1000;
    let diaEqIdx = ROSS_PESO_G.findIndex((w) => w >= targetWeightG);
    if (diaEqIdx < 0) diaEqIdx = metaIdx;
    const ratioAlimAcum = Math.min(1.25, ROSS_CONS_ACUM_G[diaEqIdx] / Math.max(1, ROSS_CONS_ACUM_G[metaIdx]));

    const avesFinL1 = Math.max(1, l1Res.avesFin);
    const costoPollitoUnit = l1Res.costoPollito / avesFinL1;
    const costoInsumosFijosUnit = (l1Res.costoInsumos + l1Res.costoFijos) / avesFinL1;
    const costoAlimentoUnit42d = l1Res.costoAlimento / avesFinL1;
    const costoCrianzaAcumHoyUnit = costoPollitoUnit + costoInsumosFijosUnit + costoAlimentoUnit42d * ratioAlimAcum;
    const costoAcumuladoEstimadoCop = cantidadAves * (costoCrianzaAcumHoyUnit + precios.sacrificioAve);

    const utilidadHoyCop = ingresoOfertaTotalCop - costoAcumuladoEstimadoCop;
    const utilidadSiEsperaMeta42dCop = cantidadAves * utilidadPorAve42d;
    const diferenciaVsEsperar42dCop = utilidadHoyCop - utilidadSiEsperaMeta42dCop;

    const ingresoNecesarioIgualar42dCop = costoAcumuladoEstimadoCop + utilidadSiEsperaMeta42dCop;
    const precioMinimoKgParaIgualar42dCop = kgCanalOfertaTotal > 0 ? ingresoNecesarioIgualar42dCop / kgCanalOfertaTotal : 0;
    const precioMinimoAveParaIgualar42dCop = cantidadAves > 0 ? ingresoNecesarioIgualar42dCop / cantidadAves : 0;

    return {
      tipo: 'pollos_adelantados',
      moneda: 'COP',
      cantidadAves,
      diaEquivalenteRoss: diaEqIdx + 1,
      pesoVivoActualKg,
      pesoCanalEstimadoAveKg,
      kgCanalOfertaTotal,
      precioOfertaKgCop,
      ingresoOfertaTotalCop,
      costoAcumuladoEstimadoCop,
      utilidadHoyCop,
      utilidadSiEsperaMeta42dCop,
      diferenciaVsEsperar42dCop,
      precioMinimoKgParaIgualar42dCop,
      precioMinimoAveParaIgualar42dCop,
      recomendacion: diferenciaVsEsperar42dCop >= 0
        ? `Sí conviene sacar los ${cantidadAves} pollos hoy: superas en +$${Math.round(diferenciaVsEsperar42dCop).toLocaleString('es-CO')} pesos la utilidad proyectada al día ${edadMeta}.`
        : `A $${Math.round(precioOfertaKgCop).toLocaleString('es-CO')} pesos/kg ganas menos que esperando al día ${edadMeta} (diferencia de -$${Math.abs(Math.round(diferenciaVsEsperar42dCop)).toLocaleString('es-CO')} pesos). Para empatar utilidad hoy deberías pedir mínimo $${Math.round(precioMinimoKgParaIgualar42dCop).toLocaleString('es-CO')} pesos/kg ($${Math.round(precioMinimoAveParaIgualar42dCop).toLocaleString('es-CO')} pesos/pollo).`
    };
  }

  /**
   * Calcula el día exacto de cosecha en curva Ross 308 AP para alcanzar una meta
   * de peso de corte específico ('pechuga', 'canal' o 'vivo'), alimento requerido y riesgo térmico.
   */
  function estimateDayForTargetCutWeight(stateInput, options = {}) {
    const state = stateInput && stateInput.parametrosGenerales ? stateInput : createDefaultTwinState();
    const params = state.parametrosGenerales || {};
    const desposteCfg = Object.assign({ pechugaPct: 0.34, pernilMusloPct: 0.31, alasPct: 0.11 }, state.desposteConfig || {});
    const corteRaw = String(options.corte || 'pechuga').toLowerCase();
    const corte = ['pechuga', 'canal', 'vivo'].includes(corteRaw) ? corteRaw : 'pechuga';
    const defaultKgByCut = corte === 'vivo' ? 3.0 : (corte === 'canal' ? 2.47 : 0.84);
    const parsedTarget = Number(options.targetKg);
    const targetKg = Math.max(0.2, Number.isFinite(parsedTarget) && parsedTarget > 0 ? parsedTarget : defaultKgByCut);
    const l1Cfg = (Array.isArray(state.lotes) && state.lotes[options.loteIdx || 0]) || { avesInic: 600 };
    const avesInic = Math.max(1, Number(options.avesInic || l1Cfg.avesInic || 600));
    const mortPct = Number(params.mortalidadEsperadaPct ?? 0.03);
    const climaPct = Number(params.factorClimaCucutaPct ?? 0);
    const rendCanalPct = Number(params.rendimientoCanalConMenudPct ?? 0.825);
    const pechugaPct = Number(desposteCfg.pechugaPct || 0.34);
    const areaPorSeccionM2 = Number(params.areaGalponM2 || 280) / 3;

    const evalDay = (d) => {
      const idx = clampEdad(d);
      const pesoVivoRossKg = ROSS_PESO_G[idx] / 1000;
      const pesoVivoAveKg = pesoVivoRossKg * (1 + climaPct);
      const pesoCanalAveKg = pesoVivoAveKg * rendCanalPct;
      const pesoPechugaKg = pesoCanalAveKg * pechugaPct;
      const consAcumRossKg = ROSS_CONS_ACUM_G[idx - 1] / 1000;
      const consTeoricoKg = 4.445 + (consAcumRossKg - 4.664);
      const consEngordeKg = consTeoricoKg - 1.204;
      const bultosInic = roundUp((avesInic * 0.175 * (1 - 0.25 * mortPct)) / 40);
      const bultosPre = roundUp((avesInic * 1.029 * (1 - 0.55 * mortPct)) / 40);
      const bultosEng = roundUp((avesInic * consEngordeKg * (1 - 0.80 * mortPct)) / 40);
      const bultosTot = bultosInic + bultosPre + bultosEng;
      const consAcumTablaG = ROSS_CONS_ACUM_G[idx] !== undefined ? ROSS_CONS_ACUM_G[idx] : ROSS_CONS_ACUM_G[idx - 1];
      const fcrTeorico = ROSS_PESO_G[idx] > 0 ? consAcumTablaG / ROSS_PESO_G[idx] : 0;
      const valorCorteKg = corte === 'vivo' ? pesoVivoAveKg : (corte === 'canal' ? pesoCanalAveKg : pesoPechugaKg);
      const avesFin = Math.round(avesInic * (1 - mortPct));
      const densidadSoloLoteSeccionKgM2 = areaPorSeccionM2 > 0 ? (avesFin * pesoVivoAveKg) / areaPorSeccionM2 : 0;
      return {
        edadDias: idx,
        pesoVivoRossKg,
        pesoVivoAveKg,
        pesoCanalAveKg,
        pesoPechugaKg,
        valorCorteKg,
        fcrTeorico,
        bultosTot,
        densidadSoloLoteSeccionKgM2
      };
    };

    const ref42 = evalDay(42);
    const rows = [];
    for (let d = 28; d <= 49; d++) rows.push(evalDay(d));
    const matched = rows.find((r) => r.valorCorteKg >= targetKg) || rows[rows.length - 1];
    const alcanzado = matched.valorCorteKg >= targetKg - 0.002;
    const bultosExtraVs42 = matched.bultosTot - ref42.bultosTot;
    const diasExtraVs42 = matched.edadDias - 42;
    const biomasaLoteKg = Math.round(avesInic * (1 - mortPct)) * matched.pesoVivoAveKg;
    const requiereEntresaca = matched.edadDias >= 45 || matched.densidadSoloLoteSeccionKgM2 > 22;

    const deltaBultosTxt = bultosExtraVs42 >= 0 ? `+${bultosExtraVs42}` : `${bultosExtraVs42}`;
    const recomendacion = requiereEntresaca
      ? `Meta ${corte} ~${targetKg.toFixed(2)} kg alcanzada en Día ${matched.edadDias} (${matched.pesoVivoAveKg.toFixed(3)} kg vivo / ${matched.pesoCanalAveKg.toFixed(3)} kg canal -> ${matched.pesoPechugaKg.toFixed(3)} kg pechuga, FCR ${matched.fcrTeorico.toFixed(2)}). Requiere ${deltaBultosTxt} bultos vs 42d (${matched.bultosTot} totales/${avesInic} aves) y entresaca/raleo previo desde día 38–42 + ventilación forzada en El Zulia.`
      : `Meta ${corte} ~${targetKg.toFixed(2)} kg alcanzada en Día ${matched.edadDias} (${matched.pesoVivoAveKg.toFixed(3)} kg vivo / ${matched.pesoCanalAveKg.toFixed(3)} kg canal -> ${matched.pesoPechugaKg.toFixed(3)} kg pechuga, FCR ${matched.fcrTeorico.toFixed(2)}; ${deltaBultosTxt} bultos vs 42d).`;

    return {
      corte,
      targetKg,
      avesInic,
      edadRecomendadaDias: matched.edadDias,
      alcanzado,
      pesoVivoKg: matched.pesoVivoAveKg,
      pesoCanalKg: matched.pesoCanalAveKg,
      pesoPechugaKg: matched.pesoPechugaKg,
      fcrTeorico: matched.fcrTeorico,
      bultosTotalesLote: matched.bultosTot,
      bultosBase42: ref42.bultosTot,
      bultosExtraVs42,
      diasExtraVs42,
      biomasaLoteKg,
      densidadSoloLoteSeccionKgM2: matched.densidadSoloLoteSeccionKgM2,
      requiereEntresaca,
      recomendacion
    };
  }

  /**
   * Simulación continua multi-mes / anual de solo lectura (NO muta el estado oficial).
   * Responde proyecciones de 12–104 semanas (ej. 1 año completo), capacidad semanal vs pedidos
   * y descanso sanitario por sección en Vereda La Alejandra (El Zulia).
   */
  function simulateContinuousHorizon(baseState, options = {}) {
    const simState = deepClone(baseState || createDefaultTwinState());
    if (options.precioCanalKg !== undefined && Number.isFinite(Number(options.precioCanalKg))) {
      simState.preciosRegionales.precioCanalKg = Number(options.precioCanalKg);
    }
    if (options.pollitoBmanga !== undefined && Number.isFinite(Number(options.pollitoBmanga))) {
      simState.preciosRegionales.pollitoBmanga = Number(options.pollitoBmanga);
    }
    if (options.programaAlimentoLotes23) {
      simState.lotes[1].programaAlimento = String(options.programaAlimentoLotes23);
      simState.lotes[2].programaAlimento = String(options.programaAlimentoLotes23);
    }

    const baseComputed = computeFullTwin(simState);
    const params = simState.parametrosGenerales;
    const precios = simState.preciosRegionales;
    const rawContCfg = simState.continuoConfig || {};
    const l3Cfg = simState.lotes[2] || {};

    const contAves = Math.max(100, Math.min(3000, Math.round(Number(options.avesPorLote ?? rawContCfg.avesPorLote ?? 900))));
    const contCadencia = Math.max(10, Math.min(45, Math.round(Number(options.cadenciaDias ?? rawContCfg.cadenciaDias ?? 18))));
    const contEdad = clampEdad(options.edadObjetivoDias ?? rawContCfg.edadObjetivoDias ?? params.edadObjetivoGlobal ?? 42);
    const horizonWeeks = options.semanasHorizonte !== undefined
      ? Math.max(12, Math.min(104, Math.round(Number(options.semanasHorizonte) || 52)))
      : (options.mesesHorizonte !== undefined
        ? Math.max(12, Math.min(104, Math.round((Number(options.mesesHorizonte) || 12) * 52 / 12)))
        : 52);
    const usaPropioCont = options.usaAlimentoPropio !== undefined
      ? Boolean(options.usaAlimentoPropio)
      : String(l3Cfg.programaAlimento || '').toLowerCase().includes('propio');

    const loteModelo = computeSingleLot({
      avesInic: contAves,
      edad: contEdad,
      mortalidadPct: params.mortalidadEsperadaPct,
      precioPollito: precios.pollitoBmanga,
      usaAlimentoPropio: usaPropioCont,
      mesesArriendo: 0,
      canonMensualArriendo: 0,
      precios,
      params
    });

    const timeline = buildContinuousProjectionTimeline({
      rawWeeks: baseComputed.av2.flujoCajaSemanal,
      l3FechaEnt: baseComputed.av2.lotes[2].fechaIngreso,
      loteModelo,
      contAves,
      contCadencia,
      contEdad,
      precios,
      lotesCount: null,
      horizonWeeks,
      clipAtHorizon: true
    });

    const semanas = timeline.flujoCajaContinuoSemanal;
    const ingresosTotalesHorizonteCop = semanas.reduce((acc, w) => acc + w.ingresos, 0);
    const egresosTotalesHorizonteCop = semanas.reduce((acc, w) => acc + w.egresos, 0);
    const lotesCobrados = timeline.lotesProyectados.filter((lp) => lp.semanaSalida <= horizonWeeks);
    const lotesEnProceso = timeline.lotesProyectados.length - lotesCobrados.length;

    let breakEvenWeek = null;
    for (let i = 0; i < semanas.length; i++) {
      const restAllPositive = semanas.slice(i).every((w) => w.saldoAcumulado >= 0);
      if (restAllPositive) {
        breakEvenWeek = semanas[i].semana;
        break;
      }
    }

    const ciclosPorAno = 365 / contCadencia;
    const avesIngresadasSemana = (contAves * 7) / contCadencia;
    const avesCosechadasSemana = (loteModelo.avesFin * 7) / contCadencia;
    const demandaCliente = Math.max(0, Number(options.demandaSemanalAvesCliente || 0));
    const ingresosAnualesEstacionariosCop = ciclosPorAno * loteModelo.ingresoCanal;
    const utilidadAnualPreArriendoCop = ciclosPorAno * loteModelo.utilidadCanal;
    const arriendoAnualCop = 12 * precios.arriendoRegMes;
    const utilidadAnualNetaPostArriendoCop = utilidadAnualPreArriendoCop - arriendoAnualCop;

    // Biomasa simultánea máxima en galpón cuando el lote mayor alcanza contEdad
    let biomasaSimultaneaKg = 0;
    const edadesSimultaneas = [];
    for (let d = contEdad; d >= 1; d -= contCadencia) {
      const diaIdx = Math.max(0, Math.min(49, Math.round(d)));
      const pesoDiaKg = (ROSS_PESO_G[diaIdx] / 1000) * (1 + params.factorClimaCucutaPct);
      biomasaSimultaneaKg += loteModelo.avesFin * pesoDiaKg;
      edadesSimultaneas.push(diaIdx);
    }
    const areaGalponM2 = Math.max(1, params.areaGalponM2 || 280);
    const densidadSimultaneaGalponKgM2 = biomasaSimultaneaKg / areaGalponM2;
    const densidadSeccionSalidaKgM2 = (loteModelo.avesFin * loteModelo.pesoVivoAveKg) / (areaGalponM2 / 3);
    const diasVacioSanitarioPorSeccion = (3 * contCadencia) - contEdad;

    const alertasOperativas = [];
    if (diasVacioSanitarioPorSeccion < 7) {
      alertasOperativas.push(
        `Vacío sanitario ajustado: con ${contCadencia} días de cadencia y salida en Día ${contEdad}, cada sección rotativa (de 3) solo descansa ${diasVacioSanitarioPorSeccion} días para limpieza y desinfección (ideal >= 7 días o 18 días de cadencia).`
      );
    }
    if (densidadSeccionSalidaKgM2 > 24 || densidadSimultaneaGalponKgM2 > 24) {
      alertasOperativas.push(
        `Densidad exigente en El Zulia: ${densidadSeccionSalidaKgM2.toFixed(1)} kg/m² en sección de salida y ${densidadSimultaneaGalponKgM2.toFixed(1)} kg/m² promedio total con ${edadesSimultaneas.length} lotes simultáneos (días ${edadesSimultaneas.join(', ')}); requiere ventilación forzada, cortinas y entresaca.`
      );
    }

    return {
      ok: true,
      readOnlySimulation: true,
      parametrosEscenario: {
        avesPorLote: contAves,
        cadenciaDias: contCadencia,
        edadObjetivoDias: contEdad,
        horizonSemanas: horizonWeeks,
        mesesAprox: Number((horizonWeeks * 12 / 52).toFixed(1)),
        precioCanalKg: precios.precioCanalKg,
        pollitoBmanga: precios.pollitoBmanga,
        usaAlimentoPropio: usaPropioCont
      },
      capacidadSemanal: {
        avesIngresadasSemana: Number(avesIngresadasSemana.toFixed(1)),
        avesCosechadasSemana: Number(avesCosechadasSemana.toFixed(1)),
        kgCanalSemana: Number((avesCosechadasSemana * loteModelo.pesoCanalAveKg).toFixed(1)),
        coberturaDemandaCliente: demandaCliente > 0
          ? {
              demandaSemanalAves: demandaCliente,
              cubreDemanda: avesCosechadasSemana >= demandaCliente,
              excedenteSemanalAves: Number((avesCosechadasSemana - demandaCliente).toFixed(1)),
              porcentajeOcupacionClientePct: Number(((demandaCliente / Math.max(1, avesCosechadasSemana)) * 100).toFixed(1))
            }
          : null
      },
      loteModeloContinuo: {
        avesInic: contAves,
        avesFin: loteModelo.avesFin,
        bultosTot: loteModelo.bultosTot,
        costoPollitoInsumosYAlimCop: loteModelo.costoPollito + loteModelo.costoInsumos + loteModelo.costoAlimento,
        costoDirectoPreArriendoCop: loteModelo.costoCanalTot,
        ingresoCanalCop: loteModelo.ingresoCanal,
        utilidadBrutaPorLotePreArriendoCop: loteModelo.utilidadCanal
      },
      horizonteRealDesdeInicio: {
        semanasTotales: horizonWeeks,
        lotesInicialesIncluidoL1a3: 3,
        lotesContinuosIngresados: timeline.lotesProyectados.length,
        lotesContinuosCobrados: lotesCobrados.length,
        lotesEnEngordeSinCobrarAlCierre: lotesEnProceso,
        avesTotalesIniciadas: baseComputed.av2.consolidado3Lotes.avesInic + timeline.lotesProyectados.length * contAves,
        ingresosTotalesHorizonteCop,
        egresosTotalesHorizonteCop,
        saldoCajaNetoAlCierreHorizonteCop: timeline.saldoFinalContinuo,
        capitalTrabajoPicoInicialCop: timeline.capitalTrabajoPicoContinuo,
        semanaPuntoEquilibrioCajaDefinitivo: breakEvenWeek
      },
      regimenEstacionarioAnual: {
        ciclosPorAno: Number(ciclosPorAno.toFixed(2)),
        ingresosAnualesCop: Math.round(ingresosAnualesEstacionariosCop),
        utilidadBrutaPreArriendoAnualCop: Math.round(utilidadAnualPreArriendoCop),
        arriendoAnualCop: Math.round(arriendoAnualCop),
        utilidadNetaPostArriendoAnualCop: Math.round(utilidadAnualNetaPostArriendoCop),
        utilidadMensualPromedioPostArriendoCop: Math.round(utilidadAnualNetaPostArriendoCop / 12)
      },
      auditoriaGalponYClima: {
        areaGalponM2,
        lotesSimultaneosMax: edadesSimultaneas.length,
        edadesSimultaneasDias: edadesSimultaneas,
        biomasaSimultaneaMaxKg: Number(biomasaSimultaneaKg.toFixed(1)),
        densidadSimultaneaGalponKgM2: Number(densidadSimultaneaGalponKgM2.toFixed(2)),
        densidadSeccionSalidaKgM2: Number(densidadSeccionSalidaKgM2.toFixed(2)),
        diasVacioSanitarioPorSeccion,
        alertasOperativas
      }
    };
  }

  /**
   * Cuadro de Mando Integral Vivo (Kaplan & Norton): consolida las 4 perspectivas
   * operativas y financieras de Granja La Alejandra (incluyendo IEP teórico y real).
   */
  function computeFarmScorecardKPIs(stateInput, computedInput) {
    const state = stateInput && stateInput.parametrosGenerales ? stateInput : createDefaultTwinState();
    const computed = computedInput || computeFullTwin(state);
    const params = state.parametrosGenerales || {};
    const precios = state.preciosRegionales || {};
    const av2 = computed.av2 || {};
    const lotes = av2.lotes || [];
    const l1 = lotes[0] || {};
    const l2 = lotes[1] || {};
    const l3 = lotes[2] || {};
    const cons3 = av2.consolidado3Lotes || {};
    const tes = av2.tesoreriaResumen || {};
    const cont = av2.continuoResumen || { config: { avesPorLote: 900, lotesAdicionales: 3 }, loteModelo: {} };
    const bod = av2.auditoriaBodegaLote1 || { compradoInicial: {}, faltantePpto: {} };
    const term = av2.capacidadTermica || {};
    const bit = av2.bitacora || { diasRegistrados: 0, bajasAcumReales: 0, ultimoPesoReal: null };
    const trans = av2.transporte || { viajes: [], viajesEnCurso: 0, costoTransportePorKgCanalCop: 0 };
    const vRes = av2.ventasParcialesResumen || { ventas: [], totalIngresosCop: 0, totalKgVendidos: 0, totalAvesVendidas: 0, comparativaModalidadesLote1: {} };

    const ahorroPollitoPorAveCop = Math.max(0, Number(precios.pollitoLocal || 4500) - Number(precios.pollitoBmanga || 3200));
    const ahorroDirectoLotes23Cop = ahorroPollitoPorAveCop * ((l2.avesInic || 800) + (l3.avesInic || 800));
    const ahorroDirectoPorCiclo900Cop = ahorroPollitoPorAveCop * (cont.config?.avesPorLote || 900);
    const ahorroDirectoAcumuladoVisibleCop =
      ahorroDirectoLotes23Cop + ahorroDirectoPorCiclo900Cop * (cont.config?.lotesAdicionales || 3);

    const margenNetoLote1Pct = Number(l1.margenCanal || 0);
    const margenNeto3LotesPct = Number(cons3.margenCanal || 0);
    const roiCicloContinuoPct = Number((cont.loteModelo && (cont.loteModelo.roiCiclo ?? cont.loteModelo.roi)) ?? l1.roiCiclo ?? 0);
    const statusFinanciero =
      margenNeto3LotesPct >= 0.22 && roiCicloContinuoPct >= 0.30
        ? 'verde'
        : margenNeto3LotesPct >= 0.16
          ? 'ambar'
          : 'rojo';

    const ventas = Array.isArray(vRes.ventas) ? vRes.ventas : [];
    let kgCanalMix = 0;
    let kgPieMix = 0;
    let kgDespMix = 0;
    for (const s of ventas) {
      const m = String(s.modalidad || 'canal').toLowerCase();
      if (m === 'en_pie') kgPieMix += Number(s.pesoKg || 0);
      else if (m === 'piezas') kgDespMix += Number(s.pesoKg || 0);
      else kgCanalMix += Number(s.pesoKg || 0);
    }
    const kgMixTot = kgCanalMix + kgPieMix + kgDespMix;
    const mixCanalPct = kgMixTot > 0 ? kgCanalMix / kgMixTot : 1;
    const mixPiePct = kgMixTot > 0 ? kgPieMix / kgMixTot : 0;
    const mixDespostePct = kgMixTot > 0 ? kgDespMix / kgMixTot : 0;
    const hasRealSales = Number(vRes.totalKgVendidos || 0) > 0;
    const ingresoPonderadoKg =
      hasRealSales
        ? vRes.totalIngresosCop / vRes.totalKgVendidos
        : Number(precios.precioCanalKg || 11500);
    const piezas100 = (vRes.comparativaModalidadesLote1 && vRes.comparativaModalidadesLote1.piezas100) || {};
    const statusCliente = !hasRealSales
      ? 'ambar'
      : (ingresoPonderadoKg >= Number(precios.precioCanalKg || 11500) * 0.96
          ? 'verde'
          : ingresoPonderadoKg >= Number(precios.precioCanalKg || 11500) * 0.85
            ? 'ambar'
            : 'rojo');

    const edadMeta = clampEdad(params.edadObjetivoGlobal || l1.edadDias || 42);
    const desposteCfg = Object.assign({ pechugaPct: 0.34 }, state.desposteConfig || {});
    const pesoRossKg = ROSS_PESO_G[edadMeta] / 1000;
    const pesoCanalObjetivoKg = Number(l1.pesoCanalAveKg || pesoRossKg * Number(params.rendimientoCanalConMenudPct ?? 0.825));
    const pesoPechugaObjetivoKg = pesoCanalObjetivoKg * Number(desposteCfg.pechugaPct || 0.34);
    const consTablaMetaG = ROSS_CONS_ACUM_G[edadMeta] !== undefined ? ROSS_CONS_ACUM_G[edadMeta] : ROSS_CONS_ACUM_G[edadMeta - 1];
    const fcrRossTabla = ROSS_PESO_G[edadMeta] > 0 ? consTablaMetaG / ROSS_PESO_G[edadMeta] : 1.63;
    const viabEsperadaPct = (1 - Number(params.mortalidadEsperadaPct ?? 0.03)) * 100;
    const iepRossTeorico = Math.round((viabEsperadaPct * pesoRossKg * 100) / (edadMeta * Math.max(0.5, fcrRossTabla)));
    const iepModeloGranja = Math.round(
      (viabEsperadaPct * Number(l1.pesoVivoAveKg || pesoRossKg) * 100) /
      (Math.max(1, l1.edadDias || edadMeta) * Math.max(0.5, Number(l1.fcrReal || fcrRossTabla)))
    );

    let iepRealCampo = null;
    let fcrRealCampo = null;
    let desviacionFcrPuntos = 0;
    if (bit.ultimoPesoReal && Number(bit.ultimoPesoReal.pesoPromedioKg || 0) > 0 && Number(bit.ultimoPesoReal.diaCiclo || 0) > 0) {
      const dUlt = Math.max(1, Math.min(49, Math.round(Number(bit.ultimoPesoReal.diaCiclo))));
      const viabRealPct = l1.avesInic > 0 ? ((l1.avesInic - Number(bit.bajasAcumReales || 0)) / l1.avesInic) * 100 : viabEsperadaPct;
      const consAcumDiaG = ROSS_CONS_ACUM_G[dUlt - 1] !== undefined ? ROSS_CONS_ACUM_G[dUlt - 1] : ROSS_CONS_ACUM_G[48];
      const fcrRossEnDia = ROSS_PESO_G[dUlt] > 0 ? consAcumDiaG / ROSS_PESO_G[dUlt] : fcrRossTabla;
      if (bit.ultimoPesoReal.fcrReal !== null && bit.ultimoPesoReal.fcrReal !== undefined) {
        fcrRealCampo = Number(bit.ultimoPesoReal.fcrReal);
      } else {
        const consAcumKgReal = (bit.consumoAcumRealKg && bit.consumoAcumRealKg > 0)
          ? bit.consumoAcumRealKg / Math.max(1, l1.avesInic - Number(bit.bajasAcumReales || 0))
          : (consAcumDiaG / 1000);
        fcrRealCampo = consAcumKgReal / Math.max(0.05, Number(bit.ultimoPesoReal.pesoPromedioKg));
      }
      desviacionFcrPuntos = fcrRealCampo - fcrRossEnDia;
      iepRealCampo = bit.ultimoPesoReal.iep !== null && bit.ultimoPesoReal.iep !== undefined
        ? Math.round(Number(bit.ultimoPesoReal.iep))
        : Math.round((viabRealPct * Number(bit.ultimoPesoReal.pesoPromedioKg) * 100) / (dUlt * Math.max(0.5, fcrRealCampo)));
    }

    const densidadSeccionKgM2 = Number(term.densidadCriticaElZuliaKgM2 ?? term.densidadPicoSeccionKgM2 ?? term.densidadPicoKgM2 ?? 0);
    const densidadStatus = densidadSeccionKgM2 > 24 ? 'rojo' : (densidadSeccionKgM2 > 22 ? 'ambar' : 'verde');
    const fisicaJit = bod.fisicaJit || {
      compradoHoy: { masterpollito: 3, nutrepollo: 0, broiler: 0, totalBultos: 3 },
      porComprarJit: { masterpollito: 0, nutrepollo: 16, broiler: 48, totalBultos: 64 }
    };
    const bultosPisoLote1 = Number(fisicaJit.compradoHoy?.totalBultos ?? 3);
    const bultosFaltantesJit = Number(fisicaJit.porComprarJit?.totalBultos ?? 64);
    const coberturaJitPct = bultosPisoLote1 + bultosFaltantesJit > 0
      ? bultosPisoLote1 / (bultosPisoLote1 + bultosFaltantesJit)
      : 1;
    const l1StartIso = (state.lotes && state.lotes[0] && state.lotes[0].fechaIngreso) || '2026-11-13';
    const hoyColIso = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const diaTranscurridoReal = Math.max(1, Math.min(49, diffDaysIso(l1StartIso, hoyColIso) + 1));
    const etapaJitPorVencer =
      (diaTranscurridoReal >= 6 && Number(fisicaJit.porComprarJit?.nutrepollo || 0) >= Number(l1.bultosPre || 16)) ||
      (diaTranscurridoReal >= 20 && Number(fisicaJit.porComprarJit?.broiler || 0) >= Number(l1.bultosEng || 48));
    const statusProcesos =
      densidadStatus === 'rojo' || desviacionFcrPuntos > 0.15
        ? 'rojo'
        : (densidadStatus === 'ambar' || etapaJitPorVencer ? 'ambar' : 'verde');

    const diasReg = Number(bit.diasRegistrados || 0);
    const cumplimientoBitacoraPct = Math.min(1, diasReg / Math.max(1, edadMeta));
    const pesajesCount = Number(
      bit.pesajesRealesCount !== undefined
        ? bit.pesajesRealesCount
        : (Array.isArray(bit.pesajes) ? bit.pesajes.filter((p) => p.pesoRealG !== null && p.pesoRealG !== undefined).length : 0)
    );
    const viajesCount = Array.isArray(trans.viajes) ? trans.viajes.length : 0;
    const viajesAbiertos = Number(trans.viajesEnCurso || 0);
    const statusAprendizaje =
      diasReg === 0 && diaTranscurridoReal >= 2
        ? 'rojo'
        : (diasReg > 0 && pesajesCount > 0 && viajesAbiertos === 0 ? 'verde' : 'ambar');

    const statusList = [statusFinanciero, statusCliente, statusProcesos, statusAprendizaje];
    return {
      financiera: {
        status: statusFinanciero,
        margenNetoLote1Pct,
        margenNeto3LotesPct,
        roiCicloContinuoPct,
        costoKgCanalLote1Cop: Number(l1.costoKgCanal || 0),
        costoKgCanalContinuoCop: Number((cont.loteModelo && cont.loteModelo.costoKgCanal) || 0),
        ahorroDirectoPorAveCop: ahorroPollitoPorAveCop,
        ahorroDirectoLotes23Cop,
        ahorroDirectoPorCiclo900Cop,
        ahorroDirectoAcumuladoVisibleCop,
        picoCapitalSem7Cop: Number(tes.capitalTrabajoPicoSem7 || 0),
        cajaAcumSem18Cop: Number(cont.saldoFinalContinuo || 0)
      },
      clienteMercado: {
        status: statusCliente,
        hasRealSales,
        ingresoPonderadoKg,
        precioBaseCanalKg: Number(precios.precioCanalKg || 11500),
        mixCanalPct,
        mixPiePct,
        mixDespostePct,
        piezas100ExtraCop: Number(piezas100.extraVsCanalCop || 0),
        ingresosParcialesCop: Number(vRes.totalIngresosCop || 0),
        avesParcialesVendidas: Number(vRes.totalAvesVendidas || 0),
        edadObjetivoDias: edadMeta,
        pesoCanalObjetivoKg,
        pesoPechugaObjetivoKg
      },
      procesosInternos: {
        status: statusProcesos,
        iepRossTeorico,
        iepModeloGranja,
        iepRealCampo,
        fcrObjetivoTabla: fcrRossTabla,
        fcrModeloGranja: Number(l1.fcrReal || fcrRossTabla),
        fcrContinuo900: Number((cont.loteModelo && cont.loteModelo.fcrReal) || l1.fcrReal || fcrRossTabla),
        fcrRealCampo,
        desviacionFcrPuntos,
        mortalidadMetaPct: Number(params.mortalidadEsperadaPct ?? 0.03),
        mortalidadRealLote1Pct: l1.avesInic > 0 ? Number(bit.bajasAcumReales || 0) / l1.avesInic : 0,
        densidadSeccionKgM2,
        densidadStatus,
        bultosPisoLote1,
        bultosFaltantesJit,
        coberturaJitPct,
        costoTeriosPorKgCanalCop: Number(trans.costoTransportePorKgCanalCop || 0)
      },
      aprendizajeCampo: {
        status: statusAprendizaje,
        diasRegistrados: diasReg,
        edadMetaDias: edadMeta,
        cumplimientoBitacoraPct,
        pesajesCount,
        viajesCount,
        viajesAbiertos
      },
      resumenSemaforos: {
        verdes: statusList.filter((s) => s === 'verde').length,
        ambares: statusList.filter((s) => s === 'ambar').length,
        rojos: statusList.filter((s) => s === 'rojo').length
      }
    };
  }

  /**
   * Fase H1 · Núcleo de Gobierno Ejecutivo Real (Verdad en Campo, Tesorería Viva,
   * Escenario Base vs Ácido y Frenos Físicos/Comerciales sin maquillaje).
   */
  function computeExecutiveGovernance(stateInput, computedInput) {
    const state = stateInput && stateInput.parametrosGenerales ? stateInput : createDefaultTwinState();
    const computed = computedInput || computeFullTwin(state);
    const params = state.parametrosGenerales || {};
    const precios = state.preciosRegionales || {};
    const av2 = computed.av2 || {};
    const lotes = av2.lotes || [];
    const l1 = lotes[0] || {};
    const l2 = lotes[1] || {};
    const l3 = lotes[2] || {};
    const cons3 = av2.consolidado3Lotes || {};
    const tes = av2.tesoreriaResumen || {};
    const cont = av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18 }, loteModelo: {}, flujoCajaContinuoSemanal: [] };
    const bod = av2.auditoriaBodegaLote1 || { compradoInicial: {}, faltantePpto: {} };
    const term = av2.capacidadTermica || {};
    const bit = av2.bitacora || { dias: [], diasRegistrados: 0, bajasAcumReales: 0, pesajes: [] };
    const trans = av2.transporte || { viajes: [], viajesEnCurso: 0, costoTransportePorKgCanalCop: 0 };
    const vRes = av2.ventasParcialesResumen || { ventas: [], totalAvesVendidas: 0 };
    const kpiInd = av2.kpiIndustriales || {};
    const flujo = Array.isArray(av2.flujoCajaSemanal) ? av2.flujoCajaSemanal : [];

    // Fecha actual Colombia UTC-5 (permite override explícito para auditoría determinista)
    const hoyIso = (params.fechaCorteAuditIso && /^\d{4}-\d{2}-\d{2}$/.test(String(params.fechaCorteAuditIso)))
      ? String(params.fechaCorteAuditIso)
      : new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

    const l1FechaEnt = (state.lotes && state.lotes[0] && state.lotes[0].fechaIngreso) || '2026-11-13';
    const l2FechaEnt = (state.lotes && state.lotes[1] && state.lotes[1].fechaIngreso) || addDaysIso(l1FechaEnt, 10);
    const l3FechaEnt = (state.lotes && state.lotes[2] && state.lotes[2].fechaIngreso) || addDaysIso(l2FechaEnt, 12);
    const l1Edad = Number(l1.edadDias || params.edadObjetivoGlobal || 42);
    const l1FechaSal = l1.fechaSalida || addDaysIso(l1FechaEnt, l1Edad - 1);

    const diffDesdeIngreso = diffDaysIso(l1FechaEnt, hoyIso);
    const diaCicloL1 = Math.max(1, Math.min(49, diffDesdeIngreso + 1));
    const diasTranscurridos = Math.max(1, Math.min(l1Edad, diffDesdeIngreso + 1));
    const diasVentana = (bit.dias || []).slice(0, diasTranscurridos);
    const diasReportadosEnVentana = diasVentana.filter((d) => d.tieneRegistro).length;
    const diasSinReporte = Math.max(0, diasTranscurridos - diasReportadosEnVentana);
    const ultDiaObj = [...(bit.dias || [])].reverse().find((d) => d.tieneRegistro);
    const tieneCegueraOperativa = diasTranscurridos >= 2 && (diasReportadosEnVentana === 0 || diasSinReporte >= 2);

    const l1Counts = resolveLote1PhysicalCounts(state.lotes && state.lotes[0]);
    const avesVivasHoy = Number(bit.avesVivasRealesHoy ?? l1Counts.avesRecibidasReales ?? 603);
    const idxDia = Math.max(0, Math.min(48, diaCicloL1 - 1));
    const consTeoricoAcumAveG = ROSS_CONS_ACUM_G[idxDia] || 0;
    const consumoTeoricoAcumLoteKg = (avesVivasHoy * consTeoricoAcumAveG) / 1000;
    const bultosTeoricosConsumidosHoy = consumoTeoricoAcumLoteKg / 40;

    const fisicaJit = bod.fisicaJit || {
      compradoHoy: { masterpollito: 3, nutrepollo: 0, broiler: 0, totalBultos: 3, costoCop: 3 * (precios.alimInicBulto || 106500) },
      porComprarJit: { masterpollito: 0, nutrepollo: 16, broiler: 48, totalBultos: 64, costoAdicionalCop: 6022400 }
    };
    const masterComprados = Number(fisicaJit.compradoHoy?.masterpollito || 0);
    const nutreComprados = Number(fisicaJit.compradoHoy?.nutrepollo || 0);
    const broilerComprados = Number(fisicaJit.compradoHoy?.broiler || 0);
    const bultosCompradosTotal = masterComprados + nutreComprados + broilerComprados;

    const consMasterKg = (avesVivasHoy * (ROSS_CONS_ACUM_G[Math.min(6, idxDia)] || 0)) / 1000;
    const masterRestantesPiso = Math.max(0, masterComprados - consMasterKg / 40);
    const consNutreKg = diaCicloL1 > 7
      ? (avesVivasHoy * ((ROSS_CONS_ACUM_G[Math.min(20, idxDia)] || 0) - (ROSS_CONS_ACUM_G[6] || 0))) / 1000
      : 0;
    const nutreRestantesPiso = Math.max(0, nutreComprados - consNutreKg / 40);
    const consBroilerKg = diaCicloL1 > 21
      ? (avesVivasHoy * ((ROSS_CONS_ACUM_G[idxDia] || 0) - (ROSS_CONS_ACUM_G[20] || 0))) / 1000
      : 0;
    const broilerRestantesPiso = Math.max(0, broilerComprados - consBroilerKg / 40);
    const bultosRestantesPisoHoy = Math.max(0, masterRestantesPiso + nutreRestantesPiso + broilerRestantesPiso);

    const etapaActivaMaterial = diaCicloL1 <= 7
      ? 'Master Pollito'
      : (diaCicloL1 <= 21 ? 'Nutrepollo Cr SP' : 'Broiler I Dorado');
    const etapaActivaBadge = diaCicloL1 <= 7
      ? `Sem 1 · Día ${diaCicloL1}`
      : (diaCicloL1 <= 21 ? `Sem 2–3 · Día ${diaCicloL1}` : `Engorde · Día ${diaCicloL1}`);
    const bultosEtapaActivaRestantes = diaCicloL1 <= 7
      ? masterRestantesPiso
      : (diaCicloL1 <= 21 ? nutreRestantesPiso : broilerRestantesPiso);
    const bultosEtapaActivaComprados = diaCicloL1 <= 7
      ? masterComprados
      : (diaCicloL1 <= 21 ? nutreComprados : broilerComprados);
    const porComprarJitTotal = Number(fisicaJit.porComprarJit?.totalBultos || 0);
    const porComprarJitNutre = Number(fisicaJit.porComprarJit?.nutrepollo || 0);
    const porComprarJitBroiler = Number(fisicaJit.porComprarJit?.broiler || 0);
    const fechaPasoNutre = addDaysIso(l1FechaEnt, 7);
    const fechaPasoBroiler = addDaysIso(l1FechaEnt, 21);
    const proximaCompraJit = diaCicloL1 <= 7 && porComprarJitNutre > 0
      ? { etapa: 'Nutrepollo Cr SP', fechaLimiteIso: fechaPasoNutre, fechaCorta: formatShortDateEs(fechaPasoNutre), bultosEtapa: porComprarJitNutre }
      : (diaCicloL1 <= 21 && porComprarJitBroiler > 0
        ? { etapa: 'Broiler I Dorado', fechaLimiteIso: fechaPasoBroiler, fechaCorta: formatShortDateEs(fechaPasoBroiler), bultosEtapa: porComprarJitBroiler }
        : null);

    const pesajeHitos = [7, 14, 21, 28, 35, 42];
    const pesajesMap = new Map((bit.pesajes || []).map((p) => [p.dia, p]));
    const pesajesVencidosSinMedir = pesajeHitos.filter((d) => {
      const rec = pesajesMap.get(d);
      return d < diaCicloL1 && (!rec || rec.pesoRealG === null || rec.pesoRealG === undefined);
    });
    const proxPesajeDia = pesajeHitos.find((d) => {
      const rec = pesajesMap.get(d);
      return d >= diaCicloL1 && (!rec || rec.pesoRealG === null || rec.pesoRealG === undefined);
    }) || 42;
    const proxPesajeFecha = addDaysIso(l1FechaEnt, proxPesajeDia - 1);
    const metaRossProxG = ROSS_PESO_G[proxPesajeDia] || 201;

    // Tesorería Viva: comprometido inicial real JIT (Sem 1 en bodega) + próximos giros exactos por semana
    const inversionBodegaInicialCop = Number(fisicaJit.compradoHoy?.costoCop ?? (masterComprados * (precios.alimInicBulto || 106500)));
    const comprometidoArranqueRealCop =
      Number(precios.arriendoIniMes || 750000) +
      Number(l1.costoPollito || 2700000) +
      Math.round(0.7 * Number(l1.costoInsumos || 795000)) +
      inversionBodegaInicialCop +
      Number(params.equipamientoAdicionalCop || 0);

    const weekSumOut = (w) => (w ? (Number(w.pollitosInsumos || 0) + Number(w.alimento || 0) + Number(w.fijosBenef || 0)) : 0);
    const giroSem3Cop = weekSumOut(flujo[2]);
    const giroSem4Cop = weekSumOut(flujo[3]);
    const giroSem5a7Solo3LCop = weekSumOut(flujo[4]) + weekSumOut(flujo[5]) + weekSumOut(flujo[6]);
    const contFlujo = Array.isArray(cont.flujoCajaContinuoSemanal) ? cont.flujoCajaContinuoSemanal : [];
    const giroSem5a7ContCop = contFlujo.length >= 7
      ? (Number(contFlujo[4].egresos || 0) + Number(contFlujo[5].egresos || 0) + Number(contFlujo[6].egresos || 0))
      : giroSem5a7Solo3LCop;

    const picoSolo3LCop = Number(kpiInd.picoCapitalSolo3LotesSem7 || tes.capitalTrabajoPicoSem7 || 31212600);
    const picoContinuoCop = Number(kpiInd.picoCapitalContinuoSem7 || picoSolo3LCop);
    const cadenciaDias = Number(cont.config?.cadenciaDias || 18);
    const arriendoProrrateadoContCop = Math.round(Number(precios.arriendoRegMes || 1000000) * (cadenciaDias / (365 / 12)));
    const utilLoteContPreArr = Number(cont.loteModelo?.utilidadCanal || 0);
    const utilLoteContNetoArr = utilLoteContPreArr - arriendoProrrateadoContCop;

    // Escenario Base vs Escenario Ácido Realista (-1.5% merma fría, $350/kg logística/hielo + Terios, -$500/kg desc., +3% desvío alim)
    const mermaAcidaPct = 0.015;
    const descuentoAcidoKgCop = 500;
    const logisticaAcidaKgCop = 350 + Math.round(Number(trans.costoTransportePorKgCanalCop || 0));
    const sobrecostoAlimPct = 0.03;

    const kgCanal3L = Number(cons3.kgCanalVend || 0);
    const kgCanalAcido3L = kgCanal3L * (1 - mermaAcidaPct);
    const precioAcidoKg = Math.max(0, Number(precios.precioCanalKg || 11500) - descuentoAcidoKgCop);
    const ingresoAcido3L = kgCanalAcido3L * precioAcidoKg;
    const costoAlim3 = Number(l1.costoAlimento || 0) + Number(l2.costoAlimento || 0) + Number(l3.costoAlimento || 0);
    const costosExtraAcido3L = kgCanalAcido3L * logisticaAcidaKgCop + costoAlim3 * sobrecostoAlimPct;
    const utilidadAcida3LCop = Math.round(ingresoAcido3L - (Number(cons3.costoCanalTot || 0) + costosExtraAcido3L));
    const cajaPost4mAcidaCop = Math.round(utilidadAcida3LCop - Number(precios.arriendoIniMes || 750000));
    const roiPicoAcido3LPct = picoSolo3LCop > 0 ? cajaPost4mAcidaCop / picoSolo3LCop : 0;

    // Preventa real confirmada Lote 1 & Presión Física en El Zulia
    const mixL1Aves = Number((state.ajustesVentaLotes && state.ajustesVentaLotes['lote-1'] && state.ajustesVentaLotes['lote-1'].tramoEspecialAves) || 0);
    const parcialL1Aves = Number(vRes.totalAvesVendidas || 0);
    const avesPrevendidasL1 = Math.min(Number(l1.avesFin || 582), mixL1Aves + parcialL1Aves);
    const pctPreventaL1 = Number(l1.avesFin || 582) > 0 ? avesPrevendidasL1 / Number(l1.avesFin || 582) : 0;
    const metaPreventa70Aves = Math.ceil(Number(l1.avesFin || 582) * 0.70);

    const areaPorSeccionM2 = Number(term.areaPorSeccionM2 || (Number(params.areaGalponM2 || 280) / 3));
    const avesFin800 = Number(l2.avesFin || 776);
    const densidad42dSeccionKgM2 = Number(term.densidadPicoSeccionKgM2 || 0);
    const densidad45dSeccionKgM2 = areaPorSeccionM2 > 0
      ? (avesFin800 * ((ROSS_PESO_G[45] / 1000) * (1 + Number(params.factorClimaCucutaPct || 0)))) / areaPorSeccionM2
      : 0;
    const avesFin900 = Number(cont.loteModelo?.avesFin || 873);
    const densidad900SeccionKgM2 = areaPorSeccionM2 > 0
      ? (avesFin900 * ((ROSS_PESO_G[Number(cont.config?.edadObjetivoDias || 42)] / 1000) * (1 + Number(params.factorClimaCucutaPct || 0)))) / areaPorSeccionM2
      : 0;
    const avesEntresaca42d800 = densidad42dSeccionKgM2 > 24 && Number(l2.pesoVivoAveKg || 2.995) > 0
      ? Math.max(0, Math.ceil(((densidad42dSeccionKgM2 - 22) * areaPorSeccionM2) / Number(l2.pesoVivoAveKg || 2.995)))
      : 0;
    const avesEntresaca900 = densidad900SeccionKgM2 > 24
      ? Math.max(0, Math.ceil(((densidad900SeccionKgM2 - 22) * areaPorSeccionM2) / 2.995))
      : 0;

    const eqKgCanal3L = Number(kpiInd.puntoEquilibrioKgCanal3Lotes || cons3.costoKgCanal || 7695);
    const precioCanalActual = Number(precios.precioCanalKg || 11500);
    const colchonPrecioPct = precioCanalActual > 0 ? Math.max(0, (precioCanalActual - eqKgCanal3L) / precioCanalActual) : 0;
    const impactoAlimMas10Pct3LCop = -Math.round(costoAlim3 * 0.10);

    const lote2IngresoEnDias = diffDaysIso(hoyIso, l2FechaEnt);
    const lote3IngresoEnDias = diffDaysIso(hoyIso, l3FechaEnt);
    const lote1SalidaEnDias = diffDaysIso(hoyIso, l1FechaSal);

    const top3DecisionesSemana = [
      {
        prioridad: 1,
        titulo: tieneCegueraOperativa
          ? `Corregir racha sin reporte (${diasSinReporte}d vacíos en Lote 1)`
          : (pesajesVencidosSinMedir.length > 0
            ? `Pesar muestra vencida Día ${pesajesVencidosSinMedir[0]}`
            : `Preparar 1.er pesaje obligatorio Día ${proxPesajeDia}`),
        fechaLimite: tieneCegueraOperativa ? 'Hoy' : proxPesajeFecha,
        detalle: tieneCegueraOperativa
          ? `Hoy es Día ${diaCicloL1} (${avesVivasHoy} pollos vivos reales): confirma mortalidad, agua y alimento en piso (quedan ~${Math.abs(bultosEtapaActivaRestantes - Math.round(bultosEtapaActivaRestantes)) < 0.15 ? Math.round(bultosEtapaActivaRestantes) : bultosEtapaActivaRestantes.toFixed(1).replace('.', ',')} bultos ${etapaActivaMaterial}).`
          : `Muestra de 30 aves el ${proxPesajeFecha} (meta ${metaRossProxG} g/ave = ${(metaRossProxG * 30 / 1000).toFixed(2)} kg) para activar IEP y FCR reales.`,
        targetSection: 'bitacora_pesajes',
        badge: tieneCegueraOperativa ? 'Urgente hoy' : `En ${Math.max(0, proxPesajeDia - diaCicloL1)}d`
      },
      {
        prioridad: 2,
        titulo: lote2IngresoEnDias >= 0 && lote2IngresoEnDias <= 14
          ? `Confirmar giro y pollito Lote 2 (${l2.avesInic || 800} aves @ $${Math.round(precios.pollitoBmanga || 3200).toLocaleString('es-CO')})`
          : `Asegurar abastecimiento JIT (${porComprarJitTotal} bultos pendientes Sem 2–6)`,
        fechaLimite: l2FechaEnt,
        detalle: `Compromiso Sem 3 el ${l2FechaEnt} (${lote2IngresoEnDias >= 0 ? `en ${lote2IngresoEnDias} días` : 'fecha cumplida'}): $${Math.round(giroSem3Cop).toLocaleString('es-CO')} totales de flujo (ahorro directo de $1.040.000 vs local).`,
        targetSection: 'operacion_av2',
        badge: lote2IngresoEnDias >= 0 ? `En ${lote2IngresoEnDias}d` : 'Activo'
      },
      {
        prioridad: 3,
        titulo: `Blindar preventa Navideña (${avesPrevendidasL1}/${l1.avesFin || 582} aves)`,
        fechaLimite: addDaysIso(l1FechaEnt, 27),
        detalle: `Meta: amarrar ${metaPreventa70Aves} aves (70%) antes del Día 28 según peso pedido por clientes (22-dic Día 40 = 2,79 kg vivo / 24-dic Día 42 = 3,00 kg) sobre costo real de $${Math.round(kpiInd.puntoEquilibrioKgCanal3Lotes || 7695).toLocaleString('es-CO')}/kg canal.`,
        targetSection: 'bitacora_pesajes',
        badge: `${Math.round(pctPreventaL1 * 100)}% prev.`
      }
    ];

    const picoFechaIso = addDaysIso(l1FechaSal, -1);
    const picoFechaCorta = formatShortDateEs(picoFechaIso);
    const cobroL1FechaCorta = formatShortDateEs(l1FechaSal);
    const extractEndShortDate = (w, fallbackIso) => {
      const etq = String((w && w.etiqueta) || '');
      const cobroMatch = etq.match(/COBRO\s+LOTE\s+\d+\s*\((\d{2}-[a-z]{3})/i);
      if (cobroMatch && cobroMatch[1]) return cobroMatch[1].toLowerCase();
      const m = etq.match(/\(([^)]+)\)/);
      if (m && m[1]) {
        const inner = m[1].trim();
        const parts = inner.split(/\s+a\s+/i);
        const tail = parts[parts.length - 1].trim();
        const sameMonth = tail.match(/^(\d{2})-(\d{2})\s+([a-z]{3})$/i);
        if (sameMonth) return `${sameMonth[2]}-${sameMonth[3].toLowerCase()}`;
        return tail.replace(/\s+/g, '-').toLowerCase();
      }
      return fallbackIso ? formatShortDateEs(fallbackIso) : `Sem ${w?.semana || ''}`;
    };
    const pb3Sem = Number(kpiInd.breakEvenCaja3LotesSem || 10);
    const pbContSem = Number(kpiInd.breakEvenCajaContinuoSem || 12);
    const payback3LotesFechaCorta = extractEndShortDate(flujo[pb3Sem - 1], l3.fechaSalida || '2027-01-15');
    const paybackContinuoFechaCorta = extractEndShortDate(
      contFlujo[pbContSem - 1],
      (cont.lotesProyectados && cont.lotesProyectados[0] && cont.lotesProyectados[0].fechaSalida) || '2027-02-06'
    );
    const cajaFinalContFechaCorta = contFlujo.length
      ? extractEndShortDate(contFlujo[contFlujo.length - 1], '2027-03-20')
      : '30-ene';

    return {
      estadoCampoHoy: {
        hoyIso,
        diaCicloL1,
        edadMetaL1: l1Edad,
        diasTranscurridos,
        diasReportadosEnVentana,
        diasSinReporte,
        tieneCegueraOperativa,
        ultimoDiaConReporte: ultDiaObj ? ultDiaObj.dia : null,
        avesNominalesCompradas: l1Counts.avesNominales,
        avesRecibidasReales: l1Counts.avesRecibidasReales,
        avesExtrasLlegada: l1Counts.avesExtrasLlegada,
        avesVivasReportadasHoy: avesVivasHoy,
        bajasReportadasReales: Number(bit.bajasAcumReales || 0),
        consumoTeoricoAcumAveG: consTeoricoAcumAveG,
        consumoTeoricoAcumLoteKg: Number(consumoTeoricoAcumLoteKg.toFixed(1)),
        bultosTeoricosConsumidosHoy: Number(bultosTeoricosConsumidosHoy.toFixed(2)),
        bultosCompradosInicio: bultosCompradosTotal,
        bultosRestantesPisoHoy: Number(bultosRestantesPisoHoy.toFixed(2)),
        masterRestantesPiso: Number(masterRestantesPiso.toFixed(2)),
        nutreRestantesPiso: Number(nutreRestantesPiso.toFixed(2)),
        broilerRestantesPiso: Number(broilerRestantesPiso.toFixed(2)),
        etapaActivaMaterial,
        etapaActivaBadge,
        bultosEtapaActivaRestantes: Number(bultosEtapaActivaRestantes.toFixed(2)),
        bultosEtapaActivaComprados,
        porComprarJitTotal,
        porComprarJitNutre,
        porComprarJitBroiler,
        proximaCompraJit,
        pesajesVencidosSinMedir,
        proxPesajeDia,
        proxPesajeFecha,
        metaRossProxG,
        lote2FechaEnt: l2FechaEnt,
        lote3FechaEnt: l3FechaEnt,
        l1FechaSal,
        lote2IngresoEnDias,
        lote3IngresoEnDias,
        lote1SalidaEnDias
      },
      tesoreriaViva: {
        comprometidoArranqueRealCop,
        inversionBodegaInicialCop,
        giroSem3Cop: Math.round(giroSem3Cop),
        giroSem4Cop: Math.round(giroSem4Cop),
        giroSem5a7Solo3LCop: Math.round(giroSem5a7Solo3LCop),
        giroSem5a7ContCop: Math.round(giroSem5a7ContCop),
        picoSolo3LCop: Math.round(picoSolo3LCop),
        picoContinuoCop: Math.round(picoContinuoCop),
        picoFechaIso,
        picoFechaCorta,
        picoReferenciaCorta: `${picoFechaCorta} (Víspera 1.ª cosecha · Día ${Math.max(1, l1Edad - 1)} L1)`,
        cobroL1FechaCorta,
        payback3LotesSem: pb3Sem,
        payback3LotesFechaCorta,
        paybackContinuoSem: pbContSem,
        paybackContinuoFechaCorta,
        cajaFinalContFechaCorta,
        roiSobrePico3LotesPct: Number(kpiInd.roiSobrePico3LotesPct || 0),
        roiSobrePicoContinuoSem18Pct: Number(kpiInd.roiSobrePicoContinuoSem18Pct || 0),
        arriendoProrrateadoContCop,
        utilLoteContPreArr: Math.round(utilLoteContPreArr),
        utilLoteContNetoArr: Math.round(utilLoteContNetoArr),
        cajaSem18ContinuoCop: Math.round(Number(cont.saldoFinalContinuo || 0))
      },
      escenarioAcido: {
        mermaAcidaPct,
        descuentoAcidoKgCop,
        logisticaAcidaKgCop,
        sobrecostoAlimPct,
        utilidadBase3LCop: Math.round(Number(cons3.utilidadCanal || 0)),
        cajaPost4mBaseCop: Math.round(Number(tes.saldoFinalPost4m || 0)),
        utilidadAcida3LCop: utilidadAcida3LCop,
        cajaPost4mAcidaCop,
        roiPicoAcido3LPct,
        deltaBaseVsAcidoCop: Math.round(Number(cons3.utilidadCanal || 0)) - utilidadAcida3LCop
      },
      riesgosYDecisiones: {
        avesPrevendidasL1,
        avesL1Objetivo: Number(l1.avesFin || 582),
        pctPreventaL1,
        metaPreventa70Aves,
        precioCanalActual,
        precioEquilibrioKgCanal3L: Math.round(eqKgCanal3L),
        colchonPrecioPct,
        precioPisoBatnaCanalKg: Math.round(Number(kpiInd.precioIndiferenciaCanalVsVivo || 9577)),
        alimentoPctSobreCostoCanal: Number(kpiInd.alimentoPctSobreCostoCanal3Lotes || 0.572),
        impactoAlimMas10Pct3LCop,
        densidad42dSeccionKgM2: Number(densidad42dSeccionKgM2.toFixed(2)),
        densidad45dSeccionKgM2: Number(densidad45dSeccionKgM2.toFixed(2)),
        densidad900SeccionKgM2: Number(densidad900SeccionKgM2.toFixed(2)),
        areaGalponM2: Number(params.areaGalponM2 || 280),
        areaMedidaVerificada: Boolean(params.areaMedidaVerificada),
        capacidadDeclaradaSeccionAves: Number(params.capacidadDeclaradaSeccionAves || 900),
        avesEntresaca42d800,
        avesEntresaca900,
        top3DecisionesSemana
      }
    };
  }

  /**
   * ============================================================================
   * FASE G.1 — PERFILES MULTI-ESTIRPE, DETECTOR TOC (GOLDRATT) Y 5 SIMULACIONES WOW
   * ============================================================================
   */
  const BROILER_STRAIN_PROFILES = Object.freeze({
    ross_308_ap: Object.freeze({
      id: 'ross_308_ap',
      nombre: 'Ross 308 AP (Aviagen)',
      ventajaPrincipal: 'Máxima eficiencia alimenticia (FCR) y crecimiento acelerado bajo microclima controlado',
      weightMultiplier42d: 1.0,
      fcrDeltaBase: 0.0,
      pechugaPctCanal: 0.34,
      pernilMusloPctCanal: 0.31,
      alasPctCanal: 0.11,
      espinazoPctCanal: 0.16,
      menudenciaPctCanal: 0.08,
      heatToleranceIndex: 0.72,
      thiThresholdCritico: 77.5,
      sidLysineFinisherPct: 1.08,
      mortalidadBasePct: 0.03
    }),
    cobb_500: Object.freeze({
      id: 'cobb_500',
      nombre: 'Cobb 500 (Cobb-Vantress)',
      ventajaPrincipal: 'Mayor rendimiento de pechuga (+1,4% sobre canal) y mejor respuesta en dietas de menor densidad y clima cálido',
      weightMultiplier42d: 0.992,
      fcrDeltaBase: 0.015,
      pechugaPctCanal: 0.354,
      pernilMusloPctCanal: 0.302,
      alasPctCanal: 0.108,
      espinazoPctCanal: 0.156,
      menudenciaPctCanal: 0.08,
      heatToleranceIndex: 0.81,
      thiThresholdCritico: 79.0,
      sidLysineFinisherPct: 1.05,
      mortalidadBasePct: 0.028
    }),
    hubbard: Object.freeze({
      id: 'hubbard',
      nombre: 'Hubbard Efficiency Plus / Tropical',
      ventajaPrincipal: 'Alta rusticidad esquelética e inmunológica y máxima supervivencia bajo estrés térmico en galpón abierto',
      weightMultiplier42d: 0.955,
      fcrDeltaBase: 0.06,
      pechugaPctCanal: 0.326,
      pernilMusloPctCanal: 0.322,
      alasPctCanal: 0.114,
      espinazoPctCanal: 0.158,
      menudenciaPctCanal: 0.08,
      heatToleranceIndex: 0.9,
      thiThresholdCritico: 81.0,
      sidLysineFinisherPct: 1.0,
      mortalidadBasePct: 0.022
    })
  });

  /**
   * Detector de Restricción Activa del Sistema (Teoría de Restricciones — Goldratt TOC + Throughput Accounting).
   */
  function computeActiveSystemConstraint(stateInput, computedInput) {
    const state = stateInput && stateInput.parametrosGenerales ? stateInput : createDefaultTwinState();
    const computed = computedInput || computeFullTwin(state);
    const bsc = (computed.av2 && computed.av2.scorecardBsc) || computeFarmScorecardKPIs(state, computed);
    const fin = bsc.financiera;
    const cli = bsc.clienteMercado;
    const proc = bsc.procesosInternos;
    const apr = bsc.aprendizajeCampo;

    const candidates = [
      {
        id: 'galpon_densidad_termica',
        titulo: 'Restricción Física y Térmica de Galpón (El Zulia ~220 msnm)',
        severidadScore: proc.densidadSeccionKgM2 > 24 ? 92 : proc.densidadSeccionKgM2 > 21 ? 74 : 40,
        indicadorActual: `${proc.densidadSeccionKgM2.toFixed(2)} kg/m² por sección (umbral crítico 24,00 kg/m²)`,
        accionExplotar: 'Programar entresaca temprana (Día 36–38) de 150–200 aves livianas/hembras y asegurar velocidad de aire >= 2,0 m/s en horas pico (11:00–15:30).',
        accionSubordinar: 'No extender edad de cosecha (>42d) sin haber liberado al menos 20% de biomasa previa en la sección.'
      },
      {
        id: 'capital_trabajo_sem7',
        titulo: 'Restricción Financiera de Tope de Caja al 23-Dic (Víspera Cosecha L1)',
        severidadScore: fin.picoCapitalSem7Cop > 30000000 ? 86 : 55,
        indicadorActual: `Tope caja 23-dic (D41 L1 · un día antes de cobrar 24-dic): -$${Math.round(fin.picoCapitalSem7Cop).toLocaleString('es-CO')} COP`,
        accionExplotar: 'Comprar alimento Solla estrictamente bajo Kanban JIT semanal y cobrar ventas de Lote 1 de contado en Día 1 para financiar el traslape de Lotes 2 y 3.',
        accionSubordinar: 'Evitar inmovilizar caja en inventario anticipado de engorde o en ventas a crédito sin respaldo.'
      },
      {
        id: 'bodega_jit_alimento',
        titulo: 'Restricción de Abastecimiento JIT Solla y Cierre Logístico Terios',
        severidadScore: (proc.status === 'ambar' && proc.bultosFaltantesJit > 0) || apr.viajesAbiertos > 0 ? 78 : 30,
        indicadorActual: `${proc.bultosPisoLote1} bultos comprados en granja (${proc.bultosFaltantesJit} JIT Sem 2–6) · ${apr.viajesAbiertos} viajes Terios abiertos`,
        accionExplotar: 'Pedir Nutrepollo Cr SP antes del Día 8 (20-nov) y Broiler I Dorado escalonado desde Sem 4 sin inmovilizar capital, cerrando odómetro Terios el mismo día.',
        accionSubordinar: 'No despachar viajes parciales con baja ocupación de carga útil.'
      },
      {
        id: 'colocacion_desposte_frio',
        titulo: 'Restricción Comercial de Rotación del 66% No-Pechuga en Frío (<48h)',
        severidadScore: 68,
        indicadorActual: `66% del peso en canal fuera de pechuga (pernil/muslo 31%, alas 11%, espinazo 16%, menudencia 8%)`,
        accionExplotar: 'Priorizar venta en canal completo con menudencias ($11.500/kg) como ancla de liquidez y aceptar desposte solo con preventa amarrada del resto del ave.',
        accionSubordinar: 'Nunca despostar un lote entero solo por colocar pechugas sueltas sin comprador firme para pernil, alas y espinazo.'
      }
    ];

    candidates.sort((a, b) => b.severidadScore - a.severidadScore);
    const primary = candidates[0];
    const utilidadCiclo900 = Number(computed.av2?.continuoResumen?.loteModelo?.utilidadCanal || 9660950);
    const throughputPorDia = Math.round(utilidadCiclo900 / Math.max(1, Number(state.continuoConfig?.cadenciaDias || 18)));
    const areaSeccionDinamica = Math.max(1, Number(state.parametrosGenerales?.areaGalponM2 || 280) / 3);
    const throughputPorM2Seccion = Math.round(utilidadCiclo900 / areaSeccionDinamica);

    const capasEstrategicasVision = {
      peterDrucker: {
        capa: 'Peter Drucker · Eficacia Ejecutiva y Propósito de Cliente',
        diagnosticoVivo: `Primero hacer lo correcto: enfocar la semana en "${primary.titulo}" donde cada día de flujo continuo protege ~$${throughputPorDia.toLocaleString('es-CO')} COP de Throughput neto para sostener frescura real al cliente final ($${Math.round(cli.precioBaseCanalKg).toLocaleString('es-CO')}/kg canal).`
      },
      ritaMcGrath: {
        capa: 'Rita McGrath · Ventajas Temporales & Discovery-Driven Planning',
        diagnosticoVivo: `Tu ventaja en compra directa ($${Math.round(state.preciosRegionales.pollitoBmanga).toLocaleString('es-CO')}/pollito) y frescura local en El Zulia debe tratarse como temporal: vigilar puntos de inflexión (densidad ${proc.densidadSeccionKgM2.toFixed(2)} kg/m², cadencia ${state.continuoConfig?.cadenciaDias || 18} días y faltantes JIT ${proc.bultosFaltantesJit}) antes de escalar.`
      },
      alexOsterwalder: {
        capa: 'Alex Osterwalder · Business Model Canvas & Portafolio Ambidiestro',
        diagnosticoVivo: `Motor Explotar: canal entero con menudencias (margen Lote 1 ${(fin.margenNetoLote1Pct * 100).toFixed(1)}%, caja acumulada Sem 18 $${Math.round(fin.cajaAcumSem18Cop).toLocaleString('es-CO')} COP). Motor Explorar: desposte selectivo (+$${Math.round(cli.piezas100ExtraCop).toLocaleString('es-CO')} COP potenciales) únicamente con rotación <48h validada del 66% restante.`
      },
      amyEdmondson: {
        capa: 'Amy Edmondson · Seguridad Psicológica y Zona de Aprendizaje',
        diagnosticoVivo: `Registro actual en campo: ${apr.diasRegistrados} días en bitácora, ${apr.pesajesCount} pesajes y ${apr.viajesAbiertos} viaje(s) Terios abiertos. Exigir altos estándares técnicos con cero castigo por reportar temprano bajas, jadeo o retrasos convierte errores tempranos en aprendizaje preventivo.`
      },
      ethanMollick: {
        capa: 'Ethan Mollick · Co-Inteligencia Humano + IA (Centauro/Cyborg)',
        diagnosticoVivo: `Operación Centauro en vivo: tú aportas observación táctil del galpón y negociación presencial; Visión y Avi auditan en tiempo real 5 simuladores causales y juntas Elephant–Goldfish para eliminar sesgos antes de decidir.`
      }
    };

    return {
      primaryConstraint: primary,
      constraintsRanked: candidates,
      throughputAccounting: {
        utilidadNetaLoteContinuo900Cop: Math.round(utilidadCiclo900),
        throughputDiarioSistemaCop: throughputPorDia,
        throughputPorM2SeccionCop: throughputPorM2Seccion
      },
      capasEstrategicasVision,
      goldrattFiveSteps: [
        `1. IDENTIFICAR: Hoy el cuello de botella dominante es "${primary.titulo}" (${primary.indicadorActual}).`,
        `2. EXPLOTAR: ${primary.accionExplotar}`,
        `3. SUBORDINAR: ${primary.accionSubordinar}`,
        `4. ELEVAR: Una vez estabilizados los primeros 3 lotes (${Math.round(fin.cajaAcumSem18Cop).toLocaleString('es-CO')} COP en Sem 18), reinvertir en ventilación/flujo continuo de 900 aves.`,
        `5. EVITAR INERCIA: Al cambiar de estación climática o cadencia (18d -> 15d), recalcular inmediatamente qué restricción pasa al primer lugar.`
      ],
      capsulaAprendizajeGerencial: {
        concepto: 'Visión (Síntesis Drucker · McGrath · Osterwalder · Edmondson · Mollick & Goldratt TOC)',
        explicacionPractica: `En gerencia de excelencia agroindustrial, Drucker enseña a priorizar la eficacia sobre la restricción TOC ("${primary.titulo}", ~$${throughputPorDia.toLocaleString('es-CO')} COP/día), McGrath exige validar supuestos porque toda ventaja es temporal, Osterwalder protege el motor líquido del Business Model Canvas mientras explora valor agregado, Edmondson blinda la transparencia temprana del equipo en galpón y Mollick multiplica tu criterio usando IA como co-inteligencia.`
      }
    };
  }

  /**
   * SIMULACIÓN WOW #1: Comparador Multi-Estirpe (Ross 308 AP vs Cobb 500 vs Hubbard) y Estrés Térmico THI en El Zulia.
   * Ejecución 100% Solo Lectura (no muta el estado).
   */
  function simulateStrainAndClimateScenario(baseState, options = {}) {
    const state = baseState && baseState.parametrosGenerales ? baseState : createDefaultTwinState();
    const estirpeKeyRaw = String(options.estirpe || 'ross_308_ap').toLowerCase().trim();
    const estirpeSeleccionada = BROILER_STRAIN_PROFILES[estirpeKeyRaw] ? estirpeKeyRaw : 'ross_308_ap';
    const tempC = Number.isFinite(Number(options.tempC)) ? Math.min(42, Math.max(18, Number(options.tempC))) : 31.5;
    const humedadRelPct = Number.isFinite(Number(options.humedadRelPct))
      ? Math.min(98, Math.max(30, Number(options.humedadRelPct)))
      : 68;
    const velocidadAireMs = Number.isFinite(Number(options.velocidadAireMs))
      ? Math.min(4.0, Math.max(0.1, Number(options.velocidadAireMs)))
      : 1.8;
    const edadObjetivoDias = Number.isFinite(Number(options.edadObjetivoDias))
      ? Math.min(49, Math.max(28, Math.round(Number(options.edadObjetivoDias))))
      : Number(state.parametrosGenerales.edadObjetivoDias || 42);
    const loteAves = Number.isFinite(Number(options.loteAves))
      ? Math.max(100, Math.round(Number(options.loteAves)))
      : 800;
    const avesEntresacaDia38 = Number.isFinite(Number(options.avesEntresacaDia38))
      ? Math.min(Math.floor(loteAves * 0.4), Math.max(0, Math.round(Number(options.avesEntresacaDia38))))
      : 0;

    // Índice Temperatura-Humedad (THI estándar zootécnico escala 65–95: Thom / NRC adaptado a pollos)
    const thiBruto = Number((0.8 * tempC + (humedadRelPct / 100) * (tempC - 14.4) + 46.4).toFixed(2));
    const enfriamientoEvaporativoBloqueado = humedadRelPct >= 75;
    const efectoVientoGrados = Math.min(4.2, 1.75 * Math.sqrt(velocidadAireMs));
    const tempEfectivaAveC = Number((tempC - efectoVientoGrados + (humedadRelPct > 70 ? (humedadRelPct - 70) * 0.08 : 0)).toFixed(2));
    const thiEfectivo = Number((thiBruto - efectoVientoGrados * 1.45).toFixed(2));

    const pesoBaseRossKg = (ROSS_PESO_G[edadObjetivoDias] || ROSS_PESO_G[42]) / 1000;
    const consBaseRossKg = (ROSS_CONS_ACUM_G[edadObjetivoDias - 1] || ROSS_CONS_ACUM_G[41]) / 1000;
    const fcrBaseRoss = consBaseRossKg / Math.max(0.1, pesoBaseRossKg);
    const precioCanalKg = Number(state.preciosRegionales.precioCanalKg || 11500);
    const precioPechugaKg = Number(state.desposteConfig?.precioPechugaKg || 14500);
    const costoKgAlimentoProm = 109125 / 40; // ~$2.728/kg Solla promedio

    const areaSeccionM2 = 93.33;
    const comparativaEstirpes = Object.values(BROILER_STRAIN_PROFILES).map((prof) => {
      const excesoThi = Math.max(0, thiEfectivo - prof.thiThresholdCritico);
      const penalizacionPesoTermica = Math.min(0.16, excesoThi * 0.014 * (1 - prof.heatToleranceIndex * 0.45));
      const penalizacionFcrTermica = excesoThi * 0.018 * (1 - prof.heatToleranceIndex * 0.4);
      const alivioEntresacaFactor = avesEntresacaDia38 > 0 ? Math.min(0.45, (avesEntresacaDia38 / loteAves) * 1.35) : 0;

      const pesoVivoFinalKg = Number(
        (pesoBaseRossKg * prof.weightMultiplier42d * (1 - penalizacionPesoTermica * (1 - alivioEntresacaFactor))).toFixed(3)
      );
      const fcrAjustado = Number(
        (fcrBaseRoss + prof.fcrDeltaBase + penalizacionFcrTermica * (1 - alivioEntresacaFactor)).toFixed(3)
      );
      const mortalidadAjustadaPct = Number(
        Math.min(0.12, prof.mortalidadBasePct + (excesoThi > 0 ? excesoThi * 0.0032 * (1 - alivioEntresacaFactor) : 0)).toFixed(4)
      );

      const avesFinalesTotal = Math.round(loteAves * (1 - mortalidadAjustadaPct));
      const avesCosechaFinal = Math.max(0, avesFinalesTotal - avesEntresacaDia38);
      const biomasaPicoSeccionKg = Number((avesCosechaFinal * pesoVivoFinalKg).toFixed(1));
      const densidadSeccionKgM2 = Number((biomasaPicoSeccionKg / areaSeccionM2).toFixed(2));

      const rendCanalPct = getRendimientoSecoRoss(pesoVivoFinalKg) + 0.077;
      const pesoCanalAveKg = Number((pesoVivoFinalKg * rendCanalPct).toFixed(3));
      const pesoPechugaAveKg = Number((pesoCanalAveKg * prof.pechugaPctCanal).toFixed(3));

      // Si hay entresaca al Día 38 (~2.59 kg vivo Ross base)
      const pesoVivo38Kg = (ROSS_PESO_G[38] / 1000) * prof.weightMultiplier42d;
      const pesoCanal38Kg = pesoVivo38Kg * (getRendimientoSecoRoss(pesoVivo38Kg) + 0.077);
      const kgCanalTotal = avesCosechaFinal * pesoCanalAveKg + avesEntresacaDia38 * pesoCanal38Kg;
      const kgPechugaTotal = kgCanalTotal * prof.pechugaPctCanal;

      const consumoAlimentoTotalKg =
        avesCosechaFinal * pesoVivoFinalKg * fcrAjustado +
        avesEntresacaDia38 * pesoVivo38Kg * Math.max(1.48, fcrAjustado - 0.08);
      const costoAlimentoCop = Math.round(consumoAlimentoTotalKg * costoKgAlimentoProm);
      const otrosCostosAvesCop = Math.round(loteAves * (3200 + 2150)); // Pollito directo + cama/gas/sanidad/beneficio
      const ingresoCanalCop = Math.round(kgCanalTotal * precioCanalKg);
      const plusPotencialPechugaCop = Math.round(kgPechugaTotal * (precioPechugaKg - precioCanalKg) * 0.5);
      const utilidadNetaCanalCop = ingresoCanalCop - costoAlimentoCop - otrosCostosAvesCop;

      const sidLysineRecomendadaPct = Number(
        (prof.sidLysineFinisherPct + (excesoThi > 1.5 ? 0.06 : excesoThi > 0 ? 0.03 : 0)).toFixed(2)
      );

      return {
        estirpe: prof.id,
        nombre: prof.nombre,
        ventajaPrincipal: prof.ventajaPrincipal,
        pesoVivoFinalKg,
        pesoCanalAveKg,
        pesoPechugaAveKg,
        fcrAjustado,
        mortalidadPct: Number((mortalidadAjustadaPct * 100).toFixed(2)),
        avesCosechadas: avesFinalesTotal,
        densidadSeccionKgM2,
        alertaDensidad: densidadSeccionKgM2 > 24,
        kgCanalTotal: Number(kgCanalTotal.toFixed(1)),
        kgPechugaTotal: Number(kgPechugaTotal.toFixed(1)),
        sidLysineRecomendadaPct,
        costoAlimentoCop,
        ingresoCanalCop,
        utilidadNetaCanalCop,
        plusPotencialPechugaCop
      };
    });

    const seleccionada = comparativaEstirpes.find((x) => x.estirpe === estirpeSeleccionada) || comparativaEstirpes[0];
    const mejorUtilidad = [...comparativaEstirpes].sort((a, b) => b.utilidadNetaCanalCop - a.utilidadNetaCanalCop)[0];
    const mejorPechuga = [...comparativaEstirpes].sort((a, b) => b.kgPechugaTotal - a.kgPechugaTotal)[0];

    return {
      readOnlySimulation: true,
      simulacionId: 'SIM_1_MULTI_ESTIRPE_CLIMA_THI',
      parametros: {
        estirpeSeleccionada,
        tempC,
        humedadRelPct,
        velocidadAireMs,
        edadObjetivoDias,
        loteAves,
        avesEntresacaDia38
      },
      microclimaElZulia: {
        thiBruto,
        thiEfectivo,
        tempEfectivaAveC,
        enfriamientoEvaporativoBloqueado,
        estadoTermico: thiEfectivo >= 80 ? 'ESTRES_SEVERO' : thiEfectivo >= 77.5 ? 'ALERTA_TERMICA' : 'CONFORT_OPERATIVO',
        relacionAguaAlimentoEsperada: thiEfectivo >= 78 ? '2,1 a 2,4 : 1 (agua fresca <24°C + electrolitos DEB)' : '1,8 a 2,0 : 1',
        recomendacionVentilacion: enfriamientoEvaporativoBloqueado
          ? 'ATENCIÓN: Humedad >=75% bloquea el enfriamiento por nebulización; NO mojar cama, priorizar velocidad de aire (>=2,2 m/s) y raleo.'
          : 'Mantener cortinas abiertas, circulación de aire >=1,8 m/s y nebulización intermitente solo en horas de baja humedad (11:30–15:00).'
      },
      resultadoSeleccionado: seleccionada,
      comparativaEstirpes,
      sintesisCompetitiva: {
        mejorUtilidadCanal: `${mejorUtilidad.nombre} ($${mejorUtilidad.utilidadNetaCanalCop.toLocaleString('es-CO')} COP)`,
        mayorVolumenPechuga: `${mejorPechuga.nombre} (${mejorPechuga.kgPechugaTotal} kg pechuga)`
      },
      capsulaAprendizajeGerencial: {
        autor: 'Visión (MSc Ing. Industrial · MBA) & Dra. Valeria (Avicultura Multi-Estirpe)',
        leccion: `Bajo un THI efectivo de ${thiEfectivo} en El Zulia, la genética interactúa con la termodinámica del galpón: Ross 308 lidera eficiencia si controlas temperatura y aminoácidos SID, Cobb 500 entrega +1,4% más pechuga y soporta mejor dietas económicas, y Hubbard protege supervivencia en calor severo. Si la densidad supera 24 kg/m² (${seleccionada.densidadSeccionKgM2} kg/m²), programar entresaca al Día 38 libera espacio vital y evita destruir el FCR de las últimas 96 horas.`
      }
    };
  }

  /**
   * SIMULACIÓN WOW #2: Ingeniería de Portafolio B2B (Kasavana & Smith), Curva Gabor-Granger y Embudo 95-5 (Ehrenberg-Bass).
   * Ejecución 100% Solo Lectura.
   */
  function simulatePortfolioAndPricingB2B(baseState, options = {}) {
    const state = baseState && baseState.parametrosGenerales ? baseState : createDefaultTwinState();
    const volumenAves = Number.isFinite(Number(options.volumenAves))
      ? Math.max(50, Math.round(Number(options.volumenAves)))
      : 600;
    const edadObjetivoDias = Number.isFinite(Number(options.edadObjetivoDias))
      ? Math.min(49, Math.max(28, Math.round(Number(options.edadObjetivoDias))))
      : 42;
    const estirpeRaw = String(options.estirpe || 'ross_308_ap').toLowerCase().trim();
    const estirpeKey = BROILER_STRAIN_PROFILES[estirpeRaw] ? estirpeRaw : 'ross_308_ap';
    const prof = BROILER_STRAIN_PROFILES[estirpeKey];
    const rawColocNum = Number(options.colocacionRemanente48hPct);
    const normalizedColoc = rawColocNum > 1 ? rawColocNum / 100 : rawColocNum;
    const colocacionRemanente48hPct = Number.isFinite(rawColocNum)
      ? Math.min(1, Math.max(0.2, normalizedColoc))
      : 0.85;
    const clientesActivosActuales = Number.isFinite(Number(options.clientesActivosActuales))
      ? Math.max(1, Math.round(Number(options.clientesActivosActuales)))
      : 4;

    const pesoVivoKg = ((ROSS_PESO_G[edadObjetivoDias] || ROSS_PESO_G[42]) / 1000) * prof.weightMultiplier42d;
    const pesoCanalAveKg = pesoVivoKg * (getRendimientoSecoRoss(pesoVivoKg) + 0.077);
    const totalKgCanal = volumenAves * pesoCanalAveKg;
    const costoKgCanalBase = Number(state.continuoConfig ? 7488 : 8247);

    const desp = state.desposteConfig || {};
    const cortesRaw = [
      {
        id: 'canal_entero',
        nombre: 'Pollo Beneficiado en Canal con Menudencias (Producto Ancla)',
        pctSobreCanal: 1.0,
        precioKgCop: Number(state.preciosRegionales.precioCanalKg || 11500),
        costoAsignadoKgCop: costoKgCanalBase,
        velocidadRotacion48hPct: 0.98,
        esDesposte: false
      },
      {
        id: 'pechuga',
        nombre: 'Pechuga Especial sin Hueso / Entera',
        pctSobreCanal: prof.pechugaPctCanal,
        precioKgCop: Number(desp.precioPechugaKg || 14500),
        costoAsignadoKgCop: Math.round(costoKgCanalBase * 1.08),
        velocidadRotacion48hPct: 0.95,
        esDesposte: true
      },
      {
        id: 'pernil_muslo',
        nombre: 'Pernil y Contramuslo Fresco',
        pctSobreCanal: prof.pernilMusloPctCanal,
        precioKgCop: Number(desp.precioPernilMusloKg || desp.precioMusloPernilKg || 12500),
        costoAsignadoKgCop: Math.round(costoKgCanalBase * 0.98),
        velocidadRotacion48hPct: colocacionRemanente48hPct,
        esDesposte: true
      },
      {
        id: 'alas',
        nombre: 'Alas Seleccionadas (Asaderos / Fritura)',
        pctSobreCanal: prof.alasPctCanal,
        precioKgCop: Number(desp.precioAlasKg || 13500),
        costoAsignadoKgCop: Math.round(costoKgCanalBase * 0.94),
        velocidadRotacion48hPct: Math.min(0.96, colocacionRemanente48hPct + 0.06),
        esDesposte: true
      },
      {
        id: 'espinazo_carcasa',
        nombre: 'Espinazo / Carcasa para Fondo y Sopa',
        pctSobreCanal: prof.espinazoPctCanal,
        precioKgCop: Number(desp.precioEspinazoKg || 4500),
        costoAsignadoKgCop: Math.round(costoKgCanalBase * 0.65),
        velocidadRotacion48hPct: Math.max(0.35, colocacionRemanente48hPct - 0.18),
        esDesposte: true
      },
      {
        id: 'menudencias',
        nombre: 'Menudencias Limpias (Hígado, Molleja, Patas, Pescuezo)',
        pctSobreCanal: prof.menudenciaPctCanal,
        precioKgCop: Number(desp.precioMenudenciasKg || desp.precioMenudenciaKg || 6000),
        costoAsignadoKgCop: Math.round(costoKgCanalBase * 0.72),
        velocidadRotacion48hPct: Math.max(0.45, colocacionRemanente48hPct - 0.1),
        esDesposte: true
      }
    ];

    const matrizKasavanaSmith = cortesRaw.map((c) => {
      const kgLote = Number((totalKgCanal * c.pctSobreCanal).toFixed(1));
      const margenContribucionKgCop = c.precioKgCop - c.costoAsignadoKgCop;
      const mermaFrioNoColocadoFactor = c.esDesposte ? (1 - c.velocidadRotacion48hPct) * 0.28 : 0.01;
      const ingresoEfectivoCop = Math.round(kgLote * c.precioKgCop * (1 - mermaFrioNoColocadoFactor));
      const margenTotalEfectivoCop = Math.round(ingresoEfectivoCop - kgLote * c.costoAsignadoKgCop);
      const altoMargen = margenContribucionKgCop >= 3400;
      const altaRotacion = c.velocidadRotacion48hPct >= 0.85;
      let cuadrante = 'Caballo de Batalla (Alto Volumen · Margen Moderado)';
      if (altoMargen && altaRotacion) cuadrante = 'Estrella (Alto Margen · Alta Rotación <48h)';
      else if (altoMargen && !altaRotacion) cuadrante = 'Rompecabezas (Alto Margen · Exige Empaquetar Salida)';
      else if (!altoMargen && !altaRotacion) cuadrante = 'Perro / Riesgo Frío (Bajo Margen · Lenta Salida: Vender en Combo)';

      return {
        id: c.id,
        nombre: c.nombre,
        kgLote,
        precioKgCop: c.precioKgCop,
        margenContribucionKgCop,
        velocidadRotacion48hPct: Number((c.velocidadRotacion48hPct * 100).toFixed(1)),
        cuadranteKasavanaSmith: cuadrante,
        ingresoEfectivoCop,
        margenTotalEfectivoCop
      };
    });

    // Curva de Elasticidad de Precios Gabor-Granger (Canal Entero Fresco <12h en Cúcuta / El Zulia)
    const nivelesPrecio = [10800, 11200, 11500, 11800, 12200, 12600];
    const curvaGaborGranger = nivelesPrecio.map((p) => {
      const probAceptacionB2B = p <= 11200 ? 0.96 : p <= 11500 ? 0.91 : p <= 11800 ? 0.82 : p <= 12200 ? 0.64 : 0.41;
      const kgColocadosDirecto = totalKgCanal * probAceptacionB2B;
      const kgRemateMayorista = totalKgCanal - kgColocadosDirecto;
      const precioRemate = 10400;
      const ingresoEsperadoCop = Math.round(kgColocadosDirecto * p + kgRemateMayorista * precioRemate);
      const utilidadEsperadaCop = Math.round(ingresoEsperadoCop - totalKgCanal * costoKgCanalBase);
      return {
        precioKgCop: p,
        probabilidadCompraB2BPct: Math.round(probAceptacionB2B * 100),
        ingresoEsperadoCop,
        utilidadEsperadaCop,
        recomendado: p === 11500 || p === 11800
      };
    });
    const optimoGabor = [...curvaGaborGranger].sort((a, b) => b.utilidadEsperadaCop - a.utilidadEsperadaCop)[0];

    // Regla 95-5 Ehrenberg-Bass / LinkedIn B2B Institute
    const clientesNecesariosPorCosecha = Math.max(4, Math.ceil(volumenAves / 140));
    const universoProspectos95_5 = Math.ceil(clientesNecesariosPorCosecha / 0.05); // 5% in-market en una ventana dada

    return {
      readOnlySimulation: true,
      simulacionId: 'SIM_2_PORTAFOLIO_B2B_Y_PRICING_EMPIRICO',
      parametros: {
        volumenAves,
        edadObjetivoDias,
        estirpe: estirpeKey,
        colocacionRemanente48hPct,
        clientesActivosActuales
      },
      matrizKasavanaSmith,
      curvaGaborGranger,
      precioOptimoGaborGranger: optimoGabor,
      cienciaEhrenbergBass95_5: {
        compradoresRequeridosPorLote: clientesNecesariosPorCosecha,
        clientesActivosActuales,
        prospectosTotalesEnRadar95_5: universoProspectos95_5,
        brechaProspectos: Math.max(0, universoProspectos95_5 - clientesActivosActuales * 5),
        categoryEntryPointsCEPs: [
          'CEP 1 (Frescura <12h): Asaderos que pierden jugo y peso con pollo congelado o inyectado en salmuera.',
          'CEP 2 (Falla de proveedor): Carnicerías y restaurantes de Cúcuta/El Zulia cuando el mayorista incumple talla en viernes/fin de semana.',
          'CEP 3 (Calibre parejo garantizado): Compradores que exigen peso uniforme por presa documentado con pesaje en granja.'
        ],
        proporcionBinetFieldB2B: '46% Disponibilidad Mental (presencia constante en radar de prospectos) / 54% Activación Comercial Directa pre-cosecha (Día 32–40)'
      },
      capsulaAprendizajeGerencial: {
        autor: 'Dra. Helena (Mercadeo Científico Ehrenberg-Bass) & Visión (Osterwalder BMC · MBA)',
        leccion: `La ingeniería de menú de Kasavana & Smith demuestra por qué vender pechuga suelta a $${Number(desp.precioPechugaKg || 14500).toLocaleString('es-CO')}/kg es una trampa si la colocación del 66% restante cae debajo del 85%: la merma de frío se come el sobreprecio. Además, por la Regla 95-5, solo ~5% de los asaderos cambia de proveedor cada quincena; mantener ${universoProspectos95_5} negocios en contacto ligero te blinda el poder de negociación.`
      }
    };
  }

  /**
   * SIMULACIÓN WOW #3: Nutrición de Precisión SID, Calidad Física del Alimento (PDI / Granulometría)
   * y Stress-Test CapEx de Planta de Concentrados (CapEx reservado estrictamente a rol owner).
   */
  function simulateFeedPlantAndNutritionCapex(baseState, options = {}) {
    const state = baseState && baseState.parametrosGenerales ? baseState : createDefaultTwinState();
    const isOwner = Boolean(options.isOwner === true);
    const pdiPct = Number.isFinite(Number(options.pdiPct)) ? Math.min(98, Math.max(60, Number(options.pdiPct))) : 90;
    const finosPct = Number.isFinite(Number(options.finosPct)) ? Math.min(45, Math.max(2, Number(options.finosPct))) : 10;
    const granulometriaMaizUm = Number.isFinite(Number(options.granulometriaMaizUm))
      ? Math.min(1600, Math.max(350, Number(options.granulometriaMaizUm)))
      : 900;
    const incluyeFitasaYEnzimas = options.incluyeFitasaYEnzimas !== false;
    const balanceElectroliticoDebMeqKg = Number.isFinite(Number(options.balanceElectroliticoDebMeqKg))
      ? Math.min(340, Math.max(140, Number(options.balanceElectroliticoDebMeqKg)))
      : 235;
    const controlMicotoxinasActivo = options.controlMicotoxinasActivo !== false;
    const loteAves = Number.isFinite(Number(options.loteAves)) ? Math.max(100, Math.round(Number(options.loteAves))) : 800;

    // Impacto biológico real en galpón (visible para Fundador y Administrador)
    const penalizacionFinosFcr = Math.max(0, (finosPct - 10) * 0.0025) + Math.max(0, (88 - pdiPct) * 0.0022);
    const bonoMollejaGranulometriaFcr = granulometriaMaizUm >= 800 && granulometriaMaizUm <= 1100 ? -0.015 : 0.012;
    const bonoEnzimasFitasaFcr = incluyeFitasaYEnzimas ? -0.018 : 0.015;
    const penalizacionDebTermicoFcr =
      balanceElectroliticoDebMeqKg >= 220 && balanceElectroliticoDebMeqKg <= 255 ? -0.01 : 0.022;
    const penalizacionMicotoxinasFcr = controlMicotoxinasActivo ? 0 : 0.045;

    const fcrBase = 1.63;
    const deltaFcrTotal = Number(
      (
        penalizacionFinosFcr +
        bonoMollejaGranulometriaFcr +
        bonoEnzimasFitasaFcr +
        penalizacionDebTermicoFcr +
        penalizacionMicotoxinasFcr
      ).toFixed(3)
    );
    const fcrProyectadoGalpon = Number(Math.max(1.48, fcrBase + deltaFcrTotal).toFixed(3));
    const pesoVivoMetaKg = 2.995;
    const diferenciaAlimentoKgLote = Number((loteAves * 0.97 * pesoVivoMetaKg * (fcrProyectadoGalpon - fcrBase)).toFixed(1));
    const impactoCostoAlimentoGalponCop = Math.round(diferenciaAlimentoKgLote * (109125 / 40));

    const matrizProteinaIdealSID = [
      {
        fase: '1. Pre-Inicio (Días 1–10 · Master Pollito)',
        presentacionFisica: 'Micro-pelet / Crombelizado tamizado (0% finos gruesos)',
        energiaAmenKcalKg: 3000,
        proteinaCrudaPct: 23.0,
        lisinaSidPct: 1.28,
        metMasCisSobreLisinaPct: 75,
        treoninaSobreLisinaPct: 67,
        valinaSobreLisinaPct: 75
      },
      {
        fase: '2. Iniciación (Días 11–21 · Nutrepollo Cr SP)',
        presentacionFisica: 'Crombelizado uniforme (PDI >=90%)',
        energiaAmenKcalKg: 3050,
        proteinaCrudaPct: 21.2,
        lisinaSidPct: 1.15,
        metMasCisSobreLisinaPct: 76,
        treoninaSobreLisinaPct: 68,
        valinaSobreLisinaPct: 76
      },
      {
        fase: '3. Engorde y Finalización (Días 22–42+ · Broiler I Dorado)',
        presentacionFisica: `Pelet 3,0–3,5 mm (PDI ${pdiPct}% · Maíz ${granulometriaMaizUm} µm)`,
        energiaAmenKcalKg: 3150,
        proteinaCrudaPct: 19.0,
        lisinaSidPct: 1.05,
        metMasCisSobreLisinaPct: 78,
        treoninaSobreLisinaPct: 69,
        valinaSobreLisinaPct: 77
      }
    ];

    // Bloque estrictamente reservado para el propietario (Mauricio)
    let capexPlantaReservadoOwner = null;
    if (isOwner) {
      const capexLineaMoliendaMezclaCop = Number(options.capexCop || 38000000);
      const ahorroPorBulto40KgCop = Number(
        Math.round((state.av1?.ahorroPropioVsComercialCop || 908800) / 89)
      ); // ~$10.211/bulto base
      const bultosPorLote800 = 89;
      const bultosEquilibrioTotal = Math.ceil(capexLineaMoliendaMezclaCop / Math.max(1000, ahorroPorBulto40KgCop));
      const lotes800ParaPayback = Number((bultosEquilibrioTotal / bultosPorLote800).toFixed(1));
      capexPlantaReservadoOwner = {
        clasificacionRbac: 'CONFIDENCIAL_OWNER_ONLY',
        capexEstimadoLineaInicialCop: capexLineaMoliendaMezclaCop,
        ahorroNetoPorBulto40KgCop: ahorroPorBulto40KgCop,
        ahorroPorLote800AvesCop: Math.round(ahorroPorBulto40KgCop * bultosPorLote800),
        bultosPuntoEquilibrioCapex: bultosEquilibrioTotal,
        lotesEquivalentesPayback: lotes800ParaPayback,
        estrategiaIndustrialPorEtapas: [
          'Etapa 1 (Bajo CapEx y Cero Riesgo Térmico de Peletizado): Comprar Pre-Inicio (Días 1–10) comercial peletizado y fabricar Engorde/Finalización (Días 22–42, ~72% del volumen total) en harina gruesa controlada (maíz 900 µm + aceite crudo de palma + núcleo con fitasa).',
          'Etapa 2 (Escala Regional): Incorporar acondicionador y peletizadora solo cuando la demanda cautiva + terceros supere 350 bultos/mes.'
        ],
        auditoriaGoldfishRiesgosPlanta: [
          'Riesgo Goldfish #1 (Capital de Trabajo de Granos): Comprar maíz y soya de contado exige caja adicional; no cruzar esa inversión antes de superar el pico de Semana 7 en los galpones.',
          'Riesgo Goldfish #2 (Variabilidad Bromatológica y Micotoxinas): Exigir humedad <13% en maíz regional y secuestrante dual de micotoxinas.'
        ]
      };
    }

    return {
      readOnlySimulation: true,
      simulacionId: 'SIM_3_NUTRICION_SID_PDI_Y_CALIDAD_ALIMENTO',
      parametros: {
        pdiPct,
        finosPct,
        granulometriaMaizUm,
        incluyeFitasaYEnzimas,
        balanceElectroliticoDebMeqKg,
        controlMicotoxinasActivo,
        loteAves
      },
      impactoZootecnicoGalpon: {
        fcrBaseTabla: fcrBase,
        fcrProyectadoGalpon,
        deltaFcrTotal,
        diferenciaAlimentoKgLote,
        ahorroOSobrecostoAlimentoLoteCop: -impactoCostoAlimentoGalponCop,
        diagnosticoCalidadFisica:
          finosPct > 15 || pdiPct < 85
            ? 'ALERTA: Exceso de finos obliga al pollo a gastar energía picoteando y deteriora el FCR; zarandear/cuidar manejo de bultos en bodega.'
            : 'ÓPTIMO: Alta durabilidad física de partícula y granulometría adecuada para motilidad de molleja.',
        diagnosticoElectroliticoTermico:
          balanceElectroliticoDebMeqKg >= 220 && balanceElectroliticoDebMeqKg <= 255
            ? `Balance electrolítico DEB (${balanceElectroliticoDebMeqKg} mEq/kg) en rango óptimo para amortiguar jadeo térmico en El Zulia.`
            : `Ajustar DEB hacia 230–250 mEq/kg en olas de calor para prevenir alcalosis respiratoria.`
      },
      matrizProteinaIdealSID,
      capexPlantaReservadoOwner,
      capsulaAprendizajeGerencial: {
        autor: 'Dr. Andrés (Nutrición SID) & Visión (Excelencia Operacional)',
        leccion: `El alimento representa ~68% del costo del pollo. Reducir los finos en comedero (manteniendo PDI >=88% y maíz en 800–1100 µm) y asegurar un balance electrolítico DEB de ~235 mEq/kg con secuestrante de micotoxinas mueve el FCR hasta en ${Math.abs(deltaFcrTotal).toFixed(3)} puntos, equivalentes a $${Math.abs(impactoCostoAlimentoGalponCop).toLocaleString('es-CO')} COP por lote en puro control de proceso.`
      }
    };
  }

  /**
   * SIMULACIÓN WOW #4: Ventana Pre-Faena (Ayuno 6–14h), Merma de Canal, Riesgo PSE/DOA y Cadena de Frío ICA 3652.
   * Ejecución 100% Solo Lectura.
   */
  function simulatePreSlaughterAndColdChain(baseState, options = {}) {
    const state = baseState && baseState.parametrosGenerales ? baseState : createDefaultTwinState();
    const horasAyunoTotal = Number.isFinite(Number(options.horasAyunoTotal))
      ? Math.min(18, Math.max(3, Number(options.horasAyunoTotal)))
      : 10;
    const horaCaptura24h = Number.isFinite(Number(options.horaCaptura24h))
      ? Math.min(23, Math.max(0, Math.round(Number(options.horaCaptura24h))))
      : 2;
    const tempTransporteC = Number.isFinite(Number(options.tempTransporteC))
      ? Math.min(38, Math.max(18, Number(options.tempTransporteC)))
      : 25;
    const tempCadenaFrioC = Number.isFinite(Number(options.tempCadenaFrioC))
      ? Math.min(12, Math.max(-2, Number(options.tempCadenaFrioC)))
      : 2.5;
    const loteAves = Number.isFinite(Number(options.loteAves)) ? Math.max(100, Math.round(Number(options.loteAves))) : 600;

    const capturaNocturnaFresca = horaCaptura24h <= 5 || horaCaptura24h >= 20;
    const excesoHorasAyuno = Math.max(0, horasAyunoTotal - 10.5);
    const defectoHorasAyuno = Math.max(0, 8 - horasAyunoTotal);

    // Merma fisiológica intestinal normal (vaciado digestivo) vs deshidratación muscular vendible
    const mermaCarcasaVendiblePct = Number(
      (excesoHorasAyuno * 0.0033 + (capturaNocturnaFresca ? 0 : 0.006) + Math.max(0, tempTransporteC - 26) * 0.0018).toFixed(4)
    );
    const riesgoContaminacionFecalPct = Number(
      Math.min(0.85, defectoHorasAyuno > 0 ? 0.12 + defectoHorasAyuno * 0.14 : horasAyunoTotal > 13.5 ? 0.18 : 0.02).toFixed(3)
    );
    const riesgoCarnePsePct = Number(
      Math.min(0.65, (capturaNocturnaFresca ? 0.03 : 0.14) + Math.max(0, tempTransporteC - 26) * 0.025 + excesoHorasAyuno * 0.018).toFixed(3)
    );
    const mortalidadTransporteDoaPct = Number(
      Math.min(0.04, 0.0015 + (capturaNocturnaFresca ? 0 : 0.004) + Math.max(0, tempTransporteC - 27) * 0.0012).toFixed(4)
    );

    const pesoCanalBaseAveKg = 2.471;
    const precioCanalKg = Number(state.preciosRegionales.precioCanalKg || 11500);
    const avesVivasDespacho = Math.round(loteAves * 0.97);
    const avesPerdidasDoa = Math.round(avesVivasDespacho * mortalidadTransporteDoaPct);
    const kgCanalPotencial = avesVivasDespacho * pesoCanalBaseAveKg;
    const kgPerdidosPorMermaYDoa = Number(
      (kgCanalPotencial * mermaCarcasaVendiblePct + avesPerdidasDoa * pesoCanalBaseAveKg).toFixed(1)
    );
    const impactoEconomicoLoteCop = Math.round(kgPerdidosPorMermaYDoa * precioCanalKg);

    const vidaUtilFrioDias = tempCadenaFrioC <= 2 ? 8 : tempCadenaFrioC <= 4 ? 6 : tempCadenaFrioC <= 7 ? 3 : 1;

    return {
      readOnlySimulation: true,
      simulacionId: 'SIM_4_PREFAENA_AYUNO_E_INOCUIDAD_FRIO',
      parametros: {
        horasAyunoTotal,
        horaCaptura24h,
        tempTransporteC,
        tempCadenaFrioC,
        loteAves
      },
      evaluacionPrefaena: {
        ventanaOptima: horasAyunoTotal >= 8 && horasAyunoTotal <= 11.5 && capturaNocturnaFresca,
        estadoAyuno:
          horasAyunoTotal < 8
            ? 'ALERTA ROJA (<8h): Tracto lleno, alto riesgo de contaminación fecal en eviscerado.'
            : horasAyunoTotal <= 11.5
              ? 'ÓPTIMO (8–11,5h): Vaciado digestivo limpio sin deshidratar pechuga ni muslo.'
              : 'EXCESIVO (>11,5h): Deshidratación de tejido muscular vendible y fragilidad intestinal/biliar.',
        mermaCarcasaVendiblePct: Number((mermaCarcasaVendiblePct * 100).toFixed(2)),
        riesgoContaminacionFecalPct: Number((riesgoContaminacionFecalPct * 100).toFixed(1)),
        riesgoCarnePsePct: Number((riesgoCarnePsePct * 100).toFixed(1)),
        mortalidadTransporteDoaPct: Number((mortalidadTransporteDoaPct * 100).toFixed(2)),
        kgPerdidosPorMermaYDoa,
        perdidaEconomicaEvitableCop: impactoEconomicoLoteCop
      },
      inocuidadYCadenaFrio: {
        tempCadenaFrioC,
        cumpleNormaInocuidad0a4C: tempCadenaFrioC >= 0 && tempCadenaFrioC <= 4,
        vidaUtilEstimadaDias: vidaUtilFrioDias,
        controlRiesgoMicrobiologico:
          tempCadenaFrioC <= 4
            ? 'Control seguro (0–4°C): inhibe proliferación de Salmonella spp. y Campylobacter jejuni.'
            : 'PELIGRO SANITARIO (>4°C): proliferación bacteriana acelerada y exudado de canal.'
      },
      checklistResolucionIca3652: [
        '1. Retirar comederos exactamente 8 a 10 horas antes del sacrificio manteniendo agua fresca disponible hasta el momento del enguacale.',
        '2. Ejecutar captura y transporte en madrugada (01:00–05:00 AM) con luz azul/baja intensidad para minimizar aleteo, hematomas y carne PSE.',
        '3. Abatir temperatura interna de canal a <=4°C en las primeras 4 horas post-beneficio.'
      ],
      capsulaAprendizajeGerencial: {
        autor: 'Dra. Camila (Sanidad e Inocuidad ICA) & Visión (Lean Six Sigma · Edmondson)',
        leccion: `En Lean Six Sigma esto es un Poka-Yoke (control a prueba de error) de costo cero: desfasar el ayuno a ${horasAyunoTotal}h o cargar en horas de calor cuesta ~$${impactoEconomicoLoteCop.toLocaleString('es-CO')} COP por lote (${kgPerdidosPorMermaYDoa} kg de canal perdidos en deshidratación y DOA). Sincronizar el reloj de levantamiento de tolvas con la planta protege margen e inocuidad sin gastar un peso.`
      }
    };
  }

  /**
   * SIMULACIÓN WOW #5: Proyección Anual Estocástica (52 Semanas), Desplazamiento de Cuellos de Botella TOC y Pre-Mortem de Gary Klein.
   * Ejecución 100% Solo Lectura.
   */
  function simulateAnnualTocAndMarketRisk(baseState, options = {}) {
    const state = baseState && baseState.parametrosGenerales ? baseState : createDefaultTwinState();
    const avesPorLote = Number.isFinite(Number(options.avesPorLote))
      ? Math.min(2000, Math.max(300, Math.round(Number(options.avesPorLote))))
      : Number(state.continuoConfig?.avesPorLote || 900);
    const cadenciaDias = Number.isFinite(Number(options.cadenciaDias))
      ? Math.min(35, Math.max(10, Math.round(Number(options.cadenciaDias))))
      : Number(state.continuoConfig?.cadenciaDias || 18);
    const variacionPrecioAlimentoPct = Number.isFinite(Number(options.variacionPrecioAlimentoPct))
      ? Math.min(0.35, Math.max(0.01, Number(options.variacionPrecioAlimentoPct)))
      : 0.08;
    const variacionPrecioCanalPct = Number.isFinite(Number(options.variacionPrecioCanalPct))
      ? Math.min(0.35, Math.max(0.01, Number(options.variacionPrecioCanalPct)))
      : 0.06;

    const precioBaseCanal = Number(state.preciosRegionales.precioCanalKg || 11500);
    const simBase = simulateContinuousHorizon(state, {
      avesPorLote,
      cadenciaDias,
      semanasHorizonte: 52,
      precioCanalKg: precioBaseCanal
    });

    const precioEstresCanal = Math.round(precioBaseCanal * (1 - variacionPrecioCanalPct));
    const simEstresRaw = simulateContinuousHorizon(state, {
      avesPorLote,
      cadenciaDias,
      semanasHorizonte: 52,
      precioCanalKg: precioEstresCanal
    });
    const bultosTotalesAnualEstimados =
      245 + simBase.horizonteRealDesdeInicio.lotesContinuosIngresados * simBase.loteModeloContinuo.bultosTot;
    const sobrecostoAlimentoAnualEstres = Math.round(
      bultosTotalesAnualEstimados * 109125 * variacionPrecioAlimentoPct
    );
    const cajaAnualEstresCop = Math.round(
      simEstresRaw.horizonteRealDesdeInicio.saldoCajaNetoAlCierreHorizonteCop - sobrecostoAlimentoAnualEstres
    );

    const precioOptimistaCanal = Math.round(precioBaseCanal * (1 + variacionPrecioCanalPct * 0.85));
    const simOptimista = simulateContinuousHorizon(state, {
      avesPorLote,
      cadenciaDias,
      semanasHorizonte: 52,
      precioCanalKg: precioOptimistaCanal
    });

    const vacioSanitarioDias = simBase.auditoriaGalponYClima.diasVacioSanitarioPorSeccion;
    const cajaBase52Cop = Math.round(simBase.horizonteRealDesdeInicio.saldoCajaNetoAlCierreHorizonteCop);
    const picoBaseCop = Math.round(simBase.horizonteRealDesdeInicio.capitalTrabajoPicoInicialCop);
    const cajaOptimista52Cop = Math.round(simOptimista.horizonteRealDesdeInicio.saldoCajaNetoAlCierreHorizonteCop);

    return {
      readOnlySimulation: true,
      simulacionId: 'SIM_5_ANUAL_TOC_Y_PREMORTEM_KLEIN',
      parametros: {
        avesPorLote,
        cadenciaDias,
        variacionPrecioAlimentoPct,
        variacionPrecioCanalPct,
        semanasHorizonte: 52
      },
      escenarios52Semanas: {
        pesimistaEstres: {
          descripcion: `Caída de precio en canal (-${Math.round(variacionPrecioCanalPct * 100)}% -> $${precioEstresCanal.toLocaleString('es-CO')}/kg) + alza de alimento (+${Math.round(variacionPrecioAlimentoPct * 100)}%)`,
          cajaAcumuladaSem52Cop: cajaAnualEstresCop,
          picoCapitalMaximoCop: Math.round(picoBaseCop * (1 + variacionPrecioAlimentoPct * 0.6)),
          resilientePositivo: cajaAnualEstresCop > 0
        },
        baseEsperado: {
          descripcion: `Operación continua (${avesPorLote} aves c/${cadenciaDias}d) a $${precioBaseCanal.toLocaleString('es-CO')}/kg canal`,
          cajaAcumuladaSem52Cop: cajaBase52Cop,
          utilidadAnualRegimenEstacionarioCop: simBase.regimenEstacionarioAnual.utilidadNetaPostArriendoAnualCop,
          picoCapitalMaximoCop: picoBaseCop,
          avesIniciadasAnual: simBase.horizonteRealDesdeInicio.avesTotalesIniciadas,
          bultosConsumidosAnual: bultosTotalesAnualEstimados
        },
        optimista: {
          descripcion: `Captura de valor B2B (+${Math.round(variacionPrecioCanalPct * 85)}% -> $${precioOptimistaCanal.toLocaleString('es-CO')}/kg) con control de merma`,
          cajaAcumuladaSem52Cop: cajaOptimista52Cop,
          picoCapitalMaximoCop: Math.round(simOptimista.horizonteRealDesdeInicio.capitalTrabajoPicoInicialCop)
        }
      },
      mapaCuellosDeBotellaAnualTOC: [
        {
          trimestre: 'Trimestre 1 (Semanas 1–13 · Lotes 1 a 3)',
          restriccionDominante: 'Capital de Trabajo Pico (Semana 7: -$31,21M COP)',
          reglaOperativa: 'Disciplina JIT Solla y cobro de contado del Lote 1 en Día 42.'
        },
        {
          trimestre: 'Trimestre 2 (Semanas 14–26 · Estabilización 900 aves)',
          restriccionDominante: vacioSanitarioDias < 7
            ? `Vacío Sanitario Crítico (${vacioSanitarioDias} días por sección)`
            : 'Densidad Térmica de Verano en El Zulia (>24 kg/m²)',
          reglaOperativa: vacioSanitarioDias < 7
            ? 'Mantener cadencia >=16 días o habilitar 4.ª sección antes de comprimir entradas.'
            : 'Raleo programado al Día 38 y velocidad de aire >=2,0 m/s.'
        },
        {
          trimestre: 'Trimestres 3 y 4 (Semanas 27–52 · Escala Comercial)',
          restriccionDominante: 'Disponibilidad Mental y Física B2B (Regla 95-5)',
          reglaOperativa: 'Sostener cartera activa de asaderos y famas para absorber ~340–410 aves/semana sin bajar precio ancla.'
        }
      ],
      preMortemGaryKlein: [
        {
          fallaHipotetica: '1. Degradación silenciosa del vacío sanitario por acortar cadencia a <=15 días sin 4.ª sección',
          gatilloAlertaTemprana: 'FCR sube >0,05 puntos o mortalidad Sem 1–2 supera 1,8% en dos lotes seguidos.',
          accionPreventivaHoy: 'Respetar mínimo 7 días de descanso con desinfección y encalado entre camadas.'
        },
        {
          fallaHipotetica: '2. Congestión de frío por vender solo pechuga y acumular pernil/espinazo',
          gatilloAlertaTemprana: 'Inventario en frío >48h supera el 15% del lote beneficiado.',
          accionPreventivaHoy: 'Vender paquetes completos o exigir preventa del 66% restante antes de despostar.'
        },
        {
          fallaHipotetica: '3. Descalce de caja en Semana 6–7 por ventas fiadas a clientes no calificados',
          gatilloAlertaTemprana: 'Cartera vencida >7 días supera $2.500.000 COP.',
          accionPreventivaHoy: 'Política estricta pago contra entrega en los primeros 4 lotes.'
        }
      ],
      capsulaAprendizajeGerencial: {
        autor: 'Visión (Drucker · McGrath · Osterwalder · Edmondson · Mollick & Pre-Mortem Klein)',
        leccion: `El método Pre-Mortem de Gary Klein consiste en imaginar hoy por qué podría fallar el plan anual y blindar los gatillos antes de empezar. Incluso en el escenario de estrés severo (canal a $${precioEstresCanal.toLocaleString('es-CO')}/kg y alimento +${Math.round(variacionPrecioAlimentoPct * 100)}%), Granja La Alejandra cierra el año con $${cajaAnualEstresCop.toLocaleString('es-CO')} COP positivos siempre que no se viole el vacío sanitario ni se fíe el capital de la Semana 7.`
      }
    };
  }

  /**
   * Verificador forense automático de invariantes contra Excel COM (AV-1 y AV-2).
   */
  function verifyZeroDivergence(computed) {
    const c = computed || computeFullTwin(createDefaultTwinState());
    const checks = [
      ['AV1_800Com_Utilidad', c.av1.comercial800.utilidadCanal, AUDIT_INVARIANTS_42D.av1.lote800Comercial.utilidadCanal],
      ['AV1_800Com_CostKgCanal', c.av1.comercial800.costoKgCanal, AUDIT_INVARIANTS_42D.av1.lote800Comercial.costoKgCanal],
      ['AV1_800Com_CostKgVivo', c.av1.comercial800.costoKgVivo, AUDIT_INVARIANTS_42D.av1.lote800Comercial.costoKgVivo],
      ['AV1_800Com_Bultos', c.av1.comercial800.bultosTot, AUDIT_INVARIANTS_42D.av1.lote800Comercial.bultosTot],
      ['AV1_800Prop_Utilidad', c.av1.propio800.utilidadCanal, AUDIT_INVARIANTS_42D.av1.lote800Propio.utilidadCanal],
      ['AV1_800Prop_Ahorro', c.av1.ahorroPropioVsComercialCop, AUDIT_INVARIANTS_42D.av1.lote800Propio.ahorroVsComercial],
      ['AV1_600L1_Utilidad', c.av1.refLote1_600.utilidadCanal, AUDIT_INVARIANTS_42D.av1.lote1Ref600.utilidadCanal],
      ['AV1_600L1_BultosPpto', c.av1.refLote1_600.bultosTot, AUDIT_INVARIANTS_42D.av1.lote1Ref600.bultosTot],
      ['AV1_600L1_BultosBodega', c.av1.refLote1_600.bodegaTot, AUDIT_INVARIANTS_42D.av1.lote1Ref600.bultosBodega0Bajas],
      ['AV1_Anual_CapPico', c.av1.anual12Meses.consolidado.capitalPicoRotativo, AUDIT_INVARIANTS_42D.av1.anual12Meses.capitalPicoRotativo],
      ['AV1_Anual_Utilidad12m', c.av1.anual12Meses.consolidado.utilidadCanal, AUDIT_INVARIANTS_42D.av1.anual12Meses.utilidadNetaAnual],
      ['AV2_Cons3_Utilidad', c.av2.consolidado3Lotes.utilidadCanal, AUDIT_INVARIANTS_42D.av2.consolidado3Lotes.utilidadCanal],
      ['AV2_Cons3_CapPicoSem7', c.av2.tesoreriaResumen.capitalTrabajoPicoSem7, AUDIT_INVARIANTS_42D.av2.consolidado3Lotes.capitalTrabajoPicoSem7],
      ['AV2_Cons3_SaldoPost4m', c.av2.tesoreriaResumen.saldoFinalPost4m, AUDIT_INVARIANTS_42D.av2.consolidado3Lotes.saldoFinalPost4MesesArriendo],
      ['AV2_Cons3_BiomasaPicoKg', c.av2.capacidadTermica.biomasaPicoKg, AUDIT_INVARIANTS_42D.av2.consolidado3Lotes.biomasaMaximaSimultaneaKg]
    ];

    const diffs = checks.map(([name, actual, expected]) => ({
      metric: name,
      actual,
      expected,
      diff: Math.abs(actual - expected)
    }));

    const maxDiff = Math.max(...diffs.map((d) => d.diff));
    return {
      ok: maxDiff < 0.01,
      maxDiff,
      checks: diffs
    };
  }

  return {
    ROSS_PESO_G,
    ROSS_CONS_DIA_G,
    ROSS_CONS_ACUM_G,
    CONSUMO_POLLO_6_SEM,
    REND_SECO_EXACTO,
    HITOS_BITACORA,
    BROILER_STRAIN_PROFILES,
    AUDIT_INVARIANTS_42D,
    createDefaultTwinState,
    normalizeStateDefaults,
    getRendimientoSecoRoss,
    computeSingleLot,
    computeFullTwin,
    simulateWhatIf,
    applyOperationalEvent,
    evaluateCommercialOpportunity,
    estimateDayForTargetCutWeight,
    simulateContinuousHorizon,
    computeFarmScorecardKPIs,
    computeExecutiveGovernance,
    computeActiveSystemConstraint,
    simulateStrainAndClimateScenario,
    simulatePortfolioAndPricingB2B,
    simulateFeedPlantAndNutritionCapex,
    simulatePreSlaughterAndColdChain,
    simulateAnnualTocAndMarketRisk,
    verifyZeroDivergence
  };
});
