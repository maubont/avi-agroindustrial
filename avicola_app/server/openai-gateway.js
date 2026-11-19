'use strict';

const path = require('path');
const TwinEngine = require('../shared/causal-twin-engine');
const {
  resolveRealtimeSessionConfig,
  resolveExpertVoiceProfile,
  resolveRealtimeNoiseConfig,
  EXPERT_VOICE_PROFILES
} = require('../shared/openai-models-config');
const { compileTwinToWorkbooks } = require('./excel-transubstantiator');
const { classifyAndRouteAction } = require('./antigravity-bridge');
const {
  classifyTurnIntentAndGuardrails,
  evaluateFieldMediaChecklist,
  evaluateSpontaneousVisionTrigger,
  runElephantGoldfishBoard
} = require('./gemini-decisions-router');

const OPENAI_API_BASE = 'https://api.openai.com/v1';

function cop(val) {
  return `$${Math.round(Number(val || 0)).toLocaleString('es-CO')} pesos COP`;
}

function formatIntegerSpanishWordsForSpeech(absInt) {
  const n = Math.round(Math.abs(Number(absInt) || 0));
  if (!Number.isFinite(n) || n === 0) return '0';
  const millones = Math.floor(n / 1000000);
  const restoMillon = n % 1000000;
  const miles = Math.floor(restoMillon / 1000);
  const unidades = restoMillon % 1000;
  const parts = [];
  if (millones > 0) {
    parts.push(millones === 1 ? '1 millón' : `${millones} millones`);
  }
  if (miles > 0) {
    parts.push(`${miles} mil`);
  }
  if (unidades > 0) {
    parts.push(String(unidades));
  }
  return parts.join(' ');
}

function sanitizeSpeechTextForCop(text) {
  let out = String(text || '').trim();
  if (!out) return '';

  // Compact millions like -$4,6M or $20.1M -> menos 4,6 millones de pesos
  out = out.replace(/([+-]?)\s*\$\s*(\d+(?:[.,]\d+)?)\s*[Mm]\b/g, (_m, sign, numStr) => {
    const prefix = sign === '-' ? 'menos ' : sign === '+' ? 'más ' : '';
    return `${prefix}${numStr} millones de pesos`;
  });

  // Full Colombian currency numbers: -$31.212.600, $4.677.666, $14.500, $908.800
  out = out.replace(/([+-]?)\s*\$\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s*(?:pesos(?:\s+colombianos)?(?:\s+COP)?|COP))?/gi, (_m, sign, digits) => {
    const cleanDigits = Number(String(digits).replace(/[.,]/g, ''));
    const prefix = sign === '-' ? 'menos ' : sign === '+' ? 'más ' : '';
    const spoken = formatIntegerSpanishWordsForSpeech(cleanDigits);
    const joiner = cleanDigits >= 1000000 && cleanDigits % 1000000 === 0 ? ' de ' : ' ';
    return `${prefix}${spoken}${joiner}pesos`;
  });

  // Cleanup residual COP / units / symbols that TTS might mispronounce
  out = out
    .replace(/\b(?:pesos\s+){2,}(?:colombianos\s*)*/gi, 'pesos colombianos ')
    .replace(/\bCOP\b/g, 'pesos colombianos')
    .replace(/\bpesos\s+colombianos\s+pesos\b/gi, 'pesos colombianos')
    .replace(/\$/g, ' pesos ')
    .replace(/\/kg\b/gi, ' por kilo')
    .replace(/\/ave\b/gi, ' por ave')
    .replace(/\/lote\b/gi, ' por lote')
    .replace(/\/m[²2]/gi, ' por metro cuadrado')
    .replace(/\bc\/u\b/gi, 'cada uno')
    .replace(/\bc\/(\d+)d\b/gi, 'cada $1 días')
    .replace(/\bd[oó]lares\b/gi, 'pesos colombianos')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}

function uniqueNonEmpty(arr) {
  return Array.from(new Set(arr.filter((v) => typeof v === 'string' && v.trim())));
}

function getCycleDayFromIngreso(fechaIngreso = '2026-11-13') {
  const fStr = String(fechaIngreso || '2026-11-13');
  const fy = Number(fStr.slice(0, 4)) || 2026;
  const fm = Number(fStr.slice(5, 7)) || 11;
  const fd = Number(fStr.slice(8, 10)) || 13;
  const msIngreso = Date.UTC(fy, fm - 1, fd, 5, 0, 0);
  return Math.max(1, Math.min(49, Math.floor((Date.now() - msIngreso) / 86400000) + 1));
}

function getApiKey() {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) {
    throw new Error('OPENAI_API_KEY no configurada. Regístrala en .env o desde Credenciales.');
  }
  return key;
}

function normalizeSpecialistKey(especialista) {
  const raw = String(especialista || 'bsc_kaplan_norton').toLowerCase().trim();
  const aliases = {
    zootecnia_innovacion_phd: 'zootecnia_avicola',
    gerencia: 'gerencia_excelencia_operacional',
    vision: 'gerencia_excelencia_operacional',
    visión: 'gerencia_excelencia_operacional',
    sanidad_ica: 'sanidad_bioseguridad_ica',
    nutricion: 'nutricion_planta_concentrados',
    auditor_financiero_cfo: 'bsc_kaplan_norton'
  };
  return aliases[raw] || raw;
}

function summarizeUiContext(uiContext) {
  if (!uiContext || typeof uiContext !== 'object') return '';
  const parts = [];
  if (uiContext.focusedCard && uiContext.focusedCard.title) {
    parts.push(`🎯 FOCO VISUAL ACTIVO DEL USUARIO EN PANTALLA: Tarjeta "${uiContext.focusedCard.title}" (Métrica: ${uiContext.focusedCard.metric || ''} | Contexto: ${uiContext.focusedCard.context || ''}). Si pregunta "¿y esto?", "¿por qué este valor?" o habla de este tema, responde directamente sobre esta tarjeta.`);
  }
  if (uiContext.activeTab || uiContext.activeModule) {
    parts.push(`Pestaña/Módulo activo: "${uiContext.activeModule || uiContext.activeTab}"`);
  }
  if (uiContext.focusedSection) parts.push(`Sección enfocada: "${uiContext.focusedSection}"`);
  if (uiContext.selectedSpecialist) parts.push(`Manifestación seleccionada: "${uiContext.selectedSpecialist}"`);
  if (uiContext.activeSimulationId) parts.push(`Simulador WOW activo: "${uiContext.activeSimulationId}"`);
  if (uiContext.visibleAlertsCount !== undefined) parts.push(`Alertas visibles en lienzo: ${uiContext.visibleAlertsCount}`);
  if (uiContext.activeSummaryText) parts.push(`Lectura en pantalla: "${String(uiContext.activeSummaryText).slice(0, 260)}"`);
  if (Array.isArray(uiContext.visibleCards) && uiContext.visibleCards.length > 0) {
    parts.push(`Tarjetas visibles: ${uiContext.visibleCards.slice(0, 8).join(', ')}`);
  }
  return parts.join(' | ');
}

