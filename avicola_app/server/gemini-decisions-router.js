'use strict';

const TwinEngine = require('../shared/causal-twin-engine');
const { resolveExpertVoiceProfile } = require('../shared/openai-models-config');

const GEMINI_DECISION_MODEL = process.env.GEMINI_DECISION_MODEL || 'gemini-decision-1';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MANIFESTATION_KEYS = [
  'gerencia_excelencia_operacional',
  'bsc_kaplan_norton',
  'porter_estrategia',
  'kotler_mercadotecnia',
  'negociador_voss_harvard_gates',
  'zootecnia_avicola',
  'innovacion_phd',
  'sanidad_bioseguridad_ica',
  'nutricion_planta_concentrados'
];

const MANIFESTATION_KEYWORD_RULES = [
  {
    key: 'sanidad_bioseguridad_ica',
    pattern: /\bica\b|3652|bioseguridad|vacun|coccid|ayuno|pre[-\s]?faena|\bpse\b|\bfr[ií]o\b|salmonella|campylobacter|mortalidad|bajas|decomis|desinfecci/i,
    weight: 3.2
  },
  {
    key: 'nutricion_planta_concentrados',
    pattern: /nutric|prote[ií]na\s+ideal|lisina|\bsid\b|\bamen\b|\bpdi\b|pellet|finos|granulometr|molienda|ma[ií]z|fitasa|electrolit|\bdeb\b|micotoxin|planta\s+de\s+concentrado|capex\s+planta|concentrado|bulto/i,
    weight: 3.2
  },
  {
    key: 'gerencia_excelencia_operacional',
    pattern: /visi[oó]n|gerenc|drucker|mcgrath|osterwalder|canvas|edmondson|seguridad\s+psicol[oó]gica|mollick|co[-\s]?inteligencia|centauro|ventaja\s+temporal|punto\s+de\s+inflexi[oó]n|\btoc\b|goldratt|cuello\s+de\s+botella|throughput|\blean\b|six\s+sigma|\bpdca\b|\bdmaic\b|poka[-\s]?yoke|pre[-\s]?mortem|klein|excelencia|decisi[oó]n|prioridad|aprend/i,
    weight: 3.1
  },
  {
    key: 'negociador_voss_harvard_gates',
    pattern: /negoci|\bbatna\b|voss|harvard|gates|descuento|precio\s+ofertado|regat|comprador|mayorista|contraparte|acuerdo|contrato/i,
    weight: 3.0
  },
  {
    key: 'kotler_mercadotecnia',
    pattern: /mercad|kotler|ehrenberg|95[-\s]?5|\bcep\b|kasavana|gabor[-\s]?granger|desposte|pechuga|pernil|alas|cliente|asadero|fama|venta|marca/i,
    weight: 2.9
  },
  {
    key: 'zootecnia_avicola',
    pattern: /\bross\b|\bcobb\b|hubbard|estirpe|\bthi\b|temperatura|humedad|calor|ventil|cortina|entresaca|raleo|densidad|\biep\b|\bfcr\b|peso\s+vivo|galp[oó]n/i,
    weight: 2.9
  },
  {
    key: 'porter_estrategia',
    pattern: /porter|5\s+fuerzas|compra\s+directa|intermediari|solla\s+jit|kanban|diferenciaci|ventaja\s+competitiva/i,
    weight: 2.6
  },
  {
    key: 'innovacion_phd',
    pattern: /innovaci|sensor|telemetr|terios|od[oó]metro|\bapp\b|celular|automatiz|1[-\s]?tap|nebuliz/i,
    weight: 2.5
  },
  {
    key: 'bsc_kaplan_norton',
    pattern: /\bbsc\b|kaplan|norton|\broi\b|margen|caja|semana\s+7|capital\s+de\s+trabajo|utilidad|flujo\s+de\s+caja|finanz/i,
    weight: 2.5
  }
];

function copLabel(val) {
  const num = Math.round(Number(val) || 0);
  const absFormatted = Math.abs(num).toLocaleString('es-CO');
  return `${num < 0 ? '-' : ''}$${absFormatted} COP`;
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0.01, Math.min(0.99, Number(n.toFixed(4))));
}

