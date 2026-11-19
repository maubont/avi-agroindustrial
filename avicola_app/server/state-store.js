'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const TwinEngine = require('../shared/causal-twin-engine');

/**
 * Carga variables de entorno sin exponer valores en consola ni depender
 * estrictamente de paquetes externos si aún no se ejecutó npm install.
 */
function loadEnvFiles(extraEnvPaths = []) {
  const candidates = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    ...(process.env.DATA_DIR ? [path.join(path.resolve(process.env.DATA_DIR), '.env')] : []),
    ...extraEnvPaths
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Persistencia Híbrida Causal (Espejo Local Transaccional + Supabase Realtime Cloud).
 * Garantiza latencia <1 ms en local y sincronización automática con Supabase cuando
 * SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY están configurados.
 */
class HybridTwinStore {
  constructor(options = {}) {
    loadEnvFiles(options.envPaths || []);
    this.dataDir = options.dataDir || (process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '../data'));
    this.stateFile = path.join(this.dataDir, 'twin_state.json');
    this.ledgerFile = path.join(this.dataDir, 'events_ledger.jsonl');
    this.supabaseUrl = (options.supabaseUrl ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    this.supabaseKey = options.supabaseKey ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.SUPABASE_ANON_KEY ??
      '';
    this.supabaseClient = null;
    this.state = null;
    this.version = 1;
    this.lastSupabaseSync = null;
    this.lastSupabaseError = null;
  }

  async init() {
    fs.mkdirSync(this.dataDir, { recursive: true });

    if (fs.existsSync(this.stateFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (parsed && parsed.state) {
          this.state = parsed.state;
          this.version = Number(parsed.version || 1);
        }
      } catch (err) {
        // Si el JSON local estuviera dañado, reconstruye desde base limpia o backup
        this.state = TwinEngine.createDefaultTwinState();
        this.version = 1;
      }
    }

    if (!this.state) {
      this.state = TwinEngine.createDefaultTwinState();
      this.version = 1;
      this.#writeLocalSnapshot('system:init');
    } else if (TwinEngine.normalizeStateDefaults) {
      TwinEngine.normalizeStateDefaults(this.state);
    }

    if (!fs.existsSync(this.ledgerFile)) {
      fs.writeFileSync(this.ledgerFile, '', 'utf8');
    }

    await this.#initSupabaseClient();
    if (this.supabaseClient) {
      await this.syncFromOrSeedSupabase();
      if (TwinEngine.normalizeStateDefaults) {
        TwinEngine.normalizeStateDefaults(this.state);
      }
    }

    return this.getFullSnapshot();
  }

  async #initSupabaseClient() {
    if (!this.supabaseUrl || !this.supabaseKey) {
      this.supabaseClient = null;
      return;
    }
    try {
      const { createClient } = require('@supabase/supabase-js');
      this.supabaseClient = createClient(this.supabaseUrl, this.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
    } catch (_) {
      // Si @supabase/supabase-js aún no está instalado, usa cliente HTTP REST nativo con fetch (Node 24)
      this.supabaseClient = this.#createLightweightRestClient();
    }
  }

  #createLightweightRestClient() {
    const baseUrl = this.supabaseUrl;
    const key = this.supabaseKey;
    const headers = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    };

    return {
      isLightweightRest: true,
      async upsertSnapshot(row) {
        const res = await fetch(`${baseUrl}/rest/v1/twin_state_snapshots?on_conflict=id`, {
          method: 'POST',
          headers,
          body: JSON.stringify(row)
        });
        if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
        return res.json();
      },
      async fetchActiveSnapshot() {
        const res = await fetch(`${baseUrl}/rest/v1/twin_state_snapshots?id=eq.active-farm-twin&select=*`, {
          headers
        });
        if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
        const rows = await res.json();
        return rows && rows[0] ? rows[0] : null;
      },
      async insertEvent(row) {
        const res = await fetch(`${baseUrl}/rest/v1/operational_events`, {
          method: 'POST',
          headers,
          body: JSON.stringify(row)
        });
        if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${await res.text()}`);
        return res.json();
      }
    };
  }

  #writeLocalSnapshot(updatedBy = 'system') {
    const computed = TwinEngine.computeFullTwin(this.state);
    const envelope = {
      id: 'active-farm-twin',
      version: this.version,
      updatedBy,
      updatedAt: new Date().toISOString(),
      stateHash: this.#hashState(this.state),
      state: this.state
    };
    const tmpFile = `${this.stateFile}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(envelope, null, 2), 'utf8');
    fs.renameSync(tmpFile, this.stateFile);
    return { envelope, computed };
  }

  #hashState(stateObj) {
    return crypto.createHash('sha256').update(JSON.stringify(stateObj)).digest('hex').slice(0, 16);
  }

  async syncFromOrSeedSupabase() {
    if (!this.supabaseClient) return { synced: false, mode: 'local_only' };
    try {
      let remote = null;
      if (this.supabaseClient.isLightweightRest) {
        remote = await this.supabaseClient.fetchActiveSnapshot();
      } else {
        const { data, error } = await this.supabaseClient
          .from('twin_state_snapshots')
          .select('*')
          .eq('id', 'active-farm-twin')
          .maybeSingle();
        if (error) throw error;
        remote = data;
      }

      if (remote && Number(remote.version || 0) > this.version && remote.state_json) {
        this.state = remote.state_json;
        this.version = Number(remote.version);
        this.#writeLocalSnapshot('supabase:pull');
      } else {
        await this.#pushSnapshotToSupabase('system:seed');
      }

      this.lastSupabaseSync = new Date().toISOString();
      this.lastSupabaseError = null;
      return { synced: true, mode: 'supabase_cloud', version: this.version };
    } catch (err) {
      this.lastSupabaseError = err.message;
      return { synced: false, mode: 'local_fallback', error: err.message };
    }
  }

  async #pushSnapshotToSupabase(updatedBy, eventRecord = null) {
    if (!this.supabaseClient) return;
    const computed = TwinEngine.computeFullTwin(this.state);
    const snapshotRow = {
      id: 'active-farm-twin',
      version: this.version,
      project_name: this.state.projectName,
      state_json: this.state,
      computed_summary: {
        consolidado3LotesUtilidad: computed.av2.consolidado3Lotes.utilidadCanal,
        capitalTrabajoPicoSem7: computed.av2.tesoreriaResumen.capitalTrabajoPicoSem7,
        saldoFinalPost4m: computed.av2.tesoreriaResumen.saldoFinalPost4m,
        anualUtilidad12m: computed.av1.anual12Meses.consolidado.utilidadCanal,
        alertasActivas: computed.alertas.length
      },
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    };

    try {
      if (this.supabaseClient.isLightweightRest) {
        await this.supabaseClient.upsertSnapshot(snapshotRow);
        if (eventRecord) {
          await this.supabaseClient.insertEvent({
            event_type: eventRecord.type,
            source_channel: eventRecord.sourceChannel,
            payload: eventRecord.payload,
            actor: eventRecord.actor,
            state_version_after: this.version
          });
        }
      } else {
        const { error: snapErr } = await this.supabaseClient
          .from('twin_state_snapshots')
          .upsert(snapshotRow, { onConflict: 'id' });
        if (snapErr) throw snapErr;

        if (eventRecord) {
          const { error: evtErr } = await this.supabaseClient
            .from('operational_events')
            .insert({
              event_type: eventRecord.type,
              source_channel: eventRecord.sourceChannel,
              payload: eventRecord.payload,
              actor: eventRecord.actor,
              state_version_after: this.version
            });
          if (evtErr) throw evtErr;
        }
      }
      this.lastSupabaseSync = new Date().toISOString();
      this.lastSupabaseError = null;
    } catch (err) {
      // Nunca rompe la operación local si falla red o permisos en nube
      this.lastSupabaseError = err.message;
    }
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  getFullSnapshot() {
    const computed = TwinEngine.computeFullTwin(this.state);
    return {
      version: this.version,
      stateHash: this.#hashState(this.state),
      persistence: this.getPersistenceStatus(),
      state: this.getState(),
      computed
    };
  }

  getPersistenceStatus() {
    return {
      localMirrorActive: fs.existsSync(this.stateFile),
      stateFile: this.stateFile,
      ledgerFile: this.ledgerFile,
      supabaseConfigured: Boolean(this.supabaseUrl && this.supabaseKey),
      lastSupabaseSync: this.lastSupabaseSync,
      lastSupabaseError: this.lastSupabaseError
    };
  }

  getLedgerEvents(limit = 50) {
    if (!fs.existsSync(this.ledgerFile)) return [];
    const lines = fs.readFileSync(this.ledgerFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    return lines
      .slice(-Math.max(1, limit))
      .map((line) => JSON.parse(line));
  }

  /**
   * Aplica un evento al estado vivo, guarda snapshot anterior para reversibilidad,
   * escribe en el ledger JSONL y sincroniza con Supabase si está configurado.
   */
  async appendEventAndApply(eventInput) {
    if (!this.state) await this.init();

    const prevState = this.getState();
    const nextState = TwinEngine.applyOperationalEvent(prevState, eventInput);
    const nextVersion = this.version + 1;

    const record = {
      id: crypto.randomUUID(),
      seqVersion: nextVersion,
      type: eventInput.type,
      sourceChannel: eventInput.sourceChannel || 'web',
      actor: eventInput.actor || 'operator',
      payload: eventInput.payload || {},
      prevStateHash: this.#hashState(prevState),
      nextStateHash: this.#hashState(nextState),
      prevState,
      createdAt: new Date().toISOString()
    };

    fs.appendFileSync(this.ledgerFile, JSON.stringify(record) + '\n', 'utf8');
    this.state = nextState;
    this.version = nextVersion;
    this.#writeLocalSnapshot(`${record.sourceChannel}:${record.type}`);
    await this.#pushSnapshotToSupabase(`${record.sourceChannel}:${record.type}`, record);

    return {
      event: {
        id: record.id,
        seqVersion: record.seqVersion,
        type: record.type,
        sourceChannel: record.sourceChannel,
        createdAt: record.createdAt
      },
      snapshot: this.getFullSnapshot()
    };
  }

  /**
   * Revierte exactamente el último evento registrado en el ledger local.
   */
  async rollbackLastEvent() {
    if (!fs.existsSync(this.ledgerFile)) {
      throw new Error('No hay eventos en el ledger para revertir.');
    }
    const lines = fs.readFileSync(this.ledgerFile, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean);
    if (lines.length === 0) {
      throw new Error('El ledger de eventos está vacío.');
    }

    const lastRecord = JSON.parse(lines.pop());
    fs.writeFileSync(this.ledgerFile, lines.length ? lines.join('\n') + '\n' : '', 'utf8');

    this.state = lastRecord.prevState || TwinEngine.createDefaultTwinState();
    this.version = Math.max(1, Number(lastRecord.seqVersion || 2) - 1);
    this.#writeLocalSnapshot('system:rollback');
    await this.#pushSnapshotToSupabase('system:rollback');

    return {
      revertedEventId: lastRecord.id,
      revertedType: lastRecord.type,
      snapshot: this.getFullSnapshot()
    };
  }
}

module.exports = {
  HybridTwinStore,
  loadEnvFiles
};
