'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('./state-store');

const SPEED_LEVELS = Object.freeze({
  SPEED_1_OPERATIONAL: 'SPEED_1_OPERATIONAL',
  SPEED_2_TACTICAL: 'SPEED_2_TACTICAL',
  SPEED_3_STRUCTURAL_RFC: 'SPEED_3_STRUCTURAL_RFC'
});

const OPERATIONAL_KEYWORDS = [
  'mortalidad', 'murieron', 'bajas', 'descarte', 'bulto', 'bultos', 'alimento servido',
  'pesaje', 'pesamos', 'temperatura', 'agua', 'factura', 'compre', 'compramos',
  'bitacora', 'bitácora', 'sacrificamos', 'liquidacion', 'liquidación'
];

const TACTICAL_KEYWORDS = [
  'simula', 'simular', 'what-if', 'what if', 'si subo', 'si bajo', 'precio canal',
  'precio vivo', 'pollito', 'arriendo', '45 dias', '45 días', '42 dias', '42 días',
  'area galpon', 'área galpón', 'alimento propio', 'escenario'
];

const STRUCTURAL_KEYWORDS = [
  'agrega', 'agregar', 'nueva columna', 'nueva hoja', 'nueva formula', 'nueva fórmula',
  'cambia la formula', 'cambia la fórmula', 'mejora la app', 'crea un modulo',
  'crea un módulo', 'nuevo reporte', 'integrar', 'conectar api', 'codigo', 'código',
  'frontend', 'backend', 'dashboard', 'grafica', 'gráfica', 'boton', 'botón',
  'alerta automatica', 'alerta automática', 'regla contable', 'impuesto', 'ica',
  'crear rfc', 'rfc', 'mejora estructural', 'antigravity'
];

/**
 * Clasifica una solicitud o intención conversacional dentro del modelo híbrido
 * de 3 Velocidades (Operación -> Táctica -> Evolución Estructural Antigravity).
 */
function classifyAndRouteAction(input = {}) {
  const explicitEventType = input.eventType || input.type || '';
  const text = String(input.text || input.descripcion || input.titulo || '').toLowerCase();

  if (['DAILY_LOG', 'SAMPLE_WEIGHING', 'FEED_PURCHASE', 'HARVEST_LIQUIDATION'].includes(explicitEventType)) {
    return {
      speed: SPEED_LEVELS.SPEED_1_OPERATIONAL,
      requiresHumanRfcApproval: false,
      autoApply: true,
      targetModule: 'state-store',
      reason: `Evento operativo de campo (${explicitEventType}); actualización inmediata en el Gemelo Digital.`
    };
  }

  if (explicitEventType === 'PARAM_UPDATE' || input.isWhatIfParameter) {
    return {
      speed: SPEED_LEVELS.SPEED_2_TACTICAL,
      requiresHumanRfcApproval: false,
      autoApply: !input.dryRun,
      targetModule: 'causal-twin-engine',
      reason: 'Ajuste paramétrico táctico dentro de variables existentes del modelo.'
    };
  }

  if (explicitEventType === 'STRUCTURAL_RFC' || input.forceStructural) {
    return {
      speed: SPEED_LEVELS.SPEED_3_STRUCTURAL_RFC,
      requiresHumanRfcApproval: true,
      autoApply: false,
      targetModule: 'antigravity-bridge',
      reason: 'Cambio estructural en código, fórmulas o arquitectura; requiere tarjeta RFC aprobada.'
    };
  }

  const hasStructural = STRUCTURAL_KEYWORDS.some((kw) => text.includes(kw));
  if (hasStructural) {
    return {
      speed: SPEED_LEVELS.SPEED_3_STRUCTURAL_RFC,
      requiresHumanRfcApproval: true,
      autoApply: false,
      targetModule: 'antigravity-bridge',
      reason: 'Detectada solicitud de evolución de código, fórmulas o interfaz -> Ruta Velocidad 3 (RFC Antigravity).'
    };
  }

  const hasTactical = TACTICAL_KEYWORDS.some((kw) => text.includes(kw));
  if (hasTactical) {
    return {
      speed: SPEED_LEVELS.SPEED_2_TACTICAL,
      requiresHumanRfcApproval: false,
      autoApply: false,
      targetModule: 'causal-twin-engine',
      reason: 'Detectada simulación o ajuste táctico de parámetros.'
    };
  }

  if (OPERATIONAL_KEYWORDS.some((kw) => text.includes(kw))) {
    return {
      speed: SPEED_LEVELS.SPEED_1_OPERATIONAL,
      requiresHumanRfcApproval: false,
      autoApply: true,
      targetModule: 'state-store',
      reason: 'Detectado registro operativo diario en granja.'
    };
  }

  return {
    speed: SPEED_LEVELS.SPEED_2_TACTICAL,
    requiresHumanRfcApproval: false,
    autoApply: false,
    targetModule: 'causal-twin-engine',
    reason: 'Consulta o ajuste general enrutado al motor analítico.'
  };
}