function buildCalibratedDecisions({ message = '', uiContext = null, sessionUser = null } = {}) {
  const text = String(message || '').trim();
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');

  const hasHypotheticalMarker =
    /[¿?]|qu[eé]\s+pasar[ií]a|que\s+tal\s+si|simul|proyect|evalu|eval[uú]a|compara|si\s+metemos|si\s+cambiamos|hipot[eé]t|en\s+un\s+a[nñ]o|escenario/i.test(
      text
    );
  const hasExplicitMutationVerb =
    /\b(guarda|aplica\s+al\s+plan|confirma\s+cambio|actualiza\s+el\s+plan|modifica\s+oficialmente|registra\s+en\s+bit[aá]cora|registra\s+venta|agrega\s+viaje|cierra\s+viaje|cambia\s+la\s+meta\s+oficial)\b/i.test(
      text
    );

  let mutationProb = 0.22;
  if (hasExplicitMutationVerb && !hasHypotheticalMarker) {
    mutationProb = 0.91;
  } else if (hasExplicitMutationVerb && hasHypotheticalMarker) {
    mutationProb = 0.34;
  } else if (hasHypotheticalMarker) {
    mutationProb = 0.09;
  }

  const scores = {};
  for (const key of MANIFESTATION_KEYS) {
    scores[key] = 0.1;
  }
  for (const rule of MANIFESTATION_KEYWORD_RULES) {
    if (rule.pattern.test(text)) {
      scores[rule.key] += rule.weight;
    }
  }

  if (uiContext && uiContext.selectedSpecialist && scores[uiContext.selectedSpecialist] !== undefined) {
    scores[uiContext.selectedSpecialist] += 0.65;
  }
  if (uiContext && uiContext.activeModule) {
    const mod = String(uiContext.activeModule).toLowerCase();
    if (mod.includes('simul')) scores.gerencia_excelencia_operacional += 0.35;
    if (mod.includes('bodega')) scores.nutricion_planta_concentrados += 0.35;
    if (mod.includes('bitacora')) scores.zootecnia_avicola += 0.35;
    if (mod.includes('ventas') || mod.includes('negoci')) scores.kotler_mercadotecnia += 0.35;
  }

  const rankedManifestations = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topKey = rankedManifestations[0][1] > 0.5 ? rankedManifestations[0][0] : 'gerencia_excelencia_operacional';

  const highImpactSignals =
    /cr[eé]dito|fiado|planta\s+de\s+concentrado|capex|inversi[oó]n|(?:cadencia|cada)\s*(?:de\s*)?(?:1[0-5]|9|8|7)\s*d|c\/(?:1[0-5]|9|8|7)d|\b(?:900|1[0-9]{3}|1\.[0-9]{3})\s*(?:aves|pollos)\s*cada|cobb|hubbard|desposte\s+total|elephant|goldfish|junta|pre[-\s]?mortem|riesgo|cambiar\s+edad/i.test(
      text
    );
  const boardProb = highImpactSignals ? 0.89 : 0.24;

  const probesOwnerReserved =
    /av[-\s]?1|harina\s+propia|planta\s+de\s+concentrados|capex\s+planta|6\s+camadas|c[oó]digo\s+fuente|rfc/i.test(
      text
    );
  const rbacSafeProb = isOwner || !probesOwnerReserved ? 0.98 : 0.12;

  return {
    is_explicit_mutation_command: {
      type: 'noul',
      probability: clamp01(mutationProb),
      verdict: mutationProb >= 0.7,
      rationale:
        mutationProb >= 0.7
          ? 'Orden explícita de escritura/mutación operativa.'
          : 'Consulta exploratoria, simulación o pregunta estratégica de solo lectura.'
    },
    primary_manifestation: {
      type: 'choice',
      choice: topKey,
      profile: resolveExpertVoiceProfile(topKey).name,
      rankedTop3: rankedManifestations.slice(0, 3).map(([id, score]) => ({
        id,
        score: Number(score.toFixed(2))
      }))
    },
    requires_elephant_goldfish_board: {
      type: 'noul',
      probability: clamp01(boardProb),
      verdict: boardProb >= 0.65,
      rationale:
        boardProb >= 0.65
          ? 'Decisión estructural de alto impacto en caja, biología o portafolio: requiere auditoría cero-memoria Goldfish.'
          : 'Consulta estándar atendible por una sola manifestación especializada.'
    },
    rbac_safe: {
      type: 'noul',
      probability: clamp01(rbacSafeProb),
      verdict: rbacSafeProb >= 0.7,
      probesOwnerReserved: !isOwner && probesOwnerReserved
    }
  };
}