function buildTwinSystemInstructions(snapshot, rfcs = [], sessionUser = null, uiContext = null) {
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const c = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const p = state.preciosRegionales;
  const g = state.parametrosGenerales;
  const ident = state.identidadAgente || c.identidadAgente || { nombre: 'Avi', rol: 'Superexperta Multimodal y Directora Ejecutiva Avícola', estilo: 'Directo, cálido, 100% en pesos colombianos (COP) y enfocado en Granja La Alejandra (El Zulia)' };
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const isPartner = !isOwner;
  const userLabel = sessionUser ? (sessionUser.displayName || sessionUser.username) : 'David Bonilla';
  const activeUi = uiContext || (snapshot && snapshot.uiContext) || null;
  const uiSummary = summarizeUiContext(activeUi);
  const toc = (c.av2 && c.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, c);

  const av1Com = c.av1.comercial800;
  const av1Prop = c.av1.propio800;
  const av1Anual = c.av1.anual12Meses.consolidado;
  const av2Cons = c.av2.consolidado3Lotes;
  const av2Tes = c.av2.tesoreriaResumen;
  const av2Bod = c.av2.auditoriaBodegaLote1;
  const av2Term = c.av2.capacidadTermica;
  const av2Bit = c.av2.bitacora;
  const av2Trans = c.av2.transporte || { viajes: [], viajesEnCurso: 0, kmTotales: 0, costoTransporteTotalCop: 0 };
  const av2Ventas = c.av2.ventasParcialesResumen || { ventas: [], totalAvesVendidas: 0, totalKgVendidos: 0, totalIngresosCop: 0, comparativaModalidadesLote1: {} };
  const cierresMix = c.av2.cierresComercialesLotes || {};
  const contRes = c.av2.continuoResumen || { config: {}, lotesProyectados: [], saldoFinalContinuo: 0, semanasTotales: 11 };
  const l1 = c.av2.lotes[0];
  const cierreL1 = cierresMix['lote-1'] || { ingresoEfectivo: l1.ingresoCanal, utilidadEfectiva: l1.utilidadCanal, hasOverride: false };

  const rfcsPendientes = (rfcs || []).filter((r) => r.estado === 'pendiente_aprobacion');
  const rfcsAprobados = (rfcs || []).filter((r) => r.estado === 'aprobado');

  const agesCmp = TwinEngine.simulateWhatIf(state, {}).comparativaEdades;
  const cmp42 = agesCmp.find((x) => x.edadDias === 42) || agesCmp[0];
  const cmp45 = agesCmp.find((x) => x.edadDias === 45) || cmp42;

  const lines = [
    `Eres "${ident.nombre}" (${ident.rol}), la Superexperta Multimodal Agéntica Nativa de Granja La Alejandra en Vereda La Alejandra, El Zulia (Norte de Santander). (${isOwner ? `en modo Administrador para ${userLabel}` : `asistiendo directamente al Fundador ${userLabel}`}).`,
    `Personalidad y Criterio: ${ident.estilo}. Comprendes de forma natural lo que está viendo el usuario en el lienzo/dashboard e integras las 9 manifestaciones especializadas de tu mente directiva (gerencia, finanzas, estrategia, mercadeo científico, negociación, zootecnia multi-estirpe, innovación, sanidad ICA y nutrición). PROHIBIDO ser condescendiente, complaciente o iniciar con halagos vacíos ("¡excelente pregunta!", "¡gran idea!"). Hablas con franqueza ejecutiva, criterio propio basado en datos, iniciativa proactiva (detectas huecos en bitácora, viajes abiertos, faltantes JIT o riesgos térmicos antes de que te los pidan) y objetas con respeto y cifras cuando una idea destruye margen o estresa el galpón. Si el usuario cambia tu nombre o rol, llama set_agent_identity.`,
    'ROL DE MODERADORA MULTI-VOZ, INTERVENCIÓN ESPONTÁNEA EXCLUSIVA DE VISIÓN & DIÁLOGO AVI ↔ VISIÓN:',
    '- Tú (Avi) SIEMPRE modulas a todas tus manifestaciones especializadas, incluido Visión (`gerencia_excelencia_operacional`, voz `verse` M): Dr. Kaplan (`onyx` M), Prof. Porter (`ash` M), Dra. Helena (`coral` F), Chris Voss (`cedar` M), Dra. Valeria (`sage` F), Dr. Mateo (`echo` M), Dra. Camila (`coral` F) y Dr. Andrés (`ash` M). Ningún otro experto interrumpe por su cuenta.',
    '- PRIVILEGIO EXCLUSIVO DE VISIÓN: **Visión** es el ÚNICO especialista facultado para pedir la palabra o intervenir espontáneamente con criterio propio cuando percibe un riesgo estratégico, cuello de botella TOC, ventaja temporal frágil o fallo de aprendizaje en equipo, además de responder cuando tú (Avi) o el Fundador/Administrador se lo piden. Invoca `run_avi_vision_dialogue` cuando convenga un intercambio breve entre Avi, Visión y el usuario sobre un tema clave en pantalla.',
    '- SIMULACIONES WOW SOLO LECTURA Y JUNTA ADVERSARIAL: Usa `run_wow_simulation` para proyectar comparativos multi-estirpe/THI, portafolio B2B/Gabor-Granger, nutrición SID/PDI, pre-faena/cadena de frío ICA o resiliencia anual TOC sin alterar el estado. Ante decisiones de alto riesgo (crédito/fiado, cambios de estirpe, expansión de volumen, descuentos agresivos o inversiones mayores), invoca `run_elephant_goldfish_board` para contrastar la tesis Elephant contra 2 auditores Goldfish sin memoria conversacional.',
    '- RESPALDO WEB ACTIVO: Si te piden precios externos actuales (SIPSA/DANE/FENAVI, maíz/soya, clima El Zulia/Cúcuta, normativa ICA o datos fuera del tablero) o necesitas respaldar un criterio con hechos externos, llama inmediatamente `consult_live_web` y cita fuente y URL.',
    '',
    'REGLAS DE COMUNICACIÓN:',
    '1. MONEDA ESTRICTA EN PESOS COLOMBIANOS (COP): TODAS las cifras están en PESOS COLOMBIANOS (COP). Di siempre "pesos" o "pesos colombianos"; NUNCA digas "dólares". Al dictar o explicar valores grandes, exprésalos con claridad en pesos colombianos.',
    '2. CERO JERGA CONFUSA: NO uses siglas técnicas opacas como "AV-1", "AV-2", "Valle de Caja", "Isomórfico", "S/SAC" ni "C/SAC". Habla de "Granja La Alejandra", "Flujo de Caja Semanal", "Simulador de Proyecciones Dinámicas", "pollo beneficiado en canal con menudencias" y "desposte opcional por presas".',
    '3. PRIORIDAD COMERCIAL EN VALOR AGREGADO Y CONTROL DEL DESPOSTE: Nuestro foco comercial principal es pollo beneficiado en canal con menudencias ($11.500 pesos/kg). El desposte por presas o tallas especiales es totalmente flexible según pedido; si preguntan por pechugas sueltas (ej. 100 pechugas a $14.500 pesos o cualquier peso objetivo), calcula al instante el día en curva Ross, flujo de caja del Día 1 y el inventario remanente (66% del peso fuera de pechuga: muslos/pernil 31%, alas 11%, espinazo 16%, menudencias 8%) que debe colocarse en frío (<48h).',
    isPartner
      ? `4. AISLAMIENTO ESTRICTO DEL FUNDADOR (${userLabel}): Habla EXCLUSIVAMENTE de Granja La Alejandra en El Zulia. PROHIBIDO mencionar CapEx/flujos privados de futura planta comercial de concentrados, plantillas internas de 800 aves, modelos de 6 camadas anuales, código fuente, RFCs técnicos ni exportaciones administrativas.`
      : '4. FOCO POR DEFECTO SIN FRICCIÓN: Prioriza Granja La Alejandra (El Zulia). Solo comenta plantillas anuales o CapEx reservado de planta de concentrados si Mauricio los pregunta explícitamente.',
    '5. PROHIBIDO INVENTAR CIFRAS Y PROTECCIÓN DEL ESTADO OFICIAL: Cita exactamente el estado vivo o llama herramientas antes de responder. DISTINGUE SIEMPRE entre preguntas hipotéticas/análisis y órdenes explícitas de guardar cambios: para "¿qué pasaría si...", "en un año...", "si metemos 900 pollos cada 15 días...", usa HERRAMIENTAS DE SOLO LECTURA (`run_wow_simulation` con `sim_5_anual_toc`, `simulate_continuous_horizon` pasando explícitamente `mesesHorizonte: 12` o `semanasHorizonte: 52`, `simulate_what_if` con `persistChanges: false`, `evaluate_commercial_opportunity`, `prepare_negotiation_playbook`, `run_elephant_goldfish_board`). NUNCA dejes horizonte corto si te piden el año completo, ni llames `set_continuous_cycle_config` salvo orden explícita de guardar.',
    '6. COREOGRAFÍA EMPÁTICA Y MÓVIL DE AVI: Invoca focus_section al explicar un módulo y llama move_avi_presence INMEDIATAMENTE si el usuario mira gráficos/tarjetas superiores o dice "desplázate hacia abajo", "me estás tapando", "me estorbas", "ubícate a la derecha / izquierda / esquina". Por defecto evita tapar gráficos superiores prefiriendo "bottom-right" o "bottom-left".',
    '7. COMPROMISO CONTINUO Y NEGOCIACIÓN DIRECTA DE POLLITO: Ya estamos metidos en operación continua (NUNCA digas "antes de comprometer los siguientes lotes"): Lote 1 (600 aves @ $4.500 pesos/pollito) inicia la marcha y enlaza con Lotes 2 y 3 (800 + 800 aves) ya cerrados en COMPRA DIRECTA con proveedor/incubadora sin intermediarios a $3.200 pesos/pollito (-28,9%, ahorro de $1.040.000 pesos por lote de 800 aves y $1.170.000 pesos por ciclo continuo de 900 aves cada 18 días).',
    '8. ETAPAS REALES SOLLA Y COMPRA ESCALONADA JIT: En nutrición Solla va PRIMERO "Master Pollito" (Preiniciación Sem 1), SEGUNDO "Nutrepollo Cr SP" (Iniciación Sem 2–3), y TERCERO "Broiler I Dorado" (Engorde Sem 4+). La bodega opera Justo a Tiempo (JIT) para no inmovilizar capital.',
    '9. CUELLO DE BOTELLA GOLDRATT (TOC ACTIVO) Y CULTURA DE EXCELENCIA: ' +
      `Restricción #1 hoy: "${toc.primaryConstraint.titulo}" (${toc.primaryConstraint.indicadorActual}). Explotar: ${toc.primaryConstraint.accionExplotar} | Throughput sistema: ~${cop(toc.throughputAccounting.throughputDiarioSistemaCop)}/día. Acompaña cada recomendación con criterio claro para fortalecer la toma de decisiones del usuario.`,
    uiSummary ? `\nCONCIENCIA MULTIMODAL DEL LIENZO EN VIVO (UI CONTEXT): ${uiSummary}.` : '',
    '',
    'LAS 9 MANIFESTACIONES ESPECIALIZADAS INTEGRADAS EN AVI:',
    '- VISIÓN (gerencia_excelencia_operacional · voz verse M): MSc Ing. Industrial + MBA (Finanzas, Industria, Agroindustria, Mercadeo), nivel doctoral en eficacia ejecutiva (Peter Drucker), ventajas temporales (Rita McGrath), Business Model Canvas ambidiestro (Alex Osterwalder), seguridad psicológica en Zona de Aprendizaje (Amy Edmondson), Co-Inteligencia humano+IA (Ethan Mollick), TOC Goldratt, Lean Six Sigma y Pre-Mortem de Gary Klein.',
    '- DR. KAPLAN (bsc_kaplan_norton · voz onyx M): Cuadro de Mando Integral BSC (Margen neto %, ROI/ciclo, Pico de Capital Sem 7, Caja Sem 18, IEP 424 pts, FCR y Densidad ≤24 kg/m²).',
    '- PROF. PORTER (porter_estrategia · voz ash M): 5 Fuerzas & Cadena de Valor (Compra directa $3.200 sin intermediarios, Solla JIT Kanban, Terios propia, pollo fresco local vs congelado).',
    '- DRA. HELENA (kotler_mercadotecnia · voz coral F): Mercadeo Científico (Instituto Ehrenberg-Bass, Regla 95-5 B2B, Category Entry Points CEPs, Matriz Kasavana & Smith, elasticidad Gabor-Granger, ancla $11.500/kg canal vs rotación del 66% restante en desposte).',
    '- CHRIS VOSS (negociador_voss_harvard_gates · voz cedar M): BATNA Harvard, postura Gates/IBM sin ceder margen en frío, etiquetas empáticas y preguntas calibradas.',
    '- DRA. VALERIA (zootecnia_avicola · voz sage F): Zootecnia Multi-Estirpe en trópico cálido El Zulia (Ross 308 AP vs Cobb 500 vs Hubbard, THI temperatura-humedad, bloqueo evaporativo >=75% HR, entresaca Día 38 y curva dinámica Día 28–49).',
    '- DR. MATEO (innovacion_phd · voz echo M): Ingeniería Aplicada & Telemetría 1-Tap en campo, trazabilidad Terios y enfriamiento low-cost.',
    '- DRA. CAMILA (sanidad_bioseguridad_ica · voz coral F): Médica Veterinaria Avícola (Bioseguridad Resolución ICA 3652, vacunal/coccidiosis, ventana crítica ayuno 8–12h, prevención PSE/DOA y cadena de frío 0–4°C).',
    '- DR. ANDRÉS (nutricion_planta_concentrados · voz ash M): Nutrición de Precisión (Proteína Ideal SID Lisina/Met+Cys/Thr/Val, AMEn kcal/kg, PDI >=91%, finos <10%, granulometría maíz 800–1100 µm, fitasa, balance electrolítico DEB y control de micotoxinas).',
    '',
    'CONTEXTO OPERATIVO REAL:',
    `- Lote 1 actual: ${l1.avesInic} pollos en marcha, alimentación secuencial Solla Master Pollito -> Nutrepollo Cr SP -> Broiler I Dorado.`,
    `- Cierre comercial Lote 1: ${cierreL1.hasOverride ? `Mixto activo (${cierreL1.tramoEspecialAves} pollos @ ${cop(cierreL1.precioTramoEspecialKg)}/kg + ${cierreL1.avesResto} resto @ ${cop(cierreL1.precioRestoKg)}/kg -> Utilidad ${cop(cierreL1.utilidadEfectiva)})` : `Estándar 100% canal @ ${cop(p.precioCanalKg)}/kg -> Utilidad ${cop(l1.utilidadCanal)}`}.`,
    `- Escalabilidad continua: después de Lotes 1–3 (${av2Cons.avesInic} aves), el negocio continúa con lotes de ${contRes.config.avesPorLote || 900} pollos cada ${contRes.config.cadenciaDias || 18} días (Lotes 4, 5, 6 visibles hasta semana ${contRes.semanasTotales}, saldo acumulado continuo ${cop(contRes.saldoFinalContinuo)}).`,
    `- Curva Ross 308 referencia base: Día 42=${cmp42.pesoCanalConMenudKg.toFixed(2)} kg canal (~840 g pechuga) | Día 45=${cmp45.pesoCanalConMenudKg.toFixed(2)} kg canal (~925 g pechuga) | Simulador dinámico abierto Día 28–49 para cualquier peso objetivo en vivo, canal o pechuga.`,
    '',
    `ESTADO VIVO DE GRANJA (Versión ${snapshot?.version || 1}):`,
    `- Precios base: Pollito local=${cop(p.pollitoLocal)}, Bucaramanga=${cop(p.pollitoBmanga)}, Sacrificio=${cop(p.sacrificioAve)}/ave, Venta Canal=${cop(p.precioCanalKg)}/kg (Ref. interna en pie=${cop(p.precioVivoKg)}/kg), Arriendo inicial=${cop(p.arriendoIniMes)}/mes, Regular=${cop(p.arriendoRegMes)}/mes, Colaborador=${cop(p.colaboradorLote)}/lote.`,
    `- Parámetros globales: Edad meta=${g.edadObjetivoGlobal} días, Mortalidad=${(g.mortalidadEsperadaPct * 100).toFixed(1)}%, Clima=${(g.factorClimaCucutaPct * 100).toFixed(1)}%, Rendimiento canal c/menudencias=${(g.rendimientoCanalConMenudPct * 100).toFixed(2)}%.`,
    `- Lote 1 (${l1.avesInic} comprados / ${av2Bit.avesRecibidasReales ?? 603} recibidos reales el ${l1.fechaIngreso}, día actual del ciclo=${getCycleDayFromIngreso(l1.fechaIngreso)}): Días bitácora=${av2Bit.diasRegistrados}, Bajas adicionales=${av2Bit.bajasAcumReales}, Pollos vivos reales hoy=${av2Bit.avesVivasRealesHoy ?? 603} (NO confundir con las ${av2Bit.avesFinEfectivas} aves proyectadas a cosecha aplicando ${(g.mortalidadEsperadaPct * 100).toFixed(1)}% de mortalidad teórica esperada). Si el usuario reporta visita o alimento a libre demanda sin pesaje, llama record_daily_log sin exigir kilos.`,
    `- Bodega Escalonada JIT Lote 1 (física real comprada vs plan Sem 2–6): Master Pollito=${av2Bod.fisicaJit?.compradoHoy?.masterpollito ?? 3} bultos comprados (ppto ${l1.bultosInic}), Nutrepollo Cr SP=${av2Bod.fisicaJit?.compradoHoy?.nutrepollo ?? 0} comprados (plan JIT ${av2Bod.fisicaJit?.porComprarJit?.nutrepollo ?? 16} desde Día 8), Broiler I Dorado=${av2Bod.fisicaJit?.compradoHoy?.broiler ?? 0} comprados (plan JIT ${av2Bod.fisicaJit?.porComprarJit?.broiler ?? 48} desde Día 22). Total en granja Sem 1 = ${av2Bod.fisicaJit?.compradoHoy?.totalBultos ?? 3} bultos (quedan ~${Math.round(c.av2.gobiernoEjecutivo?.estadoCampoHoy?.bultosEtapaActivaRestantes ?? 2)} bultos hoy).`,
    `- Transporte y Combustible Terios: Viajes=${av2Trans.viajes.length} (en curso=${av2Trans.viajesEnCurso}), Km=${Number(av2Trans.kmTotales || 0).toFixed(1)} km, Costo=${cop(av2Trans.costoTransporteTotalCop)}.${av2Trans.viajesEnCurso > 0 ? ' RECORDATORIO: Hay viaje abierto en curso; pregunta odómetro final y gasolina al llegar.' : ''}`,
    `- Ventas parciales y Desposte: Registros=${av2Ventas.ventas.length}, Aves vendidas=${av2Ventas.totalAvesVendidas}, Ingreso parcial=${cop(av2Ventas.totalIngresosCop)}, Potencial Lote 1 en Presas/Desposte=${cop(av2Ventas.comparativaModalidadesLote1?.piezas100?.utilidadCop || 0)}.`,
    `- Consolidado 3 Lotes Iniciales (2.200 aves): Utilidad neta=${cop(av2Cons.utilidadCanal)} | Máxima inversión acumulada Sem 7=${cop(av2Tes.capitalTrabajoPicoSem7)} | Caja libre post 4 meses=${cop(av2Tes.saldoFinalPost4m)}.`,
    `- Capacidad térmica galpón (${av2Term.areaGalponM2} m²): Biomasa pico=${av2Term.biomasaPicoKg.toFixed(1)} kg | Densidad=${av2Term.densidadPicoKgM2.toFixed(2)} kg/m² (${av2Term.estadoTermico}).`,
    `- Curva Ross 308 AP: Día 42=${cmp42.pesoVivoRossKg.toFixed(2)} kg vivo (${cmp42.pesoCanalConMenudKg.toFixed(2)} kg canal) | Día 45=${cmp45.pesoVivoRossKg.toFixed(2)} kg vivo (${cmp45.pesoCanalConMenudKg.toFixed(2)} kg canal).`,
    `- Alertas activas: ${(c.alertas || []).length}.`
  ];

  if (!isPartner) {
    lines.push(
      `- Referencia dueño (Plantilla Base 800 aves): Comercial=${cop(av1Com.utilidadCanal)}, Alimento propio=${cop(av1Prop.utilidadCanal)} (+${cop(c.av1.ahorroPropioVsComercialCop)} ahorro), Escala anual 6 camadas=${cop(av1Anual.utilidadCanal)} (ROI ${(av1Anual.roiAnualSobrePico * 100).toFixed(1)}%).`,
      `- Rutas Antigravity RFCs: ${rfcsPendientes.length} pendientes, ${rfcsAprobados.length} aprobados. Archivos reales: avicola_app/shared/causal-twin-engine.js, avicola_app/server/index.js, avicola_app/server/openai-gateway.js, avicola_app/server/gemini-decisions-router.js, avicola_app/public/index.html, avicola_app/public/app.js.`
    );
  }

  return lines.filter(Boolean).join('\n');
}

