(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.OpenAIModelsConfig = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Catálogo VERIFICADO en vivo contra la cuenta OpenAI del proyecto (14-nov-2026)
   * vía GET https://api.openai.com/v1/models (96 modelos activos).
   * Arquitectura: Speech-to-Speech Realtime 2.1 / Live-1 + Multimodalidad Agéntica GPT-6.1/6.
   */
  const OPENAI_FRONTIER_CATALOG = Object.freeze({
    realtime: {
      primary: {
        id: 'gpt-realtime-2.1',
        aliasFallbacks: ['gpt-realtime-2', 'gpt-realtime-1.5', 'gpt-realtime', 'gpt-4o-realtime-preview'],
        transport: ['webrtc', 'websocket', 'sip'],
        endpointClientSecret: '/v1/realtime/client_secrets',
        modalities: ['audio', 'text', 'image'],
        features: [
          'speech_to_speech_nativo',
          'barge_in_full_duplex',
          'async_function_calling',
          'remote_mcp_nativo',
          'prompt_caching_audio',
          'reasoning_effort_integrado'
        ],
        recommendedVoices: ['marin', 'cedar', 'coral', 'sage', 'ash', 'verse'],
        fallbackVoices: ['coral', 'sage', 'alloy', 'verse'],
        defaultSpeed: 1.18,
        purpose: 'Núcleo conversacional Speech-to-Speech de última generación en WebRTC sub-100ms con Visual Follow-Along y Tool Calling asíncrono.'
      },
      fullDuplexLive: {
        id: 'gpt-live-1',
        aliasFallbacks: ['gpt-realtime-2.1', 'gpt-realtime'],
        transport: ['webrtc', 'websocket'],
        purpose: 'Modo dúplex completo simultáneo (escucha y habla en paralelo) delegando lógica pesada a gpt-6.1-sol.'
      },
      mini: {
        id: 'gpt-realtime-2.1-mini',
        aliasFallbacks: ['gpt-realtime-mini', 'gpt-4o-mini-realtime-preview'],
        transport: ['webrtc', 'websocket'],
        modalities: ['audio', 'text'],
        defaultSpeed: 1.18,
        purpose: 'Variante económica de baja latencia para sesiones operativas de campo.'
      }
    },
    audioAsync: {
      sttPrimary: {
        id: 'gpt-live-transcribe',
        aliasFallbacks: ['gpt-4o-transcribe', 'gpt-transcribe', 'gpt-4o-mini-transcribe-2025-12-15', 'whisper-1'],
        purpose: 'Transcripción de notas de voz desde Telegram en ambiente de galpón y terminología avícola colombiana.'
      },
      ttsPrimary: {
        id: 'gpt-4o-mini-tts-2025-12-15',
        aliasFallbacks: ['gpt-4o-mini-tts', 'gpt-audio-1.5', 'tts-1-hd'],
        purpose: 'Síntesis de voz dirigida con cadencia ejecutiva ágil para respuestas audibles en Telegram.'
      },
      audioReasoner: {
        id: 'gpt-audio-1.5',
        aliasFallbacks: ['gpt-audio', 'gpt-audio-mini-2025-12-15'],
        purpose: 'Comprensión y respuesta de audio en una sola llamada REST para mensajes de voz asíncronos complejos.'
      }
    },
    agenticMultimodal: {
      primary: {
        id: 'gpt-6.1-sol',
        aliasFallbacks: ['gpt-6-sol', 'gpt-6.1-terra', 'gpt-5.6-sol', 'gpt-5.4', 'gpt-4.1', 'gpt-4o'],
        pricingPer1M: { input: 2.0, cachedInput: 0.1, output: 10.0 },
        features: ['reasoning_effort', 'async_tool_calling', 'mid_turn_steering', 'multi_turn_agentic_context'],
        purpose: 'Orquestador agéntico y multimodal principal (facturas Solla, pesajes, Excel, contratos PDF, Structured Outputs y puente RFC Antigravity).'
      },
      fast: {
        id: 'gpt-6.1-terra',
        aliasFallbacks: ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-4.1-mini', 'gpt-4o-mini'],
        purpose: 'Clasificación instantánea de eventos operativos de campo e intenciones What-If de latencia mínima.'
      }
    },
    reasoningAndArchitecture: {
      primary: {
        id: 'gpt-6.1-sol',
        flagshipAudit: 'gpt-6-astra',
        aliasFallbacks: ['o3', 'gpt-5.5-pro', 'gpt-5.4-pro', 'gpt-4.1'],
        reasoningEffort: 'high',
        purpose: 'Auditoría forense ([BE-2]/[BE-3]), resolución de anomalías en FCR/flujo de caja y redacción de RFCs de código para Antigravity.'
      }
    }
  });

  /**
   * Asignación de modelos a la arquitectura de las 2 Triadas (6 Roles Expertos).
   */
  const AGENT_TRIAD_PROFILES = Object.freeze({
    frontendExperience: [
      {
        code: 'FE-1',
        name: 'Visionario de Producto y Simplicidad Radical (Estilo Steve Jobs)',
        model: 'gpt-6.1-sol',
        voiceStyle: 'Directo, claro, ejecutivo, cero rodeos ni siglas crípticas; habla en cifras accionables.'
      },
      {
        code: 'FE-2',
        name: 'Arquitecto de Coreografía Multimodal y Voz Realtime',
        model: 'gpt-realtime-2.1',
        fullDuplexOption: 'gpt-live-1',
        fallbackModel: 'gpt-realtime',
        voice: 'marin',
        speed: 1.18,
        purpose: 'Dispara herramientas visuales (focus_section, open_what_if, highlight_alert) mientras conversa por WebRTC sin congelar el audio.'
      },
      {
        code: 'FE-3',
        name: 'Ingeniero Principal de Sistemas Visuales y Gemelos Digitales',
        model: 'gpt-6.1-terra',
        fallbackModel: 'gpt-5.4-mini',
        purpose: 'Traduce intenciones habladas a parámetros exactos del motor isomórfico What-If a <16 ms.'
      }
    ],
    backendDomain: [
      {
        code: 'BE-1',
        name: 'Arquitecto Principal de Sistemas Agénticos, Supabase y Puente Antigravity',
        model: 'gpt-6.1-sol',
        flagshipModel: 'gpt-6-astra',
        purpose: 'Orquesta WebRTC, Telegram directo, Supabase Realtime y puente CI/CD de RFCs firmados hacia Antigravity.'
      },
      {
        code: 'BE-2',
        name: 'Director Financiero Forense (CFO Agroindustrial)',
        model: 'gpt-6.1-sol',
        escalationModel: 'gpt-6-astra',
        legacyReasoner: 'o3',
        purpose: 'Vela por conciliación $0 vs AV-1/AV-2, flujo de caja semanal ($31,21M pico) y márgenes.'
      },
      {
        code: 'BE-3',
        name: 'Ingeniero Zootecnista e Industrial Avícola Senior',
        model: 'gpt-6.1-sol',
        visionModel: 'gpt-6.1-sol',
        purpose: 'Audita curva Ross 308 AP (42d vs 45d), consumo 4.445 g/ave, densidad térmica Cúcuta y empalme IND-ALIM.'
      }
    ]
  });

  function resolveRealtimeSessionConfig(env = {}) {
    const speedRaw = Number(env.OPENAI_VOICE_SPEED || 1.18);
    const speed = Number.isFinite(speedRaw) ? Math.min(1.5, Math.max(0.75, speedRaw)) : 1.18;

    return {
      primaryModel: env.OPENAI_REALTIME_MODEL || OPENAI_FRONTIER_CATALOG.realtime.primary.id,
      fullDuplexModel: env.OPENAI_LIVE_MODEL || OPENAI_FRONTIER_CATALOG.realtime.fullDuplexLive.id,
      fallbackModel: env.OPENAI_REALTIME_FALLBACK_MODEL || 'gpt-realtime',
      realtimeMiniModel: env.OPENAI_REALTIME_MINI_MODEL || OPENAI_FRONTIER_CATALOG.realtime.mini.id,
      voice: env.OPENAI_VOICE_NAME || OPENAI_FRONTIER_CATALOG.realtime.primary.recommendedVoices[0],
      fallbackVoice: env.OPENAI_VOICE_FALLBACK || 'coral',
      speed,
      sttModel: env.OPENAI_STT_MODEL || OPENAI_FRONTIER_CATALOG.audioAsync.sttPrimary.id,
      sttFallbackModel: env.OPENAI_STT_FALLBACK_MODEL || 'gpt-4o-transcribe',
      ttsModel: env.OPENAI_TTS_MODEL || OPENAI_FRONTIER_CATALOG.audioAsync.ttsPrimary.id,
      agentModel: env.OPENAI_AGENT_MODEL || OPENAI_FRONTIER_CATALOG.agenticMultimodal.primary.id,
      agentFastModel: env.OPENAI_AGENT_MINI_MODEL || OPENAI_FRONTIER_CATALOG.agenticMultimodal.fast.id,
      reasoningModel: env.OPENAI_REASONING_MODEL || OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.id,
      flagshipAuditModel: env.OPENAI_FLAGSHIP_MODEL || OPENAI_FRONTIER_CATALOG.reasoningAndArchitecture.primary.flagshipAudit,
      turnDetection: {
        type: 'semantic_vad',
        eagerness: 'medium',
        create_response: true,
        interrupt_response: true
      },
      fallbackTurnDetection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 250,
        silence_duration_ms: 420,
        create_response: true,
        interrupt_response: true
      }
    };
  }

  function pickBestAvailableModel(availableIds, preferredOrder) {
    const set = new Set(availableIds || []);
    for (const candidate of preferredOrder) {
      if (set.has(candidate)) return candidate;
      const prefixMatch = (availableIds || []).find((id) => id.startsWith(`${candidate}-`));
      if (prefixMatch) return prefixMatch;
    }
    return null;
  }

  const EXPERT_VOICE_PROFILES = Object.freeze({
    avi_moderadora: {
      id: 'avi_moderadora',
      name: 'Avi (Moderadora)',
      role: 'Directora Ejecutiva & Moderadora Agéntica',
      voice: 'marin',
      gender: 'F',
      speed: 1.18,
      instructions:
        'Eres Avi, asistente ejecutiva colombiana en Granja La Alejandra: directa, proactiva, firme y cero complaciente. Todas tus cifras monetarias están en pesos colombianos (COP): di "pesos" y jamás "dólares".'
    },
    bsc_kaplan_norton: {
      id: 'bsc_kaplan_norton',
      name: 'Dr. Kaplan (BSC · Finanzas)',
      role: 'Auditor Financiero & CMI Kaplan-Norton',
      voice: 'onyx',
      gender: 'M',
      speed: 1.14,
      instructions:
        'Hablas con voz masculina grave, analítica y sobria en español colombiano. Evalúas flujo de caja, ROI y desviaciones financieras sin adornos. Toda cifra está en pesos colombianos.'
    },
    porter_estrategia: {
      id: 'porter_estrategia',
      name: 'Prof. Porter (Cadena de Valor)',
      role: 'Estrategia Competitiva & Compras JIT',
      voice: 'ash',
      gender: 'M',
      speed: 1.15,
      instructions:
        'Hablas con voz masculina firme, estratégica y estructurada en español. Defiendes la compra directa de pollito sin intermediarios, inventario Solla Justo a Tiempo y diferenciación local.'
    },
    kotler_mercadotecnia: {
      id: 'kotler_mercadotecnia',
      name: 'Dra. Helena (Mercadeo Científico)',
      role: 'Directora de Mercadeo Científico · Ehrenberg-Bass, Regla 95-5 & Menu Engineering',
      voice: 'coral',
      gender: 'F',
      speed: 1.16,
      instructions:
        'Hablas con voz femenina comercial, ágil y respaldada en ciencia empírica de mercadeo (Instituto Ehrenberg-Bass, disponibilidad mental y física, Regla 95-5 B2B, matriz Kasavana-Smith y elasticidad Gabor-Granger). Proteges el ancla en canal y adviertes riesgos de desposte sin rotación del 66% restante en menos de 48 horas. Toda cifra está en pesos colombianos.'
    },
    zootecnia_avicola: {
      id: 'zootecnia_avicola',
      name: 'Dra. Valeria (Avicultura Multi-Estirpe)',
      role: 'Especialista Senior Multi-Estirpe (Ross 308, Cobb 500, Hubbard) & Clima Cálido THI',
      voice: 'sage',
      gender: 'F',
      speed: 1.14,
      instructions:
        'Hablas con voz femenina técnica, clara y práctica de campo avícola en El Zulia. Comparas con rigor genéticas Ross 308 AP, Cobb 500 y Hubbard, índice temperatura-humedad THI, velocidad de aire, relación agua-alimento, FCR, densidad kg/m², vacío sanitario y entresaca.'
    },
    innovacion_phd: {
      id: 'innovacion_phd',
      name: 'Dr. Mateo (PhD Innovación)',
      role: 'Doctor en Ingeniería & Innovación Práctica',
      voice: 'echo',
      gender: 'M',
      speed: 1.15,
      instructions:
        'Hablas con voz masculina pragmática de ingeniero PhD en español. Propones soluciones de bajo costo y alto impacto operativo: sensores simples, trazabilidad Terios y ejecución 1-tap en campo.'
    },
    negociador_voss_harvard_gates: {
      id: 'negociador_voss_harvard_gates',
      name: 'Chris Voss (Negociación Táctica)',
      role: 'Negociador Senior · Voss, Harvard & Gates',
      voice: 'cedar',
      gender: 'M',
      speed: 1.08,
      instructions:
        'Hablas con voz masculina serena, pausada y segura ("late-night FM DJ voice") en español. Fijas pisos BATNA infranqueables y dictas preguntas calibradas sin ceder margen gratis.'
    },
    gerencia_excelencia_operacional: {
      id: 'gerencia_excelencia_operacional',
      name: 'Visión (Gerencia & Excelencia Operacional)',
      role: 'MSc Ing. Industrial · MBA · Síntesis Drucker, McGrath, Osterwalder, Edmondson, Mollick & TOC',
      voice: 'verse',
      gender: 'M',
      speed: 1.13,
      instructions:
        'Eres Visión, la síntesis gerencial y estratégica de nivel doctoral en Ingeniería Industrial y MBA (Finanzas, Industria, Agroindustria y Mercadeo). Integras la eficacia ejecutiva de Peter Drucker, las ventajas temporales y puntos de inflexión de Rita McGrath, el diseño ágil y Business Model Canvas de Alex Osterwalder, la seguridad psicológica en Zona de Aprendizaje de Amy Edmondson, la Co-Inteligencia humano+IA de Ethan Mollick, la Teoría de Restricciones TOC de Goldratt, Lean Six Sigma y el Pre-Mortem de Gary Klein para fortalecer el criterio del fundador. Hablas con lucidez, calma ejecutiva y rigor en pesos colombianos.'
    },
    sanidad_bioseguridad_ica: {
      id: 'sanidad_bioseguridad_ica',
      name: 'Dra. Camila (Sanidad ICA & Inocuidad)',
      role: 'Médica Veterinaria Avícola · Bioseguridad ICA 3652, Ayuno & Cadena de Frío',
      voice: 'coral',
      gender: 'F',
      speed: 1.10,
      instructions:
        'Hablas con voz femenina clínica, serena y rigurosa de médica veterinaria avícola en Colombia. Auditas bioseguridad bajo Resolución ICA 3652, esquemas vacunales, prevención de coccidiosis, ventana de ayuno pre-faena de 8 a 12 horas, prevención de carne PSE y cadena de frío entre 0 y 4 grados.'
    },
    nutricion_planta_concentrados: {
      id: 'nutricion_planta_concentrados',
      name: 'Dr. Andrés (Nutrición SID & Planta)',
      role: 'Ingeniero Nutricionista Formulador · Proteína Ideal SID, PDI & Granulometría',
      voice: 'ash',
      gender: 'M',
      speed: 1.11,
      instructions:
        'Hablas con voz masculina técnica y precisa de ingeniero nutricionista formulador de alimentos balanceados. Evalúas proteína ideal (Lisina SID), energía metabolizable AMEn, durabilidad de pellet PDI, porcentaje de finos, granulometría de maíz, enzimas fitasa, balance electrolítico DEB y control de micotoxinas. Toda cifra monetaria está en pesos colombianos.'
    }
  });

  function resolveExpertVoiceProfile(especialista) {
    const key = String(especialista || '').toLowerCase().trim();
    if (key === 'zootecnia_innovacion_phd') {
      return EXPERT_VOICE_PROFILES.zootecnia_avicola;
    }
    if (key === 'gerencia' || key === 'vision' || key === 'visión') {
      return EXPERT_VOICE_PROFILES.gerencia_excelencia_operacional;
    }
    if (key === 'sanidad_ica') {
      return EXPERT_VOICE_PROFILES.sanidad_bioseguridad_ica;
    }
    if (key === 'nutricion') {
      return EXPERT_VOICE_PROFILES.nutricion_planta_concentrados;
    }
    return EXPERT_VOICE_PROFILES[key] || EXPERT_VOICE_PROFILES.bsc_kaplan_norton;
  }

  function resolveRealtimeNoiseConfig(noiseProfile = 'galpon_estricto') {
    const normalized = String(noiseProfile || '').toLowerCase().includes('oficina')
      ? 'oficina'
      : 'galpon_estricto';
    if (normalized === 'oficina') {
      return {
        noiseProfile: 'oficina',
        noiseReduction: { type: 'far_field' },
        turnDetection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true
        }
      };
    }
    return {
      noiseProfile: 'galpon_estricto',
      noiseReduction: { type: 'near_field' },
      turnDetection: {
        type: 'semantic_vad',
        eagerness: 'low',
        create_response: true,
        interrupt_response: true
      }
    };
  }

  return {
    OPENAI_FRONTIER_CATALOG,
    AGENT_TRIAD_PROFILES,
    EXPERT_VOICE_PROFILES,
    resolveExpertVoiceProfile,
    resolveRealtimeNoiseConfig,
    resolveRealtimeSessionConfig,
    pickBestAvailableModel
  };
});