async function tryRemoteGeminiDecisions(promptPayload, timeoutMs = 2200) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GEMINI_API_BASE}/${encodeURIComponent(GEMINI_DECISION_MODEL)}:decide?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(promptPayload),
      signal: controller.signal
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === 'object' ? json : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function classifyTurnIntentAndGuardrails({ message = '', uiContext = null, sessionUser = null } = {}) {
  const calibrated = buildCalibratedDecisions({ message, uiContext, sessionUser });
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');

  const remotePayload = {
    context: [
      `Usuario rol=${isOwner ? 'owner' : 'farm_partner'}.`,
      uiContext ? `Lienzo activo=${JSON.stringify(uiContext).slice(0, 400)}` : '',
      `Mensaje usuario: "${String(message || '').slice(0, 500)}"`
    ]
      .filter(Boolean)
      .join(' '),
    questions: [
      {
        id: 'is_explicit_mutation_command',
        type: 'noul',
        prompt: 'Does the user explicitly command persisting/mutating official farm plan state rather than asking a hypothetical question?'
      },
      {
        id: 'primary_manifestation',
        type: 'choice',
        prompt: 'Which Avi specialized manifestation should lead this turn?',
        choices: MANIFESTATION_KEYS
      },
      {
        id: 'requires_elephant_goldfish_board',
        type: 'noul',
        prompt: 'Does this proposal carry high financial/biological risk requiring adversarial zero-memory Goldfish auditing?'
      }
    ]
  };

  const remote = await tryRemoteGeminiDecisions(remotePayload);
  if (remote && Array.isArray(remote.answers)) {
    const byId = Object.fromEntries(remote.answers.map((a) => [a.id, a]));
    if (byId.is_explicit_mutation_command && Number.isFinite(Number(byId.is_explicit_mutation_command.probability))) {
      const p = clamp01(byId.is_explicit_mutation_command.probability);
      calibrated.is_explicit_mutation_command.probability = p;
      calibrated.is_explicit_mutation_command.verdict = p >= 0.7;
    }
    if (byId.primary_manifestation && MANIFESTATION_KEYS.includes(byId.primary_manifestation.choice)) {
      const ch = byId.primary_manifestation.choice;
      calibrated.primary_manifestation.choice = ch;
      calibrated.primary_manifestation.profile = resolveExpertVoiceProfile(ch).name;
    }
    if (
      byId.requires_elephant_goldfish_board &&
      Number.isFinite(Number(byId.requires_elephant_goldfish_board.probability))
    ) {
      const p = clamp01(byId.requires_elephant_goldfish_board.probability);
      calibrated.requires_elephant_goldfish_board.probability = p;
      calibrated.requires_elephant_goldfish_board.verdict = p >= 0.65;
    }
  }

  return {
    ok: true,
    engine: remote ? `${GEMINI_DECISION_MODEL}-live` : `${GEMINI_DECISION_MODEL}-calibrated`,
    evaluatedAt: new Date().toISOString(),
    questions: calibrated
  };
}