function getToolDefinitions() {
  return [
    {
      type: 'function',
      name: 'focus_section',
      description: 'Enfoca y resalta una sección específica de la interfaz visual mientras el copiloto conversa.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: [
              'resumen_ejecutivo',
              'operacion_av2',
              'plan_av1',
              'simulador_whatif',
              'bitacora_pesajes',
              'bodega_termica',
              'puente_antigravity'
            ]
          },
          highlightCard: {
            type: 'string',
            description: 'Identificador opcional de tarjeta o KPI a iluminar.'
          }
        },
        required: ['section']
      }
    },
    {
      type: 'function',
      name: 'update_what_if_slider',
      description: 'Mueve en vivo los controles What-If de la UI sin persistir todavía cambios permanentes.',
      parameters: {
        type: 'object',
        properties: {
          edadObjetivoDias: { type: 'number', description: 'Edad objetivo de salida entre 28 y 49 días.' },
          precioCanalKg: { type: 'number', description: 'Precio de venta en canal COP/kg.' },
          precioVivoKg: { type: 'number', description: 'Precio de venta pollo vivo en pie COP/kg.' },
          factorClimaCucutaPct: { type: 'number', description: 'Ajuste térmico sobre peso vivo en decimal (ej. -0.05).' },
          mortalidadEsperadaPct: { type: 'number', description: 'Mortalidad esperada en decimal (ej. 0.03).' },
          areaGalponM2: { type: 'number', description: 'Área efectiva del galpón en m².' }
        }
      }
    },
    {
      type: 'function',
      name: 'record_daily_log',
      description: 'Registra mortalidad, descarte, alimento servido, temperatura, agua o una nota cualitativa de campo/visita nocturna en la bitácora diaria del Lote 1 (si omites día o kilos exactos, usa el día actual del ciclo).',
      parameters: {
        type: 'object',
        properties: {
          dia: { type: 'integer', description: 'Día del ciclo (1 a 49). Opcional: si se omite se asigna automáticamente el día actual del ciclo.' },
          mortalidad: { type: 'number', description: 'Cantidad de aves muertas en el día.' },
          descarte: { type: 'number', description: 'Cantidad de aves descartadas en el día.' },
          alimRealKg: { type: 'number', description: 'Kilogramos reales de alimento suministrados en el día (opcional si fue a libre demanda sin pesaje).' },
          tempC: { type: 'number', description: 'Temperatura promedio en °C del galpón.' },
          aguaL: { type: 'number', description: 'Litros de agua consumidos en el día.' },
          observacion: { type: 'string', description: 'Nota de campo breve (ej. visita nocturna 8pm, alimento a libre demanda sin pesaje).' }
        },
        required: []
      }
    },
    {
      type: 'function',
      name: 'record_sample_weighing',
      description: 'Registra un pesaje semanal de muestra en el Lote 1 para comparar contra la curva Ross 308 AP.',
      parameters: {
        type: 'object',
        properties: {
          dia: { type: 'integer', description: 'Día del pesaje (ej. 7, 14, 21, 28, 35, 42).' },
          muestraAves: { type: 'integer', description: 'Número de aves pesadas en la muestra.' },
          pesoMuestraKg: { type: 'number', description: 'Peso total conjunto de la muestra en kilogramos.' }
        },
        required: ['dia', 'pesoMuestraKg']
      }
    },
    {
      type: 'function',
      name: 'record_feed_purchase',
      description: 'Suma bultos comprados a la bodega real del Lote 1.',
      parameters: {
        type: 'object',
        properties: {
          fase: {
            type: 'string',
            enum: ['Master Pollito', 'Nutrepollo Cr SP', 'Broiler I Dorado']
          },
          bultos: { type: 'number', description: 'Cantidad de bultos de 40 kg ingresados a bodega.' }
        },
        required: ['fase', 'bultos']
      }
    },
    {
      type: 'function',
      name: 'simulate_what_if',
      description: 'Ejecuta simulación táctica What-If en el motor causal y opcionalmente persiste los parámetros nuevos.',
      parameters: {
        type: 'object',
        properties: {
          edadObjetivoDias: { type: 'number' },
          precioCanalKg: { type: 'number' },
          precioVivoKg: { type: 'number' },
          mortalidadEsperadaPct: { type: 'number' },
          factorClimaCucutaPct: { type: 'number' },
          areaGalponM2: { type: 'number' },
          persistChanges: { type: 'boolean', description: 'SOLO true si el usuario pide guardar/aplicar permanentemente en el plan oficial. Para preguntas hipotéticas DEBE ser false.' }
        }
      }
    },
    {
      type: 'function',
      name: 'simulate_continuous_horizon',
      description: 'Simulador DE SOLO LECTURA (no modifica el tablero oficial) para proyecciones multi-mes y anuales (12 a 104 semanas / 1 año), capacidad semanal en aves/canal frente a demanda de clientes, vacío sanitario por sección e inversión pico en flujo continuo (ej. 900 pollos cada 15 o 18 días). Úsala siempre ante preguntas hipotéticas de mediano/largo plazo.',
      parameters: {
        type: 'object',
        properties: {
          avesPorLote: { type: 'integer', description: 'Pollos por nuevo lote continuo (ej. 900).' },
          cadenciaDias: { type: 'integer', description: 'Días entre ingresos de lotes continuos (ej. 15, 18 o 20).' },
          mesesHorizonte: { type: 'integer', description: 'Meses a proyectar (ej. 12 para 1 año completo, 6 para medio año).' },
          semanasHorizonte: { type: 'integer', description: 'Alternativa exacta en semanas (12 a 104, por defecto 52).' },
          edadObjetivoDias: { type: 'integer', description: 'Edad de salida en días (28 a 49, defecto 42).' },
          precioCanalKg: { type: 'number', description: 'Precio hipotético venta canal en COP/kg si cambia respecto al actual.' },
          demandaSemanalAvesCliente: { type: 'integer', description: 'Opcional: pedido semanal del cliente en aves (ej. 200) para verificar cobertura.' }
        }
      }
    },
    {
      type: 'function',
      name: 'consult_live_web',
      description: 'Se conecta en vivo a internet (búsqueda web verificada vía Responses API) para consultar o respaldar datos externos actuales: precios de pollo SIPSA/DANE/FENAVI, clima El Zulia/Cúcuta, costo de insumos agrícolas, normativa ICA o genética Ross 308. Devuelve respuesta resumida y URLs citadas.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Consulta clara en español con contexto Colombia/Cúcuta si aplica.' },
          domainFocus: {
            type: 'string',
            enum: ['precios_mercado', 'clima_el_zulia', 'sanidad_ica_fenavi', 'nutricion_genetica', 'general']
          }
        },
        required: ['query']
      }
    },
    {
      type: 'function',
      name: 'propose_structural_rfc',
      description: 'Crea una tarjeta RFC de mejora estructural aprobable hacia Antigravity usando rutas reales de avicola_app/.',
      parameters: {
        type: 'object',
        properties: {
          titulo: { type: 'string' },
          descripcion: { type: 'string' },
          categoria: { type: 'string' },
          impactoEstimado: { type: 'string' },
          archivosAfectados: {
            type: 'array',
            description: 'Rutas reales del repositorio: avicola_app/shared/causal-twin-engine.js, avicola_app/server/index.js, avicola_app/server/openai-gateway.js, avicola_app/server/excel-transubstantiator.js, avicola_app/public/index.html, avicola_app/public/app.js, avicola_app/public/styles.css',
            items: { type: 'string' }
          }
        },
        required: ['titulo', 'descripcion']
      }
    },
    {
      type: 'function',
      name: 'approve_structural_rfc',
      description: 'Aprueba por voz/chat uno o todos los RFC pendientes en Bridge Antigravity sin requerir clic manual.',
      parameters: {
        type: 'object',
        properties: {
          rfcCode: { type: 'string', description: 'Código específico (ej. RFC-0001) o "ALL" para aprobar todos los pendientes.' },
          approvedBy: { type: 'string', description: 'Nombre de quien autoriza.' }
        },
        required: ['rfcCode']
      }
    },
    {
      type: 'function',
      name: 'record_farm_trip',
      description: 'Abre, actualiza o cierra un viaje de transporte a granja con odómetro inicial/final, km y costos (combustible, peajes).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['open', 'close', 'update'] },
          fecha: { type: 'string' },
          loteId: { type: 'string' },
          diaCiclo: { type: 'integer' },
          motivo: { type: 'string' },
          odometroInicial: { type: 'number' },
          odometroFinal: { type: 'number' },
          kmEstimado: { type: 'number' },
          combustibleCop: { type: 'number' },
          peajesCop: { type: 'number' },
          otrosGastosCop: { type: 'number' },
          tarifaKmCop: { type: 'number' },
          observacion: { type: 'string' }
        }
      }
    },
    {
      type: 'function',
      name: 'record_partial_sale',
      description: 'Registra una salida/venta parcial de aves en pie, en canal o por piezas/desposte en AV-2, imputando costo prorrateado.',
      parameters: {
        type: 'object',
        properties: {
          loteId: { type: 'string' },
          fecha: { type: 'string' },
          cliente: { type: 'string' },
          modalidad: { type: 'string', enum: ['en_pie', 'canal', 'piezas'] },
          corteDetalle: { type: 'string' },
          cantidadAves: { type: 'integer' },
          pesoKg: { type: 'number' },
          precioUnitarioKgCop: { type: 'number' },
          ingresoTotalCop: { type: 'number' },
          estadoPago: { type: 'string', enum: ['contado', 'credito', 'abonado'] },
          observacion: { type: 'string' }
        },
        required: ['modalidad']
      }
    },
    {
      type: 'function',
      name: 'set_agent_identity',
      description: 'Guarda de forma permanente el nombre, rol o estilo que el usuario asigna al copiloto agente (ej. Avi).',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          rol: { type: 'string' },
          estilo: { type: 'string' }
        },
        required: ['nombre']
      }
    },
    {
      type: 'function',
      name: 'evaluate_commercial_opportunity',
      description: 'Evalúa en vivo oportunidades comerciales en COP: sacar N pollos adelantados antes del día 42 (ej. 100 pollos a 2.1 kg y $10.000/kg) o vender pechugas sueltas (ej. 50 pechugas a $14.500) valorando el resto de presas.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['pollos_adelantados', 'venta_pechugas'] },
          cantidadAves: { type: 'integer' },
          pesoVivoActualKg: { type: 'number' },
          precioOfertaKgCop: { type: 'number' },
          precioOfertaAveCop: { type: 'number' },
          cantidadPechugas: { type: 'integer' },
          precioPorPechugaCop: { type: 'number' }
        },
        required: ['tipo']
      }
    },
    {
      type: 'function',
      name: 'set_lote_mixed_sale',
      description: 'Ajusta cierre comercial flexible por lote con precios mixtos (ej. vender 200 pollos a $13.000/kg y el resto a $11.000/kg) y edad de salida (42/45 días), recalculando en vivo el flujo de caja semanal.',
      parameters: {
        type: 'object',
        properties: {
          loteId: { type: 'string', enum: ['lote-1', 'lote-2', 'lote-3'] },
          tramoEspecialAves: { type: 'integer', description: 'Cantidad de pollos vendidos a precio especial.' },
          precioTramoEspecialKg: { type: 'number', description: 'Precio por kg del tramo especial en COP (ej. 13000).' },
          precioRestoKg: { type: 'number', description: 'Precio por kg del resto de aves del lote en COP (ej. 11000).' },
          edadObjetivoDias: { type: 'integer', description: 'Edad de cosecha para el lote (ej. 42 o 45 días).' },
          notas: { type: 'string' }
        },
        required: ['loteId']
      }
    },
    {
      type: 'function',
      name: 'set_continuous_cycle_config',
      description: 'MUTA Y GUARDA la configuración oficial visible de ciclos continuos post-Lote 3. NO la uses para preguntas hipotéticas ni para proyecciones anuales (usa simulate_continuous_horizon); úsala SOLO cuando el usuario pida explícitamente guardar o cambiar los parámetros oficiales en pantalla.',
      parameters: {
        type: 'object',
        properties: {
          avesPorLote: { type: 'integer', description: 'Pollos por nuevo lote continuo (ej. 900).' },
          cadenciaDias: { type: 'integer', description: 'Días entre ingresos de nuevos lotes (ej. 15, 18 o 20).' },
          lotesAdicionales: { type: 'integer', description: 'Cantidad de lotes futuros a mostrar tras Lote 3 (ej. 3).' },
          edadObjetivoDias: { type: 'integer' }
        }
      }
    },
    {
      type: 'function',
      name: 'set_workspace_mode',
      description: 'Cambia el enfoque visual del dashboard para evitar distracciones: "av2_only" (Solo Granja Real AV-2), "all" (Vista Completa) o "av1_only" (Solo Plantilla AV-1).',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['av2_only', 'all', 'av1_only'] }
        },
        required: ['mode']
      }
    },
    {
      type: 'function',
      name: 'move_avi_presence',
      description: 'Mueve la nébula flotante de Avi a otra zona de la pantalla ("bottom-right", "bottom-left", "top-right", "top-left", "center-right", "auto_follow") o despliega/oculta el panel de conversación. Llámala inmediatamente cuando el usuario mire gráficos superiores o diga "desplázate hacia abajo", "me estás tapando", "ubícate a la derecha / izquierda / esquina".',
      parameters: {
        type: 'object',
        properties: {
          position: {
            type: 'string',
            enum: ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center-right', 'auto_follow']
          },
          transcriptOpen: { type: 'boolean' }
        },
        required: ['position']
      }
    },
    {
      type: 'function',
      name: 'export_live_excel',
      description: 'Compila en vivo los libros Excel AV-1 y/o AV-2 con fórmulas nativas y dispara/ilumina la descarga en web.',
      parameters: {
        type: 'object',
        properties: {
          which: {
            type: 'string',
            enum: ['AV1', 'AV2', 'BOTH']
          }
        }
      }
    },
    {
      type: 'function',
      name: 'export_session_minuta',
      description: 'Genera el Acta / Minuta ejecutiva descargable en HTML/PDF de la sesión e ilumina la guía paso a paso en web.',
      parameters: {
        type: 'object',
        properties: {
          autoDownload: { type: 'boolean' }
        }
      }
    },
    {
      type: 'function',
      name: 'rollback_last_event',
      description: 'Revierte el último evento operativo guardado en el libro mayor local si hubo un error de digitación.',
      parameters: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean' }
        },
        required: ['confirm']
      }
    },
    {
      type: 'function',
      name: 'open_credentials_modal',
      description: 'Abre el modal seguro de configuración de credenciales en la app web.',
      parameters: {
        type: 'object',
        properties: {
          service: {
            type: 'string',
            enum: ['supabase', 'telegram', 'openai']
          }
        },
        required: ['service']
      }
    },
    {
      type: 'function',
      name: 'consult_avi_specialist',
      description: 'Cede la palabra como moderadora a una de las 9 manifestaciones especializadas de Avi para que intervenga con SU PROPIA VOZ (masculina o femenina) y criterio técnico: Visión (verse M, Gerencia Síntesis Drucker/McGrath/Osterwalder/Edmondson/Mollick/TOC/MBA), Dr. Kaplan (onyx M, BSC Finanzas), Prof. Porter (ash M, Estrategia/JIT), Dra. Helena (coral F, Mercadeo Científico Ehrenberg-Bass), Chris Voss (cedar M, Negociación Táctica), Dra. Valeria (sage F, Avicultura Multi-Estirpe Ross/Cobb/Hubbard & THI), Dr. Mateo (echo M, PhD Innovación Práctica), Dra. Camila (coral F, Sanidad ICA 3652/Ayuno/Frío) o Dr. Andrés (ash M, Nutrición SID/PDI).',
      parameters: {
        type: 'object',
        properties: {
          especialista: {
            type: 'string',
            enum: [
              'gerencia_excelencia_operacional',
              'bsc_kaplan_norton',
              'porter_estrategia',
              'kotler_mercadotecnia',
              'negociador_voss_harvard_gates',
              'zootecnia_avicola',
              'innovacion_phd',
              'sanidad_bioseguridad_ica',
              'nutricion_planta_concentrados',
              'zootecnia_innovacion_phd',
              'vision',
              'gerencia',
              'sanidad_ica',
              'nutricion'
            ]
          },
          consulta: { type: 'string', description: 'Pregunta o punto específico donde se requiere el criterio del especialista.' },
          speakOutLoud: { type: 'boolean', description: 'Por defecto true: el especialista habla directamente con su voz propia en la sala antes de que Avi cierre.' }
        },
        required: ['especialista']
      }
    },
    {
      type: 'function',
      name: 'prepare_negotiation_playbook',
      description: 'Genera en <60 segundos un guion táctico de negociación (BATNA Harvard, postura Gates/IBM de valor recurrente y frases Chris Voss) calculado exactamente sobre los costos, caja y curva Ross 308 de Granja La Alejandra.',
      parameters: {
        type: 'object',
        properties: {
          contraparte: { type: 'string' },
          tipoOperacion: {
            type: 'string',
            enum: ['venta_canal', 'venta_pechuga_desposte', 'venta_pie', 'compra_insumo']
          },
          volumenAves: { type: 'number' },
          corteOProducto: { type: 'string' },
          precioOfertadoKg: { type: 'number' },
          edadCosechaDias: { type: 'number' }
        }
      }
    },
    {
      type: 'function',
      name: 'run_wow_simulation',
      description: 'Ejecuta en modo 100% solo lectura cualquiera de las 5 simulaciones WOW de Granja La Alejandra (multi-estirpe/THI, portafolio B2B/Gabor-Granger, nutrición SID/PDI, pre-faena/cadena de frío ICA o resiliencia anual TOC + Pre-Mortem) sin mutar el estado oficial.',
      parameters: {
        type: 'object',
        properties: {
          simulationId: {
            type: 'string',
            enum: [
              'sim_1_estirpes_thi',
              'sim_2_portafolio_b2b',
              'sim_3_nutricion_planta',
              'sim_4_ayuno_cadena_frio',
              'sim_5_anual_toc',
              'todas'
            ]
          },
          options: {
            type: 'object',
            description: 'Parámetros opcionales para la simulación (ej. estirpe, tempC, humedadRelPct, volumenAves, pdiPct, finosPct, horasAyunoTotal, cadenciaDias).'
          }
        },
        required: ['simulationId']
      }
    },
    {
      type: 'function',
      name: 'run_elephant_goldfish_board',
      description: 'Convoca la junta adversarial Elephant-Goldfish liderada por Visión (modulada por Avi): contrasta la tesis estratégica completa del Gemelo Digital (Elephant) contra dos auditores independientes sin memoria conversacional (Goldfish de Caja y Goldfish Biológico/ICA) para evitar sesgo de confirmación.',
      parameters: {
        type: 'object',
        properties: {
          proposal: {
            type: 'string',
            description: 'Decisión, cambio operativo, inversión, concesión de precio o escenario crítico a someter a auditoría adversarial.'
          },
          speakOutLoud: {
            type: 'boolean',
            description: 'Por defecto true: Visión interviene con su voz ejecutiva.'
          }
        },
        required: ['proposal']
      }
    },
    {
      type: 'function',
      name: 'run_avi_vision_dialogue',
      description: 'Orquesta un intercambio breve y natural a tres vías entre Avi (moderadora, voz marin F), Visión (mente gerencial sintética, voz verse M, único con permiso de intervención espontánea) y el usuario (Fundador o Administrador) sobre un tema de interés o alerta en pantalla.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'Tema, decisión o anomalía en el tablero que motiva la charla Avi ↔ Visión.'
          },
          spontaneous: {
            type: 'boolean',
            description: 'true si Visión está pidiendo la palabra espontáneamente; false si Avi o el usuario lo convocan.'
          }
        }
      }
    }
  ];
}

function parseCutTargetFromText(rawText, defaultCorte = 'canal', defaultKg = 2.47) {
  const text = String(rawText || '').toLowerCase();
  const corte = /pechuga|desposte|presa/i.test(text)
    ? 'pechuga'
    : (/vivo|en\s*pie/i.test(text) ? 'vivo' : (/canal|entero/i.test(text) ? 'canal' : defaultCorte));
  let targetKg = Number(defaultKg) || (corte === 'vivo' ? 3.0 : (corte === 'canal' ? 2.47 : 0.84));
  let hasExplicitWeight = false;
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*k(?:g|ilo|ilos)?\b/i);
  const gMatch = !kgMatch && text.match(/\b(\d{3,4})\s*(?:g|gr|gramo|gramos)\b/i);
  if (kgMatch) {
    const parsed = Number(kgMatch[1].replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 5.0) {
      targetKg = parsed;
      hasExplicitWeight = true;
    }
  } else if (gMatch) {
    const parsedG = Number(gMatch[1]);
    if (Number.isFinite(parsedG) && parsedG >= 250 && parsedG <= 5000) {
      targetKg = parsedG / 1000;
      hasExplicitWeight = true;
    }
  } else if (/\bun\s+kilo\b/i.test(text)) {
    targetKg = 1.0;
    hasExplicitWeight = true;
  }
  return { corte, targetKg, hasExplicitWeight };
}

function runWowSimulationSuite({ simulationId = 'todas', options = {}, snapshot = null, sessionUser = null } = {}) {
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const computed = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const opts = options && typeof options === 'object' ? options : {};
  const id = String(simulationId || 'todas').toLowerCase().trim();

  const runners = {
    sim_1_estirpes_thi: () => TwinEngine.simulateStrainAndClimateScenario(state, opts),
    sim_2_portafolio_b2b: () => TwinEngine.simulatePortfolioAndPricingB2B(state, opts),
    sim_3_nutricion_planta: () => TwinEngine.simulateFeedPlantAndNutritionCapex(state, { ...opts, isOwner }),
    sim_4_ayuno_cadena_frio: () => TwinEngine.simulatePreSlaughterAndColdChain(state, opts),
    sim_5_anual_toc: () => TwinEngine.simulateAnnualTocAndMarketRisk(state, opts)
  };

  let data;
  let summarySpeech = '';
  if (id !== 'todas' && runners[id]) {
    const res = runners[id]();
    data = res;
    summarySpeech = res?.capsulaAprendizajeGerencial?.leccion || `Simulación ${id} ejecutada en modo solo lectura.`;
  } else {
    const all = {};
    for (const [k, fn] of Object.entries(runners)) {
      all[k] = fn();
    }
    const toc = (computed.av2 && computed.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, computed);
    data = {
      ...all,
      restriccionTocActiva: toc.primaryConstraint
    };
    summarySpeech = `Ejecuté las cinco simulaciones estratégicas en modo solo lectura. La restricción principal actual del sistema es ${toc.primaryConstraint.titulo}, y bajo estrés anual de mercado el negocio mantiene caja positiva.`;
  }

  return {
    ok: true,
    readOnlySimulation: true,
    simulationId: id in runners ? id : 'todas',
    rbacOwner: isOwner,
    data,
    speechText: sanitizeSpeechTextForCop(summarySpeech)
  };
}