/**
 * Puente CI/CD Agéntico hacia Antigravity: gestiona propuestas RFC firmadas,
 * bandeja de ejecución ANTIGRAVITY_INBOX.md y sincronización con Supabase.
 */
class AntigravityBridge {
  constructor(options = {}) {
    loadEnvFiles();
    this.seedBridgeDir = path.resolve(__dirname, '../antigravity_bridge');
    this.bridgeDir = options.bridgeDir ||
      process.env.BRIDGE_DIR ||
      (process.env.DATA_DIR ? path.join(path.resolve(process.env.DATA_DIR), 'antigravity_bridge') : this.seedBridgeDir);
    this.rfcsDir = path.join(this.bridgeDir, 'rfcs');
    this.inboxPath = path.join(this.bridgeDir, 'ANTIGRAVITY_INBOX.md');
    this.supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    this.supabaseKey = options.supabaseKey ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      '';
  }

  init() {
    fs.mkdirSync(this.rfcsDir, { recursive: true });
    // Si usamos un volumen persistente nuevo (ej. /data/antigravity_bridge), siembra RFCs iniciales del repo si esta vacio.
    if (path.resolve(this.bridgeDir) !== path.resolve(this.seedBridgeDir)) {
      const seedRfcsDir = path.join(this.seedBridgeDir, 'rfcs');
      const existing = fs.readdirSync(this.rfcsDir).filter((f) => f.endsWith('.json'));
      if (!existing.length && fs.existsSync(seedRfcsDir)) {
        for (const f of fs.readdirSync(seedRfcsDir)) {
          const src = path.join(seedRfcsDir, f);
          const dst = path.join(this.rfcsDir, f);
          if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
            fs.copyFileSync(src, dst);
          }
        }
      }
    }
    this.#rebuildInboxMarkdown();
    return {
      bridgeDir: this.bridgeDir,
      rfcsDir: this.rfcsDir,
      inboxPath: this.inboxPath,
      rfcsCount: this.listRfcs().length
    };
  }

  #nextRfcCode() {
    fs.mkdirSync(this.rfcsDir, { recursive: true });
    const files = fs.readdirSync(this.rfcsDir).filter((f) => /^RFC-\d{4}\.json$/.test(f));
    let maxNum = 0;
    for (const f of files) {
      const n = Number(f.slice(4, 8));
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
    return `RFC-${String(maxNum + 1).padStart(4, '0')}`;
  }

  #rfcJsonPath(rfcCode) {
    return path.join(this.rfcsDir, `${rfcCode}.json`);
  }

  #rfcMdPath(rfcCode) {
    return path.join(this.rfcsDir, `${rfcCode}.md`);
  }

  #renderRfcMarkdown(rfc) {
    const filesList = (rfc.archivosAfectados || []).length
      ? rfc.archivosAfectados.map((f) => `- \`${f}\``).join('\n')
      : '- Por definir durante ejecución en Antigravity';

    return [
      `# ${rfc.rfcCode} · ${rfc.titulo}`,
      '',
      `- **Estado:** \`${rfc.estado}\``,
      `- **Categoría:** \`${rfc.categoria}\``,
      `- **Canal de Origen:** \`${rfc.sourceChannel}\``,
      `- **Rol Proponente:** \`${rfc.proposedByRole}\``,
      `- **Modelo Redactor:** \`${rfc.draftedByModel}\``,
      `- **Creado:** ${rfc.createdAt}`,
      rfc.approvedAt ? `- **Aprobado por:** ${rfc.approvedBy} (${rfc.approvedAt})` : `- **Aprobado por:** Pendiente`,
      rfc.executedAt ? `- **Ejecutado:** ${rfc.executedAt} (${rfc.executionNotes || 'Completado'})` : '',
      '',
      '## Descripción del Cambio Solicitado',
      rfc.descripcion,
      '',
      '## Impacto Esperado (Financiero / Técnico / UX)',
      rfc.impactoEstimado || 'Optimización directa del Gemelo Digital AV-1 / AV-2.',
      '',
      '## Archivos y Capas Impactadas',
      filesList,
      '',
      '## Especificación Técnica Estructurada',
      '```json',
      JSON.stringify(rfc.propuestaJson, null, 2),
      '```',
      '',
      '## Prompt Listo para Ejecutar en Antigravity',
      '> ' + rfc.antigravityPrompt.replace(/\n/g, '\n> '),
      ''
    ].filter((line) => line !== '').join('\n');
  }

  #rebuildInboxMarkdown() {
    const all = this.listRfcs();
    const pending = all.filter((r) => r.estado === 'pendiente_aprobacion');
    const approved = all.filter((r) => r.estado === 'aprobado');
    const executed = all.filter((r) => r.estado === 'ejecutado');

    const lines = [
      '# Bandeja de Evolución Autoevolutiva — Antigravity Bridge (`AV-1` & `AV-2`)',
      '',
      `> Actualizado: \`${new Date().toISOString()}\` | Aprobados listos para ejecutar: **${approved.length}** | Pendientes de aprobación: **${pending.length}** | Ejecutados: **${executed.length}**`,
      '',
      '## 1. RFCs Aprobados Listos para Ejecutar en Antigravity',
      ''
    ];

    if (approved.length === 0) {
      lines.push('_No hay RFCs aprobados en cola en este momento._', '');
    } else {
      for (const r of approved) {
        lines.push(
          `### [${r.rfcCode}](rfcs/${r.rfcCode}.md) — ${r.titulo}`,
          `- **Aprobado por:** ${r.approvedBy} vía \`${r.approvedChannel || r.sourceChannel}\` el \`${r.approvedAt}\``,
          `- **Categoría:** \`${r.categoria}\``,
          `- **Orden para Antigravity:** ${r.descripcion}`,
          ''
        );
      }
    }

    lines.push('## 2. Propuestas Pendientes de Aprobación Humana (App / Telegram)', '');
    if (pending.length === 0) {
      lines.push('_Sin propuestas pendientes._', '');
    } else {
      for (const r of pending) {
        lines.push(`- **${r.rfcCode}**: ${r.titulo} *(origen: \`${r.sourceChannel}\`, creado: \`${r.createdAt}\`)*`);
      }
      lines.push('');
    }

    lines.push('## 3. Historial Ejecutado', '');
    if (executed.length === 0) {
      lines.push('_Aún no se han ejecutado RFCs._', '');
    } else {
      for (const r of executed.slice(0, 15)) {
        lines.push(`- ✅ **${r.rfcCode}**: ${r.titulo} *(${r.executedAt})*`);
      }
      lines.push('');
    }

    fs.writeFileSync(this.inboxPath, lines.join('\n'), 'utf8');
  }

  async #syncRfcToSupabase(rfc) {
    if (!this.supabaseUrl || !this.supabaseKey) return { synced: false };
    try {
      const res = await fetch(`${this.supabaseUrl}/rest/v1/antigravity_rfcs?on_conflict=rfc_code`, {
        method: 'POST',
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify({
          rfc_code: rfc.rfcCode,
          titulo: rfc.titulo,
          descripcion: rfc.descripcion,
          categoria: rfc.categoria,
          source_channel: rfc.sourceChannel,
          propuesta_json: rfc.propuestaJson,
          estado: rfc.estado,
          approved_by: rfc.approvedBy || null,
          approved_at: rfc.approvedAt || null,
          executed_at: rfc.executedAt || null
        })
      });
      return { synced: res.ok };
    } catch (err) {
      return { synced: false, error: err.message };
    }
  }

  async createRfcProposal(input = {}) {
    fs.mkdirSync(this.rfcsDir, { recursive: true });
    const rfcCode = this.#nextRfcCode();
    const titulo = String(input.titulo || 'Mejora estructural en Gemelo Digital Avícola').trim();
    const descripcion = String(input.descripcion || titulo).trim();
    const categoria = String(input.categoria || 'modelo_financiero');
    const sourceChannel = String(input.sourceChannel || 'web');
    const proposedByRole = String(input.proposedByRole || 'BE-1');
    const draftedByModel = String(input.draftedByModel || process.env.OPENAI_AGENT_MODEL || 'gpt-6.1-sol');
    const REAL_PROJECT_FILES = [
      'avicola_app/shared/causal-twin-engine.js',
      'avicola_app/server/index.js',
      'avicola_app/server/openai-gateway.js',
      'avicola_app/server/excel-transubstantiator.js',
      'avicola_app/server/antigravity-bridge.js',
      'avicola_app/server/state-store.js',
      'avicola_app/public/index.html',
      'avicola_app/public/app.js',
      'avicola_app/public/styles.css'
    ];
    const normalizeAffectedFiles = (rawList) => {
      const out = new Set();
      (Array.isArray(rawList) ? rawList : []).forEach((item) => {
        const s = String(item || '').trim().replace(/\\/g, '/');
        if (!s) return;
        const clean = s.startsWith('avicola_app/') ? s : null;
        if (clean && REAL_PROJECT_FILES.includes(clean)) {
          out.add(clean);
          return;
        }
        const low = s.toLowerCase();
        if (/\.(tsx|jsx|vue|svelte)$/.test(low) || /component|modal|button|page|view|frontend|ui|panel|styles|css/.test(low)) {
          out.add('avicola_app/public/index.html');
          out.add('avicola_app/public/app.js');
          out.add('avicola_app/public/styles.css');
        }
        if (/excel|xlsx|sheet|minuta|pdf|export/.test(low)) {
          out.add('avicola_app/server/excel-transubstantiator.js');
          out.add('avicola_app/server/index.js');
        }
        if (/voice|voz|tool|realtime|agent|gpt|openai/.test(low)) {
          out.add('avicola_app/server/openai-gateway.js');
        }
        if (/api|route|server|backend|endpoint/.test(low) || /\.(ts)$/.test(low)) {
          out.add('avicola_app/server/index.js');
        }
        if (/twin|engine|schema|state|store|model|cost|lote|venta|viaje/.test(low)) {
          out.add('avicola_app/shared/causal-twin-engine.js');
        }
        if (/rfc|bridge|antigravity/.test(low)) {
          out.add('avicola_app/server/antigravity-bridge.js');
        }
        if (clean) out.add(clean);
      });
      if (out.size === 0) {
        out.add('avicola_app/shared/causal-twin-engine.js');
        out.add('avicola_app/server/index.js');
        out.add('avicola_app/public/app.js');
      }
      return Array.from(out);
    };
    const archivosAfectados = normalizeAffectedFiles(input.archivosAfectados);

    const propuestaJson = input.propuestaJson || {
      objetivo: titulo,
      detalle: descripcion,
      criteriosAceptacion: input.criteriosAceptacion || [
        'Cero errores de fórmula en Excel COM (FormulaErrors = 0)',
        'Conciliación $0 entre causal-twin-engine.js y libros Excel AV-1 / AV-2'
      ],
      extra: input.payload || {}
    };

    const antigravityPrompt =
      `Ejecuta ${rfcCode} (${titulo}) en c:\\Dev\\Planta de Concentrados: ${descripcion}. ` +
      (archivosAfectados.length ? `Archivos objetivo: ${archivosAfectados.join(', ')}. ` : '') +
      'Verifica conciliación $0 en causal-twin-engine.js y FormulaErrors=0 en Excel si aplica.';

    const rfc = {
      rfcCode,
      titulo,
      descripcion,
      categoria,
      sourceChannel,
      proposedByRole,
      draftedByModel,
      impactoEstimado: input.impactoEstimado || 'Por evaluar',
      archivosAfectados,
      propuestaJson,
      antigravityPrompt,
      estado: 'pendiente_aprobacion',
      approvedBy: null,
      approvedChannel: null,
      approvedAt: null,
      executedAt: null,
      executionNotes: null,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(this.#rfcJsonPath(rfcCode), JSON.stringify(rfc, null, 2), 'utf8');
    fs.writeFileSync(this.#rfcMdPath(rfcCode), this.#renderRfcMarkdown(rfc), 'utf8');
    this.#rebuildInboxMarkdown();
    await this.#syncRfcToSupabase(rfc);
    return rfc;
  }

  getRfc(rfcCode) {
    const p = this.#rfcJsonPath(rfcCode);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  }

  listRfcs(estadoFilter = null) {
    if (!fs.existsSync(this.rfcsDir)) return [];
    const items = fs.readdirSync(this.rfcsDir)
      .filter((f) => /^RFC-\d{4}\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(path.join(this.rfcsDir, f), 'utf8')))
      .sort((a, b) => (a.rfcCode < b.rfcCode ? 1 : -1));
    return estadoFilter ? items.filter((r) => r.estado === estadoFilter) : items;
  }

  async approveRfc(rfcCode, meta = {}) {
    const rfc = this.getRfc(rfcCode);
    if (!rfc) throw new Error(`No existe el RFC ${rfcCode}`);
    rfc.estado = 'aprobado';
    rfc.approvedBy = String(meta.approvedBy || 'Mauricio Bonilla');
    rfc.approvedChannel = String(meta.channel || 'telegram');
    rfc.approvedAt = new Date().toISOString();

    fs.writeFileSync(this.#rfcJsonPath(rfcCode), JSON.stringify(rfc, null, 2), 'utf8');
    fs.writeFileSync(this.#rfcMdPath(rfcCode), this.#renderRfcMarkdown(rfc), 'utf8');
    this.#rebuildInboxMarkdown();
    await this.#syncRfcToSupabase(rfc);
    return rfc;
  }

  async markRfcExecuted(rfcCode, meta = {}) {
    const rfc = this.getRfc(rfcCode);
    if (!rfc) throw new Error(`No existe el RFC ${rfcCode}`);
    rfc.estado = 'ejecutado';
    rfc.executedAt = new Date().toISOString();
    rfc.executionNotes = String(meta.notes || 'Aplicado y verificado desde Antigravity');

    fs.writeFileSync(this.#rfcJsonPath(rfcCode), JSON.stringify(rfc, null, 2), 'utf8');
    fs.writeFileSync(this.#rfcMdPath(rfcCode), this.#renderRfcMarkdown(rfc), 'utf8');
    this.#rebuildInboxMarkdown();
    await this.#syncRfcToSupabase(rfc);
    return rfc;
  }

  async rejectRfc(rfcCode, meta = {}) {
    const rfc = this.getRfc(rfcCode);
    if (!rfc) throw new Error(`No existe el RFC ${rfcCode}`);
    rfc.estado = 'rechazado';
    rfc.rejectedBy = String(meta.rejectedBy || 'Mauricio Bonilla');
    rfc.rejectionReason = String(meta.reason || 'Descartado por usuario');
    rfc.rejectedAt = new Date().toISOString();

    fs.writeFileSync(this.#rfcJsonPath(rfcCode), JSON.stringify(rfc, null, 2), 'utf8');
    fs.writeFileSync(this.#rfcMdPath(rfcCode), this.#renderRfcMarkdown(rfc), 'utf8');
    this.#rebuildInboxMarkdown();
    await this.#syncRfcToSupabase(rfc);
    return rfc;
  }
}

module.exports = {
  SPEED_LEVELS,
  classifyAndRouteAction,
  AntigravityBridge
};