async function evaluateFieldMediaChecklist({
  mediaDescription = '',
  domain = 'sanidad_bioseguridad_ica'
} = {}) {
  const desc = String(mediaDescription || '').trim();
  const riesgoSevero =
    /jadeo|alas\s+abiertas|postraci|hacinamiento|cama\s+h[uú]meda|mojada|amoniaco|diarrea|sangre|polvo\s+excesivo|finos\s*>\s*20|hematoma|temperatura\s*>\s*3[1-9]|temp\s*>\s*4\s*°?c/i.test(
      desc
    );
  const riesgoModerado =
    /ventil|calor|29|30|cortina|finos|pellet\s+roto|heterog|desigual|frio\s+4|ayuno\s+7|ayuno\s+13/i.test(desc);

  const severityScore = riesgoSevero ? 5 : riesgoModerado ? 3 : 1;
  const riskTier = riesgoSevero ? 'ALTO_CRITICO' : riesgoModerado ? 'MODERADO_PREVENTIVO' : 'BAJO_CONFORME';
  const icaCompliantProb = riesgoSevero ? 0.24 : riesgoModerado ? 0.68 : 0.94;

  const remote = await tryRemoteGeminiDecisions({
    context: `Evaluación de evidencia campo/planta (${domain}): "${desc.slice(0, 600)}"`,
    questions: [
      { id: 'cumple_ica_3652', type: 'noul', prompt: 'Does the observed evidence comply with ICA 3652 biosecurity and welfare standards?' },
      { id: 'nivel_riesgo_operativo', type: 'choice', choices: ['BAJO_CONFORME', 'MODERADO_PREVENTIVO', 'ALTO_CRITICO'] },
      { id: 'severidad_operativa', type: 'score', min: 1, max: 5 }
    ]
  });

  const checklist = {
    cumple_ica_3652: {
      type: 'noul',
      probability: icaCompliantProb,
      verdict: icaCompliantProb >= 0.7
    },
    nivel_riesgo_operativo: {
      type: 'choice',
      choice: riskTier
    },
    severidad_operativa: {
      type: 'score',
      score: severityScore,
      scale: '1 (Óptimo) a 5 (Acción Inmediata)'
    }
  };

  return {
    ok: true,
    engine: remote ? `${GEMINI_DECISION_MODEL}-live` : `${GEMINI_DECISION_MODEL}-calibrated`,
    domain,
    mediaAnalyzed: Boolean(desc),
    checklist,
    accionRecomendada:
      severityScore >= 4
        ? 'Intervención inmediata en sitio: corregir ventilación/cama/cadena de frío y registrar novedad en bitácora.'
        : severityScore === 3
          ? 'Ajuste preventivo dentro de las próximas 4 horas y verificación con termómetro/pesaje muestra.'
          : 'Parámetros conformes; mantener protocolo estándar sin cambios.'
  };
}

function buildGoldfishLiquidityAuditor({ proposal, computed, isOwner, sim3 }) {
  const bsc = computed.av2.scorecardBsc;
  const fin = bsc.financiera;
  const picoSem7 = Math.round(fin.picoCapitalSem7Cop);
  const cajaSem18 = Math.round(fin.cajaAcumSem18Cop);
  const margenL1Pct = Number((fin.margenNetoLote1Pct * 100).toFixed(1));
  const roiContPct = Number((fin.roiCicloContinuoPct * 100).toFixed(1));

  const triggers = [];
  const lower = String(proposal || '').toLowerCase();
  if (/cr[eé]dito|fiado|plazo\s+\d+|30\s*d[ií]as|15\s*d[ií]as/.test(lower)) {
    triggers.push(
      `BLOQUEO DE LIQUIDEZ: Otorgar crédito antes de superar la Semana 7 (pico de capital requerido ${copLabel(picoSem7)}) rompe la caja necesaria para financiar Lotes 2 y 3.`
    );
  }
  if (/descuento|rebaj|10\.?000|10\.?500|9\.?500|barato|regalar/.test(lower)) {
    triggers.push(
      `EROSIÓN DE MARGEN: Bajar precio debajo del piso destruye el margen neto actual del ${margenL1Pct}% y alarga el retorno sobre el pico de inversión.`
    );
  }
  if (/despost|solo\s+pechuga|pechuga\s+suelta/.test(lower)) {
    triggers.push(
      `RIESGO DE INVENTARIO EN FRÍO: Despostar sin preventa del 66% restante (pernil 31%, alas 11%, espinazo 16%, menudencia 8%) inmoviliza caja e induce remates.`
    );
  }
  if (isOwner && /planta|capex|pelet|molino|mezcladora/.test(lower) && sim3?.capexPlantaReservadoOwner) {
    triggers.push(
      `RESERVA CAPEX PROPIETARIO: La línea inicial estimada en ${copLabel(sim3.capexPlantaReservadoOwner.capexEstimadoLineaInicialCop)} requiere ${sim3.capexPlantaReservadoOwner.lotesEquivalentesPayback} lotes equivalentes de payback; no comprometer caja de granja antes de estabilizar Semana 18 (${copLabel(cajaSem18)}).`
    );
  }
  if (/cadencia\s*(?:1[0-4]|9|8)|1200|1500|2000\s*aves/.test(lower)) {
    triggers.push(
      `SOBRE-EXPANSIÓN DE CAPITAL DE TRABAJO: Escalar densidad de aves o comprimir cadencia eleva el pico de caja de Semana 7 proporcionalmente al alimento en piso.`
    );
  }

  const verdict = triggers.length > 0 ? 'OBJECION_FINANCIERA' : 'APROBADO_CON_MONITOREO_CAJA';
  if (triggers.length === 0) {
    triggers.push(
      `Caja proyectada saludable: margen Lote 1 ${margenL1Pct}%, ROI ciclo continuo ${roiContPct}% y saldo post 4 meses de ${copLabel(cajaSem18)}, siempre manteniendo cobro contra entrega.`
    );
  }

  return {
    agente: 'Goldfish #1 · Auditor de Liquidez y Caja (Cero Memoria)',
    veredicto: verdict,
    tablaFriaEvaluada: {
      picoCapitalSem7Cop: picoSem7,
      cajaAcumuladaSem18Cop: cajaSem18,
      margenNetoLote1Pct: margenL1Pct,
      roiCicloContinuoPct: roiContPct
    },
    hallazgosCriticos: triggers
  };
}