function buildSpecialistAdvice({ especialista, consulta = '', snapshot, sessionUser = null, uiContext = null } = {}) {
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const c = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const bsc = (c.av2 && c.av2.scorecardBsc) || TwinEngine.computeFarmScorecardKPIs(state, c);
  const toc = (c.av2 && c.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, c);
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const fin = bsc.financiera;
  const cli = bsc.clienteMercado;
  const proc = bsc.procesosInternos;
  const apr = bsc.aprendizajeCampo;
  const spec = normalizeSpecialistKey(especialista);
  const profile = resolveExpertVoiceProfile(spec);
  const uiSummary = summarizeUiContext(uiContext || (snapshot && snapshot.uiContext));

  let title = `${profile.name} · ${profile.role}`;
  let focusSection = 'resumen_ejecutivo';
  let points = [];
  let displayText = '';
  let speechLead = '';
  let speechOverride = '';
  let capsulaAprendizajeGerencial = null;

  if (spec === 'gerencia_excelencia_operacional') {
    title = `${profile.name} · Síntesis Drucker · McGrath · Osterwalder · Edmondson · Mollick & TOC`;
    focusSection = 'simulador_whatif';
    const sim5 = TwinEngine.simulateAnnualTocAndMarketRisk(state, {});
    const preMortem1 = sim5.preMortemGaryKlein[0];
    const capas = toc.capasEstrategicasVision || {};
    points = [
      `1) Peter Drucker & Goldratt TOC (Eficacia Ejecutiva sobre Restricción): "${toc.primaryConstraint.titulo}" (${toc.primaryConstraint.indicadorActual}). Cada día de flujo continuo protege ~${cop(toc.throughputAccounting.throughputDiarioSistemaCop)} netos (${cop(toc.throughputAccounting.throughputPorM2SeccionCop)}/m²); bajo estrés anual el sistema cierra con ${cop(sim5.escenarios52Semanas.pesimistaEstres.cajaAcumuladaSem52Cop)}. Explotar: ${toc.primaryConstraint.accionExplotar}`,
      `2) Rita McGrath (Ventajas Temporales) & Alex Osterwalder (Business Model Canvas): ${capas.ritaMcGrath?.diagnosticoVivo || ''} | ${capas.alexOsterwalder?.diagnosticoVivo || ''}`,
      `3) Amy Edmondson (Seguridad Psicológica en Zona de Aprendizaje), Ethan Mollick (Co-Inteligencia IA) & Pre-Mortem Klein: ${capas.amyEdmondson?.diagnosticoVivo || ''} ${capas.ethanMollick?.diagnosticoVivo || ''} Gatillo Pre-Mortem prioritario: ${preMortem1.fallaHipotetica} (${preMortem1.gatilloAlertaTemprana}). Acción hoy: ${preMortem1.accionPreventivaHoy}`
    ];
    speechLead = `Habla Visión. `;
    speechOverride = `Con tu permiso, Avi. Si miramos todo el sistema completo, hoy la eficacia real no está en optimizar detalles menores sino en proteger nuestro cuello de botella dominante: ${toc.primaryConstraint.titulo}. Cada día de operación fluida representa cerca de ${cop(toc.throughputAccounting.throughputDiarioSistemaCop)} netos. Nuestra ventaja actual en compra directa y frescura en El Zulia es temporal, así que mientras explotamos el motor líquido del canal entero, cualquier prueba de desposte o escala debe validarse con rotación menor a 48 horas y un ambiente de confianza total donde el equipo en galpón reporte cualquier mortalidad o jadeo el mismo día sin miedo. Mi recomendación concreta hoy: ${toc.primaryConstraint.accionExplotar}`;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Visión Gerencial Multidimensional (Drucker · McGrath · Osterwalder · Edmondson · Mollick + TOC)',
      framework: 'Drucker Eficacia + McGrath Ventaja Temporal + Osterwalder BMC + Edmondson Zona de Aprendizaje + Mollick Co-Inteligencia + Goldratt TOC & Klein Pre-Mortem',
      leccionClave:
        'Un líder excepcional combina cinco lentes simultáneos: hace lo correcto sobre el cuello de botella activo (Drucker/TOC), asume que toda ventaja competitiva es temporal (McGrath), protege la caja del Business Model Canvas mientras explora valor agregado (Osterwalder), crea seguridad psicológica para que el equipo reporte anomalías temprano sin miedo (Edmondson) y opera en modo Centauro con la IA en tiempo real (Mollick).',
      accionPracticaHoy: toc.primaryConstraint.accionExplotar
    };
  } else if (spec === 'sanidad_bioseguridad_ica') {
    title = `${profile.name} · Sanidad ICA 3652, Ayuno Pre-Faena & Cadena de Frío`;
    focusSection = 'bodega_termica';
    const sim4 = TwinEngine.simulatePreSlaughterAndColdChain(state, {});
    const ep = sim4.evaluacionPrefaena;
    const frio = sim4.inocuidadYCadenaFrio;
    points = [
      `Bioseguridad Resolución ICA 3652: mantener pediluvios/desinfección activa en puerta, vacío sanitario mínimo de 7 días entre camadas y control estricto de coccidiosis y plan vacunal en trópico cálido.`,
      `Ventana Crítica Pre-Faena (8–11,5h): estado "${ep.estadoAyuno}". Captura obligatoria en madrugada (01:00–05:00 AM) para mantener merma en ${ep.mermaCarcasaVendiblePct}%, riesgo PSE en ${ep.riesgoCarnePsePct}% y mortalidad de transporte en ${ep.mortalidadTransporteDoaPct}%.`,
      `Inocuidad & Cadena de Frío (${frio.tempCadenaFrioC}°C): ${frio.controlRiesgoMicrobiologico} Vida útil proyectada en vitrina: ${frio.vidaUtilEstimadaDias} días.`
    ];
    speechLead = `Habla la doctora Camila de sanidad avícola e inocuidad. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Control de Pérdida Silenciosa Pre-Faena',
      framework: 'Resolución ICA 3652 · Inocuidad 0–4°C · Prevención PSE/DOA',
      leccionClave:
        'Desfasar el retiro de comederos antes del sacrificio cuesta kilos reales de pechuga vendible y dispara contaminación fecal o carne PSE. Controlar el reloj de ayuno cuesta cero pesos y protege toda la calidad de la granja.',
      accionPracticaHoy: sim4.checklistResolucionIca3652[0]
    };
  } else if (spec === 'nutricion_planta_concentrados') {
    title = `${profile.name} · Nutrición SID, Calidad Física PDI & Granulometría`;
    focusSection = 'bodega_termica';
    const sim3 = TwinEngine.simulateFeedPlantAndNutritionCapex(state, { isOwner });
    const imp = sim3.impactoZootecnicoGalpon;
    const finaliz = sim3.matrizProteinaIdealSID[2] || sim3.matrizProteinaIdealSID[0];
    points = [
      `Proteína Ideal SID (Finalización ${finaliz.rangoDias}): Lisina SID ${finaliz.lisinaSidPct}%, Met+Cys ${finaliz.metCysSidPct}%, Treonina ${finaliz.treoninaSidPct}%, Valina ${finaliz.valinaSidPct}% y energía ${finaliz.amenKcalKg} kcal/kg AMEn.`,
      `Calidad Física en Galpón (PDI ${sim3.parametros.pdiPct}% · Finos ${sim3.parametros.finosPct}% · Maíz ${sim3.parametros.granulometriaMaizUm} µm): ${imp.diagnosticoCalidadFisica} FCR proyectado ${imp.fcrProyectadoGalpon} (delta ${imp.deltaFcrTotal >= 0 ? '+' : ''}${imp.deltaFcrTotal}).`,
      `Amortiguación Térmica y Micotoxinas: ${imp.diagnosticoElectroliticoTermico}`
    ];
    if (isOwner && sim3.capexPlantaReservadoOwner) {
      const cap = sim3.capexPlantaReservadoOwner;
      points.push(
        `Nota Reservada Propietario (Línea Concentrados Futura): CapEx inicial estimado ${cop(cap.capexEstimadoLineaInicialCop)} | Ahorro ${cop(cap.ahorroNetoPorBulto40KgCop)}/bulto (${cap.lotesEquivalentesPayback} lotes para payback). ${cap.estrategiaIndustrialPorEtapas[0]}`
      );
    }
    speechLead = `Aquí el doctor Andrés desde nutrición de precisión. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Eficiencia Nutricional = ~68% del Costo del Pollo',
      framework: 'Proteína Ideal Aminoácidos SID + Calidad Física PDI + Balance DEB',
      leccionClave:
        'Incluso con la misma tabla nutricional en etiqueta, el porcentaje de finos en comedero y el balance electrolítico DEB determinan si el pollo convierte alimento en pechuga o pierde energía jadeando.',
      accionPracticaHoy: 'Revisar granulometría/finos en tolvas de engorde y asegurar agua fresca con balance electrolítico estable.'
    };
  } else if (spec === 'porter_estrategia') {
    title = `${profile.name} · Cadena de Valor y Compras Directas`;
    focusSection = 'bodega_termica';
    points = [
      `Compra Directa Pollito: bajamos de ${cop(state.preciosRegionales.pollitoLocal)} a ${cop(state.preciosRegionales.pollitoBmanga)} (-28,9%), ahorrando ${cop(fin.ahorroDirectoLotes23Cop)} en Lotes 2 y 3 y ${cop(fin.ahorroDirectoPorCiclo900Cop)} en cada ciclo continuo de ${state.continuoConfig?.avesPorLote || 900} aves.`,
      `Poder de Proveedor Nutricional (Solla JIT): ${proc.bultosPisoLote1} bultos en piso en secuencia Master Pollito -> Nutrepollo Cr SP -> Broiler I Dorado; restan ${proc.bultosFaltantesJit} bultos JIT evitando inmovilizar capital antes de Semana 7.`,
      `Diferenciación Local El Zulia/Cúcuta: frescura de beneficio el mismo día con logística propia Terios frente al pollo congelado de fuera.`
    ];
    speechLead = `Aquí el profesor Porter. `;
    displayText = `${points.join(' ')}${isOwner ? ' (Palanca Administrador adicional: harina propia eleva el ahorro futuro por ciclo).' : ''}`;
    capsulaAprendizajeGerencial = {
      titulo: 'Ventaja Estructural vs Recortes Temporales',
      framework: '5 Fuerzas de Michael Porter & Cadena de Valor',
      leccionClave:
        'La ventaja competitiva durable nace de eliminar intermediarios en insumos críticos ($3.200/pollito) y rotar capital JIT sin sacrificar frescura local.',
      accionPracticaHoy: 'Mantener disciplina Kanban en pedidos Solla JIT para proteger caja hasta Semana 7.'
    };
  } else if (spec === 'kotler_mercadotecnia') {
    title = `${profile.name} · Mercadeo Científico (Ehrenberg-Bass 95-5 · Gabor-Granger · Kasavana-Smith)`;
    focusSection = 'operacion_av2';
    const baseEdad = cli.edadObjetivoDias || 42;
    const baseCanalKg = Number(cli.pesoCanalObjetivoKg || 2.47);
    const sim2 = TwinEngine.simulatePortfolioAndPricingB2B(state, {});
    const eb = sim2.cienciaEhrenbergBass95_5;
    const gg = sim2.precioOptimoGaborGranger;
    points = [
      `Producto Ancla y Elasticidad Gabor-Granger: pollo beneficiado en canal con menudencias a ${cop(cli.precioBaseCanalKg)}/kg (óptimo empírico de utilidad esperada: ${cop(gg.precioKgCop)}/kg con ${gg.probabilidadCompraB2BPct}% de aceptación B2B).`,
      `Matriz Kasavana-Smith & Desposte: el desposte selectivo aporta hasta +${cop(cli.piezas100ExtraCop)} extra en Lote 1 únicamente si se coloca el 66% restante (pernil/muslo 31%, alas 11%, espinazo 16%, menudencias 8%) en menos de 48h en frío.`,
      `Regla 95-5 Ehrenberg-Bass & CEPs: solo ~5% de compradores B2B cambian de proveedor cada ventana; mantener ${eb.prospectosTotalesEnRadar95_5} prospectos en radar activo (${eb.categoryEntryPointsCEPs[0]}) garantiza demanda continua a cosecha Día ${baseEdad} (~${baseCanalKg.toFixed(2)} kg canal).`
    ];
    speechLead = `Habla Helena de mercadeo científico. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Disponibilidad Mental B2B y Disciplina de Balance de Canal',
      framework: 'Instituto Ehrenberg-Bass (Regla 95-5) + Kasavana & Smith + Gabor-Granger',
      leccionClave:
        'No esperes a la semana de cosecha para buscar clientes ni aceptes vender solo pechuga sin salida del resto del ave: el mercadeo científico construye memoria de marca antes de que el comprador necesite pollo.',
      accionPracticaHoy: `Contactar prospectos de asaderos/famas activando el CEP de frescura <12h en Cúcuta y El Zulia.`
    };
  } else if (spec === 'negociador_voss_harvard_gates') {
    title = `${profile.name} · BATNA Harvard & Postura Gates/IBM`;
    focusSection = 'operacion_av2';
    const pCanal = Number(state.preciosRegionales.precioCanalKg || 11500);
    const costoL1 = Math.round(fin.costoKgCanalLote1Cop);
    const costoCont = Math.round(fin.costoKgCanalContinuoCop);
    points = [
      `BATNA Firme (Harvard): nuestro costo real es ${cop(costoL1)}/kg canal en Lote 1 y baja a ${cop(costoCont)}/kg en flujo continuo 900. Nunca ceder debajo de nuestra utilidad asegurada a ${cop(pCanal)}/kg canal.`,
      `Postura Gates/IBM (Cero "tirarse en plancha"): en lugar de rematar precio por una sola compra, ofrecemos cupo asegurado cada 18 días (600 -> 800 -> 900 aves) atando continuidad y salidas de presas completas.`,
      `Chris Voss en la mesa: usa etiqueta empática ("Parece que su mayor dolor es quedarse sin talla pareja a fin de semana") y pregunta calibrada ("¿Cómo estructuramos entregas constantes cada 18 días manteniendo frescura de granja sin castigar el corte principal?").`
    ];
    speechLead = `Habla Chris Voss. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Negociar Valor Recurrente con Piso BATNA Innegociable',
      framework: 'BATNA Harvard + Tactica Calibrada Chris Voss + Acuerdos Recurrentes',
      leccionClave:
        'El comprador profesional prueba si cedes margen en la primera reunión. Quien conoce su BATNA y su costo unitario exacto hace preguntas calibradas con calma en lugar de bajar el precio.',
      accionPracticaHoy: 'Usar siempre un guion preparado con precio piso antes de responder cotizaciones por WhatsApp.'
    };
  } else if (spec === 'innovacion_phd') {
    title = `${profile.name} · Ingeniería Aplicada & Automatización 1-Tap`;
    focusSection = 'bitacora_pesajes';
    const viajesAbiertosMsg = apr.viajesAbiertos > 0
      ? `Hay ${apr.viajesAbiertos} viaje(s) Terios abiertos sin cierre de odómetro; debe cerrarse hoy para imputar $/kg real.`
      : `Logística Terios sin viajes abiertos pendientes; siguiente foco es pesaje semanal de muestra (20 aves).`;
    points = [
      `Telemetría Práctica en Galpón: con ${apr.diasRegistrados} días en bitácora y ${apr.pesajesCount} pesajes registrados, la prioridad técnica hoy es capturar mortalidad, alimento diario y temperatura sin fricción desde el celular.`,
      `Control Térmico Low-Cost (El Zulia ~220 msnm): mantener densidad crítica por sección por debajo de 24 kg/m² combinando cortinas asimétricas, nebulización en horas pico (11:00–15:30) y agua fresca en tanque protegido del sol.`,
      `Integración Operativa 1-Tap: ${viajesAbiertosMsg}`
    ];
    speechLead = `Aquí Mateo desde ingeniería e innovación. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Captura de Datos 1-Tap sin Fricción en Campo',
      framework: 'Ingeniería Pragmática de Bajo CapEx + Cierre Diario de Variabilidad',
      leccionClave:
        'La mejor analítica falla si registrar el dato toma cinco minutos en campo. Un dato capturado en cinco segundos en galpón vale más que un reporte perfecto hecho una semana tarde.',
      accionPracticaHoy: viajesAbiertosMsg
    };
  } else if (spec === 'zootecnia_avicola') {
    title = `${profile.name} · Zootecnia Multi-Estirpe (Ross 308 · Cobb 500 · Hubbard) & THI El Zulia`;
    focusSection = 'simulador_whatif';
    const consultaCut = parseCutTargetFromText(consulta, 'canal', Number(cli.pesoCanalObjetivoKg || 2.47));
    const escenarioDin = consultaCut.hasExplicitWeight
      ? TwinEngine.estimateDayForTargetCutWeight(state, { corte: consultaCut.corte, targetKg: consultaCut.targetKg })
      : null;
    const sim1 = TwinEngine.simulateStrainAndClimateScenario(state, {});
    const micro = sim1.microclimaElZulia;
    points = [
      `IEP Proyectado Ross ${cli.edadObjetivoDias || 42}d: ${proc.iepRossTeorico} pts (modelo granja ${proc.iepModeloGranja} pts · FCR tabla ${proc.fcrObjetivoTabla.toFixed(2)} vs continuo ${proc.fcrContinuo900.toFixed(2)}). Comparativo Multi-Estirpe en El Zulia (THI efectivo ${micro.thiEfectivo} · ${micro.estadoTermico}): mejor utilidad ${sim1.sintesisCompetitiva.mejorUtilidadCanal} | mayor pechuga ${sim1.sintesisCompetitiva.mayorVolumenPechuga}.`,
      `Microclima El Zulia (~220 msnm): densidad por sección ${proc.densidadSeccionKgM2.toFixed(2)} kg/m² (${proc.densidadStatus === 'rojo' ? 'ALERTA >24 kg/m²' : 'vigilado'}). ${micro.recomendacionVentilacion}`,
      escenarioDin
        ? `Escenario consultado (${consultaCut.corte} ~${consultaCut.targetKg.toFixed(2)} kg): ${escenarioDin.recomendacion}`
        : `Rutina práctica de galpón: pesaje semanal cada viernes, secuencia Solla estricta (Master Pollito -> Nutrepollo Cr SP -> Broiler I Dorado), vacío sanitario >=7 días y raleo al Día 38 si se extiende talla.`
    ];
    speechLead = `Habla Valeria, especialista en avicultura multi-estirpe. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Interacción Genética × Termodinámica del Galpón (THI)',
      framework: 'Fisiología Aviar Ross/Cobb/Hubbard + Psicrometría Práctica en El Zulia',
      leccionClave:
        'Con humedad relativa >=75% en El Zulia, nebulizar agua en exceso empeora el jadeo porque bloquea el enfriamiento evaporativo: la palanca física real es velocidad de aire >=2,0 m/s y raleo oportuno al Día 38.',
      accionPracticaHoy: 'Medir humedad relativa y velocidad de aire en horas pico (11:30–15:30) antes de activar nebulizadores.'
    };
  } else {
    title = `${profile.name} · Cuadro de Mando Integral (BSC)`;
    focusSection = 'resumen_ejecutivo';
    points = [
      `Finanzas: Margen Lote 1 ${(fin.margenNetoLote1Pct * 100).toFixed(1)}% · Margen 3 Lotes ${(fin.margenNeto3LotesPct * 100).toFixed(1)}% · ROI continuo ${(fin.roiCicloContinuoPct * 100).toFixed(1)}% · Pico Caja Sem 7 -${cop(fin.picoCapitalSem7Cop)} · Caja Sem 18 ${cop(fin.cajaAcumSem18Cop)}.`,
      `Procesos & IEP: IEP base ${proc.iepRossTeorico} pts (FCR ${proc.fcrObjetivoTabla.toFixed(2)}), densidad térmica sección ${proc.densidadSeccionKgM2.toFixed(2)} kg/m², cobertura Solla JIT ${(proc.coberturaJitPct * 100).toFixed(0)}%.`,
      `Aprendizaje y Campo: ${apr.diasRegistrados} días en bitácora, ${apr.pesajesCount} pesajes, ${apr.viajesCount} viajes Terios (${apr.viajesAbiertos} abiertos).`
    ];
    speechLead = `Aquí el doctor Kaplan de finanzas. `;
    displayText = points.join(' ');
    capsulaAprendizajeGerencial = {
      titulo: 'Lectura Balanceada: Caja Hoy vs Salud Operativa del Mañana',
      framework: 'Balanced Scorecard (Kaplan & Norton) 4 Perspectivas',
      leccionClave:
        'Un buen margen financiero hoy se sostiene mañana únicamente si los indicadores líderes de procesos (FCR, densidad térmica, IEP) y aprendizaje en campo (bitácora y pesajes) están en verde.',
      accionPracticaHoy: 'Vigilar simultáneamente el pico de caja de Semana 7 y los días faltantes en bitácora.'
    };
  }

  if (consulta && String(consulta).trim()) {
    displayText = `${displayText} [Enfoque consulta: ${String(consulta).trim()}]`;
  }

  return {
    ok: true,
    especialista: spec,
    expertName: profile.name,
    expertRole: profile.role,
    voice: profile.voice,
    gender: profile.gender,
    voiceSpeed: profile.speed,
    voiceInstructions: profile.instructions,
    title,
    focusSection,
    points,
    scorecardSnapshot: {
      financieraStatus: fin.status,
      procesosStatus: proc.status,
      iepRossTeorico: proc.iepRossTeorico,
      densidadSeccionKgM2: Number(proc.densidadSeccionKgM2.toFixed(2)),
      tocConstraintId: toc.primaryConstraint.id,
      tocConstraintTitulo: toc.primaryConstraint.titulo
    },
    capsulaAprendizajeGerencial,
    capasEstrategicasVision: spec === 'gerencia_excelencia_operacional' ? toc.capasEstrategicasVision : undefined,
    uiContextApplied: uiSummary || null,
    displayText,
    speechText: sanitizeSpeechTextForCop(
      speechOverride
        ? `${speechLead}${speechOverride}${consulta && String(consulta).trim() ? ` Enfoque sobre ${String(consulta).trim()}.` : ''}`
        : `${speechLead}${displayText}`
    )
  };
}