function buildGoldfishBiologicalAuditor({ proposal, computed, sim1, sim4 }) {
  const proc = computed.av2.scorecardBsc.procesosInternos;
  const micro = sim1.microclimaElZulia;
  const sel = sim1.resultadoSeleccionado;
  const lower = String(proposal || '').toLowerCase();

  const triggers = [];
  if (micro.estadoTermico === 'ESTRES_SEVERO' || sel.alertaDensidad || proc.densidadSeccionKgM2 > 24) {
    triggers.push(
      `ESTRÉS TÉRMICO / DENSIDAD EN EL ZULIA: Densidad por sección ${sel.densidadSeccionKgM2} kg/m² (límite 24,0 kg/m²) y THI efectivo ${micro.thiEfectivo}. Obligatorio raleo/entresaca Día 38 y velocidad de aire >=2,0 m/s.`
    );
  }
  if (/4[5-9]\s*d|950\s*g|1\s*kg\s*pechuga|pollo\s+pesado|talla\s+grande/.test(lower)) {
    triggers.push(
      `RIESGO ZOOTÉCNICO POR EDAD EXTENDIDA (>44 días): El FCR marginal sube en las últimas semanas y el jadeo nocturno aumenta mortalidad súbita; exigir entresaca previa del 25% y ajuste de lisina/DEB.`
    );
  }
  if (/cadencia\s*(?:1[0-5]|9|8)|12\s*d[ií]as|15\s*d[ií]as/.test(lower)) {
    triggers.push(
      `ALERTA VACÍO SANITARIO ICA 3652: Cadencias <=15 días sin 4.ª sección comprimen el descanso sanitario por debajo de 7 días, elevando coccidiosis y carga bacteriana en cama.`
    );
  }
  if (/ayuno|sacrificio|beneficio|transporte|frio|frío|captura/.test(lower) && !sim4.evaluacionPrefaena.ventanaOptima) {
    triggers.push(
      `RIESGO PRE-FAENA: ${sim4.evaluacionPrefaena.estadoAyuno} Merma estimada ${sim4.evaluacionPrefaena.mermaCarcasaVendiblePct}%, riesgo PSE ${sim4.evaluacionPrefaena.riesgoCarnePsePct}%.`
    );
  }

  const verdict = triggers.length > 0 ? 'ALERTA_BIOLOGICA_Y_TERMICA' : 'CONFORME_ZOOTECNIA_EL_ZULIA';
  if (triggers.length === 0) {
    triggers.push(
      `Ventana biológica conforme en El Zulia: THI efectivo ${micro.thiEfectivo} (${micro.estadoTermico}), densidad proyectada ${sel.densidadSeccionKgM2} kg/m² y cumplimiento ICA Res. 3652.`
    );
  }

  return {
    agente: 'Goldfish #2 · Auditor Biológico, Térmico e ICA 3652 (Cero Memoria)',
    veredicto: verdict,
    tablaFriaEvaluada: {
      thiEfectivoElZulia: micro.thiEfectivo,
      estadoTermico: micro.estadoTermico,
      densidadSeccionKgM2: sel.densidadSeccionKgM2,
      iepRossTeorico: proc.iepRossTeorico,
      cumpleCadenaFrio0a4C: sim4.inocuidadYCadenaFrio.cumpleNormaInocuidad0a4C
    },
    hallazgosCriticos: triggers
  };
}