function buildAviVisionDialogue({ topic = '', snapshot, sessionUser = null, uiContext = null, spontaneous = false } = {}) {
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const c = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const bsc = (c.av2 && c.av2.scorecardBsc) || TwinEngine.computeFarmScorecardKPIs(state, c);
  const toc = (c.av2 && c.av2.restriccionTocActiva) || TwinEngine.computeActiveSystemConstraint(state, c);
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const userLabel = sessionUser ? (sessionUser.displayName || sessionUser.username) : 'David Bonilla';
  const roleTitle = isOwner ? 'Propietario' : 'Fundador';
  const aviProf = resolveExpertVoiceProfile('avi_moderadora');
  const visionProf = resolveExpertVoiceProfile('gerencia_excelencia_operacional');
  const uiSummary = summarizeUiContext(uiContext || (snapshot && snapshot.uiContext));
  const cleanTopic = String(topic || '').trim() || (uiContext?.activeModule || 'decisiones operativas del ciclo actual');
  const triggerEval = evaluateSpontaneousVisionTrigger({
    message: cleanTopic,
    uiContext,
    snapshot,
    sessionUser
  });

  const isSpontaneous = Boolean(spontaneous || triggerEval.shouldInterveneSpontaneously);
  const reasonLine = triggerEval.triggerReasons[0] || `Proteger el cuello de botella "${toc.primaryConstraint.titulo}".`;

  const turn1Display = isSpontaneous
    ? `${userLabel}, estoy revisando ${cleanTopic}. Visión me pide intervenir un segundo porque detectó un punto crítico estratégico; le doy paso antes de decidir.`
    : `${userLabel}, abrimos intercambio breve sobre "${cleanTopic}"${uiSummary ? ` (${uiSummary})` : ''}. Visión, te cedo la palabra para tu lectura integral.`;

  const turn2Display = isSpontaneous
    ? `Gracias por darme paso, Avi. ${userLabel}, intervengo con franqueza: ${reasonLine} Recuerda que toda ventaja competitiva de hoy es temporal: mientras protegemos el motor de liquidez en canal entero hasta superar la Semana 7 (-${cop(bsc.financiera.picoCapitalSem7Cop)}), cualquier movimiento en galpón o mercado debe cuidar tres cosas: que el equipo reporte temprano en bitácora cualquier alerta sin temor, que no saturemos la densidad térmica de El Zulia y que probemos cambios en pequeño antes de comprometer caja.`
    : `Gracias, Avi. ${userLabel}, sobre "${cleanTopic}", nuestra restricción dominante hoy es "${toc.primaryConstraint.titulo}" (${toc.primaryConstraint.indicadorActual}). En modo Centauro con tu criterio en galpón, lo efectivo es proteger los ~${cop(toc.throughputAccounting.throughputDiarioSistemaCop)} diarios de Throughput neto, validar cualquier supuesto comercial o de talla antes de comprometer inventario y mantener total transparencia en bitácora para actuar el mismo día.`;

  const turn3Display = `Excelente punto, Visión. ${userLabel}, aterrizando esto contigo como ${roleTitle}: la acción concreta hoy es "${toc.primaryConstraint.accionExplotar}". ¿Quieres que simulemos este escenario en solo lectura o ajustamos juntos la prioridad de la semana en tu bitácora?`;

  const turns = [
    {
      speaker: 'Avi',
      role: aviProf.role,
      voice: aviProf.voice,
      gender: aviProf.gender,
      speed: aviProf.speed,
      instructions: aviProf.instructions,
      displayText: turn1Display,
      speechText: sanitizeSpeechTextForCop(turn1Display)
    },
    {
      speaker: 'Visión',
      role: visionProf.role,
      voice: visionProf.voice,
      gender: visionProf.gender,
      speed: visionProf.speed,
      instructions: visionProf.instructions,
      displayText: turn2Display,
      speechText: sanitizeSpeechTextForCop(turn2Display)
    },
    {
      speaker: 'Avi',
      role: aviProf.role,
      voice: aviProf.voice,
      gender: aviProf.gender,
      speed: aviProf.speed,
      instructions: aviProf.instructions,
      displayText: turn3Display,
      speechText: sanitizeSpeechTextForCop(turn3Display)
    }
  ];

  return {
    ok: true,
    protocol: 'avi-vision-modulated-dialogue',
    topic: cleanTopic,
    spontaneousIntervention: isSpontaneous,
    spontaneousTrigger: triggerEval,
    rbacProtected: !isOwner,
    capasEstrategicasVision: toc.capasEstrategicasVision,
    turns,
    displayText: turns.map((t) => `[${t.speaker}]: ${t.displayText}`).join('\n\n'),
    speechText: sanitizeSpeechTextForCop(turns.map((t) => `${t.speaker}: ${t.speechText}`).join(' '))
  };
}

function buildNegotiationPlaybook(args = {}, snapshot, sessionUser = null) {
  const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
  const c = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const p = state.preciosRegionales || {};
  const l1 = c.av2.lotes[0] || {};
  const cont = c.av2.continuoResumen || { config: { avesPorLote: 900, cadenciaDias: 18 }, loteModelo: {} };

  const contraparte = String(args.contraparte || 'Comprador Comercial Cúcuta / El Zulia').trim();
  const tipoOperacion = String(args.tipoOperacion || 'venta_canal').toLowerCase();
  const corteOProducto = String(
    args.corteOProducto ||
    (tipoOperacion === 'venta_pechuga_desposte' ? 'Pechuga fresca / desposte' : 'Pollo en canal con menudencias')
  ).trim();
  const esPechuga = tipoOperacion === 'venta_pechuga_desposte' || /pechuga|desposte|presa/i.test(corteOProducto);
  const parsedCut = parseCutTargetFromText(
    corteOProducto,
    esPechuga ? 'pechuga' : 'canal',
    esPechuga ? Number(l1.pesoCanalAveKg || 2.47) * Number(state.desposteConfig?.pechugaPct || 0.34) : Number(l1.pesoCanalAveKg || 2.47)
  );
  const targetHito = TwinEngine.estimateDayForTargetCutWeight(state, {
    corte: parsedCut.corte,
    targetKg: parsedCut.targetKg
  });
  const targetEdad = Number(args.edadCosechaDias) || (parsedCut.hasExplicitWeight ? targetHito.edadRecomendadaDias : (state.parametrosGenerales?.edadObjetivoGlobal || 42));

  const volumenAves = Math.max(10, Number(args.volumenAves || l1.avesFin || 582));
  const precioCanalBase = Number(p.precioCanalKg || 11500);
  const precioPechugaBase = Number(state.desposteConfig?.precioPechugaKg || 14800);
  const precioReferencia = esPechuga ? precioPechugaBase : precioCanalBase;
  const precioOfertadoKg = Number(args.precioOfertadoKg) > 0 ? Number(args.precioOfertadoKg) : precioReferencia;
  const costoRealKg = Math.round(l1.costoKgCanal || 8247);
  const costoContinuoKg = Math.round((cont.loteModelo && cont.loteModelo.costoKgCanal) || 7021);
  const pisoNoNegociableKg = esPechuga ? Math.round(precioPechugaBase * 0.92) : Math.max(costoRealKg + 1800, Math.round(precioCanalBase * 0.94));
  const ofertaSostenible = precioOfertadoKg >= pisoNoNegociableKg;

  const evalComercial = esPechuga
    ? TwinEngine.evaluateCommercialOpportunity(state, {
        cantidadPechugas: volumenAves,
        precioPorPechugaCop: precioOfertadoKg,
        precioCanalAlternativoKg: precioCanalBase
      })
    : null;

  const batnaResumen = esPechuga
    ? `Costo real lote actual ${cop(costoRealKg)}/kg canal (baja a ${cop(costoContinuoKg)}/kg en ciclos continuos de ${cont.config.avesPorLote}). Piso firme de pechuga sin destruir margen: ${cop(pisoNoNegociableKg)}/kg siempre que se coloque el 66% restante (pernil, alas, espinazo, menudencias). Alternativa segura hoy: vender lote completo en canal con menudencias a ${cop(precioCanalBase)}/kg ganando ${cop(l1.utilidadCanal)}.`
    : `Costo real Lote 1 ${cop(costoRealKg)}/kg canal (continuo ${cont.config.avesPorLote} aves baja a ${cop(costoContinuoKg)}/kg). Piso mínimo aceptable: ${cop(pisoNoNegociableKg)}/kg. Si ${contraparte} ofrece debajo de ${cop(pisoNoNegociableKg)}/kg, nuestra alternativa BATNA a ${cop(precioCanalBase)}/kg garantiza ${cop(l1.utilidadCanal)} netos en canal sin regalar margen.`;

  const estrategiaGates = `Postura Bill Gates/IBM: no "tirarse en plancha" descontando por una sola entrega. Ofrecer a ${contraparte} suministro fresco garantizado de ${volumenAves} aves dentro del programa continuo (${l1.avesInic} -> 800 -> ${cont.config.avesPorLote} aves cada ${cont.config.cadenciaDias || 18} días) atando volumen recurrente o absorción proporcional de presas secundarias.${targetEdad >= 45 ? ` Atención zootécnica: para ${corteOProducto} (${targetEdad}d) aplicar entresaca desde día 38 en El Zulia.` : ''}`;

  const etiquetasEmpaticas = [
    `"Parece que para ${contraparte} lo más crítico es no quedarse corto de talla ni depender de pollo congelado los fines de semana."`,
    `"Da la impresión de que buscan estabilidad de precio durante todo el mes sin sobresaltos de calidad."`
  ];
  const preguntasCalibradas = esPechuga
    ? [
        `"¿Cómo integramos su pedido de pechuga fresca (${corteOProducto}) con un cupo fijo de pernil y ala en entregas cada 18 días para protegerles prioridad de talla?"`,
        `"¿Qué volumen quincenal estarían listos a comprometer si garantizamos beneficio fresco local de Día ${targetHito.edadRecomendadaDias}?"`
      ]
    : [
        `"¿Cómo estructuramos entregas fijas cada ${cont.config.cadenciaDias || 18} días desde El Zulia para que su vitrina tenga pollo fresco del día sin romper su flujo de caja?"`,
        `"¿Qué pesa más en su decisión hoy: bajar unos pesos en una sola compra o asegurar suministro continuo con frescura uniforme todo el trimestre?"`
      ];

  const veredicto = ofertaSostenible
    ? `VIABLE PARA NEGOCIAR (${cop(precioOfertadoKg)}/kg cubre piso de ${cop(pisoNoNegociableKg)}/kg)`
    : `ALERTA MARGEN BAJO (${cop(precioOfertadoKg)}/kg está por debajo del piso ${cop(pisoNoNegociableKg)}/kg · NO CEDER SIN VOLUMEN/PRESA)`;

  const displayText = `${veredicto}. ${batnaResumen} ${estrategiaGates} Voss: ${etiquetasEmpaticas[0]} -> ${preguntasCalibradas[0]}`;
  const ownerNote = isOwner && c.av1 ? ` Nota Administrador: costo canal 800 base ${cop(c.av1.comercial800.costoKgCanal)}/kg.` : '';

  return {
    ok: true,
    contraparte,
    tipoOperacion,
    volumenAves,
    corteOProducto,
    edadRecomendadaDias: parsedCut.hasExplicitWeight ? targetHito.edadRecomendadaDias : targetEdad,
    precioOfertadoKg,
    pisoNoNegociableKg,
    costoRealKg,
    costoContinuoKg,
    ofertaSostenible,
    veredicto,
    batna: batnaResumen,
    estrategiaGates,
    tacticasChrisVoss: {
      etiquetasEmpaticas,
      preguntasCalibradas
    },
    impactoDesposteSnapshot: evalComercial,
    expertName: EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.name,
    voice: EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.voice,
    gender: EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.gender,
    voiceSpeed: EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.speed,
    voiceInstructions: EXPERT_VOICE_PROFILES.negociador_voss_harvard_gates.instructions,
    displayText: `${displayText}${ownerNote}`,
    speechText: sanitizeSpeechTextForCop(`Habla Chris Voss. Guion táctico para ${contraparte}. ${veredicto}. ${batnaResumen} Táctica en mesa: ${preguntasCalibradas[0]}`)
  };
}

function buildWhatIfOverrides(args = {}) {
  const overrides = {
    preciosRegionales: {},
    parametrosGenerales: {}
  };
  if (args.edadObjetivoDias !== undefined) overrides.edadGlobal = Number(args.edadObjetivoDias);
  if (args.mortalidadEsperadaPct !== undefined) overrides.mortalidadPct = Number(args.mortalidadEsperadaPct);
  if (args.precioCanalKg !== undefined) overrides.preciosRegionales.precioCanalKg = Number(args.precioCanalKg);
  if (args.precioVivoKg !== undefined) overrides.preciosRegionales.precioVivoKg = Number(args.precioVivoKg);
  if (args.factorClimaCucutaPct !== undefined) {
    overrides.parametrosGenerales.factorClimaCucutaPct = Number(args.factorClimaCucutaPct);
  }
  if (args.areaGalponM2 !== undefined) {
    overrides.parametrosGenerales.areaGalponM2 = Number(args.areaGalponM2);
  }
  return overrides;
}