async function runElephantGoldfishBoard({ proposal = '', snapshot, sessionUser = null, uiContext = null } = {}) {
  const cleanProposal = String(proposal || '').trim() || 'Evaluar plan operativo actual y riesgos prioritarios del ciclo en Granja La Alejandra.';
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const computed = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const toc = computed.av2.restriccionTocActiva || TwinEngine.computeActiveSystemConstraint(state, computed);

  const sim1 = TwinEngine.simulateStrainAndClimateScenario(state, {});
  const sim3 = TwinEngine.simulateFeedPlantAndNutritionCapex(state, { isOwner });
  const sim4 = TwinEngine.simulatePreSlaughterAndColdChain(state, {});
  const visionProfile = resolveExpertVoiceProfile('gerencia_excelencia_operacional');
  const capasVision = toc.capasEstrategicasVision || {};

  // 1. AGENTE ELEPHANT (Memoria completa del Gemelo Digital + Contexto UI)
  const l1 = computed.av2.lotes[0] || {};
  const contRes = computed.av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18 } };
  const elephantThesis = {
    agente: 'Elephant · Estratega con Memoria Completa del Gemelo Digital',
    contextoUI: uiContext ? `Lienzo enfocado: ${uiContext.activeModule || uiContext.activeTab || 'tablero principal'}` : 'Tablero operativo general',
    tesisInicial: `Propuesta evaluada: "${cleanProposal}". El sistema opera con Lote 1 de ${l1.avesInic || 600} aves en marcha y transición continua a ${contRes.config.avesPorLote || 900} aves cada ${contRes.config.cadenciaDias || 18} días. La restricción Goldratt TOC dominante hoy es "${toc.primaryConstraint.titulo}" (${toc.primaryConstraint.indicadorActual}), donde cada día de flujo continuo aporta ~$${toc.throughputAccounting.throughputDiarioSistemaCop.toLocaleString('es-CO')} COP de Throughput neto.`
  };

  // 2. AGENTES GOLDFISH (Cero memoria conversacional: auditoría fría e independiente)
  const goldfish1 = buildGoldfishLiquidityAuditor({ proposal: cleanProposal, computed, isOwner, sim3 });
  const goldfish2 = buildGoldfishBiologicalAuditor({ proposal: cleanProposal, computed, sim1, sim4 });

  // 3. EVALUACIÓN DECISION-ROUTER SOBRE LA PROPUESTA
  const decisionMetrics = await classifyTurnIntentAndGuardrails({
    message: cleanProposal,
    uiContext,
    sessionUser
  });

  const hasFinancialBlock = goldfish1.veredicto === 'OBJECION_FINANCIERA';
  const hasBiologicalAlert = goldfish2.veredicto === 'ALERTA_BIOLOGICA_Y_TERMICA';
  let dictamenFinal = 'VIABLE_CON_DISCIPLINA_TOC';
  if (hasFinancialBlock && hasBiologicalAlert) {
    dictamenFinal = 'MODIFICAR_URGENTE_DOBLE_RIESGO';
  } else if (hasFinancialBlock || hasBiologicalAlert) {
    dictamenFinal = 'APROBADO_SOLO_CON_SALVAGUARDAS';
  }

  const salvavidasAccionables = [
    `1. Eficacia Drucker & Restricción TOC: ${toc.primaryConstraint.accionExplotar}`,
    `2. Ventaja Temporal & Canvas (McGrath/Osterwalder): ${capasVision.ritaMcGrath?.diagnosticoVivo || 'Validar supuestos críticos antes de escalar.'}`,
    `3. Blindaje Liquidez (Goldfish #1): ${goldfish1.hallazgosCriticos[0]}`,
    `4. Blindaje Galpón/ICA (Goldfish #2): ${goldfish2.hallazgosCriticos[0]}`
  ];

  const capsula = {
    autor: visionProfile.name,
    framework: 'Síntesis Visión: Elephant–Goldfish + Drucker + McGrath + Osterwalder BMC + Edmondson + Mollick + TOC/Klein',
    leccionClave:
      'La lucidez gerencial consiste en articular múltiples lentes al instante: Peter Drucker exige hacer lo correcto sobre el cuello de botella; Rita McGrath recuerda que toda ventaja es temporal; Alex Osterwalder protege el motor líquido del Business Model Canvas mientras explora nichos; Amy Edmondson exige reportar fallos tempranos sin miedo en Zona de Aprendizaje; y Ethan Mollick nos convierte en Centauros contrastando nuestra intuición con auditores fríos sin memoria (Goldfish).',
    preguntaReflexion:
      '¿Qué supuesto crítico de tu ventaja actual (McGrath/Osterwalder) cambiaría primero en 60 días y cómo garantizarías que el equipo lo reporte en Zona de Aprendizaje (Edmondson) el mismo día?'
  };

  const displayText = [
    `[DICTAMEN VISIÓN · ELEPHANT–GOLDFISH · ${dictamenFinal}]`,
    `Elephant (Gemelo Completo): ${elephantThesis.tesisInicial}`,
    `Goldfish Caja (Cero Memoria): ${goldfish1.hallazgosCriticos.join(' ')}`,
    `Goldfish Biológico/ICA (Cero Memoria): ${goldfish2.hallazgosCriticos.join(' ')}`,
    `Síntesis Visión (Drucker · McGrath · Osterwalder · Edmondson · Mollick · TOC): ${salvavidasAccionables.join(' | ')}`,
    `Cápsula Gerencial: ${capsula.leccionClave}`
  ].join('\n');

  const speechText = [
    `Habla Visión tras dirigir la junta adversarial Elephant Goldfish.`,
    `Nuestro dictamen es ${dictamenFinal.replace(/_/g, ' ').toLowerCase()}.`,
    `En caja, el auditor sin memoria señala: ${goldfish1.hallazgosCriticos[0].replace(/\$/g, '').replace(/\bCOP\b/g, 'pesos colombianos')}`,
    `En galpón e inocuidad ICA, el auditor biológico advierte: ${goldfish2.hallazgosCriticos[0]}`,
    `Desde el criterio ejecutivo de Drucker, McGrath, Osterwalder, Edmondson y Mollick, mi foco hoy es: ${toc.primaryConstraint.accionExplotar}`
  ]
    .join(' ')
    .replace(/\$/g, '')
    .replace(/\bd[oó]lares\b/gi, 'pesos colombianos')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    ok: true,
    protocol: 'elephant-goldfish-toc-board',
    proposal: cleanProposal,
    dictamenFinal,
    rbacProtected: !isOwner,
    expertName: visionProfile.name,
    expertRole: visionProfile.role,
    voice: visionProfile.voice,
    gender: visionProfile.gender,
    voiceSpeed: visionProfile.speed,
    voiceInstructions: visionProfile.instructions,
    tocConstraint: toc.primaryConstraint,
    capasEstrategicasVision: capasVision,
    elephantThesis,
    goldfishCritiques: [goldfish1, goldfish2],
    salvavidasAccionables,
    decisionRouterSignals: decisionMetrics.questions,
    capsulaAprendizajeGerencial: capsula,
    displayText,
    speechText
  };
}