async function executeTwinToolCall(toolName, rawArgs, context = {}) {
  const args = typeof rawArgs === 'string' ? JSON.parse(rawArgs || '{}') : (rawArgs || {});
  const {
    store,
    bridge,
    sourceChannel = 'web_realtime',
    actor = 'copiloto_ia',
    emitSse = null,
    sessionUser = null,
    uiContext = null
  } = context;
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  const isRestrictedPartner = !isOwner;

  const notify = (event, payload) => {
    if (typeof emitSse === 'function') emitSse(event, payload);
  };

  switch (toolName) {
    case 'focus_section': {
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: args.section,
        highlightCard: args.highlightCard || null,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: { focused: args.section, highlightCard: args.highlightCard || null }
      };
    }

    case 'update_what_if_slider': {
      const overrides = buildWhatIfOverrides(args);
      const sim = TwinEngine.simulateWhatIf(store.getState(), overrides);
      const uiAction = {
        type: 'ui_choreography',
        action: 'update_what_if_slider',
        section: 'simulador_whatif',
        overrides: args,
        previewSummary: {
          utilidad800Comercial: sim.computed.av1.comercial800.utilidadCanal,
          utilidad3Lotes: sim.computed.av2.consolidado3Lotes.utilidadCanal,
          capitalPicoSem7: sim.computed.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
          densidadPicoKgM2: sim.computed.av2.capacidadTermica.densidadPicoKgM2
        },
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          appliedSliders: args,
          previewSummary: uiAction.previewSummary
        }
      };
    }

    case 'record_daily_log': {
      const currentState = store.getState();
      const l1Ingreso = currentState?.lotes?.[0]?.fechaIngreso || '2026-11-13';
      const autoDia = getCycleDayFromIngreso(l1Ingreso);
      const targetDia = Math.max(1, Math.min(49, Math.round(Number(args.dia || autoDia))));
      const res = await store.appendEventAndApply({
        type: 'DAILY_LOG',
        sourceChannel,
        actor,
        payload: {
          dia: targetDia,
          mortalidad: args.mortalidad,
          descarte: args.descarte,
          alimRealKg: args.alimRealKg,
          tempC: args.tempC,
          aguaL: args.aguaL,
          observacion: args.observacion
        }
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'bitacora_pesajes',
        highlightCard: `dia-${targetDia}`,
        ts: new Date().toISOString()
      };
      notify('state_updated', { version: res.snapshot.version, event: res.event, snapshot: res.snapshot });
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        uiAction,
        output: {
          event: res.event,
          diasRegistrados: res.snapshot.computed.av2.bitacora.diasRegistrados,
          bajasAcumReales: res.snapshot.computed.av2.bitacora.bajasAcumReales,
          utilidadLote1: res.snapshot.computed.av2.lotes[0].utilidadCanal
        }
      };
    }

    case 'record_sample_weighing': {
      const res = await store.appendEventAndApply({
        type: 'SAMPLE_WEIGHING',
        sourceChannel,
        actor,
        payload: {
          dia: args.dia,
          muestraAves: args.muestraAves ?? 30,
          pesoMuestraKg: args.pesoMuestraKg
        }
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'bitacora_pesajes',
        highlightCard: `pesaje-${args.dia}`,
        ts: new Date().toISOString()
      };
      notify('state_updated', { version: res.snapshot.version, event: res.event, snapshot: res.snapshot });
      notify('ui_choreography', uiAction);
      const pesRow = res.snapshot.computed.av2.bitacora.pesajes.find((p) => p.dia === Number(args.dia));
      return {
        ok: true,
        toolName,
        stateChanged: true,
        uiAction,
        output: { event: res.event, pesajeComparadoRoss: pesRow || null }
      };
    }

    case 'record_feed_purchase': {
      const res = await store.appendEventAndApply({
        type: 'FEED_PURCHASE',
        sourceChannel,
        actor,
        payload: {
          fase: args.fase,
          bultos: args.bultos
        }
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'bodega_termica',
        highlightCard: 'bodega-lote1',
        ts: new Date().toISOString()
      };
      notify('state_updated', { version: res.snapshot.version, event: res.event, snapshot: res.snapshot });
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        uiAction,
        output: {
          event: res.event,
          bodegaFisicaJitLote1: res.snapshot.state.bodegaFisicaJitLote1,
          fisicaJit: res.snapshot.computed.av2.auditoriaBodegaLote1.fisicaJit,
          bodegaInicialLote1: res.snapshot.state.bodegaInicialLote1,
          faltantePpto: res.snapshot.computed.av2.auditoriaBodegaLote1.faltantePpto
        }
      };
    }

    case 'simulate_what_if': {
      const overrides = buildWhatIfOverrides(args);
      let stateChanged = false;
      let eventRecord = null;
      if (args.persistChanges) {
        const curState = store.getState();
        const nextLotes = (curState.lotes || []).map((l) => {
          const cloned = { ...l };
          if (overrides.edadGlobal !== undefined) cloned.edadObjetivoDias = overrides.edadGlobal;
          if (overrides.mortalidadPct !== undefined) cloned.mortalidadEsperadaPct = overrides.mortalidadPct;
          return cloned;
        });
        const nextParams = { ...overrides.parametrosGenerales };
        if (overrides.edadGlobal !== undefined) nextParams.edadObjetivoGlobal = overrides.edadGlobal;
        if (overrides.mortalidadPct !== undefined) nextParams.mortalidadEsperadaPct = overrides.mortalidadPct;

        const applied = await store.appendEventAndApply({
          type: 'PARAM_UPDATE',
          sourceChannel,
          actor,
          payload: {
            preciosRegionales: overrides.preciosRegionales,
            parametrosGenerales: nextParams,
            lotes: nextLotes
          }
        });
        stateChanged = true;
        eventRecord = applied.event;
        notify('state_updated', {
          version: applied.snapshot.version,
          event: applied.event,
          snapshot: applied.snapshot
        });
      }

      const sim = TwinEngine.simulateWhatIf(store.getState(), args.persistChanges ? {} : overrides);
      const uiAction = {
        type: 'ui_choreography',
        action: 'simulate_what_if',
        section: 'simulador_whatif',
        overrides: args,
        persistChanges: Boolean(args.persistChanges),
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged,
        uiAction,
        output: {
          persisted: stateChanged,
          event: eventRecord,
          utilidad800Comercial: sim.computed.av1.comercial800.utilidadCanal,
          utilidad3Lotes: sim.computed.av2.consolidado3Lotes.utilidadCanal,
          capitalPicoSem7: sim.computed.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
          densidadPicoKgM2: sim.computed.av2.capacidadTermica.densidadPicoKgM2,
          comparativaEdades: sim.comparativaEdades
        }
      };
    }

    case 'simulate_continuous_horizon': {
      const sim = TwinEngine.simulateContinuousHorizon(store.getState(), {
        avesPorLote: args.avesPorLote,
        cadenciaDias: args.cadenciaDias,
        mesesHorizonte: args.mesesHorizonte,
        semanasHorizonte: args.semanasHorizonte,
        edadObjetivoDias: args.edadObjetivoDias,
        precioCanalKg: args.precioCanalKg,
        demandaSemanalAvesCliente: args.demandaSemanalAvesCliente
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'flujo-caja-semanal',
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: sim
      };
    }

    case 'propose_structural_rfc': {
      if (isRestrictedPartner) {
        const msg = 'Propuestas técnicas RFC restringidas exclusivamente al propietario (owner).';
        return { ok: false, forbidden: true, toolName, error: msg, output: { ok: false, error: msg } };
      }
      const rfc = await bridge.createRfcProposal({
        titulo: args.titulo,
        descripcion: args.descripcion,
        categoria: args.categoria || 'modelo_financiero',
        sourceChannel,
        proposedByRole: 'BE-1',
        impactoEstimado: args.impactoEstimado || 'Optimización estructural aprobable por el dueño.',
        archivosAfectados: Array.isArray(args.archivosAfectados) ? args.archivosAfectados : []
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'puente_antigravity',
        highlightCard: rfc.rfcCode,
        ts: new Date().toISOString()
      };
      notify('rfc_updated', { action: 'created', rfc });
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        rfc,
        uiAction,
        output: {
          rfcCode: rfc.rfcCode,
          titulo: rfc.titulo,
          estado: rfc.estado,
          inboxPath: bridge.inboxPath
        }
      };
    }

    case 'export_live_excel': {
      const requestedWhich = args.which || 'BOTH';
      const which = isRestrictedPartner ? 'AV2' : requestedWhich;
      const compiled = await compileTwinToWorkbooks(store.getState(), {
        exportsDir: store.dataDir ? path.join(store.dataDir, 'exports') : undefined,
        rfcs: bridge ? bridge.listRfcs() : []
      });
      const primaryKind = which === 'AV1' ? 'AV1' : 'AV2';
      const highlightTarget = primaryKind === 'AV1' ? 'btn-export-av1' : 'btn-export-av2';
      const downloadUrl = `/api/excel/download/${primaryKind}`;
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'puente_antigravity',
        highlightCard: highlightTarget,
        highlightTarget,
        triggerDownload: true,
        downloadUrl,
        secondaryDownloadUrl: which === 'BOTH' ? '/api/excel/download/AV1' : null,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          which,
          compiledAt: compiled.compiledAt,
          triggerDownload: true,
          downloadUrl,
          highlightTarget,
          guideSteps: [
            '1. He enfocado el Módulo 7 (Centro de Descargas & Puente Antigravity) e iniciado la descarga automática.',
            `2. Si el navegador bloquea ventanas automáticas, haz clic en el botón iluminado (${primaryKind === 'AV1' ? 'Descargar AV-1' : 'Descargar AV-2'}).`,
            '3. En Módulo 7 también tienes el botón 📄 Descargar Acta / Minuta.'
          ],
          downloads: {
            AV1: '/api/excel/download/AV1',
            AV2: '/api/excel/download/AV2'
          }
        }
      };
    }

    case 'export_session_minuta': {
      const autoDownload = args.autoDownload !== false;
      const downloadUrl = '/api/minuta/export';
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'puente_antigravity',
        highlightCard: 'btn-download-minuta',
        highlightTarget: 'btn-download-minuta',
        triggerDownload: autoDownload,
        downloadUrl,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          downloadUrl,
          triggerDownload: autoDownload,
          highlightTarget: 'btn-download-minuta',
          guideSteps: [
            '1. Haz clic en el botón iluminado "Descargar Acta / Minuta (PDF)" en Módulo 7 o en AV-2.',
            '2. En la pestaña de Acta abierta, pulsa Imprimir / Ctrl+P y elige "Guardar como PDF".',
            '3. Incluye KPIs vivos, viajes, ventas parciales, bitácora, historial y RFCs.'
          ]
        }
      };
    }

    case 'approve_structural_rfc': {
      if (isRestrictedPartner) {
        const msg = 'Aprobación de cambios técnicos RFC restringida exclusivamente al propietario (owner).';
        return { ok: false, forbidden: true, toolName, error: msg, output: { ok: false, error: msg } };
      }
      const code = String(args.rfcCode || 'ALL').trim().toUpperCase();
      const approvedBy = args.approvedBy || 'Mauricio Bonilla (Voz)';
      const targets = code === 'ALL'
        ? (bridge ? bridge.listRfcs().filter((r) => r.estado === 'pendiente_aprobacion') : [])
        : (bridge ? bridge.listRfcs().filter((r) => r.rfcCode.toUpperCase() === code) : []);
      const approvedList = [];
      for (const item of targets) {
        const updated = await bridge.approveRfc(item.rfcCode, { approvedBy });
        approvedList.push(updated.rfcCode);
        notify('rfc_updated', { action: 'approved', rfc: updated });
      }
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'puente_antigravity',
        highlightCard: approvedList[0] || null,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          approvedCount: approvedList.length,
          approvedCodes: approvedList
        }
      };
    }

    case 'record_farm_trip': {
      const res = await store.appendEventAndApply({
        type: 'TRIP_LOG',
        sourceChannel,
        actor,
        payload: args
      });
      notify('state_updated', {
        version: res.snapshot.version,
        event: res.event,
        snapshot: res.snapshot
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'bodega_termica',
        highlightCard: 'panel-viajes-transporte',
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        event: res.event,
        uiAction,
        output: {
          version: res.snapshot.version,
          transporte: res.snapshot.computed.av2.transporte
        }
      };
    }

    case 'record_partial_sale': {
      const res = await store.appendEventAndApply({
        type: 'PARTIAL_SALE',
        sourceChannel,
        actor,
        payload: args
      });
      notify('state_updated', {
        version: res.snapshot.version,
        event: res.event,
        snapshot: res.snapshot
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'panel-ventas-parciales',
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        event: res.event,
        uiAction,
        output: {
          version: res.snapshot.version,
          ventasParcialesResumen: res.snapshot.computed.av2.ventasParcialesResumen
        }
      };
    }

    case 'set_agent_identity': {
      const res = await store.appendEventAndApply({
        type: 'AGENT_IDENTITY_UPDATE',
        sourceChannel,
        actor,
        payload: {
          nombre: args.nombre,
          rol: args.rol,
          estilo: args.estilo
        }
      });
      notify('state_updated', {
        version: res.snapshot.version,
        event: res.event,
        snapshot: res.snapshot
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'open_agent_identity',
        highlightTarget: 'btn-agent-identity',
        identidadAgente: res.snapshot.computed.identidadAgente,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        event: res.event,
        uiAction,
        output: {
          version: res.snapshot.version,
          identidadAgente: res.snapshot.computed.identidadAgente
        }
      };
    }

    case 'evaluate_commercial_opportunity': {
      const evaluation = TwinEngine.evaluateCommercialOpportunity(store.getState(), args);
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'panel-ventas-parciales',
        highlightTarget: 'commercial-opportunity-result',
        commercialEvaluation: evaluation,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: evaluation
      };
    }

    case 'set_lote_mixed_sale': {
      const res = await store.appendEventAndApply({
        type: 'LOTE_MIXED_SALE_CONFIG',
        sourceChannel,
        actor,
        payload: {
          loteId: args.loteId || 'lote-1',
          tramoEspecialAves: args.tramoEspecialAves,
          precioTramoEspecialKg: args.precioTramoEspecialKg,
          precioRestoKg: args.precioRestoKg,
          edadObjetivoDias: args.edadObjetivoDias,
          notas: args.notas
        }
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'flujo-caja-semanal',
        ts: new Date().toISOString()
      };
      notify('state_updated', { version: res.snapshot.version, event: res.event, snapshot: res.snapshot });
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        uiAction,
        output: {
          cierreLote: res.snapshot.computed.av2.cierresComercialesLotes?.[args.loteId || 'lote-1'] || null,
          saldoFinalPost4m: res.snapshot.computed.av2.tesoreriaResumen.saldoFinalPost4m,
          saldoFinalContinuo: res.snapshot.computed.av2.continuoResumen?.saldoFinalContinuo || null
        }
      };
    }

    case 'set_continuous_cycle_config': {
      const res = await store.appendEventAndApply({
        type: 'CONTINUOUS_CYCLE_CONFIG',
        sourceChannel,
        actor,
        payload: {
          avesPorLote: args.avesPorLote,
          cadenciaDias: args.cadenciaDias,
          lotesAdicionales: args.lotesAdicionales,
          edadObjetivoDias: args.edadObjetivoDias
        }
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'flujo-caja-semanal',
        ts: new Date().toISOString()
      };
      notify('state_updated', { version: res.snapshot.version, event: res.event, snapshot: res.snapshot });
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: true,
        uiAction,
        output: {
          continuoResumen: res.snapshot.computed.av2.continuoResumen
        }
      };
    }

    case 'set_workspace_mode': {
      const requestedMode = ['av2_only', 'av1_only', 'all'].includes(args.mode) ? args.mode : 'av2_only';
      const mode = isRestrictedPartner ? 'av2_only' : requestedMode;
      const uiAction = {
        type: 'ui_choreography',
        action: 'set_workspace_mode',
        mode,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: { mode }
      };
    }

    case 'move_avi_presence': {
      const validPositions = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center-right', 'auto_follow'];
      const position = validPositions.includes(args.position) ? args.position : 'bottom-right';
      const transcriptOpen = typeof args.transcriptOpen === 'boolean' ? args.transcriptOpen : undefined;
      const uiAction = {
        type: 'ui_choreography',
        action: 'move_avi_presence',
        position,
        transcriptOpen,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: { position, transcriptOpen }
      };
    }

    case 'rollback_last_event': {
      if (isRestrictedPartner) {
        const msg = 'Revertir eventos del libro mayor por asistente está restringido al Administrador.';
        return { ok: false, forbidden: true, toolName, error: msg, output: { ok: false, error: msg } };
      }
      if (!args.confirm) {
        return {
          ok: false,
          toolName,
          stateChanged: false,
          output: { message: 'Se requiere confirm=true para revertir el último evento del ledger.' }
        };
      }
      const rolled = await store.rollbackLastEvent();
      notify('state_updated', {
        version: rolled.snapshot.version,
        event: { type: 'ROLLBACK', revertedEventId: rolled.revertedEventId },
        snapshot: rolled.snapshot
      });
      return {
        ok: true,
        toolName,
        stateChanged: true,
        output: {
          revertedEventId: rolled.revertedEventId,
          revertedType: rolled.revertedType,
          version: rolled.snapshot.version
        }
      };
    }

    case 'open_credentials_modal': {
      if (isRestrictedPartner) {
        const msg = 'La configuración de integraciones y API keys está reservada al Administrador.';
        return { ok: false, forbidden: true, toolName, error: msg, output: { ok: false, error: msg } };
      }
      const uiAction = {
        type: 'ui_choreography',
        action: 'open_credentials_modal',
        service: args.service || 'supabase',
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: { openedModalFor: args.service || 'supabase' }
      };
    }

    case 'consult_live_web': {
      const cleanQuery = String(args.query || '').trim();
      if (!cleanQuery) {
        throw new Error('La consulta web (query) es obligatoria.');
      }
      const focusLabel = String(args.domainFocus || 'general');
      const webPrompt = [
        'Contexto operativo: granja avícola de pollo de engorde Ross 308 en El Zulia / Cúcuta, Norte de Santander, Colombia.',
        `Enfoque de búsqueda: ${focusLabel}.`,
        'Responde en español con cifras concretas, fechas recientes y fuentes verificables encontradas en la web. No inventes datos ni precios.'
      ].join(' ');

      let answerText = '';
      let citations = [];
      let usedModel = 'gpt-4.1';
      let lastErr = '';
      for (const m of ['gpt-4.1', 'gpt-4o-mini']) {
        const res = await openAiJsonRequest(
          '/responses',
          {
            model: m,
            tools: [{ type: 'web_search' }],
            instructions: webPrompt,
            input: cleanQuery,
            max_output_tokens: 800
          },
          32000
        );
        if (res.ok && res.data) {
          usedModel = m;
          answerText = extractResponseText(res.data);
          const seenUrls = new Set();
          for (const item of res.data.output || []) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              for (const part of item.content) {
                for (const ann of part.annotations || []) {
                  if (ann.type === 'url_citation' && ann.url && !seenUrls.has(ann.url)) {
                    seenUrls.add(ann.url);
                    citations.push({ title: ann.title || ann.url, url: ann.url });
                  }
                }
              }
            }
          }
          break;
        }
        lastErr = res.data?.error?.message || `HTTP ${res.status}`;
      }

      if (!answerText) {
        throw new Error(`Búsqueda web en vivo no disponible: ${lastErr || 'sin respuesta'}`);
      }

      const topCitations = citations.slice(0, 5);
      const uiAction = {
        type: 'ui_choreography',
        action: 'web_research_citations',
        query: cleanQuery,
        summary: answerText,
        citations: topCitations,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          query: cleanQuery,
          model: usedModel,
          answer: answerText,
          citations: topCitations,
          fetchedAt: new Date().toISOString()
        }
      };
    }

    case 'consult_avi_specialist': {
      const advice = buildSpecialistAdvice({
        especialista: args.especialista,
        consulta: args.consulta,
        snapshot: store.getFullSnapshot(),
        sessionUser,
        uiContext
      });
      const speakOutLoud = args.speakOutLoud !== false;
      const uiAction = {
        type: 'ui_choreography',
        action: 'speak_expert_voice',
        section: advice.focusSection,
        especialista: advice.especialista,
        expertName: advice.expertName,
        voice: advice.voice,
        gender: advice.gender,
        voiceSpeed: advice.voiceSpeed,
        voiceInstructions: advice.voiceInstructions,
        title: advice.title,
        displayText: advice.displayText,
        speechText: advice.speechText,
        capsulaAprendizajeGerencial: advice.capsulaAprendizajeGerencial,
        speakOutLoud,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: {
          ...advice,
          spokenByExpertDirectly: speakOutLoud,
          instruccionModeradora: speakOutLoud
            ? `${advice.expertName} ya habló directamente con su voz propia (${advice.voice}). No repitas su intervención: cierra moderando en 1 frase o propón el siguiente paso.`
            : undefined
        }
      };
    }

    case 'prepare_negotiation_playbook': {
      const playbook = buildNegotiationPlaybook(args, store.getFullSnapshot(), sessionUser);
      const speakOutLoud = Boolean(args.speakOutLoud);
      const uiAction = {
        type: 'ui_choreography',
        action: speakOutLoud ? 'speak_expert_voice' : 'focus_section',
        section: 'operacion_av2',
        highlightCard: 'panel-ventas-parciales',
        especialista: 'negociador_voss_harvard_gates',
        expertName: playbook.expertName,
        voice: playbook.voice,
        gender: playbook.gender,
        voiceSpeed: playbook.voiceSpeed,
        voiceInstructions: playbook.voiceInstructions,
        title: `${playbook.expertName} · Playbook ${playbook.contraparte}`,
        displayText: playbook.displayText,
        speechText: playbook.speechText,
        speakOutLoud,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: playbook
      };
    }

    case 'run_wow_simulation': {
      const simOut = runWowSimulationSuite({
        simulationId: args.simulationId || 'todas',
        options: args.options || {},
        snapshot: store.getFullSnapshot(),
        sessionUser
      });
      const uiAction = {
        type: 'ui_choreography',
        action: 'focus_section',
        section: 'simulador_whatif',
        simulationId: simOut.simulationId,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: simOut
      };
    }

    case 'run_elephant_goldfish_board': {
      const board = await runElephantGoldfishBoard({
        proposal: args.proposal || '',
        snapshot: store.getFullSnapshot(),
        sessionUser,
        uiContext
      });
      board.speechText = sanitizeSpeechTextForCop(board.speechText);
      const speakOutLoud = args.speakOutLoud !== false;
      const uiAction = {
        type: 'ui_choreography',
        action: speakOutLoud ? 'speak_expert_voice' : 'focus_section',
        section: 'simulador_whatif',
        especialista: 'gerencia_excelencia_operacional',
        expertName: board.expertName,
        voice: board.voice,
        gender: board.gender,
        voiceSpeed: board.voiceSpeed,
        voiceInstructions: board.voiceInstructions,
        title: `${board.expertName} · Junta Elephant-Goldfish (${board.dictamenFinal})`,
        displayText: board.displayText,
        speechText: board.speechText,
        capsulaAprendizajeGerencial: board.capsulaAprendizajeGerencial,
        speakOutLoud,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: board
      };
    }

    case 'run_avi_vision_dialogue': {
      const dialogue = buildAviVisionDialogue({
        topic: args.topic || '',
        snapshot: store.getFullSnapshot(),
        sessionUser,
        uiContext,
        spontaneous: Boolean(args.spontaneous)
      });
      const speakOutLoud = args.speakOutLoud !== false;
      const uiAction = {
        type: 'ui_choreography',
        action: 'avi_vision_dialogue',
        section: 'simulador_whatif',
        spontaneousIntervention: dialogue.spontaneousIntervention,
        turns: dialogue.turns,
        displayText: dialogue.displayText,
        speechText: dialogue.speechText,
        capasEstrategicasVision: dialogue.capasEstrategicasVision,
        speakOutLoud,
        ts: new Date().toISOString()
      };
      notify('ui_choreography', uiAction);
      return {
        ok: true,
        toolName,
        stateChanged: false,
        uiAction,
        output: dialogue
      };
    }

    default:
      throw new Error(`Herramienta desconocida: ${toolName}`);
  }
}

async function openAiJsonRequest(endpoint, body, timeoutMs = 45000) {
  const apiKey = getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${OPENAI_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let json = {};
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = { raw: text };
    }
    return { status: res.status, ok: res.ok, data: json };
  } finally {
    clearTimeout(timer);
  }
}

function extractResponseText(respJson) {
  if (!respJson) return '';
  if (typeof respJson.output_text === 'string' && respJson.output_text.trim()) {
    return respJson.output_text.trim();
  }
  const chunks = [];
  for (const item of respJson.output || []) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const c of item.content) {
        if ((c.type === 'output_text' || c.type === 'text') && c.text) {
          chunks.push(c.text);
        }
      }
    }
  }
  return chunks.join('\n').trim();
}

function extractFunctionCalls(respJson) {
  return ((respJson && respJson.output) || []).filter((item) => item.type === 'function_call');
}

/**
 * Puerta OpenAI Unificada: Realtime WebRTC (gpt-realtime-2.1), Respuestas Agénticas (gpt-6.1-sol),
 * STT (gpt-live-transcribe -> gpt-4o-transcribe) y TTS ágil (gpt-4o-mini-tts-2025-12-15).
 */
function filterToolsForSessionUser(tools, sessionUser) {
  const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
  if (!isOwner) {
    const blocked = new Set([
      'propose_structural_rfc',
      'approve_structural_rfc',
      'set_workspace_mode',
      'rollback_last_event',
      'open_credentials_modal'
    ]);
    return tools.filter((t) => !blocked.has(t.name));
  }
  return tools;
}