function evaluateSpontaneousVisionTrigger({
  message = '',
  uiContext = null,
  snapshot = null,
  sessionUser = null
} = {}) {
  const cleanMsg = String(message || '').trim();
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const computed = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const toc = (computed.av2 && computed.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, computed);
  const bsc = (computed.av2 && computed.av2.scorecardBsc) || TwinEngine.computeFarmScorecardKPIs(state, computed);
  const wow = (uiContext && uiContext.wowMetrics) || {};

  const reasons = [];
  let severity = 'baja';

  if (/cr[eé]dito|fiado|plazo\s+\d+|descuento|rebaj|10\.?000|barato|regalar/i.test(cleanMsg)) {
    reasons.push(
      `Riesgo directo sobre liquidez hacia Semana 7 (${copLabel(bsc.financiera.picoCapitalSem7Cop)}) o destrucción de margen del canal.`
    );
    severity = 'alta';
  }
  if (/cada\s*(?:1[0-5]|9|8|7)\s*d|cadencia\s*(?:1[0-5]|9|8)|1[0-9]{3}\s*aves|cobb|hubbard|4[5-9]\s*d|950\s*g|1\s*kg/i.test(cleanMsg)) {
    reasons.push(
      `Cambio estructural en ritmo productivo o peso meta que tensiona densidad térmica, vacío sanitario (<7d) y flujo continuo.`
    );
    severity = 'alta';
  }
  if (/despost|solo\s+pechuga|pechuga\s+suelta/i.test(cleanMsg) || Number(wow.colocacionRemanente48hPct) < 85) {
    reasons.push(
      `Riesgo de desbalance en el Modelo de Negocio (66% del ave fuera de pechuga sin colocación validada <48h).`
    );
    severity = 'alta';
  }
  if (Number(wow.thiEfectivo) >= 78) {
    reasons.push(
      `Alerta térmica en El Zulia (THI ${wow.thiEfectivo}) que compromete conversión y mortalidad.`
    );
    severity = 'alta';
  }
  if (bsc.procesosInternos.densidadSeccionKgM2 > 26.5 || (Number(wow.cadenciaDias) > 0 && Number(wow.cadenciaDias) <= 15)) {
    reasons.push(
      `Saturación operativa por densidad o cadencia (${bsc.procesosInternos.densidadSeccionKgM2.toFixed(2)} kg/m²) que exige revisar entresaca y vacío sanitario.`
    );
    severity = 'alta';
  }
  if ((Number(wow.horasAyunoTotal) > 0 && (Number(wow.horasAyunoTotal) < 8 || Number(wow.horasAyunoTotal) > 11.5)) || Number(wow.finosPct) > 15) {
    reasons.push(
      `Desviación de proceso evitable (ayuno pre-faena o exceso de finos en tolva) con pérdida silenciosa por lote.`
    );
    severity = severity === 'alta' ? 'alta' : 'media';
  }
  if (isOwner && /planta|capex|pelet|molino|mezcladora/i.test(cleanMsg)) {
    reasons.push(`Decisión de integración vertical reservada que requiere validar payback sin descapitalizar los galpones.`);
    severity = 'alta';
  }
  if (/visi[oó]n|estrateg|decisi[oó]n|equipo|miedo|bit[aá]cora|ventaja|modelo\s+de\s+negocio|competencia|escalar/i.test(cleanMsg)) {
    reasons.push(`Oportunidad clave para alinear criterio estratégico, ventaja temporal y disciplina de aprendizaje en campo.`);
    if (severity === 'baja') severity = 'media';
  }

  const shouldInterveneSpontaneously = reasons.length > 0;
  return {
    ok: true,
    agentId: 'gerencia_excelencia_operacional',
    agentName: 'Visión',
    exclusivelyAuthorizedForSpontaneousIntervention: true,
    shouldInterveneSpontaneously,
    severity,
    triggerReasons: reasons,
    tocPrimaryTitulo: toc.primaryConstraint.titulo,
    spontaneousHook: shouldInterveneSpontaneously
      ? `Con tu permiso, Avi: antes de cerrar este punto observo una implicación crítica — ${reasons[0]}`
      : null
  };
}

module.exports = {
  GEMINI_DECISION_MODEL,
  MANIFESTATION_KEYS,
  classifyTurnIntentAndGuardrails,
  evaluateFieldMediaChecklist,
  evaluateSpontaneousVisionTrigger,
  runElephantGoldfishBoard
};