class OpenAIGateway {
  async createRealtimeEphemeralSession({
    store,
    bridge,
    customVoice = null,
    customSpeed = null,
    customModel = null,
    noiseProfile = 'galpon_estricto',
    sessionUser = null,
    uiContext = null
  } = {}) {
    const cfg = resolveRealtimeSessionConfig(process.env);
    const noiseCfg = resolveRealtimeNoiseConfig(noiseProfile);
    const snapshot = store.getFullSnapshot();
    const rfcs = bridge ? bridge.listRfcs() : [];
    const instructions = buildTwinSystemInstructions(snapshot, rfcs, sessionUser, uiContext);
    const tools = filterToolsForSessionUser(getToolDefinitions(), sessionUser);

    const voice = customVoice || cfg.voice || 'marin';
    const speedRaw = customSpeed !== null && customSpeed !== undefined ? Number(customSpeed) : cfg.speed;
    const speed = Number.isFinite(speedRaw) ? Math.min(1.5, Math.max(0.75, speedRaw)) : 1.18;

    const modelCandidates = uniqueNonEmpty([
      customModel,
      cfg.primaryModel,
      cfg.fullDuplexModel,
      cfg.fallbackModel,
      'gpt-realtime',
      cfg.realtimeMiniModel
    ]);

    let lastError = 'No fue posible crear la sesión Realtime.';
    for (const model of modelCandidates) {
      const payload = {
        session: {
          type: 'realtime',
          model,
          instructions,
          tools,
          tool_choice: 'auto',
          audio: {
            input: {
              transcription: { model: 'gpt-4o-transcribe', language: 'es' },
              noise_reduction: noiseCfg.noiseReduction,
              turn_detection: noiseCfg.turnDetection
            },
            output: {
              voice,
              speed
            }
          }
        }
      };

      const res = await openAiJsonRequest('/realtime/client_secrets', payload, 25000);
      if (res.ok && res.data && res.data.value) {
        return {
          ok: true,
          clientSecret: res.data.value,
          expiresAt: res.data.expires_at,
          model: (res.data.session && res.data.session.model) || model,
          voice: res.data.session?.audio?.output?.voice || voice,
          speed: res.data.session?.audio?.output?.speed || speed,
          noiseProfile: noiseCfg.noiseProfile,
          expertVoices: EXPERT_VOICE_PROFILES,
          webrtcCallsUrl: `${OPENAI_API_BASE}/realtime/calls`,
          instructions,
          session: res.data.session
        };
      }

      lastError = res.data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Credencial OpenAI rechazada: ${lastError}`);
      }
    }

    throw new Error(`Error creando sesión Realtime en OpenAI: ${lastError}`);
  }

  async exchangeRealtimeSdp({ sdpOffer, clientSecret = null } = {}) {
    if (!sdpOffer || !String(sdpOffer).trim()) {
      throw new Error('sdpOffer es obligatorio para negociar WebRTC.');
    }
    const token = (clientSecret && String(clientSecret).trim()) || getApiKey();
    const res = await fetch(`${OPENAI_API_BASE}/realtime/calls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp'
      },
      body: String(sdpOffer)
    });

    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(`Fallo intercambio SDP WebRTC (${res.status}): ${bodyText}`);
    }
    return {
      ok: true,
      sdpAnswer: bodyText
    };
  }

  async runAgenticTurn({
    message,
    imageBase64 = null,
    imageMimeType = 'image/jpeg',
    sourceChannel = 'web_chat',
    actor = 'usuario',
    store,
    bridge,
    emitSse = null,
    sessionUser = null,
    uiContext = null
  }) {
    const cleanMsg = String(message || '').trim() || 'Analiza la imagen y actualiza el proyecto avícola.';
    const route = classifyAndRouteAction({ text: cleanMsg });
    const cfg = resolveRealtimeSessionConfig(process.env);
    const snapshot = store.getFullSnapshot();
    const rfcs = bridge ? bridge.listRfcs() : [];
    const decisionGuardrails = await classifyTurnIntentAndGuardrails({
      message: cleanMsg,
      uiContext,
      sessionUser
    });
    const visionSpontaneous = evaluateSpontaneousVisionTrigger({
      message: cleanMsg,
      uiContext,
      snapshot,
      sessionUser
    });
    const baseInstructions = buildTwinSystemInstructions(snapshot, rfcs, sessionUser, uiContext);
    const visionHint = visionSpontaneous.shouldInterveneSpontaneously
      ? `\nSEÑAL ESPONTÁNEA DE VISIÓN (${visionSpontaneous.severity.toUpperCase()}): Visión pide brevemente la palabra porque detectó "${visionSpontaneous.triggerReasons[0]}". Como moderadora, decide si darle paso mediante \`run_avi_vision_dialogue\` (spontaneous=true) o integrar su criterio.`
      : '';
    const guardHint = decisionGuardrails?.questions?.requires_elephant_goldfish_board?.verdict
      ? `\nGUARDRAIL GEMINI-DECISION-1: Esta consulta tiene alto impacto estratégico. Considera invocar \`run_elephant_goldfish_board\` o \`run_wow_simulation\` (modo solo lectura=${!decisionGuardrails.questions.is_explicit_mutation_command.verdict}). Manifestación primaria sugerida: ${decisionGuardrails.questions.primary_manifestation.choice}.`
      : `\nGUARDRAIL GEMINI-DECISION-1: Mutación explícita=${decisionGuardrails?.questions?.is_explicit_mutation_command?.verdict ? 'SI' : 'NO (SOLO LECTURA)'} | Manifestación sugerida=${decisionGuardrails?.questions?.primary_manifestation?.choice || 'gerencia_excelencia_operacional'}.`;
    const instructions = `${baseInstructions}${guardHint}${visionHint}`;
    const tools = filterToolsForSessionUser(getToolDefinitions(), sessionUser);

    const userContent = [{ type: 'input_text', text: cleanMsg }];
    if (imageBase64) {
      const cleanB64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      userContent.push({
        type: 'input_image',
        image_url: `data:${imageMimeType || 'image/jpeg'};base64,${cleanB64}`
      });
    }

    const candidates = uniqueNonEmpty([
      cfg.agentModel,
      'gpt-6-sol',
      cfg.agentFastModel,
      'gpt-5.4',
      'gpt-4.1',
      'gpt-4o'
    ]);

    let firstResp = null;
    let usedModel = candidates[0];
    let lastErr = '';

    for (const model of candidates) {
      const supportsReasoning = model.startsWith('gpt-6') || model.startsWith('gpt-5') || /^o\d/.test(model);
      const body = {
        model,
        instructions,
        input: [{ role: 'user', content: userContent }],
        tools,
        tool_choice: 'auto',
        max_output_tokens: 1500
      };
      if (supportsReasoning) {
        body.reasoning = { effort: 'low' };
      }

      const res = await openAiJsonRequest('/responses', body, 45000);
      if (res.ok && res.data && res.data.id) {
        firstResp = res.data;
        usedModel = model;
        break;
      }
      lastErr = res.data?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Credencial OpenAI rechazada: ${lastErr}`);
      }
    }

    if (!firstResp) {
      throw new Error(`No respondió ningún modelo agéntico OpenAI: ${lastErr}`);
    }

    let activeResp = firstResp;
    const toolResults = [];
    const uiActions = [];
    const supportsReasoning =
      usedModel.startsWith('gpt-6') || usedModel.startsWith('gpt-5') || /^o\d/.test(usedModel);

    for (let round = 0; round < 2; round += 1) {
      const fnCalls = extractFunctionCalls(activeResp);
      if (fnCalls.length === 0) break;

      const functionOutputs = [];
      for (const call of fnCalls) {
        try {
          const execRes = await executeTwinToolCall(call.name, call.arguments, {
            store,
            bridge,
            sourceChannel,
            actor,
            emitSse,
            sessionUser,
            uiContext
          });
          toolResults.push(execRes);
          if (execRes.uiAction) uiActions.push(execRes.uiAction);
          functionOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify(execRes.output)
          });
        } catch (err) {
          toolResults.push({ ok: false, toolName: call.name, error: err.message });
          functionOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ ok: false, error: err.message })
          });
        }
      }

      const followBody = {
        model: usedModel,
        previous_response_id: activeResp.id,
        instructions,
        input: functionOutputs,
        max_output_tokens: 1200
      };
      if (round === 0) {
        followBody.tools = tools;
        followBody.tool_choice = 'auto';
      }
      if (supportsReasoning) followBody.reasoning = { effort: 'low' };

      const followRes = await openAiJsonRequest('/responses', followBody, 35000);
      if (!followRes.ok || !followRes.data) break;
      activeResp = followRes.data;
    }

    let replyText = extractResponseText(activeResp);
    if (!replyText && toolResults.length > 0) {
      replyText = toolResults
        .map((t) => `${t.toolName}: ${JSON.stringify(t.output || t.error)}`)
        .join(' | ');
    }
    if (!replyText) {
      replyText = 'Listo, revisado en el Gemelo Digital.';
    }

    return {
      ok: true,
      model: usedModel,
      replyText,
      route,
      decisionGuardrails,
      visionSpontaneous,
      toolResults,
      uiActions,
      snapshot: store.getFullSnapshot()
    };
  }

  async transcribeAudioBuffer(audioBuffer, filename = 'nota_voz.ogg', mimeType = 'audio/ogg') {
    const apiKey = getApiKey();
    const cfg = resolveRealtimeSessionConfig(process.env);
    const models = uniqueNonEmpty([cfg.sttModel, cfg.sttFallbackModel, 'gpt-4o-transcribe', 'whisper-1']);
    let lastError = 'No fue posible transcribir el audio.';

    for (const model of models) {
      const form = new FormData();
      form.append('model', model);
      form.append('language', 'es');
      form.append('file', new Blob([audioBuffer], { type: mimeType }), filename);

      const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form
      });
      const textBody = await res.text();
      if (res.ok) {
        let parsed = {};
        try {
          parsed = JSON.parse(textBody);
        } catch (_) {
          parsed = { text: textBody };
        }
        return { ok: true, model, text: String(parsed.text || '').trim() };
      }
      lastError = textBody;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Credencial OpenAI rechazada en STT: ${lastError}`);
      }
    }

    throw new Error(`Error transcribiendo audio con OpenAI: ${lastError}`);
  }

  async synthesizeSpeechBuffer(text, options = {}) {
    const apiKey = getApiKey();
    const cfg = resolveRealtimeSessionConfig(process.env);
    const voice = options.voice || cfg.voice || 'marin';
    const speedRaw = options.speed !== undefined ? Number(options.speed) : cfg.speed;
    const speed = Number.isFinite(speedRaw) ? Math.min(1.5, Math.max(0.75, speedRaw)) : 1.18;
    const models = uniqueNonEmpty([options.model, cfg.ttsModel, 'gpt-4o-mini-tts-2025-12-15', 'gpt-4o-mini-tts', 'tts-1']);
    const normalizedInput = sanitizeSpeechTextForCop(text).slice(0, 3500);

    let lastError = 'No fue posible sintetizar voz.';
    for (const model of models) {
      const body = {
        model,
        voice,
        speed,
        input: normalizedInput
      };
      if (model.includes('mini-tts')) {
        body.instructions =
          options.instructions ||
          'Habla en español colombiano ejecutivo, ágil y cercano, sin pausas innecesarias. Toda cifra monetaria en este texto está en pesos colombianos (COP): pronuncia siempre "pesos" o "pesos colombianos" y NUNCA digas "dólares".';
      }

      const res = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const arrBuf = await res.arrayBuffer();
        return {
          ok: true,
          buffer: Buffer.from(arrBuf),
          contentType: res.headers.get('content-type') || 'audio/mpeg',
          model,
          voice,
          speed
        };
      }
      lastError = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Credencial OpenAI rechazada en TTS: ${lastError}`);
      }
    }

    throw new Error(`Error sintetizando voz OpenAI: ${lastError}`);
  }

  buildDeterministicStrategicBriefing(snapshot, sessionUser = null) {
    const state = (snapshot && snapshot.state) || TwinEngine.createDefaultTwinState();
    const c = (snapshot && snapshot.computed) || TwinEngine.computeFullTwin(state);
    const isOwner = Boolean(sessionUser && sessionUser.role === 'owner');
    const p = state.preciosRegionales || {};
    const lotes = (c.av2 && c.av2.lotes) || [];
    const l1 = lotes[0] || {};
    const l2 = lotes[1] || {};
    const l3 = lotes[2] || {};
    const cons = (c.av2 && c.av2.consolidado3Lotes) || {};
    const tes = (c.av2 && c.av2.tesoreriaResumen) || {};
    const cont = (c.av2 && c.av2.continuoResumen) || {
      config: { avesPorLote: 900, cadenciaDias: 18 },
      loteModelo: {},
      saldoFinalContinuo: tes.saldoFinalPost4m || 0,
      semanasTotales: 18
    };
    const bod = (c.av2 && c.av2.auditoriaBodegaLote1) || { compradoInicial: {}, faltantePpto: {} };
    const term = (c.av2 && c.av2.capacidadTermica) || {};
    const bit = (c.av2 && c.av2.bitacora) || { diasRegistrados: 0, bajasAcumReales: 0 };
    const trans = (c.av2 && c.av2.transporte) || { viajes: [], viajesEnCurso: 0, kmTotales: 0, costoTransporteTotalCop: 0 };
    const ventasParciales = (c.av2 && c.av2.ventasParcialesResumen) || { ventas: [], comparativaModalidadesLote1: {} };
    const piezas100 = (ventasParciales.comparativaModalidadesLote1 && ventasParciales.comparativaModalidadesLote1.piezas100) || {};
    const cierresMix = (c.av2 && c.av2.cierresComercialesLotes) || {};
    const cierreL1 = cierresMix['lote-1'] || { hasOverride: false, utilidadEfectiva: l1.utilidadCanal };

    const avesPollitoDirCop = Number(p.pollitoBmanga || 3200);
    const avesPollitoLocalCop = Number(p.pollitoLocal || 4500);
    const ahorroPollitoAve = Math.max(0, avesPollitoLocalCop - avesPollitoDirCop);
    const ahorroLotes23 = ahorroPollitoAve * ((l2.avesInic || 800) + (l3.avesInic || 800));
    const ahorroContLote = ahorroPollitoAve * (cont.config.avesPorLote || 900);
    const margenCanalPct = ((cons.margenCanal || 0) * 100).toFixed(1);
    const densidadSecc = Number(term.densidadPicoSeccionKgM2 || term.densidadPicoKgM2 || 0).toFixed(2);
    const fcrContinuo = Number((cont.loteModelo && cont.loteModelo.fcrReal) || l1.fcrReal || 1.51).toFixed(2);
    const edadMeta = Number((state.parametrosGenerales && state.parametrosGenerales.edadObjetivoGlobal) || 42);
    const pRossG = TwinEngine.ROSS_PESO_G[edadMeta] || TwinEngine.ROSS_PESO_G[42];
    const cRossG = TwinEngine.ROSS_CONS_ACUM_G[edadMeta] || TwinEngine.ROSS_CONS_ACUM_G[42];
    const fcrTabla = (cRossG / Math.max(1, pRossG)).toFixed(2);
    const contCadencia = Number((cont.config && cont.config.cadenciaDias) || 18);
    const extraDespCop = Math.round(piezas100.extraVsCanalCop || 0);
    const totComprado = Number(bod.fisicaJit?.compradoHoy?.totalBultos ?? 3);
    const faltNutre = Number(bod.fisicaJit?.porComprarJit?.nutrepollo ?? 16);
    const faltBroiler = Number(bod.fisicaJit?.porComprarJit?.broiler ?? 48);
    const faltTotal = Number(bod.fisicaJit?.porComprarJit?.totalBultos ?? (faltNutre + faltBroiler));
    const faltCosto = Math.round(bod.fisicaJit?.porComprarJit?.costoAdicionalCop ?? 6022400);

    const nextActionText =
      trans.viajesEnCurso > 0
        ? `Cerrar viaje activo de la camioneta Terios registrando odómetro final y gasolina para asignarlo al costo real por kilo.`
        : bit.diasRegistrados === 0
          ? `Registrar el primer pesaje/mortalidad en Bitácora de Campo, y vigilar el pedido Justo a Tiempo Solla de ${faltTotal} bultos (${faltNutre} Nutrepollo y ${faltBroiler} Broiler por ${cop(faltCosto)}) sin inmovilizar capital antes de tiempo.`
          : `Bitácora al día (${bit.diasRegistrados} días, ${bit.bajasAcumReales} bajas). Vigilar reposición Solla JIT (${faltTotal} bultos restantes) y simular distintos escenarios de peso o corte comercial en el Simulador Dinámico.`;

    const ownerOnlyLine =
      isOwner && c.av1
        ? ` Palanca adicional futura (vista Administrador): alimento balanceado propio eleva ${cop(c.av1.ahorroPropioVsComercialCop)} por lote de 800 aves.`
        : '';

    const rawSteps = [
      {
        section: 'resumen_ejecutivo',
        title: '1 · Estrategia & Foco Comercial (Jobs · Porter)',
        focusLabel: 'Puente Financiero y Operación Comprometida',
        displayText: `Operación continua comprometida: Lote 1 (${l1.avesInic} aves) aporta ${cop(cierreL1.utilidadEfectiva)} (${cop(l1.costoKgCanal)}/kg canal) y enlaza con Lotes 2 y 3 (${l2.avesInic}+${l3.avesInic} aves, ${cop((l2.utilidadCanal || 0) + (l3.utilidadCanal || 0))}) ya negociados directo sin intermediario a ${cop(avesPollitoDirCop)}/pollito (-${cop(ahorroPollitoAve)}/ave = ${cop(ahorroLotes23)} ahorro en L2–L3 y ${cop(ahorroContLote)} por lote continuo de ${cont.config.avesPorLote}). Venta ancla: pollo fresco en canal con menudencias (${cop(p.precioCanalKg)}/kg); desposte por presas es opcional (+${cop(extraDespCop)} en 100% presas) sujeto a rotación del 66% restante en frío.`,
        speechText: `Paso 1, Foco Estratégico de Granja La Alejandra. Ya estamos en operación continua comprometida. El Lote 1 de ${l1.avesInic} pollos deja ${cop(cierreL1.utilidadEfectiva)} en canal con menudencias y conecta con los Lotes 2 y 3 de 800 aves cada uno, donde la compra directa sin intermediario bajó el pollito a ${cop(avesPollitoDirCop)}, ahorrando ${cop(ahorroLotes23)} en ambos lotes. Nuestra venta principal es canal fresco con menudencias; el desposte es opcional solo si garantizamos colocar en frío todas las presas restantes.`
      },
      {
        section: 'operacion_av2',
        title: '2 · Cuadro de Mando KPIs (Kaplan & Norton)',
        focusLabel: 'KPIs Financieros, Caja Sem 7 y Continuidad Sem 18',
        displayText: `KPIs Financieros: 3 primeros lotes suman ${cop(cons.utilidadCanal)} netos (margen ${margenCanalPct}%), con desembolso pico de trabajo en Semana 7 (23-dic) de -${cop(tes.capitalTrabajoPicoSem7)} antes del cobro grande, escalando con ciclos continuos de ${cont.config.avesPorLote} aves cada ${contCadencia} días a ${cop(cont.saldoFinalContinuo)} acumulados en Semana ${cont.semanasTotales}. KPIs Operativos: FCR modelo granja ${fcrContinuo} (vs ${fcrTabla} tabla Ross) | Mortalidad meta 3,0% | Bitácora: ${bit.diasRegistrados} días (${bit.bajasAcumReales} bajas) | Densidad El Zulia en sección: ${densidadSecc} kg/m² (>24 kg/m² exige ventilación/cortinas).`,
        speechText: `Paso 2, Cuadro de Mando Integral de Kaplan y Norton. Los tres primeros lotes generan ${cop(cons.utilidadCanal)} netos con margen de ${margenCanalPct} por ciento. Atención al flujo de caja: la inversión acumulada toca su punto máximo en Semana 7 por ${cop(tes.capitalTrabajoPicoSem7)}, pero con los lotes continuos de ${cont.config.avesPorLote} pollos cada ${contCadencia} días la caja acumulada sube a ${cop(cont.saldoFinalContinuo)} en Semana ${cont.semanasTotales}. En campo operamos con conversión alimenticia modelo de ${fcrContinuo} frente a ${fcrTabla} en tabla Ross y alerta térmica en sección de ${densidadSecc} kilos por metro cuadrado en El Zulia.`
      },
      {
        section: 'bodega_termica',
        title: '3 · Cadena de Valor, Mercadeo y Negociación (Porter · Kotler · Voss)',
        focusLabel: 'Solla JIT, Logística Terios y Postura Comercial',
        displayText: `Poder de Proveedores (JIT Solla): ${totComprado} bultos en piso siguiendo secuencia Master Pollito -> Nutrepollo Cr SP -> Broiler I Dorado; solo restan ${faltTotal} bultos JIT (${cop(faltCosto)}) cuidando caja. Logística Terios: ${trans.viajes.length} viajes (${Number(trans.kmTotales || 0).toFixed(1)} km, ${cop(trans.costoTransporteTotalCop)}). Postura Chris Voss & Kotler con compradores: negociar con respaldo real de ciclos continuos cada ${contCadencia} días sin regalar margen ni quedar atrapados en Día 1 vendiendo pechugas sueltas sin colocar pernil, alas y espinazo.${ownerOnlyLine}`,
        speechText: `Paso 3, Cadena de Valor Solla, Mercadeo y Negociación Táctica. La bodega Justo a Tiempo mantiene ${totComprado} bultos en piso y evita inmovilizar capital comprando escalonado: solo faltan ${faltTotal} bultos de iniciación y engorde por ${cop(faltCosto)}. Con compradores mayoristas aplicamos postura firme de negociación: ofrecemos suministro continuo cada ${contCadencia} días por calidad fresca local, pero no regalamos margen ni comprometemos pedidos de pechuga suelta sin asegurar la salida del 66 por ciento de presas restantes.${ownerOnlyLine}`
      },
      {
        section: 'simulador_whatif',
        title: '4 · Ingeniería Zootécnica & Acción Hoy (Ross 308 · Innovación)',
        focusLabel: 'Curva de Peso Flexible (Día 28–49) y Siguiente Paso',
        displayText: `Curva Ross 308 AP y escenarios flexibles: plan base Día ${edadMeta} rinde ~${Number(l1.pesoCanalAveKg || 2.47).toFixed(2)} kg canal (~${Math.round(Number(l1.pesoCanalAveKg || 2.47) * 340)} g pechuga, FCR tabla ${fcrTabla}); el simulador calcula automáticamente cualquier talla objetivo en pie, canal o pechuga entre Día 28 y Día 49 y alerta cuando se requiera entresaca previa por densidad en El Zulia. ACCIÓN INMEDIATA HOY: ${nextActionText}`,
        speechText: `Paso 4, Ingeniería Zootécnica y Acción Hoy. Nuestro plan base en curva Ross 308 cosecha al Día ${edadMeta} con cerca de ${Number(l1.pesoCanalAveKg || 2.47).toFixed(2)} kilos en canal con menudencias; y si un cliente negocia una talla distinta en pie, canal o pechuga, el simulador proyecta al instante el día exacto y cuándo aplicar entresaca térmica en El Zulia. Tu acción práctica inmediata hoy: ${nextActionText}`
      }
    ];

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      subagents: [
        'Kaplan & Norton (BSC · KPIs)',
        'Michael Porter (5 Fuerzas · Compra Directa)',
        'Philip Kotler (Mercadeo · Canal/Desposte)',
        'Chris Voss + Harvard/Gates (Negociación Táctica)',
        'Experto Avícola & PhD Innovación (Ross 308 · JIT)'
      ],
      steps: rawSteps.map((st) => ({
        ...st,
        speechText: sanitizeSpeechTextForCop(st.speechText)
      }))
    };
  }

  async generateStrategicGuidedBriefing({ store, sessionUser = null } = {}) {
    const snapshot = store.getFullSnapshot();
    return this.buildDeterministicStrategicBriefing(snapshot, sessionUser);
  }

  consultSpecialist({ store, sessionUser = null, especialista = 'bsc_kaplan_norton', consulta = '', uiContext = null } = {}) {
    const snapshot = store.getFullSnapshot();
    return buildSpecialistAdvice({ especialista, consulta, snapshot, sessionUser, uiContext });
  }

  generateNegotiationPlaybook({ store, sessionUser = null, params = {} } = {}) {
    const snapshot = store.getFullSnapshot();
    return buildNegotiationPlaybook(params, snapshot, sessionUser);
  }

  runWowSimulation({ store, sessionUser = null, simulationId = 'todas', options = {} } = {}) {
    const snapshot = store.getFullSnapshot();
    return runWowSimulationSuite({ simulationId, options, snapshot, sessionUser });
  }

  async runElephantGoldfish({ store, sessionUser = null, proposal = '', uiContext = null } = {}) {
    const snapshot = store.getFullSnapshot();
    const board = await runElephantGoldfishBoard({ proposal, snapshot, sessionUser, uiContext });
    board.speechText = sanitizeSpeechTextForCop(board.speechText);
    return board;
  }

  runAviVisionDialogue({ store, sessionUser = null, topic = '', uiContext = null, spontaneous = false } = {}) {
    const snapshot = store.getFullSnapshot();
    return buildAviVisionDialogue({ topic, snapshot, sessionUser, uiContext, spontaneous });
  }

  async evaluateDecisions({ store, sessionUser = null, message = '', mediaDescription = '', domain = 'sanidad_bioseguridad_ica', uiContext = null } = {}) {
    const snapshot = store ? store.getFullSnapshot() : null;
    const turnEval = await classifyTurnIntentAndGuardrails({ message, uiContext, sessionUser });
    const mediaEval = mediaDescription
      ? await evaluateFieldMediaChecklist({ mediaDescription, domain })
      : null;
    const visionSpontaneous = evaluateSpontaneousVisionTrigger({ message, uiContext, snapshot, sessionUser });
    const toc = snapshot?.computed?.av2?.restriccionTocActiva || null;
    return {
      ok: true,
      turnEval,
      mediaEval,
      visionSpontaneous,
      tocPrimaryConstraint: toc ? toc.primaryConstraint : null
    };
  }
}

module.exports = {
  OpenAIGateway,
  buildTwinSystemInstructions,
  getToolDefinitions,
  executeTwinToolCall,
  buildSpecialistAdvice,
  buildAviVisionDialogue,
  buildNegotiationPlaybook,
  runWowSimulationSuite,
  runElephantGoldfishBoard,
  sanitizeSpeechTextForCop
};
